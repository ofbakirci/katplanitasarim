# BRIEF — KPTA/Mesken Konsolidasyon Paketi

**Uygulayıcı:** Claude Opus 4.8 (Claude Code oturumu)
**Hazırlayan:** Fable 5 denetim oturumu, 2026-07-02
**Kaynak:** 4-ajanlı kod denetimi (motor, UI, render hattı, ML) + `Claude_instructions/DEVIR-NOTU.md` + ana repo `mesken/DURUM.md` + vektör-kernel yol haritası (`~/.claude/plans/50cm-lik-zgaralar-projelerin-daha-federated-adleman.md`)

---

## DURUM — İLERLEME KAYDI (Opus 4.8 oturumu, 2026-07-02)

**Nerede çalışılıyor:** ANA REPO (`/Users/ofbakirci/apps_ofb/katplanitasarim`). Worktree
(`.claude/worktrees/mystifying-noyce-557642`) gitignored asset'lerden (`input/`, `ref/`, `mesken/`
1.4G) YOKSUN → orada `npm test` tam yeşil olmaz ve pre-commit hook build'i patlar (mesken asset yok).
Tüm iş ana repoda yürüyor.

**Geri dönüş noktası (rollback):** `git tag konsolidasyon-pre-A-20260702` @ `488b70d` (Paket A öncesi temiz master).

