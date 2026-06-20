# Kat Plani Tasarim Araci

Tarayicida calisan kat plani tasarim uygulamasi. Ana kabuk `kat-plani-tasarim.html`, davranis katmanlari ayri JS/CSS dosyalarindadir.

Uygulama, Turkiye mevzuat kontrollerini de gosteren sematik apartman/villa kat plani uretir. Bina siniri, parsel, balkon, cekirdek, oda duvari duzenleme, SVG/PNG disari aktarma ve SVG durum geri yukleme desteklenir.

## Calistirma

Tarayicida `index.html` dosyasini acin. Bu dosya ana uygulamaya yonlendirir.

## Testler

Node 20+ ile:

```bash
npm test
```

Ek kontroller:

```bash
npm run test:syntax
npm run test:smoke
npm run test:diagnostics
```

`npm test`, uygulama scriptlerini HTML'deki sirayla otomatik olarak `.test-tmp/app.js` konumunda birlestirir ve testlere `APP_JS` ile verir.

## Proje Yapisi

- `kat-plani-tasarim.html`: uygulama kabugu ve arayuz iskeleti.
- `core.js`: DOM'dan bagimsiz sabitler, mevzuat degerleri ve geometri yardimcilari.
- `app.js`: uygulama durumu, daire tipi UI'i, villa katlari ve cekirdek kilidi yardimcilari.
- `planner.js`: footprint, cekirdek, hol, daire ve oda yerlesimini ureten ana plan motoru.
- `doors.js`: otomatik/elle kapilarin aday kenarlarini, secimini ve vurus alanlarini hesaplar.
- `walls.js`: oda/daire siniri duvarlarini, metrikleri ve geri alinabilir hucre anlik goruntulerini yonetir.
- `structure.js`: merdiven/asansor/teknik/yangin cekirdegi ve bina siniri duzenleme katmani.
- `rooms.js`: antre inceltme, oda ekleme/silme/takas/bolme ve sag tik oda menusu.
- `render.js`: odaklama, yüzen daire tablosu ve SVG plan cizimi.
- `checks.js`: mevzuat/uygunluk denetimlerini toplar ve yan panelde gosterir.
- `interaction.js`: cizim, parsel, balkon, kapi, duvar, arac cubugu ve zoom etkilesimi.
- `io.js`: durum anlik goruntusu, SVG/PNG disari aktarma ve SVG/JSON ice aktarma.
- `mobile.js`: dokunmatik jestler, mobil cekmece ve mobil tablo baslangici.
- `boot.js`: tum katmanlar yuklendikten sonra ilk render'i baslatir.
- `styles.css`: uygulama stili ve mobil/dokunmatik duzen kurallari.
- `tests/`: Node tabanli basliksiz test ve tani araclari.
- `kulak-vakalari/`, `vakalar-2/`: kalibrasyon ve geri oynatim fixture dosyalari.
- `snapshots/`: eski calisma anlari ve geri donus noktalaridir.
- `DEVIR-NOTU.md`: ayrintili teknik devir ve karar gecmisi.

## Gelistirme Notlari

Sonraki buyuk mimari hedef, `planner.js` icindeki buyuk `generate()` akisini daha kucuk saf yardimcilara ayirmaktir. Yeni davranis eklemeden once `npm test` calistirin; geometri veya kapasite davranisi degistiyse `npm run test:smoke` ciktilarini da gozden gecirin.
