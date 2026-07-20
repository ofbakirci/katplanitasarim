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
// NOT: Gömülü demo render JPEG'leri (FINAL_v3_clean / view_cam*) KALDIRILDI.
// Plan boyama artık yerel köprü sunucu (02_PROTOTIP/server) üzerinden GERÇEK render üretiyor;
// prototip içine sahte görsel gömülmüyor. (Eski IMGDIR/jpgDataURI mantığı silindi.)

// Template proje düzenlemesinde 02_PROTOTIP/'e taşındı; yeni konumu önce ara, eskisine düş.
const TEMPLATE = [path.join(HERE, '02_PROTOTIP', 'prototip.template.html'),
                  path.join(HERE, 'prototip.template.html')]
                 .find(p => fs.existsSync(p)) || path.join(HERE, 'prototip.template.html');
const OUT = path.join(HERE, 'MESKEN-prototip.html');
const LOADER_DIR = path.join(HERE, 'loaderanimation');

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

const DEMO = {
  boundary: svgString('adim1-demo.svg'),   // adım 1 demo: bina sınırı
  layout:   svgString('master1.svg'),      // adım 2 demo: tam yerleşim (kpState taşır)
};

function dataURI(file, mime) {
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

function buildRandomLoaderHTML() {
  const shellPath = path.join(LOADER_DIR, 'random-loader.html');
  const scriptPath = path.join(LOADER_DIR, 'unified-loader.js');
  const wordmark = dataURI(path.join(LOADER_DIR, 'assets', 'wordmark.png'), 'image/png');
  let shell = fs.readFileSync(shellPath, 'utf8');
  const loaderScript = fs.readFileSync(scriptPath, 'utf8').replace(/<\/script/gi, '<\\/script');
  shell = shell.replace('assets/wordmark.png', wordmark);
  shell = shell.replace('unfolding-space-concept.png', wordmark);
  shell = shell.replace(
    '<script src="unified-loader.js?v=unified-1"></script>',
    '<script>\n' + loaderScript + '\n</script>'
  );
  return shell;
}

const randomLoaderHTML = buildRandomLoaderHTML();

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
  'window.MSK_DEMO = ' + jsStr(DEMO) + ';\n' +
  'window.MSK_RANDOM_LOADER_HTML = ' + jsStr(randomLoaderHTML) + ';\n' +
  '(function(){var f=document.getElementById("meskenLoaderVisual");if(f)f.srcdoc=window.MSK_RANDOM_LOADER_HTML;})();\n' +
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
console.log('  motor: ' + (engineHTML.length / 1024).toFixed(0) + ' KB · gömülü render görseli: 0 (köprü sunucu) · demo svg: 2');

// Temiz teslim kopyasını da senkle (varsa) — bayatlamasın.
const DELIVER = path.resolve(REPO, '..', 'mesken_prototype', 'MESKEN-prototip.html');
try {
  if (fs.existsSync(path.dirname(DELIVER))) {
    fs.copyFileSync(OUT, DELIVER);
    console.log('  senklendi → ' + DELIVER);
  }
} catch (e) { console.warn('  (teslim kopyası senklenemedi: ' + (e.message || e) + ')'); }
