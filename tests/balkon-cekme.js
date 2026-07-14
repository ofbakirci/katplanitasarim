/* BALKON-ÇEKME — açık çıkma (balkon) sınırının REFERANSI testi. node tests/balkon-cekme.js

   Mevzuat (PAİY md.41 "Çıkmalar", 41/1-b): açık çıkma "yapı yaklaşma sınırından itibaren
   en fazla 1.50 metre" taşabilir; ayrıca "bina tabanı zeminde yapı yaklaşma sınırlarından
   daha içeri çekilerek ... istenilen ölçülerde yapılabilir".
   → Ölçüm referansı ÇEKME ÇİZGİSİ (yapı yaklaşma sınırı), bina cephesi DEĞİL.

   Eski hata: b.depth > REG.cikmaMax → 'bad'. Bina çekme çizgisinden GERİDE otursa bile
   kırmızı basıyordu (yanlış-pozitif). Vakalar:
     (a) parsel+çekme var, bina çizgide,   2,5 m balkon → 'bad'  (gerçek aşım)
     (b) parsel+çekme var, bina 3 m geride, 2,5 m balkon → 'bad' YOK (kullanıcının vakası)
     (c) parsel YOK,                        2,5 m balkon → 'bad' YOK, dürüst 'info' var
     (d) parsel+çekme var, bina 0,5 m geride, 2,5 m balkon → aşım 2,0 m → 'bad'
*/
'use strict';
const vm = require('vm');
const { scriptSources } = require('./support/app-js');
const { installDom } = require('./support/dom-stub');

let pass = 0, fail = 0;
const T = (name, cond, extra) => {
  if (cond) { pass++; console.log('  OK  ', name); }
  else { fail++; console.log('  [FAIL]', name, extra != null ? '\n         ' + extra : ''); }
};

const PARCEL = [{x:0,y:0},{x:40,y:0},{x:40,y:30},{x:0,y:30}];
const rect = (x0,y0,x1,y1) => [{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];

/* Bir senaryo koş → yalnız "Balkon ..." denetim satırlarını döndür. */
function run({ parcel, bina, balkon }) {
  const dom = installDom({ binaTipi:'apartman', katSayisi:5, katYuk:2.9 });
  const ctx = vm.createContext({
    console, matchMedia:()=>({matches:false}),
    document: dom.document,
    window:{ addEventListener(){}, matchMedia:()=>({matches:false}) },
    XMLSerializer:function(){ this.serializeToString=()=>''; },
    Image:function(){}, Blob:function(){},
    URL:{ createObjectURL:()=>'', revokeObjectURL(){} },
    localStorage:{ getItem(){return null;}, setItem(){} },
    requestAnimationFrame:fn=>fn&&fn(), setTimeout, clearTimeout,
    navigator:{ userAgent:'node' }
  });
  scriptSources().forEach(({ source, filename }) => {
    new vm.Script(source, { filename }).runInContext(ctx);
  });
  ctx.__PARCEL = parcel ? parcel.map(p=>({x:p.x,y:p.y})) : null;
  ctx.__BINA   = bina.map(p=>({x:p.x,y:p.y}));
  ctx.__BALK   = balkon;
  new vm.Script(`
    if (__PARCEL) { parcelPts = __PARCEL; parcelClosed = true; }
    else { parcelPts = []; parcelClosed = false; }
    pts = __BINA; closed = true;
    unitSpecs = [{oda:2,salon:1,ensuite:true,acik:false,adet:2}];
    customCutsZ = null; unitLayout = {}; balconies = [];
    doorOverrides = {}; extraDoors = []; doorHidden = {}; editHistory = [];
    if (typeof villaFloors !== 'undefined') villaFloors = null;
    if (typeof activeFloor !== 'undefined') activeFloor = 0;
    generate();
    pts = __BINA; closed = true;              // generate() sınırı normalize edebilir → vaka geometrisini sabitle
    balconies = [ {...__BALK} ];
    __ENV = (typeof psSetbackPoly === 'function') ? psSetbackPoly() : null;
    __OUT = (collectChecks()||[]).filter(o => /^Balkon /.test(o.t)).map(o => ({ s:o.s, t:o.t }));
  `, { filename:'balkon-cekme-case.js' }).runInContext(ctx);
  return { lines: ctx.__OUT, env: ctx.__ENV };
}

const BALK = { ei:0, t0:5, t1:9, depth:2.5 };   // ei=0 → alt kenar, dış normal -y; 4 m genişlik, 2,5 m derinlik
const hasBad   = r => r.lines.some(o => o.s === 'bad'  && /çekme|çıkma/i.test(o.t));
const hasInfo  = r => r.lines.some(o => o.s === 'info' && /çıkma sınırı/i.test(o.t));
const dump     = r => JSON.stringify(r.lines);

/* Zarfın gerçekten hesaplandığını doğrula (aksi halde (a)/(d) sahte-geçer olurdu). */
const probe = run({ parcel:PARCEL, bina:rect(3,3,37,27), balkon:BALK });
T('çekme zarfı hesaplandı (psSetbackPoly)', probe.env && probe.env.length >= 3, JSON.stringify(probe.env));

/* (a) bina çekme çizgisinde + 2,5 m balkon → çizgiden 2,5 m taşar → 'bad' */
T('(a) bina çizgide, 2,5 m balkon → bad', hasBad(probe), dump(probe));

/* (b) bina 3 m geride + 2,5 m balkon → balkon zarfın İÇİNDE → uyarı YOK (kullanıcının vakası) */
const b = run({ parcel:PARCEL, bina:rect(6,6,34,24), balkon:BALK });
T('(b) bina 3 m geride, 2,5 m balkon → bad YOK', !hasBad(b), dump(b));
T('(b) yanlış-pozitif info de yok', !hasInfo(b), dump(b));

/* (c) parsel yok → mevzuat referansı yok → 'bad' YOK, dürüst 'info' var */
const c = run({ parcel:null, bina:rect(0,0,34,24), balkon:BALK });
T('(c) parsel yok, 2,5 m balkon → bad YOK', !hasBad(c), dump(c));
T('(c) parsel yok → açıklayıcı info var', hasInfo(c), dump(c));

/* (d) bina 0,5 m geride + 2,5 m balkon → çizgiden 2,0 m taşar (>1,5) → 'bad' */
const d = run({ parcel:PARCEL, bina:rect(3.5,3.5,36.5,26.5), balkon:BALK });
T('(d) bina 0,5 m geride, zarfı 2,0 m aşıyor → bad', hasBad(d), dump(d));

/* balkonMinD kuralı korunuyor (derinlik < 1,2 m → kullanışlılık info'su) */
const e = run({ parcel:PARCEL, bina:rect(6,6,34,24), balkon:{ ei:0, t0:5, t1:9, depth:0.9 } });
T('balkonMinD info korunuyor', e.lines.some(o => o.s === 'info' && /kullanışlılık/.test(o.t)), dump(e));

console.log(`\nbalkon-cekme: ${pass} gecti, ${fail} basarisiz`);
process.exit(fail ? 1 : 0);
