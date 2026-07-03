# BRIEF — L1-A Uygulama: Duvar Kalınlığı + Brüt/Net Alan + DXF Export

**Uygulayıcı:** Claude Opus 4.8 (oturum başına bir dilim)
**Hazırlayan:** Fable 5, 2026-07-03
**Stratejik kaynak (üst belge):** `~/.claude/plans/50cm-lik-zgaralar-projelerin-daha-federated-adleman.md`
— vizyon/fazlar/riskler orada; bu dosya onun OTURUM-BOYU uygulama çevirisi + ilerleme kaydıdır.
**Ön koşul (TAMAM):** Konsolidasyon Paket A-C bitti (`Claude_instructions/BRIEF-konsolidasyon-opus48.md`
DURUM tablosu) — snapshot-regresyon taban çizgisi, REG sabit tablosu, areaOfCells tek-kaynak, perf
haritası, CI hepsi hazır. L1-A tam da bu ağın üstüne kurulmak için bekletildi.

---

## DURUM — İLERLEME KAYDI

| Dilim | Durum | Commit | Not |
|---|---|---|---|
| **L1-A1** duvar kalınlığı (ortogonal, görsel katman) | KOD TAMAM — KULLANICI ONAYI BEKLIYOR | `957764a` | Aşağıdaki "L1-A1 bulgular" bölümüne bak. Snapshot BİREBİR, npm test 31/31, build OK, perf render fazı değişmedi (~16ms). Kalınlık DEĞERLERİ + görünüm onayı kullanıcının. |
| **L1-A2** brüt/net alan | BEKLIYOR | — | |
| **L1-A3** DXF yazıcı (export) | BEKLIYOR | — | |
| **L1-A4** roundtrip + entegrasyon | BEKLIYOR | — | L1-A3 ile aynı oturum olabilir |

Her oturum sonunda bu tabloyu güncelle (durum + hash + bulgu/kalanlar). Emoji kullanma.

### L1-A1 bulgular (2026-07-03, Opus 4.8)

**Model:** `core.js REG.duvar` = tip-bazlı kalınlık (m): `dis:0.30, daireArasi:0.20, icBolme:0.10,
cekirdek:0.25` (öneri; son söz kullanıcının, tek tabloda → ayar bedava). Tip mevcut plandan türetilir:
`walls.js makeWallClassifier()` (computeWallRuns unit/FIXED/isExt konvansiyonuyla TEK KAYNAK) — dış=bir
yanı bina dışı, çekirdek=bir yanı merdiven/asansör/yangın/teknik, daireArasi=iki yanda farklı bağımsız
bölüm ya da hol sınırı, icBolme=aynı daire iç bölmesi. `doors.js doorWallType(dr)` kapı kind'ından oyulan
duvar tipini verir (ext→dış, unit→daireArasi, inner→icBölme).

**Uygulama (4 tüketici, additive):**
- **2B teknik (render.js renderPlan):** duvar segmenti merkez-çizgi → `stroke-width = t*pxPerM` (±t/2 dolu
  bant; square linecap köşeleri doldurur). Kapı boşluğu bandı (`gw`) oyulan duvar kalınlığından geniş
  (`+1.5`) → kalınlaşan duvarı tam temizler. Dış cephe konturu (pts path) = dış kalınlık.
- **edges/paint export (render.js drawWallEdgeMask + clean dalı):** GERÇEK kalınlık — eski "iç duvarı dış'a
  eşitle" dilate hack'i KALDIRILDI (daireArasi 0.20 zaten belirgin ControlNet sinyali; min 3px görünürlük).
- **3B (view3d.js):** duvar/lentö/eşik mesh derinliği sabit `0.12` → `WALL_T=REG.duvar.daireArasi` (0.20).
  Oda-kenarı başına kurulur, paylaşılan iç duvarlar çakışır → 3B'de tek temsili değer (2B tip-bazlı).
  Kapı boşluğu oyma + lentö + eşik aynen çalışır.

