#!/usr/bin/env node
/* MESKEN prototip birleştirici (single-file bundler).
   Template (prototip.template.html) içindeki tek bir  __ASSETS__  işaretini
   gerçek motor (tekdosya) + web'e küçültülmüş render JPEG'leri (base64) +
   demo SVG'leri (boundary/layout) içeren bir <script> bloğuyla değiştirir.
   Çıktı: MESKEN-prototip.html  (tek dosya, offline, dış bağımlılık yok).

   Kullanım:  node build-prototip.js
   tools/bundle.js mantığının kardeşi — burada görseller de gömülür. */
'use strict';
const fs = require('fs');
const path = require('path');

const HERE = __dirname;                                   // .../mesken
const REPO = path.resolve(HERE, '..');                    // katplanitasarim
const IMGDIR = path.join(HERE, '_build', 'img');

const TEMPLATE = path.join(HERE, 'prototip.template.html');
const OUT = path.join(HERE, 'MESKEN-prototip.html');

// Gerçek motor: tek-dosya bundle (worktree'de değil, ana repoda).
// Önce ana repo kökü, sonra mesken yerel kopyası denenir.
const ENGINE_CANDIDATES = [
  path.join(REPO, 'kat-plani-tasarim.tekdosya.html'),
  path.join(HERE, 'kat-plani-tasarim.tekdosya.html'),
];

function readFirst(cands, label) {
  for (const p of cands) { if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8'); }
  throw new Error(`${label} bulunamadı. Denenen: ${cands.join(' , ')}`);
}

// Motoru her zaman GÜNCEL kaynaktan derle (commit'li tekdosya bayat olabilir — örn. mode-selector
// sonradan eklendiyse eski bundle'da yoktur). Başarısız olursa mevcut tekdosya'yla devam et.
function rebuildEngine() {
  try {
    // bundle.js'i DOĞRUDAN çağır ('npm run build' DEĞİL): npm'in postbuild hook'u bu betiği
    // yeniden tetikleyip sonsuz döngü kurmasın. Komut npm run build ile birebir aynı işi yapar.
    require('child_process').execSync('node tools/bundle.js', { cwd: REPO, stdio: 'ignore' });
    console.log('Motor güncel kaynaktan derlendi (node tools/bundle.js).');
  } catch (e) {
    console.warn('Uyarı: motor yeniden derlenemedi (' + (e.message || e) + '); mevcut tekdosya kullanılacak.');
  }
}

function jpgDataURI(name) {
  const p = path.join(IMGDIR, name);
  const b64 = fs.readFileSync(p).toString('base64');
  return 'data:image/jpeg;base64,' + b64;
}

function svgString(name) {
  return fs.readFileSync(path.join(HERE, 'inputs', name), 'utf8');
}

// ---- varlıkları topla ----
// npm postbuild zincirinden gelindiyse (npm run build → postbuild) bundle.js az önce çalıştı,
// tekdosya zaten taze — KPTA_SKIP_REBUILD ile gereksiz ikinci derlemeyi atla.
if (process.env.KPTA_SKIP_REBUILD) {
  console.log('Motor yeniden derleme atlandı (postbuild zinciri — tekdosya zaten taze).');
} else {
  rebuildEngine();
}
const engineHTML = readFirst(ENGINE_CANDIDATES, 'Motor (tekdosya)');

const IMG = {
  warm: jpgDataURI('FINAL_v3_clean.jpg'),
  arch: jpgDataURI('style_architectural_clean.jpg'),
  maq:  jpgDataURI('style_maquette_clean.jpg'),
  cam1: jpgDataURI('view_cam1.jpg'),
  cam2: jpgDataURI('view_cam2.jpg'),
  cam3: jpgDataURI('view_cam3.jpg'),
  cam4: jpgDataURI('view_cam4.jpg'),
  cam5: jpgDataURI('view_cam5.jpg'),
  cam6: jpgDataURI('view_cam6.jpg'),
};

const DEMO = {
  boundary: svgString('adim1-demo.svg'),   // adım 1 demo: bina sınırı
  layout:   svgString('master1.svg'),      // adım 2 demo: tam yerleşim (kpState taşır)
};

// ---- gömülecek <script> ----
// JSON.stringify, gömülü motorun KENDİ </script> ve <!-- dizilerini kaçırmaz; bu diziler
// dıştaki <script> bloğunu erken kapatır. JS string literali içinde "<\/" === "</" olduğundan
// güvenle kaçırırız (değer aynı kalır, HTML ayrıştırıcı tag sanmaz).
function jsStr(obj) {
  return JSON.stringify(obj)
    .replace(/<\//g, '<\\/')     // </script>, </style> ... → <\/...
    .replace(/<!--/g, '<\\!--')  // HTML yorum açılışı
    .replace(/<script/gi, '<\\script');
}

const assetsBlock =
  '<script>\n' +
  'window.MSK_ENGINE_HTML = ' + jsStr(engineHTML) + ';\n' +
  'window.MSK_IMG = ' + jsStr(IMG) + ';\n' +
  'window.MSK_DEMO = ' + jsStr(DEMO) + ';\n' +
  '</script>';

// ---- birleştir ----
let html = fs.readFileSync(TEMPLATE, 'utf8');
if (!html.includes('<!--__ASSETS__-->')) {
  throw new Error('Template içinde <!--__ASSETS__--> işareti yok.');
}
html = html.replace('<!--__ASSETS__-->', assetsBlock);

fs.writeFileSync(OUT, html);
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log('Hazır: ' + path.relative(REPO, OUT) + ' (' + kb + ' KB)');
console.log('  motor: ' + (engineHTML.length / 1024).toFixed(0) + ' KB · görsel: 9 · demo svg: 2');

// Temiz teslim kopyasını da senkle (varsa) — bayatlamasın.
const DELIVER = path.resolve(REPO, '..', 'mesken_prototype', 'MESKEN-prototip.html');
try {
  if (fs.existsSync(path.dirname(DELIVER))) {
    fs.copyFileSync(OUT, DELIVER);
    console.log('  senklendi → ' + DELIVER);
  }
} catch (e) { console.warn('  (teslim kopyası senklenemedi: ' + (e.message || e) + ')'); }
