/*
 * ml/gen_dataset.js — synthetic dataset generator for the ML feasibility probe.
 *
 * Produces random-but-plausible building polygons + apartment programs, runs the
 * rule-based engine headlessly (ml/engine.js), and serializes each example to a
 * canonical fixed-grid form that ml/prepare.py can load.
 *
 * Usage:  node ml/gen_dataset.js [N] [seed]
 *   N    number of samples to attempt (default 1500)
 *   seed PRNG seed (default 12345)
 *
 * Output (ml/data/):
 *   meta.json        classes, grid size, program feature names, run stats
 *   inputs_mask.bin  uint8  N_kept * GRID * GRID   building interior mask
 *   labels.bin       uint8  N_kept * GRID * GRID   per-cell class label
 *   program.bin      f32    N_kept * P             building-level program vector
 *   index.json       per-sample metadata (bina, kat, specs, bad, valid, dims)
 */
const fs = require('fs');
const path = require('path');
const { runAll, CLASSES } = require('./engine');

const N = parseInt(process.argv[2] || '1500', 10);
let SEED = parseInt(process.argv[3] || '12345', 10);
const GRID = 64;          // 64 cells * 0.5 m = 32 m max span
// Output dir is overridable via DATA_DIR env (default 'data') so we can build
// a larger v2 set (ml/data_5k) without clobbering the baseline ml/data.
const OUT = path.join(__dirname, process.env.DATA_DIR || 'data');

// ---- deterministic PRNG (mulberry32) so runs are reproducible ----
function rng() {
  SEED |= 0; SEED = (SEED + 0x6D2B79F5) | 0;
  let t = Math.imul(SEED ^ (SEED >>> 15), 1 | SEED);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1)); // inclusive int
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const chance = (p) => rng() < p;

// snap to 0.5 m grid, keep edges in a plausible 10..25 m band
const snap = (m) => Math.round(m * 2) / 2;

// ---- random building polygon: rect, L, T variants ----
function randomPoly() {
  const W = snap(ri(12, 25));
  const H = snap(ri(10, 20));
  const shape = pick(['rect', 'rect', 'L', 'L', 'T']); // bias toward rect
  if (shape === 'rect') {
    return { poly: [{x:0,y:0},{x:W,y:0},{x:W,y:H},{x:0,y:H}], shape };
  }
  if (shape === 'L') {
    // notch the bottom-right corner
    const nw = snap(ri(4, Math.max(5, Math.floor(W * 0.5))));
    const nh = snap(ri(4, Math.max(5, Math.floor(H * 0.5))));
    return { poly: [
      {x:0,y:0},{x:W,y:0},{x:W,y:H-nh},{x:W-nw,y:H-nh},{x:W-nw,y:H},{x:0,y:H},
    ], shape };
  }
  // T: shave both top corners, leaving a central stem upward
  const sw = snap(ri(3, Math.max(4, Math.floor(W * 0.3))));
  const sh = snap(ri(3, Math.max(4, Math.floor(H * 0.4))));
  return { poly: [
    {x:sw,y:0},{x:W-sw,y:0},{x:W-sw,y:sh},{x:W,y:sh},{x:W,y:H},{x:0,y:H},{x:0,y:sh},{x:sw,y:sh},
  ], shape };
}

// rough net area (m²) a unit type needs, used to size programs to the footprint
function estUnitArea(u) {
  if (u.salon === 0) return 35;                 // studio
  return 38 + u.oda * 18 + (u.ensuite ? 6 : 0); // salon + bedrooms (+ ensuite)
}

// shoelace area of a polygon
function polyArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

// ---- random apartment program (unitSpecs), sized to the floor footprint ----
function randomProgram(isVilla, footprint) {
  if (isVilla) {
    return [{ oda: ri(3, 5), salon: 1, ensuite: chance(0.7), acik: chance(0.5), adet: 1 }];
  }
  // usable area per floor after the shared core (stairs/lift/corridor ~ 35%)
  let budget = footprint * 0.65;
  const nTypes = ri(1, 3);
  const specs = [];
  // bedroom count weighted toward smaller units (1-3 common, 4 rare)
  const odaPick = () => pick([1, 1, 2, 2, 2, 3, 3, 4]);
  for (let i = 0; i < nTypes; i++) {
    const studio = chance(0.15);
    const u = {
      oda: studio ? 1 : odaPick(),
      salon: studio ? 0 : 1,
      ensuite: !studio && chance(0.4),
      acik: chance(0.45),
      adet: 0,
    };
    const a = estUnitArea(u);
    const maxFit = Math.floor(budget / a);
    if (maxFit < 1) continue;                   // no room left for this type
    u.adet = Math.min(ri(1, 4), maxFit);
    budget -= u.adet * a;
    specs.push(u);
  }
  // guarantee at least one unit
  if (specs.length === 0) specs.push({ oda: 1, salon: 1, ensuite: false, acik: true, adet: 1 });
  return specs;
}

function randomSample() {
  const isVilla = chance(0.12);
  const bina = isVilla ? 'villa' : 'apartman';
  const kat = isVilla ? ri(1, 3) : ri(2, 12);
  const { poly, shape } = randomPoly();
  const specs = randomProgram(isVilla, polyArea(poly));
  return { bina, kat, poly, specs, shape };
}

