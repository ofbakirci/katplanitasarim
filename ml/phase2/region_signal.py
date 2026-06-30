"""
ml/phase2/region_signal.py — (c) vektor-kernel yönünün CAN ALICI ön-testi.

Soru: kullanıcının el-düzeltmeleri, RASTER-piksel yerine BÖLGE-SEVİYESİ özniteliklerde
(daire alanı, oda dikdörtgenliği, dolaşım payı, tip payları) TUTARLI bir örüntü mü?
Raster U-Net (finetune_run.py) genelleyemedi. Eğer düzeltme örüntüsü bölge-uzayında
tutarlıysa (aynı yön, düşük varyans) → (c) doğru yol, basit bir model bile öğrenebilir.
Tutarsızsa → sorun temsil değil, "tercih"in kendisi öğrenilebilir bir fonksiyon değil.

io.js / motora DOKUNMAZ — sadece ml/phase2 altında okur, ekrana rapor basar.

Çalıştırma:  python3 ml/phase2/region_signal.py
"""
import os, sys, glob, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ingest  # extract_state, TYPE_TO_CLASS

HERE = os.path.dirname(os.path.abspath(__file__))
# (düzeltilmiş dizin, motor-orijinal dizin) çiftleri
PAIRS = [
    (os.path.join(HERE, "corrected", "batch1"), os.path.join(HERE, "cases")),
    (os.path.join(HERE, "corrected_batch2"),    os.path.join(HERE, "cases_batch2")),
]
CORE = {"merdiven", "asansor", "yangin", "teknik", "isiklik"}  # daire dışı (çekirdek)
CIRC = {"antre", "koridor"}                                    # dolaşım
DWELL_TYPES = ["salon", "yatak", "mutfak", "banyo", "wc", "antre", "koridor"]


