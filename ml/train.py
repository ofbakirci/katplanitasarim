"""
ml/train.py - small U-Net baseline that learns the rule-based engine's room
segmentation from (building mask + program) -> per-cell class.

This is a FEASIBILITY baseline: it distills the deterministic engine, so its
ceiling is "imitate the engine", NOT "good architecture". Metrics measure
(a) imitation fidelity (IoU / pixel-acc vs engine output) and (b) regulatory
plausibility of the prediction via a PROXY subset of runChecks (presence + min
area/side of salon/yatak/banyo/core) computed directly on the predicted grid.

Usage: python3 ml/train.py [epochs]   (default 60, CPU-friendly)

Writes:
  ml/out/pred_*.png      gt vs prediction side by side (val samples)
  ml/out/metrics.json    per-class IoU, pixel acc, proxy validity rates
  ml/model.pt            trained weights
"""
import json
import os
import sys
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image, ImageDraw

torch.manual_seed(0)
np.random.seed(0)

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)
EPOCHS = int(sys.argv[1]) if len(sys.argv) > 1 else 60

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
print(f"train {len(train_idx)}  val {len(val_idx)}  in-ch {1+P}  classes {NC}")

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
print("class counts:", cnt.astype(int).tolist())
print("class weights:", [round(float(x), 2) for x in w])


# ----------------------------------------------------------------------------
# small U-Net (3 levels, 32/64/128)
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
        e1 = self.e1(x)              # 64
        e2 = self.e2(self.pool(e1))  # 32
        e3 = self.e3(self.pool(e2))  # 16
        b = self.bott(self.pool(e3)) # 8
        d3 = self.d3(torch.cat([self.u3(b), e3], 1))   # 16
        d2 = self.d2(torch.cat([self.u2(d3), e2], 1))  # 32
        d1 = self.d1(torch.cat([self.u1(d2), e1], 1))  # 64
        return self.head(d1)


model = UNet(1 + P, NC)
nparams = sum(p.numel() for p in model.parameters())
print(f"model params: {nparams/1e6:.2f}M")
opt = torch.optim.Adam(model.parameters(), lr=1e-3)
sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, EPOCHS)
crit = nn.CrossEntropyLoss(weight=class_w, ignore_index=IGNORE)

BS = 16


def iterate(X, Y, shuffle):
    order = np.arange(len(X))
    if shuffle:
        np.random.shuffle(order)
    for s in range(0, len(X), BS):
        b = order[s:s + BS]
        yield X[b], Y[b]


def evaluate(X, Y, M):
    model.eval()
    inter = np.zeros(NC); union = np.zeros(NC)
    correct = 0; total = 0
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
for ep in range(EPOCHS):
    model.train()
    tot = 0.0; nb = 0
    for xb, yb in iterate(Xtr, Ytr, True):
        opt.zero_grad()
        loss = crit(model(xb), yb)
        loss.backward(); opt.step()
        tot += loss.item(); nb += 1
    sched.step()
    if (ep + 1) % 5 == 0 or ep == EPOCHS - 1:
        iou, acc = evaluate(Xva, Yva, Mva)
        miou = np.nanmean(iou)
        print(f"ep {ep+1:3d}  loss {tot/nb:.3f}  val mIoU {miou:.3f}  pixAcc {acc:.3f}")
        if miou > best:
            best = miou
            torch.save(model.state_dict(), os.path.join(HERE, "model.pt"))

# load best
model.load_state_dict(torch.load(os.path.join(HERE, "model.pt")))
iou, acc = evaluate(Xva, Yva, Mva)


# ----------------------------------------------------------------------------
# proxy validity: subset of runChecks computed on a class grid
# ----------------------------------------------------------------------------
def blobs(grid, mask, cls):
    """connected components (4-conn) of cells == cls inside mask. returns list of (area_m2, minside_m)."""
    H, W = grid.shape
    seen = np.zeros((H, W), bool)
    res = []
    for r in range(H):
        for c in range(W):
            if seen[r, c] or not mask[r, c] or grid[r, c] != cls:
                continue
            st = [(r, c)]; seen[r, c] = True; comp = []
            while st:
                y, x = st.pop(); comp.append((y, x))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < H and 0 <= nx < W and not seen[ny, nx] and mask[ny, nx] and grid[ny, nx] == cls:
                        seen[ny, nx] = True; st.append((ny, nx))
            ys = [p[0] for p in comp]; xs = [p[1] for p in comp]
            area = len(comp) * CELL_A
            minside = (min(max(ys) - min(ys) + 1, max(xs) - min(xs) + 1)) * CELL_M
            res.append((area, minside))
    return res


