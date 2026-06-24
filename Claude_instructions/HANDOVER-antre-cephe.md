# HANDOVER — Antre-cephe layout refactor (yeni session için)

> Önceki session: FAZ 1/3/4/5 + uydu tile (#6) bitti. Bu not, **kalan "sağlam iş"**i
> yeni bir session'ın temiz devralması için. Tek hedef: **antre artık dış cepheye dayanmasın.**

## Bug (kullanıcının "killer move" dediği)
Motor bazen **ANTRE'yi (giriş/sirkülasyon) binanın dış YAN cephesine (E/W kenar)** dayıyor.
Cephe = pencere frontajı; salon/yatak'a ait olmalı, antreye değil. Sonucu: bir yatak
penceresini kaybediyor veya hiç yerleşemiyor (örn. 40×14 vakasında "EB. YATAK ODASI 0 m²").

## Nasıl tekrar üretilir / ölçülür
- Tespit: bir `type==='antre'` bölgesinin, 4-komşusundan biri `!inside` (bina dışı) olan
  hücresi varsa antre cepheye değiyor demektir.
- Görülen vakalar (hepsinde mevcut): `~/Downloads/kat-plani-39.svg`, `mesken/inputs/master1.svg`,
  ve sentetik: `8×24 (3+1 ×2)` dar-derin, `40×14 (2+1 ×5)` geniş.
- Ölçüm araçları (commit'li): `node tests/measure-plan.js <svg> --regen --json` (bad/depo/m²),
  `node tests/render-svg.js <in.svg> <out.svg> --regen` (headless görsel SVG → tarayıcıda bak).
  (Önceki session'ın `.test-tmp/antre-scan.js` tarayıcısı gitignore'lu, silinmiş olabilir — yukarıdaki
  tespit kuralıyla 10 satırda yeniden yazılır.)

## Kök sebep (debug ile doğrulandı)
Antre, cephe boyunca **çok-hücreli dikey ŞERİT** olarak yerleşiyor; yanındaki hücreler de antre,
yaşam odası daha içeride. Şerit **birden çok `planner.js`/`layoutUnit` yolundan** doğuyor:
- `corrCells` (rail/demiryolu iç-koridoru, ~satır 1232-1248) — küçük artık parça antreye "cep".
- hol-arm leftover (~1276-1279) — köşe odası geri almazsa antreye.
- köşe-trim (`trimL/trimR`) yalnız `facR.length>=2` iken çalışıyor (~1256).

## Neden POST-LAYOUT düzeltilemez (önceki session denedi, 3 yol)
1. Hücre-hücre devir → antrede **ince çıkıntı** → `tests/antre-slim.js` (`thinCells===0`) kırılır.
2. Tam-şerit devir + `thinCells` guard → **no-op** (devredecek bitişik yaşam odası yok).
3. Sebep: antre ŞERİDİN kendisi; düzeltme = **relokasyon** (antreyi içeri, odayı cepheye), küçültme değil.
→ Bu yüzden **layout-anı** çözülmeli.

## Doğru çözüm (refactor)
`layoutUnit` (planner.js) **sütun-atamasını** öyle değiştir ki: dairenin **bina-kenarı (dış) yan
sütunları DAİMA yaşam odasına (salon/yatak)**, antre **iç sütunlara** gitsin. Çok-yollu:
- Köşe-trim'i `facR.length>=1` ve corrCells'i de kapsayacak şekilde genişlet, VE
- facade-band assignCols'ta köşe odalarının bina-kenarı sütununu kapsamasını garanti et.
- `dOf`/`alOf` eksenine dikkat (yatay vs dikey koridor); "dış yan" = dairenin alOf min/max
  sütununun dışı `!inside` olan taraf (komşu daireyse iç, dokunma).

## Kurallar
- **Kırılgan bölge:** `layoutUnit` motorun en hassas yeri; FAZ-artık #1 (derin mutfak) tam burada
  regresyon vermişti (kat39 bad 7→8). Her adımda ÖLÇ.
- **Sıkı bar:** `kat39 bad ≤ 7` + `master1 byte-aynı` + tam suite yeşil (`node tests/run-all.js`)
  + antre-cephe teması belirgin azalsın. Sağlanmazsa o adımı geri al.
- **Rollback tag:** `faz1345-tamam-pre-faz2-20260624` (gerekirse `git reset --hard`).

## Git durumu (devir anı)
- `master` (push'lu): FAZ 1/3/4/5 + docs.
- `artik-fixes` branch: master + **#6 uydu tile (commit 6db727d, MERGE EDİLMEDİ)** — canlı doğrulandı, merge'e hazır.
- Yeni session: `artik-fixes`'ten yeni branch aç (örn. `antre-cephe-fix`), refactor'u orada yap.

## Bu turda KAPANANLAR (tekrar uğraşma)
- #1 derin mutfak: denendi, regresyon → kapatıldı.
- #2 antre-fill: antre `biçimsiz` denetiminden muaf → ölçülemez → atlandı.
- #6 uydu: bitti (yukarıda).
- Bekleyen (ayrı, opsiyonel): #3 L-duvar köşe sürükleme, #4 otomatik ışıklık (Option C = FAZ 2'yle aynı),
  #5 egzotik "biçimsiz" yanlış-pozitif.

---

## SONUÇ — antre-cephe ÇÖZÜLDÜ (2026-06-24, branch `antre-cephe-fix` → master'a merge)
**Çözüm: `freeEdge`** (planner.js `layoutUnit`). POST-LAYOUT relokasyon DEĞİL — layout-anı, sütun-düzeyi:
bina dış YAN kenar sütunu (alOf-uç, dış komşu `!inside`) entry şeridine girmez; o sütunu köşe cephe odası
TAM DERİNLİK kapsar → antre içeri kayar, odalar **dikdörtgen** kalır (biçimsiz doğmaz). 3 nokta: `freeEdge`
Set'i + non-combU inStrip'te loB/hiB ile kenar dışlama (şerit ≥ needAls) + band-split'te freeEdge→facCells.
- Sonuç: antre-cephe 7→3 bölge (master1 2→0, 40×14 2→0, kat39 5→4 hücre; 8×24 değişmedi = sığ-dar/farklı yol).
- Gate: kat39 bad=7 (aynı set), master1 bad=1, tam suite yeşil. **master1 byte-frozen GEVŞETİLDİ** (kullanıcı
  onayı) → master1'in YENİ çıktısı referans (antre yan cepheden çekildi; tek salon −0.5 m², bölge/bad aynı).
- Ölçüm: `node .test-tmp/antre-scan.js` (gitignored).

## ERTELENDİ — "giriş kapısını çekirdeğe yakın tut, te dibe atma"
Uç dairelerin (master1 D3/D6) giriş kapısı bina ucunda (~12-13 m); orta daireler zaten ~4 m. Denendi, **temiz
çözülemedi** (geri alındı):
- Antre `entry` dizisinde ıslak hacimlerden sonra → assignCols hep yüksek-alOf uca koyar. Çekirdek-tarafına
  taşımak hol-kolu trim'ini kaydırıp köşe odasını L'ye sokuyor → biçimsiz (kat39 bad 7→8).
- **Per-unit guard İMKANSIZ:** oda biçimleri layoutUnit'ten SONRAki fazlarda (slimAntres vb.) kesinleşir;
  layoutUnit-sonrası fill ölçümü yanıltıcı (D3: normal 0.43→final temiz, repositioned 0.48→final 0.50 biçimsiz).
- Doğru çözüm = **layoutUnit banding yeniden tasarımı** (giriş yapısal olarak çekirdek-tarafı). Ayrı/büyük iş.
