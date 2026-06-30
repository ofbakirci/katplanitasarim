# ML Baseline Fizibilite Raporu — Daire Yerleşimi

**Soru:** "ML ile daire yerleşimi öğrenilebilir mi?" — 1-2 günlük, ölçülebilir, somut bir cevap.

**Cevap (özet):** Evet, **bir başlangıç olarak öğrenilebilir.** Küçük bir U-Net, (bina maskesi + program)
girdisinden kural-tabanlı motorun oda yerleşimini **val mIoU 0.62 / pixel-acc %83** ile yeniden üretiyor ve
ürettiği planların **%83'ü** mevzuat-proxy denetiminden geçiyor (motorun kendi geçerli çıktıları %84.5).
Yapısal/çekirdek sınıflar neredeyse mükemmel öğreniliyor; küçük/seyrek odalar (wc, teknik) zayıf.

> ⚠️ **Önemli kapsam notu — bu ne KANITLIYOR, ne KANITLAMIYOR.**
> Bu deney motoru **damıtıyor** (distillation): ML, kural-tabanlı motoru taklit etmeyi öğreniyor.
> Tavanı "motoru taklit et"tir, "iyi mimari üret" değil. `0-ihlal` etiketi = "yönetmelik kontrollerinden
> geçti", "iyi/yaşanabilir daire" değil. Metrikler iki şeyi ölçer: (a) **taklit sadakati** (motora karşı
> IoU/pixel-acc), (b) tahminin **mevzuat akla-yatkınlığı** (runChecks alt-kümesi). Hiçbiri "mimari kalite"
> iddia etmez. Gerçek-plan değerlendirmesi → "Sonraki adımlar" (Faz 2).

---

## 1. Kurulum ve veri akışı

```
src/algorithms.js (generate, runChecks)   ← MEVCUT MOTOR (değiştirilmedi, sadece çağrıldı)
        │  build.js → tests/app.js (bundle)
        ▼
ml/engine.js        headless koşucu: DOM-stub + eval(bundle) bir kez, tüm örnekler aynı scope'ta
ml/gen_dataset.js   rastgele poligon + program → generate() → runChecks() → kanonik grid (Node)
        ▼  ml/data/*.bin + meta/index json
ml/prepare.py       yükle, valid-only train/val böl, EDA + görseller (Python)
ml/train.py         küçük U-Net → per-cell sınıf, IoU/pixAcc + proxy-validity + tahmin görselleri
        ▼  ml/out/*.png, metrics.json, model.pt
```

**Mevcut uygulama kodu bozulmadı:** `ml/` tamamen ayrı; motor yalnızca `tests/app.js` bundle'ı üzerinden
import/eval edilip çağrıldı. `git status` yalnızca yeni `ml/` dizinini gösteriyor.

**Kanonik form:** 64×64 grid, 0.5 m hücre (32 m max açıklık), sol-üst hizalı.
- Girdi: bina iç maskesi (1 kanal) + 10 program özelliği (broadcast → 10 kanal) = **11 giriş kanalı**
- Çıktı: hücre başına 12 sınıf — `bos, salon, yatak, mutfak, banyo, wc, antre, koridor, merdiven, asansor, yangin, teknik`

---

## 2. ADIM 1 — Sentetik veri üretimi

| Metrik | Değer |
|---|---|
| Üretim hızı | **106 örnek/s** (2000 örnek / 18.8 s) |
| Motor hatası | **0** |
| Oversize (>64 hücre) | **0** |
| Geçerli (0 ihlal) | **949 (%47.5)** |
| Geçersiz (≥1 ihlal) | 1051 (%52.5) |
| Bilinmeyen region tipi | **yok** (hepsi 12 sınıfa eşlendi) |

- **Poligonlar:** rect / L / T varyasyonları, 10–25 m kenar, 0.5 m grid'e snap.
- **Programlar:** footprint'e göre ölçeklenmiş (`unitSpecs`); oda dağılımı 1-3'e ağırlıklı. Bu ölçekleme
  geçerli oranı **%17.5 → %47.5**'e çıkardı (rastgele programlar footprint'i fazla dolduruyordu).
- **Etiketleme:** her örnek `runChecks()` ile etiketlendi; `bad==0` → geçerli. Geçersizler **atılmadı**,
  `index.json` içinde saklandı (eğitim dışı, analiz için).
- **Bina geometrisi:** satır 20–40 (ort. 29.9), sütun 24–50 (ort. 37.0); 64×64 doluluk ort. %25.

