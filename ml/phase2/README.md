# Faz 2 — KPTA ile elle düzeltme döngüsü

Amaç: motorun ürettiği planları **kendi KPTA uygulamanda açıp elle düzelterek**
modele "senin mimari zevkini" öğretecek eğitim hedefleri üretmek. Ayrı bir editör
yok — KPTA'nın kendi içe/dışa aktarması kullanılıyor.

```
case_*.json  →  KPTA'da AÇ (içe aktar)  →  elle düzelt  →  SVG indir (kpState gömülü)  →  ingest.py  →  fine-tune verisi
 (gen_cases)     "SVG içe aktar"            (app araçları)    "SVG indir"                   (64×64, 12 sınıf)   (train.py)
```

Mevcut uygulamaya **dokunulmadı**; `ml/phase2/` sadece `tests/app.js` bundle'ını
headless okuyup `stateSnapshot()` çağırıyor.

---

## EN ÖNEMLİ: round-trip yapısal düzeltmeyi destekliyor mu? → **EVET**

`src/io.js` doğrulandı:
- **Dışa aktarma** (`exportSVG`): görsel SVG + tam yapısal durum `<metadata id="kpState">`
  içine gömülür. `stateSnapshot()` *canlı* `plan.regions[].cells` + `.type` + `inside`
  + `pts` + `specs` + kapılar… hepsini yazar.
- **İçe aktarma** (`importPlanText` → `restoreState`): kpState'li SVG **veya** ham JSON
  birebir geri yüklenir. Uygulamanın kendi arayüzü de bunu söylüyor: *"Bu araçtan
  indirilen SVG'ler plan durumunu içinde taşır: içe aktarınca elle düzenlemeler
  dâhil aynen geri gelir."*
- KPTA'nın elle düzeltme araçları — duvar sürükleme (hücreleri komşu odaya aktarır),
  **oda tipini değiştir** (sağ tık → "✎ Tipini değiştir…"), oda takası, oda ekle/sil,
  kapı, sınır köşesi sürükleme — **hepsi** `plan.regions`'ı değiştirir, dolayısıyla
  kpState'e yansır.

Bu yüzden döngü temiz: KPTA'da yaptığın yapısal düzeltme, dışa aktarılan dosyadan
**yapısal olarak** geri okunur ve ML ızgarasına (64×64, 12 sınıf) çevrilir.
`gen_cases.js` her case için bunu **otomatik doğruluyor** (stateSnapshot → restoreState
→ aynı plan; 14/14 OK).

> Not: yalnız **bu araçtan indirilen** (kpState'li) SVG yapısal döner. Başka yerden
> gelen "düz" SVG'ler geometriden tahmin edilir (deneysel) — onları kullanma.

---

## Dosyalar

| Dosya | Ne işe yarar |
|---|---|
| `gen_cases.js` | 14 case'i KPTA-importable `.json` olarak üretir + round-trip'i doğrular |
| `cases/case_*.json` | KPTA'da "SVG içe aktar" ile açılan case'ler (`.json` da kabul edilir) |
| `cases/manifest.json` | case listesi (id, program, şekil, geçerlilik, roundtripOk) |
| `corrected/` | **düzelttiğin** SVG/JSON dosyalarını buraya koyarsın |
| `ingest.py` | `corrected/`'ı okuyup `ml/prepare.py`/`train.py` formatına çevirir |

---

## Kullanıcı ne yapacak? (adım adım)

### 0. (Bir kez) case'leri üret — zaten üretildi
```bash
node ml/phase2/gen_cases.js
```

### 1. Bir case'i KPTA'da aç
1. KPTA uygulamanı aç (`kat-plani-tasarim.html`).
2. Sağ paneldeki **“SVG içe aktar”** düğmesine bas.
3. Dosya seçicide `ml/phase2/cases/case_<id>.json` seç. (Dosya seçici `.json`
   kabul ediyor.) Plan ekrana gelir — motorun yerleşimiyle.

### 2. Elle düzelt
KPTA'nın normal araçlarıyla "daha iyi mimari" olacak şekilde düzelt:
- **Oda tipini değiştir:** odaya sağ tık → **“✎ Tipini değiştir…”** (yatak/salon/
  mutfak/banyo/wc/çalışma/kiler).
- **Duvarı sürükle:** iç duvarı taşı — hücreler komşu odaya geçer.
- Oda **takas / ekle / sil**, **kapı** ekle-taşı, **sınır köşesi** sürükle, balkon.
- Hepsi anında plana işler.

### 3. Düzeltmeyi dışa aktar
- **“SVG indir”** düğmesine bas → `kat-plani.svg` iner (içinde kpState gömülü).
- Dosyayı **`ml/phase2/corrected/`** klasörüne taşı. İstersen yeniden adlandır
  (örn. `apt_rect_2p1x2.svg`) — ingest dosya adından bağımsız çalışır.
- Birden çok case düzeltip hepsini `corrected/`'a koyabilirsin.

### 4. Eğitim verisine çevir
```bash
python3 ml/phase2/ingest.py                 # corrected/*.svg|*.json -> ml/phase2/finetune/
python3 ml/phase2/ingest.py --repeat 3      # her düzeltmeyi 3x ağırlıkla
python3 ml/phase2/ingest.py --merge         # ml/data'ya ekle (önce yedekler)
```
`ingest.py` her dosyadan kpState'i çıkarır, `plan.regions[].cells`+`.type`'ı 64×64
ızgaraya (12 sınıf, `ml/engine.js` ile aynı eşleme) rasterize eder, programı
`specs`'ten hesaplar ve `ml/prepare.py`/`train.py`'nin okuduğu **birebir** formatı
yazar (+ `preview/ingest_*.png`).

### 5. Fine-tune et
- **Ayrı veri (önerilen ilk deneme):** `train.py`'deki `DATA` yolunu
  `ml/phase2/finetune`'a çevir, `ml/model.pt`'yi başlangıç ağırlığı yükle, düşük lr
  (`1e-4`) ile birkaç epoch.
- **Karıştırarak:** `--merge` → `python3 ml/prepare.py` → `python3 ml/train.py`.

`norm.json` hep `ml/data`'dan kopyalanır (program normalizasyonu önceden eğitilen
modelle aynı kalsın diye).

---

## Case paketi (14, hepsi round-trip OK)

rect / L / T parseller · stüdyo (1+0)'dan 5+1'e · apartman + villa · hem geçerli hem
sınırda (motor ihlalli). Sınırda olanlar (örn. `apt_tight_1p1_tall` bad=6,
`apt_T_3p1x3` bad=5) düzeltmenin en çok işe yaradığı yerler. Tam liste:
`cases/manifest.json`.
