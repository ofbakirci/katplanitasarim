# Başsız test altyapısı

Tarayıcısız (Node) test: HTML'deki `<script>` çekilir, DOM stub'lanır, `generate()` çağrılır.

## Hazırlık (her testten önce)
```bash
python3 -c "
import re
html = open('../kat-plani-tasarim.html', encoding='utf-8').read()
js = re.search(r'<script>(.*)</script>', html, re.S).group(1)
open('/tmp/app.js','w',encoding='utf-8').write(js)
"
```
Testler `/tmp/app.js` okur (`wall-drag.js` ayrıca `APP_JS` ortam değişkeniyle farklı yol kabul eder).

## Dosyalar
- `harness2.js` — 6 standart senaryo + erişim denetimi (her oda antreye komşu mu, hücre bütünlüğü)
- `test6.js` — 21×18, 4×3+1 (çekirdek yanı daireler)
- `test9.js` / `test27.js` — geniş/derin bloklar (kol koridorlar)
- `test10.js` — stüdyo + 2+1 karışık bar (banyosuz daire denetimi)
- `test11.js` — aşırı programlı küçük bina (salon koruma)
- `big.js` — 250 m² dev daireler
- `mutfak-check.js` — tüm senaryolarda mutfak en/boy ölçüleri
- `wall-drag.js` — oda duvarı sürükleme: hücre bütünlüğü/bağlantılılık, donör korumaları, dragWallTo canlı denetim zinciri, Geri Al (duvar + ayırıcı, boş drag yazılmaz)
- `core-shadow.js` — ayırıcı ±4 m taranır: çekirdek gölgesine düşen yatak odası yutulmamalı (dikdörtgen katı, L-şekil bilgi amaçlı)
- `visual5.js` / `visualL.js` — SVG render üretir (`/tmp/plan*.svg`; cairosvg ile PNG'ye çevrilebilir)

Beklenen: FAIL yalnız dürüst kapasite raporları (aşırı program), NO-DOOR/erişimsiz/banyosuz = 0.

DİKKAT (2026-06-10): bu makinede `/tmp/app.js` başka kullanıcıya ait kilitli çıkabilir —
o durumda `$HOME/app.js` gibi farklı yola yazıp test KOPYASINDA yolu sed ile değiştirin
(testlerin kendisi değiştirilmez; bkz. DEVIR-NOTU "Test altyapısı").

## Kendi kendine yeten testler (/tmp/app.js gerekmez — `node tests/<dosya>.js`)
- `antre-slim.js` — antre inceltme: kompaktlık (≤ max(6 m², daire %14)), ince çıkıntı yok, erişim, bütünlük (3 senaryo). (51)
- `etiket.js` — oda tipi değiştir / takas / böl / antreyi uzat + geri al + korumalar. (31)
- `room-edit.js` — oda sil/ekle/geri al, bütünlük, spec kopyası, korumalar, villa, EB. BANYO, tek daire/kat (5 ve 12 kat). (55)
- `oda-hint.js` — hint'li/hintsiz addRoom, yön denetimi, EB. BANYO çift koruması. (13)
- `import.js` — snapshot→restore gidiş-dönüş (bölge imzası birebir) + komb işaretleri;
  2. bölüm eski-SVG geometri çözümleyici (`npm i linkedom` ister, yoksa kendini atlar). (9+)

## v22 vaka/tanı araçları (kendi kendine yeter; assert az, çıktı GÖZLE değerlendirilir)
- `diff-vaka.js` — `node tests/diff-vaka.js vakalar/vaka-1-orta-blok` → orijinal vs `_s`
  (elden geçmiş) SVG'nin gömülü durumundan oda bazında diff (alan/bbox/taşıma/doluluk).
  Daire toplamı aynıysa "fark daire İÇİ" notu düşer (en değerli sinyal).
- `v22-test.js` — `node tests/v22-test.js vaka-1-orta-blok [vaka-2-genis-sig ...]` →
  vakanın GİRDİLERİYLE motoru yeniden koşar; mutfak/salon/yatak alanları + dış cephe
  teması + bad ihlal listesi. Motor ayarı sonrası vaka taban karşılaştırması için.
- `villa-test.js` — 14×11 villa, 4..8 yatak: orta sofa planı monotonluk (istek artınca
  yerleşen azalmamalı) + oda listesi + ihlaller.
- `antre-test.js` — vaka-3 D3'te antre eritilip alttan sağ tıkla +ANTRE: yeni antre
  koridora komşu ve cepheye dokunmuyor olmalı (✓/✗ basar).

Beklenen taban (2026-06-10 v5): vaka-1/2/5 bad=0; vaka-3 bad=3 (2 bilinçli yatak
penceresiz + %54 mutfak biçimi, eşiğe 1 hücre); vaka-4 bad=1 (bilinçli). Villa 14×11
5+1: 5/5 yatak + eb. banyo köşede, bad=0; 6/7/8 istek → 6 (monotonik). Bozulursa regresyon.