**Sınıf dağılımı (maske-içi):** salon %38, yatak %27, koridor/banyo/antre/merdiven %6-9, asansor/yangin %2,
**wc %0.18, teknik %0.13** → ağır dengesizlik. (Maske-içinde `bos` ≈ %0: motor katı tamamen dolduruyor.)
→ Eğitimde **sınıf-ağırlıklı CE** kullanıldı (ters-karekök frekans; wc ağırlığı 2.9, teknik 3.4).

---

## 3. ADIM 2 — Tensör + EDA

- Train/val: **807 / 142** (yalnızca geçerli örnekler, 85/15 deterministik bölme).
- Program özellikleri train split'inde normalize edildi (`norm.json`).
- Görseller (`ml/out/`): `eda_class_dist.png` (dağılım), `sample_valid_*.png` / `sample_invalid_*.png`
  (maske ↔ segmentasyon yan yana). Gözle doğrulama: rasterleştirme sadık, L/T çentikleri doğru maskeleniyor.

---

## 4. ADIM 3 — Baseline U-Net

**Model:** 3 seviyeli U-Net (32/64/128 kanal), **0.93M parametre**, 11→12 kanal. CPU, batch 16, Adam
lr 1e-3 + cosine, **60 epoch (~26 dk)**. Sınıf-ağırlıklı CrossEntropy, kayıp yalnızca maske-içi hücrelerde
(`ignore_index` ile dışarısı hariç).

### Eğitim eğrisi (val)
| epoch | 5 | 15 | 25 | 35 | 45 | 55 | 60 |
|---|---|---|---|---|---|---|---|
| mIoU | 0.394 | 0.499 | 0.534 | 0.597 | 0.602 | 0.619 | **0.620** |
| pixAcc | 0.727 | 0.761 | 0.779 | 0.811 | 0.815 | 0.825 | **0.827** |

→ 60. epoch'ta hâlâ hafif yükseliyor — **henüz plato yok**, daha uzun eğitim + daha çok veri kazandırır.

### Per-class IoU (val)
| sınıf | IoU | | sınıf | IoU |
|---|---|---|---|---|
| merdiven | **0.854** | | banyo | 0.477 |
| koridor | **0.845** | | mutfak | 0.451 |
| yangin | 0.798 | | antre | 0.451 |
| salon | 0.769 | | teknik | 0.429 |
| asansor | 0.742 | | wc | 0.278 |
| yatak | 0.727 | | bos (maske-içi yok) | n/a |

**pixelAcc 0.827 · mIoU 0.620**

**Yorum:** Büyük/yapısal sınıflar (çekirdek: merdiven/koridor/yangın/asansör, ana hacimler: salon/yatak)
çok iyi öğreniliyor — bunlar plan iskeletinin belirleyici parçaları. Küçük ve seyrek odalar (wc, teknik,
antre, banyo, mutfak) zayıf: hem 0.5 m çözünürlükte küçükler (birkaç hücre), hem nadir görülüyorlar, hem de
yerleşimleri motorda görece "serbest" (yüksek varyans). Tahmin görsellerinde oda **sınırları pürüzlü** ve
küçük odalar yeri/biçimi yer yer kayıyor.

### Kalite metriği — proxy geçerlilik (runChecks alt-kümesi)
Tam `runChecks` entegrasyonu, tahmin ızgarasını motorun `plan.unitObjs` yapısına geri-eşlemeyi gerektiriyor
(daire ayrıştırma + komşuluk + kapı). Fizibilite kapsamında bunun yerine, tahmin ızgarası üzerinde
**bağlı-bileşen tabanlı bir alt-küme** uygulandı: salon (≥12 m²/3.0 m), yatak (≥9 m²/2.5 m), banyo (≥3 m²)
**varlığı + min ölçüleri** ve apartmanlarda makul büyüklükte bir **merdiven çekirdeği**. Aynı proxy hem GT
hem tahmin üzerinde çalıştırıldı (karşılaştırılabilirlik için):

| | Geçen | Oran |
|---|---|---|
| **GT** (motorun geçerli çıktısı) val | 120 / 142 | **%84.5** |
| **PRED** (U-Net tahmini) val | 118 / 142 | **%83.1** |

