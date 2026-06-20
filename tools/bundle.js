#!/usr/bin/env node
// Tek-dosya birlestirici: moduler kabuk HTML'i + styles.css + tum <script src> modullerini
// TEK bir bagimsiz .html dosyasina gomer. Paylasim/yedek/cift-tikla-ac icin.
// Kullanim: node tools/bundle.js   (ya da: npm run build)
// Cikti: kat-plani-tasarim.tekdosya.html

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SHELL = path.join(ROOT, 'kat-plani-tasarim.html');
const OUT = path.join(ROOT, 'kat-plani-tasarim.tekdosya.html');

let html = fs.readFileSync(SHELL, 'utf8');

// 1) <link rel="stylesheet" href="styles.css"> -> inline <style>
html = html.replace(/<link\s+rel=["']stylesheet["']\s+href=["']([^"']+)["']\s*\/?>/gi, (m, href) => {
  const css = fs.readFileSync(path.join(ROOT, href), 'utf8');
  return '<style>\n' + css + '\n</style>';
});

// 2) <script src="X.js"></script> -> inline <script>
html = html.replace(/<script\s+src=["']([^"']+)["']\s*><\/script>/gi, (m, src) => {
  const js = fs.readFileSync(path.join(ROOT, src), 'utf8');
  return '<script>\n' + js + '\n</script>';
});

fs.writeFileSync(OUT, html);
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log('Tek dosya hazir: ' + path.relative(ROOT, OUT) + ' (' + kb + ' KB) — cift tikla acabilir, e-posta/USB ile paylasabilirsin.');
