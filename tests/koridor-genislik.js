/* KORİDOR (APARTMAN HOLÜ) GERÇEK MİN GENİŞLİK — regresyon.
   Bug: rectifyCorridor ("ortak hol israfını dairelere aktar") bir bandı 0,5 m'lik zikzağa
   oyuyordu; guard bbox tabanlı g.minSide kullandığı için (bbox yüksekliği değişmez) hiç
   tetiklenmiyordu. checks.js de statik "1,50 m ok" yazıp bunu gizliyordu. Vaka: kat-plani-50.
   Fix: walls.js corridorMinWidth (baskın eksende dik kesit min) → rectifyCorridor guard +
   checks.js gerçek ölçüm. Bkz memory [[koridor-genislik-gercek-olcum]] (varsa). */
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

console.log('--- Koridor gerçek min genişlik ---');

/* 1) corridorMinWidth birim testleri (baskın eksen = yatay; cols=10) */
ctx.__W = {};
new vm.Script(`
  const cols=10;
  const band=[];   for(let r=0;r<3;r++)for(let c=0;c<10;c++) band.push(r*cols+c);        // 3x10 temiz bant
  const pinch=[];  for(let r=0;r<3;r++)for(let c=0;c<10;c++){ if(c===5&&r===2)continue; pinch.push(r*cols+c);} // c5'te 2 hücre (1,0 m)
  const zig=[];    for(let c=0;c<10;c++) zig.push(1*cols+c);                              // tek satır zikzak (0,5 m)
  __W.band  = corridorMinWidth({cells:band},  cols);
  __W.pinch = corridorMinWidth({cells:pinch}, cols);
  __W.zig   = corridorMinWidth({cells:zig},   cols);
  __W.empty = corridorMinWidth({cells:[]},    cols);
  __W.reg   = REG.koridorMin;
`, { filename: 'unit.js' }).runInContext(ctx);
const W = ctx.__W;
if (Math.abs(W.band  - 1.5) > 1e-9) F('temiz 3x10 bant 1,5 m olmalı, oldu ' + W.band);
if (Math.abs(W.pinch - 1.0) > 1e-9) F('tek kısılma (2 hücre) 1,0 m olmalı, oldu ' + W.pinch);
if (Math.abs(W.zig   - 0.5) > 1e-9) F('tek satır zikzak 0,5 m olmalı, oldu ' + W.zig);
if (W.empty !== 0)                  F('boş bölge 0 olmalı, oldu ' + W.empty);
if (W.reg !== 1.2)                  F('REG.koridorMin 1,2 beklenirdi, oldu ' + W.reg);

/* 2) MOTOR generate(true) ile ASLA < koridorMin üretmemeli (kat-plani-50 kök vaka).
   Fixture = kat-plani-50.svg'nin gömülü kpState'i (input/ gitignored → taşınabilir kopya). */
const svg = fs.readFileSync(path.join(__dirname, 'support', 'koridor-genislik-fixture.json'), 'utf8');
ctx.__SVG = svg;
new vm.Script(`
  importPlanText(__SVG, 'test-50');
  generate(true);
  const kor = plan.regions.find(g => g.type==='koridor' && g.cells.length);
  __GEN = { has: !!kor, w: kor ? corridorMinWidth(kor, plan.cols) : 0, cells: kor ? kor.cells.length : 0 };
`, { filename: 'gen.js' }).runInContext(ctx);
const G = ctx.__GEN;
if (!G.has) F('generate(true) sonrası koridor bulunamadı');
else if (G.w < ctx.__W.reg - 1e-9)
  F('generate(true) koridoru ' + G.w + ' m üretti (< ' + ctx.__W.reg + ' m) — rectifyCorridor hâlâ oyuyor');
else console.log('  regen koridor en dar yeri:', G.w, 'm (' + G.cells + ' hücre) ✓');

/* 3) checks.js kayıtlı BOZUK state'i (0,5 m) kırmızı yakalamalı */
new vm.Script(`
  importPlanText(__SVG, 'test-50');            // regen YOK → kayıtlı zikzak korunur
  const chk = (typeof runChecks==='function') ? (runChecks()||[]) : [];
  const w = (function(){ const kor=plan.regions.find(g=>g.type==='koridor'&&g.cells.length); return kor?corridorMinWidth(kor,plan.cols):0; })();
  __CHK = { w, bad: chk.filter(c=>c.s==='bad' && /en dar/.test(c.t)).map(c=>c.t) };
`, { filename: 'chk.js' }).runInContext(ctx);
const C = ctx.__CHK;
if (C.w >= ctx.__W.reg) F('test ön-koşulu: kayıtlı state koridoru ' + C.w + ' m (< 1,2 m bekleniyordu)');
if (!C.bad.length) F('kayıtlı 0,5 m koridor için checks.js kırmızı üretmedi');
else console.log('  checks.js bozuk state kırmızısı: "' + C.bad[0].slice(0, 60) + '..." ✓');

console.log(fails ? '' : '  ✓ TÜM DENETİMLER GEÇTİ');
if (fails) { console.log('FAIL: ' + fails); process.exit(1); }
