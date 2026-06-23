# Devir Notu — İmar Plan Notu çekme (TKGM parselin devamı)

**Branch:** `worktree-ozellik-deneme` (TKGM parsel dalı; master'a merge edilmedi) · 2026-06-23
**Önce oku:** `NOTES-parsel.md` (TKGM altyapısı — parsel zaten lat/lng + dünya koord olarak yükleniyor).

## ▶ DURUM & SİRADAKİLER (buradan devam — 2026-06-23 session sonu)
İmar özelliği **çalışır + commit'li**: `9f616f9` (ana: e-Plan imar + plan notu tarama + yapı sınırı çiz), `37de6f1` (lejand-gömülü + deferral + emsal tahmini), `ba60dbd` (TKGM düşünce e-Plan fallback + timeout). 17/17 test. Master'a **MERGE EDİLMEDİ**.
**Stratejik karar (39-ilçe workflow):** anlık tarama + hedefli 7-ilçe küratör; geniş pre-gömme REDDEDİLDİ (ilçelerin ~%55'i değeri 1/1000 uygulama planına erteliyor).
**SİRADAKİLER (öncelik sırası):**
1. **(c) Ankara ABB CBS** — İstanbul e-Plan gibi tersine mühendislik (parsel/plan/notu ucu) + **provider soyutlaması** (`getParselByPoint/getPlanInfo/getPlanNotuPdf`; PDF-çıkarım+panel+checks ORTAK). Sonra İzmir. "Kesin yapılacak" denildi.
2. `plans[]`'te 1/1000 UİP varsa onun notunu çek (bazı "none"ları küratörsüz çözer) + 7-ilçe küratör (Maltepe/Beylikdüzü/Eyüpsultan/Silivri/Zeytinburnu hard-med, Şişli/Bakırköy easy).
3. Çıkarım iyileştirmeleri: prose-pattern motoru, koşul-ayrıştırıcı {threshold,condition,value}, çok-sütun tablo (x-kümeleme), Hmax çoklu-format normalize.
4. **master'a PR** (hazır olduğunda).
Detaylar aşağıda "39-İLÇE KAPSAMA" + "TKGM dayanıklılık" bölümlerinde. Scout/PDF verisi `/tmp/cov/` (geçici).

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
