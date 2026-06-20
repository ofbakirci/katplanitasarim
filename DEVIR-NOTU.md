# Kat Planı Tasarım Aracı — Devir Notu

Yeni sohbete başlarken bu dosyayı ve `kat-plani-tasarim.html` dosyasını ekleyin.

## SIRADAKİ İŞ (güncel: 2026-06-10, oturum v5)
1. ~~Vaka diff'leri~~ TAMAMLANDI (md.18: `_s` ekli dosyalarla diff yapıldı, motor v22).
   Kalan v22 artıkları:
   a. **Derin blokta mutfak hâlâ içeride** (vaka-4): mutfak→cephe geçişi
      `widthM/(fac.length+1)>=3.2` kapısına takılıyor; demiryolu (rail) çıkarımından
      SONRA yeniden denenebilir (kullanıcı vaka-4'te yatakları derine dizip mutfağı
      cepheye aldı). runChecks 'info' notu kullanıcıyı yönlendiriyor.
   b. Antre inceltme hedefi doluluk (fill) bazlı olabilir: kullanıcı antreleri
      1 m omurgaya indiriyor (vaka-2 D1 9,5×1, fill 1.0); slimAntres şekli değil
      yalnız alanı kovalıyor.
   c. EB. BANYO boyutu kararsız sinyal (kullanıcı 4→3 da yaptı 4→4,5 da) — dokunma.
