/* MESKEN prototip — pkgSlug (render JPEG dosya adı sanitize) birim testi.
   Template'ten (prototip.template.html) pkgSlug fonksiyonu SÖKÜLÜP eval edilir → gerçek
   uygulama test edilir (yeniden yazım değil). Türkçe karakter/boşluk → dosya-güvenli slug. */
'use strict';
const fs = require('fs');
const path = require('path');

let pass=0, fail=0;
const ok=(c,msg)=>{ if(c){pass++;} else {fail++; console.log('  [FAIL]', msg);} };

const src = fs.readFileSync(path.join(__dirname, '..', 'mesken', '02_PROTOTIP', 'prototip.template.html'), 'utf8');
const m = src.match(/function pkgSlug\(s\)\{[\s\S]*?return s\|\|'render';[\s\S]*?\}/);
ok(!!m, 'pkgSlug template içinde bulundu');
if(!m){ console.log(fail?('[FAIL] '+fail+' düştü'):''); process.exit(1); }

// eslint-disable-next-line no-eval
const pkgSlug = eval('(' + m[0].replace(/^function pkgSlug/, 'function') + ')');

ok(pkgSlug('Daire No:1 / Eb. Yatak Odası (18,5 m²)')==='daire-no-1-eb-yatak-odasi-18-5-m',
   'Türkçe kamera etiketi doğru slug (ı/ş/ö/² temizlendi): '+pkgSlug('Daire No:1 / Eb. Yatak Odası (18,5 m²)'));
ok(pkgSlug('ÇĞİÖŞÜ')==='cgiosu', 'büyük Türkçe harfler küçük ASCII (İ→i, tr locale): '+pkgSlug('ÇĞİÖŞÜ'));
ok(pkgSlug('  Salon  ')==='salon', 'baş/son boşluk kırpıldı');
ok(pkgSlug('')==='render', 'boş girdi → varsayılan "render"');
ok(pkgSlug(null)==='render', 'null girdi → varsayılan "render"');
ok(pkgSlug('Blok A')==='blok-a', 'boşluk → tire');
ok(!/[^a-z0-9-]/.test(pkgSlug('Mutfak / Yemek Alanı!!!')), 'çıktı yalnız [a-z0-9-] içerir');
ok(!/^-|-$/.test(pkgSlug('---kenar---')), 'baş/son tire yok');

console.log(fail? ('✗ '+fail+' pkgSlug testi düştü ('+pass+' geçti)') : ('✓ tüm pkgSlug testleri geçti ('+pass+')'));
process.exit(fail?1:0);
