# Kulak (çıkıntı) kalibrasyon vakaları

Otomatik kulak-algılamayı kalibre etmek için 6 footprint. Hepsi **apartman, 5 kat, 2 × 3+1 daire**.

## Nasıl kullanılır
1. Araçta **"SVG içe aktar"** → ilgili `.svg` dosyasını seç. Footprint + motorun ŞU ANKİ otomatik yerleşimi gelir.
2. **İdealini çiz** kendince: çekirdeği (Yapı 🏗 katmanıyla) istediğin kulağa/yere taşı-boyutlandır, oda duvarlarını sürükle, kapıları düzelt.
3. **"SVG indir"** → bana geri ver. (İndirilen SVG durumu içinde taşır; aynen geri yüklenir.)

İdealinle motorun çıktısını karşılaştırıp kuralları ona göre ayarlayacağım.

## Vakalar ve merak ettiklerim

| Dosya | Footprint | Motorun şu anki davranışı | Sana sorum |
|---|---|---|---|
| **kulak-A-tek-sol** | tek sol kulak (2,5×5), 20×10 gövde | merdiven+yangın sol kulak, asansör ağızda | Asansör de kulağa mı girmeli, yoksa gövde-ağzı doğru mu? |
| **kulak-B-ust-orta** | üst kulak (5×2,5 ortada) | çekirdek üst kulakta | Üst kulağa çekirdek mantıklı mı, yoksa kulak başka işe mi? |
| **kulak-C-asimetrik** | sol büyük + sağ küçük kulak | merdiven sol, yangın büyümüş, asansör sağ, teknik | Eleman→kulak eşlemesi doğru mu? |
| **kulak-D-uzun-tek-uc** | UZUN 28×8 + tek kulak | **kaçış>27m → banda düştü** (kulak boş, dev ORTAK DEPO, 45m² hol) | İdeal ne? Çekirdeği kulağa toplayıp 2. merdiveni öbür uca mı? Küçük hol? |
| **kulak-E-genis-iki-kulak** | GENİŞ 30×10 + iki uçta kulak | merdiven+yangın büyümüş, iki kulakta | İki uçta çekirdek + uzun hol kabul mü? |
| **kulak-F-cift-sol** | iki kulak AYNI tarafta (sol) | çekirdek solda kümelenmiş | Hol burada küçülmeli mi? (kümelenmiş çekirdek = Faz 5b) |

Üreten script: `tests/gen-kulak-vakalari.js` (footprint eklemek istersen oradan).
