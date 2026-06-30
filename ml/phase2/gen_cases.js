/*
 * ml/phase2/gen_cases.js — build the hand-correction case pack in KPTA's OWN format.
 *
 * PORT NOTE (katplanitasarim_ag -> katplanitasarim):
 *   Old repo eval'd the concatenated tests/app.js bundle with an inline DOM stub.
 *   THIS repo loads the app via Node `vm` + tests/support. We reuse
 *   ml/engine.js's makeContext() (single source of truth for the headless app),
 *   then drive stateSnapshot()/restoreState() inside that context. kpState format,
 *   stateSnapshot/restoreState signatures, and plan.regions shape are identical
 *   across repos, so only the loader changed.
 *
 * Flow: the user opens each case directly in the KPTA app ("SVG içe aktar"
 * accepts .json too), hand-corrects it with the app's real tools (wall drag,
 * room retype/swap, add/remove room, doors, boundary), and exports "SVG indir" —
 * which embeds the full structural state in <metadata id="kpState">. That
 * exported state is what ingest.py turns into ML training targets.
 *
 * This script DOES NOT modify the app. For each curated case it:
 *   - generate()        -> run the engine
 *   - stateSnapshot()   -> capture the app's native, importable state
 *   - restoreState()    -> SELF-VERIFY the round-trip (re-read + runChecks)
 * and writes cases/case_<id>.json  (drop straight into KPTA's import).
 *
 * Usage: node ml/phase2/gen_cases.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeContext, CLASSES, CLASS_OF, TYPE_TO_CLASS } = require('../engine');

const GRID = 64;
const OUT = __dirname;
const CASES_DIR = path.join(OUT, 'cases');
fs.mkdirSync(CASES_DIR, { recursive: true });

// ---- geometry helpers ----
const rect = (W, H) => [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
const Lshape = (W, H, nw, nh) => [
  { x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H - nh },
  { x: W - nw, y: H - nh }, { x: W - nw, y: H }, { x: 0, y: H },
];
const Tshape = (W, H, sw, sh) => [
  { x: sw, y: 0 }, { x: W - sw, y: 0 }, { x: W - sw, y: sh },
  { x: W, y: sh }, { x: W, y: H }, { x: 0, y: H }, { x: 0, y: sh }, { x: sw, y: sh },
];
const u = (oda, salon, ensuite, acik, adet) => ({ oda, salon, ensuite: !!ensuite, acik: !!acik, adet });

// ---- curated, diverse case list (same intent as Phase-1 pack) ----
const CASES = [
  { id: 'apt_rect_1p1',   bina: 'apartman', kat: 5, shape: 'rect', label: '1+1 tek tip, dar dikdörtgen',
    poly: rect(12, 10), specs: [u(1, 1, 0, 1, 2)] },
  { id: 'apt_rect_2p1x2', bina: 'apartman', kat: 5, shape: 'rect', label: '2+1 x2, orta dikdörtgen',
    poly: rect(16, 12), specs: [u(2, 1, 0, 1, 2)] },
  { id: 'apt_rect_3p1x2', bina: 'apartman', kat: 6, shape: 'rect', label: '3+1 x2, geniş dikdörtgen',
    poly: rect(20, 13), specs: [u(3, 1, 1, 1, 2)] },
  { id: 'apt_rect_4p1x2', bina: 'apartman', kat: 8, shape: 'rect', label: '4+1 x2, büyük dikdörtgen',
    poly: rect(24, 15), specs: [u(4, 1, 1, 1, 2)] },
  { id: 'apt_rect_studio', bina: 'apartman', kat: 4, shape: 'rect', label: 'Stüdyo (1+0) x3',
    poly: rect(15, 11), specs: [u(1, 0, 0, 0, 3)] },
  { id: 'apt_rect_mixed',  bina: 'apartman', kat: 6, shape: 'rect', label: 'Karışık: 1+1 x2 + 2+1 x1',
    poly: rect(18, 12), specs: [u(1, 1, 0, 1, 2), u(2, 1, 1, 1, 1)] },
  { id: 'apt_L_2p1_3p1', bina: 'apartman', kat: 5, shape: 'L', label: 'L plan: 2+1 + 3+1',
    poly: Lshape(20, 16, 8, 7), specs: [u(2, 1, 0, 1, 1), u(3, 1, 1, 1, 1)] },
  { id: 'apt_L_1p1x3',   bina: 'apartman', kat: 7, shape: 'L', label: 'L plan: 1+1 x3',
    poly: Lshape(18, 14, 7, 6), specs: [u(1, 1, 0, 1, 3)] },
  { id: 'apt_T_3p1x3', bina: 'apartman', kat: 7, shape: 'T', label: 'T plan: 3+1 x3',
    poly: Tshape(22, 16, 5, 5), specs: [u(3, 1, 1, 1, 3)] },
  { id: 'apt_T_mixed', bina: 'apartman', kat: 6, shape: 'T', label: 'T plan karışık: 2+1 + 1+1',
    poly: Tshape(20, 15, 5, 5), specs: [u(2, 1, 1, 1, 1), u(1, 1, 0, 1, 2)] },
  { id: 'apt_tight_1p1_tall', bina: 'apartman', kat: 10, shape: 'rect', label: 'Sınırda: dar+çok katlı 1+1',
    poly: rect(11, 10), specs: [u(1, 1, 0, 0, 2)] },
  { id: 'villa_rect_4p1', bina: 'villa', kat: 2, shape: 'rect', label: 'Villa 4+1, dikdörtgen',
    poly: rect(14, 12), specs: [u(4, 1, 1, 1, 1)] },
  { id: 'villa_L_5p1',    bina: 'villa', kat: 2, shape: 'L', label: 'Villa 5+1 ensuite, L plan',
    poly: Lshape(16, 14, 6, 6), specs: [u(5, 1, 1, 1, 1)] },
  { id: 'villa_T_3p1',    bina: 'villa', kat: 1, shape: 'T', label: 'Villa 3+1, T plan tek kat',
    poly: Tshape(15, 13, 4, 4), specs: [u(3, 1, 1, 1, 1)] },
];

// ---- program -> feature vector (matches ml/gen_dataset.js programVector) ----
const PROG_FEATURES = [
  'isVilla', 'kat', 'nUnitTypes', 'totalUnits', 'totalRooms',
  'totalSalon', 'ensuiteUnits', 'acikUnits', 'avgOdaPerUnit', 'studioUnits',
];
// ---- rasterize an importable state -> (mask, grid) for stats/verification ----
// (same mapping ingest.py uses; top-left aligned in GxG, like ml/engine.js)
function rasterize(st) {
  const sp = st.plan;
  const rows = sp.rows, cols = sp.cols;
  const grid = new Uint8Array(GRID * GRID);
  const mask = new Uint8Array(GRID * GRID);
  const idClass = {};
  sp.regions.forEach(g => {
    let cls = TYPE_TO_CLASS[g.type];
    if (cls === undefined) cls = 'teknik';
    idClass[g.id] = CLASS_OF[cls];
  });
  const cm = new Int16Array(rows * cols).fill(-1);
  sp.regions.forEach(g => g.cells.forEach(i => { cm[i] = g.id; }));
  for (let rr = 0; rr < rows; rr++) for (let cc = 0; cc < cols; cc++) {
    const i = rr * cols + cc, gi = rr * GRID + cc;
    if (sp.inside[i]) {
      mask[gi] = 1;
      if (cm[i] >= 0) grid[gi] = idClass[cm[i]];
    }
  }
  return { grid, mask, rows, cols };
}

function main() {
  const ctx = makeContext();   // headless KPTA app loaded once (vm + tests/support)

  ctx.__CASES__ = CASES;
  ctx.__OUT__ = [];
  const loop = `
  ;(function(){
    const CS = __CASES__, OUT = __OUT__;
    const getEl = id => document.getElementById(id);
    for (let k = 0; k < CS.length; k++) {
      const c = CS[k];
      const rec = { id:c.id, ok:false, error:null, state:null, bad:0, okc:0, total:0 };
      try {
        // reset per-case manual-edit + floor state so cases never contaminate each other
        try { editHistory = []; } catch(e){}
        try { doorOverrides = {}; extraDoors = []; doorHidden = {}; } catch(e){}
        try { customCutsZ = null; unitLayout = {}; } catch(e){}
        try { balconies = []; parcelPts = []; parcelClosed = false; } catch(e){}
        try { koridorYon = 'oto'; katFonksiyon = 'mesken'; } catch(e){}
        try { villaFloors = null; activeFloor = 0; lockedCore = null; } catch(e){}
        getEl('binaTipi').value = c.bina;
        getEl('katSayisi').value = String(c.kat);
        getEl('katYuk').value = '2.9';
        try { const ka = getEl('katAyri'); if (ka) ka.checked = false; } catch(e){}
        unitSpecs = c.specs.map(s=>({...s}));
        pts = c.poly.map(p=>({...p}));
        closed = true;
        generate();
        const checks = runChecks();
        rec.bad = checks.filter(x=>x.s==='bad').length;
        rec.okc = checks.filter(x=>x.s==='ok').length;
        rec.total = checks.length;
        const snap = stateSnapshot();           // KPTA's native importable state
        rec.state = snap;
        // SELF-VERIFY round-trip: restore the snapshot and re-check
        restoreState(snap, {fit:false});
        const checks2 = runChecks();
        rec.bad2 = checks2.filter(x=>x.s==='bad').length;
        rec.nReg = plan.regions.length;
        rec.ok = true;
      } catch(e) { rec.error = String(e && e.message || e); }
      OUT.push(rec);
    }
  })();
  `;
  new vm.Script(loop, { filename: 'gen-cases-loop.js' }).runInContext(ctx);
  const results = ctx.__OUT__;

  const manifest = [];
  let ok = 0;
  for (let k = 0; k < CASES.length; k++) {
    const c = CASES[k], r = results[k];
    if (!r.ok) { console.warn(`  !! ${c.id}: ${r.error}`); continue; }
    ok++;
    // KPTA-importable file: raw stateSnapshot JSON (import accepts .json)
    fs.writeFileSync(path.join(CASES_DIR, `case_${c.id}.json`), JSON.stringify(r.state));
    const { rows, cols } = rasterize(r.state);
    const roundtripOk = (r.bad === r.bad2);   // restore reproduced the same plan
    manifest.push({
      id: c.id, label: c.label, bina: c.bina, kat: c.kat, shape: c.shape,
      program: programVectorFor(c), specs: c.specs,
      rows, cols, regions: r.nReg, bad: r.bad, valid: r.bad === 0,
      roundtripOk, file: `case_${c.id}.json`,
    });
  }
  fs.writeFileSync(path.join(CASES_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log('===== KPTA CASE PACK =====');
  console.log(`ok ${ok}/${CASES.length}  (KPTA-importable .json + self-verified round-trip)`);
  for (const m of manifest) {
    console.log(`  ${m.id.padEnd(20)} ${m.bina.padEnd(9)} ${m.kat}k ${String(m.shape).padEnd(4)} ` +
      `${m.rows}x${m.cols} reg=${String(m.regions).padStart(2)} ${m.valid ? 'valid ' : 'bad=' + m.bad} ` +
      `roundtrip=${m.roundtripOk ? 'OK' : 'FAIL'}`);
  }
  const allRt = manifest.every(m => m.roundtripOk);
  console.log(`\nround-trip (stateSnapshot -> restoreState -> aynı plan): ${allRt ? 'TÜMÜ OK ✓' : 'BAZILARI FAIL ✗'}`);
  console.log('wrote', ok, 'cases + manifest.json to', CASES_DIR);
}

// program vector with the case's kat baked in (helper avoids the closure pitfall above)
function programVectorFor(c) {
  const s = c.specs;
  const totalUnits = s.reduce((a, x) => a + x.adet, 0);
  const totalRooms = s.reduce((a, x) => a + x.oda * x.adet, 0);
  const totalSalon = s.reduce((a, x) => a + (x.salon > 0 ? x.adet : 0), 0);
  const ensuiteUnits = s.reduce((a, x) => a + (x.ensuite ? x.adet : 0), 0);
  const acikUnits = s.reduce((a, x) => a + (x.acik ? x.adet : 0), 0);
  const studioUnits = s.reduce((a, x) => a + (x.salon === 0 ? x.adet : 0), 0);
  return [
    c.bina === 'villa' ? 1 : 0, c.kat, s.length, totalUnits, totalRooms,
    totalSalon, ensuiteUnits, acikUnits, totalUnits ? totalRooms / totalUnits : 0, studioUnits,
  ];
}

main();
