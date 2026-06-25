/* Kapıları edge-map PİKSEL uzayında döker (headless).
   computeDoors() = motorun otorite kapı mantığı; fpFraming().px = AI-boyama/controlnet-edges
   PNG ile BİREBİR aynı kadraj. Çıktı JSON: her 'ok' kapının merkez px'i + yön + gap yarı-boyu.
   Kullanım: node tests/dump-doors.js <svg|json>  > doors.json */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { scriptSources, ROOT } = require('./support/app-js');
const { installDom } = require('./support/dom-stub');

const input = process.argv[2] || path.join(ROOT, 'mesken', 'inputs', 'rendertest3', 'kat-plani-41.svg');
const txt = fs.readFileSync(input, 'utf8');

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
scriptSources().forEach(({ source, filename }) => new vm.Script(source, { filename }).runInContext(ctx));
ctx.__SVG = txt;

const code = `
  importPlanText(__SVG,'dump-input');
  const f = fpFraming();
  const p = plan;
  const ds = computeDoors().filter(d=>d.status==='ok' && d.e);
  const doors = ds.map(d=>{
    const e=d.e;                                  // metre koord, h=1 yatay duvar / h=0 dikey
    const cx_m = e.h ? e.x + M/2 : e.x;           // duvar boyu ortası
    const cy_m = e.h ? e.y       : e.y + M/2;
    const c = f.px(cx_m, cy_m);
    return { key:d.key, kind:d.kind, h:e.h, ex:e.x, ey:e.y, cx:c[0], cy:c[1] };
  });
  // bina bbox doğrulaması (siyah piksel bbox'uyla kıyaslanacak)
  const bb = (function(){ let a=pts.concat(parcelPts); let mnx=1e9,mny=1e9,mxx=-1e9,mxy=-1e9;
    a.forEach(q=>{mnx=Math.min(mnx,q.x);mny=Math.min(mny,q.y);mxx=Math.max(mxx,q.x);mxy=Math.max(mxy,q.y);});
    const p0=f.px(mnx,mny),p1=f.px(mxx,mxy); return {x0:p0[0],y0:p0[1],x1:p1[0],y1:p1[1]}; })();
  __OUT = JSON.stringify({
    W:f.W, H:f.H, S:f.S, SC:f.SC, M:M, pxPerM_final:f.S*f.SC,
    nDoors:doors.length, bbox_px:bb, doors
  });
`;
new vm.Script(code, { filename: 'dump.js' }).runInContext(ctx);
process.stdout.write(ctx.__OUT || '{"error":"no output"}');
