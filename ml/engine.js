/*
 * ml/engine.js — headless runner for KPTA v2's rule-based floor-plan engine.
 *
 * PORT NOTE (katplanitasarim_ag -> katplanitasarim):
 *   The old repo concatenated the whole app into a single `tests/app.js` bundle
 *   and ran it with `eval(src + loop)` in the Node global scope.
 *   THIS repo has no such bundle. The app lives in top-level modules
 *   (planner.js, rooms.js, walls.js, checks.js, io.js, app.js, ...) loaded by
 *   kat-plani-tasarim.html. The canonical headless harness here is Node's `vm`:
 *     - tests/support/app-js.js   -> scriptSources() reads each <script src> from
 *                                    kat-plani-tasarim.html (in load order)
 *     - tests/support/dom-stub.js -> installDom() builds the DOM stub
 *   We mirror tests/measure-plan.js: build a vm context, run every app script
 *   into it ONCE, then iterate all samples inside that same context (so the
 *   ~hundreds-of-KB of source is parsed once, not per sample).
 *
 *   The engine's public surface is IDENTICAL across repos:
 *     generate(), runChecks(), globals plan / unitSpecs / pts / closed,
 *     plan.regions[]={id,name,type,unit,cells}, plan.cm (cell->region id),
 *     plan.inside, plan.rows, plan.cols.  So only the LOADING changed, not the
 *     rasterization logic.
 *
 * We DO NOT modify any application code — we only import and call it.
 */
const fs = require('fs');
const vm = require('vm');
const { scriptSources } = require('../tests/support/app-js');
const { installDom } = require('../tests/support/dom-stub');

// Canonical cell classes (0.5 m grid). Order defines the integer label.
const CLASSES = [
  'bos',      // 0  empty / outside / unassigned interior
  'salon',    // 1
  'yatak',    // 2
  'mutfak',   // 3
  'banyo',    // 4
  'wc',       // 5
  'antre',    // 6
  'koridor',  // 7
  'merdiven', // 8
  'asansor',  // 9
  'yangin',   // 10
  'teknik',   // 11
];
const CLASS_OF = Object.fromEntries(CLASSES.map((c, i) => [c, i]));

// Map engine region.type -> canonical class. Anything unmapped -> teknik (logged).
// KPTA v2 adds commercial/parking types (otopark, dukkan, avlu) absent in _ag;
// mapped to teknik so they don't pollute the "unknown type" log for the rare
// non-residential floor that slips into a sample.
const TYPE_TO_CLASS = {
  salon: 'salon',
  oturma: 'salon',
  yatak: 'yatak',
  oda: 'yatak',
  room: 'yatak',
  mutfak: 'mutfak',
  banyo: 'banyo',
  wc: 'wc',
  antre: 'antre',
  koridor: 'koridor',   // APARTMAN HOLÜ is type 'koridor' in KPTA v2
  merdiven: 'merdiven',
  asansor: 'asansor',
  yangin: 'yangin',
  teknik: 'teknik',
  isiklik: 'teknik',
  otopark: 'teknik',
  dukkan: 'teknik',
  avlu: 'teknik',
};

// Build a vm context with the app loaded. Mirrors tests/measure-plan.js exactly.
function makeContext() {
  const dom = installDom();
  const ctx = vm.createContext({
    console,
    matchMedia: () => ({ matches: false }),
    document: dom.document,
    window: { addEventListener() {}, matchMedia: () => ({ matches: false }) },
    XMLSerializer: function () { this.serializeToString = () => ''; },
    Image: function () {}, Blob: function () {},
    URL: { createObjectURL: () => '', revokeObjectURL() {} },
    localStorage: { getItem() { return null; }, setItem() {} },
    requestAnimationFrame: fn => fn && fn(), setTimeout, clearTimeout,
    navigator: { userAgent: 'node' },
  });
  scriptSources().forEach(({ source, filename }) => {
    new vm.Script(source, { filename }).runInContext(ctx);
  });
  return ctx;
}