2. **Mevzuata otomatik uydurma** (bilinen sınır #5): "Mevzuata Uydur" düğmesi —
   slimUnitAntre deseni genellenir, runChecks ihlal listesi altyapısı hazır.
3. Eski-SVG çözümleyiciye balkon/parsel aktarımı (md.16'daki bilinen eksik).

## Ne bu?
Tek dosyalık web uygulaması (`kat-plani-tasarim.html`). Türkiye mevzuatına göre şematik
apartman/villa kat planı üretir. Kullanıcı bina sınırını çizer (kenar açısı 15°'nin
katlarına, uzunluk 0,5 m ızgaraya oturur), isteğe bağlı parsel sınırı çizer (bahçe
alanı + TAKS + çekme mesafesi denetimi) ve dış duvarlara balkon ekler (vektörel
katman; hücre motoruna girmez, daire tablosunda açık alan olarak listelenir),
daire tiplerini girer (oda/salon/ebeveyn banyosu/açık mutfak/adet), "Yerleşimi
Oluştur" der; motor koridor + çekirdek + daireleri yerleştirir, mevzuat panelinde denetler.
VİLLA + ≥2 kat: "Katları ayrı planla" anahtarı (md.20) her katı kendi sınırı, oda
programı ve elle düzenlemeleriyle ayrı planlatır (tuval üstünde kat sekmeleri).
Kurallar: iç merdiven üst katlarda zemindeki konuma hücre hücre sabitlenir (düşey
hiza; sınır merdiveni keserse runChecks ihlal yazar); her kat oturumu ≥ zeminin %70'i
(`REG.katOturumOran`); üst kat alt kattan en çok 1,5 m taşar (çıkma, `REG.cikmaMax`);
ıslak hacimler düşeyde çakışmıyorsa bilgi notu; TAKS zemin oturumuyla hesaplanır; üst
kata sokak giriş kapısı çizilmez (erişim iç merdivenden). Kat durumları `villaFloors[k]`'da
stateSnapshot biçiminde tutulur; SVG dışa aktarım TÜM katları gömer (`st.floors`),
içe aktarınca sekmeler aynen geri gelir. Villa modunda Oda artık 0 olabilir (salon katı).
YALNIZ anahtar AÇIKKEN salon=0 SALONSUZ KAT demektir (stüdyo değil: salon da mutfak da
konmaz, yatak sayısı eksilmez, kat bazlı salon ihlali yazılmaz) — bir katta salon olması
yeter; hiçbir katta yoksa runChecks "Evde hiç salon yok" ihlali basar (PAİY md.30).
Anahtar kapalıyken eski davranış (salon hep konur); apartman stüdyo semantiği değişmedi.
TEK SALON korumaları da anahtara bağlı (`salonProtected()`): açıkken tek salon sağ tıkla
silinebilir / duvarla yutulabilir / tipi değiştirilebilir (spec salon=0'a düşer), kapalıyken
ve apartmanda eski korumalar aynen geçerli.

## Mimari (script içi akış)
1. **Izgara**: 0,5 m hücreler (`M=0.5`), poligon içi test, `cm` Int16Array bölge haritası.
2. **Koridor**: maliyet aramalı ana bant (sığ işe yaramaz şerit bırakan konum cezalı) +
   11 m'den derin kanatlara dik kollar (cepheye kadar uzar, uçta daire saramaz; 10 m'den
   yakın çift kol ayıklanır).
3. **Çekirdek**: merdiven 5×3, asansör(ler) kat kuralına göre (3 kat→yer, 4+→1, 11+→2;
   asansör/teknik blokları tam çekirdek derinliğinde — cep oluşmaz), yangın merdiveni
   bina yüksekliği >21,5 m veya 4+ katta EN UZAK uca (minimax kaçış).
4. **Bölgeler**: atanmamış bitişik bileşenler; hole baktıkları yöne göre N/S/E/W daire
   şeritlerine bölünür (`splitZone`, sürüklenebilir ayırıcılar `customCutsZ`).
5. **Daire içi (`layoutUnit`)**: T-plan — giriş sırası (mutfak/banyo/WC, derinliği
   MUTFAĞIN ideal oranına göre 2–3 m), 1 m iç hol kolu (her odaya erişecek kadar uzun,
   fazlası köşe odalara bağışlanır), cephe sırası (salon + yataklar). Ebeveyn banyosu
   yatak odasının hol köşesinden oyulur. Şerit yalnız gerektiği kadar geniş; artık uçlar
   salona (küçükse banyo/mutfağa) gider. Kiler: yalnız ≥110 m² dairede, ≤5 m².
   ÇEKİRDEK GÖLGESİ: hol bandı derinliğinde hücresi olmayan sütunlar (merdiven/asansör
   arkası raf) tespit edilir; ≥2 m gölge varsa salon o uca yaslanır — yoksa oransal
   bölücü yatak odasını çekirdek arkasına atar, oda antreye değemez ve meltNoAccess
   yutar (ayırıcı çekirdek üstünden geçirilince yaşanan "yatak odası kayboldu" hatası).
6. **Onarım hattı** (sırayla): `fixOrphans` (kopuk parça → komşuya) → `repairUnits`
   (mevzuata takılan oda komşudan 0,5 m şeritlerle büyür; antre yenirse bütünlük denetimi
   + geri alma) → `purgeSlivers` (kılçık oda eritilir; TEK salon ölmez, emici oda salona
   dönüşür) → `meltNoAccess` (antreye değmeyen oda eritilir) → `carveMissing` (banyosuz
   daireye antre komşusu odadan banyo oyulur) → `fixOrphans`.
7. **Denetim (`runChecks`)**: PAİY piyes ölçüleri (salon 12/3,0; yatak 9/2,5; mutfak
   3,3/1,5; banyo 3/1,5; WC 1,2/1,0; salon+mutfak 15,3), asansör/yangın/kaçış (30 m),
   sığınak >8 daire notu, oda programı raporu ("3 yataktan 2 yerleşti"), biçimsiz oda
   (<%55 doluluk), ince-uzun mutfak (>1:2,8). Sorunlar üstte, tıklayınca odağa gider.
8. **UI**: yüzen daire tablosu (sürüklenebilir), rozetler kapı üstünde, SVG/PNG dışa
   aktarma. Duvar uzunlukları: yakınlaşınca hepsi; aynı duvarı iki oda da etiketliyorsa
   tek etiket duvar üstüne haleyle (`paint-order:stroke`) yazılır; imleç odanın
   üzerindeyken o odanın ölçüleri HER ölçekte belirgin, diğerleri %15 soluk
   (`hoverRoomId`, svg mouseleave'de temizlenir).
9. **Oda duvarı düzenleyici** (`computeWallRuns`/`moveWallStep`/`dragWallTo`): aynı
   dairenin iki odası arasındaki düz duvar parçaları (kare tutamaç) sürüklenir; duvar
   0,5 m hücre şeritleri aktararak yürür. Korumalar: şeridin tamamı donöre ait olmalı
   (3. odaya taşmaz), donör ≥1 m² kalır, donör kopuyorsa adım geri alınır. Her adımda
   `runChecks` + daire tablosu canlı yenilenir; `runChecks`e oda→antre (EB. BANYO→eb.
   yatak) komşuluk denetimi eklendi. Elle duvar değişiklikleri `generate()` (yeniden
   üretim veya ayırıcı sürükleme) ile sıfırlanır — bilinçli karar.
10. **Geri Al katmanlı**: `editHistory` yığını duvar/ayırıcı/oda düzenlemelerini tutar
   (`finishDrag` ve oda işlemleri yazar, `undoEdit` geri alır); Geri Al önce bunları
   adım adım tüketir, yığın boşalınca eski davranışa (planı boz / köşe sil) düşer.
   `generate()` duvar VE oda girdilerini (bölge kimlikleri yeniden doğar),
   `resetCuts()` ayırıcı girdilerini siler.
11. **Oda ekle/sil** (`addRoom`/`removeRoom`, sağ tık menüsü `#roomMenu`): üretim
   sonrası TEK dairede düzenleme. Silme: oda, aynı dairede en uzun ortak duvarlı
   komşusuna katılır (purgeSlivers mantığı); antre, merdiven ve TEK salon silinemez.
   Ekleme: ev sahibi odadan, antreye komşu tohumdan tip boyutlu pencere oyulur
   (carveMissing mantığı; sığmazsa küçülür, donör ≥3 m² ve bağlantılı kalır, yoksa
   iptal); ince ayar mevcut duvar sürüklemeyle. Her ikisi de daire `spec`inin
   KOPYASINI günceller (oda±, salon±, mutfak sil→acik:true, EB. BANYO sil→
   ensuite:false) — runChecks program raporu yanlış alarm vermez, kardeş daireler
   etkilenmez. `editHistory`ye `{type:'room', op:'add'|'remove', ...}` yazılır.
   EB. BANYO da menüde: yalnız yatak odasından oyulur (köşeden, antre koşulu aranmaz),
   ev sahibi oda 'EB. YATAK ODASI'ya çevrilir + spec.ensuite=true (geri alınabilir).
   EB. BANYO satırı artık HER odada görünür: yatak dışında pasif ("yatak odasına sağ
   tıklayın"), dairede zaten varsa pasif ("zaten var"; addRoom'da da çift koruması var —
   denetim/kapı eşleşmesi ada bağlı olduğundan daire başına tek EB. BANYO).
   YENİ ODA TIK NOKTASINA OYULUR: addRoom(host,def,hint) — hint sağ tıklanan hücre;
   tohum, adaylar (antre komşusu / eb'de tüm hücreler) içinden hint'e en yakını.
   Pencere artık tohumu içeren TÜM konumlardan en çok hücre kapsayanı seçer (hint'li
   yolda) — köşe tohumda sliver/false dönme hatası giderildi. Kullanıcı odayı sağa
   dayamak istiyorsa odanın sağ tarafına sağ tıklar. Hintsiz çağrı (testler) eski
   davranışta. Test: tests/oda-hint.js (13). NOT: tohum antre komşuluğuyla sınırlı
   kaldığından (kapı şartı) hint ancak antre arayüzü boyunca kaydırır; arayüz 1-2
   hücreyse yer değişmez — ince ayar yine duvar sürükleme.
12. **Tek daire/kat** (`trySingleUnit`): apartman modunda kat başına 1 daire varsa bant
   koridor İSRAFTIR (karşı kanat sahipsiz kalıp ORTAK DEPO'ya düşüyordu — 600 m² tabanda
   261 m² depo!). Bunun yerine kompakt çekirdek (merdiven+asansör+teknik+yangın TEK
   SIRADA, 3 m derinlik) cepheye yaslanır, önüne 1,5 m lobi; kalan TÜM alan tek daireye.
   Yerleşim üst cepheden taranır (lobi daireye bakmalı — `facing`), olmazsa alt cephe;
   hiç sığmazsa eski bant düzenine geri düşer. Ayırıcı tutamacı yok; ince ayar duvar
   sürükleme + oda ekle/sil. İlgili düzeltme: `layoutUnit`te giriş şeridi artık
   `kset` (koridora GERÇEKTEN komşu sütunlar) üstüne oturur — antre↔lobi kapısı
   garanti; çok daireli düzende kset≈bset olduğundan davranış değişmez (harness aynı).

13. **Antre inceltme** (`slimAntres`/`slimUnitAntre`, üretim sonunda otomatik + antre
   sağ tık menüsünde "Antreyi kırp"): antre kolları odaların içine taşıyor, kör uç
   bırakıyordu (32×16'da 19-22,5 m² antre). Fazla hücre şeritleri `moveWallStep`
   adımlarıyla odalara geri verilir (önce mevzuat açığı olana, sonra salona).
   Korumalar: antre bağlantılı + ≥3,5 m², hiçbir yer <1 m inceltilmez (`thinCells`:
   her hücre 2×2 tam-antre blokta), oda→antre komşulukları korunur ve ASIL KAPI:
   `runChecks` ihlal sayısı artamaz (kapı yeri/cephe/biçim/program... hepsi bununla
   güvende; runChecks artık `out` dizisini DÖNDÜRÜR). Sonuç: 32×16'da antreler
   19→5,5 / 22,5→10 m². L-daire girişi yapısal olarak ~%13,7'de kalabilir (banyo
   yönü 0,5 m boğaz oluşturduğu için haklı reddedilir) — test eşiği %14.
14. **Oda etiketi/takas/bölme/antre uzatma** (sağ tık menüsü, `RETYPE` listesi):
   *Tipini değiştir* (`retypeRoom`): ad+tip değişir, spec KOPYASI güncellenir
   (yatak↔oda sayısı, mutfak↔acik); tek salon ve EB. BANYO'lu EB. YATAK korunur
   (`retypeGuard`). *Takas* (`swapRooms`): aynı dairede iki odanın ad/tipi yer
   değiştirir, hücreler yerinde, spec değişmez. *Odayı böl* (`splitRoom`): bbox
   ortasından dikine/enine; yeni parça NÖTR `ODA` tipiyle doğar (COLORS/TYPE_TR'ye
   'oda' eklendi; denetimlerde piyes ölçüsü aranmaz), ince ayar duvar sürükleme,
   adlandırma Tipini değiştir — "duvar birleşince kayboldu" sorununun geri yolu.
   *Antreyi bu odaya uzat* (`extendAntreTo`, yalnız antreye komşu OLMAYAN odada
   görünür): daire hücrelerinde Dijkstra (ıslak hacim pahalı), yol 1 m'ye
   genişletilir; donör odalar bağlantılı+≥1 m² kalmazsa geri alınır. Antresiz
   daireye menüden "+ ANTRE" (addRoom, u.antre atanır). Antre SİLİNEMEZ (giriş).
   Geri Al: `retype`/`swap` yeni geçmiş tipleri; böl/+ANTRE `room/add` yolunu kullanır
   (undo'da `u.antre` temizlenir); uzat/kırp `wallsnap`.

15. **Motor v21 ayarı** (kullanıcının kat-plani-20→21 elle ince ayarından çıkarılan
   kurallar; girdi: 40×12, 5 kat, 2+1 eb ×4):
   *Ders #1 — ensuite sözü tutulur*: eski köşe-sabit EB. BANYO oyması L-odalarda 0-10
   hücrelik kırpık üretip purgeSlivers'a yeniliyordu → 4 daireden 3'ü SESSİZCE
   ensuite'siz kalıyordu. Yeni `carveCornerBath`: odada EN ÇOK hücre kapsayan cw×cw
   pencere (skor: hücre×1000 − kalan-bbox − antre-cephesi×60; oda dikdörtgene yaklaşır,
   kapı cephesi yenmez). `ensureEnsuite` onarım hattında (carveMissing sonrası) VE slim
   sonrası ikinci tur: önce yatağa komşu KİLER dönüştürülür, olmadı en büyük yataktan
   oyulur; başka ≥9 m² yatak varsa eb. yatak 6 m²'ye inebilir. purgeSlivers banyo eşiği
   2,8 m²/1,2 m (2×1,5 eb. banyo meşru). runChecks'e "Eb. banyo" satırı eklendi
   (yoksa bad). Kiler: ensuite istenen dairede eşik 110→130 m² (program > lüks).
   *Ders #2 — komb plan (sığ bant)*: cepheye <2,5 m kalacaksa giriş sırası İPTAL;
   antre koridor boyu 1,5 m OMURGA, ıslak hacimler dâhil tüm odalar omurgaya asılır
   (orta odalar ≈derinlik−1,5, uç odalar tam derinlik). Omurga önce TAM genişlik atanır,
   cephe odaları yerleşince uç sütunlar uç odalara geri verilir (kestirimli uç payı
   orta odayı omurga dışına taşırıp kapısız bırakıyordu — salon erimesi). Çekirdek
   gölgesi varsa EB. YATAK o uca (eb. banyo kapısız yaşayabilen tek oda olarak gölgeye
   oyulur — kullanıcının yangın merdiveni arkası hamlesi), salon karşı uçta. `unit.comb`
   işaretli dairede slimAntres tabanı max(6 m², %12) — omurga 3,5 m²'ye kemirilince
   odalar köşe temasıyla şişiyordu. 10×2,5 salon / 7×2 mutfak şeritleri böyle öldü;
   40×12 sığ bant artık v21 ile örtüşüyor (YATAK 3×3,5 birebir). Derin bantta (≥2,5 m
   cephe payı) T-plan korunur — kullanıcı da v21'de korudu. *Ders #3*: giriş sırasına
   yatak itilirse şerit derinliği min 2,5 m (2 m yatak yasadışıydı).
16. **İçe/dışa aktarma** (`stateSnapshot`/`restoreState`/`importPlanText`): dışa
   aktarılan SVG `<metadata id="kpState">` içinde TAM durumu taşır (girdiler + bölge
   hücreleri + kapılar + komb işaretleri) → "SVG içe aktar" düğmesi / pencereye
   sürükle-bırak, generate() ÇAĞIRMADAN birebir geri kurar — elle düzenlemeler böylece
   KALICILAŞIR (bilinen sınır #1'in çözüm yolu). Durumsuz eski SVG'ler `importLegacySvg`
   ile geometriden çözülür: 0,5 m hücre kareleri (renk→tip) + duvar çizgileri (bölge
   ayrımı) + #faf8f3 kapı boşlukları (daire gruplama: kapı grafiği bileşenleri, ortak
   alanlar hariç) + etiketler (BANYO/WC renk ayrımı, adlar; ölçü yazıları paint-order
   ile elenir). Kapısız oda grubu en uzun ortak duvarlı komşu daireye katılır; spec'ler
   odalardan çıkarılır, özdeşler adetle birleşir. kat-plani-20/21.svg gerçek dosyalarla
   doğrulandı (21: 4 daire, oda alanları birebir, 0 ihlal). Sınırlar: eski SVG'den
   balkon/parsel/ayırıcı taşınmaz; kat sayısı SVG'de yok → mevcut UI değeri kalır.
17. **Vaka döngüsü** (`vakalar/vaka-1..5.svg`, durum gömülü): orta blok, geniş-sığ
   (komb), L-şekil, derin blok (demiryolu), villa 5+1. Akış: kullanıcı içe aktarır →
   elle ince ayar → SVG indir → elden geçmiş hâli AYNI ada `_s` EKİYLE kaydedilir
   (ör. `vaka-1-orta-blok_s.svg`) → yeni sohbette `tests/diff-vaka.js` ile diff'lenir →
   motor kuralı çıkarılır. İlk tur TAMAMLANDI (md.18, motor v22). 3-5'te bilinçli ihlal
   var (ince ayar malzemesi: 3'te yatak penceresiz + eksik yatak, 4'te eksik yatak,
   5'te villa programı — villa programı v22 orta sofayla büyük ölçüde çözüldü).
   DİKKAT: `vakalar/*.svg` v21 motorunun çıktısıdır; v22 motoru aynı girdilerle FARKLI
   (daha iyi) plan üretir — taban karşılaştırması için `tests/v22-test.js` kullanın,
   vaka SVG'sini yeniden üretip üzerine yazmayın (diff malzemesi kaybolur).

18. **Motor v22** (vakalar/vaka-1..5 vs *_s diff'lerinden; 2026-06-10 v5):
   *Mutfak cepheye*: penceresiz mutfak doğalgaz alamaz (kullanıcı kuralı; motor 12
   mutfaktan 10'unu içeride bırakmıştı, kullanıcı 13'ünden 11'ini cepheye taşıdı).
   Genişlik yetiyorsa (`widthM/(fac.length+1)>=3.2`) mutfak giriş sırasından cephe
   sırasına, salonun yanına (`mutToFac`). Mutfak cephedeyse giriş şeridi derinliğini
   BANYO'nun ideal oranı belirler (kılçık banyo doğmasın); açık mutfak ESKİ yolda
   (idealD=0) — değişince vaka-3 D3/D4 salon-antre komşuluğu kopuyordu. İçeride
   kalan mutfağa runChecks 'info' notu. Hol artığı MUTFAĞA bağışlanmaz (L-mutfak).
   *Cephe artığı önce yataklara*: cap'e kadar yatak/mutfak, KALAN salona (salon
   42-50 m²'ye şişiyordu, kullanıcı 5 vakada da küçülttü). Salon yine son emici.
   *WC→KİLER*: 3+ yatak + ensuite'li dairede ikinci tuvalet eb. banyodur; WC yerine
   KİLER (kullanıcı vaka-1'de ikisinde de kılçık WC'yi silip kiler yaptı). kilerT
   çift kiler üretmesin diye `!entry.some(KİLER)` korumalı.
   *Villa ORTA SOFA* (`layoutVillaSofa`): villa artık tek yüklü T-plan değil —
   derin (≥8 m) dikdörtgenimsi (doluluk ≥%85) tabanda antre ortada 1,5 m omurga +
   batı ucundan güney cepheye 1 m giriş kolu (villa kapısı antrenin dışa bakan
   kenarına çizilir, render satır ~2189); odalar K/G cephe bantlarına `assignCols`la
   asılır, tip bazlı pratik genişlik payıyla en boş banda dağıtılır. 14×11 5+1:
   eski 2/5 yatak → yeni 5/5 + eb. banyo, 0 ihlal; 6/7/8 istek → 6 (monotonik,
   "yatak sildim daha az yerleşti" paradoksu öldü). Sığ/dar/L-villa eski yolda.
   *+ANTRE koridora tohumlanır* (addRoom `newAntre`): yeni antrenin tohumu koridora
   komşu hücreler, pencere skoru koridor temasına +300/hücre, cephe hücresine
   −120 (vaka-3 D3: antre alttan eklenip pencereleri yiyordu; artık kullanıcı
   alttan tıklasa bile antre üstte koridora yapışıyor, cepheye dokunmuyor).
   *GERİ AL veri kaybı düzeltildi*: `applyUnitLayout` push'ladığı `ulayout` kaydını
   `generate()` filtresi siliyordu → yığın boşalıp Geri Al planı yok ediyordu
   (kullanıcı 3 saatlik elle çalışmasını kaybetti!). Şimdi: kayıt seçimden ÖNCE
   `stateSnapshot()` taşır, filtre `'cut'||'ulayout'` korur, undo `restoreState`
   ile elle düzenlemeler DAHİL birebir döner (kalan yığın korunur, fit:false).
   Emniyet: yığın boşken Geri Al planı silmeden `confirm()` sorar.
   *Alan/Çevre durum çubuğu*: restoreState ve importLegacySvg artık stArea/stPerim
   günceller (içe aktarımda boş/bayat kalıyordu). stateSnapshot `unitLayout`u
   KOPYALAR (referans sızıntısı ulayout undo'sunu bozuyordu).
   Doğrulama: tests/ 5 paket yeşil (159 denetim); vaka taban ihlalleri: 1-2-5 → 0,
   vaka-3 → 3 (2'si bilinçli + %54 mutfak biçimi, eşik %55'e 1 hücre), vaka-4 → 1
   (bilinçli). *EB. BANYO köşeye* (kat-plani-22 dersi): carveCornerBath skoruna
   duvar teması ödülü (+25/kenar; köşe kazanır, banyo oda ortasında ada kalmaz) ve
   kılçık cezası (pencere ile oda bbox kenarı arasında 1 hücrelik şerit bırakan
   konum −500; banyo üstünde 0,5 m bant yaşanmazdı) eklendi; n*1000 erken-atlama
   kaldırıldı (bonus farkı 1 hücreyi aşabilir). Diff araçları DEPODA: tests/diff-vaka.js (`node tests/diff-vaka.js
   vakalar/vaka-1-orta-blok` — orijinal vs _s), tests/v22-test.js (vaka girdisiyle
   yeniden üret + mutfak cephesi ölç), tests/villa-test.js (sofa monotonluk),
   tests/antre-test.js (+ANTRE koridor tohumu).

19. **Mobil sürüm** (2026-06-11 v6): aynı dosya, duyarlı + dokunmatik. Motor DOKUNULMADI.
   *Düzen* (≤700px medya sorgusu): kenar çubuğu ☰ ile açılan çekmece (`#menuBtn`/`#backdrop`,
   "Yerleşimi Oluştur" çekmeceyi kapatır), daire tablosu alta sabit yarım sayfa (CSS
   `!important` sürükleme inline stillerini ezer; telefonda daraltılmış başlar), araç
   çubuğu yatay kaydırmalı, durum çubuğu + zoom kaydırıcısı gizli, `100dvh`.
   *Dokunmatik katman* (script sonunda, `typeof MouseEvent` korumalı — Node testleri
   atlar): mevcut fare mantığı yeniden YAZILMADI; dokunuşlar sentetik MouseEvent'lerle
   aynı dinleyicilere gider. Eşleme: tutamaç/kapı/balkon kenarı üstünde parmak =
   sürükleme (touchstart'ta hit-test, sentetik mousedown), boşta sürükleme = kaydır,
   dokunuş = sol tık + oda vurgusu (sentetik mousedown+mousemove), uzun basış (500 ms,
   <8 px) = sağ tık menüsü, çift dokunuş (350 ms/30 px, kapı modunda) = çift tık,
   iki parmak = yakınlaştır+kaydır (kendi pinch matematiği, 4–80 px/m). `svg`
   `touch-action:none`; daire tablosu sürüklemesi pointer event'e çevrildi.
   *Dokunma hedefleri*: `HITSC` (coarse pointer'da 1,8; matchMedia yoksa 1) —
   hitWallRun/hitCutHandle/hitDoor/hitBalk yarıçapları; `(pointer:coarse)` CSS'le
   stepper/menü/araç düğmeleri büyür. Onboarding md.4'e dokunmatik karşılıklar eklendi.
   Test: `tests/touch.js` (16: dinleyiciler, nokta/kaydırma ayrımı, pinch, uzun basış
   menüsü + iptali, vurgu). Görsel doğrulama: 390px Chrome — çekmece, kompakt düzen OK.

## Bilerek verilen kararlar
- Salon "emici"dir: program alanı doldurmuyorsa artık alan salona gider (her alternatif
  daha kötüydü: şişen banyolar, dev kiler, sahte odalar).
- Yangın merdiveni uçta DOĞRU: çekirdek ortadayken en kötü nokta uçtur (minimax).
- Aşırı/yetersiz program çizilmez, dürüstçe raporlanır (kullanıcı ayırıcı sürükler ya da
  daire sayısını değiştirir).
- Mutfak dar kenarı ≥2 m (≤45 m² dairede yasal 1,5 m'ye düşebilir).

## Bilinen sınırlar / sonraki adımlar
1. ~~Oda duvarı sürükleme~~ TAMAMLANDI (md.9), Geri Al destekli (md.10).
   ~~Elle değişiklikler yeniden üretimde kaybolur~~ ÇÖZÜLDÜ (md.16): SVG indir →
   içe aktar döngüsü tam durumu saklar; generate() yine sıfırlar (bilinçli).
   Eksik kalan: duvar yalnız kendi doğrultusunda kayar (L-duvar köşesi taşınamaz).
2. Balkon ve ışıklık üretimi yok (ışıklık bilinçli kaldırıldı; iç banyo/WC havalandırması
   şaft notuyla geçiliyor).
3. Çok egzotik taban şekilleri (artı/haç, çentikli) hâlâ "biçimsiz" bayrakları üretebilir.
4. ~~Tek tip kat~~ VİLLADA ÇÖZÜLDÜ (md.20): "Katları ayrı planla" — kat sekmeleri,
   merdiven düşey hiza kilidi, oturum/çıkma kuralları (bkz. "Ne bu?"). APARTMANDA
   hâlâ tek tip kat; otopark, sığınak çizimi yok. Kat geçişi editHistory'yi sıfırlar
   (Geri Al kat içinde çalışır); SVG/PNG indirme aktif katın görüntüsünü verir
   (durum metadata'sı yine tüm katları taşır).
5. **Mevzuata otomatik uydurma** (sıradaki büyük iş): kullanıcı elle yapıyor, motor da
   yapabilir. Önerilen yol: slimUnitAntre desenini genelle — "Mevzuata Uydur" düğmesi,
   `runChecks` ihlali kalan odalar için `moveWallStep` adımlarını dener, ihlal sayısı
   azalan adımları kabul eder (kapı/erişim/biçim korumaları slim'dekiyle aynı; altyapı
   hazır: runChecks artık ihlal listesi döndürüyor).
6. `extendAntreTo` koridoru 2. hücreyi rastgele yandan alır — pürüzlü kenar bırakabilir;
   ince ayar duvar sürüklemeye kalıyor.
7. ~~Antre odalara taşıyor / şişiyor~~ TAMAMLANDI (md.13).
8. ~~Oda etiketi değiştirme/takas, oda bölme, antre menü işlemleri~~ TAMAMLANDI (md.14).
9. Bayat test düzeltmeleri: `wall-drag.js` artık uygulamadaki gibi `snap:` koyar, boş
   (yutulmuş) donörü meşru sayar, dış sınır duvarlarını tanır.
   ~~Çalışma ağacı HEAD'den ilerideydi~~ ÇÖZÜLDÜ (2026-06-10 v5): her şey commit'li
   (f429a7d, motor v22 + vakalar + testler). Yeni oturumda taban = `git show HEAD:`
   GÜVENİLİR. Kural: oturum sonunda commit at; .git/*.lock kalıntısı görürsen
   (çökmüş süreçten, 0 bayt) silmek güvenlidir. .gitignore: .DS_Store, snapshots/zi*, node_modules/, .test-tmp/, .claude/.

## Test altyapısı
Ayrıntılı liste `tests/README.md`'de (v22 vaka/tanı araçları dâhil: diff-vaka.js,
v22-test.js, villa-test.js, antre-test.js + beklenen taban ihlal sayıları).
Kendi kendine yeten (doğrudan `node tests/<dosya>.js`) testler: `room-edit.js` (55),
`antre-slim.js` (51: antre kompakt ≤ max(6 m², %14), ince çıkıntı yok, erişim, bütünlük),
`etiket.js` (31: retype/swap/split/extendAntreTo + geri al + korumalar),
`oda-hint.js` (13: hint'li/hintsiz addRoom, yön denetimi, EB. BANYO çift koruması),
`touch.js` (16: dokunmatik katman — dokunuş/kaydırma/pinch/uzun basış, md.19),
`villa-kat.js` (37: katları ayrı planla — sekme geçişi, merdiven düşey hizası, oturum
oranı + çıkma ihlalleri, üst katta giriş kapısı yok, salonsuz yatak katı + ev geneli
salon denetimi, snapshot gidiş-dönüşü, md.20),
`import.js` (9+: snapshot→restore gidiş-dönüş bölge imzası birebir + eski-SVG geometri
çözümleyici; 2. bölüm `linkedom` ister, yoksa kendini atlar — `npm i linkedom`).
GUNCEL (2026-06-20): `core.js` DOM-free sabit/geometri yardimcilarini, `app.js`
uygulama durumu, daire tipi UI'i, villa katlari ve cekirdek kilidi yardimcilarini,
`planner.js` ana plan uretim motorunu,
`doors.js` kapi aday/secim/vurus hesaplarini, `walls.js` duvar/metrik/anlik goruntu
yardimcilarini, `structure.js` cekirdek + bina siniri duzenleme katmanini, `rooms.js`
antre/oda duzenleme menulerini, `render.js` odaklama/tablo/SVG cizimi, `checks.js`
mevzuat denetimi toplama + panel basimini, `interaction.js` cizim/parsel/balkon/kapi/
duvar/arac cubugu/zoom etkilesimini, `io.js` durum/ice-disari aktarma akisini,
`mobile.js` dokunmatik + mobil cekmece akisini, `boot.js` ilk baslatmayi tasir. Testler
artik `tests/support/app-js.js` uzerinden script etiketlerini sirayla okur.
`npm test` script etiketlerindeki uygulama JS'lerini `.test-tmp/app.js` olarak hazirlar ve alt sureclere `APP_JS` verir; tekil testler de
dogrudan calisir. `/tmp/app.js` hazirligi artik gerekmez.
DİKKAT (2026-06-10): runChecks'te mutfak oran denetimi kaldırılırken açık kalan
`if(...){` bloğu TÜM script'i SyntaxError'la kırıyordu (uygulama hiç açılmıyordu) —
düzeltildi. Şüpheli bozulmada ilk bakılacak yer: script'i çekip `node --check`.
`tests/room-edit.js` artık depoda ve kendi kendine yeter (`node tests/room-edit.js`):
oda sil/ekle/geri al, bütünlük (hücre toplamı + cm tutarlılığı), spec kopyası,
korumalar, villa senaryosu, EB. BANYO, tek daire/kat düzeni (5 ve 12 kat) — 55 denetim. Diğerleri sohbet içinde kurulmuştu:
Node ile başsız test: uygulama scripti `tests/support/app-js.js` ile okunur, DOM stub'lanır, `generate()` çağrılır;
senaryolar: 32×16 standart, 21×18 4×3+1, L-şekil, 48×27 derin blok, villa, stüdyolar.
Denetimler: hücre bütünlüğü, her odanın antreye komşuluğu, banyosuz/salonsuz daire,
mutfak boyutları. Yeni sohbette aynı yöntem hızla yeniden kurulabilir.
