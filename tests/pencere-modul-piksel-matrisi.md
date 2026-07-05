# PENCERE-MODUL — piksel matrisi (tarayıcı-güdümlü kabul testi)

`buildWindowUnit` (view3d.js) tek parametrik pencere modülünün "pencere altı/üst/yan
boşluk yok" kabulünü doğrular. WebGL gerektirir → headless `npm test` KAPSAMAZ; bu dosya
tarayıcıda (Preview/gerçek Chrome) elle koşulacak reprodüksiyon reçetesidir.

## Neden headless değil
view3d.js THREE'yi CDN'den yükler + `renderer.toDataURL` gerçek GPU ister. Motor/export
tarafı zaten `tests/pencere.js` + `tests/balkon-3b.js` ile guard'lı (mesh içi değişiklik
export'u etkilemez). Bu matris SADECE mesh geometrisinin görsel bütünlüğünü ölçer.

## Reçete
1. `python3 -m http.server 8762` (repo kökü) → `kat-plani-tasarim.html` aç.
2. Konsol/preview_eval ile:
   - `binaTipi=apartman`, standart 32×16 plan, `balconies=[{ei:0,t0:10,t1:16,depth:1.5}]`, `generate()`.
   - `View3D.open()` → map.
3. Her pencere/balkon-kapısını world-uzayına çevir (px2m − sceneCenter), 5 açıda
   `View3D.fpvSnapDataURL({eye,look,eyeH,lookH})` render et, PNG'yi canvas'a decode et,
   pencere ALT/ÜST/YAN kenarları boyunca (sol/orta/sağ × 3, yan × 2) arka-plan rengi
   (23,21,18 = sahne bg / oyuk içi) piksellerini say.
