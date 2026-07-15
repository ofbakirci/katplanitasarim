# Devir Notu — TKGM Parsel özelliği

> **TARİHSEL NOT (2026-07-15):** Bu 2026-06-23 tarihli bir devir notudur. TKGM parsel
> özelliği `598763b` ile **master'a merge edildi**; "PR aç / master'a merge" açık işi
> TAMAMLANDI. Aşağıdaki "merge edilmedi" ifadeleri tarihsel bağlamdır.

**Branch:** `worktree-ozellik-deneme` · master'a **merge edilmedi** (bilerek; deneme dalı) · güncelleme 2026-06-23.

## Bu dalda ne var (commit sırası)
1. `ef23308` Koordinat / Google Maps linki → TKGM CBS nokta-sorgusu → gerçek parseli **arsa** olarak yükle
2. `773598b` İmar çekme (yapı yaklaşma) sınırı + canlı TAKS / bahçe okuması
3. `c13cda8` Elle il / ilçe / mahalle + ada / parsel ile sorgu
4. `bcaa1e1` Uydu arka planı (Esri World Imagery)
5. `a4f5a00` **Parsel döndürme + ızgaraya oturma + parsele yapışma + gerçek kuzey pusulası**

## Kod haritası
- `parsel.js` — sorgu + rotasyon / snap motoru: `tkgmParseLatLng`, `tkgmGeoToWorld`, `tkgmLoadParcel`, `psAutoAngle` (min-alan dikdörtgen açısı), `psReproject`, `psRotateTo(deg, snap)`, `psSnapParcelGrid`, `psSnapTarget`, `psUpdateSatellite`
- `render.js` — uydu döndürme (`transform=rotate`, pivot dx,dy) + kuzey pusulası (sol-alt; export'ta sol-üst)
- `interaction.js` — `snapPoint` bina çizimini parsel / çekme köşe & kenarına yapıştırır (15° kilidini ezer)
- `io.js` — `parcelRot` kaydet / geri yükle; `restoreState` parselde imar panelini açar + setback hesaplar
- `app.js` — `parcelRot` global · `kat-plani-tasarim.html` + `styles.css` — döndürme paneli (`#psImar`)

## Çalıştırma
```bash
npm test                      # 17 test geçmeli
npm run test:syntax
python3 -m http.server 8000   # tarayıcıda kat-plani-tasarim.html
```

## Açık işler
- (a) PR aç / master'a merge
- (b) Uyduyu XYZ tile ile keskinleştir (Esri export ~0,30 m/px'te 500 veriyor, küçük parselde yumuşak)

## Tuzaklar (önemli)
- **TKGM fetch'te `referrerPolicy:'no-referrer'` ŞART** — WAF tanımadığı Referer'ı 403'ler. Koordinat sırası **enlem / boylam** (ters → 404).
- `tkgmGeoToWorld`: WGS84 → yerel metre düzlemi, kuzey yukarı (`y = (lat0 − lat) · mLat`).
- Parsel kuzey-yukarı **saklanmaz**: döndürülmüş `parcelPts` saklanır, `psProj.rot` kuzeyden mutlak açıyı tutar. Slider değeri = kuzeyden açı (düz konum genelde 0 değildir; "Kuzey ↑" = gerçek yön).
- Izgaraya oturma yalnız eksen-hizalı işlemlerde (`snap=true`: yükleme / Otomatik hizala / Kenara çevir); serbest slider snap'lemez.
- JS düzenleyince tarayıcı dosyaları **tutarsız** tazeliyor → hard reload veya portu artır.
- `getBoundingClientRect` bazı başsız ortamlarda 0 → `fitView` pxPerM'i kırpar; testte zoom / pan'i elle ver.
