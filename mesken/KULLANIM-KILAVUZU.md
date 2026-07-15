# Mesken — Kullanma Kılavuzu

Mesken, tarayıcıda çalışan; parselini Türkiye imar ve yangın mevzuatına göre kat planına çeviren, sonra bu planı 3B görünüme ve yapay zekâ render'ına taşıyan bir tasarım aracıdır.

**Son güncelleme: 2026-07-15 · Bu kılavuz uygulamanın 2026-07 sürümünü anlatır.**

---

## İçindekiler

1. [Mesken nedir](#1-mesken-nedir)
2. [Başlarken](#2-başlarken)
3. [Adım 1: Sınır + Yerleşim](#3-adım-1-sınır--yerleşim)
4. [Planı düzenleme](#4-planı-düzenleme)
5. [Katlar, bloklar, site](#5-katlar-bloklar-site)
6. [Mevzuat denetimleri](#6-mevzuat-denetimleri)
7. [Adım 2: 3B görünüm](#7-adım-2-3b-görünüm)
8. [Adım 3: Kamera](#8-adım-3-kamera)
9. [Malzeme, cephe ve mobilya](#9-malzeme-cephe-ve-mobilya)
10. [Adım 4: Render](#10-adım-4-render)
11. [Adım 5: Döşe](#11-adım-5-döşe)
12. [Dışa ve içe aktarma](#12-dışa-ve-içe-aktarma)
13. [Kısayollar ve dokunmatik](#13-kısayollar-ve-dokunmatik)
14. [Yakında gelecek özellikler](#14-yakında-gelecek-özellikler)
15. [Bilinen sınırlar](#15-bilinen-sınırlar)
- [Ek A. Sözlükçe](#ek-a-sözlükçe)
- [Ek B. Geliştirici / ajan notu](#ek-b-geliştirici--ajan-notu)

---

## 1. Mesken nedir

Mesken, bir parselden başlayıp fotogerçekçi bir daire render'ına kadar giden akışı tek pencerede toplar. Önce arsanın sınırını ve imar koşullarını tanımlarsın; motor sana mevzuata uygun bir kat planı kurar (koridor, çekirdek, daireler); planı 3B bir "dollhouse" görünümüne çevirirsin; iç ve dış kameralar yerleştirirsin; ve seçtiğin kadrajları yapay zekâ ile boyayıp gerçek bir görsele dönüştürürsün. Aradaki her adım gerçek motor üstünde çalışır — plan çizimi, mevzuat denetimi ve 3B modelin tamamı tarayıcının içinde, tek bir teknik alt yapıyla üretilir.

Akış beş adımdır ve hep aynı sırayı izler:

| Adım | Ad | Ne yaparsın | Sonraki adıma geçiş düğmesi |
|---|---|---|---|
| 1 | Sınır + Yerleşim | Parsel/imar tanımlar, bina ve daire tiplerini girer, planı ürettirirsin | **"3B Görüntüle"** |
| 2 | 3B | Planı 3B dollhouse olarak gezer, katmanları açıp kapatırsın | **"Kamera Yerleştir"** |
| 3 | Kamera | İç ve dış (drone) kameralar yerleştirir, açı/lens/gün saati ayarlarsın | **"Render Kadrajları"** |
| 4 | Render | Kadrajları seçip yapay zekâ ile üretirsin (tek ücretli adım) | **"Kareleri Üret"** |
| 5 | Döşe | Üretilen render'ları toplar, dışa aktarırsın | **"Planı Dışa Aktar"** |

<!-- GORSEL 01: adim-1 genel ekran — sol panel Bina sekmesi acik + uretilmis kat plani tuvalde + panel altinda denetim ozeti; ust seritte 5 adimlik akis gorunur -->

> **Kredisiz mi, ücretli mi?**
> Mesken'in neredeyse tamamı **kredisiz** çalışır: plan çizimi, mevzuat denetimi, 3B görünüm, kamera yerleştirme, malzeme ve mobilya döşeme, 3B görünümü PNG olarak indirme, kadraj küçük görselleri ve "kendi-açı" önizlemeler — hepsi tarayıcının içinde, hiçbir ücret çıkarmadan üretilir.
> **Tek ücretli nokta:** Adım 4 (Render) içinde **"Üret"** onayına bastıktan sonra tetiklenen gerçek yapay zekâ üretimi. Onay penceresinde "Bu işlem render kredisi harcar" uyarısını görürsün. Bu uyarı bilgilendirme amaçlıdır; şu an gerçek bir bakiye/ödeme sistemi bağlı değildir (bkz. Bölüm 15).

---

## 2. Başlarken

### Beş dakikada ilk render'a

Aceleci bir turu şöyle özetleyebiliriz; her adım kendi bölümünde ayrıntılı anlatılır:

1. Sağ üstten **"Profesyonel"** moda geç (parsel/imar araçları için).
2. **"Parsel/İmar"** sekmesinden parseli getir — ya da denemek için araç çubuğundaki **"Örnek sınır"**a bas (32x16 m dikdörtgen).
3. **"Bina"** sekmesinde bina tipini, kat sayısını ve en az bir daire tipini gir.
4. Panelin altındaki **"Yerleşimi Oluştur"**a bas; motor koridor + çekirdek + daireleri kursun.
5. Alttaki mevzuat özetini oku; gerekirse sağ tık menüsü ve duvar tutamaçlarıyla ince ayar yap.
6. Sağ alttaki akış düğmeleriyle ilerle: **"3B Görüntüle"** (Adım 2'ye) → **"Kamera Yerleştir"** (Adım 3'e) → **"Render Kadrajları"** (Adım 4'e).
7. Adım 4'te bir kadraj seç, **"Üret"**e bas ve onayla — ilk yapay zekâ render'ın burada çıkar (tek ücretli adım).

Sunumda kredi harcamadan denemek istersen URL'ye `?demo=1` ekle (Bölüm 10).

### Sık karşılaşılan durumlar

| Gördüğün | Neden / ne yapmalısın |
|---|---|
| **"Yerleşimi Oluştur"** pasif | Bina sınırın henüz kapatılmamış ya da hiç daire tipi girilmemiş. İkisini tamamla. |
| Parsel/İmar araçları görünmüyor | Basit moddasın. Sağ üstten **"Profesyonel"**e geç. |
| "Render sunucusu çalışmıyor görünüyor…" | Yerel köprü kapalı. Köprüyü kur (`npm run mesken:server`) ya da `?demo=1` ile demo modunda gez. |
| 3B'de kat boş/beklenmedik görünüyor | Aktif kat konut-dışı (otopark/ticari). 3B otomatik ilk konut katına geçer; hiç konut yoksa dış görünüme düşer. |
| "Görüntüyü indir (PNG)" yapay zekâ render'ı mı? | Hayır. Tarayıcı içi 3B görüntü kaydıdır, kredisizdir. |

### Ekran düzeni

Ekranın en üstünde Mesken şeridi durur: beş adımlı akış göstergesi, **"Paket Aç"** / **"Paket İndir"** düğmeleri ve Basit/Profesyonel mod seçici. Onun altındaki her şey plan motorunun kendisidir.

Motorun başlık çubuğunda sol üstte **"Paneli aç/kapat"** düğmesi vardır (mobilde sol çekmeceyi açar); yanında "Kat Planı Tasarım Aracı" başlığı, "Türkiye mevzuatına göre şematik kat planı üretici — Planlı Alanlar İmar Yönetmeliği & Yangın Yönetmeliği" alt yazısı ve **"Tur"** düğmesi bulunur.

- **Sol panel** üç sekmelidir: **"Bina"** (bina tipi, kat sayısı, koridor yönü, lejant), **"Parsel/İmar"** (yalnız Profesyonel modda; TKGM parsel sorgu, imar çekmesi, yapı sınırı) ve **"Daireler"** (daire tipleri, dışa/içe aktarma).
- **Sağ ana alan** SVG tuvalidir. Üstünde dikey bir araç çubuğu (**"«"** ile daraltılıp genişletilir), altında durum çubuğu (imleç koordinatı, Alan, Çevre, ipucu), sağ altta yakınlaştırma kaydırıcısı bulunur. Tuvalin üstünde yüzen **"Daire Tablosu"** ve **"Geçmiş"** panelleri ile sağ tık bağlam menüsü vardır.
- Panelin altında sabit duran birincil düğme **"Yerleşimi Oluştur"** ve hemen altında canlı mevzuat denetim özeti yer alır.
- Kat sekmeleri ve blok sekmeleri tuvalin üstünde yüzer; "KAT" / "BLOK" gripinden tutup sürükleyebileceğin kutulardır.

### Basit / Profesyonel mod

Sağ üstteki mod seçicide iki düğme vardır:

- **"Basit"** — sade çizim ve daire araçları. Parsel ve imar tümüyle gizlidir. Yeni başlayan ya da hızlı taslak isteyen için.
- **"Profesyonel"** — parsel, imar ve tüm araçlar açık. TKGM sorgusu, imar durumu, bodrum sayısı, kat yüksekliği, "katları ayrı planla", site, kat kullanım tipi, duvar kalınlıkları ve parsel/park/site imkan araçları yalnız bu modda görünür.

Seçimin `localStorage`'da hatırlanır; varsayılan **Basit**'tir. Bu kılavuzdaki parsel/imar anlatımı Profesyonel modu varsayar.

### "Tur" düğmesi — iki rehberli tur

Mesken'de ekranı karartıp hedef öğeye spotlight tutan, açıklama kartıyla ilerleyen iki onboarding turu vardır. Her kartta başlık, metin, "n / toplam" sayacı, ilerleme çubuğu, atlanabilir adımlarda **"Atla"** düğmesi, varsa bir aksiyon düğmesi ve kapat bulunur. İlgili UI etkileşimini yaptığında tur kendiliğinden bir sonraki adıma geçer.

- **Ana tur (13 adım)** — başlık çubuğundaki **"Tur"** düğmesiyle elle başlatılır (ilk açılışta da gelebilir). Profesyonel moda geçişten planı dışa aktarmaya kadar tüm akışı gezdirir. Basit moddayken Profesyonel gerektiren bir adıma gelince kart "Bu adım Profesyonel modda çalışır" uyarısı ve bir **"Profesyonel moda geç"** düğmesi gösterir.
- **Kamera 3B mini-turu (6 adım)** — 3B görünümde kamera aracını açtığında kendiliğinden başlar. Kamera yerleştirmeden dış render'a kadar kamera panelini tanıtır (ayrıntı Bölüm 8).

<!-- GORSEL 02: ana tur spotlight — ekran karartilmis, "Profesyonel moda gec" adimi vurgulu, aciklama karti "1 / 13" sayaci ve ilerleme cubugu ile -->

### Proje paketi: "Paket Aç" / "Paket İndir"

Çalışmanın tamamını (plan, geometri, kameralar, mobilya, render'lar) tek bir taşınabilir dosyaya, **.mskpkg** paketine yazabilirsin.

- **"Paket İndir"** — projeni `proje-YYYYAAGG.mskpkg` olarak indirir. En erken Adım 2'den itibaren aktiftir; öncesinde "Önce bir yerleşim oluşturun" notu görürsün.
- **"Paket Aç"** — kayıtlı bir paketi geri yükler. Pencereye `.mskpkg` dosyasını sürükleyip bırakabilirsin de.

Ayrıntılar Bölüm 12'de.

---

## 3. Adım 1: Sınır + Yerleşim

Bu adım gerçek plan motorudur ve tüm akışın temelidir. Ana hedefin, panelin altındaki **"Yerleşimi Oluştur"** düğmesine basabilecek noktaya gelmek: yani kapalı bir bina sınırın ve en az bir daire tipin olsun.

### 3.1 Parsel ve imar (Profesyonel)

Profesyonel modda **"Parsel/İmar"** sekmesi, tasarımı gerçek bir arsaya oturtmanı sağlar.

<!-- GORSEL 03: Parsel/Imar sekmesi — ust'te TKGM sorgu kutusu, altta Imar Durumu paneli (TAKS/KAKS/Hmax/cekmeler), en altta cekme grid'i -->

**TKGM parsel sorgusu.** İki giriş yolu vardır:

- **Koordinat veya link:** "Koordinat veya Google Maps linki" kutusuna enlem/boylam (örn. 41.0082, 28.9784) ya da bir Maps linki yapıştır, **"Parseli Getir"**e bas (kutu boşken düğme pasiftir). Google Maps'in kısa linkleri (`maps.app.goo.gl` gibi) çözülemez; tam URL kullan ya da haritada "sağ tık → koordinatı kopyala" yap.
- **Ada/parsel ile:** "ya da il/ilçe/mahalle + ada/parsel ile" açılır kutusundan İl / İlçe / Mahalle'yi sırayla seç (art arda etkinleşir), Ada No ve Parsel No'yu gir, **"Ada/Parsel ile Getir"**e bas.

Hiç sorgu yapmadan denemek istersen: ana turun "Parseli getir" adımındaki **"Örnek parselle devam"** düğmesi, ağa istek atmadan statik bir örnek parsel yükler.

TKGM API'sine erişilemezse İstanbul için otomatik olarak İBB e-Plan yedek sorgusuna düşülür. Kayıt yoksa "Bu konumda kayıtlı parsel yok" mesajı gelir. Başarılı sorguda "Parsel yüklendi" bildirimiyle birlikte konum, Ada/Parsel no, alan ve nitelik gösterilir; parsel tuvale otomatik yüklenir ve imar durumu sorgusu kendiliğinden tetiklenir.

**İmar durumu paneli.** İl'e göre üç sağlayıcıdan biri kullanılır:

| Sağlayıcı | İl | Notlar |
|---|---|---|
| İBB e-Plan | İstanbul | Sayısal TAKS/KAKS yoksa plan notu metni taranır |
| Ankara Başkent CBS | Ankara | TAKS/KAKS/Hmax/kat adedi/yapı nizamı/bahçe çekmeleri doğrudan gelir |
| İzmir Kent Rehberi | İzmir | CBS üzerinden |

Panelde şunlar gösterilir: TAKS (maks), KAKS/Emsal, Hmax, Kat adedi, Yapı nizamı, Yoğunluk (kişi/ha), bahçe çekmeleri (ön/yan/arka), plan adı ve tasdik tarihi, "Uygulama koşulu" notu. **"Plan notu (PDF)"** düğmesi ilgili belgeyi indirir. Plan notundan otomatik taranan TAKS/KAKS chip'lerine ya da **"Plan notundan değerleri tara"**ya tıklarsan değer doğrudan imar limitine uygulanır. Panelin altında "resmî imar durumu belgesi ile teyit edin" uyarısı bulunur — bu araç bir ön-değerlendirme aracıdır, resmî belge yerine geçmez.

*TAKS = Taban Alanı Katsayısı (binanın parsele oturan tabanının parsele oranı). KAKS/Emsal = toplam inşaat alanının parsele oranı. Çekme mesafesi = binanın parsel sınırına yaklaşamayacağı en az mesafe.*

**Çekme mesafeleri.** "İmar çekmesi (m)" ızgarasında **"Ön (yol)"**, **"Yan"**, **"Arka"** değerleri girilir (varsayılan 5 / 3 / 3 m); plan notundan otomatik dolabilir.

**Yol cephesi.** Kapalı bir parselde bir kenara tıklayarak o kenarı yol cephesi olarak seçer ya da seçimi kaldırırsın. Ön çekme bu cepheye göre uygulanır.

**Yapı sınırı çizimi.** **"Parsele yapı sınırı çiz (çekme sınırı)"** düğmesi, girdiğin çekmelere göre içerlek yapı sınırını otomatik çizer. Ardından **"TAKS'a sığdır (taban alanını sınıra küçült)"** (yalnız Profesyonel) ile taban alanını TAKS limitine indirebilirsin.

**Döndürme (eksene hizala).** Parseli koordinat eksenine oturtmak için: -1 / +1 derece düğmeleri, kaydırıcı ve sayısal giriş (-180..180), **"Otomatik hizala"**, **"Kenara çevir"** ve sıfırlayan **"Kuzey"** düğmesi. Parsel yüklendiğinde otomatik olarak eksene hizalanır.

**Uydu görüntüsü.** **"Uydu görüntüsü (arka plan)"** anahtarı, tuvale arka plan olarak uydu görüntüsü koyar.

> **İpucu.** Bina çizerken köşeler parsel ve çekme çizgisine yapışır (snap); bahçe, TAKS ve çekme değerleri otomatik hesaplanır. Yani parseli bir kez doğru yerleştirdiğinde, sınırını çizmek büyük ölçüde kılavuzlanır.

### 3.2 Bina bilgileri ve daire tipleri

**"Bina"** sekmesindeki "Bina Bilgileri" paneli, motorun ne üreteceğini belirler:

- **"Bina tipi"** — Apartman / Müstakil Villa.
- **"Kat sayısı (zemin + üst)"** — 1-30.
- **"Bodrum sayısı (eksi katlar)"** (Profesyonel) — 0-4. Bodrumlar eksi indekslidir; varsayılan olarak en alt bodrum Otopark'a ayarlanır.
- **"Kat yüksekliği (m)"** (Profesyonel) — 2,6-4 m.
- **"Katları ayrı planla"** anahtarı (Profesyonel; villa ya da apartmanda 2+ kat) — her katı bağımsız planlar (Bölüm 5).
- **"Site (çoklu blok) (A B C…)"** anahtarı (Profesyonel) — çoklu blok modunu açar.
- **"Koridor yönü"** — Otomatik / Yatay / Dikey.
- **"Çıkma (üst katlar öne)"** anahtarı ve **"Çıkma derinliği (m)"** (0,5-1,5 m) — yalnız 3B kabuğunu etkiler, planı değiştirmez.
- **"Çatı"** — Teras (düz) / Kırma (kiremit); yalnız 3B/render'ı etkiler.
- **"Bu katın kullanımı"** (Profesyonel + katları ayrı) — Konut / Ticari (dükkân) / Otopark / Sığınak.
- **"Duvar kalınlıkları (mevzuat min.)"** açılır bölümü (Profesyonel) — Dış duvar / Daire arası / İç bölme (m). Yalnız mevzuat minimumunun üzerine çıkarılabilir; sadece çizimi değiştirir, oda alanlarını etkilemez.

**"Daireler"** sekmesindeki "Daire Tipleri (kat başına)" panelinde her daire tipi bir karttır. Kart başlığı otomatik özetlenir (örn. "2+1 (ebeveyn banyolu)", "0+1 (stüdyo, açık mutfak)"). Kart alanları:

- **"Oda"** sayısı (villada 0 = salonsuz kat)
- **"Salon (0 = stüdyo)"**
- **"Ebeveyn banyosu"** anahtarı
- **"Açık mutfak"** anahtarı
- **"Adet"** (villada gizli)
- kart silme ve **"+ Daire tipi ekle"**

*Piyes = bir bağımsız bölümdeki her bir bağımsız oda/hacim (salon, yatak odası, mutfak gibi); mevzuat her piyes için en az alan ve en az kenar ölçüsü şart koşar.*

**"Bina"** sekmesi ayrıca bir **lejant** (renk açıklaması) içerir; tuvaldeki oda renklerinin hangi oda tipine karşılık geldiğini buradan okuyabilirsin. Yeni başlarken hızlı denemek için araç çubuğundaki **"Örnek sınır"** ile 32x16 m'lik bir dikdörtgeni tek tıkla yükleyip doğrudan **"Yerleşimi Oluştur"**a geçebilirsin.

### 3.3 Yerleşimi oluşturma

Sınırın kapalı ve en az bir daire tipin tanımlıysa **"Yerleşimi Oluştur"** düğmesi etkinleşir. Bu düğme, motoru çalıştırır: motor koridoru, çekirdeği (merdiven / asansör / yangın merdiveni) ve daireleri otomatik yerleştirir. Sınır kapatılmadan ve en az bir daire tipi girilmeden düğme pasiftir.

Üretimden sonra panelin altında canlı bir mevzuat denetim özeti belirir (Bölüm 6). Buradan sonra planı elle inceleyip ince ayar yapabilirsin.

<!-- GORSEL 04: "Yerleşimi Oluştur" sonrasi — uretilmis apartman kat plani; koridor, cekirdek (merdiven/asansor) ve numarali daireler; her odada TR etiket -->

---

## 4. Planı düzenleme

Plan üretildikten sonra araç çubuğundaki araçlarla her ayrıntıyı elle düzeltebilirsin. Her araç bir toggle düğmesidir; kısayolu parantez içindedir. Aktif aracın adı ve ipucu, tuvalin üstünde rozet olarak görünür.

### Araç araç

| Araç | Kısayol | Ne yapar |
|---|---|---|
| **"Çiz"** | D | Varsayılan araç. Tıkla = köşe ekle; çift-tık ya da ilk köşeye tık = sınırı kapat; Space basılı = geçici kaydırma. |
| **"Oda Çiz"** | O | Üretimden sonra bir daire üstünde serbest kapalı poligon çizerek yeni bir ODA (nötr tip) oluşturur. Esc iptal. |
| **"Kapı"** | K | Sürükleyerek komşu duvar segmentine taşı; çift-tık = kapı ekle/sil (iç kapı ya da zeminde dış giriş); sağ tık = varsayılan konuma döndür. |
| **"Pencere"** | W | Cepheye çift-tık = ekle; sürükle = taşı; çift-tık = sil. Oda tipi fark etmez — antre, koridor ve apartman holü de dış cepheye değiyorsa pencere alabilir (otomatik öneri yalnız salon/yatak/mutfağa çalışır; diğerlerine elle eklersin). Seçince panel: Genişlik (0,6-3 m), Yükseklik (0,6-2,7 m), Parapet (0-1,5 m), "Tam boy cam" onay kutusu. Genişlik 2B'de görünür; yükseklik ve parapet yalnız 3B'yi etkiler. |
| **"Balkon"** | B | Dış duvara tıkla = ekle (en az 1 m kenar teması); uç ve derinlik tutamaçlarından boyutlandır; sağ tık ya da Del = sil. Eğik dış duvarda da çalışır. |
| **"Avlu, aydınlık boşluğu"** | A | Bina sınırı içinde sürükleyerek dikdörtgen avlu oyar; gövdeden taşı, kenar/köşeden boyutlandır; sağ tık = sil. Derin/karanlık taban tespitinde "orta bölge için avlu önerilir" ipucu ve tek tıkla yerleştirme sunar. Avluya bakan kenarlar cephe/pencere sayılır. |
| **"Yapı, çekirdek"** | Y | Merdiven/asansör/yangın merdiveni/teknik-şaft bölgelerini ve bina dış sınırını sürükleyip boyutlandırır (aşağıda ayrıntılı). |
| **"Parsel"** (Pro) | P | Parsel poligonunu elle çizmek için. |
| **"Site görünümü"** (Site açıkken) | S | Tüm bloklar parselde; bloğa tıkla = düzenle, sürükle = taşı. |
| **"Park düzeni"** (otopark katında) | T | Alt çubuk: "Oto"/"Yatay"/"Dikey" yön, "Sıfırla"; tıkla = park yeri ekle/sil, sürükle = taşı, R = yön çevir. |
| **"Site imkanları"** (parsel/bahçe varken) | I | Alt çubuk: "Yeşil Alan"/"Çocuk Parkı"/"Yüzme Havuzu"/"Süs Havuzu"/"Oturma / Pergola", "Döndür" (R), "Büyüt +"/"Küçült −"; tıkla = ekle/sil, sürükle = taşı; bahçeye yerleşir. |
| **"Ölçü"** | M | İki noktaya tıkla = aradaki mesafeyi ölç. İlk tıktan sonra imleci izleyen canlı önizleme; ikinci tıkla ölçüm ekranda kalır, yeni tık eskisini siler; Esc = temizle. Noktalar 0,5 m ızgaraya yapışır; ölçüm dışa aktarılan görsele girmez. |

**"Yapı, çekirdek"** aracının tutamaç dili: mavi kare tutamaç boyutlandırır, mavi daire ve artı taşır; turuncu tutamaçlar bina sınırının köşe/kenarlarıdır (kenara tıklayınca yeni köşe açılır). Eleman ekleme/silme sağ tık menüsündendir: **"Yapı elemanı ekle"** → **+ Merdiven** / **+ Asansör** / **+ Yangın merdiveni** / **+ Teknik-şaft**; mevcut bir öğeye sağ tık → sil.

**Görünüm araçları:** **"Kaydır"**, **"Ekrana sığdır"**, **"Örnek sınır"** (32x16 m deneme dikdörtgeni — motoru hızlıca denemek için) ve **"3B Görünüm"**. Ayrıca araç çubuğunu daraltıp genişletme ve yakınlaştırma (+/− + kaydırıcı + yüzde) burada.

### Duvar sürükleme ve turuncu ayırıcılar

Tuvalde doğrudan sürükleyerek düzen değiştirebilirsin:

- Aynı dairenin iki odası arasındaki **duvar parçası** (kare tutamaç) 0,5 m adımlarla sürüklenir. Donör odanın bütünlüğü korunur ve odalar 1 m²'nin altına düşmez.
- **Shift + sürükleme:** aynı hizadaki tüm duvar parçaları birlikte taşınır. Shift'siz sürüklemede yalnız tek parça taşınır (sınırda kademe açılabilir).
- **Turuncu ayırıcı (cut) tutamaçları:** daire sınırlarını taşır. Plan yeniden dizilir ama etkilenmeyen dairelerdeki elle düzenlemeler korunur.

<!-- GORSEL 05: duvar surukleme — iki oda arasindaki kare tutamac ve Shift ile ayni hizadaki parcalarin birlikte tasinmasi; bir daire sinirinda turuncu ayirici tutamac -->

### Sağ tık menüsü (üretim sonrası)

Bir odaya sağ tıkladığında zengin bir bağlam menüsü açılır.

**"Bu odadan oyarak ekle":** + YATAK ODASI, + EB. YATAK ODASI, + EB. BANYO (yalnız yatak odasından), + SALON, + OTURMA ODASI, + MUTFAK, + BANYO, + WC, + KİLER. Antresiz bir dairede ayrıca **"+ ANTRE (girişi yeniden oluştur)"** çıkar. Antre üstünde **"Antreyi kırp (fazlalık odalara)"** seçeneği ve "Antre silinemez" notu bulunur.

**"Düzenle" alt menüsü:**
- **"Tipini değiştir…"** — Yatak odası / Eb. yatak odası / Salon / Oturma odası / Mutfak / Banyo / WC / Çalışma odası / Kiler.
- **"Başka odayla takas et…"**
- **"Odayı dikine böl"** / **"Odayı enine böl"**
- Mutfakta: **"Açık mutfağa dönüştür (mutfağı salona kat)"**
- Dairede hiç mutfak yoksa salonda: **"Salon + Mutfak'a çevir (açık mutfak)"** — hücre taşımadan salonu açık mutfaklı sayar; "ayrı mutfak yerleştirilemedi" uyarısı söner. Tipini değiştir ile SALON'a geri dönersen uyarı yeniden devreye girer.
- Antreye komşu değilse: **"Antreyi bu odaya uzat (kapı erişimi)"**
- **"Odayı sil (komşuya katılır)"** — "Tek salon silinemez" koruması vardır.

**"Daire iç düzeni" alt menüsü (apartman):** **"Otomatik"** / **"Odalar yan yana"** / **"Yatak odaları derinlemesine"**.

**Daire seviyesi:** **"Daireyi başka daireyle takas et…"** ve **"Daireyi sil (komşuya kat)"**. Ayrıca **"Yapı elemanı ekle…"**.

**Apartman holü (koridora sağ tık):** **"Holü çekirdeğe uzat (N ulaşılamayan)"**, **"Holü sağa/aşağı uzat"**, **"Holü sola/yukarı uzat"**. Holü genişletmek/daraltmak için holün kenar duvarındaki **mavi tutamacı** sürükle.

**Çekirdek öğesine sağ tık:** sil + eleman ekle. **Ortak alan artığına sağ tık:** **"Apartman holüne kat (çekirdek erişimi aç)"** ve **"Komşulara dağıtıp sil"** ("Sığınak silinemez" koruması). **Balkona sağ tık:** **"Balkonu sil"**. **Avluya sağ tık:** **"Avluyu sil"**.

<!-- GORSEL 06: oda sag tik menusu — "Bu odadan oyarak ekle" ve "Duzenle" alt menuleri acik, secenek listesi gorunur -->

### Geri/İleri al ve Geçmiş paneli

- **"Geri al"** (Ctrl/Cmd+Z) — önce elle düzenlemeleri adım adım geri alır. Yığın boşalınca "Plan SİLİNİP çizim aşamasına dönülsün mü?" onayı çıkar.
- **"İleri al"** (Ctrl/Cmd+Shift+Z ya da Ctrl/Cmd+Y).
- **"Değişiklik geçmişi"** — yüzen **"Geçmiş"** panelini açar: kronolojik liste (Duvar taşındı / Kapı / Balkon / Avlu / Otopark / Oda tipi / Daire taşındı / Çekirdek / Sınır köşesi / Oda çizildi / Site imkanı vb.), "şimdi" işareti ve satıra tıklayınca o adıma zıplama.
- **"Temizle"** — aktif kat/blok çizimini sıfırlar.

### Yardımcı paneller ve durum çubuğu

- **"Daire Tablosu"** — tuvalin üstünde yüzen, gripinden taşınabilen bir paneldir; dairelerin listesini gösterir ve bir satıra tıklamak ilgili odaya odaklar. Aynı davranış **"Geçmiş"** paneli için de geçerlidir.
- **Durum çubuğu** — tuvalin altında imleç koordinatını, seçili çizimin Alan ve Çevre değerlerini ve aktif araca dair ipucunu gösterir.
- **Yakınlaştırma** — sağ altta +/− düğmeleri, bir kaydırıcı ve yüzde göstergesi bulunur; **"Ekrana sığdır"** ile de tüm çizimi ekrana oturtabilirsin.

---

## 5. Katlar, bloklar, site

### Kat sekmeleri

Kat ekleme "Kat sayısı" ve "Bodrum sayısı" alanlarından yapılır; bodrumlar eksi indekslidir. Kat sekmeleri tuval üstünde yüzer: en üst kat solda, bodrumlar sağda. Her sekmede kat adı, alan (m²) ve kullanım ikonu görünür. Henüz planlanmamış bir kat "Henüz planlanmadı — geçince komşu katın sınırıyla başlar" der. Sekmeye tıklamak o kata geçirir.

### Kat kullanım tipleri

Profesyonel modda "katları ayrı planla" açıkken (apartman) her kata bir kullanım verebilirsin:

| Tip | Motor davranışı |
|---|---|
| Konut | Girilen daire tipleri uygulanır. |
| Ticari (dükkân) | Daire tipleri uygulanmaz; çekirdek düşeyde korunur. |
| Otopark | Araç alanı + çekirdek. |
| Sığınak | Sığınak hacmi + kalan otopark. |

### Katları ayrı planla ve kat düzeni kopyala

"Katları ayrı planla" açıkken her katın kendi sınırı, programı ve düzenlemesi olur. **"Bu kat düzenini kopyala"** düğmesi aktif katın tam düzenini tamponlar; uyumlu hedef katları (aynı kullanım tipi + aynı taban, ya da hiç ziyaret edilmemiş) onay kutularıyla listeler; **"Uygula"** ile toplu basar, **"Vazgeç"** ile kapatırsın. **"Yapı iskeletini sıfırla"** çekirdeği varsayılana döndürür.

### Villa özellikleri

Villa'da **"Katları ayrı planla"** kullandığında motor şu kurallara uyar: iç merdiven tüm katlarda düşey hizalı olmalı; her kat oturumu zeminin en az %70'i olmalı; üst kat en çok 1,5 m taşabilir (çıkma); üst kata sokak kapısı çizilmez.

### Site modu (çoklu blok)

Profesyonel modda **"Site (çoklu blok)"** anahtarıyla açılır. Her blok kendi tam durumunu taşır:

- **"+ Blok"** boş bir blok ekler; **"Kopyala"** aktif bloğu yanına kopyalar (A, B, C…).
- Düzenlenmeyen bloklar soluk "hayalet" ve harfleriyle görünür.
- **"Site görünümü"** aracıyla (kısayol S): bloğa tıkla = düzenle, sürükle = taşı.
- Parsel site-ortaktır: yeni blok mevcut parseli devralır. TAKS = toplam blok tabanı / parsel; KAKS = toplam(taban × kat) / parsel.
- Yalnız Site modunda görünen "Site özeti" paneli: blok sayısı, toplam taban (TAKS) ve toplam inşaat alanı (KAKS/emsal).

<!-- GORSEL 07: Site modu — parsel uzerinde A/B/C bloklari; biri secili (net), digerleri hayalet; Site ozeti paneli kosede -->

---

## 6. Mevzuat denetimleri

Mesken'in özü, planı ürettiği anda ve her düzenlemeden sonra Türkiye imar ve yangın mevzuatına göre denetlemesidir.

### Nasıl okunur

Panelin altında özet bir satır durur: **"N sorun · N bilgi · N tamam"** ve bir **"Aç"** düğmesi. **"Aç"** ile **"Mevzuat Kontrolü"** popup'ı açılır; üç katlanabilir bölüm vardır: **"Tamam"** (kapalı gelir), **"Sorunlar"** (açık gelir), **"Bilgi"** (açık gelir). Popup Esc, kapat düğmesi ya da dışına tıklama ile kapanır.

Bir bölgeye bağlı satıra tıklamak popup'ı kapatır ve tuvalde o alana yakınlaştırır. Bazı sorun satırlarında bir **"Öneri"** düğmesi bulunur: seni ilgili odağa götürür ve durum çubuğunda bir ipucu gösterir — ama otomatik düzeltme YAPMAZ; kararı sen verirsin.

<!-- GORSEL 08: "Mevzuat Kontrolü" popup — Sorunlar/Bilgi/Tamam katlanir bolumleri; bir sorun satirinda "Oneri" dugmesi -->

### Denetlenen kuralların özeti

| Kural | Dayanak | Ne kontrol eder |
|---|---|---|
| Piyes ölçüleri | PAİY | Salon 12 m² / 3,0 m min kenar (açık mutfaklıysa 15,3 m²), Yatak odası 9 m² / 2,5 m, Mutfak 3,3 m² / 1,5 m, Banyo 3 m² / 1,5 m, WC 1,2 m² / 1,0 m, eb. banyo. |
| Oda programı raporu | PAİY | "N yataktan M tanesi yerleştirilebildi", "Banyo/Salon yerleştirilemedi", "Ayrı mutfak istendi ama yerleştirilemedi". |
| Doğal ışık / pencere | PAİY md.30 | Dış cepheye açılmayan oda = sorun; penceresiz mutfak = ayrı bilgi ("doğalgaz bağlanamaz"). |
| Biçim / doluluk | — | Dikdörtgen doluluk oranı eşiği altındaki odalara "biçimsiz" uyarısı. |
| Erişim / kapı | — | Oda antreye (ya da eb. banyo yatak odasına) komşu değilse "kapı verilemez". |
| Apartman holü genişliği | — | En dar nokta mevzuat min altına düşerse "koridor daralmış". |
| Merdiven | PAİY M.40 / BYKHY M.41 | 3,0×5,0 m çekirdek, kol genişliği, kova/kuyu boyutları, erişilebilir kabin (EN 81-70). |
| Yangın güvenlik holü | BYKHY M.34/M.48/M.63/M.89 | Yüksekliğe göre 2. kaçış merdiveni, korunumlu merdiven + basınçlandırma, acil durum asansörü. |
| Asansör | — | 3 kat → yer ayrılması, 4+ → 1 asansör, 11+ kat → 2 asansör. |
| Kaçış mesafesi | — | En uzak daire kapısından merdivene azami mesafe. |
| Sığınak | — | 8'den çok bağımsız bölümde gereklilik, alan (m² ve kişi başı) yeterliliği, betonarme kabuk / havalandırma / iki çıkış notu. |
| Teknik/tesisat şaftı | — | Kat başına daire eşiğinde otomatik. |
| Otopark | Otopark Yönetmeliği Ek-1 | 2,5×5 m dik park + 5 m manevra; rampa eğimi %15 notu. |
| Ticari kat | — | Islak hacim, vitrin cephesi, konuttan ayrı giriş; yangın çıkışı / engelli erişim / ruhsat notu. |
| Villa / katları ayrı | PAİY | Kat oturum oranı (>=%70), çıkma <=1,5 m, iç merdiven hizası, "Evde hiç salon yok" ihlali, ıslak hacim düşey çakışma bilgisi. |
| Parsel / imar | — | Sınırın parsel dışına taşması, TAKS/KAKS hesabı ve limit kıyası, en küçük çekme. |
| Avlu | — | Kısa kenar < 1,5 m → sorun (hava bacası yetersiz), alt katlara ışık önerisi, avlunun koridoru bölmesi. |
| Bloklar arası (Site) | — | Çakışma ya da mesafe < 6 m → sorun. |
| Balkon | PAİY md.41 | Çekme sınırından taşma (>1,5 m açık çıkma), derinlik önerisi, parsel dışına taşma. |

*PAİY = Planlı Alanlar İmar Yönetmeliği. BYKHY = Binaların Yangından Korunması Hakkında Yönetmelik.*

> **Not.** Denetimler tasarım kararlarına yardımcı ön-değerlendirmedir; ruhsat sürecindeki resmî kontrolün yerine geçmez.

---

## 7. Adım 2: 3B görünüm

Plan hazır olunca üç boyutlu "dollhouse" görünümüne geçersin. Bu adım gerçek motordur: planındaki her duvar, kapı, pencere ve mobilya gerçek mesh olarak oluşturulur.

### Açma ve genel yapı

3B görünümü motor araç çubuğundaki **"3B Görünüm"** ile ya da akış içinde otomatik açarsın. Akış içindeyken kapatma yoktur (adımlar arası zaten gezinirsin); bağımsız açtıysan bir X düğmesi bulunur. Üstte **"İç" / "Dış"** görünüm segmenti vardır; Mesken üst şeridindeki **"İç Mekan | Dış Görünüm"** ile çift yönlü senkron çalışır.

Adım 2'de yerleştirilmiş kameralar salt-görünürdür (mesh + koni + etiket); düzenlemeleri Adım 3'te yaparsın.

<!-- GORSEL 09: 3B dollhouse — ust kat kaldirilmis daire; oda etiketleri, mobilya ve malzeme boyamasi acik; kosede orbit kuresi ve yon chip'leri -->

### Gezinme

- **Orbit küresi:** sürükle = döndür. Yanında K/D/G/B yön chip'leri ile **"Üst"** ve **"İzo"** chip'leri.
- **Bakış preset'leri:** İzometrik, Üstten (kuşbakışı), Perspektif, Sığdır. Dikey zoom (+/slider/−).
- **Kuşbakışı kilidi:** Kamera ya da Mobilya araçlarına girdiğinde otomatik devreye girer (döndürme kapalı, kaydırma + zoom serbest). Kilit düğmesiyle açılır.

### Katmanlar

Üst şeritteki ve katmanlar çekmecesindeki toggle'larla görünümü sadeleştirebilirsin:

- **"Oda etiketleri"** — TR etiketleri gösterir/gizler. (Render ve PNG öncesi otomatik İngilizce'ye çevrilir, sonra tekrar Türkçe'ye döner.)
- **"Duvarlar tam yükseklik"** — kapalıyken çatı ve duvar üstü kalkar (içeriye tepeden bakmak için).
- **"Mobilya"** — mobilyayı gizler (silmez).
- **"Malzeme boyaması"** — atadığın zemin/duvar dokularını gösterir/gizler.

Kapı kanatları gerçek mesh'tir (panel + kasa + kol); bina girişi koyu, iç kapılar açık tondur; dolaplar açık ahşaptır (kapı ile dolabı ayırt edebilirsin).

### Gezinti (WASD) ve C tuşu

Masaüstünde birinci-şahıs gezinti yapabilirsin: Pointer Lock ile fareyle bak, **WASD** ile yürü, **Shift** koş, **Space** zıpla, **Esc** çık. Çarpışma gerçektir: duvarlar ve cam bloklar geçilmez, kapı kanadından geçilir, mobilya bloklar. Sol altta bir WASD minimap, ayrıca adım sesi aç/kapa vardır.

**C tuşu** (ya da buton) = "bu açıda kamera": o anki birinci-şahıs bakışını kamera listesine ekler. Gezinti dokunmatikte kullanılamaz (uyarı gösterilir).

### Kat, blok ve indirme

Kat ve blok seçimi 3B'nin içinden yapılır (üst-orta çip satırları):

- **İç görünümde:** çok bloklu sitede **"Blok"** çipleri (A, B, …) aktif bloğu GERÇEKTEN değiştirir — sahne seçilen bloğun planıyla yeniden kurulur. "Katları ayrı planla" açıksa altında **"Kat"** çipleri belirir (Zemin kat, 1. kat, …); konut katları tıklanabilir, ticari/otopark/sığınak katları soluk görünür ("iç mekânı yakında"). Aynı düzendeki ardışık katlar **tek çipte birleşir** ("1. kat – 2. kat" gibi, "Aynı düzen — tek örnek üzerinden düzenlenir" notuyla) — motor aynı katı tekrar tekrar kurmaz; bu katlar mobilya ve malzemeyi de doğal olarak paylaşır (tip kat). Farklı düzendeki katlar tamamen ayrıdır: birinde taşıdığın mobilya ya da atadığın malzeme diğerine sızmaz. Kat/blok gezerken yerleştirilmiş kameralar ve drone'lar SİLİNMEZ.
- **Dış görünümde:** blok çipleri **"A · B · … · Tümü"** biçimindedir ve salt görseldir — seçilen tam kabuk, diğerleri hayalet çizilir; 2B aktif blok değişmez.
- Aktif kat konut-dışıysa 3B açılışta otomatik ilk konut katına geçer (bilgi mesajıyla); hiç konut katı yoksa dış görünüme düşülür.

**"İndir"** grubundaki **"Görüntüyü indir (PNG)"**, o anki 3B görünümü 1920 px olarak kaydeder. Bu bir "AI render değil"dir ve kredisizdir.

---

## 8. Adım 3: Kamera

Bu adımda 3B tam ekran açık kalır ve kamera paneli görünür. Panel şerit-farkındadır: **"İç Mekan"** şeridindeyken oda kameraları, **"Dış Görünüm"** şeridindeyken drone dock'u gelir. Adımın CTA'sı **"Render Kadrajları"**; ona bastığında 3B canlıyken tüm kamera ve drone kadrajlarının küçük görselleri **kredisiz** yakalanır ve Adım 4'e geçilir. Hiç drone eklemeden ilerlersen bir kezlik nazik bir hatırlatma çıkar (**"Drone Ekle"** seni Dış şeridine götürür, **"Devam Et"** normal akışla sürer) — dış cephe karesini istemeden atlamazsın. Yakalama hibrittir: hangi şeritte bırakırsan bırak, iç kamera kadrajları iç sahneden, drone kadrajları dış kabuktan, **"Planı Boya"** kadrajı ise her zaman deterministik izometrik açıdan alınır — kart önizlemesi ile üretilen sonuç aynı kaynaktan gelir.

Araç grupları rail üstünde sırayla: **"Kamera (İç)"**, **"Drone (Dış)"**, **"İç Malzeme"**, **"Dış Cephe"**, **"Mobilya"**, **"Gezinti (masaüstü)"**, **"İndir"**. Bir dış araca tıklayınca otomatik dış moda, bir iç araca tıklayınca iç moda geçilir (araçlar köprülüdür).

<!-- GORSEL 10: kamera dock — ic kamera secili; Yon/Tasi/Odakla/Sil eylemleri, Yukseklik ve Bakis acisi slider'lari, Bakis Yonu kuresi, Objektif chip'leri (16/24/35/50 mm), Gun saati -->

### İç kamera dock

Kamera şeridi (çipler) ve bir durum düğmesi vardır: **"Yerleştir"** → **"Bitir"** → **"Düzenle"** (duruma göre değişir), yanında **"Ekle"** çipi. Seçili bir kameranın eylemleri: **"Yön"** (bakış noktasına tıkla), **"Taşı"** (yeni konuma tıkla), Odakla, Sil.

Detay ayarları:
- **"Yükseklik"** — Alçak / Göz / Üst + slider (0,4 m'den tavana).
- **"Bakış açısı"** slider — -80..80 derece.
- **"Bakış Yönü"** küresi — sürükle: yatay = yön, dikey = eğim.
- **"Objektif"** — 16 / 24 / 35 / 50 mm.
- **"Gün saati"** — bu kamera ya da tümü için; Gün ortası / Gündoğumu / Altın saat / Gece.

Katlanır **"Render ayarları"**: **"Render yöntemi"** (Prompt / Görsel / İkisi — varsayılan "Görsel"), otomatik render prompt'u (düzenlenebilir + "otomatiğe sıfırla"), **"Kendi-açı görsel (opsiyon 2)"** önizleme ve **"Tüm kameraları temizle"**.

### Drone dock (dış)

**"+ Drone Ekle"** ve çipler (Drone 1, 2…). Seçili drone için **"Yön"** / **"Taşı"**, **"Bakış Yönü"** küresi, **"Yükseklik"** slider (bina üstü + pay), **"Objektif"** ve **"Sil"**. CTA sayılıdır: örn. **"Dış Render (2)"**.

### Kamera verisinin arka planı (kısaca)

Her kamerada, konum + yön + lens bilgisinden bir görüş konisi kurulur. Koninin en çok kapladığı (ya da kameranın içinde durduğu) oda, kameranın `room_id`'si olur ve asla boş kalmaz; birden çok odaya taşarsa ağırlıklar kaydedilir. Kameranın gördüğü mobilya da listelenir. Bunlar ekranda ayrı bir gösterge değildir; render ve dışa aktarma için arka planda tutulan veridir. (Görüş konisi tuvalde çizilen bir çizgi değildir.)

### Kamera mini-turu (6 adım)

3B'de kamera aracını ilk açtığında kendiliğinden başlar:

1. **"Kamera yerleştir"** — Dock'taki Ekle ile plana iç kamera koy.
2. **"Açıyı ayarla"** — sürükle ya da Yön ile bakış noktası.
3. **"Lens seç"** — 16-24-35-50 mm.
4. **"Drone moduna geç".**
5. **"Drone kamerası ekle"** — "+ Drone Ekle".
6. **"Dış Render"** (zorunlu) — aksiyon "Bitir"; tıklayınca "Dış render başlatılsın mı? … Bu işlem render kredisi harcar" onayı çıkar.

---

## 9. Malzeme, cephe ve mobilya

Render'a girmeden önce yüzeyleri ve döşemeyi belirleyerek çıktının sadakatini yükseltirsin. Bu bölümdeki her şey kredisizdir; seçtiklerin hem 3B mesh'te gerçek doku olarak görünür hem de render prompt'una "seçilenleri aynen koru" sinyali olarak girer.

### İç Malzeme dock

Mesh'te bir odaya tıkla; dock'ta oda adı (ıslak hacimlerde ek "ıslak" etiketiyle) ve **"Zemin"** ile **"Duvar"** swatch satırları belirir.

- **Zemin:** Açık Meşe, Koyu Ceviz, Gri Meşe, Balıksırtı (parke); Beyaz / Gri / Bej / Antrasit Seramik (ıslak hacimlerde önce seramikler).
- **Duvar:** Kırık Beyaz, Bej, Adaçayı, Duman Mavisi, Terracotta, Antrasit.

Aynı swatch'a tekrar tıklamak seçimi kaldırır. **"Türe göre ata"** tüm odalara tip bazlı tutarlı bir atama yapar; **"Tümünü sıfırla"** hepsini temizler; seçili odada **"Varsayılana dön"** vardır. Seçtiğin malzeme mesh'te prosedürel doku olarak görünür (tahta çizgisi/balıksırtı, fuga ızgarası, boya).

<!-- GORSEL 11: Ic Malzeme dock — secili odaya Zemin ve Duvar swatch satirlari; mesh'te secilen malzeme gercek doku olarak gorunur -->

### Dış Cephe preset'leri

**"Dış Cephe"** grubunda dört preset çipi vardır: **"Nötr"**, **"Açık Sıva + Koyu Bant"**, **"Tuğla Zemin + Sıva Üst"**, **"Çağdaş Gri + Ahşap Balkon"**. Seçim 3B kabuğu değiştirir ve render prompt'una sinyal olarak girer. Bina sekmesindeki **"Çıkma"** + derinlik ve **"Çatı"** (Teras/Kırma) ayarları da 3B kabuğu ve render'ı etkiler.

### Mobilya

Katalog altı kategoride yaklaşık 41 tip içerir:

| Kategori | Tipler |
|---|---|
| Oturma | Üçlü/İkili/Köşe Kanepe, Koltuk, Puf, Orta/Yan Sehpa, TV Ünitesi, Televizyon, Kitaplık, Konsol, Halı |
| Yemek | Masa 4/6, Sandalye, Büfe |
| Yatak | Çift Yatak, Queen, Tek, Komodin, Gardırop 3K/Gardırop, Şifonyer, Makyaj Masası, Bank |
| Mutfak | Tezgah, Ada, Buzdolabı, Ocak/Fırın, Bulaşık Mak., Evye |
| Banyo | Klozet, Lavabo, Küvet, Duş, Çamaşır Mak. |
| Giriş/Çalışma | Ayakkabılık, Vestiyer, Konsol, Çalışma Masası, Ofis Sandalyesi, Saksı |

Balkonlara otomatik Bistro Masa/Sandalye konur.

**Otomatik döşeme.** **"Yeniden döşe"** tüm odaları mantık-tabanlı döşer; elle düzenlediğin mobilyalar korunur. **"Temizle"** hepsini kaldırır. Yerleşim kuralları: oda sınırı aşılmaz, kapı kapatılmaz, pencere önü (yüksek mobilyayla) tıkanmaz, mobilya üst üste binmez; dar sirkülasyonlu odalarda geçiş payı bırakılır; duvar-sever tipler en yakın duvara yapışır ve duvar açısına döner.

**Modsuz sürükle-bırak.** Bas-sürükle-bırak ile taşırsın; geçersiz konumda mobilya kırmızıya döner ve eski yerine geri gider. Paletten bir tipe tıkla, sonra zemine tıkla = yeni ekle (hayalet önizleme ile). Sürükleme sırasında kamera kilitlenir.

Her tip gerçek boyutlu kutu-geometrisiyle çizilir. **"Render'a mobilya ekle"** onay kutusu: işaretliyse döşeli, işaretsizse boş üretim — bu tercih PNG, snapshot ve floorplan-map çıktılarının hepsinde tutarlı uygulanır.

<!-- GORSEL 12: Mobilya — sag'da kategori paleti, tuvalde otomatik doselenmis salon; bir esya suruklenirken hayalet onizleme -->

Mobilya kısayolları için Bölüm 13'e bak.

---

## 10. Adım 4: Render

Render, seçtiğin kadrajları yapay zekâ ile gerçek görsellere çeviren adımdır. Akışın **tek ücretli** noktası buradadır.

### Temel ilke

Plan önce renk-kodlu gerçek 3B mesh'e çevrilir; yapay zekâ yalnız malzeme ve ışık boyar, geometri üretmez. Bu sayede duvar/pencere/kapı ve mobilya konumları render'da yerinde kalır. Oda tiplerinin renk kodu şöyledir:

| Oda tipi | Renk |
|---|---|
| Banyo | Mavi |
| Yatak odası | Yeşil |
| Salon | Turuncu |
| Mutfak | Sarı |
| Salon + mutfak (açık) | Amber |
| Antre | Bej |
| Çekirdek | Koyu gri |

### Kadraj galerisi ve Render Listesi

Galeri üç grupta toplanır: **"Plan Boyama"**, **"İç Kameralar"** ve **"Dış / Drone"** (başlıklarda kart sayısıyla). Kart görselleri 3B'den alınan yerel küçük görüntülerdir (kredisiz).

- **"Planı Boya"** kartı izometrik açıdan renk-kodlu bir kadrajdır; çok bloklu sitede **blok başına bir kart** oluşur (**"Planı Boya — Blok A"**, **"— Blok B"**...).
- Sağdaki **"Render Listesi"** her kartın satırını gösterir: seçim kutusu (kartla çift yönlü eş), etiket ve durum çipi (bekliyor / üretiliyor / hazır / hata). Satıra tıklamak ilgili karta kaydırır; "Üret" ilerledikçe durumlar burada akar.
- Hiç drone yoksa Dış grubunda "Drone yok — dış cephe kareleri için Kamera adımında Drone ekleyin" satırı ve **"Kamera adımına dön"** düğmesi görünür.

Üst şeritteki adım noktaları da durum gösterir: Kamera adımında iç nokta = en az bir iç kamera, dış nokta = en az bir drone; Render adımında noktalar üretim durumunu izler (üzerine gelince ayrıntı yazar).

<!-- GORSEL 13: Adim-4 render galerisi — uc grup basligi (Plan Boyama blok karti x2, Ic Kameralar, Dis/Drone) + sagda Render Listesi checklist'i; alt cubukta "Üret (N)" -->

### Sadık / Yaratıcı

Global bir yöntem seçici (**"Sadık"** / **"Yaratıcı"**) ve kart-başına bir seçim (**"Varsayılan"** / **"Sadık"** / **"Yaratıcı"**) vardır.

- **"Sadık"** (kendi-açı img2img) — 3B'nin kendi PNG'si referans alınır. Kamera açısı, oda şekli, duvar-pencere-kapı konumları ve mobilya AYNEN korunur; düz renkler gerçek malzemeye döner; küçük yumuşak dekor (tekstil, bitki, kitap, duvar sanatı) eklenebilir ama hiçbir şey taşınmaz/silinmez. **Varsayılan yöntemdir, 1x maliyet.**
- **"Yaratıcı"** (prompt txt2img) — metinden serbest üretim; geometri kilidi yoktur. İstersen kart bazında seçilir.
- **"İkisi"** seçeneği de vardır (2x maliyet).

*img2img = bir görselden yola çıkarak üreten yöntem (geometriyi korur). txt2img = yalnız metinden üreten yöntem (serbesttir).*

### Dış render

Dış render'da binanın kütlesi, kat sayısı ve pencere/balkon konumları korunur; seçtiğin cephe preset malzemesi uygulanır; bina "yeni yapılmış ve bakımlı" (temiz cephe) talimatıyla üretilir. Tüm çıktılarda "yazı/etiketleri sil" talimatı vardır. Gün saati seçimin (Gün ortası / Gündoğumu / Altın saat / Gece) render'ın ışığını belirler.

### Üretim, kredisiz/ücretli ayrımı

Alt çubukta **"N kare seçili"** ve **"Üret (N)"** bulunur. **"Üret"**e basınca bir onay dialoğu çıkar; onaylarsan seçili kartlar SIRAYLA gerçek render uçlarına gönderilir (ücretli).

> **Kredisiz kalanlar:** 3B **"Görüntüyü indir (PNG)"**, kadraj kartı küçük görselleri ve kendi-açı önizleme — hepsi tarayıcı içi, kredisiz. **Ücretli olan yalnız:** Render adımındaki **"Üret"** onayından sonraki gerçek yapay zekâ üretimi. Onay pencerelerindeki "Bu işlem render kredisi harcar" metni bilgilendirme amaçlıdır; şu an gerçek bir bakiye/ödeme sistemi bağlı değildir.

### Demo modu (Ön-gösterim)

URL'ye `?demo=1` (ya da `#demo` / `/demo`) eklersen **demo modu** açılır: paralı uçlara hiç istek gitmeden, önceden üretilmiş gerçek çıktılar 2-4 saniye gecikmeyle gösterilir. Ekranda "DEMO MODU · üretimler örnek çıktıdır, kredi harcanmaz" rozeti durur. Sunum ve deneme için idealdir.

### Render köprü sunucusu notu

Gerçek render, yerel bir köprü sunucu üzerinden çalışır (`localhost:8787`, `npm run mesken:server`). Model nano-banana-pro'dur (Replicate), 4K ve sürümü pinlidir. Sunucu kapalıysa "Render sunucusu çalışmıyor görünüyor…" mesajını görürsün — bu durumda demo moduyla akışı gezebilir ya da köprüyü kurabilirsin (git deposu dışında, yerel kurulum gerektirir).

---

## 11. Adım 5: Döşe

Son adım, üretilen render'ları toplar ve sunuma hazırlar. Bu adımın bir kısmı gerçek, bir kısmı ön-gösterimdir; ikisini net ayırıyoruz.

### Gerçek olanlar

Üretilen render'lar burada toplanır: iç mekân galerisi, dış galeri ve **"Döşeli Render"** ana görseli. Adımın CTA'sı **"Planı Dışa Aktar"**.

<!-- GORSEL 14: Adim-5 Döşe ekrani — ic/dis render galerileri + "Döşeli Render" ana gorseli; asagida "Ön-gösterim" etiketli pazaryeri ve Video Turlar bolumu -->

### Ön-gösterim olanlar

Aşağıdaki bölümler şu an tamamen **ön-gösterimdir** — arayüzü hazır, ama arkasında gerçek bir sistem yoktur:

- **Pazaryeri** — Bellona / Jotun / Çamsan / VitrA / Karaca Home sabit bir listedir.
- **"Döşeme Özeti"** — sabit, örnek bir "Tahmini Toplam" gösterir.
- **"Pazaryerine Aktar"** ve **"Sunum (PDF) olarak aktar"** düğmeleri yalnız bir bildirim gösterir; gerçek bir aktarım/çıktı yapmaz.

### Video Turlar (Yakında)

**"Video Turlar"** bölümünde iki düğme vardır — **"Daire Turu Videosu"** ve **"Site Turu Videosu"** — ikisi de "Yakında" rozetlidir ve şu an pasiftir. Planlanan akış: 3B gezinti kaydı → yapay zekâ ile video boyama → fotogerçekçi tur videosu.

---

## 12. Dışa ve içe aktarma

### 2B editör çıktıları

| Çıktı | Ne yapar |
|---|---|
| **"SVG indir"** | Görselin içine TAM proje durumunu metadata olarak gömer; tekrar içe aktarınca elle düzenlemelerin birebir geri gelir. |
| **"PNG indir"** | Yüksek çözünürlüklü görsel. |
| **"DXF indir"** | CAD için DXF çizim. (İç oda sınırları ızgara-basamaklı; bkz. Bölüm 15.) |
| **"İçe aktar"** | .svg / .json / .dxf kabul eder; pencereye sürükle-bırak da olur. |

İçe aktarmada: JSON = ham durum; durum-gömülü SVG = birebir; eski (durumsuz) SVG = geometriden çözümleyici (balkon/parsel/ayırıcı taşınmaz). Dosya hatalıysa "İçe aktarılamadı" mesajı gelir.

**Eğitim günlüğü** (Profesyonel, "Daireler" sekmesi, "(N kayıt)"): indirdiğin ya da render'a gönderdiğin planlar yalnızca cihazında yerelde toplanır (ağa hiçbir istek gitmez). **"JSONL indir"** ve **"Temizle"** düğmeleri vardır.

### .mskpkg proje paketi

`.mskpkg`, projenin tamamını tek taşınabilir dosyada tutar:

- **İçerik:** meta + motorun tam plan durumu + kameralar (iç: konum/hedef/lens/yükseklik/oda/prompt/snapshot/yöntem/gün saati; dış: + cephe sinyali/stil) + mobilya listesi (mutlak metre konum + dönüş) + tüm render'lar (iç/dış/plan) base64 gömülü.
- **"Paket İndir"** — Adım 2'den itibaren aktiftir; `proje-YYYYAAGG.mskpkg` iner. Öncesinde "Önce bir yerleşim oluşturun" notu.
- **"Paket Aç"** ya da pencereye `.mskpkg` sürükle-bırak ("Proje paketini bırakın" katmanı belirir). Mevcut ilerlemen varsa "Yeni paket aç — mevcut ilerlemeniz kaybolur…" onayı çıkar. Format/sürüm doğrulanır; plan yüklenir, tüm adımlar açılır, doğrudan Kamera adımına gidilir, kameralar mesh hazır olunca bindirilir, galeri paketten geri yüklenir.

---

## 13. Kısayollar ve dokunmatik

### Birleşik kısayol tablosu

| Kısayol | Etki | Bağlam |
|---|---|---|
| D | Çiz aracı | 2B |
| O | Oda Çiz | 2B |
| K | Kapı | 2B |
| W | Pencere | 2B |
| B | Balkon | 2B |
| A | Avlu | 2B |
| Y | Yapı (çekirdek) | 2B |
| P | Parsel (Profesyonel) | 2B |
| T | Park düzeni | 2B (otopark katı) |
| I | Site imkanları | 2B |
| S | Site görünümü | 2B (Site açıkken) |
| M | Ölçü aracı (iki noktaya tıkla: mesafe; Esc: temizle) | 2B |
| Space (basılı) | Geçici kaydırma | 2B |
| Ctrl/Cmd+Z | Geri al | 2B / mobilya |
| Ctrl/Cmd+Shift+Z veya Ctrl/Cmd+Y | İleri al | 2B |
| Esc | Yarım poligonu / menüyü iptal; FPV'den çık | 2B / FPV |
| Del / Backspace | Balkon modunda hover'daki balkonu sil; mobilyayı sil | 2B / mobilya |
| R | Park yönü çevir; site imkanı döndür; mobilyayı 15° döndür | 2B / mobilya |
| Shift + duvar sürükleme | Aynı hizadaki tüm parçaları birlikte taşı | 2B |
| Çift tık | Kapı/Pencere modunda ekle/sil | 2B |
| Sağ tık | Oda bağlam menüsü | 2B |
| Tekerlek / R | Mobilyayı 15° döndür | Mobilya |
| Ctrl+D | Mobilyayı çoğalt | Mobilya |
| Ctrl+Z | Mobilya geri al (25 adım) | Mobilya |
| W A S D | Birinci-şahıs yürü | FPV (masaüstü) |
| Shift | Koş | FPV |
| Space | Zıpla | FPV |
| C | Bu açıda kamera (FPV bakışını kamera listesine ekle) | 3B / FPV |

### Dokunmatik ve mobil davranışlar

- Bir tutamaçta tek parmak = sürükleme; boşta tek parmak = kaydırma.
- Uzun basış (~500 ms) = sağ tık; çift dokunuş = çift tık; iki parmak = yakınlaştır + kaydır.
- Ekran <=700 px olduğunda kenar çubuğu bir çekmeceye dönüşür.
- **"Daire Tablosu"** ve **"Geçmiş"** panelleri gripten taşınabilir; bir satıra tıklamak ilgili odaya odaklar.
- Birinci-şahıs gezinti (WASD) dokunmatikte kullanılamaz; bir uyarı gösterilir.

---

## 14. Yakında gelecek özellikler

Bu özellikler planlanmıştır ama henüz devrede değildir. Kullanıcı gözünden özetliyoruz:

- **Vektör tabanlı geometri motoru** — Bugünkü motor 0,5 m ızgara üstünde çalışır; duvar kalınlığı, net/brüt alan ve DXF bu ızgaraya eklendi. Sıradaki adım çizim mantığını gerçek vektör geometrisine taşımak; bu, serbest açılı (çapraz) iç duvarların ve tam CAD round-trip'in önünü açacak.
- **Video Tur** — Adım 5'teki iki pasif düğme. Planlanan akış: 3B gezinti kaydı → yapay zekâ ile video boyama → fotogerçekçi tur videosu.
- **Zengin sadakat / mesh kalitesi** — Render'ların yer yer "kuru" görünmesinin kalıcı çözümü, 3B modelin kendisinin zenginleştirilmesidir (yatırım sonrası hedefi).
- **Akıllı öneri motoru** — Tercihlerin şimdiden sessizce toplanıyor; bunun üstüne kurulacak "en iyi planı öner" özelliği yatırım sonrası paketinde.
- **Çoklu ada/parselli site tasarımı** — Birden fazla parseli tek projede planlama (yatırım sonrası).
- **Çıkmaların m² hesabına yansıması** — Cephedeki çıkma şu an salt görseldir; üst kat büyümesi, m² ve imar (KAKS) hesaplarına bağlanacak.
- **Köşeyi saran (L biçimli) balkon** — Bugün balkonlar tek kenara yaslanan dikdörtgendir; L balkon için veri modeli genişletilecek.
- **Avluyu saran koridor** — Avlu araçlarının kalan tek kalemi: koridorun avlunun etrafından dolaşacak şekilde otomatik çizilmesi.
- **Kredi/üyelik sistemi** — Gerçek bakiye/ödeme altyapısı ayrı bir iş olarak planlanıyor.

---

## 15. Bilinen sınırlar

Dürüst olmak gerekirse, bugünün sürümünde şu sınırlar var:

- **Ön-gösterim bölümleri (Adım 5):** Pazaryeri (marka/ürün/fiyat listesi) tamamen örnek; "Tahmini Toplam" sabit; **"Pazaryerine Aktar"** ve **"Sunum (PDF)"** yalnız bildirim gösterir. Video Turlar iki düğmesi pasif ("Yakında").
- **Kredi/üyelik:** Gerçek bakiye/ödeme sistemi yoktur; onay pencerelerindeki uyarı metni bilgilendirme amaçlıdır.
- **Render köprü sunucusu** git deposunun dışındadır; gerçek üretim için yerel kurulum gerekir (`npm run mesken:server`). Kurmadan demo moduyla akışı gezebilirsin.
- **Çapraz (diyagonal) iç duvar** desteklenmez; motor tamamen dik açılıdır.
- **DXF çıktısı** tam-vektör değildir: iç oda sınırları ızgara-basamaklıdır (dış cephe düzleştirilir).
- **Çok küçük katlarda** (tek/iki daire) koridorun gereksiz yer kaplayabildiği uç durumlar olabilir.
- **Yapay zekâ boyama** ince iç duvarları bazen "açık plan" sanabilir; kalın duvar + overlay ile büyük oranda aşıldı, kalıcı çözüm beklemede.
- **Kapalı çıkma denetimi** eski bir referans (bir alt kat sınırı) kullanıyor; açık çıkma (balkon) ölçümü yapı yaklaşma sınırına göre düzeltildi, kapalı çıkma tarafı açık konudur.
- **Görüş konisi / oda çapası** ekranda çizilen bir gösterge değil, arka plan verisidir.
- **Yapay zekâ tercih öğrenmesi** henüz devrede değildir (veri toplanıyor, kullanan motor yok).

---

## Ek A. Sözlükçe

| Terim | Açıklama |
|---|---|
| **TAKS** | Taban Alanı Katsayısı — binanın parsele oturan tabanının parsel alanına oranı. |
| **KAKS / Emsal** | Kat Alanı Katsayısı — toplam inşaat alanının parsel alanına oranı. |
| **Çekme mesafesi** | Binanın parsel sınırlarına (ön/yan/arka) yaklaşamayacağı en az mesafe. |
| **Yol cephesi** | Parselin yola bakan kenarı; ön çekme bu cepheye göre uygulanır. |
| **Hmax** | İmar planında izin verilen azami bina yüksekliği. |
| **Yapı nizamı** | Binanın parseldeki oturma düzeni (ayrık/bitişik/blok). |
| **Piyes** | Bir bağımsız bölümdeki her bağımsız oda/hacim; mevzuat her piyese en az alan ve kenar şart koşar. |
| **PAİY** | Planlı Alanlar İmar Yönetmeliği — oda ölçüleri, çekme, çıkma, ışık gibi kuralların kaynağı. |
| **BYKHY** | Binaların Yangından Korunması Hakkında Yönetmelik — merdiven, yangın holü, asansör kaçış kurallarının kaynağı. |
| **Çekirdek** | Merdiven, asansör, yangın merdiveni ve teknik-şaftı barındıran düşey ortak alan. |
| **Çıkma** | Üst katın alt kat sınırından öne taşması (açık = balkon, kapalı = kütle). |
| **Avlu / aydınlık boşluğu** | Bina gövdesi içinde ışık/havalandırma için bırakılan boşluk; kenarları cephe sayılır. |
| **Dollhouse** | Üstü açık, içi görünen 3B ev maketi görünümü. |
| **Sadık (img2img)** | 3B'nin kendi görselinden üreten, geometriyi koruyan render yöntemi. |
| **Yaratıcı (txt2img)** | Yalnız metinden üreten, geometri kilidi olmayan serbest render yöntemi. |
| **Snapshot** | Sadık yöntemin referans aldığı kendi-açı 3B PNG'si. |

---

## Ek B. Geliştirici / ajan notu

Projeye yeni katılan bir geliştirici ya da ajan için mimarinin özeti:

- Motorun tüm mantığı (kadraj, export, oda yerleşimi, duvar, çizim, mevzuat) kaynak `.js` dosyalarında yaşar; kabuk `kat-plani-tasarim.html`'dir. Değişiklikler HEP kaynağa yazılır.
- Tek-dosya sürüm (`kat-plani-tasarim.tekdosya.html`) `npm run build` ile üretilir; motoru içine gömdüğü için elle düzenlenmez.
- Mesken 3B/kamera/render prototipi (`mesken/MESKEN-prototip.html`) yine `npm run build` postbuild adımıyla otomatik üretilir — tek-dosya motorunu içine gömer, üstüne mesken-özel kamera/render katmanını ekler. Elle DOKUNULMAZ; build onu ezer.
- Yani motorda yapılan bir değişiklik `npm run build` ile hem tek-dosyaya hem mesken prototipine otomatik iner.
- Ayrıntı için: proje kökündeki **CLAUDE.md**, **Claude_instructions/DEVIR-NOTU.md** ve 3B render iş kolu için **mesken/DURUM.md** (bu kolun tek doğru kaynağı) işaretlerini izle.