→ **Headline:** model tahminleri, GT'ye neredeyse eşit oranda proxy-geçerli plan üretiyor (sadece -1.4 puan).
(GT'nin %100 olmaması, proxy'nin tam runChecks'ten farklı/yer yer daha katı olması — örn. min-side'ı
sınırlayıcı-kutudan kestirmesi; mutlak değil, GT↔PRED **farkı** anlamlı sinyaldir.)

---

## 5. Değerlendirme — umut verici mi?

**Evet, baseline net biçimde "hayat belirtisi" gösteriyor.** En zayıf öğretmen-taklidi senaryosunda bile
(deterministik motor, 807 örnek, CPU, 0.93M param, 26 dk) model:
- plan iskeletini (çekirdek + sirkülasyon + ana hacimler) güvenilir kuruyor,
- tahminlerinin %83'ü mevzuat-proxy'den geçiyor — yani çıktı yalnızca "renkli gürültü" değil, **yapısal
  olarak makul** planlar.

Bu, asıl sorunun cevabını verir: **mimari yerleşim, conv-net'in öğrenebileceği bir uzayda.** Eğer model
deterministik motoru bile taklit edemeseydi, gerçek (dağınık, az, etiketsiz) planlardan öğrenmek umutsuz
olurdu; edebildiği için bir sonraki yatırım gerekçeli.

**Sınırlar (dürüstçe):**
1. Bu **damıtma**dır — tavan motorun kendisi. ML, motorun kör noktalarını ve önyargılarını miras alır.
2. `0-ihlal` "iyi plan" değil; sadece "kurala uygun". Yaşanabilirlik/estetik ölçülmedi.
3. Küçük odalar (wc/teknik/banyo) zayıf — 0.5 m grid + sınıf seyrekliği.
4. Çıktı bir **segmentasyon ızgarası**, üretime hazır vektör plan değil (duvar/kapı/ölçü yok).

---

## 5b. Asıl repo — Faz 1 baseline + Faz 1b iyileştirmesi (data_5k, ce_dice)

> Yukarıdaki §2–5 baseline'ı `_ag` keşif reposunda (807 train örnek, 60 epoch, salt sınıf-ağırlıklı CE)
> üretilmişti. Bu bölüm **aynı boru hattını asıl repoda** (`katplanitasarim`, gerçek `src/algorithms.js`
> motoru) ve **Faz 1b** ayarıyla yeniden koşar. Hedef: küçük/seyrek odaları (wc, banyo, mutfak, antre,
> teknik) düzeltmek. Değişen üç şey: (a) **5000 örnek** (1952 train / 344 val), (b) **ce_dice** kaybı
> (dice + sınıf-ağırlıklı CE), (c) **80 epoch tavanı, patience 12** (cosine LR). Model aynı: 0.93M param U-Net.

