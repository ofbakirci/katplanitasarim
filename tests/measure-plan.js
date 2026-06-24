/* Ölçüm harness'i (FAZ 0+ test protokolü).
   kpState gömülü bir SVG/JSON yükler → opsiyonel olarak generate() ile YENİDEN üretir →
   bölge m² tablosu + ORTAK DEPO m²/% + daire sayısı yazar.
   MOTOR KODUNU DEĞİŞTİRMEZ; yalnız headless generate()/plan'ı çağırıp ölçer.

   Kullanım:
     node tests/measure-plan.js <svg|json>            # kayıtlı state'i ölç (Path A)
     node tests/measure-plan.js <svg|json> --regen    # importla → generate() → ölç (Path B)
     node tests/measure-plan.js <svg|json> --json      # makine-okunur çıktı (regresyon diff için)
*/
'use strict';
const fs = require('fs');
const vm = require('vm');
const { scriptSources } = require('./support/app-js');
const { installDom } = require('./support/dom-stub');

const file = process.argv[2];
const regen = process.argv.includes('--regen');
const asJson = process.argv.includes('--json');
if (!file) { console.error('kullanım: node tests/measure-plan.js <svg|json> [--regen] [--json]'); process.exit(1); }
const txt = fs.readFileSync(file, 'utf8');

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

ctx.__SVG = txt;
ctx.__REGEN = regen;
new vm.Script(`
  importPlanText(__SVG, 'measure-input');
  if (__REGEN) generate();
  __OUT = (function () {
    const M = 0.5, A = M * M;
    const regs = plan.regions.map(g => ({
      name: g.name, type: g.type, unit: g.unit, cells: g.cells.length, m2: +(g.cells.length * A).toFixed(2)
    }));
    let inside = 0; for (let i = 0; i < plan.inside.length; i++) if (plan.inside[i]) inside++;
    const floorM2 = +(inside * A).toFixed(2);
    const depo = regs.filter(r => r.name === 'ORTAK DEPO').reduce((s, r) => s + r.m2, 0);
    const unitRegs = regs.filter(r => r.unit >= 0 && (r.type === 'salon'));
    const units = plan.unitObjs ? plan.unitObjs.length : 0;
    let chk = [];
    try { chk = (typeof runChecks === 'function') ? (runChecks() || []) : []; } catch (e) { chk = [{ s: 'bad', t: '<runChecks hata: ' + e.message + '>' }]; }
    const sev = { ok: 0, info: 0, bad: 0 };
    const bad = [];
    chk.forEach(w => { const s = (w && w.s) || 'ok'; if (sev[s] == null) sev[s] = 0; sev[s]++; if (s === 'bad') bad.push((w && w.t) || String(w)); });
    return {
      regs, floorM2, depo: +depo.toFixed(2), depoPct: floorM2 ? +(depo / floorM2 * 100).toFixed(1) : 0,
      units, rows: plan.rows, cols: plan.cols, cor: [plan.corridorR0, plan.corridorR1],
      checkTotal: chk.length, bad: sev.bad, info: sev.info, ok: sev.ok, badMsgs: bad
    };
  })();
`, { filename: 'measure.js' }).runInContext(ctx);

const o = ctx.__OUT;

if (asJson) {
  // regresyon diff için sabit-sıralı özet
  const salons = o.regs.filter(r => r.type === 'salon').map(r => r.m2).sort((a, b) => a - b);
  console.log(JSON.stringify({
    floorM2: o.floorM2, depo: o.depo, depoPct: o.depoPct, units: o.units,
    rows: o.rows, cols: o.cols, cor: o.cor, regionCount: o.regs.length,
    salonAreas: salons, bad: o.bad, info: o.info, ok: o.ok, checkTotal: o.checkTotal
  }));
  process.exit(0);
}

console.log('mod        :', regen ? 'REGENERATE (generate())' : 'KAYITLI STATE (Path A)');
console.log('grid       :', o.rows + '×' + o.cols, '| koridor R' + o.cor[0] + '-' + o.cor[1], '| kat alanı:', o.floorM2, 'm²');
console.log('daire       :', o.units, '(unitObjs)');
console.log('ORTAK DEPO :', o.depo, 'm²  (kat %' + o.depoPct + ')');
console.log('runChecks   : BAD ' + o.bad + ' | info ' + o.info + ' | ok ' + o.ok + ' (toplam ' + o.checkTotal + ')');
if (o.bad) { console.log('--- BAD (' + o.bad + ') ---'); o.badMsgs.forEach(m => console.log('  ✗', m)); }
console.log('--- bölgeler (≥2 m², azalan) ---');
o.regs.filter(r => r.m2 >= 2).sort((a, b) => b.m2 - a.m2).forEach(r => {
  console.log(String(r.m2).padStart(7), 'm²', String(r.cells).padStart(5), 'hücre ', String(r.type).padEnd(10), r.name);
});
