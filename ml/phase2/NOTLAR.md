# KPTA — ML / motor devir notları (akılda tutulanlar)

> Bu dosya, konuşma sırasında kararlaştırılan ama koddan/gitlog'dan görünmeyen
> yön ve bekleyen işleri kalıcılaştırır. Tarihler mutlak. (Claude'un özel
> memory'sinin görünür kopyası — burada herkes okuyabilir.)

## 1. Zemin kat — apartman holü giriş kapısı kuralı  [UYGULANDI 2026-07-01]
- **Kural:** Zemin katta apartman holü bina DIŞ sınırına değmeli; yoksa apartman/bina
  giriş kapısı (holü → sokak) yerleştirilemez.
  - katAyri (katları ayrı planla) **AÇIK** + zemin katı (floor 0) + holü değmiyor → **KIRMIZI (bad)**.
  - katAyri **KAPALI** (tek tip kat zemini de temsil eder) + holü değmiyor → **yumuşak (info)**.
  - Üst katlar (floor > zemin) ve villa → **MUAF**.
- **Kod:** `checks.js` → `collectGroundEntranceCheck(add, p, ground, ayri)`; `collectChecks`
  içinden çağrılır. ground = `!floorsOn() || activeFloor===zeminIdx()`, ayri = `floorsOn()`.
- **Test:** `tests/zemin-giris.js` (run-all strict). io.js / WIP motor dosyalarına dokunulmadı.
- **Neden önemli:** konut zeminde giriş kapısı OTOMATİK konmaz (yalnız elle, dış cepheye —
  `interaction.js extEdgeNear`); ticari/otopark zeminde `gh` auto (`doors.js:98`, holü
  sınıra değmezse sessizce yok). Holü içeride kalırsa giriş kapısına yer yok.
- **Not (ML case'leri):** batch2 el-düzeltme case'leri katAyri=OFF + holü içeri çekilmiş
  (24 daire-case'inin ~20'si) → KPTA'da açılınca yumuşak info gösterir. ML datasını BOZMAZ.
  İleride ÜST-KAT ML batch'i üretirken katAyri=ON + floor>zemin ile üretilirse bu not hiç çıkmaz.

## 2. Self-training — uygulanan tasarımlardan  [İLERİDE]
- Motor, render'a giden veya indirilen her planı "kabul edilmiş/başarılı" sayıp eğitim
  datasına alabilir. **İSTİSNA: debug indirmesi** → datasına ALINMAZ (yanıltır).
- Gerekenler: (a) export/indir yoluna `render|download|debug` **intent etiketi** (io.js/mesken,
  ayrı iş); (b) kabul ≠ kusursuz → **zayıf-pozitif** ağırlık (güçlü sinyal = elle düzeltmeler);
  (c) model kendi çıktısıyla beslenirse **mod-çökmesi** → insan-düzeltme + dış gerçek planlarla KARIŞTIR.

## 3. Dış (telifsiz) kat planları  [İLERİDE]
- Kullanıcı telifsiz gerçek kat planları bulabilir → ama bizim formatımızda DEĞİL.
- Gerek: ayrı **tarayıcı/parse pipeline** (raster görsel → oda segmentasyonu → bizim region grid).
  Vektör-kernel yol haritasıyla örtüşür. El-düzeltme formatına KARIŞTIRMA; ayrı ingest yolu.

## 4. ML düzeltme felsefesi (etiketleme ilkesi)
- Kullanıcı mimar/inşaat müh. DEĞİL. Düzeltirken: (1) en adil daire dağılımı, (2) oda
  biçimlerini maksimum koru, (3) dairelere mümkün olduğunca çok ALAN (büyükşehir önceliği).
- Bu = ML'in öğrenmesi istenen "yumuşak hedef" (yerleşim kalitesi/alan verimi). Mevzuat
  sert-kısıtları (yangın/merdiven/zemin giriş) AYRI katman, denetimle (checks) zorlanır —
  ML estetik-hedefiyle karıştırma.

## 5. Batch iş akışı
- Plan: 150 yerine 20-30'luk batch'lerle ilerle.
- Batch-1: 14 case → ilk finetune yapıldı.
- **Batch-2: 25 üretildi (`cases_batch2/`) + 27 düzeltildi (`corrected_batch2/`, 2 alternatif
  varyant dahil) → finetune'a ingest edildi** (batch1+batch2 birleşik = 41 örnek).
- Sonraki: train.py'yi `finetune/`'a yönlendir + base `model.pt`'den düşük lr ile devam et.
- 3 villa case'inde apartman holü YOK (villa antre → cephe); bu beklenen.