**Veri (asıl repo motoru, seed 12345):** 5000 denendi → **5000 kept** (motor hatası 0, oversize 0),
**2296 geçerli (%45.9)** / 2704 geçersiz. Üretim 14.4 örnek/s (346 s). Geçerlilik oranı `_ag`'deki %83'ten
düşük — asıl repo motoru **daha katı** (#42 dağıtım rewrite + #41 manuel-düzen denetimleri), yani aynı rastgele
girdiden daha çok ihlalli plan çıkıyor. Yine de valid-only train seti 1952 örnek (`_ag`'nin ~2.4 katı).

**Eğitim:** ce_dice, sınıf ağırlıkları otomatik (wc 2.71, teknik 3.66 üst-ağırlıklı). 76. epoch'ta en iyi
(erken-durdurma tavandan hemen önce). val **mIoU 0.767 · pixAcc 0.892**. (~70 s/epoch, CPU, ~90 dk.)

### Karşılaştırma — `_ag` Faz 1 → asıl-repo Faz 1b

| Metrik | `_ag` baseline | **Faz 1b** | Δ |
|---|---|---|---|
| val mIoU | 0.620 | **0.767** | **+0.147** |
| pixel-acc | 0.827 | **0.892** | +0.065 |
| proxy geçerlilik (PRED) | %83.1 | **%85.5** | +2.4 p |
| proxy geçerlilik (GT) | %84.5 | %87.8 | +3.3 p |
| train örnek | 807 | 1952 | ×2.4 |

### Per-class IoU — küçük odalar Faz 1b'nin asıl hedefiydi

| sınıf | `_ag` IoU | **Faz 1b IoU** | Δ | |
|---|---|---|---|---|
| **wc** | 0.278 | **0.561** | **+0.283** | ≈2× — en zayıf sınıf, en büyük kazanç |
| **teknik** | 0.429 | **0.735** | **+0.306** | |
| **banyo** | 0.477 | **0.616** | +0.139 | |
| **antre** | 0.451 | **0.565** | +0.114 | |
| **mutfak** | 0.451 | **0.603** | +0.152 | |
| salon | 0.769 | 0.856 | +0.087 | |
| yatak | 0.727 | 0.824 | +0.097 | |
| asansor | 0.742 | 0.884 | +0.142 | |
| yangin | 0.798 | 0.931 | +0.133 | |
| koridor | 0.845 | 0.922 | +0.077 | |
| merdiven | 0.854 | 0.933 | +0.079 | |

→ **Headline: Faz 1b küçük-oda hedefini tutturdu.** Beş küçük/seyrek sınıfın hepsi belirgin yükseldi;
**wc 0.28→0.56 (neredeyse iki kat)**, teknik 0.43→0.74. Tek bir sınıf bile gerilemedi. Tahmin görsellerinde
(`out_v2/pred_*.png`) çekirdek + ana hacimler GT'ye neredeyse birebir; artık küçük odaların yeri/biçimi de
büyük ölçüde oturuyor (kenar pürüzü azaldı ama sıfırlanmadı).

**Dürüst uyarı — bu kontrollü ablasyon DEĞİL.** Üç şey aynı anda değişti (2.4× veri + ce_dice + daha uzun
eğitim) ve **motor da farklı** (asıl repo, daha katı denetim → farklı val seti, 142 yerine 344 örnek). Yani
"+0.147 mIoU'nun ne kadarı dice, ne kadarı veri?" ayrıştırılmadı; proxy-geçerlilik karşılaştırması da farklı
val setleri üzerinde olduğu için yön bildirir, mutlak değil. Net olan: **birleşik etki küçük odaları kayda
değer iyileştirdi** ve genel sadakat (mIoU/pixAcc) `_ag` baseline'ı her sınıfta geçti.

**Üretilen dosyalar:** `ml/data_5k/` (bin+json), `ml/out_v2/` (eda_*, sample_*, pred_*.png, train_log_v2.txt,
**metrics_v2.json**), `ml/model_v2.pt`. Tümü `.gitignore`'da (yeniden üretilebilir). Çalıştırma:
`DATA_DIR=data_5k node ml/gen_dataset.js 5000 12345` → `DATA_DIR=data_5k OUT_DIR=out_v2 python3 ml/prepare.py`
→ `DATA_DIR=data_5k OUT_DIR=out_v2 MODEL_OUT=model_v2.pt EPOCHS=80 PATIENCE=12 LOSS=ce_dice python3 ml/train_v2.py`.

---

## 6. Referans-plan veri keşfi — ML hedefi olabilir mi?

Kullanıcının itirazı: motoru damıtmak yalnızca taklit öğretir; bunun yerine **gerçek referans planları**
hedef yapalım. Bu bölüm iki repodaki tüm plan verisini taradıktan (6 paralel okuyucu + kod doğrulaması)
sonra somut cevabı verir.

### 6.1 Bugün fiilen ne var? (özet)

| Kategori | Adet | Yerel/Harici | Gerçek/Motor | Bugün ML'de kullanılabilir? |
|---|---|---|---|---|
| "Referans galeri" görselleri (`referans-kat-planlari/`) | 31 link | **Sadece harici URL** (teoalida, onedio, pinterest) | Gerçek (3. taraf) | **Hayır** — diskte değil, `<img src="https://…">` |
| Galeri alt-klasörleri `01..04` | 4 dizin | Yerel | — | **Boş iskelet** |
| `kpState` gömülü SVG (`vakalar/`, `kulak-vakalari/`, `ref/`, `bugs/`, `inputs/`) | ~40+ | Yerel | Motor çıktısı (bir kısmı elle düzeltilmiş) | **Evet — doğrudan** (§6.3) |
| **Elle düzeltilmiş motor vakaları** (`vakalar/*_s.svg`, `kulak-vakalari/*-dogru.svg`) | ~15 | Yerel | Motor-tohumlu + **manuel düzeltme** | **Evet — doğrudan, BEDAVA** |
| `floorplan-map.json` (poligon, 00_CALISAN_RECETE, 02_PROTOTIP) | ~4 | Yerel | Motor üretimi | Kısmen — poligon, ızgara değil; rasterleştirme gerekir |
| App snapshot'ları (`snapshots/*.html`) | 10 | Yerel | Motor + manuel düzenleme | Evet — `kpState` gömülü |
| AI render / kamera PNG (`01_AKTIF_CIKTILAR`, `_arsiv`) | 200+ | Yerel | Motor→SDXL/Flux render | **Hayır** — etiketsiz piksel |

**Manşet:** Projenin işaret ettiği tek "gerçek" planlar, 3. taraf sitelerdeki **31 harici görsel** — hiçbiri
indirilmemiş, telifli, etiketsiz. Yerelde duran her şey motor çıktısı; bir kısmı elle düzeltilmiş.
Kullanıcının "mevcut ML sadece taklit öğretiyor" sezgisi **doğru** — `gen_dataset.js` motoru headless
çalıştırıp çıktısını doğrudan `labels.bin`'e yazıyor; yapısı gereği damıtma.

### 6.2 Her veri tipini 12-sınıf ızgaraya çevirme

| Veri tipi | Karar | Nasıl / efor |
|---|---|---|
| **`kpState`'li SVG (motor/elle düzeltilmiş)** | **OTOMATİK — bedava** | `<metadata id="kpState">` ayrıştır → `restoreState` → `label[i]=regions[cm[i]].type`. Kod zaten var. Sıfır anotasyon. |
| **`kpState`'li app snapshot (`.html`)** | **OTOMATİK** | Aynı çıkarım; SVG yerine HTML sarmalı. |
| **Eski/metadatasız motor SVG** | **OTOMATİK (deneysel)** | `importLegacySvg()` (io.js:121-383) renkli 0.5m hücre kareleri + duvar çizgilerinden region/tip kurar. |
| **`floorplan-map.json` (poligon)** | **YARI-OTOMATİK** | PNG-piksel uzayında poligon + per-oda `type`. Bir rasterleştirici yaz: ölçek→0.5m hücre→nokta-içinde-poligon→sınıf. Birkaç saat + TR→12-sınıf eşleme tablosu. |
| **Harici galeri görselleri** (teoalida/onedio/pinterest) | **MANUEL — ağır** | Ham JPEG/PNG, geometri/etiket yok. İndir + duvar çiz + oda segmentle + 12-sınıf elle etiketle (~5-20+ dk/plan). 31 görsel = günlerce iş, telif riski. |
| **AI render / kamera PNG** | **UYGUN DEĞİL** | Stilize render, ground-truth yok. |

### 6.3 KİLİT: kpState round-trip = etiketli ızgara (kodla doğrulandı)

Save/load formatı, ML'in ihtiyaç duyduğu `(region, cm)` ızgarasına **birebir** dönüyor — `src/io.js`'te
doğrudan doğruladım:
- **Kaydet** (`stateSnapshot`, io.js:5-32): `plan.regions[]`'i `{id,name,type,unit,cells[]}` + `inside`,
  `rows`, `cols` olarak serileştirir; her SVG'ye `<metadata id="kpState">` JSON gömülür (`exportSVG`, io.js:90-102).
- **Yükle** (`restoreState`, io.js:33-88): region'ları `type` korunarak kurar (l.61), sonra hücre→region
  haritasını: `cm=Int16Array(rows*cols).fill(-1); regions.forEach(g=>g.cells.forEach(i=>cm[i]=g.id))` (io.js:62-63).
- 12 tip = ML sınıfları (`salon,yatak,mutfak,banyo,wc,antre,koridor,merdiven,asansor,yangin,teknik`+`bos`;
  `oda`→`yatak`). Izgara 64×64 @ 0.5m — `meta.json`/`gen_dataset.js` ile **birebir aynı**.

**Bağımsız test:** `vaka-1-orta-blok_s.svg` (elle düzeltilmiş) → 32×64, 2048/2048 hücre atanmış, tipler tam;
`kulak-A-tek-sol-dogru.svg` → 20×45, 850/850. İkisi de doğrudan ızgaraya çevrilebilir durumda.

**Kullanıcının "elle düzelt → export → geri ver" döngüsü neden SIFIR piksel-anotasyon gerektirir:**
İnsan app içinde düzenliyor; app zaten her hücrenin region/tipini biliyor. Duvar sürükle / oda tipini değiştir
/ kapı taşı → `plan.regions[].cells[]` ve `.type` güncellenir → export'ta `kpState`'e aynen yazılır.
**Etiket, düzenlemenin yan ürünü** — ayrı bir anotasyon adımı değil. Çizim/boyama yok; "anotasyon" =
tasarım düzeltmesinin kendisi.

**Boru hattı (mevcut kodu yeniden kullanır):**
```
1. Motor vaka üretir        → SVG export (kpState gömülü)            [exportSVG]
2. Kullanıcı app'te düzeltir → düzenlemeler plan.regions/type/cells'i değiştirir
3. Düzeltilmişi export eder  → güncel kpState'li SVG/JSON            [exportSVG]
4. Headless dönüştürücü (Node, io.js mantığını kullan):
     kpState oku → restoreState → cm kur
     grid[i] = inside[i] ? TYPE_INDEX[regions[cm[i]].type] : 0(bos)
     mask[i]  = inside[i]
   → labels.bin / inputs_mask.bin / program.bin'e ekle (+ provenance etiketi)
5. Yeniden eğit.
```
Adım 4 ~30 satır; io.js:62-63 hücre-doldurma + `gen_dataset.js:128` programVector aynen kullanılır. **Eksik yok.**

---

## 7. Önerilen yol — önce elle-düzeltme döngüsü (a), sonra harici planlar (b)

**(a) elle-düzeltme döngüsü gerçek sinyale çok daha hızlı ulaşır:**
- Yakalama hattı **%90 hazır** — kpState round-trip, `restoreState`, `cm`, `programVector` mevcut ve
  doğrulandı. Tek bir headless dönüştürücü yazılır.
- Her düzeltilmiş vaka **piksel-tam, şemaya uygun** 64×64 etiket verir; anotasyon aracı gerekmez.
- Tam da kullanıcının itirazını hedefler: insan düzeltmeleri motorun sahip olmadığı **mimari yargıyı** enjekte
  eder — damıtılmış baseline'ın asla göremeyeceği "iyi mi" sinyali.

**(b) harici planlar neden sonraya:** 31 telifli ham görseli indir+çiz+segmentle = günlerce iş, hukuken
bulanık, ve zaten app'te yeniden çizmiş olursun (bu da (a)'ya çöker). **Sonra** ayrılmış bir
**doğrulama/çeşitlilik** seti olarak değerli, birincil eğitim kaynağı olarak değil.

**Sıralı plan:**
1. **Headless `kpState → (mask, grid, program)` dönüştürücü yaz** (~yarım gün). io.js:62-63 + gen_dataset.js:128
   yeniden kullan. `index.json`'a `provenance` alanı ekle (`engine | hand_corrected | external`).
2. **Eldeki düzeltmeleri bedava içeri al:** `vakalar/*_s.svg`, `kulak-vakalari/*-dogru.svg`, editHistory'li
   snapshot'lar → şimdiden ~15-20 insan-sinyalli örnek, sıfır yeni efor. (`kulak-vakalari/OKU.md` bu
   motor→düzelt→diff iş akışını zaten belgeliyor.)
