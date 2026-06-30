"""
ml/train_v2.py - Faz 1b improvements over train.py (baseline left untouched).

What changed vs train.py:
  * Loss: weighted-CE + multiclass soft-Dice (LOSS env: ce_dice | focal_dice | ce).
    Dice scores each class by region overlap and is averaged over classes, so a
    1-2 cell room (wc/teknik) counts as much as the salon -> directly targets the
    small/rare-class IoU that the baseline was weakest on.
  * Early stopping on val mIoU (PATIENCE env, default 18) so we don't burn CPU
    after the curve flattens; baseline had no plateau at ep 60.
  * Longer ceiling (EPOCHS env, default 150) since the baseline was still rising.
  * Per-epoch val eval + a train log written next to the metrics.
  * Env-driven paths (DATA_DIR / OUT_DIR / MODEL_OUT) so v2 writes to data_5k /
    out_v2 / model_v2.pt and the baseline artifacts are preserved.

The proxy validity check is kept BYTE-IDENTICAL to train.py so predPassRate is
directly comparable across baseline and v2. (A "true" eval would re-map the
predicted grid back into the engine's region/unit structure and call the real
runChecks(); that is impractical here because runChecks reads global engine state
built by generate() and there is no inverse from a class grid -> regions/units.
We document this limitation rather than fake it.)

Usage:
  DATA_DIR=data_5k OUT_DIR=out_v2 MODEL_OUT=model_v2.pt python3 ml/train_v2.py
  optional env: EPOCHS=150 PATIENCE=18 LOSS=ce_dice DICE_W=1.0 BS=16
"""
import json
import os
import sys
import time
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image, ImageDraw

torch.manual_seed(0)
np.random.seed(0)

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, os.environ.get("DATA_DIR", "data_5k"))
OUT = os.path.join(HERE, os.environ.get("OUT_DIR", "out_v2"))
MODEL_OUT = os.path.join(HERE, os.environ.get("MODEL_OUT", "model_v2.pt"))
os.makedirs(OUT, exist_ok=True)

EPOCHS = int(os.environ.get("EPOCHS", "150"))
PATIENCE = int(os.environ.get("PATIENCE", "18"))
LOSS = os.environ.get("LOSS", "ce_dice")      # ce_dice | focal_dice | ce
DICE_W = float(os.environ.get("DICE_W", "1.0"))
BS = int(os.environ.get("BS", "16"))
EVAL_EVERY = int(os.environ.get("EVAL_EVERY", "2"))

# engine regulatory thresholds (src/constants.js REG), area m^2 / min side m
REG = {
    "salon": (12.0, 3.0), "yatak": (9.0, 2.5), "mutfak": (3.3, 1.5),
    "banyo": (3.0, 1.5), "wc": (1.2, 1.0),
}
CELL_M = 0.5
CELL_A = CELL_M * CELL_M  # 0.25 m^2 per cell

PALETTE = [
    (245, 245, 245), (255, 179, 71), (114, 159, 207), (152, 216, 170),
    (173, 127, 168), (233, 185, 110), (255, 233, 120), (200, 200, 200),
    (120, 120, 120), (90, 90, 90), (239, 41, 41), (60, 60, 60),
]
IGNORE = 255

# ----------------------------------------------------------------------------
# data
# ----------------------------------------------------------------------------
meta = json.load(open(os.path.join(DATA, "meta.json")))
split = json.load(open(os.path.join(DATA, "split.json")))
norm = json.load(open(os.path.join(DATA, "norm.json")))
index = json.load(open(os.path.join(DATA, "index.json")))
CLASSES = meta["classes"]
NC = len(CLASSES)
G = meta["grid"]
n = meta["nKept"]
P = len(meta["progFeatures"])
CIDX = {c: i for i, c in enumerate(CLASSES)}

masks = np.fromfile(os.path.join(DATA, "inputs_mask.bin"), dtype=np.uint8).reshape(n, G, G)
labels = np.fromfile(os.path.join(DATA, "labels.bin"), dtype=np.uint8).reshape(n, G, G)
prog = np.fromfile(os.path.join(DATA, "program.bin"), dtype=np.float32).reshape(n, P)
pmean = np.array(norm["mean"], np.float32)
pstd = np.array(norm["std"], np.float32)

train_idx = split["train"]
val_idx = split["val"]
LOG = open(os.path.join(OUT, "train_log_v2.txt"), "w")


def logln(*a):
    s = " ".join(str(x) for x in a)
    print(s)
    LOG.write(s + "\n")
    LOG.flush()


