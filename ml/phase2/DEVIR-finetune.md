# DEVIR NOTU — batch2 finetune (yeni session burayı kaşı)

Tarih: 2026-07-01. Kısa, eylem-odaklı. Detaylı bağlam: `ml/phase2/NOTLAR.md`.
KISIT: io.js / uygulama / motor WIP'ine (app/doors/planner/rooms/interaction/structure)
DOKUNMA — bu iş tamamen `ml/` altında okur/yazar.

## Şu ana kadar yapıldı
- batch2: 25 case üretildi (`cases_batch2/`) + kullanıcı 27 düzeltdi (`corrected_batch2/`,
  2 alternatif varyant dahil). Hepsi `kpState` taşıyor, round-trip OK.
- ingest yapıldı → `ml/phase2/finetune/` = **41 örnek** (14 batch1 `corrected/batch1/` +
  27 batch2). 35 apartman + 6 villa. Komut:
  `python3 ml/phase2/ingest.py ml/phase2/corrected/batch1 ml/phase2/corrected_batch2`
- (Ayrı iş) zemin-kat apartman giriş kuralı motora eklendi: `checks.js
  collectGroundEntranceCheck` + `tests/zemin-giris.js`. Bu finetune'dan BAĞIMSIZ, bitti.

## YAPILDI 2026-07-01 — finetune koştu, kaçırma noktaları düzeltildi
1. **Finetune 41 örnekle koştu** (`ml/model_finetuned.pt` yeniden üretildi). Held-out 8'e
   çıkarıldı: 4 batch1 (önceki koşuyla kıyas sabit) + 4 batch2 (genelleme ölçümü). Train 33.
2. **Kaçırma noktaları düzeltildi** (`finetune_run.py`):
   - `HELDOUT_NAMES`'e 4 batch2 case eklendi (kapalı/açık hol + L/T/rect + villa çeşitliliği).
   - Ölü `N_HELDOUT=4` kaldırıldı; bayat docstring (14→41) güncellendi; "4 case" başlığı dinamik.
   - `engine_label()` artık batch2 referansını `cases_batch2/`'den de okuyor (yoksa FileNotFound).

## SONUÇ: EZBER, genelleme YOK (önemli bulgu)
- Held-out mIoU **ep5'te tepe (0.242), sonra sürekli düşüş → 0.188** = klasik overfit.
  Kaydedilen best base'e göre **Δ+0.003** (gürültü). train loss 6.8→3.8 inerken genelleme bozuldu.
- Öğretilmek istenen örüntü **TERS**: salon base 0.329→ft 0.347 (hedef 0.307, azalmalıydı);
  yatak base 0.262→ft 0.249 (hedef 0.359, artmalıydı). "salon küçült/yatak büyüt" tersine döndü.
- Görsel (`ft_out/ba_*.png`): FINETUNED ≈ BASE, lekeli/dikdörtgen-olmayan; USER-corrected
  tertemiz dikdörtgen — model oraya yaklaşmıyor.
- **Teşhis:** 33 örnek küresel alan-dağıtım tercihi için çok az + raster-piksel U-Net bu
  YAPISAL tercih için yanlış araç (vektor-kernel-roadmap tezini doğrular). Model leke üretiyor.

## SIRADAKİ KARAR (kullanıcı (c)'yi onayladı — vektor-kernel yönü)
- (a) Veri toplamaya devam (batch3+) — ama ep5-overfit eğrisi raster'da getiri tavanı düşük olabilir.
- (b) Güçlü regülarizasyon / küçük model / ağır augmentation — mevcut veriden daha fazlasını sık.
- (c) **SEÇİLDİ.** Temsili değiştir = bölge-seviyesi öznitelikler üzerinde öğren, 64×64 piksel değil.

## (c) CAN ALICI ÖN-TEST YAPILDI 2026-07-01 → SİNYAL VAR (kanıtlandı)
`ml/phase2/region_signal.py` (motora dokunmaz; cases ↔ corrected çiftlerini bölge-özniteliğine
çevirip motor→düzeltilmiş delta + tutarlılık ölçer). 39 çift (2 alt-varyant motor-orijinali yok).
Bulgu: RASTER'da kaybolan tercih, BÖLGE-uzayında %82-92 TUTARLI — kullanıcı felsefesine birebir:
| öznitelik | Δort | aynı-yön | |
|---|---|---|---|
| dairelere giden pay | +0.090 | **%92** | dairelere maks alan |
| yatak payı | +0.087 | %85 | |
| koridor payı | −0.067 | %85 | dolaşım israfını kes |
| oda dikdörtgenliği | +0.059 | %85 | oda biçimini koru |
| dolaşım payı (antre+koridor) | −0.043 | %82 | |
| salon payı | −0.033 | %69 (zayıf) | |
| daire-alan eşitsizliği CV | −0.082 | %59 (gürültülü, ama ort. adil yönde) | |
GÜÇLÜ: yatak/koridor/circ/dwelling/rect. ZAYIF: salon, unit_cv. Çıktı: `region_signal.json`.
**Sonuç:** raster U-Net başarısızlığı temsil sorunuydu, tercih öğrenilemez değil. (c) doğrulandı.

## (c) SIRADAKİ ADIM (henüz yapılmadı — büyük faz, motora dokunabilir)
Tercih = tutarlı bir bölge-dönüşümü: koridoru kes → yatak/daireye dağıt, dikdörtgenleştir, daireleri dengele.
Seçenekler: (i) motor post-process heuristic (üret→koridor alanını komşu yatağa ver, rektifiye) —
  MOTORA dokunur, bu session kapsamı dışı; (ii) bölge-öznitelik regresörü (program+motor-öznitelik →
  hedef-öznitelik) sonra layout sentezi. Karar + tasarım gelecek session'a.

## Bilinmesi gerekenler
- torch 2.8 kurulu, çalışmaya hazır.
- `*.pt` ve `finetune/`, `ft_out/`, `preview/` gitignore'da (yerel, regenerable).
  `cases_batch2/`, `corrected_batch2/`, `NOTLAR.md`, bu dosya repoda KALICI.
- Kullanıcı mimar değil — düzeltme felsefesi: adil dağılım + oda biçimi koru + dairelere
  maks alan. Mevzuat sert-kısıtları (zemin giriş vb.) ML hedefinden ayrı, checks ile.
- Sonraki batch'lerde ÜST-KAT case'leri katAyri=ON + floor>zemin ile üretilirse zemin-kat
  giriş uyarısı onlarda hiç çıkmaz (şimdi katAyri=OFF üretildikleri için açılınca yumuşak
  info gösteriyorlar — zararsız).
