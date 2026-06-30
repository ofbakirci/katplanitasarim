/*
 * ml/phase2/gen_cases_batch2.js — BATCH 2 of the hand-correction case pack.
 *
 * Same machinery as gen_cases.js (headless engine via ml/engine.js + vm,
 * stateSnapshot()/restoreState() round-trip self-test), but writes a SEPARATE
 * pack to cases_batch2/ so it never overwrites the original 14-case batch.
 *
 * CONTENT FOCUS for this batch (driven by ML weak classes + missing patterns):
 *   - CLOSED kitchen heavy: most kitchen-bearing units have acik:0 (closed/
 *     bağımsız mutfak). Batch-1 was mostly open-kitchen; mutfak is the weakest
 *     ML class (IoU 0.60) and closed-kitchen representation was scarce.
 *   - salon->yatak & koridor->antre correction targets: medium/large apartment
 *     units and multi-unit floors where the engine tends to over-grow the salon
 *     or emit an unnecessary corridor.
 *   - diversity: rect / L / T, 1+1 .. 4+1, apartment-heavy + a few villas, mix
 *     of valid and borderline (bad>0).
 *
 * DOES NOT touch io.js or any engine/app source — engine is read-only here.
 *
 * Usage: node ml/phase2/gen_cases_batch2.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeContext, CLASSES, CLASS_OF, TYPE_TO_CLASS } = require('../engine');

const GRID = 64;
const OUT = __dirname;
const CASES_DIR = path.join(OUT, 'cases_batch2');
fs.mkdirSync(CASES_DIR, { recursive: true });

// ---- geometry helpers (identical to gen_cases.js) ----
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

// ---- BATCH 2 cases ----
// `pattern` = which correction pattern this case is a candidate for.
//   kapali-mutfak     : closed kitchen present, ML should learn its footprint
//   salon-fazla-buyuk : engine likely over-grows the salon -> shrink to a yatak
//   gereksiz-koridor  : engine likely emits a corridor -> retype to antre/merge
//   karisik           : combination of the above
const CASES = [
  // ---------- CLOSED-KITCHEN HEAVY (acik:0) ----------
  { id: 'b2_apt_rect_2p1x3_closed', bina: 'apartman', kat: 6, shape: 'rect',
    label: '2+1 x3 kapalı mutfak, çok daireli kat', pattern: 'gereksiz-koridor',
    poly: rect(20, 13), specs: [u(2, 1, 0, 0, 3)] },
  { id: 'b2_apt_rect_3p1x2_closed', bina: 'apartman', kat: 7, shape: 'rect',
    label: '3+1 x2 kapalı mutfak, geniş daire', pattern: 'salon-fazla-buyuk',
    poly: rect(20, 14), specs: [u(3, 1, 1, 0, 2)] },
  { id: 'b2_apt_rect_3p1x3_closed', bina: 'apartman', kat: 8, shape: 'rect',
    label: '3+1 x3 kapalı mutfak, büyük kat', pattern: 'karisik',
    poly: rect(26, 14), specs: [u(3, 1, 1, 0, 3)] },
  { id: 'b2_apt_rect_4p1x2_closed', bina: 'apartman', kat: 9, shape: 'rect',
    label: '4+1 x2 kapalı mutfak ensuite', pattern: 'salon-fazla-buyuk',
    poly: rect(24, 16), specs: [u(4, 1, 1, 0, 2)] },
  { id: 'b2_apt_L_3p1x2_closed', bina: 'apartman', kat: 6, shape: 'L',
    label: 'L plan 3+1 x2 kapalı mutfak', pattern: 'gereksiz-koridor',
    poly: Lshape(22, 16, 9, 7), specs: [u(3, 1, 1, 0, 2)] },
  { id: 'b2_apt_L_2p1_3p1_closed', bina: 'apartman', kat: 5, shape: 'L',
    label: 'L plan 2+1 + 3+1 kapalı mutfak', pattern: 'karisik',
    poly: Lshape(20, 16, 8, 7), specs: [u(2, 1, 0, 0, 1), u(3, 1, 1, 0, 1)] },
  { id: 'b2_apt_T_3p1x2_closed', bina: 'apartman', kat: 7, shape: 'T',
    label: 'T plan 3+1 x2 kapalı mutfak', pattern: 'gereksiz-koridor',
    poly: Tshape(22, 16, 5, 5), specs: [u(3, 1, 1, 0, 2)] },
  { id: 'b2_apt_T_4p1_closed', bina: 'apartman', kat: 5, shape: 'T',
    label: 'T plan 4+1 tek büyük daire kapalı mutfak', pattern: 'salon-fazla-buyuk',
    poly: Tshape(20, 15, 5, 5), specs: [u(4, 1, 1, 0, 1)] },
  { id: 'b2_apt_rect_2p1x4_closed', bina: 'apartman', kat: 8, shape: 'rect',
    label: '2+1 x4 kapalı mutfak, kalabalık kat', pattern: 'gereksiz-koridor',
    poly: rect(24, 14), specs: [u(2, 1, 0, 0, 4)] },
  { id: 'b2_apt_rect_mixed_closed', bina: 'apartman', kat: 6, shape: 'rect',
    label: 'Karışık 1+1 x2 + 2+1 x2 kapalı mutfak', pattern: 'karisik',
    poly: rect(22, 13), specs: [u(1, 1, 0, 0, 2), u(2, 1, 1, 0, 2)] },
  { id: 'b2_apt_L_4p1_3p1_closed', bina: 'apartman', kat: 7, shape: 'L',
    label: 'L plan 4+1 + 3+1 kapalı mutfak', pattern: 'karisik',
    poly: Lshape(24, 18, 10, 8), specs: [u(4, 1, 1, 0, 1), u(3, 1, 1, 0, 1)] },
  { id: 'b2_apt_rect_1p1x3_closed', bina: 'apartman', kat: 6, shape: 'rect',
    label: '1+1 x3 kapalı mutfak', pattern: 'kapali-mutfak',
    poly: rect(16, 12), specs: [u(1, 1, 0, 0, 3)] },
  { id: 'b2_apt_tight_2p1x2_closed', bina: 'apartman', kat: 9, shape: 'rect',
    label: 'Sınırda dar 2+1 x2 kapalı mutfak', pattern: 'kapali-mutfak',
    poly: rect(13, 11), specs: [u(2, 1, 0, 0, 2)] },
  { id: 'b2_villa_rect_4p1_closed', bina: 'villa', kat: 2, shape: 'rect',
    label: 'Villa 4+1 kapalı mutfak ensuite', pattern: 'salon-fazla-buyuk',
    poly: rect(15, 12), specs: [u(4, 1, 1, 0, 1)] },
  { id: 'b2_villa_L_5p1_closed', bina: 'villa', kat: 2, shape: 'L',
    label: 'Villa 5+1 kapalı mutfak ensuite, L plan', pattern: 'salon-fazla-buyuk',
    poly: Lshape(17, 15, 6, 6), specs: [u(5, 1, 1, 0, 1)] },
  { id: 'b2_apt_T_2p1x3_closed', bina: 'apartman', kat: 6, shape: 'T',
    label: 'T plan 2+1 x3 kapalı mutfak', pattern: 'gereksiz-koridor',
    poly: Tshape(21, 15, 5, 5), specs: [u(2, 1, 0, 0, 3)] },

  // ---------- OPEN-KITCHEN (acik:1) — for balance/comparison ----------
  { id: 'b2_apt_rect_2p1x2_open', bina: 'apartman', kat: 5, shape: 'rect',
    label: '2+1 x2 açık mutfak', pattern: 'kapali-mutfak',
    poly: rect(16, 12), specs: [u(2, 1, 0, 1, 2)] },
  { id: 'b2_apt_rect_3p1x2_open', bina: 'apartman', kat: 6, shape: 'rect',
    label: '3+1 x2 açık mutfak ensuite', pattern: 'salon-fazla-buyuk',
    poly: rect(20, 13), specs: [u(3, 1, 1, 1, 2)] },
  { id: 'b2_apt_L_2p1x2_open', bina: 'apartman', kat: 5, shape: 'L',
    label: 'L plan 2+1 x2 açık mutfak', pattern: 'gereksiz-koridor',
    poly: Lshape(19, 15, 8, 6), specs: [u(2, 1, 0, 1, 2)] },
  { id: 'b2_apt_rect_1p1x3_open', bina: 'apartman', kat: 7, shape: 'rect',
    label: '1+1 x3 açık mutfak, çok daireli', pattern: 'gereksiz-koridor',
    poly: rect(17, 11), specs: [u(1, 1, 0, 1, 3)] },
  { id: 'b2_apt_T_3p1_open', bina: 'apartman', kat: 5, shape: 'T',
    label: 'T plan 3+1 açık mutfak ensuite', pattern: 'salon-fazla-buyuk',
    poly: Tshape(18, 14, 4, 5), specs: [u(3, 1, 1, 1, 1)] },
  { id: 'b2_apt_rect_mixed_open', bina: 'apartman', kat: 6, shape: 'rect',
    label: 'Karışık 1+1 + 3+1 açık mutfak', pattern: 'karisik',
    poly: rect(19, 12), specs: [u(1, 1, 0, 1, 1), u(3, 1, 1, 1, 1)] },
  { id: 'b2_villa_T_4p1_open', bina: 'villa', kat: 2, shape: 'T',
    label: 'Villa 4+1 açık mutfak ensuite, T plan', pattern: 'salon-fazla-buyuk',
    poly: Tshape(16, 14, 4, 4), specs: [u(4, 1, 1, 1, 1)] },
  { id: 'b2_apt_rect_4p1_open', bina: 'apartman', kat: 5, shape: 'rect',
    label: '4+1 tek büyük daire açık mutfak', pattern: 'salon-fazla-buyuk',
    poly: rect(18, 14), specs: [u(4, 1, 1, 1, 1)] },

  // ---------- STUDIO (kitchen concept n/a) ----------
  { id: 'b2_apt_rect_studio_open', bina: 'apartman', kat: 4, shape: 'rect',
    label: 'Stüdyo (1+0) x3', pattern: 'kapali-mutfak',
    poly: rect(15, 11), specs: [u(1, 0, 0, 1, 3)] },
];

// ---- program -> feature vector (matches ml/gen_dataset.js programVector) ----
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

// classify a case's kitchen: how many kitchen-bearing units are closed vs open.
// (salon===0 studios have no separate kitchen -> counted neither.)
function kitchenOf(c) {
  let closed = 0, open = 0;
  for (const s of c.specs) {
    if (s.salon === 0) continue;        // studio: no separate kitchen
    if (s.acik) open += s.adet; else closed += s.adet;
  }
  let kind = 'n/a';
  if (closed && open) kind = 'karışık';
  else if (closed) kind = 'kapalı';
  else if (open) kind = 'açık';
  return { kind, closedUnits: closed, openUnits: open };
}

function main() {
  const ctx = makeContext();   // headless KPTA app (vm + tests/support); READ-ONLY

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
        const snap = stateSnapshot();
        rec.state = snap;
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
  new vm.Script(loop, { filename: 'gen-cases-batch2-loop.js' }).runInContext(ctx);
  const results = ctx.__OUT__;

  const manifest = [];
  let ok = 0, dropped = 0;
  for (let k = 0; k < CASES.length; k++) {
    const c = CASES[k], r = results[k];
    if (!r.ok) { console.warn(`  !! ${c.id}: ${r.error}`); continue; }
    const roundtripOk = (r.bad === r.bad2);
    if (!roundtripOk) { dropped++; console.warn(`  ✗ DROP ${c.id}: round-trip FAIL (bad ${r.bad}->${r.bad2})`); continue; }
    ok++;
    fs.writeFileSync(path.join(CASES_DIR, `case_${c.id}.json`), JSON.stringify(r.state));
    const { rows, cols } = rasterize(r.state);
    const kit = kitchenOf(c);
    manifest.push({
      id: c.id, label: c.label, bina: c.bina, kat: c.kat, shape: c.shape,
      pattern: c.pattern,
      mutfak: kit.kind, mutfakKapaliUnits: kit.closedUnits, mutfakAcikUnits: kit.openUnits,
      program: programVectorFor(c), specs: c.specs,
      rows, cols, regions: r.nReg, bad: r.bad, valid: r.bad === 0,
      roundtripOk, file: `case_${c.id}.json`,
    });
  }
  fs.writeFileSync(path.join(CASES_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // ---- summary ----
  const closedCases = manifest.filter(m => m.mutfak === 'kapalı').length;
  const openCases = manifest.filter(m => m.mutfak === 'açık').length;
  const mixedCases = manifest.filter(m => m.mutfak === 'karışık').length;
  const naCases = manifest.filter(m => m.mutfak === 'n/a').length;
  const validC = manifest.filter(m => m.valid).length;
  const badC = manifest.filter(m => !m.valid).length;
  const byPattern = {};
  manifest.forEach(m => { byPattern[m.pattern] = (byPattern[m.pattern] || 0) + 1; });

  console.log('===== KPTA CASE PACK — BATCH 2 =====');
  console.log(`ok ${ok}/${CASES.length}  dropped(round-trip fail) ${dropped}`);
  for (const m of manifest) {
    console.log(`  ${m.id.padEnd(28)} ${m.bina.padEnd(9)} ${m.kat}k ${String(m.shape).padEnd(4)} ` +
      `mutfak=${m.mutfak.padEnd(7)} ${m.rows}x${m.cols} reg=${String(m.regions).padStart(2)} ` +
      `${m.valid ? 'valid' : 'bad=' + m.bad} [${m.pattern}]`);
  }
  console.log('\n--- dağılım ---');
  console.log(`mutfak: kapalı=${closedCases} açık=${openCases} karışık=${mixedCases} n/a(stüdyo)=${naCases}`);
  console.log(`durum:  geçerli=${validC} bad=${badC}`);
  console.log('örüntü:', JSON.stringify(byPattern));
  const allRt = manifest.every(m => m.roundtripOk);
  console.log(`round-trip (snapshot->restore->aynı plan): ${allRt ? 'TÜMÜ OK ✓' : 'BAZILARI FAIL ✗'}`);
  console.log('wrote', ok, 'cases + manifest.json to', CASES_DIR);
}

main();