| Adım | Durum | Commit | Not |
|---|---|---|---|
| **A1** snapshot-regresyon | BITTI | `9303b98` | `tests/snapshot-regression.js` + `tests/fixtures/snapshot-baseline.json`; 7 senaryo; strict suite'te; determinist BİREBİR. Doğrulama: `node tests/snapshot-regression.js` → sıfır fark. Baseline tazeleme (bilinçli): `--write`. |
| **A3** sessiz vazgeçme uyarıları | BITTI | `4194dca` | repairUnits(30)/rectifyCorridor(24)/slimUnitAntre(240) limit dolunca `console.warn`. A1 birebir korundu. **BULGU:** 7 baseline senaryosunda yalnız **rectifyCorridor 1 kez** limit doldurur; repairUnits & slimUnitAntre HİÇ dolmaz → onarım zinciri çoğunlukla yakınsıyor, tek riskli yol koridor-israfı aktarımı. |
| **A2** sihirli sayı → REG | BITTI | `39e6542` | `core.js REG`'e `iter`/`cap`/`layout` alt-bölümleri; haritadaki TÜM occurrence'lar taşındı (planner.js 14 nokta + rooms.js 2). Saf taşıma; her adımda A1 birebir + `npm test` 31/31. **DÜZELTME:** rectifyCorridorEnds `pass<24` DEĞİL `pass<8` kullanıyormuş (kaskad boşaltma turu) → `REG.iter.corridorEndDrain:8` olarak taşındı, 24'e bağlanMAdı. Aynı-değer/farklı-anlam ayrıştırıldı: 140 → `sigMaxAlan` + `ebBanyoBuyuk` (bağımsız). checks.js:177'deki 45 (salon-şişme info sinyali) farklı semantik + checks.js sabitleri A7 kapsamı → dokunulmadı. |
| **A4** alan tek-kaynak | BITTI | `7465a07` | `core.js areaOfCells(cells)` tek formül kaynağı; `walls.js calcRegionMetrics`'in `g.area` üretimi de artık ona bağlı. **24 çağrı noktası taşındı** (io.js 1, planner.js 15 satır/16 çağrı, walls.js 1, rooms.js 7). Disiplin: mutasyon-halindeki dizilerde (repairUnits/purgeSlivers/slimUnitAntre döngüsü) `g.area` BAYAT → `areaOfCells`; canlı+taze bölge metriği (sağ-tık menü alan gösterimi) → `g.area`. **Dokunulmadı (3 nokta, bilinçli):** `planner.js:522` `(restN-lob.length)*M*M` = hücre-SAYISI aritmetiği, cells dizisi değil; `app.js:203` + `app.js:214` = villaFloors PASİF-kat snapshot yolu — A1 tüm senaryolarda `villaFloors=null` → test-doğrulanmış birebirlik ALINAMIYOR, "şüphede davranışı koru" gereği bırakıldı (cebirsel özdeş, ileride villaFloors fixture'ıyla taşınabilir). `tests/*` kapsam dışı. Doğrulama: her dilim sonrası snapshot 7/7 BİREBİR + io export `area_m2` 38 alan byte-diff birebir + npm test 31/31 + build OK. |
| **A5** perf enstrümantasyon | BITTI | `0600dd1` | `core.js PROF` + `KPTA_PROFILE` bayrağı (varsayılan KAPALI, kapalıyken snapshot-regression 7/7 BİREBİR). `generate()` fazları: inside/cekirdek/yerlesim/layoutUnit-toplamı + 11 onarım geçişi AYRI AYRI + runChecks + render. `performance` guard'lı. `tests/perf-smoke.js` (diagnostics, strict DIŞI). **BULGU (ilk perf haritası):** süre **onarım zincirinde** yoğun, layout'ta DEĞİL. 48×27 derin blok ~5,0 s: `slimAntres` ~2,44 s (%49) + `rectifyCorridor` ~1,66 s (%33) + `rectifyRoomShape` ~0,81 s (%16) = ~%98; yerlesim 18 ms + layoutUnit 6 ms + çekirdek/inside <3 ms = ihmal. 32×16 standart ~0,58 s: slimAntres ~0,24 s + rectifyRoomShape ~0,25 s + rectifyCorridor ~0,05 s. Optimizasyon hedefi net: slimAntres/rectifyCorridor/rectifyRoomShape iç döngüleri (B/L1 sonrası). |
| **A6** CI + node --check | BITTI | `24f997c` | `.github/workflows/test.yml` YENİLENDİ (eskiden Node 24 minimal): push+PR, ubuntu-latest, Node 20, `npm install` (lockfile yok → `npm ci` değil). Adımlar: kök `.js` başına `node --check` (açık-if-bloğu regresyon otomasyonu) + `test:syntax` + `npm test` (31) + `test:smoke` + `node tools/bundle.js`. **NOT (build neden kısmi):** CI'da `npm run build` KOŞMAZ → yalnız `node tools/bundle.js`. `npm run build` postbuild'i (`mesken/build-prototip.js`) tetikler; o gitignored `mesken/` asset'lerine (02_PROTOTIP/prototip.template.html) muhtaç, runner'da yok → patlar. Bundle tek başına yalnız tracked kök kaynakları kullanır → yeşil. Repo PUBLIC: workflow'a sır/path yazılmadı, mesken asset'i eklenmedi. **Actions ilk koşusu ANCAK push sonrası doğrulanır** (push kararı kullanıcının). |
| **A7** checks.js kural-tablosu | BITTI (2026-07-03) | `729eae3`+`654cf34`+`bfdf480`+`e19e1bc` | `collectChecks` monolit → **9 kayıtlı kural** (`CHECK_RULES`, KARARLI ASCII id: IMPORT_REPAIR / UNIT_ROOMS / DOORS / FLOOR / CORE / PARSEL / AVLU / SITE / BALKON); her `run(add,p)`, karmaşık toplayıcılar tek kural=çok satır (aşırı soyutlama yok). Her çıktı satırı `{id,s,t,reg,unit,action}` — id daima registry kümesinde (`checkRuleIds()`). UNIT_ROOMS piyes satırları **14 ince subId** (SALON_MIN/YATAK_MIN/YATAK_SAYI/EBEVEYN_BANYO/BANYO_YOK/MUTFAK_YOK/SALON_YOK/MUTFAK_MIN/BANYO_MIN/WC_MIN/DOGAL_ISIK/DAIRE_SISME/BICIM/ERISIM) = ML mevzuat filtresi/DXF tüketicisi için. Registry `window.CHECK_RULES`/`checkRuleIds` ile açık. **A2 devri kapatıldı:** checks.js sihirli sabitleri (şişme 22/13/23/5×1.4, salon-payı 45/0.5, biçim 0.55, ort-daire 30/15/25/6×1.6, villa hiza 0.26) → `REG.checks` (core.js, DEĞER BİREBİR). **Hakem:** `tests/checks-metin.js` (7 senaryo collectChecks tam çıktısı, byte-frozen) + `tests/checks-registry.js` (sözleşme). **Dokunulmadı/taşınamadı:** FLOOR/CORE/PARSEL/AVLU/SITE/BALKON bilinçli tek-kural (satır-içi interleave/order zorunluluğu → ayrı kurala bölünemez); `renderChecks`/`runChecks`/B7 action-meta AYNEN; helper fonksiyonlar (collectUsage/parkingSummary/collectCoreDim/Height/GroundEntrance) imza-uyumlu, dokunulmadı. Kapılar: npm test **35 dosya** + snapshot 7/7 BİREBİR + build OK. |
| **B1** cut-drag hayalet önizleme | BITTI | `77b44ea` | Drag SIRASINDA `generate` çağrısı SIFIR (eskiden her mousemove `generate(true)` → 48×27'de ~5 sn/frame). Yeni: hafif `#dragOverlay` (kesikli ayırıcı + taşınan tutamaç + imleç yanı canlı ölçü "6,5 m \| 4,0 m"); reflow yalnız BIRAKINCA (`finishDrag`), mevcut commit yolu (generate + `restoreEditedFootprints(preUnits)` + cut undo/redo) BİREBİR korundu. Mavi duvar-node: komşu iki bölgenin canlı W×H etiketi. **KARAR:** commit ertelemesi `setTimeout(0)` (rAF DEĞİL — arka-plan/odaksız sekmede rAF durur → commit asılı kalırdı; tarayıcıda kanıtlandı). Dosyalar: render.js/interaction.js/structure.js. Doğrulama (tarayıcı, gerçek olay): drag'de generate=0, drop tek generate, undo→[[16..]]/redo→[[7..]] birebir, overlay drop'ta temizlenir. **BULGU (drop-commit süresi):** standart 32×16 (26 bölge) planda drop→yeni-yerleşim GÖZE ANINDA (progress imleci görünmüyor bile); ~5 sn'lik his ANCAK 48×27 derin blokta beklenir (A5 haritası) — ileriki onarım-zinciri (slimAntres %49 + rectifyCorridor %33) optimizasyonu B1'i daha da akıcı yapar ama B1 zaten frame-donmasını kaldırdı. snapshot 7/7 birebir. |
| **B5** stepper debounce | BITTI | `eaeeb06` | `debSafeGen` (200 ms trailing) — spec input basılı-tutta her tetikte `safeGen` yerine son değişimden 200 ms sonra TEK üretim. Bağlı: daire spec change + katSayisi/katYuk + bodrumSayisi (yapısal `onFloorCountChange` senkron kalır, yalnız generate debounce'lu); addUnit/binaTipi senkron. Tarayıcı: 6 hızlı change → 0 anlık + 200 ms sonra 1 generate. app.js. snapshot 7/7 birebir. |
| **B2** mod rozeti | BITTI | `b9c3954` | `#modeBadge` (sol-üst, toolbar hizası) — `setMode`→`updateModeBadge`: aktif mod Türkçe adı + tek satır ipucu + inline SVG mod ikonu (emoji YOK). draw/pan sade (gizli); park kendi çubuğunu gösterir; villa/site sekmesi açıkken `.shifted` (bir satır aşağı); mobil (<=700px) toolbar altına. Tarayıcı: 8 mod geçişi doğru, ekran görüntüsü OK. |
| **B3** klavye kısayolları | BITTI | `2fef4df` | `MODE_KEYS` D/O/K/B/A/Y/P/T/S → ilgili araç düğmesini `.click()` (pro-only/site/park görünürlüğü + tSite toggle OTOMATİK korunur). Guard: form alanı + `dragging` + Ctrl/Cmd/Alt YUTULUR; Space/Esc/Ctrl+Z/Y ayrı handler (dokunulmadı). Tooltip'lere "(X)". Tarayıcı: tüm tuşlar + 3 guard + Pro-mod P doğrulandı. **Kenar durum:** toolbar COLLAPSED iken (`.tbgrp{display:none}`) kısayollar da pasif (gizli düğme = kısayol yok) — bilinçli. |
| **B4** tutamaç affordance | BITTI | `fd70d2f` | Hover'da tutamaç büyür + hâle (cut/duvar/çekirdek/bina-sınır TÜM aileler) + durum çubuğu (`#stHint`) tek satır: turuncu cut / mavi duvar / mavi çekirdek / turuncu bina-sınır. Yapı modunda çekirdek tutamaçları MAVİ-dolgu kareler, bina sınır TURUNCU daireler = görsel aile ayrımı. `hoverCut`/`hoverStructH` global; render yalnız hover DEĞİŞİNCE (hafif). Tarayıcı: 3 aile + ekran görüntüsü doğrulandı. Mobil: `#status` gizli → dokunmatiği bozmaz (touch.js yeşil). |
| **B6** parsel kapanış | BITTI | `b7d41ca` | Kapanınca kontur kesikliden DÜZE (`render.js` stroke-dasharray koşullu) + kalıcı durum çubuğu ipucu. **BULGU/DÜZELTME:** brief "kenara SAĞ tıkla" diyordu ama ön-cephe seçimi LEFT-click (`interaction.js` `e.button!==0 return`) → ipucu gerçek davranışa göre "bir kenara tıklayın" yazıldı. Tarayıcı: dashed→solid + yeşil ipucu OK. |
| **B7** denetim→eylem köprüsü | BITTI | `9bb61f4` | Piyes-ölçüsü bad satırlarına (salon/salon+mutfak, yatak, mutfak, banyo, wc, eb.banyo) `action` meta + panelde "Öneri" düğmesi → `focusRegion(oda)` + durum çubuğunda öneri. OTOMATİK DÜZELTME YOK. Denetim mantığı/metni BİREBİR: **snapshot 7/7 birebir (bad/info sayıları değişmedi)**. Düğme yalnız reg'li bad satırlarda; "yerleştirilemedi"/biçimsiz/ok satırlarında YOK. Tarayıcı: 4 düğme + odak + turuncu öneri + ekran görüntüsü doğrulandı. |
| **B TAMAM** → yol ayrımı | BEKLIYOR | — | Paket B bitti. Sıradaki: L1-A (kalınlık/brüt-net/DXF, ayrı plan belgesi) ya da A7 (checks.js kural-tablosu) ya da Paket C (render sertleştirme) — **kullanıcı seçer**. |
| **C2** snapshot çözünürlük kilidi | BITTI | `f216a3c` | `view3d.js snapCameraDataURL` viewport'tan BAĞIMSIZ sabit **1440×810** PNG (setPixelRatio(1)+setSize(1440,810,false)+aspect=16/9; try/finally BİREBİR geri). **Tarayıcı doğrulaması (gerçek WebGL):** 660px & 1280px pencerede snapshot AYNI 1440×810 (dpr=2'de bile); exportCameras px_delta before==after (worldToPx px_delta=0 korundu); renderer restore OK; adım-4 iki-tık yerleştirme+export(room_id)+snapshot+sil çalışıyor; 0×0 guard. Kanıt: scratchpad `C2-locked-snapshot-1440x810.jpg`. |
| **C3** oda tipi fallback uyarısı | BITTI | `07e6015` | `io.js buildFloorplanMap` tanınmayan tip (`fpRoomEnum→'room'→_def` bej) oranı >%5 ise `console.warn`+export `warnings:[]`. Yeni `fpTypeRecognized()` fpRoomEnum tanıma mantığını aynalar. **Doğrulama:** normal plan (38 bölge)→`warnings []` (sessiz); bozuk plan (6/38=%15.8)→uyarı. npm test 31/31, gen-floorplan-map yeşil, snapshot 7/7 birebir. |
| **B3 revizyon** collapsed kısayol | BITTI | `a3e0eb3` | Kullanıcı kararı: collapsed toolbar'da kısayol AKTİF. **BULGU:** zaten aktifti — önceki "pasif" notu yanlış zihinsel modele dayanıyordu (`getComputedStyle(btn).display` düğmenin KENDİ display'ini döndürür; collapse ata `.tbgrp`'yi gizler, düğme 'flex' kalır). Guard'ı kaldırmak pro-only/site/park'ı bozardı → kaldırılmadı, yorum düzeltildi. **Tarayıcı:** collapsed 'o'→tetiklendi, pro-only 'p'→tetiklenmedi. |
| **C1** model sürümü + seed | BITTI | gitignored → `DURUM.md §8` | `render-server.js` (yedek `.bak-20260702`) startup'ta sürümü çözer+pinler (ÜCRETSİZ GET, KREDİ YAKMAZ)+/health'e yazar+güvenli geri-düşüş. **BULGU:** sürüm=`712e06a8e122…fd42f374` (versiyonlu, iki koşu DETERMİNİST); nano-banana-pro **seed KABUL ETMİYOR** (`acceptsSeed:false`)→seed enjekte edilmedi. **Paid smoke render YAPILMADI** (kullanıcı kredi kısıtı); sürüm ücretsiz metadata GET ile doğrulandı. Hard-pin: `NANO_VERSION` env. |
| **C4** render regresyon fikstürü | BITTI | gitignored → `DURUM.md §8` | `mesken/tests_render/` (inputs test7-9 + reference + `check.py`). check.py render-server'ı sürücü kullanır→pinli sürüm+isoPrompt TEK KAYNAK. **Doğrulama:** `--dry` (kredi yakmaz) 3 kıyas görseli üretti (girdi\|referans). Canlı koşu (3 nano=kredi) kullanıcının. |
| **C5** mobilya render sinyali | BITTI (paralı adım 5 dahil) | tracked `view3d.js`(C6 ile) + gitignored `iso_render.py`/`render-server.js` → `DURUM.md §8` | Tarayıcı iso PNG davranışı belgelendi (tutarlı, düzeltme yok). **Headless parity:** `iso_render.py` furniture[]'tan sade kutu çizer (FURN_DIM port + furn_footprint, koyu kategori tonu, `__w/__d`, mobilyasız=bayt-özdeş). **KANIT:** 126-item furnished plan → `tests_render/out/C5_parity_kiyas.png`; **sayısal parite 0 px**. **Prompt:** isoPrompt'a "furniture blocks are real positions, dress in place" koşullu eklendi. **Paralı A/B (3 render, onaylı):** `C5_AB_prompt_kiyas.png` — HÜKÜM: txt2img iso'da yeni prompt güvenli/nötr (renk-kutuları soyut, konum sıkı kilitlenmiyor); ASIL sadakat B/img2img yolunda (C7_B mobilyayı YERİNDE korudu). |
| **C6** depth map export (STRETCH) | KOD TAMAM, canlı yakalama preview-kısıtlı | `view3d.js snapCameraDepthMap` → `DURUM.md §8` | `snapCameraDepthMap(cam)` eklendi + API'ye açıldı: C2 disiplini (1440×810/pixelRatio1/try-finally) + `MeshDepthMaterial` overrideMaterial + near/far `scene.__span`'e göre. Pipeline'a BAĞLANMADI (kaçış yolu). Canlı depth PNG YAKALANAMADI: preview penceresi 0×0/hidden (ekran-arası tuzak) → renderer 0×0 → guard null döner (doğru). Parse-temiz, snapCameraDataURL ikizi. |
| **C7** A/B varsayılanı | BITTI (2026-07-03) | tracked `view3d.js` (`camRenderMethod='snapshot'`) + gitignored `render-server.js`/`prototip.template.html` → `DURUM.md §8` | **B (snapshot/img2img) VARSAYILAN, A/İkisi istek-üzerine** (2×→1× maliyet). `render-server runCameraRecipe` default `'both'`→`'snapshot'` (+snapshot yoksa A'ya güvenli düşüş); prototip 3 fallback + kopya güncel; view3d `camRenderMethod` default flip. Seçici düğmeler (Prompt/Görsel/İkisi) + setCamRenderMethod DEĞİŞMEDİ → A/both hâlâ seçilebilir. Kamera YERLEŞTİRME UI'ına dokunulmadı. Tarayıcı: `exportCameras`→`render_method:'snapshot'` doğrulandı. **Paralı doğrulama (onaylı):** `POST /camera` method'suz → server log `method=snapshot`, yalnız B-submit (A yok), `a=false b=true` → `tests_render/out/C7_B.png`. |
| **C5-R** isoPrompt geri alımı | BITTI (2026-07-03, Fable) | gitignored `render-server.js` → `DURUM.md §8 C5-R` | Kullanıcı C5 prompt cümlesinin çıktısını REDDETTİ (zeminler boyalı kaldı, mobilya tekdüze koyu-kahve — `tests_render/out/C5_AB_prompt_kiyas.png` sağ panel + `C7_B.png`). `isoPrompt` C5-öncesi kazanan cümleye BİREBİR döndü (`.bak-20260703` diff'iyle doğrulandı, `node --check` temiz). KALAN: C7 (B-varsayılan), `/render {promptOverride}` debug, `iso_render.py` mobilya çizimi (parity), `snapDataURL(furnished)` seçimi — hepsi geçerli. DERS: prompt'ta LOCK (geometri/konum) ile RESTYLE (renk/malzeme) ayrışmalı; "exactly in place" görünümü de donduruyor; konum sadakatinin yolu txt2img prompt'u değil B/img2img. Oturumun "nötr-artı" hükmü insan-gözüyle yanlışlandı — görsel işlerde son kapı KULLANICI ONAYIDIR. |
| **AVLU paketi** | BITTI (2026-07-03) | `a4bc24a`(AV-1)+`5083fbc`(AV-2)+`be74b1d`(AV-3) | 3 dilim, motor+UI+denetim. **AV-1** (undo/redo fix): kök neden = avlu `pushEdit` yazılıyordu ama `avluChanged->generate`'in geçmiş filtresi (planner.js 453+2193) taze `'avlu'` kaydını anında siliyordu → Geçmiş boş, undo/redo etkisiz. FIX: her iki filtreye `'avlu'` eklendi (kayıt dünya-koordinatlı `prev` taşır, cut gibi generate-sonrası geçerli); redo `__snap`/stateSnapshot simetrisiyle courtyards'ı kurar. **AV-2** (düzenleme UI): `hitAvluHandle` köşe(2-eksen)/kenar(1-eksen) boyut + gövde taşı (balkon deseni ruhu, bbox); `avluMove`/`avluResize` → `avluGhost` önizleme, geçersiz(sınır dışı)=KIRMIZI+bırakınca revert+durum mesajı, min 1×1 m, drag'de generate YOK (B1 ruhu) reflow bırakınca; render 8 tutamaç; sil keşfedilebilir (avlu modu sağ-tık AYNEN + mod rozeti ipucu; BAŞKA modda avluya sağ-tık→küçük "AVLU/Avluyu sil" menüsü, hücresiz bölge oda menüsü çıkarmaz). **AV-3** (koridor-bölme): GUARD `avluCommitGuard` = generate sonrası koridor `regComponentCount` DELTA arttıysa revert+"Avlu koridoru bölemez" (2→2 geçer, çekirdek-bölünmüş korunur; `healDisconnected` koridor kararı BOZULMADI); KIRMIZI DENETİM `avluSplitsCorridor` (avlu koridorun 2+ parçasına komşuysa böler, çekirdek-split yanlış-pozitif vermez) → AVLU registry kuralına bad+reg+action, id kararlı. **BULGU:** `avlu-blok.js` E) regex `/Avlu/`→`/kısa kenar/` daraltıldı — merkezi geniş test-avlusu koridoru GERÇEKTEN bölüyor (yeni doğru bad); boyut-testi niyeti korundu. **Kapılar:** npm test 36 dosya (avlu-edit=32 assert) + snapshot 7/7 + checks-metin 7/7 BİREBİR + build OK. Tarayıcı (gerçek mouse): resize 8→12m, move, invalid-red-revert, iki sil yolu, guard-reddi (courtyards geri/durum mesajı), zorlanmış-split panelde AVLU bad, normal köşe-avlu kabul. **KAPSAM DIŞI (süresiz ertelendi):** koridoru avlunun etrafından yeniden rotalama (guard varken gereksiz; gerekirse L1-B vektör zemininde). |
| **AVLU-R** devralma turu (Fable + Sonnet inceleme ajanı) | BITTI (2026-07-03) | `5db3417`+`346d635` | Push sonrası CI KIRMIZI çıktı → kök neden avlu DEĞİL, gitignored `mesken/inputs/master1.svg` fixture'ına korumasız bağımlı 2 test: `camera-prompt` (yoksa zarif atlama — mesken-özel) + `brut-alan` (yoksa üretilmiş 32×16 plana düşme — T1-T4 jenerik, CI kapsamı korunur; T4'ün "en büyük brüt-net farkı=dış cepheli" varsayımı düzeltildi → plan-agnostik "en az bir oda brütü artmalı"). Doğrulama yöntemi: **salt-tracked yerel klon = birebir CI simülasyonu** (`git clone --local` → npm test exit=0) — gelecekte fixture şüphesinde aynı yöntemi kullan. Bağımsız Sonnet inceleme ajanı AV-1/2/3'ü brief'e karşı denetledi: spesifikasyona uygun, fixture'lar el değmemiş; **1 gerçek bug buldu:** `mobile.js` touchstart grab kararı eski `hitAvlu` mantığında → dokunmatikte mevcut avlu taşı/boyutlandır ÖLÜ (sürükleme PAN'e düşüyordu). FIX: `hitAvluHandle` gövde/kenar/köşe → hemen sürükleme (masaüstü paritesi); silme dokunmatikte avlu-dışı mod uzun-basış mini menüsünden. Test: `touch.js` vaka 7 (16→19 assert). Bilinen küçük takas (önceden var, yeni değil): guard-reddi `generate()` çağırdığından elle kapı düzenlemelerini sıfırlar — generate sözleşmesi, kabul. Kapılar: 36 dosya + snapshot 7/7 + checks-metin 7/7 + build OK. |
| **VERI-MUSLUGU** self-training günlüğü | BITTI (2026-07-03) | `9743e84` | Paket D ön-adım: motor render'a giden/indirilen planlardan tercih verisi BUGÜNDEN yerelde birikir (ağ YOK). `core.js trainLog` modülü (localStorage `kptaTrainLog`, RING BUFFER MAX=20 kayıt + ~2,5 MB soft-limit, tek kayıt >1 MB ise state'siz özet=`stateOmitted`, localStorage yoksa sessiz no-op). Kayıt: `{t:ISO, ev:'accept', kind, edits:{n,byType}, spec:unitSpecs, state:stateSnapshot()}`. **Kabul kancaları (io.js):** SVG/PNG/DXF indir + mesken köprüsü `mskExportRenderInputs` (render). **DEBUG-HARİÇ kararı:** AI-boyama/controlnet-edges/duvar-sınırı PNG (`exportAIPaintPNG/EdgeMask/WallBoundary`) = render hattının ARA ÇIKTILARI/tanı görselleri → kanca YOK (AI Output düğmesi üçünü toplu üretir; ayrıca loglamak aynı planı defalarca yazıp sinyali kirletir; nihai render kabulü zaten mesken köprüsünden gelir). **UI:** sol panel dışa-aktarım altında `#trainSec` katlanır `<details>` (pro-only, `.wt-sec` deseni): kayıt sayısı + "JSONL indir" (`kpta-egitim-gunlugu.jsonl`) + "Temizle"; emoji YOK. **Test:** `tests/train-log.js` (23 assert: no-op guard / kayıt+alanlar / ring-buffer 25→20 en-eski-düşer / >1MB→stateOmitted / JSONL satır-başına-geçerli-JSON / clear); strict suite'e eklendi. **Motor mantığı DEĞİŞMEDİ** (planner/walls/rooms/checks el değmedi). Kapılar: npm test **37 dosya** yeşil + snapshot 7/7 BİREBİR + checks-metin 7/7 BİREBİR + build OK. Tarayıcı: preview stale-cache tuzağına düştü (in-memory eski io.js); TAZE-served core.js gerçek browser localStorage'ıyla eval edildi → record/ring/JSONL/clear doğrulandı. |
| **3B-UX-A** gezinme + görüş kilidi (view3d.js) | KULLANICI ONAYI BEKLIYOR (2026-07-03, Opus 4.8 uygulayıcı) | `0277054`(A1)+`a26ee41`(A2)+`f4bf366`(A3+A4) | 4 iş kalemi, hepsi `view3d.js` (KPTA kaynağı → build prototipe iner). **A1 GEZİNME:** `attachOrbit` elle-sabitleri **NAV yerel ayar nesnesine** taşındı (REG'e DEĞİL — motor değil): `rotateSpeed 0.78→0.5` (sakin çevirme), `rotDamp 0.12→0.2` (kısa/taşmayan atalet), pan artık ayrı `panDamp:0.2`+`panSpeed:0.85` (eskiden pan dampingFactor'ü paylaşıyordu), `zoomDamp:0.16` korundu, `tweenMs:280`. +`controls.tweenTarget/cancelTween/getDistanceTarget/tweenToAngle` (A3/A4 altyapı). **A2 ZOOM HER YERDE:** `#v3dZoom` 'Görünüm' çekmecesinden çıktı → sağ-altta HEP görünen dikey `#v3dZoomBar` (2B editör zoom kontrolünün 3B ikizi: ＋/dikey slider/−, dark palet, inline SVG, EMOJİ YOK); `wireZoom` overlay kurulunca 1× bağlanır; ＋/− tekerlek adımıyla (×0.83/×1.205) `setDistanceTarget` → tekerlek/pinch/slider çift-yön senkron. **A3 ODAKLAN:** mobilya/kamera seçilince controls hedefi objeye kısa tween'le kayar (**zoom mesafesi SABİT**); `focusFurn`(pos MUTLAK→dünya-cx,-cz)/`focusCam`(target'a); `selectFurn/selectCam`→focus; klavye **F** + panel düğmeleri (`furnfocus`/`camfocus`). **A4 KUŞBAKIŞI KİLİDİ (kalp):** kamera/mobilya grubuna girişte varsayılan **üst açı** (`TOP_PHI≈0.055 rad`, neredeyse tepeden ama derinlik ipucu kalır) yumuşak `tweenToAngle` (mesafe+azimut korunur, yalnız phi) + **döndürme kapalı** (`controls.noRotate`→sol-sürükle PAN), pan+zoom serbest; görünür `#v3dLockBtn` (kilitli=gold/lock, açık=lockopen) tık=aç(serbest, kaldığın açıdan, snap yok)/tık=kuşbakışına tween+kilitle; gruba her girişte KİLİTLİ (kullanıcı kararı), grup dışına çıkınca kilit kalkar `freeSavedView` geri gelir; giriş yolları `setGroup`+`setCamUI`. **KARAR (Fable, kullanıcı onayladı):** mobilya da kuşbakışı-varsayılan. **SERT SINIRLAR korundu:** snapCameraDataURL/snapDataURL/exportCameras/worldToPx px_delta=0 DOKUNULMADI (kilit yalnız interaktif controls), kamera-yerleştirme placeMode(`controls.enabled=false`)+raycaster DEĞİŞMEDİ, yerleştirme UI akışı yeniden tasarlanMADI, MOTOR DOKUNULMADI. **Kapılar:** npm test 37 dosya + snapshot 7/7 + checks-metin 7/7 BİREBİR + build OK. **Tarayıcı (gerçek olaylar):** furniture girişi→kilit(gold)+top-down tween; aç→döndürme serbest(3/4 tilt); re-lock→top-down; kilitliyken sol-sürükle PAN; zoom overlay+slider+düğme her görünümde uygular. **TUZAK (preview):** hidden-tab rAF-PAUSE → `getView()` bayat okur/loop durur (yanlış "donmuş" izlenimi); screenshot foreground'lar → gerçek durum orada; py http.server disk-cache → test için `?cb` cache-bust'lı geçici shell şart (tekdosya `?cb` yetmez, view3d ayrı dosya). |
| **D** | BEKLIYOR | — | ML ranker — ayrı oturum. Tercih verisi VERI-MUSLUGU ile birikmeye başladı. |

