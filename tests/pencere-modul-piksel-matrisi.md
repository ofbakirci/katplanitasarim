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
