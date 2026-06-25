/* Dağıtım regresyon tripwire'ı (FAZ 0).
   Bir referans kat-planı kümesini measure-plan.js --regen --json ile ölçer.
   - capture: mevcut çıktıyı altın baseline'a yazar (tests/support/dagitim-golden.json).
   - check  : yeniden ölçer, altın baseline ile diff'ler; "iyi" planlar (37/40/master1)
              değişirse veya bad sayısı ARTARSA non-zero döner. 41/42 bilerek değişir
              (iyileşmesi beklenir) → "watch" olarak işaretli, salt-bilgi diff yazılır.
   Motor kodunu DEĞİŞTİRMEZ; yalnız generate() çağırıp ölçer.

   Kullanım:
     node tests/dagitim-baseline.js capture     # altın baseline'ı tazele
     node tests/dagitim-baseline.js check        # regresyon kontrolü (Faz 1+ sonrası)
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const GOLDEN = path.join(__dirname, 'support', 'dagitim-golden.json');

// stable=iyi plan (Faz 1 sonrası değişmemeli); watch=bug vakası (iyileşmesi beklenir)
const CASES = [
  // kat-37: 4255 m² / 11-bölgeli dejenere stres planı (4 küçük-program daire dev bölgelerde);
  //   dağıtım mantığı değişince doğal olarak kayar, bad sayısı artmadıkça regresyon değil → watch.
  { file: 'ref/kat-plani-37.svg',                                  kind: 'watch'  },
  { file: 'ref/kat-plani-40.svg',                                  kind: 'stable' }, // tek daire villa
  { file: 'mesken/inputs/master1.svg',                             kind: 'stable' }, // 512 m², 6 daire, gerçekçi apartman
  { file: 'mesken/referans-kat-planlari/bugs/kat-plani-41.svg',    kind: 'watch'  },
  { file: 'mesken/referans-kat-planlari/bugs/kat-plani-42.svg',    kind: 'watch'  },
];

function measure(file) {
  const res = spawnSync(process.execPath,
    ['tests/measure-plan.js', file, '--regen', '--json'],
    { cwd: ROOT, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`measure-plan failed for ${file}: ${res.stderr || res.stdout}`);
  return JSON.parse(res.stdout.trim());
}

const mode = process.argv[2] || 'check';

if (mode === 'capture') {
  const out = {};
  for (const c of CASES) { out[c.file] = { kind: c.kind, ...measure(c.file) }; }
  fs.writeFileSync(GOLDEN, JSON.stringify(out, null, 2) + '\n');
  console.log('altın baseline yazıldı →', path.relative(ROOT, GOLDEN));
  for (const c of CASES) {
    const o = out[c.file];
    console.log(`  [${o.kind}] ${c.file}: units=${o.units} salons=[${o.salonAreas}] depo=${o.depo} bad=${o.bad}`);
  }
  process.exit(0);
}

// check
if (!fs.existsSync(GOLDEN)) { console.error('altın baseline yok; önce: node tests/dagitim-baseline.js capture'); process.exit(2); }
const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
let fail = 0;
const eqArr = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
for (const c of CASES) {
  const g = golden[c.file]; if (!g) { console.log(`  [yeni] ${c.file} (baseline'da yok)`); continue; }
  const n = measure(c.file);
  const changed = !eqArr(g.salonAreas || [], n.salonAreas || []) || g.units !== n.units || g.depo !== n.depo;
  if (c.kind === 'stable') {
    if (changed || n.bad > g.bad) {
      fail++;
      console.log(`  ✗ STABLE DEĞİŞTİ ${c.file}`);
      console.log(`      önce: units=${g.units} salons=[${g.salonAreas}] depo=${g.depo} bad=${g.bad}`);
      console.log(`      sonra: units=${n.units} salons=[${n.salonAreas}] depo=${n.depo} bad=${n.bad}`);
    } else {
      console.log(`  ✓ stable ${c.file} (units=${n.units} bad=${n.bad})`);
    }
  } else { // watch — bilgi amaçlı diff
    console.log(`  ~ watch  ${c.file}`);
    console.log(`      önce: units=${g.units} salons=[${g.salonAreas}] depo=${g.depo} bad=${g.bad}`);
    console.log(`      sonra: units=${n.units} salons=[${n.salonAreas}] depo=${n.depo} bad=${n.bad}`);
  }
}
if (fail) { console.error(`\n${fail} stable plan REGRESYON.`); process.exit(1); }
console.log('\nregresyon yok (stable planlar korunuyor).');