**SERT SINIR korundu:** hücre modeli / bölge alanları / layoutUnit / onarım zinciri / checks.js DEĞİŞMEDİ.
`node tests/snapshot-regression.js` 7/7 BİREBİR (kalınlık salt görsel/export). `npm test` 31 dosya 0 hata
(ai-temiz kadraj kenar-maskesiyle BİREBİR). `npm run build` OK (prototip'e REG.duvar+sınıflandırıcı indi).
`KPTA_PROFILE` render fazı: deep-48x27 ~14-16ms, std ~6-7ms → A5 haritasıyla AYNI, patlama YOK
(sınıflandırıcı Map render başına bir kez kurulur, ihmal).

**Görsel doğrulama (canlı kabuk, ekran görüntüleri kullanıcıya sunuldu):** 2B teknik (dış cephe kalın bant,
çekirdek/daire-arası orta, iç bölme ince, kapı boşlukları korunmuş) + edges (gerçek kalınlık, sürekli
duvar) + paint (renkli dolgu+EN etiket+gerçek kalınlık+kapı boşluğu) + 3B (kalın duvar, kapı oyma). Konsol
hatasız.

**KULLANICI ONAYINA SUNULAN:** (1) kalınlık değerleri (0.30/0.20/0.10/0.25) uygun mu? (2) 2B/edges/paint/3B
görünümü onaylanıyor mu? (3) İSTEĞE BAĞLI — mesken render reçetesi girdisi değişti (paint/edges gerçek
kalınlık): eski örnekle yan yana bir ana-plan boyama render'ı (KREDİ: onay al, 1-2 render) istenirse üretilir
(`mesken/tests_render/check.py`). C5-R dersi: görsel işlerde son kapı KULLANICI ONAYIDIR.

**Kalınlık ayarı istenirse:** yalnız `core.js REG.duvar` tek satır değiştir → `npm run build`. Kayıt formatına
girmez (global sabit); kullanıcı-başına özel kalınlık L1-B3'e ertelendi (brief tuzak notu).

---

## 0) ÖNCE OKU (zorunlu sıra)

1. `CLAUDE.md` — değişiklik nereye yazılır + build kuralı.
2. Yol haritası planı (üstteki mutlak yol) — özellikle "Faz L1-A" tablosu ve "Önemli revizyon" bölümü.
3. `Claude_instructions/BRIEF-konsolidasyon-opus48.md` — DURUM tablosu (A1 taban çizgisi kullanımı,
   A2 REG yapısı, A4 areaOfCells, A5 perf bulgusu) + Bölüm 7 TUZAKLAR.
4. `Claude_instructions/DEVIR-NOTU.md` — motor mimarisi.

## 1) MİSYON + SERT KAPSAM SINIRI

L1-A = mevcut hücre modeli ÜSTÜNDE, mümkün olduğunca additive üç yetenek: **(1) ortogonal duvar
kalınlığı, (2) brüt/net alan, (3) DXF export + roundtrip.** Amaç: zaruri ihtiyaçları karşılayan
çalışan sistem (karar 2026-07-01).

**YAPMA (L1-B/C/L2 kapsamı, ertelendi):** diyagonal duvar/oda sınırı; vektör veri-modeli rewrite;
Clipper2-WASM; kayıt formatı migrasyonu; M=0.5 / hücre modeli değişikliği; ML işleri.
**AYRICA YAPMA:** checks.js refactor'u (A7 ayrı iş — mevzuat eşiklerine ve panel mantığına dokunma);
onarım zinciri optimizasyonu (perf hedefi kayıtlı, ayrı iş).

## 2) TABAN ÇİZGİSİ DİSİPLİNİ — L1-A'da kural şöyle işler

Konsolidasyonda kural "BİREBİR zorunlu" idi. L1-A çıktı DEĞİŞTİREBİLEN ilk iş — ama dikkat:
**bu dilimlerin çoğunda da baseline birebir kalmalı**, çünkü kalınlık görsel/export katmanıdır,
hücre/alan modeline dokunmaz. Beklenti haritası:

| Dilim | Snapshot beklentisi |
|---|---|
| L1-A1 (render katmanı) | **BİREBİR** — hücreler/alanlar/bölgeler değişmez |
| L1-A2 (brüt/net) | **NET alanlar BİREBİR** — brüt YENİ veri olarak eklenir, mevcut parmak izi alanları değişmez |
| L1-A3/A4 (export) | **BİREBİR** — export motoru okur, değiştirmez |

Kural: her adım sonrası `node tests/snapshot-regression.js`. Fark çıkarsa: beklenen mi? DEĞİLSE DUR,
araştır, kullanıcıya raporla. Beklenen ve gerekçeli ise `--write` + diff özeti DURUM'a ve kullanıcıya.
Sessiz kabullenme YOK — "kalınlık ekledim, alanlar oynar tabii" diye geçiştirme YASAK.

## 3) DİLİMLER

### Oturum 1 — L1-A1: Duvar kalınlığı (ortogonal, görsel katman) [~3-4 gün işi, roadmap]

**Model:** `core.js REG`'e yeni alt-bölüm `REG.duvar` — tip bazlı kalınlık (metre):
```
dis: 0.30,        // dış cephe duvarı
daireArasi: 0.20, // iki bağımsız bölüm arası
icBolme: 0.10,    // daire içi oda bölmesi
cekirdek: 0.25,   // merdiven/asansör/yangın perde duvarı
```
Bu varsayılanlar TR pratiğine göre öneri — **oturum sonunda kullanıcı görsel üzerinden onaylar;
tek tabloda oldukları için sonradan ayar bedava.** Duvar tipini mevcut bilgiden türet:
`computeWallRuns` koşusunun iki yanındaki bölgelerin daire/tip kimliği (dış = tek yanı bina dışı;
daire-arası = iki yanda farklı unit; çekirdek = bir yanı struct bölge; kalan = iç bölme).

**2B render (render.js):** duvar koşuları merkez-çizgi kabul edilir → ±t/2 dolu bant çiz (koyu
dolgu, mevcut çizgi stilinin evrimi). Kapı boşlukları bantta da boşluk kalır (doors.js span'ları).
Dış cephede mevcut pts-overlay/onEdge desenine uy: dış duvar bandı `pts` çizgisine hizalanır,
hücre basamağına değil (bkz. Tuzaklar). Ölçü etiketleri (duvar-üstü hale yazımı) bant üstünde
okunur kalmalı.

**AI-boyama/edges export (io.js):** `exportEdgesDataURL`/`exportPaintDataURL` duvarları gerçek
kalınlıkta üretsin — bu, mesken render reçetesine GERÇEK kalınlık sinyali taşır (eski "kalın-iç-duvar
dilate hack'inin" doğru, kalıcı hali). DİKKAT: kadraj/edge-mask birebirliği bozulmamalı (bd=0 kuralı,
ai-temiz test yeşil kalmalı).

**3B (view3d.js):** duvar mesh kalınlığı REG.duvar'dan beslensin (şu an sabit ince); kapı boşluğu
oyma (eşik+lento) aynen çalışmalı. `npm run build` sonrası prototip adım 2-3'te görsel kontrol.

**DOKUNMA:** hücre modeli, bölge alanları, layoutUnit, onarım zinciri, checks.js. Oda İÇİ alan bu
dilimde değişmez — kalınlık çizim/export katmanıdır.

**Kabul:** snapshot BİREBİR; npm test yeşil (ai-temiz dahil); 2B + 3B + edges/paint export'ta
kalınlık görünür; kapı boşlukları doğru; KPTA_PROFILE ile render fazı süresi patlamadı (perf
haritasıyla kıyasla); **kullanıcıya görsel sunulur — kalınlık değerleri ve görünüm için son söz onun.**
**Görsel işlerde oturum kendini "tamam" ilan edemez (C5-R dersi, konsolidasyon DURUM tablosunda).**

### Oturum 2 — L1-A2: Brüt/net alan [~3-4 gün işi]

- **Net** = mevcut `areaOfCells` (A4 tek-kaynak — DEĞİŞMEZ; snapshot bunu doğrular).
- **Brüt** = net + çevre duvar payı: oda hücre-poligonu kenarları boyunca komşu duvarın t/2'si
  (dış duvarda tam t? — hayır: bağımsız bölüm brüt tanımına göre dış duvarın tamamı, ortak duvarın
  yarısı dahil edilir; TR uygulaması bu — kodda yorumla belgele). Roadmap'in dürüstlük notu geçerli:
  bu "yaklaşık-doğru"dur, tam-sadık ofset L1-B'de.
- **Gösterim:** daire tablosu + oda etiketi iki değer (net büyük, brüt küçük/parantez — B-paketi
  UI diline uy); io.js export şemasına `area_net_m2` + `area_brut_m2` (mevcut `area_m2` = net olarak
  KALIR, kırılma yok).
- **MEVZUAT NET ÜZERİNDEN KALIR:** PAİY piyes ölçüleri net alandır — checks.js eşik/karşılaştırma
  mantığına DOKUNMA. Brüt yalnız bilgi/rapor/DXF/pazarlama değeridir.
- **Kabul:** snapshot'taki mevcut alan alanları BİREBİR; io export eski alanları aynen taşıyor
  (gen-floorplan-map yeşil); tabloda iki değer tutarlı (brüt > net her odada; toplamlar mantıklı);
  kullanıcı onayı.

### Oturum 3 — L1-A3 + A4: DXF yazıcı + roundtrip [~4-5 gün işi]

- **Kendi minimal DXF yazıcısı** (offline kısıtı, roadmap kararı; harici lib yok): R12/AC1009
  uyumlu. Katmanlar: `A-AREA-<TİP>` oda poligonları (POLYLINE, kapalı), `A-WALL` duvar
  merkez-çizgileri (+kalınlık için iki kenar çizgisi ya da genişlikli POLYLINE — R12 uyumunda
  hangisi güvenliyse), `A-DOOR` kapılar, `A-TEXT` oda adı+alan (net/brüt). Birim: mm (m→×1000).
  Kaynak geometri: mevcut `fpCellOutline`/`fpSmoothOutline` + `computeWallRuns` — YENİDEN YAZMA,
  YENİDEN KULLAN.
- **UI:** io.js indirme akışına "DXF indir" (mevcut SVG/PNG düğmelerinin yanına, aynı görsel dil).
- **Roundtrip (L1-A4):** `tests/dxf-roundtrip.js` — export → mevcut `dxf.js` importer'ı (7a,
  rasterize eden) → bölge tip + IoU kıyası (eşik belgele, ör. IoU>0.95); strict suite'e ekle.
  Harici CAD'de görsel açılış kontrolü KULLANICI adımıdır — dosyayı üret, kullanıcıdan iste.
- **Kabul:** snapshot BİREBİR; roundtrip testi yeşil; bilinen bir plan DXF'te katman-doğru;
  kullanıcı harici görüntüleyicide açıp onaylar.

## 4) DEĞİŞMEZ KURALLAR

Konsolidasyon brief'i Bölüm 2 aynen geçerli (küçük adımlar, EMOJİ YOK, satır no yerine fonksiyon
adı, commit-ama-push-yok, DURUM güncelle). Kapılar: `npm test` (tam sayı raporla — yeni test
eklenince artar) + snapshot beklenti-haritasına uygun + `npm run build` + görsel işlerde kullanıcı
onayı. Ana repoda çalışılır (worktree değil). `tools/yedek-al.sh` untracked kalır.