// program -> fixed-length building-level feature vector
const PROG_FEATURES = [
  'isVilla', 'kat', 'nUnitTypes', 'totalUnits', 'totalRooms',
  'totalSalon', 'ensuiteUnits', 'acikUnits', 'avgOdaPerUnit', 'studioUnits',
];
function programVector(smp) {
  const s = smp.specs;
  const totalUnits = s.reduce((a, u) => a + u.adet, 0);
  const totalRooms = s.reduce((a, u) => a + u.oda * u.adet, 0);
  const totalSalon = s.reduce((a, u) => a + (u.salon > 0 ? u.adet : 0), 0);
  const ensuiteUnits = s.reduce((a, u) => a + (u.ensuite ? u.adet : 0), 0);
  const acikUnits = s.reduce((a, u) => a + (u.acik ? u.adet : 0), 0);
  const studioUnits = s.reduce((a, u) => a + (u.salon === 0 ? u.adet : 0), 0);
  return [
    smp.bina === 'villa' ? 1 : 0,
    smp.kat,
    s.length,
    totalUnits,
    totalRooms,
    totalSalon,
    ensuiteUnits,
    acikUnits,
    totalUnits ? totalRooms / totalUnits : 0,
    studioUnits,
  ];
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`Generating ${N} samples (seed=${SEED}, grid=${GRID})...`);

  const samples = [];
  for (let i = 0; i < N; i++) samples.push(randomSample());

  const t0 = Date.now();
  const { results, unknownTypes } = runAll(samples, GRID, (done, total) => {
    if (done % 200 === 0 || done === total) {
      const dt = (Date.now() - t0) / 1000;
      process.stdout.write(`  ${done}/${total}  (${(done / dt).toFixed(1)} samples/s)\r`);
    }
  });
  const genSecs = (Date.now() - t0) / 1000;
  process.stdout.write('\n');

  // collect kept samples (engine produced a grid)
  const kept = [];
  let nEngineFail = 0, nOversize = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r.ok) {
      if (r.error === 'oversize') nOversize++; else nEngineFail++;
      continue;
    }
    kept.push({ i, r, smp: samples[i] });
  }

  const nKept = kept.length;
  const cells = GRID * GRID;
  const maskBuf = Buffer.alloc(nKept * cells);
  const labBuf = Buffer.alloc(nKept * cells);
  const progBuf = Buffer.alloc(nKept * PROG_FEATURES.length * 4);
  const index = [];

  let nValid = 0;
  const classCounts = new Array(CLASSES.length).fill(0);
  for (let k = 0; k < nKept; k++) {
    const { i, r, smp } = kept[k];
    maskBuf.set(r.mask, k * cells);
    labBuf.set(r.grid, k * cells);
    const pv = programVector(smp);
    for (let p = 0; p < pv.length; p++) progBuf.writeFloatLE(pv[p], (k * pv.length + p) * 4);
    for (let c = 0; c < r.grid.length; c++) classCounts[r.grid[c]]++;
    const valid = r.bad === 0;
    if (valid) nValid++;
    index.push({
      sample: i, bina: smp.bina, kat: smp.kat, shape: smp.shape,
      specs: smp.specs, rows: r.rows, cols: r.cols,
      bad: r.bad, ok: r.okc, totalChecks: r.total, valid,
    });
  }

  fs.writeFileSync(path.join(OUT, 'inputs_mask.bin'), maskBuf);
  fs.writeFileSync(path.join(OUT, 'labels.bin'), labBuf);
  fs.writeFileSync(path.join(OUT, 'program.bin'), progBuf);
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));

  const meta = {
    grid: GRID,
    cellMeters: 0.5,
    classes: CLASSES,
    progFeatures: PROG_FEATURES,
    nSamplesAttempted: N,
    nKept,
    nValid,
    nInvalid: nKept - nValid,
    nEngineFail,
    nOversize,
    genSeconds: genSecs,
    samplesPerSec: N / genSecs,
    unknownTypes,
    dtypes: { inputs_mask: 'uint8', labels: 'uint8', program: 'float32' },
    shapes: {
      inputs_mask: [nKept, GRID, GRID],
      labels: [nKept, GRID, GRID],
      program: [nKept, PROG_FEATURES.length],
    },
    seed: parseInt(process.argv[3] || '12345', 10),
  };
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 2));

  // ---- report ----
  const totalCells = nKept * cells;
  console.log('\n===== DATASET REPORT =====');
  console.log(`attempted          : ${N}`);
  console.log(`kept (engine ok)   : ${nKept}`);
  console.log(`  engine errors    : ${nEngineFail}`);
  console.log(`  oversize (> ${GRID}) : ${nOversize}`);
  console.log(`valid (0 ihlal)    : ${nValid}  (${(100 * nValid / nKept).toFixed(1)}%)`);
  console.log(`invalid (>=1 ihlal): ${nKept - nValid}  (${(100 * (nKept - nValid) / nKept).toFixed(1)}%)`);
  console.log(`gen time           : ${genSecs.toFixed(1)} s  (${(N / genSecs).toFixed(1)} samples/s)`);
  console.log(`unknown types      : ${JSON.stringify(unknownTypes)}`);
  console.log('\nclass distribution (share of all cells):');
  for (let c = 0; c < CLASSES.length; c++) {
    const pct = (100 * classCounts[c] / totalCells).toFixed(2);
    console.log(`  ${String(c).padStart(2)} ${CLASSES[c].padEnd(9)} ${pct.padStart(6)}%`);
  }
  console.log('\nwrote:', OUT);
}

main();
