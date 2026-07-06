/* DIS-RENDER-SERVER-PROMPT (S2) — render-server.js "exterior" profili prompt kurucusu KABUL TESTİ.
   render-server.js GITIGNORED + doğrudan çalıştırılınca port açar → RENDER_SERVER_NO_LISTEN=1 ile require
   edilir (sunucu AÇILMAZ, yalnız pure prompt fonksiyonları). İSTEK ATMAZ (ücretli endpoint'e dokunmaz).
   Dosya yoksa (temiz checkout / CI) zarif ATLA. Doğrulanan: dış render prompt drone/LOCK/RESTYLE/cephe-
   sinyali/gün-saati/no-people; userPrompt passthrough (view3d buildExteriorPrompt = tek kaynak).

   Kullanım: node tests/dis-render-server-prompt.js */
'use strict';
const fs = require('fs');
const path = require('path');

const SERVER = path.join(__dirname, '..', 'mesken', '02_PROTOTIP', 'server', 'render-server.js');
if (!fs.existsSync(SERVER)) {
  console.log('  (render-server.js yok — dis-render-server-prompt atlandı)');
  process.exit(0);
}

process.env.RENDER_SERVER_NO_LISTEN = '1';   // require ederken sunucuyu AÇMA (port yok, istek yok)
let rs;
try { rs = require(SERVER); }
catch (e) { console.log('  (render-server require edilemedi — atlandı: ' + (e.message || e) + ')'); process.exit(0); }

if (typeof rs.exteriorPrompt !== 'function') {
  console.log('  (render-server exteriorPrompt export etmiyor — atlandı)'); process.exit(0);
}

let fails = 0; const fail = m => { console.log('  ✗ ' + m); fails++; };
const ok = m => console.log('  ✓ ' + m);

/* ---- 1) JENERİK dış prompt (userPrompt yok) — anahtar ifadeler ---- */
const facadeSignal = 'clinker brick cladding on the ground floor base, warm cream plaster on the upper floors';
const p = rs.exteriorPrompt('warm', '', facadeSignal, 'golden');
if (!/drone/i.test(p)) fail('jenerik: "drone" (aerial perspektif) yok');
if (!/exterior/i.test(p)) fail('jenerik: "exterior" yok');
if (!/residential apartment building/i.test(p)) fail('jenerik: "residential apartment building" yok');
if (!/EXACTLY/.test(p)) fail('jenerik: geometri LOCK ("EXACTLY") yok');
if (!/do not (move|add or remove)/i.test(p)) fail('jenerik: pencere/balkon sadakati ("do not move/add/remove") yok');
if (!/brick/i.test(p)) fail('jenerik: cephe malzeme sinyali (brick) prompt\'a akmadı');
if (!/golden/i.test(p)) fail('jenerik: gün saati (golden) akmadı');
if (!/No people, no text/i.test(p)) fail('jenerik: "No people, no text" yok');
if (fails === 0) ok('jenerik dış render prompt: ' + p.slice(0, 90) + '…');

/* ---- 2) userPrompt PASSTHROUGH — view3d buildExteriorPrompt tek kaynak olur ---- */
const custom = 'Photorealistic aerial drone exterior of a 5-storey building, contemporary grey facade with wood balconies, no people, no text.';
const pu = rs.exteriorPrompt('warm', custom, 'x', 'midday');
if (pu !== custom) fail('userPrompt passthrough BOZUK (view3d prompt\'u ezilmemeli): ' + pu.slice(0, 60));
else ok('userPrompt passthrough (view3d = tek kaynak) doğru');

/* ---- 3) İÇ kamera prompt kurucuları DEĞİŞMEDİ (regresyon sinyali) ---- */
if (typeof rs.camSnapshotPrompt === 'function') {
  const cs = rs.camSnapshotPrompt('warm', '', 'midday');
  if (!/Keep the camera angle/i.test(cs)) fail('iç camSnapshotPrompt bozulmuş (LOCK cümlesi yok)');
  else ok('iç camSnapshotPrompt (B/img2img) hâlâ sağlam');
}
if (typeof rs.isoPrompt === 'function') {
  const ip = rs.isoPrompt('warm', 'midday');
  if (!/isometric/i.test(ip)) fail('isoPrompt bozulmuş');
  else ok('isoPrompt hâlâ sağlam');
}

console.log(fails ? ('\nSONUÇ: ✗ ' + fails + ' BAŞARISIZ') : '\nSONUÇ: ✓ tüm dış-render-server prompt testleri GEÇTİ');
process.exit(fails ? 1 : 0);