/**
 * Run the engine over many samples.
 * @param {Array} samples  [{bina, kat, poly, specs}, ...]
 * @param {number} GRID    fixed output grid edge (cells)
 * @param {function} onProgress  optional (doneCount, total) callback
 * @returns {{results: Array, unknownTypes: Object}}
 *   results[i] = { ok, rows, cols, grid:Uint8Array(GRID*GRID) | null,
 *                  mask:Uint8Array(GRID*GRID) | null, bad, okc, total, error }
 */
function runAll(samples, GRID, onProgress) {
  const ctx = makeContext();

  // Expose what the loop script needs as context globals.
  ctx.__SAMPLES__ = samples;
  ctx.__GRID__ = GRID;
  ctx.__TYPE_TO_CLASS__ = TYPE_TO_CLASS;
  ctx.__CLASS_OF__ = CLASS_OF;
  ctx.__OUT__ = [];
  ctx.__UNKNOWN__ = {};
  ctx.__PROGRESS__ = onProgress || null;

  const loop = `
  ;(function(){
    const S = __SAMPLES__, G = __GRID__;
    const T2C = __TYPE_TO_CLASS__, C2I = __CLASS_OF__;
    const getEl = id => document.getElementById(id);
    for (let s = 0; s < S.length; s++) {
      const smp = S[s];
      const res = { ok:false, rows:0, cols:0, grid:null, mask:null, bad:0, okc:0, total:0, error:null };
      try {
        // reset per-sample manual-edit / floor state so samples never contaminate each other
        try { editHistory = []; } catch(e){}
        try { doorOverrides = {}; extraDoors = []; doorHidden = {}; } catch(e){}
        try { customCutsZ = null; unitLayout = {}; } catch(e){}
        try { activeFloor = 0; villaFloors = null; lockedCore = null; } catch(e){}
        getEl('binaTipi').value = smp.bina;
        getEl('katSayisi').value = String(smp.kat);
        getEl('katYuk').value = '2.9';
        try { const ka = getEl('katAyri'); if (ka) ka.checked = false; } catch(e){}
        unitSpecs = smp.specs.map(x => ({...x}));
        pts = smp.poly.map(p => ({...p}));
        closed = true;
        generate();
        const checks = runChecks();
        res.bad   = checks.filter(c=>c.s==='bad').length;
        res.okc   = checks.filter(c=>c.s==='ok').length;
        res.total = checks.length;
        const rows = plan.rows, cols = plan.cols;
        res.rows = rows; res.cols = cols;
        if (rows > G || cols > G) { res.error = 'oversize'; }
        else {
          const grid = new Uint8Array(G*G);   // class label per cell (0 = bos)
          const mask = new Uint8Array(G*G);   // building interior mask
          // region id -> class index lookup
          const idClass = new Int16Array(plan.regions.length);
          for (let r=0; r<plan.regions.length; r++) {
            const t = plan.regions[r].type;
            let cls = T2C[t];
            if (cls === undefined) { __UNKNOWN__[t] = (__UNKNOWN__[t]||0)+1; cls = 'teknik'; }
            idClass[r] = C2I[cls];
          }
          for (let rr=0; rr<rows; rr++) {
            for (let cc=0; cc<cols; cc++) {
              const i = rr*cols + cc;
              const gi = rr*G + cc;            // top-left aligned in GxG canvas
              if (plan.inside[i]) {
                mask[gi] = 1;
                const id = plan.cm[i];
                if (id >= 0) grid[gi] = idClass[id]; // else stays 0 (bos)
              }
            }
          }
          res.grid = grid; res.mask = mask; res.ok = true;
        }
      } catch (e) {
        res.error = String(e && e.message || e);
      }
      __OUT__.push(res);
      if (__PROGRESS__ && (s % 100 === 0)) __PROGRESS__(s+1, S.length);
    }
  })();
  `;
  new vm.Script(loop, { filename: 'ml-engine-loop.js' }).runInContext(ctx);
  return { results: ctx.__OUT__, unknownTypes: ctx.__UNKNOWN__ };
}

module.exports = { runAll, makeContext, CLASSES, CLASS_OF, TYPE_TO_CLASS };
