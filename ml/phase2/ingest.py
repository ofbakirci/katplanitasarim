"""
ml/phase2/ingest.py — turn KPTA-corrected plans into ML fine-tune data.

The user opens a case in the KPTA app, hand-corrects it, and exports "SVG indir".
That SVG carries the full structural state in <metadata id="kpState"> (the app's
own restoreState round-trip). This script reads those exported files (.svg OR raw
.json), rasterizes plan.regions[].cells + .type into the canonical 64x64 / 12-class
grid — the SAME representation ml/engine.js produces and ml/prepare.py/train.py
consume — and writes a fine-tune dataset.

    inputs_mask.bin  uint8  N*G*G   building interior mask
    labels.bin       uint8  N*G*G   per-cell class  (= the CORRECTED layout)
    program.bin      f32    N*P      program feature vector (from the state's specs)
    index.json / meta.json / split.json / norm.json

Modes:
  (default) standalone : write ml/phase2/finetune/  (self-contained, safe)
  --merge              : append into ml/data/ (backs up first), corrected -> train

Usage:
  python3 ml/phase2/ingest.py                      # reads ml/phase2/corrected/*.svg|*.json
  python3 ml/phase2/ingest.py --in some/dir
  python3 ml/phase2/ingest.py f1.svg f2.json       # explicit files
  python3 ml/phase2/ingest.py --repeat 3 --merge
"""
import argparse
import glob
import html
import json
import os
import re
import shutil
import sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ML = os.path.dirname(HERE)
DATA = os.path.join(ML, "data")
DEFAULT_IN = os.path.join(HERE, "corrected")
FINETUNE = os.path.join(HERE, "finetune")
CASES = os.path.join(HERE, "cases")

G = 64
CLASSES = ['bos', 'salon', 'yatak', 'mutfak', 'banyo', 'wc', 'antre',
           'koridor', 'merdiven', 'asansor', 'yangin', 'teknik']
CIDX = {c: i for i, c in enumerate(CLASSES)}
# mirror ml/engine.js TYPE_TO_CLASS (region.type -> canonical class)
TYPE_TO_CLASS = {
    'salon': 'salon', 'oturma': 'salon', 'yatak': 'yatak', 'oda': 'yatak', 'room': 'yatak',
    'mutfak': 'mutfak', 'banyo': 'banyo', 'wc': 'wc', 'antre': 'antre', 'koridor': 'koridor',
    'merdiven': 'merdiven', 'asansor': 'asansor', 'yangin': 'yangin', 'teknik': 'teknik',
    'isiklik': 'teknik',
}
PALETTE = [
    (245, 245, 245), (255, 179, 71), (114, 159, 207), (152, 216, 170),
    (173, 127, 168), (233, 185, 110), (255, 233, 120), (200, 200, 200),
    (120, 120, 120), (90, 90, 90), (239, 41, 41), (60, 60, 60),
]
PROG_FEATURES = ['isVilla', 'kat', 'nUnitTypes', 'totalUnits', 'totalRooms',
                 'totalSalon', 'ensuiteUnits', 'acikUnits', 'avgOdaPerUnit', 'studioUnits']


def extract_state(txt):
    """Pull the KPTA stateSnapshot object from a .json or kpState-embedded .svg."""
    txt = txt.lstrip("﻿").strip()
    if txt.startswith("{"):
        return json.loads(txt)
    m = re.search(r'<metadata[^>]*id="kpState"[^>]*>([\s\S]*?)</metadata>', txt)
    if not m:
        raise ValueError("kpState gömülü değil (eski/durumsuz SVG). KPTA'dan 'SVG indir' ile dışa aktar.")
    return json.loads(html.unescape(m.group(1)))


def program_vector(st):
    bina = st.get("ui", {}).get("binaTipi", "apartman")
    try:
        kat = int(st.get("ui", {}).get("katSayisi", st["plan"].get("kat", 1)))
    except (ValueError, TypeError):
        kat = st["plan"].get("kat", 1)
    s = st.get("specs", []) or []
    total_units = sum(x["adet"] for x in s)
    total_rooms = sum(x["oda"] * x["adet"] for x in s)
    total_salon = sum((x["adet"] if x.get("salon", 0) > 0 else 0) for x in s)
    ensuite = sum((x["adet"] if x.get("ensuite") else 0) for x in s)
    acik = sum((x["adet"] if x.get("acik") else 0) for x in s)
    studio = sum((x["adet"] if x.get("salon", 0) == 0 else 0) for x in s)
    return np.array([
        1.0 if bina == "villa" else 0.0, float(kat), float(len(s)), float(total_units),
        float(total_rooms), float(total_salon), float(ensuite), float(acik),
        (total_rooms / total_units) if total_units else 0.0, float(studio),
    ], np.float32)


