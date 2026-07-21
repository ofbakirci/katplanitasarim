# CLAUDE.md — KPTA proje kuralları (her oturumda oku)

Bu repo **KPTA** (Kat Planı Tasarım Aracı). Detaylı devir notu: `Claude_instructions/DEVIR-NOTU.md`.
3D render iş kolu: `mesken/` (kendi `DURUM.md`'si var = tek doğru kaynak).

---

## 🚀 "commit & push" KURALI — hepsi eş zamanlı güncel olsun (her oturumda oku)

Kullanıcı **"commit & push"** (veya "ship", "yayınla", "gönder") dediğinde:
**HER ZAMAN önce `npm run build` çalıştır**, sonra üretilen mesken prototip'i de stage'le, sonra commit + push. Bunu otomatikleştirmek için git **pre-commit hook** kurulu (`tools/git-hooks/pre-commit`, `git config core.hooksPath tools/git-hooks`) — motor kaynağı (`.js/.css`) ya da kabuk staged ise commit'ten önce build'i kendisi çalıştırıp `mesken/MESKEN-prototip.html`'i yeniden stage'ler. Yine de kuralı bil:

| Hedef | Nasıl güncellenir | Build gerekir mi? |
|---|---|---|
| `kat-plani-tasarim.html` (kabuk) + modüler `.js` + `styles.css` | Kaynağı CANLI yükler | ❌ Hayır — commit+push yeter |
| **KPTA GitHub Pages** (`https://ofbakirci.github.io/katplanitasarim/`) | `master` kökünü yayınlar; `index.html` → kabuğa yönlendirir | ❌ Hayır — kabuk+`.js` push'lanınca canlı |
| `kat-plani-tasarim.tekdosya.html` | `npm run build` motoru içine gömer | ✅ **Evet** — **`.gitignore`'da, sadece DİSKTE/yerel** (web'e gitmez, bilinçli karar) |
| `mesken/MESKEN-prototip.html` | `npm run build` → postbuild tek-dosya motorunu içine gömer | ✅ **Evet** — tracked, build'siz commit'lersen **eski motor gömülü kalır** |

**Neden:** kabuk+Pages ham `.js`'i yükler → anında güncel. Tek-dosya ve mesken prototip motoru İÇİNE GÖMER → build olmadan **donmuş/eski** kalır. Build = ikisini taze tutar.

**Pratik:**
- Tek komut: `npm run ship "commit mesajı"` (stage tracked + commit[hook build eder] + push).
- Yeni DOSYA eklediysen (yeni `.js` modülü, görsel) önce `git add <dosya>` — `ship` sadece tracked değişiklikleri stage'ler, `input/`/`ml/` gibi untracked klasörleri süpürmez.
- Ben (Claude) commit&push yaparken: `npm run build` → ilgili dosyaları `git add` → commit → push.

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

## ÇOK-AJAN SUNUCU KURALLARI (ZORUNLU — ihlali canlı site düşürür)

Prod sunucuda (server.nousworks.co / 78.142.211.44, SSH port 35342) AYNI ANDA
birden fazla ajan çalışıyor (Codex + Claude Code, birden çok oturum). Ajanlar
birbirinden habersizdir. Sunucuya deploy/SSH yapan HER işlemde:

1. **Doğru kaynak SUNUCUDUR, lokal kopya değil.** Sunucudaki bir dosya (özellikle
   `/srv/edge/Caddyfile` ve `/srv/edge/docker-compose.yml`) lokaldeki kopyandan
   farklıysa, onu başka bir ajan bilerek değiştirmiştir. Lokal kopyayı üstüne
   basmak onun işini siler (md.nousworks.co böyle kaybedildi, 2026-07-17).
2. **Caddyfile değişikliği HER ZAMAN şu sırayla:** sunucudaki güncel hali çek ve
   yedekle → değişikliği o güncel halin ÜZERİNE yap → `caddy validate` → gönder +
   reload → TÜM domainlerin hâlâ cevap verdiğini doğrula (sadece kendi eklediğin
   değil) → sorun varsa yedeği geri koy. Lokal kopyayı asla olduğu gibi basma.
3. **`rsync --delete` paylaşılan hedefe YASAK** — başka ajanın koyduğu dosyaları
   siler. Sadece tek sahibi olduğun proje klasörüne, o da gerekiyorsa.
4. **Tanımadığın şeyi silme/değiştirme.** Sunucuda beklemediğin bir site, konteyner,
   config bloğu, cron görürsen o başka ajanın işidir: dokunma, kullanıcıya sor.
5. **Aynı anda tek deploy.** Kullanıcı hangi ajanın deploy sırası olduğunu söyler;
   sıran değilse sunucuya yazma (okumak serbest).