def make_xy(idxs):
    """X: (B, 1+P, G, G) mask + broadcast program; Y: (B,G,G) target w/ IGNORE outside."""
    B = len(idxs)
    X = np.zeros((B, 1 + P, G, G), np.float32)
    Y = np.full((B, G, G), IGNORE, np.uint8)
    M = np.zeros((B, G, G), np.uint8)
    for k, i in enumerate(idxs):
        m = masks[i]
        X[k, 0] = m
        pv = (prog[i] - pmean) / pstd
        for p in range(P):
            X[k, 1 + p] = pv[p]
        inside = m > 0
        Y[k][inside] = labels[i][inside]  # outside stays IGNORE
        M[k] = m
    return torch.from_numpy(X), torch.from_numpy(Y.astype(np.int64)), torch.from_numpy(M)


Xtr, Ytr, Mtr = make_xy(train_idx)
Xva, Yva, Mva = make_xy(val_idx)
logln(f"v2 train {len(train_idx)}  val {len(val_idx)}  in-ch {1+P}  classes {NC}  loss={LOSS}")

# class weights: inverse sqrt frequency over train inside cells, mean-normalized
cnt = np.zeros(NC, np.float64)
for i in train_idx:
    lab = labels[i][masks[i] > 0]
    cnt += np.bincount(lab, minlength=NC)
freq = cnt / cnt.sum()
w = 1.0 / np.sqrt(freq + 1e-6)
w[cnt == 0] = 0.0           # class absent in train -> no weight
w = w / w[w > 0].mean()
class_w = torch.tensor(w, dtype=torch.float32)
present = torch.tensor((cnt > 0).astype(np.float32))  # classes that exist in train
logln("class counts:", cnt.astype(int).tolist())
logln("class weights:", [round(float(x), 2) for x in w])


# ----------------------------------------------------------------------------
# small U-Net (3 levels, 32/64/128) -- identical arch to baseline for fair compare
# ----------------------------------------------------------------------------
def block(ci, co):
    return nn.Sequential(
        nn.Conv2d(ci, co, 3, padding=1), nn.BatchNorm2d(co), nn.ReLU(inplace=True),
        nn.Conv2d(co, co, 3, padding=1), nn.BatchNorm2d(co), nn.ReLU(inplace=True),
    )


class UNet(nn.Module):
    def __init__(self, cin, nc):
        super().__init__()
        self.e1 = block(cin, 32)
        self.e2 = block(32, 64)
        self.e3 = block(64, 128)
        self.pool = nn.MaxPool2d(2)
        self.bott = block(128, 128)
        self.u3 = nn.ConvTranspose2d(128, 128, 2, stride=2)
        self.d3 = block(128 + 128, 64)
        self.u2 = nn.ConvTranspose2d(64, 64, 2, stride=2)
        self.d2 = block(64 + 64, 32)
        self.u1 = nn.ConvTranspose2d(32, 32, 2, stride=2)
        self.d1 = block(32 + 32, 32)
        self.head = nn.Conv2d(32, nc, 1)

    def forward(self, x):
        e1 = self.e1(x)
        e2 = self.e2(self.pool(e1))
        e3 = self.e3(self.pool(e2))
        b = self.bott(self.pool(e3))
        d3 = self.d3(torch.cat([self.u3(b), e3], 1))
        d2 = self.d2(torch.cat([self.u2(d3), e2], 1))
        d1 = self.d1(torch.cat([self.u1(d2), e1], 1))
        return self.head(d1)


model = UNet(1 + P, NC)
nparams = sum(p.numel() for p in model.parameters())
logln(f"model params: {nparams/1e6:.2f}M")
opt = torch.optim.Adam(model.parameters(), lr=1e-3)
sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, EPOCHS)
ce = nn.CrossEntropyLoss(weight=class_w, ignore_index=IGNORE)


def focal_ce(logit, y, gamma=2.0):
    """Class-weighted focal loss over inside (non-IGNORE) cells."""
    valid = y != IGNORE
    if valid.sum() == 0:
        return logit.sum() * 0.0
    yv = y.clone()
    yv[~valid] = 0
    logp = F.log_softmax(logit, 1)
    logp_t = logp.gather(1, yv.unsqueeze(1)).squeeze(1)   # B,H,W
    p_t = logp_t.exp()
    wmap = class_w[yv]                                    # per-cell class weight
    loss = -wmap * (1 - p_t) ** gamma * logp_t
    return loss[valid].mean()


