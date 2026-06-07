# Kat Planı Tasarım Aracı — Devir Notu

Yeni sohbete başlarken bu dosyayı ve `kat-plani-tasarim.html` dosyasını ekleyin.

## Ne bu?
Tek dosyalık web uygulaması (`kat-plani-tasarim.html`). Türkiye mevzuatına göre şematik
apartman/villa kat planı üretir. Kullanıcı bina sınırını çizer (0,5 m ızgara, dik açı
kilidi), daire tiplerini girer (oda/salon/ebeveyn banyosu/açık mutfak/adet), "Yerleşimi
Oluştur" der; motor koridor + çekirdek + daireleri yerleştirir, mevzuat panelinde denetler.

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
10. **Geri Al katmanlı**: `editHistory` yığını duvar ve ayırıcı sürüklemelerini tutar
   (`finishDrag` yazar, `undoEdit` geri alır); Geri Al önce bunları adım adım tüketir,
   yığın boşalınca eski davranışa (planı boz / köşe sil) düşer. `generate()` duvar
   girdilerini (bölge kimlikleri yeniden doğar), `resetCuts()` ayırıcı girdilerini siler.

## Bilerek verilen kararlar
- Salon "emici"dir: program alanı doldurmuyorsa artık alan salona gider (her alternatif
  daha kötüydü: şişen banyolar, dev kiler, sahte odalar).
- Yangın merdiveni uçta DOĞRU: çekirdek ortadayken en kötü nokta uçtur (minimax).
- Aşırı/yetersiz program çizilmez, dürüstçe raporlanır (kullanıcı ayırıcı sürükler ya da
  daire sayısını değiştirir).
- Mutfak dar kenarı ≥2 m (≤45 m² dairede yasal 1,5 m'ye düşebilir).

## Bilinen sınırlar / sonraki adımlar
1. ~~Oda duvarı sürükleme~~ TAMAMLANDI (md.9), Geri Al destekli (md.10). Eksik kalan:
   elle değişiklikler yeniden üretimde kaybolur (kalıcılaştırma yok); duvar yalnız
   kendi doğrultusunda kayar (L-duvar köşesi taşınamaz).
2. Balkon ve ışıklık üretimi yok (ışıklık bilinçli kaldırıldı; iç banyo/WC havalandırması
   şaft notuyla geçiliyor).
3. Çok egzotik taban şekilleri (artı/haç, çentikli) hâlâ "biçimsiz" bayrakları üretebilir.
4. Tek tip kat: zemin/normal kat ayrımı, otopark, sığınak çizimi yok.

## Test altyapısı (sohbet içinde kuruldu, dosyada değil)
Node ile başsız test: HTML'den `<script>` çekilir, DOM stub'lanır, `generate()` çağrılır;
senaryolar: 32×16 standart, 21×18 4×3+1, L-şekil, 48×27 derin blok, villa, stüdyolar.
Denetimler: hücre bütünlüğü, her odanın antreye komşuluğu, banyosuz/salonsuz daire,
mutfak boyutları. Yeni sohbette aynı yöntem hızla yeniden kurulabilir.
