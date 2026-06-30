"""
ml/prepare.py - load the synthetic dataset, build the train/val split, run EDA,
and render a few input/label PNGs for eyeball verification.

Reads ml/data/{meta.json,inputs_mask.bin,labels.bin,program.bin,index.json}.
Writes:
  ml/data/split.json         indices for train/val (valid-only training set)
  ml/data/norm.json          program-feature mean/std (computed on train split)
  ml/out/eda_class_dist.png  class distribution bar chart (all kept vs valid-only)
  ml/out/sample_*.png        input mask + label segmentation side by side
  ml/out/eda_summary.txt     text EDA summary
"""
import json
import os
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
# DATA_DIR / OUT_DIR env overrides let prepare run on the v2 set (data_5k -> out_v2)
# without touching the baseline. Defaults reproduce the original behavior exactly.
DATA = os.path.join(HERE, os.environ.get("DATA_DIR", "data"))
OUT = os.path.join(HERE, os.environ.get("OUT_DIR", "out"))
os.makedirs(OUT, exist_ok=True)

# class -> RGB for visualization (index aligned with meta['classes'])
PALETTE = [
    (245, 245, 245),  # 0 bos      light grey
    (255, 179, 71),   # 1 salon    orange
    (114, 159, 207),  # 2 yatak    blue
    (152, 216, 170),  # 3 mutfak   green
    (173, 127, 168),  # 4 banyo    purple
    (233, 185, 110),  # 5 wc       tan
    (255, 233, 120),  # 6 antre    yellow
    (200, 200, 200),  # 7 koridor  grey
    (120, 120, 120),  # 8 merdiven dark grey
    (90, 90, 90),     # 9 asansor  darker grey
    (239, 41, 41),    # 10 yangin  red
    (60, 60, 60),     # 11 teknik  near black
]


def load():
    meta = json.load(open(os.path.join(DATA, "meta.json")))
    index = json.load(open(os.path.join(DATA, "index.json")))
    G = meta["grid"]
    n = meta["nKept"]
    P = len(meta["progFeatures"])
    masks = np.fromfile(os.path.join(DATA, "inputs_mask.bin"), dtype=np.uint8).reshape(n, G, G)
    labels = np.fromfile(os.path.join(DATA, "labels.bin"), dtype=np.uint8).reshape(n, G, G)
    prog = np.fromfile(os.path.join(DATA, "program.bin"), dtype=np.float32).reshape(n, P)
    return meta, index, masks, labels, prog


def render_label(lab, scale=4):
    """lab: (G,G) uint8 -> RGB PIL image upscaled."""
    G = lab.shape[0]
    rgb = np.zeros((G, G, 3), dtype=np.uint8)
    pal = np.array(PALETTE, dtype=np.uint8)
    rgb = pal[lab]
    img = Image.fromarray(rgb, "RGB").resize((G * scale, G * scale), Image.NEAREST)
    return img


def render_mask(mask, scale=4):
    G = mask.shape[0]
    rgb = np.where(mask[..., None] > 0, np.array([60, 70, 90], np.uint8), np.array([245, 245, 245], np.uint8))
    return Image.fromarray(rgb.astype(np.uint8), "RGB").resize((G * scale, G * scale), Image.NEAREST)


def side_by_side(mask, lab, caption, path, scale=4):
    a, b = render_mask(mask, scale), render_label(lab, scale)
    gap = 8
    W = a.width + gap + b.width
    H = a.height + 22
    canvas = Image.new("RGB", (W, H), (255, 255, 255))
    canvas.paste(a, (0, 22))
    canvas.paste(b, (a.width + gap, 22))
    d = ImageDraw.Draw(canvas)
    d.text((2, 4), caption, fill=(0, 0, 0))
    canvas.save(path)


