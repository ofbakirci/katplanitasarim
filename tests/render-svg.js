/* Headless render → gerçek SVG dosyası (görsel doğrulama; motor kodunu değiştirmez).
   importPlanText restoreState içinde render() çağırır → `svg` stub ağacı dolar; onu
   gerçek SVG metnine serialize edip yazar.  Kullanım:
     node tests/render-svg.js <svg|json> <out.svg> [--regen]
*/
'use strict';
const fs = require('fs');
const vm = require('vm');
const { scriptSources } = require('./support/app-js');
const { installDom } = require('./support/dom-stub');

const inFile = process.argv[2], outFile = process.argv[3];
const regen = process.argv.includes('--regen');
if (!inFile || !outFile) { console.error('kullanım: node tests/render-svg.js <in.svg> <out.svg> [--regen]'); process.exit(1); }

const dom = installDom();
const ctx = vm.createContext({
  console, matchMedia: () => ({ matches: false }),
  document: dom.document, window: { addEventListener() {}, matchMedia: () => ({ matches: false }) },
  XMLSerializer: function () { this.serializeToString = () => ''; },
  Image: function () {}, Blob: function () {},
  URL: { createObjectURL: () => '', revokeObjectURL() {} },
  localStorage: { getItem() { return null; }, setItem() {} },
  requestAnimationFrame: fn => fn && fn(), setTimeout, clearTimeout, navigator: { userAgent: 'node' }
});
scriptSources().forEach(({ source, filename }) => { new vm.Script(source, { filename }).runInContext(ctx); });
ctx.__SVG = fs.readFileSync(inFile, 'utf8'); ctx.__R = regen;
new vm.Script('importPlanText(__SVG,"x"); if(__R) generate(); __SVGEL = svg;', { filename: 'r.js' }).runInContext(ctx);

const root = ctx.__SVGEL;
// stub ağacını serialize et + içerik bbox'u hesapla
const NUM = ['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'width', 'height'];
let minX = 1e18, minY = 1e18, maxX = -1e18, maxY = -1e18;
function track(a) {
  const x = +a.x, y = +a.y, w = +a.width || 0, h = +a.height || 0;
  [['x1', 'y1'], ['x2', 'y2'], ['cx', 'cy']].forEach(([kx, ky]) => {
    if (a[kx] != null) { minX = Math.min(minX, +a[kx]); maxX = Math.max(maxX, +a[kx]); }
    if (a[ky] != null) { minY = Math.min(minY, +a[ky]); maxY = Math.max(maxY, +a[ky]); }
  });
  if (a.x != null) { minX = Math.min(minX, x); maxX = Math.max(maxX, x + w); }
  if (a.y != null) { minY = Math.min(minY, y); maxY = Math.max(maxY, y + h); }
  if (a.d) { const m = String(a.d).match(/-?\d+(\.\d+)?/g) || []; for (let i = 0; i + 1 < m.length; i += 2) { const px = +m[i], py = +m[i + 1]; minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py); } }
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
let winGlass = 0, winCut = 0;
function ser(node) {
  if (!node || !node.tag) return '';
  track(node.attrs || {});
  if (node.tag === 'line' && node.attrs && node.attrs.stroke === '#3f6a8c') winGlass++;
  if (node.tag === 'line' && node.attrs && node.attrs.stroke === '#faf8f3') winCut++;
  let s = '<' + node.tag;
  for (const k in (node.attrs || {})) s += ' ' + k + '="' + esc(node.attrs[k]) + '"';
  s += '>';
  if (node.textContent) s += esc(node.textContent);
  (node.children || []).forEach(c => { s += ser(c); });
  s += '</' + node.tag + '>';
  return s;
}
const body = (root.children || []).map(ser).join('\n');
const pad = 20;
const vbW = (maxX - minX) + pad * 2, vbH = (maxY - minY) + pad * 2;
const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${(minX - pad).toFixed(1)} ${(minY - pad).toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}" style="background:#faf8f3">\n${body}\n</svg>\n`;
fs.writeFileSync(outFile, out);
console.log('yazıldı:', outFile, '(' + (out.length / 1024).toFixed(0) + ' KB)');
console.log('pencere cam çizgisi (#3f6a8c):', winGlass, '| beyaz kesik (kapı+pencere #faf8f3):', winCut);
console.log('viewBox bbox:', minX.toFixed(0), minY.toFixed(0), maxX.toFixed(0), maxY.toFixed(0));