def region_features(st):
    """state -> bölge-seviyesi öznitelik sözlüğü (oran/biçim/adalet)."""
    sp = st["plan"]; rows, cols = sp["rows"], sp["cols"]
    inside = np.asarray(sp["inside"], np.uint8)
    interior = int(inside.sum())
    regs = sp["regions"]

    def norm_type(t):  # oda/room -> yatak vb. (motorla aynı eşleme)
        return ingest.TYPE_TO_CLASS.get(t, t)

    # tip payları (iç alana oranla)
    area_by_type = {}
    unit_area = {}        # unit_id -> hücre sayısı (yalnız daire-içi odalar)
    rect_vals = []        # daire odalarının dikdörtgenliği (cells/bbox)
    for g in regs:
        t = norm_type(g["type"]); cells = g["cells"]; n = len(cells)
        if n == 0:
            continue  # hayalet bölge (alan atanmamış placeholder oda) — atla
        area_by_type[t] = area_by_type.get(t, 0) + n
        u = g.get("unit", -1)
        if u is not None and u >= 0 and g["type"] not in CORE:
            unit_area[u] = unit_area.get(u, 0) + n
            # dikdörtgenlik = doluluk / sınırlayıcı-kutu (1.0 = tam dikdörtgen)
            rr = [c // cols for c in cells]; cc = [c % cols for c in cells]
            bbox = (max(rr) - min(rr) + 1) * (max(cc) - min(cc) + 1)
            rect_vals.append(n / bbox if bbox else 0.0)

    def sh(t): return area_by_type.get(t, 0) / interior if interior else 0.0
    dwelling_cells = sum(unit_area.values())
    circ_cells = sum(area_by_type.get(t, 0) for t in CIRC)
    # daire alan adaleti: varyasyon katsayısı (düşük = adil) ve max/min oranı
    ua = np.array(list(unit_area.values()), float)
    cv = float(ua.std() / ua.mean()) if len(ua) > 1 and ua.mean() > 0 else 0.0
    spread = float(ua.max() / ua.min()) if len(ua) > 1 and ua.min() > 0 else 1.0

    f = {t + "_share": sh(t) for t in DWELL_TYPES}
    f["dwelling_share"] = dwelling_cells / interior if interior else 0.0   # dairelere giden pay (maks istenir)
    f["circ_share"] = circ_cells / interior if interior else 0.0          # dolaşım payı (azaltılmak istenir)
    f["unit_area_cv"] = cv                                                 # daire-alan eşitsizliği (azaltılmak istenir)
    f["unit_area_spread"] = spread
    f["mean_rect"] = float(np.mean(rect_vals)) if rect_vals else 0.0       # oda dikdörtgenliği (artması/korunması istenir)
    f["nUnits"] = len(unit_area)
    return f


def main():
    rows = []
    unpaired = []
    for corr_dir, eng_dir in PAIRS:
        for cf in sorted(glob.glob(os.path.join(corr_dir, "*.svg")) +
                         glob.glob(os.path.join(corr_dir, "*.json"))):
            base = os.path.splitext(os.path.basename(cf))[0]
            ef = os.path.join(eng_dir, base + ".json")
            if not os.path.exists(ef):
                ef = os.path.join(eng_dir, base + ".svg")
            if not os.path.exists(ef):
                unpaired.append(os.path.basename(cf)); continue
            try:
                est = ingest.extract_state(open(ef, encoding="utf-8").read())
                cst = ingest.extract_state(open(cf, encoding="utf-8").read())
                ef_ = region_features(est); cf_ = region_features(cst)
            except Exception as e:
                print(f"  ATLANDI {base}: {e}"); continue
            rows.append((base, ef_, cf_))

    print(f"eşleşen çift: {len(rows)}   eşleşmeyen düzeltme: {len(unpaired)}")
    if unpaired:
        print("  (motor-orijinali bulunamadı):", ", ".join(unpaired))
    if not rows:
        sys.exit("çift yok.")

    # ---- öznitelik deltaları: motor -> düzeltilmiş ----
    FEATS = [("salon_share", "salon payı", "↓"), ("yatak_share", "yatak payı", "↑"),
             ("mutfak_share", "mutfak payı", "·"), ("banyo_share", "banyo payı", "·"),
             ("antre_share", "antre payı", "·"), ("koridor_share", "koridor payı", "↓"),
             ("circ_share", "dolaşım payı (antre+koridor)", "↓"),
             ("dwelling_share", "dairelere giden pay", "↑"),
             ("unit_area_cv", "daire-alan eşitsizliği (CV)", "↓"),
             ("mean_rect", "oda dikdörtgenliği", "↑")]
    print("\n=== MOTOR -> DÜZELTİLMİŞ delta (bölge-öznitelik uzayı) ===")
    print(f"{'öznitelik':32s} {'motor':>7s} {'düzelt':>7s} {'Δort':>8s} {'Δstd':>7s} "
          f"{'aynı-yön%':>9s} {'beklenen':>8s}")
    summary = {}
    for key, label, want in FEATS:
        e = np.array([r[1][key] for r in rows]); c = np.array([r[2][key] for r in rows])
        d = c - e
        same = 100.0 * np.mean(np.sign(d) == (1 if want == "↑" else -1)) if want in "↑↓" else float("nan")
        summary[key] = dict(eng=float(e.mean()), corr=float(c.mean()),
                            dmean=float(d.mean()), dstd=float(d.std()),
                            sameDirPct=None if want == "·" else float(same), want=want)
        sg = f"{same:7.0f}%" if want in "↑↓" else "    —  "
        print(f"{label:32s} {e.mean():7.3f} {c.mean():7.3f} {d.mean():+8.4f} {d.std():7.4f} "
              f"{sg:>9s} {want:>8s}")

    # ---- tutarlılık özeti (sinyal var mı?) ----
    print("\n=== TUTARLILIK OKUMASI ===")
    directional = [(k, summary[k]) for k, _, w in FEATS for kk in [k] if summary[k]["want"] in "↑↓"]
    strong = [k for k, s in directional if s["sameDirPct"] is not None and s["sameDirPct"] >= 70
              and abs(s["dmean"]) > 0.5 * s["dstd"]]
    weak = [k for k, s in directional if k not in strong]
    print(f"GÜÇLÜ sinyal (≥%70 aynı yön + Δort > 0.5·Δstd): {strong if strong else '— yok'}")
    print(f"ZAYIF/tutarsız: {weak}")
    json.dump(dict(nPairs=len(rows), features=summary, strong=strong, weak=weak),
              open(os.path.join(HERE, "region_signal.json"), "w"), indent=2)
    print(f"\nyazıldı: {os.path.join(HERE, 'region_signal.json')}")


if __name__ == "__main__":
    main()