## 5) L1-A'YA ÖZEL TUZAKLAR

- **Dış cephe deseni:** parsel köşeleri ızgaraya hizalı DEĞİL; render.js dış kenarda hücre
  basamağını bastırıp gerçek `pts` çizgisini üste çizer, io.js `fpSmoothOutline` toleranslı snap
  yapar. Kalınlık bandı bu desene UYMALI (banda basamak çizersen dış cephe çirkinleşir; pts'e
  hizala). İlgili: konsolidasyon Bölüm 7 + roadmap "kod-kanıtı" notu.
- **Kapı span birebirliği:** view3d kapı boşlukları `io.js buildFloorplanMap().doors[]` span'ını
  `exportWallBoundaryPNG` ile birebir paylaşır — kalınlık eklerken bu sözleşmeyi bozma.
- **Mesken render reçetesi girdisi değişiyor:** edges/paint PNG'lerde kalın duvar = reçete
  girdisinde görünür fark → L1-A1 sonunda bir ana-plan boyama render'ı (KREDİ KURALI: onay al,
  1-2 render) eski örnekle yan yana kullanıcıya sunulmalı. `mesken/tests_render/check.py` bunun
  için var. Hüküm kullanıcının (C5-R dersi).
- **`stateSnapshot`/kayıt formatı:** REG.duvar sabit tablo olduğu sürece kayda girmesi gerekmez;
  kullanıcı-başına özel kalınlık İSTENİRSE format işi L1-B3'e ertelenir — bu fazda global sabit yeter.
- **Perf:** onarım zinciri zaten %98'i yiyor (A5 haritası); render bandı çizimi ucuz kalmalı —
  şüphede KPTA_PROFILE ile ölç.

## 6) OTURUM SONU RİTÜELİ

1. Bu dosyanın DURUM tablosu güncellenir (dilim satırı + hash + bulgu + varsa "dokunulmadı" listesi).
2. Konsolidasyon brief'ine dokunulmaz (o kapandı) — çapraz bilgi gerekirse buraya yazılır.
3. Kullanıcıya rapor: görseller (2B/3B/export), snapshot durumu, bilinçli takaslar, sonraki dilim.
4. Görsel onay bekleyen işler "KULLANICI ONAYI BEKLIYOR" olarak işaretlenir — oturum kendi kendine
   kapatamaz.
