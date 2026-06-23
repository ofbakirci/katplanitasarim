# Devir Notu — İmar Plan Notu çekme (TKGM parselin devamı)

**Branch:** `worktree-ozellik-deneme` (TKGM parsel dalı; master'a merge edilmedi) · 2026-06-23
**Önce oku:** `NOTES-parsel.md` (TKGM altyapısı — parsel zaten lat/lng + dünya koord olarak yükleniyor).

## ▶ DURUM & SİRADAKİLER (buradan devam — 2026-06-23 session sonu)
İmar özelliği **çalışır + commit'li**: `9f616f9` (ana: e-Plan imar + plan notu tarama + yapı sınırı çiz), `37de6f1` (lejand-gömülü + deferral + emsal tahmini), `ba60dbd` (TKGM düşünce e-Plan fallback + timeout), **`2f0c5b4` (çok-sağlayıcılı soyutlama + Ankara Başkent CBS)**, **`0d3122e` (İzmir Kent Rehberi CBS sağlayıcısı)**. 17/17 test. **3 İL CANLI: İstanbul / Ankara / İzmir.** Master'a **MERGE EDİLMEDİ**.
**Stratejik karar (39-ilçe workflow):** anlık tarama + hedefli 7-ilçe küratör; geniş pre-gömme REDDEDİLDİ (ilçelerin ~%55'i değeri 1/1000 uygulama planına erteliyor).
**✅ (c) Ankara ABB CBS TAMAM (commit `2f0c5b4`):** İstanbul e-Plan akışı `IMAR_PROVIDERS` soyutlamasına alındı (`match/getParselByPoint/getPlanInfo/getPlanNotuPdf`; PDF-çıkarım+panel+checks ORTAK). Ankara = ArcGIS REST `baskentcbs.ankara.bel.tr` (anonim+CORS+token YOK), parsel içi nokta → MULK_PARSEL + PLAN ADASI spatial query → TAKS/KAKS/Emsal/Kat/yapı düzeni/çekmeler **YAPISAL** (İstanbul'dan zengin; plan-notu PDF taramaya gerek yok). Detay aşağıda "ANKARA — Başkent CBS". Tarayıcıda doğrulandı (Keçiören/Kadıköy/İzmir).
**✅ İzmir sağlayıcısı TAMAM (commit `0d3122e`):** İzmir Büyükşehir Kent Rehberi ArcGIS REST `cbs.izmir.bel.tr/arcgis/rest/services` (anonim+token YOK+CORS Origin yansıtır). Parsel `CbsRehberMulkiyet/MapServer/1` (ADANO/PARSELNO), imar `CbsRehberPlanlar/MapServer/33` (PLAN ADASI: TAKS/KAKS/EMSAL/KATADEDI/yapı düzeni/çekme/UYGULAMAKOSULLARI). FARK: kod→ad decode katmanın KENDİ alan-domain'inde (ayrı servis yok → `arcgisLayerDomains`). Detay aşağıda "İZMİR — Kent Rehberi CBS". Tarayıcıda doğrulandı (Buca/Karşıyaka).
**SİRADAKİLER (öncelik sırası):**
1. **⏸ YENİ İL GENİŞLETME — PARK EDİLDİ (2026-06-24).** Karar: proje [[mesken-pipeline]] prototipi + **günün sonunda backend olacak** → o gelince **CORS proxy ile tüm CORS-kapalı iller trivial açılır** (Kocaeli'nin hazır API'si dahil). Bugün throwaway proxy / native-HTTP YAPMA. 3 metro (İstanbul/Ankara/İzmir) prototip için yeterli; imar = pipeline'a destekleyici girdi, ana iş değil. Reçeteler aşağıda + `/tmp` task çıktılarında kayıtlı; backend gelince ucuz eklenir. — _(Aşağısı backend gelince/yeniden değerlendirilince için arşiv.)_ Eski plan: `izmir-imar-recon` workflow'unu il adıyla tekrarla → provider ekle. **FİZİBİLİTE KRİTERİ (Bursa'dan öğrenildi):** Bu app STATİK/proxy-siz (tek-dosya/Capacitor) → bir il ANCAK (a) CORS-açık (Origin yansıtan ya da `*`) bir uçtan, (b) ANONİM, (c) YAPISAL yapılaşma hakkı (TAKS/KAKS/kat öznitelikli) veriyorsa eklenebilir. CORS-kapalı sistemler (çoğu Netcad KEOS ilçe app'i) tarayıcıdan çekilemez → server-side proxy gerekir, bu app'te YOK.
   - **❌ BURSA — İNCELENDİ, FİZİBİL DEĞİL (`bursa-imar-recon` workflow):** Birleşik Büyükşehir imar backend'i YOK. Zengin imar (TAKS/KAKS/kat/nizam) **Netcad KEOS ilçe** app'lerinde (Osmangazi `harita.osmangazi.bel.tr/imardurumu`, Nilüfer `webgis.nilufer.bel.tr`, Yıldırım `keos.yildirim.bel.tr`, Orhangazi/İnegöl) — `imar.aspx?parselid=` HTML + `planfonksiyon` JSON — AMA **CORS KAPALI** (access-control-allow-origin yok) + svc_nonce çift-gönderim kapısı → tarayıcıdan ÇEKİLEMEZ (proxy şart). CORS-AÇIK tek uç **Osmangazi ArcGIS** (`cbsy.osmangazi.bel.tr:8013/arcgis/rest/services/osmangazi`): `gcs_parsel/0` parsel + `s_plan_sin/2` yalnız PLAN_ADI verir — **TAKS/KAKS/kat YOK** (imar raster WMS). Yani CORS-açık-ama-yapısalsız ya da yapısal-ama-CORS-kapalı. App'e proxy eklenmedikçe Bursa atlanmalı. (Antalya/Kocaeli denenmeden önce: önce ArcGIS REST CORS+yapısal-öznitelik var mı diye hızlı yokla; yoksa boşuna uğraşma.)
   - **❌ 8-İL BATCH TARAMASI (`tr-iller-imar-tarama` workflow, 2026-06-24): HİÇBİRİ FİZİBIL DEĞİL.** Antalya (CORS-açık ArcGIS ama yalnız 1/25000 NIP — parsel/TAKS yok), **Kocaeli** (rehber-api.kocaeli.bel.tr `analysis/zoning-information-detailed/{ptzr}` → TAKS/KAKS/EMSAL/kat/nizam MÜKEMMEL yapısal+anonim AMA **CORS-kapalı**), Konya (NetGIS, Bearer token), Gaziantep (login-redirect), Mersin (public ArcGIS yok, KEOS nonce), Kayseri (arcgis var ama 499 Token + CORS-kapalı), Sakarya (api.sakarya.bel.tr/CityGuide/Zoning anonim ama CORS-kapalı + raster), Eskişehir (Netcad NETGIS login). **GENEL SONUÇ: feasible set = {İstanbul, Ankara, İzmir} (proxy-siz tarayıcı için tamamlandı).** Engel sürekli **CORS** (sıkça token/login) — veri çoğu ilde VAR. **AÇILIM (mimari, kullanıcı kararı):** (1) küçük bir server-side CORS proxy, ya da (2) **Capacitor native-HTTP** (native build'de CORS uygulanmaz → Kocaeli/Sakarya'nın temiz JSON API'leri + KEOS'lar doğrudan çekilebilir) eklenirse 5+ il açılır. Kocaeli API'si en hazır aday (temiz JSON, nonce yok). Proxy/native eklenmedikçe yeni il EKLEME.
2. ~~Ankara iyileştirmeleri (NIP fallback + çekme ön-doldurma)~~ **İNCELENDİ → ATLANDI (düşük değer):** NIP5000Etkin_Goruntuleme/MapServer/54 (KENTSEL KULLANIM ALANLARI; `kullanim/altkullanim/yogunluk/plannotuadi`) dolu (26.727 feature) AMA kapsama PLAN-ADASI-boş durumlarıyla kötü örtüşüyor (Etimesgut/Mamak: biri dolu diğeri boş), `yogunluk` seyrek (Keçiören null), yalnız-fonksiyon (TAKS/KAKS yok→checks'e katkısı yok). Bahçe-çekmesi ön-doldurma: PLAN ADASI 3 ayrı değer (ön/yan/arka) verir, `psCekme` tek uniform input → kayıplı/yanıltıcı; panelde GÖSTERİM yeterli. NIP `altkullanim` kodu (202…) uipSade/142 (102…) sözlüğüyle eşleşmez; `plannotuadi` zaten okunur etiket. Tekrar uğraşma.
3. İstanbul `plans[]`'te 1/1000 UİP varsa onun notunu çek + 7-ilçe küratör (Maltepe/Beylikdüzü/Eyüpsultan/Silivri/Zeytinburnu hard-med, Şişli/Bakırköy easy) + prose-pattern/koşul-ayrıştırıcı çıkarım iyileştirmeleri.
4. **master'a PR** (kullanıcı söyleyince).
Detaylar aşağıda "ANKARA — Başkent CBS" + "39-İLÇE KAPSAMA" + "TKGM dayanıklılık" bölümlerinde. Scout/PDF verisi `/tmp/cov/` (geçici).

## Amaç
Parsel yüklendikten sonra **imar durumu / plan notu** çek: fonksiyon (konut/ticari…), TAKS, KAKS(emsal), Hmax, ada/parsel, plan adı, plan notu → panelde göster + checks.js'in TAKS/emsal denetimine besle. Hedef: **İstanbul (İBB e-Plan)**.

## ✅ ÇÖZÜLDÜ — temiz kamu API'si bulundu (2026-06-23)
gismap.ibb.gov.tr token duvarını **aşmaya gerek yok**. İBB'nin resmî **e-Plan** uygulaması (`https://eplan.ibb.istanbul/sorgu/plansorgu`, Angular SPA, **girişsiz/kamu**) kendi backend'ini kullanıyor; bu backend **anonim** ve **CORS açık**.

### Backend kök
`https://eplan.ibb.istanbul/uWxvrTpLQ/backend`
(`/uWxvrTpLQ/` bundle'da sabit, obfuscate yol segmenti — döndürürlerse `main.*.js`'ten yeniden çıkar.)

### Endpoint'ler (hepsi `Content-Type: application/json`)
| Metot | Yol | Gövde | Döner |
|---|---|---|---|
| GET | `/token` | — | `{token, expires}` ArcGIS token — **çağıran kimlik bilgisi vermez** |
| POST | `/getbypoint` | `{x, y}` (EPSG:3857 metre) | Parsel feature(ları): `{OBJECTID, ADA, PARSEL, TAPUMAHADI}` + 3857 poligon |
| POST | `/getbyadaparsel` | `{ilce, ada, parsel}` | aynı (parsel feature) |
| POST | `/getparsel` | `{objectId}` | **`{parcel[], functions[], plans[]}`** ← asıl imar verisi |
| POST | `/getplannotu` | `{planId, type}` (Accept: pdf, blob) | Plan notu PDF |
| POST | `/getimarsorgupdf` | `{...}` (Accept: pdf, blob) | İmar sorgu PDF |
| POST | `/ilce`,`/mahalle`,`/sokak`,`/kapi` | — | adres/idari yapı (gerekmez) |

### Akış (bizim entegrasyon)
TKGM'den parsel centroid lat/lng VAR → `ll2merc` ile 3857 → `POST /getbypoint {x,y}` → `OBJECTID` al → `POST /getparsel {objectId}` → imar.
(`/token` ÇAĞIRMAYA GEREK YOK — `/getbypoint` ve `/getparsel` token'sız 200 veriyor; token'ı backend kendi içinde gismap'e karşı kullanıyor.)

### `/getparsel` yanıt şeması (DOĞRULANMIŞ)
- **`parcel[].attributes`**: `OBJECTID, PAFTA, ADA, PARSEL, TAPUMAHADI, ILCE_TEXT, MAHALLE_ADI, TAPUALAN` (m²) + `geometry.rings` (3857)
- **`functions[].attributes`** (imar fonksiyonu, parselle kesişen): `LEJAND_ADI` (kullanım: "KONUT ALANLARI…", "SAGLIK ALANI", "III. DERECE DOGAL SIT ALANI"…), `MIN_TAKS, MAKS_TAKS, KAKS, EMSAL, HMAX, KAT_ADEDI, YOGUNLUK` (kişi/ha), `PLAN_ADI, PLAN_KODU, PLAN_ID, ILCE_PLAN, TASDIK_TARIHI` (epoch ms), `TADILAT_KODU/ADI` + geometry
- **`plans[].attributes`**: parseli kapsayan plan belgeleri (`PLAN_ADI`, `PLAN_ID`…)

### Alan semantiği (ÖNEMLİ — gerçekçi beklenti)
- `functions[]` ağırlıkla **1/5000 NİP** (Nazım) → genelde **fonksiyon + YOGUNLUK** dolu, **TAKS/KAKS/EMSAL/HMAX çoğu null**. Detay yapılaşma hakları **1/1000 UİP**'te; bu backend'de 1/1000 çoğunlukla **raster** (Plan1000Raster, öznitelik yok).
- Sayısallaşmış yerlerde alanlar DOLUYOR (Kadıköy örn: `MAKS_TAKS=0.35, HMAX=12.50`).
- TAKS/KAKS attribute'ta yoksa **bağlayıcı değerler plan notu PDF'inde** (`/getplannotu`). PDF otomatik ayrıştırma zor → kullanıcıya indir/aç linki sun.
- Bir parsel **birden çok function** döndürebilir (parseli birden çok lejand kesiyorsa). İstanbul dışı / sayısalsız parselde `functions:[]` (boş) — zarif boş-durum gerek.
- mekansal SR `102100`/latestWkid `3857`.

### Probe örnekleri (curl, server-side — WAF için doğru Referer)
```bash
BASE=https://eplan.ibb.istanbul/uWxvrTpLQ/backend
H=(-H 'Referer: https://eplan.ibb.istanbul/sorgu/plansorgu' -H 'Content-Type: application/json')
curl -s "${H[@]}" "$BASE/token"
curl -s "${H[@]}" -X POST "$BASE/getbypoint" --data '{"x":3240109.6,"y":5009922.9}'   # Ataşehir
curl -s "${H[@]}" -X POST "$BASE/getparsel"  --data '{"objectId":88723708}'
```

## ✅ UYGULANDI (2026-06-23) — çalışır durumda
Parsel yüklenince imar durumu otomatik çekilip panelde gösteriliyor + checks.js'e besleniyor.

**Değişen dosyalar (worktree, UNTRACKED — commit edilmedi):**
- `app.js` — `parcelImar` global (null | {fonksiyon,maksTaks,emsal,hmax,katAdedi,yogunluk,planAdi,planNotuId,ada,parsel,…})
- `parsel.js` — yeni e-Plan bölümü: `EPLAN_BASE`, `psLL2Merc`, `eplanPost`, `psRingCentroidLL` (parsel içi nokta), `imarNum`, `imarParse` (functions[] içinden yapılaşma-hakkı taşıyan fonksiyonu öne alır), `imarRender` (#psImarBilgi kartı), `imarPlanNotu` (PDF indir, type "p"), `imarLoad(ll)` (imarReqId ile eski istek iptali). `applyData(data,adaF,parF,ll)` sonunda `imarLoad(ll)`; koordinat yolu `ll`'i geçer, ada/parsel yolu centroid kullanır.
- `kat-plani-tasarim.html` — `#psImar` içine `<div id="psImarBilgi" class="ps-imar">`
- `styles.css` — `.ps-imar*` kartı + `.ps-live .ps-ok`
- `checks.js` — TAKS denetimi `parcelImar.maksTaks` varsa onu, yoksa `REG.taksMax`; KAKS `parcelImar.emsal` varsa ona göre ok/bad
- `io.js` — `parcelImar` kaydet/geri-yükle (restore'da `imarRender`) /sıfırla

**Doğrulama (preview localhost:8769):** Kadıköy 40.9650,29.0590 → TKGM parsel + e-Plan imar 2 sn'de geldi; panel: ÖZEL İLKÖĞRETİM TESİSLERİ ALANI, TAKS 0,35, Hmax 12,5 m, Ada 2985/Parsel 8, plan adı+tarih, Plan notu PDF (planId 426 → 200 application/pdf 504KB). `npm test` 17/17, `test:syntax` ok. Tarayıcıdan no-referrer+CORS gerçek origin'den 200.

**Plan notu PDF tarama + KOŞUL METNİ + fonksiyon ipucu (UYGULANDI):** "Plan notundan değerleri tara" butonu → PDF'i **pdf.js (CDN lazy-import `pdfjs-dist@4.7.76`)** ile metne çevirir → regex'le TAKS/KAKS-Emsal-E/Yençok değerlerini **+ ait olduğu koşul-metni penceresiyle** (`imarSnippet`, ~koşul değerden önce) çıkarır → **tıklanabilir chip** + "Koşul metinlerini göster" listesi. Chip'e tıkla=uygula (`maksTaks`/`emsal`, `taksFromPdf` işareti → checks.js'e beslenir; tekrar tıkla=geri al). **Fonksiyon cross-check:** `imarParcelKeywords` LEJAND'dan rumuz (K-4/TICK-1/T3) + fonksiyon sözcükleri çıkarır; snippet'i parselin fonksiyonunu içeren değerler **★ ile vurgulanır** (yumuşak öneri). Fonksiyonlar: `loadPdfjs`, `eplanPlanNotuText`, `imarScanValues(text,im)`, `imarTrNorm`, `imarSnippet`, `imarParcelKeywords`, `imarChipRow`, `imarPlanNotuTara`, `imarApplyVal`. `parcelImar.scan={taks:[{n,snippet,km}],kaks:[...],yencok:[]}` + `showCond` io.js ile saklanır.

**ÖNEMLİ — neden OTOMATİK seçim YOK (10 ilçede doğrulandı):** Tam-otomatik "doğru TAKS/KAKS'ı seç ve uygula" **güvenilir değil**: (1) çoğu plan notunda değerler **tabloda** → düz-metne taşınınca dağılır, inline regex bulamaz (beylikdüzü/maltepe/esenler/üsküdar'da TAKS çıkmadı); (2) keyword eşleşmesi **yanlış pozitif** (bakırköy 0.4 aslında sosyal-tesis cümlesinden); (3) tek pencerede birden çok eşik (`<1000` ve `≥1000 m²`) → belirsiz. Yanlış değeri otomatik uygulamak yasadışı tasarıma yol açar → bu yüzden ★ yalnız **ipucu**, kesin seçim+uygulama kullanıcıda; koşul metni şeffaf gösterilir.

**RUMUZ eşleşme — kelime-sınırı (DÜZELTME):** `imarKeyMatch` artık rumuz'u (k3, k-4, tick-1) **kelime-sınırıyla** eşler (alt-dize değil) → 'k3' artık 'tk3'i yanlış eşlemiyor; fonksiyon sözcükleri (konut/ticaret) alt-dize kalır. `imarParcelKeywords` → `{rumuz[], words[]}`.

**RUMUZ-SATIRI (tablo) çıkarımı — KOORDİNAT-TABANLI (UYGULANDI):** Düz-metinde rumuz↔değer eşlemesi çalışmıyordu çünkü noktalı-liderli/tablo satırlarında ('TK10.....1.25', 'TK3= ... Hmax=15.50m') değer rumuzdan uzakta. ÇÖZÜM: `eplanPlanNotuDoc` artık pdf.js `getTextContent` **item x/y** koordinatlarıyla **SATIR rekonstrüksiyonu** yapar (aynı y = aynı satır, x'e göre sıralı) → rumuz+değer tek satıra toplanır. `imarRumuzRows(lines, keys)` parselin rumuzunu içeren satırlardan ETİKETLİ değer (TAKS/KAKS/E/Hmax) çıkarır = parselin KENDİ değeri (yüksek güven, **◆**). `imarScanValues(text, im, lines)` bunları `self:true,km:true` ile birleştirir; **tek self TAKS/KAKS → `suggestedTaks/Kaks`**; `imarPlanNotuTara` attribute boşsa OTOMATİK uygular (`taksSelf`/`emsalSelf`, "(plan notu · rumuz)" etiketi, geri alınabilir). Render: ◆=rumuz satırı (kesin), ★=fonksiyon ipucu, işaretsiz=diğer. Doğrulandı (gerçek plan 644, pdf.js): TK10 parseli → KAKS **1.25** otomatik; TK3 parseli (9208/1) → Hmax **◆15.50m** (diğer rumuz Hmax'larından ayrıldı); K3 (Mecidiyeköy, yoğunluk-only) → doğru boş. Sınır: rumuz **prose** içinde tanımlıysa (Bakırköy TİCK-1 paragrafları) satır-rekonstrüksiyonu yakalamaz — o zaman genel tarama+★/koşul-metni kullanılır.

**Parsele yapı sınırı çiz (UYGULANDI):** `psDrawBuilding` (parsel.js) — parsel + çekme (+varsa imar TAKS) → parsel içine önerilen YAPI SINIRINI bina (`pts`) olarak çizer: taban=çekme zarfı (`parcelSetback`); TAKS biliniyor & zarf TAKS'ı aşıyorsa merkez etrafında TAKS alanına küçültür. `genBtn` aktifleşir → "Yerleşimi Oluştur"a hazır. HTML `#psDrawBld` butonu (çekme satırı altında). Doğrulandı: Kadıköy 15337 m², TAKS 0.35 → bina 5368 m² (=parsel×0.35), parsel içinde.

**DÜZELTME (kullanıcı geri bildirimi — içbükey parsel):** İçbükey/karmaşık parselde (ör. Mecidiyeköy 1993/5, 23 köşe) `tkgmSetback`'in yarım-düzlem yöntemi ÇÖKÜYORDU → `parcelSetback` boş → bina=parsel (görünmez, "buton çalışmadı"). Düzeltme: `tkgmSetback` artık HİBRİT — `tkgmSetbackHP` (konveks, kesin) boş dönerse `tkgmSetbackMiter` (köşe açıortayı ofseti, içbükey çalışır; ters dönerse/köşe parsel dışına taşarsa boş döner). Ayrıca `psDrawBuilding` çekme zarfı yoksa **merkez-ölçek fallback** ((√A−2d)/√A) ile GÖRÜNÜR inset garantiler. Doğrulandı: Mecidiyeköy çekme 0→3491 m², bina 3491 m²<parsel içeride; Kadıköy konveks regresyonsuz (12277 m² aynı).

**getbypoint çoklu-parsel eşleme (UYGULANDI):** `getbypoint` tolerans nedeniyle komşu parselleri de döndürüyor (ör. nokta → 230/46,230/5,230/4). `imarPickFeature` TKGM ada/parseline uyanı seçer; uymuyorsa ilki + `parcelImar.mismatch` → panelde "farklı parsel" uyarısı. `applyData` TKGM ada/parsel'i `imarLoad`'a geçirir.

**Açık iyileştirmeler (sonraki):**
- Çoklu fonksiyon (parseli birden çok lejand kesiyorsa) hepsini listele / kullanıcı seçsin (şu an birincil + `lejandlar[]` saklı).
- İstanbul dışı için zarif mesaj var; başka belediye CBS'leri ileride eklenebilir.
- Plan notu PDF'ini tarayıcı içinde önizle (şu an indirir) + taranan değeri ilgili plan-notu maddesiyle göster.
- pdf.js CDN'den geliyor → offline/Capacitor'da scan çalışmaz (imar zaten ağ-bağımlı); istenirse pdf.js bundle'lanabilir.

## ✅ ANKARA — Başkent CBS (commit `2f0c5b4`, 2026-06-23) + PROVIDER SOYUTLAMASI
**Tersine mühendislik yolu:** cbsbaskent.ankara.bel.tr (WordPress portal) → `/imar-plan-sorgu/` → asıl app **`eimar.ankara.bel.tr`** (Angular; main+chunk JS). Bundle'lardan endpoint çıkarıldı. Plan raporu app içinde **client-side jsPDF/html2canvas** ile üretiliyor → sunucu-taraflı plan-notu PDF ucu **YOK** (gerekmiyor; veri yapısal).

**Backend: ArcGIS REST** `https://baskentcbs.ankara.bel.tr/server/rest/services` — **anonim (token YOK)** + **CORS Origin'i yansıtır** (`access-control-allow-origin: <origin>` + credentials:true). `Content-Type: application/x-www-form-urlencoded` → CORS-simple, preflight YOK. Tarayıcıdan `referrerPolicy:'no-referrer'`.

**Akış (parsel içi lng,lat → ArcGIS spatial query, inSR/outSR=4326, intersects):**
| Katman | Yol | Döner |
|---|---|---|
| MULK_PARSEL | `plan/PlanRaporu/MapServer/0/query` | `ada, parsel, tapu_mah_adi, ilce, alan` (+ parsel-bazlı nc_* imar çoğu null) |
| PLAN ADASI | `plan/PlanRaporu/MapServer/1/query` | **`taks, kaks, emsal, katadedi, maksbinayukseklik, hmax, yapiduzeni, kullanim, altkullanim, onbahcemesafesi/yanbahcemesafesi/arkabahcemesafesi, baslangictarihi, etkinmi`** |

- **etkinmi domain: 0 = Etkin (AKTİF), 1 = Edilgin (pasif)** — `abbPickAda` etkinmi=0 + sayısal-hakkı-dolu olanı öne alır.
- `kullanim`(kısa kod 1-8)/`altkullanim`(TUCBS uzun kod)/`yapiduzeni` **kod→ad** çözümü: **`https://planaski.ankara.bel.tr/webgis/rest/services/mobilServis/uipSade/MapServer/142?f=pjson`** → `types[]` (subtype): `id`=kullanim, `name`=ad, `domains.altkullanim.codedValues`, `domains.yapiduzeni.codedValues`. Resmî app'in (`getKullanimVeAltKullanim`) aynı kaynağı. `abbLoadDecode()` TEK-SEFER fetch + cache (~227KB, yalnız Ankara parselinde); gelmezse gömülü `ABB_KULLANIM`(8 üst-tip)+`ABB_YAPIDUZENI` yedeği. Üst-kullanım: 1 Konut, 2 Kentsel Çalışma, 3 Turizm, 4 Açık/Yeşil, 5 Sosyal Altyapı, 6 Teknik Altyapı(Ulaşım), 7 Teknik Altyapı, 8 Mevcut Korunacak.
- **Veri zenginliği değişken** (1/1000 sayısallaşma): bazı ada TAKS/KAKS/emsal tam (Keçiören 0,4/1,6/1,6; Etimesgut kat4+Blok+çekme), bazı yalnız fonksiyon (Mamak/Pursaklar → `noRights`). İstanbul'un NİP-null derdinin tersine burada YAPISAL geliyor.

**PROVIDER SOYUTLAMASI (parsel.js):** `IMAR_PROVIDERS = {istanbul, ankara}`, her biri `{name, scan, match(il), getParselByPoint(ll,ada,parsel), getPlanInfo(ps,ll,ada,parsel)→normalize parcelImar, getPlanNotuPdf(planId,accept)|null}`. `imarLoad(ll,ada,parsel,il)` il'e göre sağlayıcı seçer (`imarPickProvider`→`match`); ORTAK katman: `imarRender` (başlık/uyarı sağlayıcı-adıyla; scan=false→plan-notu/tara butonları gizli; **yapı nizamı + plan bahçe-çekmesi** satırları eklendi), pdf.js tarama (yalnız İstanbul scan=true), checks.js (`maksTaks/emsal` normalize alanları — değişmedi), io.js (tüm parcelImar+`provider` kaydedilir). `applyData` artık `p.ilAd`'ı geçiyor.
- **TUZAK (düzeltildi):** Türkçe `'İ'.toLowerCase()` → `'i'+U+0307` birleşik nokta → `indexOf('istanbul')` BOZULUR. `imarIlNorm` = NFKD + `[\u0300-\u036f]` strip + lowercase. (Paylaşılan `imarTrNorm`'a dokunulmadı.)
- **Doğrulama (preview :8765, gerçek fetch/CORS/DOM):** Kadıköy→İBB e-Plan TAKS 0,35/Hmax 12,5/plan-notu PDF (regresyonsuz); Keçiören 39.9810,32.8690→Ankara "YERLEŞİK KONUT ALANI" TAKS 0,4/Emsal 1,6/Kat 4, ada 30036/2 Güçlükaya; İzmir→"bu il için sorgu yok". Konsol temiz. `npm test` 17/17.

**Diğer keşfedilen Ankara uçları (ileride):** `forms.ankara.bel.tr/api/tkgm/{ilceListe,mahalleListe/{il},parsel/{il}/{ilce}/...}` (TKGM proxy, ada/parsel ile); `eimar` NIP fallback'leri `baskentcbs.../plan/NIP5000Etkin_Goruntuleme/MapServer/8` + `planaski.../mobilServis/NIP25000Etkin/MapServer/14`. ArcGIS servis dizini açık: `…/server/rest/services?f=json` (folders: plan, tasinmaz, kentrehberi, aktifAski…).

## ✅ İZMİR — Kent Rehberi CBS (commit `0d3122e`, 2026-06-23) — `izmir-imar-recon` workflow ile bulundu
**Tersine mühendislik:** cbsbaskent benzeri yok; cbsbaskent.izmir değil → `cbsbaskent.ankara` modeliyle çok-açılı keşif workflow'u (5 ajan: BB portalı/ArcGIS REST/ilçe e-imar/app bundle/aggregator → curl doğrulama → reçete). Asıl: İzmir Büyükşehir **Kent Rehberi** (`kentrehberi.izmir.bel.tr`, ASP.NET MVC + ArcGIS JS 3.x); backend **ArcGIS REST `https://cbs.izmir.bel.tr/arcgis/rest/services`** — **anonim, token YOK**, **CORS Origin'i yansıtır** (`Access-Control-Allow-Origin: <origin>`; canlı doğrulandı). Servis dizini (`services?f=json`) google'a 302 redirect (dizin gezinme kapalı) AMA tek tek servis/katman/query anonim açık; servis adları app'in `general.js` bundle'ından grep'lendi.

**Akış (parsel içi lng,lat → ArcGIS spatial query, inSR/outSR=4326, intersects):**
| Katman | Yol | Döner |
|---|---|---|
| Parsel | `CbsRehberMulkiyet/MapServer/1/query` | `ADANO`(int), `PARSELNO`(str), `TAPUYUZOLCUMU`, `MAHALLEID`(GUID) (layer 0=Ada) |
| PLAN ADASI | `CbsRehberPlanlar/MapServer/33/query` | `KULLANIM, ALTKULLANIM, YAPIDUZENI, TAKS, KAKS, EMSAL, KATADEDI, MAKSBINAYUKSEKLIK, ONBAHCEMESAFESI/YANBAHCEMESAFESI/ARKABAHCEMESAFESI, UYGULAMAKOSULLARI, ONAMATARIHI` |
| Mahalle/İlçe (ad gerekirse) | `CbsRehber/MapServer/3` (Mahalle) · `/1` (İlçe) | aynı noktayı sor (GUID join gerekmez) — ŞU AN KULLANILMIYOR |

- **DECODE FARKI (Ankara'dan temiz):** `ALTKULLANIM`/`YAPIDUZENI` kod→ad çözümü PLAN ADASI **katmanının KENDİ alan-domain'inde** (`CbsRehberPlanlar/MapServer/33?f=json` → fields[].domain.codedValues). Ayrı decode servisi YOK. `arcgisLayerDomains(layerUrl)` URL-başına cache. `ALTKULLANIM` örn 202405=Meskun Konut Alanları, 202401=Korunacak Meskun Konut; `YAPIDUZENI` 181003=Bitişik Düzen vb. `KULLANIM`'ın domain'i YOK → fonksiyon `ALTKULLANIM`'dan.
- **TUZAKLAR:** (1) `ALTKULLANIM=202400` domain'de **"Boş"** (placeholder) → `imarFnClean` ile null'a çevrilir (panelde gösterilmez). (2) TAKS/KAKS/kat/alan bazı eski plan adalarında **0** → `imarPos` (0→null). (3) Kapsam KISMİ: Bornova/Gaziemir test noktaları 0 feature; Buca/Karşıyaka/Çiğli dolu (kat+nizam+fonksiyon; TAKS/KAKS seyrek). (4) `CbsImarDenetim` TOKEN ister (499) — KULLANMA; `CbsRehberIBBYollar`/bazı RayliSistemler de token'lı.
- **Plan notu:** ayrı PDF ucu yok; `UYGULAMAKOSULLARI` (string) bağlayıcı koşul metni → panelde `im.kosul` "Uygulama koşulu" notu (180 char + title tam metin). `getPlanNotuPdf:null`.
- **Doğrulama (preview :8765):** Buca 27.1769,38.3866 → ada 282/parsel 42, kat 4, Bitişik Düzen ("Boş" fonksiyon gizlendi); Karşıyaka 27.0975,38.4585 → "Meskun Konut Alanları", kat 5. İstanbul/Ankara regresyonsuz. Konsol temiz. `npm test` 17/17.

**FALLBACK (ileride, gerekirse):** İlçe Netcad KEOS e-imar'ları çalışıyor (Bornova/Konak/Çiğli `keos.<ilçe>.bel.tr/imardurumu/`): TKGM ada/parsel → `?type=adaparsel` → OBJECTID → `imar.aspx?parselid=` (HTML parse). AMA nonce bypass gerekli (`svc_nonce` cookie == `X-Service-Nonce` header) + dolaylı. BB ArcGIS yolu çok daha temiz → ilçe yoluna gerek kalmadı.

## ORTAK ALTYAPI (3 sağlayıcı — parsel.js)
`IMAR_PROVIDERS={istanbul,ankara,izmir}`, her biri `{name,scan,match(il),getParselByPoint,getPlanInfo,getPlanNotuPdf}`. `imarLoad(ll,ada,parsel,il)` → `imarPickProvider(il)` (`match` = `imarIlNorm` NFKD'li). ORTAK: `imarRender` (başlık/uyarı sağlayıcı-adıyla; `scan=false`→plan-notu/tara butonu yok; yapı nizamı + bahçe çekmesi + `kosul` satırları), pdf.js tarama (yalnız İstanbul `scan:true`), checks.js (`maksTaks/emsal`), io.js (`provider` dahil tüm `parcelImar`). Generic ArcGIS: `arcgisQuery(layerUrl,ll,outFields)` (Ankara `abbQuery` sarmalayıcı) + `arcgisLayerDomains(layerUrl)`. Yardımcı: `imarPos`(0→null), `imarFnClean`(placeholder→null), `imarIlNorm`(Türkçe İ). **Yeni il eklemek = yeni provider nesnesi + (gerekirse) decode; ortak katman değişmez.**

## 39-İLÇE KAPSAMA ANALİZİ + a/b kararı (2026-06-23, workflow)
37/39 ilçeden örnek parsel → e-Plan pipeline → plan notu (`/tmp/cov/`, scout `cov-scout.js`). 33 plan notu, 34-ajan workflow değerlendirmesi. **autoExtract dağılımı: precise 5 · candidates 10 · manualOnly 7 · none 18.**

**Kritik içgörü:** 18 "none" bir tarayıcı zaafı DEĞİL — değer dokümanda yok. Bunlar **1/5000 nazım** planları; TAKS/KAKS'ı açıkça **1/1000 uygulama planına erteliyor** ("net parsel üzerinden 1/1000'de belirlenecektir"). İBB e-Plan çoğunlukla nazım planı veriyor; asıl yapılaşma hakları **ilçe belediyelerinin 1/1000 UİP**'lerinde (= "İstanbul 39 ilçe" temasının özü).

**KARAR (workflow + onaylandı): anlık tarama + hedefli 7-ilçe küratör. Geniş pre-gömme REDDEDİLDİ** — çünkü 18 ilçede gömülecek değer yok + tadilat bayatlaması + hukuki risk. localStorage cache yalnız hızı çözer, prose çıkarımını değil.

**UYGULANDI (commit 37de6f1) — 3 ucuz/risksiz kazanç:**
- `imarLejandValues`: fonksiyon adının parantezindeki değeri çek (Bahçelievler "(TAKS:0.25 HMAX:12.50M)") → öznitelik boşken al; "(lejand)" etiketi. imarParse'a fallback.
- Deferral-dedektörü (imarScanValues `deferred`): "1/1000'de belirlenecektir"/"net parsel üzerinden"/"avan proje" → "none" ilçelerde boş yerine "değer 1/1000'e ertelenmiş" mesajı.
- Yoğunluk→emsal TÜRETİLMİŞ tahmin (imarParse `emsalEstimate` = yoğunluk×30/10000) — etiketli, bağlayıcı-değil. Node birim + tarayıcı render doğrulandı.

**Sıradaki iyileştirmeler (workflow önerdi, yapılmadı):** prose-pattern motoru · koşul-ayrıştırıcı {threshold,condition,value} · çok-sütun tablo (x-kümeleme) · Hmax çoklu-format normalize · `plans[]`'te 1/1000 UİP varsa onun notunu çek (bazı "none"ları küratörsüz çözebilir).
**7-ilçe küratör iş listesi:** Maltepe(hard,1986 mevzi plan harici), Beylikdüzü(hard,koşullu bonus), Eyüpsultan(med,koruma), Silivri(med,koşullu KAKS), Zeytinburnu(med,koşullu), Şişli(easy), Bakırköy(easy).
**(c) Ankara ABB CBS** = ayrı sağlayıcı, sırada (kesin yapılacak); İzmir sonra. Provider soyutlaması Ankara ile birlikte yazılacak.

## TKGM dayanıklılık (commit ba60dbd, 2026-06-23)
TKGM API host'u `cbsapi.tkgm.gov.tr` bazen **askıda** (TCP kabul, HTTP yanıt YOK) → timeout'suz fetch dakikalarca asılır, "Load failed". (TKGM ana site/`parselsorgu` ayakta olabilir; sorun yalnız bu API host'unda — geçici.) Çözüm: `getJson` 12sn AbortController timeout + `e.network` bayrağı; `sorgula` koordinat akışı TKGM ağ-hatasında **İBB e-Plan getbypoint'e düşer** (`eplanParcelFallback`: noktayı içeren feature `psPipRing` ile seçilir, 3857 ring `psMerc2LL` ile WGS84'e, TKGM-uyumlu GeoJSON → applyData). YALNIZ koordinat yolu + İstanbul (ada/parsel yolu e-Plan ilçe-id istediğinden fallback yok). Mesaj "İBB e-Plan'dan yüklendi (TKGM erişilemedi)". TKGM dönünce tekrar tercih edilir. Test: TKGM düşükken 41.0706,28.9957 → 1993/5 Mecidiyeköy e-Plan'dan yüklendi.

## Tuzaklar
- **Tarayıcıdan (localhost/Capacitor) her e-Plan fetch'inde `referrerPolicy:'no-referrer'`** — WAF localhost Referer'ı 403'ler (TKGM kuralının aynısı). CORS `*` açık, gövde okunur. Proxy GEREKMEZ.
- ArcGIS koord **EPSG:3857**; `ll2merc(lng,lat)` (probe'da ve parsel.js'te var: `tkgmGeoToWorld`/`psGeoBbox` çevresine bak — yoksa ekle).
- `TASDIK_TARIHI` epoch ms.
- JS düzenleyince tarayıcı tutarsız tazeliyor → hard reload / portu artır.

## Mevcut kod entegrasyon noktaları (worktree)
- `parsel.js`: `tkgmLoadParcel(world)` (L220), `initParselSorgu()` (L356; L385-386 yüklemede `#psImar` paneli açılır), `psLiveUpdate()` (L338 TAKS canlı), `psComputeSetback` (L332), `psGeoBbox` (L251)
- `kat-plani-tasarim.html`: `#psImar` paneli (L53) — şu an sadece "İmar çekme (m)" inputu var; imar bilgisi buraya eklenecek
- `checks.js`: TAKS/emsal denetimi (besle)
- `io.js`: `restoreState` parselde imar panelini açar (kaydet/geri-yükle'ye imar verisi eklenebilir)

## ESKİ BULGU (neden gismap değil — arşiv)
gismap.ibb.gov.tr `Plan1000Sayisal`/`Plan5000Sayisal` → **499 Token Required**, token anonim alınamıyor (user/pass şart). cbsproxy gerçek yolu bulunamadı. **e-Plan yolu bunların hepsini gereksiz kıldı.** Eski yoklama dosyası `imar-probe.html` (worktree kökü, untracked) duruyor; artık gerekmiyor.

## Durum / kurtarma
- Branch `worktree-ozellik-deneme` @ `e773ed3` == origin. Geri dönüş: `git reset --hard origin/worktree-ozellik-deneme`.
- `NOTES-imar.md` + `imar-probe.html` worktree'de UNTRACKED.
- Worktree: `/Users/ofbakirci/apps_ofb/katplanitasarim/.claude/worktrees/ozellik-deneme`
