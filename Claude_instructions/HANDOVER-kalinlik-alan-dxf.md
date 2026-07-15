# HANDOVER — Kalınlık + brüt/net alan + DXF export (yeni session için)

> **TAMAMLANDI (2026-07-15 notu):** Bu brief'in işi bitti — dilim dilim onay kaydı için
> bkz. `BRIEF-L1A.md` DURUM tablosu. Dosya tarihsel görev tanımı olarak durur.

> Bu, vektör-kernel yol haritasının **L1-A** fazı: zaruri ihtiyaçları barındıran
> **çalışan sistem**. Tek hedef: duvar **kalınlığı** + **brüt/net alan** + **DXF export**.
> Diyagonal ve tam vektör-model rewrite bu session'ın DIŞINDA (sonraki fazlar).
> Tam plan: `~/.claude/plans/50cm-lik-zgaralar-projelerin-daha-federated-adleman.md`
> Stratejik bağlam/memory: `vektor-kernel-roadmap`, `kpta-engine-architecture`.

## Neden bu iş, neden şimdi
Kullanıcı kararı (2026-07-01): "şu anlık zaruri ihtiyaçları barındıran çalışan bir sistem
daha önemli; sonra diyagonal." 10-ajan kod-doğrulama şunu netleştirdi: 4 gereksinimden
**kalınlık + brüt/net alan + DXF-export** mesken/render hattı için somut/zaruri ve
**büyük oranda mevcut hücre modeli üstünde, düşük riskle** yapılabilir. Diyagonal ise en
pahalı/en riskli parça (veri modelini + 29 mevzuat denetimini + kayıt formatını eşanlı kırar)
→ ertelendi.

**Kritik içgörü:** Bu üç işin HİÇBİRİ diyagonal ya da vektör-model rewrite gerektirmez.
Ortogonal duvar ofseti + mevcut poligonların (fpCellOutline/fpSmoothOutline + computeWallRuns)
DXF'e yazımı yeterli. M=0.5 ızgara **olduğu gibi kalır** (1cm'e İNME — yanlış kaldıraç).

## Başlamadan önce netleşmesi gereken (kullanıcıya sor)
1. **Duvar kalınlığı değeri/kaynağı:** global tek değer mi, tip-bazlı mı? Tipik TR:
   dış duvar ~0,20-0,25 m, iç bölme ~0,10 m. `core.js`'e sabit olarak mı, kullanıcı-ayarı mı?
2. **Brüt/net gösterim:** oda etiketinde iki değer mi yoksa tabloda iki sütun mu (ya da ikisi)?
   Plan "ikisi de ayrı ayrı" diyor → tablo iki sütun + etiket net (öneri).

## Adımlar (plan L1-A) ve dosya çıpaları

### A1 — Duvar kalınlığı modeli (ortogonal)
- Bugün duvar **kalınlıksız**: `computeWallRuns` (`walls.js:45-79`) hücre kenarından anlık
  run üretir; `render.js:150-152` bunu `stroke-width`'li `<line>` çizer (yalnız görsel).