def main():
    meta, index, masks, labels, prog = load()
    classes = meta["classes"]
    G = meta["grid"]
    n = meta["nKept"]
    valid = np.array([1 if r["valid"] else 0 for r in index], dtype=np.int64)
    print(f"loaded {n} samples, grid {G}x{G}, {len(classes)} classes")
    print(f"valid {int(valid.sum())}  invalid {int(n - valid.sum())}")

    # ---- train/val split on VALID-only (clean targets), 85/15 deterministic ----
    rng = np.random.default_rng(0)
    valid_idx = np.where(valid == 1)[0]
    rng.shuffle(valid_idx)
    n_val = max(1, int(round(len(valid_idx) * 0.15)))
    val_idx = sorted(valid_idx[:n_val].tolist())
    train_idx = sorted(valid_idx[n_val:].tolist())
    json.dump({"train": train_idx, "val": val_idx,
               "note": "valid-only (bad==0); invalid samples kept in dataset but excluded from training"},
              open(os.path.join(DATA, "split.json"), "w"))
    print(f"split: train {len(train_idx)}  val {len(val_idx)}  (valid-only)")

    # ---- program normalization on train split ----
    ptr = prog[train_idx]
    pmean = ptr.mean(0).tolist()
    pstd = (ptr.std(0) + 1e-6).tolist()
    json.dump({"mean": pmean, "std": pstd, "features": meta["progFeatures"]},
              open(os.path.join(DATA, "norm.json"), "w"))

    # ---- class distribution: all kept vs valid-only, INSIDE-mask only ----
    def class_share(idxs):
        cc = np.zeros(len(classes), dtype=np.int64)
        for i in idxs:
            lab = labels[i][masks[i] > 0]  # inside cells only
            binc = np.bincount(lab, minlength=len(classes))
            cc += binc
        return cc / max(1, cc.sum())

    all_share = class_share(range(n))
    val_share = class_share(valid_idx)

    # bar chart (pure PIL, no matplotlib dependency)
    chart_w, chart_h = 720, 360
    chart = Image.new("RGB", (chart_w, chart_h), (255, 255, 255))
    d = ImageDraw.Draw(chart)
    d.text((10, 6), "Inside-mask class share  (left=all kept, right=valid-only)", fill=(0, 0, 0))
    maxv = max(all_share.max(), val_share.max())
    bw = 26
    x0 = 30
    base = chart_h - 40
    for c in range(len(classes)):
        x = x0 + c * (bw * 2 + 10)
        h1 = int((all_share[c] / maxv) * (base - 30))
        h2 = int((val_share[c] / maxv) * (base - 30))
        col = PALETTE[c]
        d.rectangle([x, base - h1, x + bw, base], fill=col, outline=(0, 0, 0))
        d.rectangle([x + bw, base - h2, x + 2 * bw, base], fill=tuple(int(v * 0.6) for v in col), outline=(0, 0, 0))
        d.text((x, base + 4), classes[c][:5], fill=(0, 0, 0))
        d.text((x, base - max(h1, h2) - 12), f"{all_share[c]*100:.1f}", fill=(0, 0, 0))
    chart.save(os.path.join(OUT, "eda_class_dist.png"))

    # ---- sample renders: 4 valid + 2 invalid ----
    shown = []
    for i in valid_idx[:4]:
        r = index[i]
        cap = f"#{i} VALID {r['bina']} {r['kat']}k {r['shape']} bad={r['bad']}"
        side_by_side(masks[i], labels[i], cap, os.path.join(OUT, f"sample_valid_{i}.png"))
        shown.append(i)
    inv_idx = np.where(valid == 0)[0][:2]
    for i in inv_idx:
        r = index[i]
        cap = f"#{i} INVALID {r['bina']} {r['kat']}k {r['shape']} bad={r['bad']}"
        side_by_side(masks[i], labels[i], cap, os.path.join(OUT, f"sample_invalid_{i}.png"))
        shown.append(i)

    # ---- text summary ----
    with open(os.path.join(OUT, "eda_summary.txt"), "w") as f:
        f.write(f"samples kept: {n}\nvalid: {int(valid.sum())}  invalid: {int(n-valid.sum())}\n")
        f.write(f"train/val (valid-only): {len(train_idx)}/{len(val_idx)}\n\n")
        f.write("inside-mask class share (all kept | valid-only):\n")
        for c in range(len(classes)):
            f.write(f"  {c:2d} {classes[c]:9s} {all_share[c]*100:6.2f}% | {val_share[c]*100:6.2f}%\n")
        # building geometry stats
        rows = np.array([r["rows"] for r in index])
        cols = np.array([r["cols"] for r in index])
        f.write(f"\nbuilding rows: min {rows.min()} max {rows.max()} mean {rows.mean():.1f}\n")
        f.write(f"building cols: min {cols.min()} max {cols.max()} mean {cols.mean():.1f}\n")
        fill = masks.reshape(n, -1).mean(1)
        f.write(f"mask fill ratio (of 64x64): mean {fill.mean():.3f}\n")

    print("EDA written to", OUT)
    print("class shares (all | valid-only):")
    for c in range(len(classes)):
        print(f"  {c:2d} {classes[c]:9s} {all_share[c]*100:6.2f}% | {val_share[c]*100:6.2f}%")


if __name__ == "__main__":
    main()