def rasterize(st):
    """state -> (mask, grid) uint8 64x64, top-left aligned (matches ml/engine.js)."""
    sp = st["plan"]
    rows, cols = sp["rows"], sp["cols"]
    if rows > G or cols > G:
        raise ValueError(f"plan {rows}x{cols} > {G}x{G} ızgaraya sığmıyor")
    inside = np.asarray(sp["inside"], np.uint8)
    cm = np.full(rows * cols, -1, np.int32)
    cls_of_id = {}
    for g in sp["regions"]:
        cls = TYPE_TO_CLASS.get(g["type"], "teknik")
        cls_of_id[g["id"]] = CIDX[cls]
        for i in g["cells"]:
            cm[i] = g["id"]
    mask = np.zeros((G, G), np.uint8)
    grid = np.zeros((G, G), np.uint8)
    for rr in range(rows):
        for cc in range(cols):
            i = rr * cols + cc
            if inside[i]:
                mask[rr, cc] = 1
                if cm[i] >= 0:
                    grid[rr, cc] = cls_of_id[cm[i]]
    return mask, grid


def load_files(paths):
    """paths -> list of (name, state). Accepts files and directories."""
    files = []
    for p in paths:
        if os.path.isdir(p):
            files += sorted(glob.glob(os.path.join(p, "*.svg")) +
                            glob.glob(os.path.join(p, "*.json")))
        else:
            files.append(p)
    out = []
    for f in files:
        try:
            st = extract_state(open(f, encoding="utf-8").read())
            out.append((os.path.basename(f), st))
        except Exception as e:
            print(f"  ATLANDI {os.path.basename(f)}: {e}")
    return out


def write_dataset(out_dir, masks, labels, progs, index, val_frac):
    os.makedirs(out_dir, exist_ok=True)
    n = len(index)
    np.stack(masks).astype(np.uint8).tofile(os.path.join(out_dir, "inputs_mask.bin"))
    np.stack(labels).astype(np.uint8).tofile(os.path.join(out_dir, "labels.bin"))
    np.stack(progs).astype(np.float32).tofile(os.path.join(out_dir, "program.bin"))
    json.dump(index, open(os.path.join(out_dir, "index.json"), "w"))
    meta = {
        "grid": G, "cellMeters": 0.5, "classes": CLASSES, "progFeatures": PROG_FEATURES,
        "nKept": n, "nValid": n, "nInvalid": 0, "source": "ml/phase2 KPTA-corrected",
        "dtypes": {"inputs_mask": "uint8", "labels": "uint8", "program": "float32"},
        "shapes": {"inputs_mask": [n, G, G], "labels": [n, G, G], "program": [n, len(PROG_FEATURES)]},
    }
    json.dump(meta, open(os.path.join(out_dir, "meta.json"), "w"), indent=2)
    idx = list(range(n))
    nv = int(round(n * val_frac))
    json.dump({"train": sorted(idx[nv:]), "val": sorted(idx[:nv]),
               "note": "KPTA hand-corrected fine-tune set"},
              open(os.path.join(out_dir, "split.json"), "w"))
    src_norm = os.path.join(DATA, "norm.json")
    if os.path.exists(src_norm):
        shutil.copy(src_norm, os.path.join(out_dir, "norm.json"))
    else:
        a = np.stack(progs)
        json.dump({"mean": a.mean(0).tolist(), "std": (a.std(0) + 1e-6).tolist(),
                   "features": PROG_FEATURES}, open(os.path.join(out_dir, "norm.json"), "w"))
    return n