- Yapılacak: kalınlık attribute + duvarı merkez-çizgiden ±t/2 ofsetle **dolu bant** çiz.
  Ortogonal olduğu için basit (Clipper2 gerekmez; L1-B'ye kadar bekleyebilir).
- 3B tarafı (`view3d.js`) zaten duvar geometrisi kuruyor → kalınlık oraya da akmalı.

### A2 — Brüt/net alan
- Bugün alan TEK formül, İKİ yerde KOPYALI: `walls.js:7` (`g.area=g.cells.length*M*M`, canlı)
  + `io.js:501` (export `area_m2`). **Önce tek kaynağa indir**, sonra genişlet.
- net = iç açık alan (mevcut cells / shoelace); brüt = +duvar payı (ortogonal ofset).
- **Tüketiciler (dokununca kır):** `checks.js`'te ~12-34 karşılaştırma `g.area`/`g.minSide`
  tüketiyor (salon/yatak/mutfak/banyo/wc min alan+kenar `checks.js:125-155`; çekirdek
  ölçü `checks.js:42-68`). Mevzuat **net** alanı mı brüt'ü mü ölçmeli — karar ver (genelde net).
- `minSide`/`bw`/`bh` bbox-tabanlı (`walls.js:8-11`) — ortogonal odada doğru; L/U odada zaten
  kaba (kod yorumu "bbox yalan söyler" diyor) ama bu fazda dokunma (L1-B işi).
- Tablo: `io.js:28` bugün tek alan (`${fmt(r2.area)} m²`) → iki değer.

### A3 — DXF yazıcı (export) — YENİ, bugün YOK
- Bugün DXF sadece **okuyucu**: `dxf.js` (import, girdiyi hücreye rasterize eder),
  `io.js:1023-1045` içe-aktarım bağlantısı. Grep `exportDxf`/`toDxf` = 0 (üretimde yok).
  Tek `writeDxf` = `tests/dxf-import.js:75` (test fixture, üretim değil).
- Yapılacak: oda poligonları → LWPOLYLINE (katman=tip: `A-AREA-SALON` vb.), duvar runs →
  LINE/LWPOLYLINE (`A-WALL`), oda adı → TEXT (`label_anchor`'a), kapı → `A-DOOR`; m→mm.
- **Yeniden kullan:** `computeWallRuns` (`walls.js:45`), `fpCellOutline`/`fpSmoothOutline`
  (`io.js:404-479`), `buildFloorplanMap` (poligon/kapı/label zaten üretiyor). İç oda sınırı
  DXF'te basamaklı çıkar (dış cephe snap'li) — bu L1-A eşiği, bilinçli.
- İndirme butonu: export yüzeyi `io.js:277-343` (SVG/PNG/JSON yanına DXF).

### A4 — Round-trip + entegrasyon
- export → mevcut importer ile reimport → IoU/tip diff. `tests/dxf-import.js` harness'i
  (writeDxf→importDxf→karşılaştırma) genişletilebilir.
- Görsel: DXF'i harici CAD'de aç (LibreCAD/AutoCAD) → sahne-dışı kontrol.

## Gate (her adımda ölç, sağlanmazsa geri al)
- `npm test` (`tests/run-all.js`) YEŞİL.
- `npm run build` çalışır + mesken prototip taze (`mesken/MESKEN-prototip.html` postbuild).
- Mevcut baseline'lar regresyonsuz: dağıtım (`tests/dagitim-baseline.js`), yangın-merdiven,
  zemin-giriş, cut-preserve, heal-disconnect vb. (suite'te). Alan formülü değişince bunları
  ÖZELLİKLE izle (alan eşikleri her yerde).
- DXF harici CAD'de temiz açılır; brüt/net iki değer tutarlı; kalınlık 2B+3B'de görünür.

## Bu session'ın DIŞI (yapma)
- Vektör-model rewrite (`vector.js`), Clipper2-WASM, kayıt formatı v:2 → **L1-B**.
- İç diyagonal çizim/render, serbest-açı editör → **L1-C** (en riskli, en sona).
- Izgarayı 1cm'e indirme → REDDEDİLDİ (yanlış kaldıraç; M=0.5 kalır).
- ML'e dokunma → L1 ML'e DİK (app `.js`'te inference yok, `ml/` offline); bu iş ML'i etkilemez.
- Geri-uyum migrasyonu GEREKMEZ: L1-A hücre modeli üstünde kaldığı için `validateState`
  (`io.js:175`) sert-şartı aynı kalır; format değişmez (o L1-B3).

## Repo kuralları (CLAUDE.md — uy)
- Motor değişikliği HEP kaynağa (`walls.js`/`render.js`/`io.js`/`dxf.js`/`checks.js`/`core.js`),
  sonra `npm run build`. `kat-plani-tasarim.tekdosya.html` ve `mesken/MESKEN-prototip.html`
  ELLE düzenlenmez (build üretir).
- "commit & push" → önce `npm run build`, sonra `npm run ship "mesaj"` (pre-commit hook build eder).
- Yeni dosya eklersen (`vector.js` bu fazda gerekmez ama) önce `git add`.

## Git durumu (devir anı)
- Branch: `claude/interesting-dewdney-403b8f` (worktree). Master: `master`.
- Öneri: L1-A için temiz branch (`kalinlik-alan-dxf`), master'dan aç.
- Bu session'da KOD değişmedi — sadece plan + bu handover + memory güncellendi.