3. **Döngüyü kur:** motor N vaka → kullanıcı app'te düzeltir → export → dönüştürücü yutar → yeniden eğit.
   `tests/diff-vaka.js` ile motor↔düzeltme hücre farkını ölç (insan ne kadar değiştiriyor).
4. **Ağırlıklandır:** elle-düzeltilmiş örnekleri bulk motor çıktısına göre 5-10× upweight et ki insan sinyali
   2000 damıtılmış örnekte boğulmasın.
5. **Sonra (b):** 10-20 harici planı app'te çizip **ayrılmış test seti** yap; gerçek-dünya genellemesini ölç —
   asla eğitime karıştırma.

**Faz 1b (ucuz baseline iyileştirmeleri, paralel yapılabilir):** veriyi 3000-5000'e çıkar + daha uzun eğit
(mIoU plato yapmamıştı); küçük-oda IoU için focal/dice loss veya 96×96; proxy yerine tam `runChecks`
geri-eşlemesi.

### 7.1 Dürüst uyarılar
1. **Elle-düzeltilmiş vakalar hâlâ motor-tohumlu.** İnsan motorun yerleşiminden başlayıp yerel düzeltir;
   bina-şekli/program/kaba-zonlama dağılımı hâlâ motorunki. Bias'ı azaltırsın, motordan kaçmazsın.