def merge_into_data(masks, labels, progs, index):
    backup = DATA + "_backup"
    if not os.path.exists(backup):
        shutil.copytree(DATA, backup); print(f"  yedek: {backup}")
    meta = json.load(open(os.path.join(DATA, "meta.json")))
    assert meta["grid"] == G
    n0 = meta["nKept"]; P = len(meta["progFeatures"])
    om = np.fromfile(os.path.join(DATA, "inputs_mask.bin"), np.uint8)
    ol = np.fromfile(os.path.join(DATA, "labels.bin"), np.uint8)
    op = np.fromfile(os.path.join(DATA, "program.bin"), np.float32)
    oi = json.load(open(os.path.join(DATA, "index.json")))
    add = len(index)
    np.concatenate([om, np.stack(masks).astype(np.uint8).reshape(-1)]).tofile(os.path.join(DATA, "inputs_mask.bin"))
    np.concatenate([ol, np.stack(labels).astype(np.uint8).reshape(-1)]).tofile(os.path.join(DATA, "labels.bin"))
    np.concatenate([op, np.stack(progs).astype(np.float32).reshape(-1)]).tofile(os.path.join(DATA, "program.bin"))
    json.dump(oi + index, open(os.path.join(DATA, "index.json"), "w"))
    meta["nKept"] = n0 + add; meta["nValid"] = meta.get("nValid", 0) + add
    meta["shapes"] = {"inputs_mask": [n0 + add, G, G], "labels": [n0 + add, G, G], "program": [n0 + add, P]}
    json.dump(meta, open(os.path.join(DATA, "meta.json"), "w"), indent=2)
    sp = os.path.join(DATA, "split.json")
    if os.path.exists(sp):
        split = json.load(open(sp))
        split["train"] = sorted(split["train"] + list(range(n0, n0 + add)))
        split["note"] = split.get("note", "") + f" | +{add} KPTA-corrected -> train"
        json.dump(split, open(sp, "w"))
    print(f"  ml/data nKept: {n0} -> {n0 + add}")


def render_pngs(samples, out_dir):
    try:
        from PIL import Image
    except Exception:
        print("  (PIL yok — PNG önizleme atlandı)"); return
    os.makedirs(out_dir, exist_ok=True)
    pal = np.array(PALETTE, np.uint8); sc = 6
    for name, mask, grid in samples:
        g = np.where(mask > 0, grid, 0)
        img = Image.fromarray(pal[g]).resize((G * sc, G * sc), Image.NEAREST)
        img.save(os.path.join(out_dir, f"ingest_{os.path.splitext(name)[0]}.png"))
    print(f"  PNG önizleme: {out_dir}/ingest_*.png")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="*", help="düzeltilmiş .svg/.json dosyaları (boşsa --in dizini)")
    ap.add_argument("--in", dest="inp", default=DEFAULT_IN)
    ap.add_argument("--repeat", type=int, default=1)
    ap.add_argument("--merge", action="store_true")
    ap.add_argument("--val-frac", type=float, default=0.0)
    ap.add_argument("--no-png", action="store_true")
    args = ap.parse_args()

    paths = args.files if args.files else [args.inp]
    if not args.files and not os.path.isdir(args.inp):
        sys.exit(f"girdi yok: {args.inp} dizini bulunamadı.\n"
                 f"  KPTA'dan düzelttiğin SVG'leri {DEFAULT_IN}/ içine koy ya da dosyaları argüman ver.")
    loaded = load_files(paths)
    if not loaded:
        sys.exit("okunabilir düzeltilmiş dosya bulunamadı.")

    masks, labels, progs, index, previews = [], [], [], [], []
    for name, st in loaded:
        try:
            mask, grid = rasterize(st)
        except Exception as e:
            print(f"  ATLANDI {name}: {e}"); continue
        pv = program_vector(st)
        inside_cells = int(mask.sum())
        for _ in range(args.repeat):
            masks.append(mask); labels.append(grid); progs.append(pv)
            index.append({"source": "kpta_corrected", "file": name,
                          "bina": st.get("ui", {}).get("binaTipi"),
                          "kat": st.get("ui", {}).get("katSayisi"),
                          "rows": st["plan"]["rows"], "cols": st["plan"]["cols"],
                          "insideCells": inside_cells, "valid": True, "bad": 0})
        previews.append((name, mask, grid))
        print(f"  + {name}: {st['plan']['rows']}x{st['plan']['cols']}, "
              f"{inside_cells} iç hücre, {len(st['plan']['regions'])} bölge")

    if not masks:
        sys.exit("hiçbir dosya rasterize edilemedi.")
    print(f"toplam {len(masks)} eğitim örneği (repeat={args.repeat})")

    if args.merge:
        merge_into_data(masks, labels, progs, index)
        nxt = "  python3 ml/prepare.py && python3 ml/train.py"
    else:
        n = write_dataset(FINETUNE, masks, labels, progs, index, args.val_frac)
        print(f"  yazıldı: {FINETUNE}/  (nKept={n})")
        nxt = "  # train.py'yi finetune/'a yönlendir + model.pt'den düşük lr ile devam et"
    if not args.no_png:
        render_pngs(previews, os.path.join(HERE, "preview"))
    print("\nbitti. Sonraki adım:\n" + nxt)


if __name__ == "__main__":
    main()