4. Açılar: (a) içeriden düz, (b) alçak/grazing yukarı, (c) yakın aşağı, (d) dışarıdan cephe,
   (e) orbit izometrik (snapDataURL). ÜST tarama tam-boy açıklıkta WALL_H'ı (2.7 m) AŞMAMALI
   (çatı-üstü gökyüzü arka-plan sayılır → yanlış-pozitif; band'ı 2.69 m'ye clamp'le).

## Kabul (2026-07-05 koşumu — HEPSİ 0)
Hücre = alt/üst/yan boşluk px. 17 pencere × 4 FPV açı = 68 hücre + orbit + balkon = TÜMÜ 0.

| açıklık            | a düz | b grazeUp | c aşağı | d dışarı | e orbit |
|--------------------|-------|-----------|---------|----------|---------|
| normal pencere     | 0/0/0 | 0/0/0     | 0/0/0   | 0/0/0    | 0       |
| yan-yana sol       | 0/0/0 | 0/0/0     | 0/0/0   | 0/0/0    | 0       |
| yan-yana sağ       | 0/0/0 | 0/0/0     | 0/0/0   | 0/0/0    | 0       |
| balkon cam kapı    | 0/0/0 | 0/0/0     | 0/0/0   | 0/0/0*   | 0       |
| alçak parapet 0.3  | 0/0/0 | 0/0/0     | 0/0/0   | 0/0/0    | —       |
| tam-boy (full)     | 0/0/0 | 0/0/0     | 0/0/0   | 0/0/0*   | —       |

\* tam-boy açıklık (top=WALL_H): ÜST tarama gökyüzü-clamp'siz 21px verir (çatı üstü bg);
2.69 m clamp → 0px. Gerçek seam DEĞİL.

## Yürüyüş davranışı (S3 regresyon guard'ı)
- Balkon cam kapısı: `walkClearForTest(bd.midX, bd.midZ+0.5, 0,-1, 1.2)` = TRUE (geçilir).
- Pencere: aynı sorgu = FALSE (collider engeli).
- Balkon korkuluğu (dış kenar): `walkClearForTest(bd.midX, bd.midZ-1.4, 0,-1, 0.5)` = FALSE (BLOCKED).

## R2 NOTU (2026-07-05) — gizli gömme + görünür SEAL taşmaları düzeltmesi
R1 (374cb42) alt/üst/yan boşluğu 0'a indirdi AMA kasa duvar yüzüne TAŞARAK yaptı (kullanıcı SS: kalın
alt bant, üst köşe beyaz çıkıntı, oyuktan büyük kasa). R2 fix "gizli gömme":
- `ft=WALL_T` (fluş; R1'de WALL_T+2·WIN_EPS öne taşıyordu). Kasa artık duvar yüzünden taşmaz.
- Her kayıt İKİ parça: GÖRÜNÜR ince profil (oyuk içi, 4 kenarda eşit `fr=0.065`, ft fluş) + GİZLİ
  sızdırmazlık dili (`ftSeal=WALL_T-2·WIN_EPS`, iki yüzden WIN_EPS içeride → dolgu sarar, görünmez).
- `SEAL=2·WIN_EPS` (görünmez dil derinliğinde; R1'in 3·WIN_EPS'i görünür derinlikteydi → taşma).
- Alt kayıt GÖRÜNÜR bandı `sill-fr`'e iner (parapet solidine gömülü sill-tahtası) → sill kotundaki
  ince cavity çizgisi kapanır. (Kanıt: `botVisBot=sill` iken FPV'de y≈508'de ~340×7px `23,21,18` slit;
  `sill-fr` iken 0.)

### R2 tarama yöntemi (R1'den fark: silüet-halka, band DEĞİL)
R1'in "merkez band" taraması cam-içi see-through + bina-kenarı void'i cavity sayıyordu (yanlış-pozitif).
R2 taraması: FPV render'da BEYAZ PVC frame silüeti bbox'ını bul (`200<rgb<250`), sonra bbox'ın 4px DIŞ
halkasında cavity `23,21,18` say. İç-cepheli 16 pencere × 3 açı (düz/grazeUp/aşağı) → **halka cavity=0**.
KÖŞE pencereler (0,3,6,12,13): FPV gözü tek-dominant-normalle bina köşesi dışına düşer → void bbox'a
karışır (harness sınırı, mesh kusuru değil; görsel doğrulandı). Merkez mullion dikey çizgisi = iki cam
panel arası cam boşluğu (pencere camı, dikiş DEĞİL). Görsel kapı: içeriden FPV temiz + dışarıdan cephe
pencereler fluş.

## R3 NOTU (2026-07-06) — SÖVE (reveal) + gerçek KÖK NEDEN (applyRoof parapet ölçek hatası)
Kullanıcı R2'yi reddetti (SS1: kasa "kabartma panel", üst/alt farklı düzlem, "duvara pencere boyu kesik
açıp kasayı İÇİNE OTURT, lento dışarıdan belli olmasın"). R3 SÖVE modeli:
- Kasa artık FLUŞ-tam-tünel değil: oyuğun İÇ ağzına 4 kenar DUVAR-BOYALI reveal cap (iç yüzle fluş, `REVEAL≈0.06`
  derin), beyaz PVC kasa cap ARKASINDA (tam `WALL_T` derin, sızdırmaz) → içeriden "duvar → söve(gölgeli) →
  ince beyaz kasa → cam". Cam TEK PANEL, açıklıktan `fr` taşkın (kenar strip'i örter).
- **GERÇEK KÖK NEDEN (kalıcı see-through `23,21,18` kara yarık):** `applyRoof` parapet/lento dolgusunu
  (`isWin`/`isLeaf`) çatı geçişinde SADECE `scale.y` ile ölçekliyordu, `position.y`'yi SIFIRLAMIYORDU →
  build (dollhouse, roofOn=false, WALL_LOW konum) sonrası FPV (roofOn=true, scale→1) parapet MERKEZDEN
  büyüyüp TEPESİ düşüyordu → kasa bandı ile parapet arasında dış cepheye bakış hattı (kara yarık). Fix:
  parapet/lento `isWinFill`/`isLeafFill` tag'i + `__baseY`/`__h0` userData + applyRoof TABANDAN yeniden
  konumlar (`scaleGrounded`). Kasa/cam/söve geometrisi zaten doğruydu; hata çatı-ölçek katmanındaydı.
- **Kanıt (opak-magenta cam ile teşhis + geri alındı):** kara yarık cam ARDINDA değil, alt kasa bandı ↔
  parapet arasında gerçek delikti; renk-kodlu mesh probu (parapet yeşil / band mavi) yarığı tam yerleştirdi.

### R3 tarama (bg-count, opak-arka doğrulandı) — HEPSİ 0
`fpvSnapDataURL` 16 iç-cepheli pencere × 4 açı (a düz / b grazeUp / c aşağı / d dışarı), pencere merkez
kolon şeridinde `rgb<(28,26,23)` bg pikseli say = **64 hücre TÜMÜ 0** (2026-07-06 koşumu). Ek: opak cam
ile de 16 pencere frontal = 0 (kara yarık cam-see-through değil, gerçek delik değil artık).

## R3 KÖŞE (R3-3) — köşe dolgu prizması
Yarım-kalınlık (U1) duvar kutuları köşede uç uca bitince köşe karesi dolmuyordu + iç ofsetle dış köşede
uç yüzeyi/derz görünüyordu ("kalınlık gözüküyor, tam birleşmemiş"). Fix: her poligon vertex'ine (kenar BAŞ
köşesi) tam-`WALL_T` dikdörtgen prizma (`isWallPost`, vertex-merkezli, `nIn` yönünde `WALL_EPS` mikro-ofset
z-fight için) → köşe her açıdan dolu (90°-dışı/T-birleşim de). `holeScan` wall-run saymaz (isWallPost),
çarpışma segment'lerden gelir → 0 hole korunur; applyRoof tam-boy duvar gibi ölçekler.

## R3-2 (dither/clipping + core çarpışma) — DOĞRULAMA, KOD DEĞİŞİKLİĞİ YOK
- Kullanıcının SS2 "dama/noktalı çözünme (clipping)" algısı için: motorda alphaHash/dither/wall-fade/near-
  fade MEKANİZMASI YOK (grep doğrulandı); FPV duvarları daima opak (isWall'da transparency yok). FPV/orbit
  core-komşu duvarlarda dither üretilemedi (flipRatio 0; orbit yakın-plan temiz) → zaten çözülmüş (S2 commit).
- Core (MERDİVEN/ASANSÖR) çarpışma: `walkSimForTest` her core kenarına dik yürüyüş → penetrasyon HEP negatif
  (karakter duvarı GEÇMİYOR, 0.38m dışarıda durur); `collisionHoleScan` 0 hole. Core duvarları sağlam.