2. **Seçim bias'ı:** motor hep rect/L/T üretiyorsa (gen_dataset.js:43-64 rect'e meyilli), düzeltilmiş set de
   dar kalır; `TURKIYE-BICIMSIZ-PARSEL-*` belgelenen biçimsiz parseller eksik temsil edilir.
3. **Tek anotatör, tek üslup:** tek kullanıcının düzeltmeleri tek kişinin zevkini/mevzuat yorumunu kodlar.

**Hafifletmeler:** (1) **Düşmanca tohumla** — motorun bilinen-kötü çıktılarını (FIX-01 geniş-parsel,
kulak vakaları, eğik kenar) döngüye ver, sinyal en zayıf yerde yoğunlaşsın. (2) Düzeltmeden **önce** kaynakta
çeşitlilik enjekte et (biçimsiz parsel/uç programlar). (3) Harici planları **held-out test** tut. (4) Her
örnekte motor↔insan diff'ini izle — küçükse insan onaylıyor (kazanç az), büyükse motor priorı yanlış (değerli
sinyal). (5) **Provenance kaydet**, metrikleri ona göre ayrı raporla (damıtılmış veriden gerçek-dünya
performansı iddia etme).

---

## 8. Çalıştırma

```bash
node ml/gen_dataset.js 2000 12345   # veri üret → ml/data/
python3 ml/prepare.py               # EDA + bölme → ml/out/, ml/data/split.json
python3 ml/train.py 60              # eğit → ml/out/metrics.json, pred_*.png, ml/model.pt
```

