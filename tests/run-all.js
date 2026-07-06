const path = require('path');
const { spawnSync } = require('child_process');
const { ROOT, WORKSPACE_APP_JS, prepareAppScript } = require('./support/app-js');

const strictTests = [
  'tests/bootstrap.js',
  'tests/snapshot-regression.js',
  'tests/checks-metin.js',
  'tests/checks-registry.js',
  'tests/antre-slim.js',
  'tests/etiket.js',
  'tests/room-edit.js',
  'tests/room-edit-bugs.js',
  'tests/oda-hint.js',
  'tests/touch.js',
  'tests/villa-kat.js',
  'tests/ticari-kat.js',
  'tests/import.js',
  'tests/dxf-import.js',
  'tests/dxf-roundtrip.js',
  'tests/avlu-blok.js',
  'tests/avlu-edit.js',
  'tests/pencere.js',
  'tests/malzeme.js',
  'tests/furn-clearance.js',
  'tests/train-log.js',
  'tests/wall-drag.js',
  'tests/koridor-daralt.js',
  'tests/koridor-genislik.js',
  'tests/koridor-uc.js',
  'tests/kucuk-kat.js',
  'tests/egik-duvar.js',
  'tests/cut-preserve.js',
  'tests/siginak-duzenle.js',
  'tests/heal-disconnect.js',
  'tests/repair-import.js',
  'tests/core-shadow.js',
  'tests/yangin-merdiven.js',
  'tests/zemin-giris.js',
  'tests/kapi-sigma.js',
  'tests/core-resize.js',
  'tests/acik-mutfak.js',
  'tests/editor.js',
  'tests/export.js',
  'tests/ai-temiz.js',
  'tests/brut-alan.js',
  'tests/test27.js',
  'tests/antre-test.js',
  'tests/camera-prompt.js',
  'tests/balkon-3b.js',
  'tests/dis-gorunum.js'
];

const smokeTests = [
  'tests/harness2.js',
  'tests/test6.js',
  'tests/test9.js',
  'tests/test10.js',
  'tests/test11.js',
  'tests/big.js',
  'tests/antre-size.js',
  'tests/mutfak-check.js',
  'tests/mevzuat-derin.js',
  'tests/villa-test.js',
  'tests/visual5.js',
  'tests/visualL.js'
];

const diagnosticTests = [
  'tests/replay-kulak.js',
  'tests/perf-smoke.js'
];

const includeSmoke = process.argv.includes('--smoke');
const includeDiagnostics = process.argv.includes('--diagnostics');
const tests = strictTests
  .concat(includeSmoke ? smokeTests : [])
  .concat(includeDiagnostics ? diagnosticTests : []);

prepareAppScript();

let failed = 0;
for (const test of tests) {
  const rel = path.relative(ROOT, path.join(ROOT, test));
  console.log(`\n[TEST] ${rel}`);
  prepareAppScript();
  const res = spawnSync(process.execPath, [test], {
    cwd: ROOT,
    env: { ...process.env, APP_JS: WORKSPACE_APP_JS },
    stdio: 'inherit'
  });
  if (res.status !== 0) {
    failed++;
    console.error(`[FAIL] ${rel} exited with ${res.status}`);
  }
}

if (failed) {
  console.error(`\n${failed} test dosyasi basarisiz.`);
  process.exit(1);
}

console.log(`\n${tests.length} test dosyasi tamamlandi.`);