def proxy_valid(grid, mask, is_villa):
    """True if the layout satisfies a presence+geometry subset of the rules."""
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
        # shared core: a stair blob of reasonable size must exist
        ok &= any(a >= 12.0 for a, s in blobs(grid, mask, CIDX["merdiven"]))
    return bool(ok)


# run proxy on GT val and predicted val
model.eval()
gt_pass = 0; pred_pass = 0
preds = []
with torch.no_grad():
    logit = model(Xva)
    pred_all = logit.argmax(1).numpy()
for k, i in enumerate(val_idx):
    m = masks[i] > 0
    gt = labels[i].copy(); gt[~m] = 0
    pr = pred_all[k].copy(); pr[~m] = 0
    preds.append(pr)
    is_villa = index[i]["bina"] == "villa"
    gt_pass += proxy_valid(gt, m, is_villa)
    pred_pass += proxy_valid(pr, m, is_villa)
nval = len(val_idx)
print(f"\nproxy validity (subset of runChecks):")
print(f"  GT   val pass: {gt_pass}/{nval}  ({100*gt_pass/nval:.1f}%)")
print(f"  PRED val pass: {pred_pass}/{nval}  ({100*pred_pass/nval:.1f}%)")


# ----------------------------------------------------------------------------
# render gt vs pred PNGs
# ----------------------------------------------------------------------------
def to_rgb(grid, scale=4):
    pal = np.array(PALETTE, np.uint8)
    img = Image.fromarray(pal[grid]).resize((G * scale, G * scale), Image.NEAREST)
    return img


pal_np = np.array(PALETTE, np.uint8)
for k in range(min(6, nval)):
    i = val_idx[k]
    m = masks[i] > 0
    gt = labels[i].copy(); gt[~m] = 0
    pr = preds[k]
    a, b = to_rgb(gt), to_rgb(pr)
    gap = 8
    canvas = Image.new("RGB", (a.width + gap + b.width, a.height + 22), (255, 255, 255))
    canvas.paste(a, (0, 22)); canvas.paste(b, (a.width + gap, 22))
    d = ImageDraw.Draw(canvas)
    r = index[i]
    d.text((2, 4), f"#{i} {r['bina']} {r['kat']}k {r['shape']}   GT  |  PRED", fill=(0, 0, 0))
    canvas.save(os.path.join(OUT, f"pred_{i}.png"))

# ----------------------------------------------------------------------------
# metrics.json
# ----------------------------------------------------------------------------
metrics = {
    "epochs": EPOCHS,
    "modelParams": int(nparams),
    "train": len(train_idx), "val": nval,
    "pixelAcc": float(acc),
    "mIoU": float(np.nanmean(iou)),
    "perClassIoU": {CLASSES[c]: (None if np.isnan(iou[c]) else round(float(iou[c]), 4)) for c in range(NC)},
    "classWeights": {CLASSES[c]: round(float(w[c]), 3) for c in range(NC)},
    "proxyValidity": {
        "note": "subset of runChecks (presence + min area/side of salon/yatak/banyo + core), on the class grid",
        "gtValPass": int(gt_pass), "predValPass": int(pred_pass), "valTotal": nval,
        "gtPassRate": round(gt_pass / nval, 3), "predPassRate": round(pred_pass / nval, 3),
    },
}
json.dump(metrics, open(os.path.join(OUT, "metrics.json"), "w"), indent=2)
print("\nper-class IoU:")
for c in range(NC):
    v = "  n/a" if np.isnan(iou[c]) else f"{iou[c]:.3f}"
    print(f"  {CLASSES[c]:9s} {v}")
print("\nwrote metrics + predictions to", OUT)