def dice_loss(logit, y):
    """Multiclass soft Dice over inside cells, averaged across classes present in
    the batch. Equal per-class weighting is what lifts tiny/rare rooms."""
    valid = (y != IGNORE)
    yv = y.clone()
    yv[~valid] = 0
    prob = F.softmax(logit, 1)                            # B,C,H,W
    onehot = F.one_hot(yv, NC).permute(0, 3, 1, 2).float()
    vf = valid.unsqueeze(1).float()
    prob = prob * vf
    onehot = onehot * vf
    dims = (0, 2, 3)
    inter = (prob * onehot).sum(dims)
    card = prob.sum(dims) + onehot.sum(dims)
    dice = (2 * inter + 1.0) / (card + 1.0)               # per-class soft dice
    # only average over classes that actually appear somewhere in train
    pmask = present
    return 1.0 - (dice * pmask).sum() / pmask.sum()


def criterion(logit, y):
    if LOSS == "ce":
        return ce(logit, y)
    if LOSS == "focal_dice":
        return focal_ce(logit, y) + DICE_W * dice_loss(logit, y)
    # default ce_dice
    return ce(logit, y) + DICE_W * dice_loss(logit, y)


def iterate(X, Y, shuffle):
    order = np.arange(len(X))
    if shuffle:
        np.random.shuffle(order)
    for s in range(0, len(X), BS):
        b = order[s:s + BS]
        yield X[b], Y[b]


def evaluate(X, Y, M):
    model.eval()
    inter = np.zeros(NC)
    union = np.zeros(NC)
    correct = 0
    total = 0
    with torch.no_grad():
        for s in range(0, len(X), BS):
            logit = model(X[s:s + BS])
            pred = logit.argmax(1).numpy()
            y = Y[s:s + BS].numpy()
            m = M[s:s + BS].numpy() > 0
            for c in range(NC):
                pc = (pred == c) & m
                yc = (y == c) & m
                inter[c] += (pc & yc).sum()
                union[c] += (pc | yc).sum()
            correct += ((pred == y) & m).sum()
            total += m.sum()
    iou = np.where(union > 0, inter / np.maximum(union, 1), np.nan)
    return iou, correct / max(1, total)


best = -1
best_ep = -1
since = 0
t0 = time.time()
for ep in range(EPOCHS):
    model.train()
    tot = 0.0
    nb = 0
    for xb, yb in iterate(Xtr, Ytr, True):
        opt.zero_grad()
        loss = criterion(model(xb), yb)
        loss.backward()
        opt.step()
        tot += loss.item()
        nb += 1
    sched.step()
    do_eval = (ep + 1) % EVAL_EVERY == 0 or ep == EPOCHS - 1
    if do_eval:
        iou, acc = evaluate(Xva, Yva, Mva)
        miou = np.nanmean(iou)
        dt = time.time() - t0
        logln(f"ep {ep+1:3d}  loss {tot/nb:.3f}  val mIoU {miou:.3f}  pixAcc {acc:.3f}  "
              f"({dt/(ep+1):.1f}s/ep)")
        if miou > best + 1e-4:
            best = miou
            best_ep = ep + 1
            since = 0
            torch.save(model.state_dict(), MODEL_OUT)
        else:
            since += EVAL_EVERY
            if since >= PATIENCE:
                logln(f"early stop: no val mIoU gain in {PATIENCE} epochs "
                      f"(best {best:.3f} @ ep {best_ep})")
                break

# load best
model.load_state_dict(torch.load(MODEL_OUT))
iou, acc = evaluate(Xva, Yva, Mva)
logln(f"best val mIoU {best:.3f} @ ep {best_ep}  (final reload mIoU {np.nanmean(iou):.3f})")


# ----------------------------------------------------------------------------
# proxy validity: subset of runChecks computed on a class grid (IDENTICAL to baseline)
# ----------------------------------------------------------------------------
def blobs(grid, mask, cls):
    H, W = grid.shape
    seen = np.zeros((H, W), bool)
    res = []
    for r in range(H):
        for c in range(W):
            if seen[r, c] or not mask[r, c] or grid[r, c] != cls:
                continue
            st = [(r, c)]
            seen[r, c] = True
            comp = []
            while st:
                y, x = st.pop()
                comp.append((y, x))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < H and 0 <= nx < W and not seen[ny, nx] and mask[ny, nx] and grid[ny, nx] == cls:
                        seen[ny, nx] = True
                        st.append((ny, nx))
            ys = [p[0] for p in comp]
            xs = [p[1] for p in comp]
            area = len(comp) * CELL_A
            minside = (min(max(ys) - min(ys) + 1, max(xs) - min(xs) + 1)) * CELL_M
            res.append((area, minside))
    return res