**A2 için hazır harita (2026-07-02 grep'lendi; satırlar A1+A3 sonrası, kayabilir → fonksiyon adıyla grep):**
- `core.js`'te `REG` ZATEN VAR (mevzuat sabitleri, satır 6). Layout/onarım sabitleri ayrı alt-bölüm olarak eklenmeli (ör. `REG.iter`, `REG.cap`, `REG.layout`) — mevzuatla karışmasın.
- Guard limitleri: `planner.js repairUnits` `iter<30`; `rectifyCorridor` `pass<24`; `rooms.js slimUnitAntre` `guard++>240`. (rectifyCorridorEnds ve rectifyUnitBalance de `pass<24` kullanır — A2'de bunları da REG.iter'e bağla.)
- Boyut katsayıları (İKİ paralel layout bloğunda tekrarlıyor — `planner.js layoutUnit` ~929 ve ~1093/1113): mutfak `area*0.085`, banyo `area*0.04`, bedCap `area*0.12`, ebCap `area*0.15`. Taban değerleri de sihirli: `Math.max(13,…)` mutfak, `Math.max(6.5,…)` banyo, `Math.max(20,…)` yatak, `Math.max(26,…)` eb.
- Alan eşikleri: `area<=45` / `area>45` (küçük daire), `area>120` (boyut sınıfı, ms 2.5/3.0), `area<=140`+`area>140` (shallowU / köşe-banyo boyutu 5v4), `area>=(hasEns?130:110)` (ensuite eşiği), `bA<0.45*totalIn` (gövde algısı @151).
- Derinlik: `depthM<=9` (@1097 shallowU), cephe payı `2.5`/`2.0`/`1.5` (@~1167 minD). `depthM>=10.5` grep'le doğrula.
- **UYARI:** aynı sayı (120, 140, 45) farklı yerlerde farklı anlam taşıyabilir — kör replace YAPMA; her occurrence'ı semantiğiyle eşle. Her adımdan sonra `node tests/snapshot-regression.js` BİREBİR olmalı.

**A3'ün üstünde bıraktığı KALAN sessiz vazgeçmeler (bu oturumda eklenMEDİ, aday):**
`rectifyCorridorEnds` (`planner.js` ~2027 `pass<24`), `rectifyUnitBalance` (aynı bölge `pass<24`, CV_TARGET break), `carveMissing` host bulamayıp banyoyu atlaması, leftover hücre "büyük odaya" dökümü >~8. Brief A3 bunları da önerdi; ilk turda 3 ana guard yapıldı.

**Her oturum-sonu:** `npm test` (31/31 yeşil olmalı) + `node tests/snapshot-regression.js` (davranış-koruyan işlerde birebir) + `npm run build`.

---

## 0) ÖNCE OKU (zorunlu sıra)

1. `CLAUDE.md` — **"Değişiklik nereye yazılır"** kuralı ve build akışı. Özet: motor mantığı HEP kök `.js` kaynağına; `npm run build` tekdosya + mesken prototip'i otomatik üretir; `mesken/MESKEN-prototip.html`'e ELLE DOKUNMA.
2. `Claude_instructions/DEVIR-NOTU.md` — motor mimarisi ve tarihçe.
3. Ana repo `mesken/DURUM.md` (gitignored, ana repo kökünde: `katplanitasarim/mesken/DURUM.md`) — render reçetesi tek doğru kaynak.
4. Yol haritası planı (yukarıdaki plans dosyası) — bu brief o planın **önünü hazırlar**, onunla çakışmaz. L1-A (kalınlık/brüt-net/DXF-export) işleri bu brief'in kapsamı DIŞINDADIR.

---

## 1) MİSYON VE KAPSAM

**Tez:** Keşif fazı doğru cevapları buldu (mesh-first render, vektör-kernel yönü, region-uzayı ML sinyali). Şu anki risk, bu cevapların **korumasız zeminde** durması: motorun 9-geçişli onarım zinciri elle-ayarlı sabitlerle ve sessiz vazgeçme guard'larıyla dolu, hiçbir regresyon taban çizgisi yok; UI her drag frame'inde tüm planı yeniden üretiyor; render hattında model sürümü sabitlenmemiş; ML yanlış temsilde ısrar etmiyor ama doğru pivota da geçmedi.

**Dört paket** (öncelik sırasıyla; her paket kendi oturumu/commit dizisi olabilir):

| Paket | Ad | Neden önce/sonra |
|---|---|---|
| **A** | Güvenlik ağı (motor + workflow) | HER ŞEYDEN ÖNCE. A1 taban çizgisi olmadan B/C/L1-A'daki geometri değişimleri körlemesine olur. |
| **B** | UI akıcılık | En büyük hissedilir iyileşme; A1 sonrası güvenli. |
| **C** | Render sertleştirme (mesken) | Saatlik işler + bir orta boy özellik (C5). |
| **D** | ML ranker | AYRI OTURUM önerilir; A-C'den bağımsız, paralel yürüyebilir. |

**Kapsam DIŞI (yapma):** TypeScript/React/framework geçişi; ızgara boyutu değişikliği (M=0.5 kalır); L1-A özelliklerinin kendisi (duvar kalınlığı, DXF yazıcı, brüt/net); "Mevzuata Uydur" tam özelliği (B7'de sadece altyapı adımı var); kredi muhasebesi (ayrı oturum kararı var); mevcut sabit DEĞERLERİNİ değiştirmek (A2 sadece taşıma).

---

## 2) ÇALIŞMA KURALLARI (uygulayıcı için)

- **Küçük, doğrulanabilir adımlar.** Her alt-paket sonunda `npm test` yeşil + `npm run build` başarılı. Paket başına ayrı commit(ler); mesaj Türkçe, mevcut commit üslubunda.
- **Davranış değiştirmeyen refactor'larda kanıt zorunlu:** A2 ve A4 için A1'in snapshot-regresyon testi **birebir aynı** çıktı vermeli. Fark çıkarsa dur, nedenini anla, kullanıcıya raporla.
- **EMOJİ YOK** — UI'da, kaynak kodda, bu brief'in ürettiği dosyalarda, hiçbir yerde. İkon gerekiyorsa inline SVG (`icons.js` deseni; TUZAK: `styles.css` global `svg{width:100%}` → boyutu inline style'da ver).
- **Ürün kararı gereken yerde kullanıcıya sor** (aşağıda işaretli: C7). Gerisinde sormadan ilerle.
- Test altyapısı: testler headless Node, `tests/support/app-js.js` script etiketlerini sırayla okur; `npm test` = `tests/run-all.js`. Yeni test eklerken mevcut kendi-kendine-yeten desenini kopyala (`node tests/<dosya>.js` tek başına çalışmalı).
- Tarayıcı doğrulaması gerekirse: preview'da çizim canvas'ı **global `svg`** değişkenidir; `document.querySelector('svg')` toolbar ikonunu döndürür (yanlış handler). Tekdosya önizlemede cache: `tekdosya?cb=<rastgele>`.
- Satır numaraları 2026-07-02 itibarıyladır; kaymış olabilir — **fonksiyon adıyla grep'le**, satıra körlemesine güvenme.

---

## 3) PAKET A — GÜVENLİK AĞI (önce bu, sırayla)

### A1. Snapshot-regresyon testi — `tests/snapshot-regression.js` (EN KRİTİK)

**Amaç:** Motor çıktısının sayısal parmak izini sabitle; sonraki her değişiklik (A2, A4, B, L1-A) bu taban çizgisine karşı doğrulanır.

**Yapılacak:**
1. Sabit girdi seti tanımla (mevcut test senaryolarını yeniden kullan): 32×16 standart, 21×18 4×3+1, L-şekil, 48×27 derin blok, villa 5+1, tek-daire/kat, komb (40×12 sığ). `tests/v22-test.js` ve `tests/room-edit.js`'teki girdi kurulumlarını örnek al.
2. Her girdi için `generate()` sonrası parmak izi çıkar: bölge sayısı; her bölge için `{name, type, unit, area, bbox(w,h), minSide, cellCount}`; daire başına toplam alan; kapı sayısı; `runChecks()` bad/info sayıları.
3. Taban çizgisini `tests/fixtures/snapshot-baseline.json`'a yaz (commit'lenir). Üretim modu: `node tests/snapshot-regression.js --write`.
4. Karşılaştırma: motor deterministik olmalı → **önce birebir eşitlik** dene. Fark çıkarsa kaynağını araştır (gerçek nondeterminizm mi?); ancak belgelenmiş nondeterminizm varsa ±%2 toleransa düş ve nedenini test dosyasına yorum olarak yaz.
5. `tests/run-all.js`'e strict test olarak ekle.

**Kabul:** `npm test` yeşil; baseline JSON commit'li; `--write` olmadan koşunca mevcut motorla sıfır fark.
**Efor:** ~yarım gün.

### A2. Sihirli sayılar → `REG` sabitleri (`core.js`)

**Amaç:** `layoutUnit` ve onarım zincirindeki elle-ayarlı eşikleri tek tabloya topla. **Değer değiştirmek YASAK — sadece taşıma.**

**Taşınacaklar (grep'le doğrula, liste eksiksiz olmayabilir):**
- Alan eşikleri: 45 / 110 / 120 / 130 / 140 m² (kiler, ensuite, boyut sınıfları — `planner.js layoutUnit` ve `checks.js`).
- Derinlik eşikleri: `depthM<=9`, `depthM>=10.5`, cepheye `<2.5` / `<2.8` m payı (komb kararları).
- Boyutlandırma katsayıları: `area*0.085` (mutfak), `*0.04` (banyo), `*0.12` (bedCap), `*0.15` (ebCap).
- Guard limitleri: `repairUnits` 30, `rectifyCorridor` 24, `slimUnitAntre` (rooms.js) 240 — `REG.iter = {repairUnits:30, rectifyCorridor:24, slimAntre:240}` gibi.
- Her sabite bir satır Türkçe yorum: neyi kontrol ediyor, hangi vakadan/dersden geldi (DEVIR-NOTU md.15/18 bağlantısı biliniyorsa).

**Kabul:** A1 snapshot testi **birebir aynı**; `npm test` yeşil.
**Efor:** ~1-2 saat.

### A3. Sessiz vazgeçme uyarıları

**Amaç:** Onarım zinciri pes ettiğinde iz bırakması.

**Yapılacak:** Guard limiti dolan her döngüye `console.warn('[KPTA] <fonksiyon> iterasyon limiti: <oda/daire>')` ekle: `repairUnits` (planner.js ~1541), `rectifyCorridor` (~1704), `slimUnitAntre` (rooms.js ~44). Ayrıca: `carveMissing` host bulamayıp banyoyu atladığında; leftover hücreler "büyük odaya" dökülürken hücre sayısı > ~8 ise. Sadece `console.warn` — UI'a taşıma, testleri kirletmesin (gerekirse `typeof process!=='undefined'` kontrolüyle test ortamında sustur ya da testlerde beklenen uyarıları belgele).

**Kabul:** `npm test` yeşil (uyarılar test başarısını etkilemez); normal üretimde uyarı SAYISI raporlanıp kullanıcıya bildirilir (kaç senaryoda limit doluyor — bu başlı başına bulgu).
**Efor:** ~30 dk.

### A4. Alan hesabı tek kaynak

**Amaç:** `cells.length*M*M` ~40 çağrı noktasında inline; `walls.js:7` (canlı) ile `io.js:501` (export) kopyalı — yol haritası L1-A2'nin ön adımı.

**Yapılacak:** `calcRegionMetrics` zaten `g.area` üretiyor. (1) Bölge metriği MEVCUT olan çağrı noktalarında inline hesabı `g.area` ile değiştir. (2) Keyfi hücre dizisi alanı hesaplayan yerler için `core.js`'e `areaOfCells(cells)` yardımcısı ekle ve oralarda onu kullan. (3) `io.js:501` export hesabını aynı yardımcıya bağla. DİKKAT: bazı noktalar `g.area`'nın BAYAT olabileceği anlarda hesaplıyor (onarım ortası, metrikler yenilenmeden) — böyle yerlerde `areaOfCells` kullan, `g.area` kullanma. Şüphede kalırsan davranışı koru.

**Kabul:** A1 snapshot birebir; `npm test` yeşil.
**Efor:** ~2-3 saat (dikkat işi).

### A5. Performans enstrümantasyonu (opsiyonel bayraklı)

**Yapılacak:** `KPTA_PROFILE` global bayrağı (varsayılan kapalı); `generate()` içinde ana fazları (`inside` doldurma, koridor, çekirdek, layoutUnit toplamı, her onarım geçişi, runChecks, render) `performance.now()` ile ölçüp `console.log('[PERF] ...')`. Ek: `tests/perf-smoke.js` (strict DEĞİL, `npm run test:diagnostics` ailesine) — 48×27 derin blok üretimini 3 kez koşup süreyi basar, eşik koymaz.

**Kabul:** Bayrak kapalıyken sıfır davranış farkı; `npm test` yeşil.
**Efor:** ~1-2 saat.

### A6. CI + (hafif) lint

**Yapılacak:**
1. `.github/workflows/test.yml`: push + PR tetikli; ubuntu-latest, Node 20, `npm install`, `npm test`, `npm run build`. Secret gerekmez (testler headless, build lokal). Repo PUBLIC — workflow'a sır/path sızdırma (yedek scripti deseni: `tools/yedek-al.sh` bilinçli commit'lenmemişti).
2. Lint: tam ESLint kurulumu yerine önce ucuz kazanım — `tests/`'e ya da workflow'a her kök `.js` için `node --check` adımı (DEVIR-NOTU'daki "açık kalan if bloğu tüm script'i kırdı" vakasının otomasyonu). İstersen ikinci adım olarak ESLint flat config + `no-undef` (globals listesi kürasyonu gerekir — app bilinçli global-ağır; ~40 global'i `eslint.config.js`'te `globals` olarak tanımla) + `no-unused-vars: warn`. ESLint kısmı zaman kalmazsa atlanabilir; CI + node --check yeterli ilk adım.

**Kabul:** GitHub Actions ilk koşu yeşil (push sonrası kontrol et); `node --check` tüm kaynaklarda temiz.
**Efor:** ~1-2 saat (+ESLint ~2-3 saat, opsiyonel).

### A7. (STRETCH — zaman kalırsa, yoksa ayrı oturum) `checks.js` kural-tablosu refactor'u

Mevzuat kurallarını veri olarak ayır: `RULES = { SALON_MIN: {check(plan), msg(ctx), severity} ... }`; `runChecks` tabloyu koşar. Amaç üçlü tüketici: (1) checks paneli, (2) ileride DXF katman/rapor export'u, (3) Paket D'de ML filtre/ödül. Davranış birebir korunmalı (panel çıktısı aynı metinler). Büyük iş (~1 gün) — başlarsan yarım bırakma.

---

## 4) PAKET B — UI AKICILIK

> Dokunulan dosyalar: `interaction.js`, `render.js`, `app.js`, `styles.css`, `kat-plani-tasarim.html`, gerekirse `mobile.js`. Motor mantığına dokunulmaz. Her adımdan sonra `npm test` (özellikle `touch.js`, `wall-drag.js`, `cut-preserve.js`) + `npm run build`.

### B1. Cut-drag hayalet önizleme (EN BÜYÜK KAZANIM)

**Mevcut durum (doğrulandı):** `interaction.js:118-121` — ayırıcı (cut) sürüklerken HER mousemove'da `generate(true)` koşuyor (flood-fill + yerleşim + onarım zinciri + checks + tablo). 60 event/sn × 100-300 ms = donma; mobilde kullanılamaz.

**Yapılacak:**
1. Drag SIRASINDA `generate` çağırma. Bunun yerine: `dragging.arr[dragging.idx]` güncellenir (mevcut satır kalır), ama sadece **hayalet çizim**: kesikli ayırıcı çizgisi yeni konumda + imleç yanında canlı ölçü etiketi (ayırıcının iki yanında kalan bant genişlikleri, "6,5 m | 4,0 m" biçiminde; `fmt` yardımcısını kullan).
2. Bırakınca (`finishDrag`, interaction.js ~371-374): MEVCUT commit yolu **birebir korunur** — `generate(true)` + `restoreEditedFootprints(dragging.preUnits)` + undo kaydı. Bu yol `cut-preserve.js` testinin güvencesinde; bozma.
3. Hayalet render'ı ayrı, hafif bir katmanda çiz (render()'ın tam yeniden çizimini tetiklemeden SVG'ye geçici `<g id="cutGhost">` ekle/güncelle; mouseup'ta kaldır).
4. Aynı deseni mavi duvar-node sürüklemesi zaten kısmen izliyor (drop'ta hesap); oraya da canlı ölçü etiketi ekle (oda W×H, `moveWallStep` sonucu beklemeden mevcut bölge bbox'undan).
5. Mobil: sentetik MouseEvent katmanı aynen çalışmalı (`tests/touch.js` yeşil kalmalı).

**Ürün notu:** Canlı yeniden-yerleşim hissi kaybolur (artık drop'ta reflow). Bu bilinçli takas — akıcılık > canlı reflow. Kullanıcı isterse ileride RAF-throttle'lı (~5/sn) canlı mod eklenebilir; İLK sürümde ekleme.

**Kabul:** Cut sürükleme 60fps akıcı (Perf: drag sırasında `generate` çağrısı SIFIR); drop sonrası davranış ve undo birebir eski; `npm test` yeşil.
**Efor:** ~yarım gün.

### B2. Mod rozeti (canvas üstü kalıcı gösterge)

`setMode` (interaction.js ~691) her çağrıda küçük sabit bir rozeti güncellesin: sol-üst, toolbar'ın hizasında, 11-12px, mevcut panel stilinde (`#histPanel` görselini örnek al). İçerik: aktif mod Türkçe adı + tek satır ipucu (ör. "Avlu — sınır içinde sürükleyerek boşluk oy"). Pan/draw gibi varsayılan modda sade kalsın. Emoji yok; gerekirse `icons.js`'ten mod ikonu.

**Kabul:** Her mod geçişinde rozet günceller; mobilde taşmaz (≤700px medya sorgusunda konum kontrol et).
**Efor:** ~1-2 saat.

### B3. Klavye kısayolları

Modlar için tek-tuş kısayollar (modifier'sız): öneri D=çiz, P=parsel, B=balkon, A=avlu, K=kapı, Y=yapı, O=oda çiz, T=park, S=site (çakışmaları kontrol et; mevcut: Space=geçici pan, Esc=iptal, Ctrl+Z/Y — bunlara dokunma, `spacePan`/`syncPanCursor` bozulmasın). Koşullar: `input/textarea/select/contentEditable` odaktayken yut; toolbar tooltip'lerine "(D)" biçiminde ekle (`data-tip` metinleri).

**Kabul:** Kısayollar çalışır, form alanlarında tetiklenmez, tooltip'ler günceller.
**Efor:** ~1-2 saat.

### B4. Tutamaç affordance'ları (turuncu/mavi ayrımı görünür olsun)

**Bağlam:** Turuncu daire-ayırıcı = CUT (`hitCutHandle` → tüm daireleri yeniden dizer), mavi dış-duvar = `moveWallStep` (elle düzeni korur). Bu ayrım görünmez ve geçmişte kullanıcıyı yaktı (cut-handle-reset vakası).

**Yapılacak:** (1) Hover'da tutamaç büyür/parlar (CSS class, render'da hit-test sonucu `hover-handle` işaretle). (2) Hover'da durum çubuğunda tek satır: turuncu için "Daire sınırı — bırakınca iki daire yeniden dizilir", mavi için "Duvar — odalar korunarak kayar". (3) `struct` modunda çekirdek tutamaçları ile bina köşe tutamaçlarını görsel ayır (dolgu rengi/biçim — kare vs daire zaten kısmen var; netleştir).

**Kabul:** Hover geri bildirimi üç tutamaç ailesinde de çalışır; ekran görüntüsüyle doğrula.
**Efor:** ~2-3 saat.

### B5. Stepper debounce

`app.js` stepper (+/− basılı tutma, ~802-811): her tetikte `safeGen`. 200ms trailing debounce ekle (son değişiklikten 200ms sonra tek `safeGen`). Diğer spec input'ları da aynı yardımcıyı kullansın.

**Kabul:** Basılı tutarken UI donmaz; bırakınca tek üretim.
**Efor:** ~30-45 dk.

### B6. Parsel kapanış geri bildirimi

Parsel kapanınca (interaction.js ~284): kontur kesikliden düze dönsün (render.js parsel çizimi, `stroke-dasharray` koşullu) + durum çubuğunda kalıcı ipucu "Parsel kapalı — yol cephesi seçmek için kenara sağ tıkla". Toast altyapısı yoksa kurma; durum çubuğu yeter.

**Kabul:** Kapanış anı görsel olarak fark edilir.
**Efor:** ~1 saat.

### B7. Denetim panelinden eyleme köprü (altyapı adımı)

`checks.js` bad satırlarına opsiyonel `action` alanı: şimdilik SADECE "odağa git + doğru aracı öner" (ör. "Salon 10,5 < 12 m²" satırında düğme → `focusRegion(salon)` + durum çubuğunda "Komşu duvarı sürükleyerek büyütün"). Otomatik düzeltme ("Mevzuata Uydur") BU PAKETTE YOK — o ayrı oturum (altyapı: `runChecks` ihlal listesi döndürüyor, aktüatör `moveWallStep`, şablon `slimAntres` deseni; DEVIR-NOTU bilinen sınır #5).

**Kabul:** En az 3 ihlal tipinde (salon/yatak/mutfak piyes ölçüsü) düğme çalışır.
**Efor:** ~2-3 saat.

---

## 5) PAKET C — RENDER SERTLEŞTİRME (mesken)

> DİKKAT: `render-server.js` ana repoda gitignored alandadır: `katplanitasarim/mesken/02_PROTOTIP/server/render-server.js`. `view3d.js`/`io.js` ise KPTA kaynağı (tracked) — değişiklik sonrası `npm run build` şart (prototip motoru gömer). Mesken-özel şeyler `mesken/build-prototip.js`/template katmanına (CLAUDE.md istisna kuralı).

### C1. Model sürümü sabitleme + seed

`render-server.js:46`: `const MODEL='google/nano-banana-pro'` — sürümsüz, Replicate sessizce model değiştirebilir. (1) Replicate API'den mevcut sürüm hash'ini al, `MODEL@<version>` biçiminde sabitle (ya da `POST /v1/predictions` + `version` alanı yoluna geç). (2) Endpoint `seed` kabul ediyorsa reçetelere `seed:42` ekle; etmiyorsa denemeyi ve sonucu `DURUM.md`'ye not düş. (3) `/health` yanıtına sabitlenen sürümü ekle.
**Kabul:** Aynı girdiyle iki koşu aynı model sürümünü kullanır (log'da görünür); smoke render başarılı.
**Efor:** ~1 saat (+token/ağ kurulumu: DURUM.md §5 proxy kuralları).

### C2. Snapshot çözünürlük kilidi

`view3d.js snapCameraDataURL` (~580): `renderer.domElement` viewport boyutunda render alıyor — aynı kamera farklı ekranda farklı img2img girdisi üretir. Düzeltme: snapshot öncesi `renderer.setSize(1440, 810, /*updateStyle=*/false)` + `cam.aspect=16/9` + `updateProjectionMatrix()`; snapshot sonrası ESKİ boyut/aspect birebir geri (fonksiyon zaten savedView/roof/gizmo restore deseni kullanıyor — aynı disipline uy).
**TUZAKLAR:** (1) `updateStyle=false` şart, yoksa canvas CSS bozulur. (2) Kamera yerleştirme `worldToPx` EXACT (px_delta=0) değişmezine dayanıyor — snapshot yolu ana render döngüsünün boyutlarını KALICI değiştirmemeli; restore'u `finally` benzeri kesinlikte yap. (3) Viewport 0×0 iken (ekran-arası) render çöker — boyut sıfırsa snapshot'ı reddet/ertele.
**Kabul:** Farklı pencere boyutlarında alınan snapshot'lar aynı piksel boyutunda; kamera yerleştirme UI'ı (kullanıcının sevdiği adım-4 akışı) birebir çalışır; `npm run build` sonrası prototipte doğrula.
**Efor:** ~1-2 saat.

### C3. Oda tipi fallback uyarısı

`io.js buildFloorplanMap` / `view3d.js colorFor`: tanınmayan oda tipi sessizce `_def` (bej) renge düşüyor → nano tipi yanlış okur. Export sırasında `_def`'e düşen oda oranı >%5 ise `console.warn` + export JSON'a `warnings:[]` alanı.
**Kabul:** Bozuk tipli planla uyarı tetiklenir; normal planda tetiklenmez.
**Efor:** ~30 dk.

### C4. Render regresyon fikstürü

Ana repo `mesken/` altına (gitignored alan) `tests_render/` klasörü: test7/8/9 iso girdileri + bilinen-iyi çıktılar + `check.py` — girdileri mevcut model sürümüne yeniden gönderir, çıktıyı referansla yan yana kaydeder (otomatik piksel diff'i BEKLEME — model nondeterministik olabilir; amaç insan-gözü kıyası için düzenli koşulabilir tek komut). `DURUM.md`'ye "model/prompt değişince bunu koş" notu ekle.
**Kabul:** `python tests_render/check.py` tek komutla kıyas görselleri üretir.
**Efor:** ~1-2 saat.

### C5. Mobilya render sinyalini tamamla (kalan boşluk: headless parity + prompt)

**DOĞRULANMIŞ mevcut durum (2026-07-02, kod kanıtlı — iş sanılandan KÜÇÜK):** Mobilya v2 zaten 3B mesh'in parçası (Mesken adım-2): `furnList` → `__furnitureGroup` mesh'leri (`view3d.js` ~1236); `buildFloorplanMap` oda başına `furniture[]` export ediyor (`io.js` ~502, 549-551, kaynak `window.__kptaFurniture`); kamera export'u koni içindeki mobilyayı `furniture_seen` olarak raporluyor (`io.js furnitureSeen` ~641); UI'da "Render'a mobilya ekle" checkbox'ı var (`view3d.js` ~165, boş listede `autoFurnishAll` ~559); `snapCameraDataURL` yalnız gizmo+etiket gizler → mobilya hem iso PNG snapshot'ında hem Opsiyon B kamera snapshot'larında GÖRÜNÜR.

**Kalan boşluklar (yapılacak iş bunlar):**
1. **Headless parity:** ana repo `mesken/00_CALISAN_RECETE/scripts/iso_render.py` (saf-PIL iso yolu) yalnız oda+duvar çiziyor — mobilya YOK (grep'le doğrulandı). `floorplan-map.json`'daki `furniture[]` alanından aynı sade kutuları çizdir (tip başına sabit koyu ton, etiketsiz; pozisyon MUTLAK metre, parametrik `__w/__d` boyutları akmalı — mobilya hafıza tuzakları). Hedef: tarayıcı iso PNG ile headless iso PNG aynı mobilya sinyalini taşısın.
2. **Prompt denetimi:** `render-server.js` `isoPrompt` + kamera reçetelerinde "furniture blocks are real furniture positions; dress them, do not move or invent" tarzı açık talimat var mı? Yoksa ekle.
3. **Kanıt:** test7-9 tarzı A/B kıyası (mobilyalı iso → nano, prompt satırı ile/olmadan) üret, hükmü `DURUM.md`'ye yaz.

**Kabul:** `iso_render.py` çıktısı mobilyalı planda kutuları gösterir ve tarayıcı iso PNG ile örtüşür; nano çıktısında mobilya konumları korunur (göz kıyası); mobilyasız planda iki yol da eskisi gibi.
**Efor:** ~yarım gün (headless parity ağırlıklı).

### C6. (STRETCH) Derinlik haritası export'u

`view3d.js`'e `snapCameraDepthMap(cam)` — aynı kamera açısından depth render (three.js depth material). Amaç: nano-banana deprecate olursa ControlNet-Depth (Flux vb.) kaçış yolu. Şimdilik sadece üretilebilir olsun; pipeline'a bağlama.
**Efor:** ~yarım gün. Zaman yoksa atla.

### C7. A/B varsayılanı (KULLANICIYA SOR — ürün kararı)

Şu an her kamera için A (prompt/txt2img) + B (snapshot/img2img) PARALEL koşuyor → 2× render maliyeti. Öneri: B varsayılan (sadık), A istek-üzerine (stil seçeneği). Kredi ekonomisine bağlanır (kredi muhasebesi ayrı oturum). **Uygulamadan önce kullanıcıya sor**; onaylarsa `render-server.js /camera` + prototip adım-5 UI'da varsayılanı değiştir, "ikisini de üret" seçenek olarak kalsın.

---

## 6) PAKET D — ML RANKER (AYRI OTURUM önerilir; bu bölüm o oturumun tohum brief'i)

**Karar bağlamı:** 41-örnek raster finetune EZBER çıktı (held-out Δ+0.013) ama `ml/phase2/region_signal.py` kullanıcı tercihinin **bölge-uzayında %82-92 yönsel tutarlı** olduğunu kanıtladı (dwelling_share ↑ %92, yatak ↑ %85, koridor ↓ %85, dikdörtgenlik ↑ %85). Sonuç: üretimi ML'e verme; **motor üretir, ML SIRALAR.**

**Mimari:**
1. **Aday üretimi (motor, JS):** `generate()`'e stokastik/parametrik varyasyon düğmeleri — koridor konum adayları, ayırıcı (cut) konum varyantları, daire sıralaması permütasyonları, rectify aç/kapa. Hedef: istek başına K=5-10 GEÇERLİ aday (mevzuat filtresi: `runChecks` bad sayısı artmayan). Headless harness mevcut: `ml/engine.js` (VM tabanlı) — aday üretimini oraya ekle.
2. **Öznitelik çıkarımı (Python):** aday başına ~10 bölge-agregat özniteliği — `region_signal.py`'deki HAZIR kod: dwelling_share, yatak/salon/koridor/circ_share, mean_rect, unit_area_cv, unit_area_spread (+ ekle: daire başına ihlal sayısı, antre oranı).
3. **Skorlayıcı:** XGBoost ya da 2-katman MLP; eğitim verisi = 39 eşli vaka (motor-orijinal < kullanıcı-düzeltilmiş) + pertürbasyon negatifleri (düzeltilmiş plandan rastgele bozulmuş K varyant). Pairwise ranking loss (ya da basit: corrected=1, original/perturbed=0 sınıflandırma).
4. **Değerlendirme:** held-out eşlerde "düzeltilmişi orijinalin üstüne sıralama" doğruluğu (hedef >%80 — region_signal yönsellikleri bunun mümkün olduğunu söylüyor). Ezber kontrolü: batch1'de eğit, batch2'de test (ve tersi).
5. **UI (KPTA, ayrı adım):** "Yerleşimi Oluştur" 3 varyant sunar (Plan A/B/C, skor sırasıyla); kullanıcının SEÇİMİ ücretsiz tercih etiketi olarak loglanır (self-training hafıza kararıyla uyumlu: kabul=zayıf pozitif, DEBUG indirmesi hariç). Skorlayıcı küçük — ileride JS'e port edilebilir (offline kısıtı korunur); ilk sürümde offline Python yeterli.

**İlkeler:** Mevzuat sert-kısıtları skora KARIŞMAZ (filtre olarak önce uygulanır — kullanıcının etiketleme felsefesi); skor sadece yasal adayları sıralar. Raster U-Net'e yeni yatırım YOK (ezber kanıtı); GNN/vektör-difüzyon L1-B vektör temsili gelene kadar BEKLER (L2 fazı) — ranker o güne kadar tercih verisini biriktirir.

**Efor:** 1-2 hafta (aday üretimi 2-3 gün, öznitelik+eğitim 2-3 gün, değerlendirme 1-2 gün, varyant UI 2-3 gün).
**İlk doğrulama hedefi:** held-out ranking doğruluğu raporu — UI'a bağlamadan ÖNCE kullanıcıya sonuç sun.

---

## 7) TUZAKLAR (hafıza + denetimden damıtılmış; dokunulan dosyalara göre)

- `generate()` elle düzenleri SIFIRLAR (bilinçli) — undo/geçmiş akışlarına dokunursan: cut undo **snapshot-temelli** (`restoreState`), `stateSnapshot` cuts'ı DEEP-COPY saklar (referans tuzağı yaşandı); `generate()` filtresi `'cut'||'ulayout'||'__snap'` kayıtlarını korur.
- `restoreState`'e onarım/ek mantık KOYMA — undo/redo/kat-geçişi onu kullanır (import onarımı bu yüzden `importPlanText`'te).
- `healDisconnected` koridoru BİLEREK atlar; çekirdek asla alıcı olmaz (`!isStructReg`); `regComponentCount` DELTA mantığı (2→2 geçer) — bu muhafızları "temizlik" diye bozma.
- Koridor genişliği `g.minSide` DEĞİL `corridorMinWidth` (bbox körlüğü vakası); benzer proxy-ölçüm hatasına yeni kod ekleme.
- Mobilya: MUTLAK-metre pozisyon, parametrik `__w/__d` her tüketicide akmalı, `furnDoorBlocked`, lazy `ensureFMAT`, `window.__kptaFurniture` kalıcılık.
- Kamera `room_id` TUTAMAÇ-odası çapalı (koni-dominant değil) — `cameraViewInfo` mantığını değiştirme.
- Testler `eval` tabanlı headless: üst-düzey `const` çakışmaları ve DOM varsayımları test kırar; yeni global eklerken `tests/support` stub'larını kontrol et.
- Emoji yasağı MUTLAK; `styles.css` global `svg{width:100%}` — inline SVG ikonlara inline boyut ver.
- Pre-commit hook build'i kendisi koşar ama YENİ dosyaları stage'lemez — yeni dosya eklediysen `git add` unutma; "commit & push" istenirse `npm run ship "mesaj"`.

---

## 8) DOĞRULAMA KOMUTLARI + KABUL ÖZETİ

```bash
npm test                         # strict paket — her alt-adım sonunda yeşil
npm run test:smoke               # dokunulan alana göre
node tests/snapshot-regression.js            # A1 sonrası: sıfır fark
node tests/snapshot-regression.js --write    # SADECE bilinçli taban güncellemesi
npm run build                    # tekdosya + mesken prototip tazelenir
node --check <dosya>.js          # şüpheli bozulmada ilk hamle
```

**Oturum-sonu kontrol listesi (her paket için):**
1. `npm test` yeşil + snapshot-regresyon birebir (davranış-koruyan işlerde).
2. `npm run build` başarılı; prototip görsel smoke (özellikle B ve C2 sonrası adım 3-4-5 akışı).
3. Commit(ler) atıldı; işin özeti + bilinçli takaslar (ör. B1 canlı-reflow → hayalet) kullanıcıya raporlandı.
4. Bu brief'te "KULLANICIYA SOR" işaretli maddeler (C7) sorulmadan uygulanMADI.
5. Guard-uyarı sayıları (A3) raporlandı — hangi senaryolarda onarım zinciri limit doluyor.
