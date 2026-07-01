/* APARTMAN HOLÜ UÇ BUDAMA — regresyon.
   Bug: koridor bandı generation'da tüm eni (c=0→cols) claim ediliyor (planner.js ~586);
   hiçbir antre/çekirdeğe komşu olmayan UÇ sütunları dış cepheye dayanmış ÖLÜ dolaşım
   kalıyordu ("koridoru kapatmıyor, uca kadar götürüyor" — kat-plani-51: koridor 30 m/cols
   0-59 ama hizmet 22,5 m/cols 11-55, sol 5,5 m + sağ 2 m ölü uç cepheye dayalı).
   Fix: rectifyCorridorEnds (planner.js) ölü uç sütunlarını komşu daire odalarına KASKAD
   devreder (tek büyük odaya akıtır, awkward küçük komşuya dokunmaz) → koridor yalnız hizmet
   aralığında, cepheden çekik. Bkz memory [[koridor-uc-budama]] (varsa). */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { scriptSources } = require('./support/app-js');
const { installDom } = require('./support/dom-stub');

const ROOT = path.resolve(__dirname, '..');
let fails = 0;
const F = m => { fails++; console.log('  [FAIL]', m); };

const dom = installDom();
const ctx = vm.createContext({
  console, matchMedia: () => ({ matches: false }),
  document: dom.document,
  window: { addEventListener() {}, matchMedia: () => ({ matches: false }) },
  XMLSerializer: function () { this.serializeToString = () => ''; },
  Image: function () {}, Blob: function () {},
  URL: { createObjectURL: () => '', revokeObjectURL() {} },
  localStorage: { getItem() { return null; }, setItem() {} },
  requestAnimationFrame: fn => fn && fn(), setTimeout, clearTimeout,
  navigator: { userAgent: 'node' }
});
scriptSources().forEach(({ source, filename }) => {
  new vm.Script(source, { filename }).runInContext(ctx);
});

console.log('--- Apartman holü uç budama ---');

const fixture = fs.readFileSync(path.join(__dirname, 'support', 'koridor-uc-fixture.json'), 'utf8');
ctx.__SVG = fixture;
new vm.Script(`
  importPlanText(__SVG, 'test-51');
  generate(true);
  const cols = plan.cols, rows = plan.rows, cm = plan.cm;
  const byId = {}; plan.regions.forEach(g => byId[g.id] = g);
  const kor = plan.regions.find(g => g.type === 'koridor' && g.cells.length);
  const set = new Set(kor.cells);
  const SERVE = t => t==='antre'||t==='merdiven'||t==='asansor'||t==='yangin';
  let cmin=1e9,cmax=-1,rmin=1e9,rmax=-1;
  kor.cells.forEach(i=>{const r=(i/cols)|0,c=i%cols; if(c<cmin)cmin=c;if(c>cmax)cmax=c;if(r<rmin)rmin=r;if(r>rmax)rmax=r;});
  // dış cepheye değen koridor hücresi
  const touchExt = i => { const r=(i/cols)|0,c=i%cols;
    return r===0||r===rows-1||c===0||c===cols-1||!plan.inside[i-cols]||!plan.inside[i+cols]||!plan.inside[i-1]||!plan.inside[i+1]; };
  const ext = kor.cells.filter(touchExt).length;
  // hizmet sütun aralığı
  let sMin=1e9,sMax=-1;
  for(let c=cmin;c<=cmax;c++)for(let r=rmin;r<=rmax;r++){ const i=r*cols+c; if(!set.has(i))continue;
    const served=[[r-1,c],[r+1,c],[r,c-1],[r,c+1]].some(([rr,cc])=>{if(rr<0||cc<0||rr>=rows||cc>=cols)return false;const g=byId[cm[rr*cols+cc]];return g&&SERVE(g.type);});
    if(served){ if(c<sMin)sMin=c; if(c>sMax)sMax=c; } }
  const chk = (typeof runChecks==='function') ? (runChecks()||[]) : [];
  __OUT = {
    corRange:[cmin,cmax], servedRange:[sMin,sMax], ext,
    width: corridorMinWidth(kor, cols), connected: regConnected(kor),
    corBad: chk.filter(c=>c.s==='bad' && (/en dar/.test(c.t)||/kom[şs]u de[ğg]il/.test(c.t))).map(c=>c.t),
    reg: REG.koridorMin
  };
`, { filename: 'gen.js' }).runInContext(ctx);
const o = ctx.__OUT;

// ön-koşul: hizmet aralığı bina İÇİNDE (uçlara dayanmıyor) → cepheden çekilme anlamlı
if (!(o.servedRange[0] > o.corRange[0] || o.servedRange[1] < o.corRange[1] || o.ext === 0))
  console.log('  not: bu fixture için budanacak ölü uç yok (ön-koşul zayıf)');

console.log('  koridor sütun:', o.corRange.join('-'), '| hizmet:', o.servedRange.join('-'), '| cephe teması:', o.ext, '| genişlik:', o.width, 'm');

// 1) koridor artık dış cepheye DEĞMEMELİ (ölü uçlar odalara devredildi)
if (o.ext !== 0) F('koridor hâlâ dış cepheye dayanıyor (ext=' + o.ext + '); uçlar budanmadı');
// 2) koridor sütun aralığı = hizmet aralığı (ölü uç kalmadı)
if (o.corRange[0] !== o.servedRange[0] || o.corRange[1] !== o.servedRange[1])
  F('koridor sütun aralığı ' + o.corRange.join('-') + ' ≠ hizmet aralığı ' + o.servedRange.join('-') + ' (ölü uç kaldı)');
// 3) genişlik + bağlantı korunmalı
if (o.width < o.reg - 1e-9) F('koridor genişliği bozuldu: ' + o.width + ' m < ' + o.reg);
if (!o.connected) F('koridor kopuk (uç budama bağlantıyı bozdu)');
// 4) budama koridor genişlik/erişim bad'i DOĞURMAMALI
if (o.corBad.length) F('uç budama koridor bad doğurdu: ' + o.corBad[0]);

console.log(fails ? '' : '  ✓ TÜM DENETİMLER GEÇTİ');
if (fails) { console.log('FAIL: ' + fails); process.exit(1); }
