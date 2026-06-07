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