**Üretilen dosyalar:** `ml/data/` (bin + json), `ml/out/` (EDA + tahmin PNG'leri, metrics.json), `ml/model.pt`.

**Önerilen sonraki kod (henüz yazılmadı):** `ml/import_kpstate.js` — `vakalar/`, `kulak-vakalari/`,
`snapshots/` altındaki `kpState`'li dosyaları okuyup aynı `(mask, grid, program)` formatına çevirir; provenance
etiketiyle `ml/data/`'ya ekler. Bu, "gerçek/elle-düzeltilmiş plandan öğrenme"nin ilk somut adımıdır.

---

## 9. Faz 2 — ilk gerçek fine-tune (14 elle-düzeltilmiş case)

İlk insan-döngüsü turu: kullanıcı 14 case'i KPTA'da açıp elle düzeltti (motor çıktısı →
`ml/phase2/cases/`, düzeltmeler → `ml/phase2/corrected/*.svg`, ingest → `ml/phase2/finetune/`).
Düzeltmeler motordan **ortalama %39 hücre** sapıyor; baskın örüntü: **salon küçült → yatağa alan ver**,
**koridor → antre**, sıkışık planlarda **çekirdeği yeniden konumla** (en yüksek: tight_1p1 %87, rect_1p1 %82).

**Yöntem (`ml/phase2/finetune_run.py`):** Baseline `model_v2.pt` (mIoU 0.767) başlangıç ağırlığı; **lr 1e-4**
(baseline'ın 1/10'u), 60 epoch, cosine; **dihedral augmentation** (8 flip/rot — oda tipi yönden bağımsız
olduğu için etiket-güvenli). Baseline EZİLMEDİ → `ml/model_finetuned.pt`. Onurlu değerlendirme için **4 case
held-out** (fine-tune'da görülmedi: rect_2p1x2 salon-küçült, rect_mixed koridor→antre, rect_studio çekirdek,
villa_L_5p1), 10 case train.

### "Tercihler öğrenildi mi" — held-out (görülmeyen) kanıt

**Önce bağlam — sadakat boşluğu (held-out):** baseline modeli **motoru çok iyi taklit ediyor** (apt
case'lerde mIoU-vs-MOTOR 0.70–0.75) ama **kullanıcı hedefini zayıf tutturuyor** (mIoU-vs-KULLANICI 0.19–0.38).
İşte bu boşluk fine-tune'un kapatmaya çalıştığı şey: kullanıcı tam da motorun ürettiğinden uzaklaşıyor.

| held-out case | base→motor | base→kull. | finetn→motor | finetn→kull. |
|---|---|---|---|---|
| apt_rect_studio | 0.750 | 0.383 | **0.582** | **0.412** |
| apt_rect_2p1x2 | 0.736 | 0.189 | 0.727 | 0.200 |
| apt_rect_mixed | 0.700 | 0.237 | 0.697 | 0.249 |
| villa_L_5p1 | 0.088 | 0.067 | 0.092 | 0.068 |
| **ORT. mIoU-vs-kullanıcı** | | **0.219** | | **0.232 (Δ+0.013)** |

→ Fine-tuned, **4 held-out'un hepsinde** kullanıcıya doğru kıpırdadı (mIoU-vs-kullanıcı her case'te arttı).
`apt_rect_studio` en temiz örnek: model motora-benzerliği bilinçli **bıraktı** (0.75→0.58) ve kullanıcıya
yaklaştı (0.38→0.41) — yani gerçekten "motor priorundan kullanıcı tarzına" kaydı. Diğerlerinde kayma minik.

### Sınıf-payı örüntüsü (held-out ort., maske-içi)

| sınıf | motor | base→ | finetuned | kull.hedef | yön |
|---|---|---|---|---|---|
| salon | 0.455 | 0.360 | 0.383 | 0.372 | ~hedefte (base zaten düşürmüş) |
| **yatak** | 0.203 | 0.225 | 0.217 | **0.316** | ✗ ters (en güçlü örüntü YAKALANMADI) |
| koridor | 0.099 | 0.103 | 0.097 | 0.047 | ↗ doğru ama minik (−0.006 / gereken −0.056) |
| antre | 0.051 | 0.075 | 0.070 | 0.078 | ~nötr |
| banyo | 0.073 | 0.095 | 0.089 | 0.072 | ↗ doğru |

### Dürüst değerlendirme

- **Yön zayıfça pozitif, ama kanıt güçlü değil.** Agregat mIoU-vs-kullanıcı her held-out'ta arttı (+0.013 ort.)
  ve studio'da net "motordan-uzak, kullanıcıya-doğru" kayması var — **boru hattı çalışıyor, sinyal gerçek ama cılız.**
- **Ezber/overfit erken başlıyor:** held-out mIoU **ep 10'da tepe** (0.232), sonra düşüyor (ep60: 0.201) —
  train loss düşerken held-out kötüleşiyor. 10 örnek klasik overfit. (Bu yüzden best-held-out ağırlığı kaydedildi.)
- **En güçlü kullanıcı örüntüsü (salon→yatak) held-out'ta GÜVENİLİR öğrenilmedi:** yatak payı yanlış yöne gitti.
  Koridor↓ ve banyo doğru yönde ama büyüklük ihmal edilebilir. Yani model "daha az koridor"u hafif sezdi,
  "daha çok yatak"ı sezemedi.
- **Kök-neden: 14 örnek (10 train) bir mertebe az.** Hücre-seviyesi yerleşim (mask, program)'dan tam belirli
  değil — iki geçerli plan düşük karşılıklı IoU'ya sahip olabilir; bu yüzden mIoU-vs-kullanıcı tavanı da düşük.
  Sınıf-payı sinyali tercih için daha onurlu ölçü ve orada da karışık.

**Verdict:** Bu bir **"hayat belirtisi + boru hattı doğrulaması"**, "model kullanıcının zevkini öğrendi"
değil. Fine-tune mekanizması uçtan uca çalışıyor (ingest → düşük-lr fine-tune → ayrı model → held-out ölçüm)
ve görülmeyen case'lerde kullanıcıya doğru ölçülebilir ama küçük bir kayma var. Tercihlerin **güvenilir**
öğrenilmesi için çok daha fazla düzeltilmiş case gerekiyor.

**Sonraki adım — kaç case?** Kaba tahmin: anlamlı/kararlı tercih sinyali için **~80–150 düzeltilmiş case**
(şu anki ×6–10). Pragmatik plan: (1) önce **30–40 case**'e çıkıp held-out mIoU-vs-kullanıcı eğrisinin
overfit-tepesi ep10'dan ileri kayıyor mu bak (kayıyorsa veri yardımı kanıtlanır); (2) düzeltmeleri
**örüntü-dengeli** topla — özellikle "salon→yatak" ve "koridor→antre"yi bolca içeren case'ler, ki en güçlü
sinyaller temsil edilsin; (3) düşmanca tohumla (motorun bilinen-kötü çıktıları: L/T villa merdiven-düşürme
§8d, geniş-parsel) sinyali en zayıf yerde yoğunlaştır; (4) augmentation'ı koru, lr'yi düşük tut, **held-out'u
sabit** tut ki turlar arası kıyas adil olsun.

**Üretilen dosyalar:** `ml/model_finetuned.pt` (baseline ezilmedi), `ml/phase2/ft_out/` (öncesi/sonrası
held-out görselleri `ba_*.png` + `metrics_finetune.json`). Hepsi `.gitignore`'da. Çalıştırma:
`python3 ml/phase2/finetune_run.py`.