def proxy_valid(grid, mask, is_villa):
    def has(cls, area_req, side_req):
        return any(a >= area_req - 1e-6 and s >= side_req - 1e-6
                   for a, s in blobs(grid, mask, CIDX[cls]))
    ok = True
    ok &= has("salon", *REG["salon"])
    ok &= any(a >= REG["yatak"][0] - 1e-6 and s >= REG["yatak"][1] - 1e-6
              for a, s in blobs(grid, mask, CIDX["yatak"]))
    ok &= len(blobs(grid, mask, CIDX["banyo"])) > 0 and \
        any(a >= REG["banyo"][0] - 1e-6 for a, s in blobs(grid, mask, CIDX["banyo"]))
    if not is_villa:
        ok &= any(a >= 12.0 for a, s in blobs(grid, mask, CIDX["merdiven"]))
    return bool(ok)


model.eval()
gt_pass = 0
pred_pass = 0
preds = []
with torch.no_grad():
    pred_all = []
    for s in range(0, len(Xva), BS):
        pred_all.append(model(Xva[s:s + BS]).argmax(1).numpy())
    pred_all = np.concatenate(pred_all, 0)
for k, i in enumerate(val_idx):
    m = masks[i] > 0
    gt = labels[i].copy()
    gt[~m] = 0
    pr = pred_all[k].copy()
    pr[~m] = 0
    preds.append(pr)
    is_villa = index[i]["bina"] == "villa"
    gt_pass += proxy_valid(gt, m, is_villa)
    pred_pass += proxy_valid(pr, m, is_villa)
nval = len(val_idx)
logln(f"\nproxy validity (subset of runChecks):")
logln(f"  GT   val pass: {gt_pass}/{nval}  ({100*gt_pass/nval:.1f}%)")
logln(f"  PRED val pass: {pred_pass}/{nval}  ({100*pred_pass/nval:.1f}%)")


# ----------------------------------------------------------------------------
# render gt vs pred PNGs
# ----------------------------------------------------------------------------
def to_rgb(grid, scale=4):
    pal = np.array(PALETTE, np.uint8)
    return Image.fromarray(pal[grid]).resize((G * scale, G * scale), Image.NEAREST)


for k in range(min(8, nval)):
    i = val_idx[k]
    m = masks[i] > 0
    gt = labels[i].copy()
    gt[~m] = 0
    pr = preds[k]
    a, b = to_rgb(gt), to_rgb(pr)
    gap = 8
    canvas = Image.new("RGB", (a.width + gap + b.width, a.height + 22), (255, 255, 255))
    canvas.paste(a, (0, 22))
    canvas.paste(b, (a.width + gap, 22))
    d = ImageDraw.Draw(canvas)
    r = index[i]
    d.text((2, 4), f"#{i} {r['bina']} {r['kat']}k {r['shape']}   GT  |  PRED(v2)", fill=(0, 0, 0))
    canvas.save(os.path.join(OUT, f"pred_{i}.png"))

# ----------------------------------------------------------------------------
# metrics_v2.json
# ----------------------------------------------------------------------------
metrics = {
    "variant": "v2",
    "dataDir": os.path.basename(DATA),
    "loss": LOSS,
    "diceWeight": DICE_W,
    "epochsRun": best_ep,
    "epochsMax": EPOCHS,
    "patience": PATIENCE,
    "modelParams": int(nparams),
    "train": len(train_idx), "val": nval,
    "pixelAcc": float(acc),
    "mIoU": float(np.nanmean(iou)),
    "bestValmIoU": float(best),
    "perClassIoU": {CLASSES[c]: (None if np.isnan(iou[c]) else round(float(iou[c]), 4)) for c in range(NC)},
    "classWeights": {CLASSES[c]: round(float(w[c]), 3) for c in range(NC)},
    "proxyValidity": {
        "note": "subset of runChecks (presence + min area/side of salon/yatak/banyo + core); identical to baseline for comparability",
        "gtValPass": int(gt_pass), "predValPass": int(pred_pass), "valTotal": nval,
        "gtPassRate": round(gt_pass / nval, 3), "predPassRate": round(pred_pass / nval, 3),
    },
}
json.dump(metrics, open(os.path.join(OUT, "metrics_v2.json"), "w"), indent=2)
logln("\nper-class IoU (v2):")
for c in range(NC):
    v = "  n/a" if np.isnan(iou[c]) else f"{iou[c]:.3f}"
    logln(f"  {CLASSES[c]:9s} {v}")
logln("\nwrote metrics + predictions to", OUT)
LOG.close()
