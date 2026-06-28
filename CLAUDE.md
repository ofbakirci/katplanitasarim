# CLAUDE.md — KPTA proje kuralları (her oturumda oku)

Bu repo **KPTA** (Kat Planı Tasarım Aracı). Detaylı devir notu: `Claude_instructions/DEVIR-NOTU.md`.
3D render iş kolu: `mesken/` (kendi `DURUM.md`'si var = tek doğru kaynak).

---

## ⚠️ EN ÖNEMLİ KURAL — Değişiklik nereye yazılır

**Ortak motor (kadraj, export, oda yerleşimi, duvar, çizim, mevzuat) = KPTA kaynağı. Mesken prototip'e ELLE dokunma.**

Mimari (doğrulanmış 2026-06-26):

| Katman | Dosya(lar) | Ne |
|---|---|---|
| **Kaynak** | `*.js` (kökte: `io.js`, `render.js`, `walls.js`, `rooms.js`, `planner.js`, `parsel.js`, `structure.js`, `doors.js`, `interaction.js`, `app.js`, `core.js`) + `styles.css` | **TÜM motor mantığı burada. Değişiklik HEP buraya.** Kabuk: `kat-plani-tasarim.html`. |
| **Build** | `kat-plani-tasarim.tekdosya.html` | `npm run build` (`tools/bundle.js`) üretir — kabuk+css+js tek dosyaya inline. **Elle düzenleme.** |
| **Mesken prototip** | `mesken/MESKEN-prototip.html` | `npm run build` → `postbuild` → `mesken/build-prototip.js` OTOMATİK üretir; tekdosya motorunu **içine gömer** + mesken-özel görsel/kamera ekler. **Elle DOKUNMA.** |

### Akış
```
io.js / render.js  (kaynağı düzelt)
        │  npm run build
        ▼
kat-plani-tasarim.tekdosya.html   (bundle.js)
        │  postbuild (KPTA_SKIP_REBUILD=1)
        ▼
mesken/MESKEN-prototip.html        (build-prototip.js: motoru gömer + kamera/render demoları ekler)
```
**Sonuç:** KPTA motorunda yaptığın değişiklik `npm run build` ile **otomatik** Mesken prototip'e iner.
Tek yapman gereken: kaynağı düzelt → `npm run build`. Mesken prototip'i elle düzenlersen build onu EZER.

### İstisna — sadece Mesken'e ait olanlar
Kamera datası export'u, 3D render demoları (`view_cam*.jpg`, `FINAL_v3_clean.jpg`), yürüyüş UI, demo SVG'leri →
bunlar KPTA'da YOK, sadece `mesken/build-prototip.js` + `mesken/02_PROTOTIP/prototip.template.html` katmanında.
"Kamera datası export'u" gibi mesken-özel bir şey eklenecekse oraya yazılır (KPTA'ya değil).

### Karar kuralı (aksi söylenmedikçe)
- Değişiklik **plan motorunu** ilgilendiriyorsa (export, kadraj, oda, duvar, mevzuat, çizim) → **KPTA kaynağı** + `npm run build`.
- Değişiklik **sadece 3D render/kamera/yürüyüş** katmanını ilgilendiriyorsa → `mesken/build-prototip.js`/template.
- Emin değilsen: motor mu yoksa render-sunum mu? Motorsa KPTA. Kullanıcı açıkça "sadece prototip" demedikçe varsayılan **KPTA**.

---

## Build / test komutları
```
npm run build     # tekdosya + (postbuild) mesken prototip — DEĞİŞİKLİKTEN SONRA HEP ÇALIŞTIR
npm test          # tests/run-all.js
npm run test:smoke
```

## Notlar
- `.design-sync/` = ayrı (design-system'i Claude'a yükler), KPTA↔Mesken ile alakasız.
- Render reçetesi / plan-boyama: `mesken/DURUM.md` + memory `mesken-plan-boyama-cozum`, `kpta-engine-architecture`.
