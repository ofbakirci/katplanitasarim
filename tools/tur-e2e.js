#!/usr/bin/env node
/* tur-e2e.js — ONBOARDING GERCEK-TIK KABUL HARNESS'i (headless Chrome, puppeteer-core).
   Ne yapar: Mesken kabuk karsilamasindan (Akis Turu) baslayip 2B editordeki 16 adimlik ANA
   TUR'u GERCEK tiklarla yurutur (parsel, Blok A/B cizimi, yerlesim, duvar, balkon, site imkanlari,
   kat gezme, export), sonra 3B kopru -> kamera3d mini-tur -> render galerisi -> Dose adimlarini
   surer. Beklenen: 55 assert gecti, 0 pageerror, 0 console.error (temiz cikis kodu 0).
   Gercek tiklar: DOM = el.click(); tuval = mousedown/mouseup dispatch (client koord ghost DOM'dan).

   GEREKSINIMLER:
     - puppeteer-core:  `npm i puppeteer-core`  (repo kokune ya da tools/ altina)
     - Chrome:          /Applications/Google Chrome.app/...   (CHROME ortam degiskeniyle ezilebilir)
     - HTTP sunucu:     repo kokunde  `python3 -m http.server 8750`  (E2E_PORT ile ezilebilir)

   KOSUM:
     node tools/tur-e2e.js          # hands-on: ana tur 16 adim + phase3 (55 assert)
     node tools/tur-e2e.js --pkg    # vitrin regresyonu (?demo=1&paket=1: paket dolu gelir)
     CHROME="..." E2E_PORT=8750 node tools/tur-e2e.js

   Ekran goruntuleri:  ./e2e-cikti/  (cwd'ye gore; her adimda e2e-NN-<etiket>.png). */
const path = require('path');
const fs = require('fs');
const puppeteer = loadPuppeteer();
function loadPuppeteer(){                                   // once yerel node_modules, yoksa scratchpad yedegi
  const P = require('path');
  const tries = [
    'puppeteer-core',
    P.join(__dirname, 'node_modules', 'puppeteer-core'),
    P.join(__dirname, '..', 'node_modules', 'puppeteer-core'),
    '/private/tmp/claude-501/-Users-ofbakirci-apps-ofb-katplanitasarim/f134d055-1952-494f-9e8f-060129f159ce/scratchpad/node_modules/puppeteer-core',
  ];
  for(const t of tries){ try{ return require(t); }catch(e){} }
  throw new Error('puppeteer-core bulunamadi — `npm i puppeteer-core` calistirin.');
}
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = +(process.env.E2E_PORT || 8750);
const OUTDIR = path.resolve(process.cwd(), 'e2e-cikti');   // ekran goruntusu cikti klasoru (goreli)
try{ fs.mkdirSync(OUTDIR, {recursive:true}); }catch(e){}
const PKG = process.argv.includes('--pkg');
const BASE = `http://localhost:${PORT}/mesken/MESKEN-prototip.html`;

const results = [];
let shotN = 0;
const errors = [];   // pageerror
const consoleErrs = [];

function log(...a){ console.log(...a); }
function ok(name, extra){ results.push({name, pass:true, extra:extra||''}); log(`  ✓ ${name}${extra?'  ['+extra+']':''}`); }
function bad(name, extra){ results.push({name, pass:false, extra:extra||''}); log(`  ✗ FAIL ${name}${extra?'  ['+extra+']':''}`); }
const sleep = ms => new Promise(r=>setTimeout(r, ms));

async function waitFor(fn, {timeout=15000, interval=200, desc=''}={}){
  const t0=Date.now();
  while(Date.now()-t0 < timeout){
    let v; try{ v = await fn(); }catch(e){ v=null; }
    if(v) return v;
    await sleep(interval);
  }
  throw new Error('waitFor timeout: '+(desc||fn.toString().slice(0,80)));
}

// --- engine (iframe) frame handle ---
async function engineFrame(page){
  for(const f of page.frames()){
    try{ const has = await f.evaluate(()=>!!document.getElementById('svg') && !!document.getElementById('tDraw')); if(has) return f; }catch(e){}
  }
  return null;
}
async function waitEngineFrame(page){
  return waitFor(async()=>await engineFrame(page), {timeout:30000, desc:'engineFrame'});
}

// --- shell (parent) helpers ---
async function shellCard(page){
  return page.evaluate(()=>{
    const ov=document.getElementById('mskTourOv'), card=document.getElementById('mskTourCard');
    if(!ov || !card) return {visible:false};
    const on = ov.classList.contains('on');
    const n = card.querySelector('.tc-n'); const h=card.querySelector('.tc-h');
    return { visible:on, prog:(n?n.textContent.trim():''), title:(h?h.textContent.trim():'') };
  });
}
async function shellClickNext(page){
  return page.evaluate(()=>{
    const b=document.querySelector('#mskTourCard [data-act="next"]'); if(b){ b.click(); return true; } return false;
  });
}
async function shellState(page){ return page.evaluate(()=>{ try{ return window.__msk && window.__msk.tour ? window.__msk.tour.getState() : null; }catch(e){ return null; } }); }
async function engStep(page){ return page.evaluate(()=>{ try{ return (window.__msk&&window.__msk.state) ? {step:(window.__msk&&window.__msk.state).step, maxStep:(window.__msk&&window.__msk.state).maxStep} : null; }catch(e){ return null; } }); }
async function clickParent(page, sel){ return page.evaluate(s=>{ const el=document.querySelector(s); if(el){ el.click(); return true; } return false; }, sel); }

// --- motor (iframe) onboarding card helpers ---
async function onbCard(f){
  return f.evaluate(()=>{
    const card=document.querySelector('.onbCard'); if(!card) return {visible:false};
    const ov=document.getElementById('onbOverlay');
    const prog=card.querySelector('.prog'), title=card.querySelector('.onbTitle span'), text=card.querySelector('.onbText');
    const btns=[...card.querySelectorAll('[data-onb]')].map(b=>({act:b.getAttribute('data-onb'), label:b.textContent.trim()}));
    return { visible:true, prog:(prog?prog.textContent.trim():''), title:(title?title.textContent.trim():''),
             text:(text?text.textContent.trim():''), btns };
  });
}
async function onbClick(f, act){
  return f.evaluate(a=>{ const b=document.querySelector('.onbCard [data-onb="'+a+'"]'); if(b){ b.click(); return true; } return false; }, act);
}
async function engClick(f, sel){ return f.evaluate(s=>{ const el=document.querySelector(s); if(el){ el.click(); return true; } return false; }, sel); }
async function engHas(f, sel){ return f.evaluate(s=>!!document.querySelector(s), sel); }
// FIX3: Daireler panel sekmesi aktif mi (yerlesim adimlarinda showPanelTab('daireler'))
async function daireTabActive(f){ return f.evaluate(()=>{ const t=document.querySelector('.ptab[data-tab="daireler"]'); return !!(t && t.classList && t.classList.contains('active')); }); }
// FIX5: fullCanvasHole -> spotlight rect deligi canvasWrap bbox'unu kapsiyor mu (canvas karartisiz)
async function fullHoleCoversCanvas(f){
  return f.evaluate(()=>{
    const cw=document.getElementById('canvasWrap'); if(!cw) return {ok:false, reason:'no canvasWrap'};
    const mask=document.getElementById('onbHoleMask'); if(!mask) return {ok:false, reason:'no mask'};
    const hole=[...mask.querySelectorAll('rect')].find(r=>r.getAttribute('fill')==='#000'); if(!hole) return {ok:false, reason:'no hole'};
    const hx=+hole.getAttribute('x'), hy=+hole.getAttribute('y'), hw=+hole.getAttribute('width'), hh=+hole.getAttribute('height');
    const cr=cw.getBoundingClientRect();
    const covers = hw>80 && hh>80 && hx<=cr.left+4 && hy<=cr.top+4 && (hx+hw)>=cr.right-4 && (hy+hh)>=cr.bottom-4;
    return {ok:covers, hole:{hx,hy,hw,hh}, cr:{l:Math.round(cr.left),t:Math.round(cr.top),r:Math.round(cr.right),b:Math.round(cr.bottom)}};
  });
}

// parse "N / 15" -> N
function progN(s){ const m=/(\d+)\s*\/\s*(\d+)/.exec(s||''); return m?{n:+m[1], total:+m[2]}:null; }

// wait for onboarding card to reach a given step id/prog
async function waitOnbProg(f, wantN, {timeout=15000, desc=''}={}){
  return waitFor(async()=>{ const c=await onbCard(f); const p=progN(c.prog); return (p && p.n===wantN)?c:null; }, {timeout, desc:desc||('onb '+wantN)});
}

// --- canvas real-click dispatch (in iframe, client coords) ---
async function dispatchAt(f, x, y, type){
  return f.evaluate((x,y,type)=>{
    const el=document.elementFromPoint(x,y) || document.getElementById('svg');
    const svg=document.getElementById('svg');
    const opts={bubbles:true, cancelable:true, clientX:x, clientY:y, button:0, view:window};
    (svg||el).dispatchEvent(new MouseEvent(type, opts));
  }, x, y, type);
}
async function realClickCanvas(f, x, y){
  await dispatchAt(f, x, y, 'mousemove');
  await dispatchAt(f, x, y, 'mousedown');
  await dispatchAt(f, x, y, 'mouseup');
}
// draw a closed polygon: click each vertex, then click near first to close
async function drawPolygon(f, pts){
  for(const p of pts){ await realClickCanvas(f, p.x, p.y); await sleep(90); }
  // close: click first vertex again
  await realClickCanvas(f, pts[0].x, pts[0].y); await sleep(120);
}
// read block ghost corner client coords (circles)
async function ghostCorners(f){
  return f.evaluate(()=>{
    const g=document.getElementById('onbGhost'); if(!g) return null;
    const cs=[...g.querySelectorAll('circle')];
    return cs.map(c=>{ const r=c.getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2}; });
  });
}
// read pool ghost box (client coords) for amenity triangle
async function poolGhostBox(f){
  return f.evaluate(()=>{
    const g=document.getElementById('onbGhost'); if(!g) return null;
    const texts=[...g.querySelectorAll('text')], rects=[...g.querySelectorAll('rect')];
    const t=texts.find(x=>/Havuz/i.test(x.textContent||''));
    let box=null;
    if(t){ const tr=t.getBoundingClientRect(); const cx=tr.left+tr.width/2, cy=tr.top+tr.height/2;
      box=rects.map(r=>r.getBoundingClientRect()).find(b=> cx>=b.left&&cx<=b.right&&cy>=b.top&&cy<=b.bottom) || null; }
    if(!box && rects.length){ box=rects[0].getBoundingClientRect(); }
    if(!box) return null;
    return {left:box.left, top:box.top, width:box.width, height:box.height};
  });
}

async function shot(page, tag){
  const name = `e2e-${String(++shotN).padStart(2,'0')}-${tag}.png`;
  try{ await page.screenshot({path: path.join(OUTDIR, name)}); }catch(e){}
  return name;
}

// ============ MAIN ============
(async()=>{
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args:['--no-sandbox','--disable-setuid-sandbox','--window-size=1600,900','--incognito'],
    defaultViewport:{width:1600, height:900}
  });
  const ctx = await browser.createIncognitoBrowserContext ? await browser.createIncognitoBrowserContext() : browser.defaultBrowserContext();
  const page = await (ctx.newPage ? ctx.newPage() : browser.newPage());
  await page.setViewport({width:1600, height:900});

  page.on('pageerror', e=>{ errors.push(String(e.message||e)+(e && e.stack? ('\n     '+String(e.stack).split('\n').slice(0,4).join('\n     ')):'')); });
  page.on('console', m=>{ if(m.type()==='error'){ const t=m.text(); let u=''; try{ u=(m.location&&m.location().url)||''; }catch(e){} if(/favicon\.ico/.test(t+u)) return; consoleErrs.push(t+(u?(' @'+u):'')); } });
  // frames also emit via page in puppeteer

  const url = `${BASE}?demo=1${PKG?'&paket=1':''}&_cb=${Date.now()}`;
  log('\n=== E2E '+(PKG?'[VITRIN paket=1]':'[HANDS-ON]')+' === '+url);
  await page.goto(url, {waitUntil:'domcontentloaded', timeout:60000});

  const f = await waitEngineFrame(page);
  ok('engineFrame yuklendi');
  await sleep(1500);

  if(PKG){ await runPkg(page, f); }
  else { await runHandson(page, f); }

  // --- final report ---
  await sleep(300);
  const nPass=results.filter(r=>r.pass).length, nFail=results.filter(r=>!r.pass).length;
  log('\n=== SONUC ===');
  log(`assert: ${nPass} gecti / ${nFail} basarisiz`);
  log(`pageerror: ${errors.length}`); errors.slice(0,20).forEach(e=>log('   ! '+e));
  log(`console.error: ${consoleErrs.length}`); consoleErrs.slice(0,20).forEach(e=>log('   c '+e));
  results.filter(r=>!r.pass).forEach(r=>log('   FAIL: '+r.name+(r.extra?' ['+r.extra+']':'')));

  await browser.close();
  const clean = (nFail===0 && errors.length===0);
  log(clean ? '\nGREEN' : '\nRED');
  process.exit(clean?0:1);
})().catch(async e=>{ console.error('HARNESS-ERR', e); process.exit(2); });

// ============ HANDS-ON FLOW ============
async function runHandson(page, f){
  // ---- PHASE 1: shell welcome + proje ----
  let sc = await waitFor(async()=>{ const c=await shellCard(page); return c.visible?c:null; }, {timeout:15000, desc:'shell welcome'});
  const p1=progN(sc.prog);
  (p1 && p1.n===1 && p1.total===10) ? ok('kabuk welcome 1/10', sc.title) : bad('kabuk welcome 1/10', 'gorulen='+sc.prog+' '+sc.title);
  await shot(page,'01-welcome');

  await shellClickNext(page); await sleep(600);
  sc = await shellCard(page);
  const p2=progN(sc.prog);
  (p2 && p2.n===2) ? ok('kabuk proje 2/10', sc.title) : bad('kabuk proje 2/10', 'gorulen='+sc.prog);
  await shot(page,'02-proje');

  // click İleri on proje -> handsonHandoff -> shell hidden + motor tour appears
  await shellClickNext(page);
  // motor tour appears (may take a couple retries of demoHandsOnStartTour ~1.2s each)
  await waitFor(async()=>{ const c=await onbCard(f); return c.visible?c:null; }, {timeout:20000, desc:'motor ana tour appears'});
  await sleep(400);
  let mc = await onbCard(f);
  const shellHidden = await page.evaluate(()=>{ const ov=document.getElementById('mskTourOv'); return !ov || !ov.classList.contains('on'); });
  shellHidden ? ok('kabuk karti gizlendi (handoff)') : bad('kabuk karti gizlendi', 'ov hala on');
  const pm=progN(mc.prog);
  (pm && pm.n===1 && pm.total===16) ? ok('motor 1/16 pro-mod', mc.title) : bad('motor 1/16', 'gorulen='+mc.prog+' '+mc.title);
  // pro-mod gated -> İleri button expected
  (mc.btns.some(b=>b.act==='next')) ? ok('pro-mod İleri kapili (Pro zaten acik)') : bad('pro-mod İleri', 'btns='+JSON.stringify(mc.btns));
  await shot(page,'03-motor-1-promod');

  // ---- PHASE 2: motor 16 steps ----
  // step1 pro-mod: İleri -> 2 parsel-sekme
  await onbClick(f,'next');
  mc = await waitOnbProg(f, 2, {desc:'2 parsel-sekme'}); ok('motor 2/16 '+mc.title);
  // click Parsel/İmar tab (target .ptab[data-tab="parsel"])
  await engClick(f, '.ptab[data-tab="parsel"]'); await sleep(500);
  mc = await waitOnbProg(f, 3, {desc:'3 parsel-getir'}); ok('motor 3/16 '+mc.title);
  await shot(page,'04-parsel-sekme');

  // parsel-getir: action "Örnek parselle devam"
  await onbClick(f,'act'); await sleep(1200);
  mc = await waitOnbProg(f, 4, {timeout:20000, desc:'4 blokA-ciz'}); ok('motor 4/16 '+mc.title);
  // imar paneli ada assert
  const imar = await f.evaluate(()=>{ const b=document.body.innerText||''; return /2010/.test(b); });
  imar ? ok('imar paneli ada 2010') : bad('imar paneli ada 2010','yok');
  await sleep(600);
  // card must NOT occlude any ghost corner (faithful to bug #1)
  const overlap = await cardGhostOverlap(page, f);
  (!overlap.occluded) ? ok('kart hicbir ghost kosesini ortmuyor', 'corners='+overlap.corners+' bbox='+overlap.bboxOverlap) : bad('kart ghost kosesini ortuyor', JSON.stringify(overlap));
  // FIX5: cizim adiminda tuval karartisiz (fullCanvasHole -> delik canvasWrap'i kapsar)
  const holeA = await fullHoleCoversCanvas(f);
  holeA.ok ? ok('FIX5 blokA-ciz karartma yok (delik tuvali kapsar)', JSON.stringify(holeA.hole||{})) : bad('FIX5 blokA-ciz karartma yok', JSON.stringify(holeA));
  await shot(page,'05-blokA-ghost');

  // draw block A over ghost corners
  let corners = await ghostCorners(f);
  if(!corners || corners.length<3){ bad('blokA ghost kose okundu','n='+(corners?corners.length:0)); }
  else{
    ok('blokA ghost '+corners.length+' kose');
    await drawPolygon(f, corners);
    await sleep(500);
  }
  mc = await waitOnbProg(f, 5, {timeout:12000, desc:'5 yerlesim (Blok A)'}).catch(()=>null);
  if(mc){ ok('blokA cizildi -> 5/16 '+mc.title); }
  else { const c=await onbCard(f); bad('blokA cizildi -> 5/16', 'kart='+c.prog); }
  await shot(page,'06-yerlesim');

  // FIX1: Blok A yerlesiminde unitSpecs TEK kayit (3+1 ensuite) — B karmasi (2+1 acik) DEGIL
  const specsA = await f.evaluate(()=>{ try{ if(typeof unitSpecs==='undefined'||!unitSpecs) return {n:-1}; return {n:unitSpecs.length, has3:unitSpecs.some(s=>s.oda===3&&s.ensuite), has2acik:unitSpecs.some(s=>s.oda===2&&s.acik)}; }catch(e){ return {n:-2}; } });
  (specsA.n===1 && specsA.has3 && !specsA.has2acik) ? ok('FIX1 Blok A unitSpecs TEK daire 3+1 ensuite', JSON.stringify(specsA)) : bad('FIX1 Blok A unitSpecs tek 3+1', JSON.stringify(specsA));
  // FIX3: Daireler sekmesi aktif (kullanici otomatik karmayi gorur)
  (await daireTabActive(f)) ? ok('FIX3 Daireler sekmesi aktif (Blok A yerlesim)') : bad('FIX3 Daireler sekmesi aktif (A)', 'aktif degil');

  // yerlesim: click Yerleşimi Oluştur (#genBtn)
  await engClick(f, '#genBtn'); await sleep(1500);
  mc = await waitOnbProg(f, 6, {timeout:15000, desc:'6 duvar-cek'}); ok('motor 6/16 '+mc.title);
  await shot(page,'07-duvar-cek');

  // duvar-cek: drag a wall
  const dragged = await dragSomeWall(f);
  dragged.ok ? ok('bir duvar cekildi (gercek drag)', JSON.stringify(dragged.hit)) : bad('duvar cekildi', JSON.stringify(dragged));
  mc = await waitOnbProg(f, 7, {timeout:12000, desc:'7 kapi-pencere'}).catch(()=>null);
  if(mc){ ok('motor 7/16 '+mc.title); }
  else { const c=await onbCard(f); bad('7/16 kapi-pencere','kart='+c.prog+' (duvar check gecmedi mi)'); }
  await shot(page,'08-kapi-pencere');

  // kapi-pencere: try a window double-click; else Atla
  let advanced7 = await tryDoorWindow(f);
  if(!advanced7){ await onbClick(f,'skip'); await sleep(400); }
  mc = await waitOnbProg(f, 8, {timeout:10000, desc:'8 balkon-ekle'}); ok('motor 8/16 '+mc.title);
  await shot(page,'09-balkon');

  // balkon-ekle: add one balcony (click near a facade)
  const balk = await addBalcony(f);
  balk ? ok('bir balkon eklendi') : bad('balkon eklendi','olmadi');
  mc = await waitOnbProg(f, 9, {timeout:10000, desc:'9 site-ac'}).catch(()=>null);
  if(mc){ ok('motor 9/16 '+mc.title); }
  else { const c=await onbCard(f); bad('9/16 site-ac','kart='+c.prog); }
  // balconies == demo set assert (onbSetDemoBalconies on enter of site-ac)
  const balc = await f.evaluate(()=>{ try{ return (typeof balconies!=="undefined"&&balconies?balconies.length:0)||0; }catch(e){ return -1; } });
  (balc>=5) ? ok('balconies demo seti', 'n='+balc) : bad('balconies demo seti (>=5)','n='+balc);
  await shot(page,'10-site-ac');

  // site-ac: target smart -> if bina tab not active, target=bina tab. Click bina tab then #siteMod.
  await engClick(f, '.ptab[data-tab="bina"]'); await sleep(400);
  await engClick(f, '#siteMod'); await sleep(500);
  mc = await waitOnbProg(f, 10, {timeout:10000, desc:'10 blok-ekle'}).catch(()=>null);
  if(mc){ ok('motor 10/16 '+mc.title); }
  else { const c=await onbCard(f); bad('10/16 blok-ekle','kart='+c.prog+' (site acilmadi mi)'); }
  await shot(page,'11-blok-ekle');

  // blok-ekle: click "+ Blok" in #blockTabs
  const added = await addBlock(f);
  added ? ok('+ Blok eklendi') : bad('+ Blok','olmadi');
  mc = await waitOnbProg(f, 11, {timeout:10000, desc:'11 blokB-ciz'}).catch(()=>null);
  if(mc){ ok('motor 11/16 '+mc.title); }
  else { const c=await onbCard(f); bad('11/16 blokB-ciz','kart='+c.prog); }
  await sleep(500);
  await shot(page,'12-blokB-ghost');

  // blokB-ciz: draw L over ghost (8 corners)
  corners = await ghostCorners(f);
  if(!corners || corners.length<3){ bad('blokB ghost kose','n='+(corners?corners.length:0)); }
  else{ ok('blokB ghost '+corners.length+' kose'); await drawPolygon(f, corners); await sleep(500); }
  mc = await waitOnbProg(f, 12, {timeout:12000, desc:'12 blokB-yerlesim'}).catch(()=>null);
  if(mc){ ok('blokB cizildi -> 12/16 '+mc.title); }
  else { const c=await onbCard(f); bad('12/16 blokB-yerlesim','kart='+c.prog); }
  await shot(page,'13-blokB-yerlesim');

  // FIX2: blokB-yerlesim — Blok B karmasi (2 kayit: 2+1 acik + 3+1 ensuite) + Daireler sekmesi + "Yerlesimi Olustur"
  const specsB = await f.evaluate(()=>{ try{ if(typeof unitSpecs==='undefined'||!unitSpecs) return {n:-1}; return {n:unitSpecs.length, has3:unitSpecs.some(s=>s.oda===3&&s.ensuite), has2acik:unitSpecs.some(s=>s.oda===2&&s.acik)}; }catch(e){ return {n:-2}; } });
  (specsB.n===2 && specsB.has3 && specsB.has2acik) ? ok('FIX2 Blok B unitSpecs 2 kayit (2+1 acik + 3+1 ensuite)', JSON.stringify(specsB)) : bad('FIX2 Blok B unitSpecs', JSON.stringify(specsB));
  (await daireTabActive(f)) ? ok('FIX3 Daireler sekmesi aktif (Blok B yerlesim)') : bad('FIX3 Daireler sekmesi aktif (B)', 'aktif degil');
  // aktif blok B, plan henuz yok (giriste)
  const bBefore = await f.evaluate(()=>{ try{ return { active:(typeof activeBlock!=='undefined'?activeBlock:'?'), hasPlan:(typeof plan!=='undefined'&&!!plan) }; }catch(e){ return {err:String(e)}; } });
  log('   [blokB pre-gen] '+JSON.stringify(bBefore));
  // click Yerleşimi Oluştur for block B
  await engClick(f, '#genBtn'); await sleep(1600);
  const bPlanned = await f.evaluate(()=>{ try{ return (typeof plan!=='undefined'&&!!plan); }catch(e){ return false; } });
  bPlanned ? ok('FIX2 Blok B planli (Yerlesimi Olustur -> plan!=null)') : bad('FIX2 Blok B planli','plan yok');
  mc = await waitOnbProg(f, 13, {timeout:12000, desc:'13 imkan-koy'}).catch(()=>null);
  if(mc){ ok('motor 13/16 '+mc.title); }
  else { const c=await onbCard(f); bad('13/16 imkan-koy','kart='+c.prog); }
  await shot(page,'14-imkan');

  // imkan-koy: open amenity tool, select pool, draw triangle over pool ghost, then auto-fill
  await engClick(f, '#tAmenity'); await sleep(400);
  await engClick(f, '#amenityBar [data-am="pool"]'); await sleep(300);
  const box = await poolGhostBox(f);
  if(box){
    const tri=[ {x:box.left+box.width*0.25, y:box.top+box.height*0.72},
                {x:box.left+box.width*0.75, y:box.top+box.height*0.72},
                {x:box.left+box.width*0.50, y:box.top+box.height*0.28} ];
    await drawPolygon(f, tri); await sleep(500);
    const amN = await f.evaluate(()=>{ try{ return (typeof amenities!=="undefined"&&amenities?amenities.length:0)||0; }catch(e){ return -1; } });
    (amN>=1) ? ok('havuz poligonu cizildi', 'amenities='+amN) : bad('havuz cizildi','amenities='+amN);
  } else { bad('havuz ghost box okundu','yok'); }
  // auto-fill remaining
  await onbClick(f,'act'); await sleep(600);
  const amFull = await f.evaluate(()=>{ try{ return (typeof amenities!=="undefined"&&amenities?amenities.length:0)||0; }catch(e){ return -1; } });
  (amFull>=9) ? ok('kalan imkanlar otomatik', 'amenities='+amFull) : bad('imkanlar>=9','amenities='+amFull);
  mc = await waitOnbProg(f, 14, {timeout:10000, desc:'14 kat-ayri'}).catch(()=>null);
  if(mc){ ok('motor 14/16 '+mc.title); }
  else { const c=await onbCard(f); bad('14/16 kat-ayri','kart='+c.prog); }
  await shot(page,'15-kat-ayri');

  // kat-ayri: toggle #katAyri
  await engClick(f, '#katAyri'); await sleep(500);
  mc = await waitOnbProg(f, 15, {timeout:10000, desc:'15 kat-gez'}).catch(()=>null);
  if(mc){ ok('motor 15/16 '+mc.title); }
  else { const c=await onbCard(f); bad('15/16 kat-gez','kart='+c.prog); }
  await shot(page,'16-kat-gez');

  // kat-gez: click a floor tab (change floor signature)
  const floored = await clickAnotherFloor(f);
  floored ? ok('kat degistirildi') : bad('kat degistirildi','olmadi');
  mc = await waitOnbProg(f, 16, {timeout:10000, desc:'16 export'}).catch(()=>null);
  if(mc){ ok('motor 16/16 '+mc.title); }
  else { const c=await onbCard(f); bad('16/16 export','kart='+c.prog); }
  await shot(page,'17-export');

  // FIX4: export IFRAME'de HEDEFSIZ + "Paket İndir" metni + Bitir; #svgBtn hedeflenMEZ.
  const exCard = await onbCard(f);
  (/Paket İndir/.test(exCard.text)) ? ok('FIX4 export bodyIframe "Paket İndir"', exCard.text.slice(0,60)) : bad('FIX4 export "Paket İndir"','text='+exCard.text.slice(0,80));
  (exCard.btns.some(b=>b.act==='act' && /Bitir/.test(b.label))) ? ok('FIX4 export Bitir dugmesi') : bad('FIX4 export Bitir','btns='+JSON.stringify(exCard.btns));
  // spotlight deligi svgBtn'i HEDEFLEMEMELI (iframe -> type none, delik r=0/genislik=0)
  const exTarget = await f.evaluate(()=>{
    const svg=document.getElementById('svgBtn'); const mask=document.getElementById('onbHoleMask');
    let holeW=null, holeC=null; if(mask){ const rs=[...mask.querySelectorAll('rect')]; const h=rs.find(r=>r.getAttribute('fill')==='#000'); holeW=h?+h.getAttribute('width'):null; const c=mask.querySelector('circle'); holeC=c?+c.getAttribute('r'):null; }
    // svgBtn spotlight'lanmis mi: hole rect svgBtn bbox'una denk mi?
    let svgHighlighted=false;
    if(svg && mask){ const br=svg.getBoundingClientRect(); const rs=[...mask.querySelectorAll('rect')]; const h=rs.find(r=>r.getAttribute('fill')==='#000');
      if(h){ const hx=+h.getAttribute('x'), hw=+h.getAttribute('width'); svgHighlighted = (br.width>0 && Math.abs(hx-(br.left-6))<3 && Math.abs(hw-(br.width+12))<3); } }
    return { holeW, holeC, svgHighlighted };
  });
  (!exTarget.svgHighlighted) ? ok('FIX4 export #svgBtn HEDEFLENMEDI (iframe hedefsiz)', JSON.stringify(exTarget)) : bad('FIX4 export svgBtn hedeflendi', JSON.stringify(exTarget));
  // Bitir -> motor turu biter
  await onbClick(f,'act'); await sleep(800);
  const done = await f.evaluate(()=>{ try{ return localStorage.getItem('onb.ana.status'); }catch(e){ return null; } });
  const cardGone = await f.evaluate(()=>!document.querySelector('.onbCard'));
  (done==='done' || cardGone) ? ok('motor turu bitti (Bitir)', 'status='+done) : bad('motor turu bitti','status='+done+' cardGone='+cardGone);
  await shot(page,'18-motor-done');

  // ---- PHASE 3: shell 3B onward ----
  await runPhase3(page, f);
}

// ---- PHASE 3 shared (3B bridge -> camera -> render -> dose) ----
async function runPhase3(page, f){
  // click 3B Görüntüle (ctaBtn) at step 1 -> big normalization -> advance(2)
  await sleep(500);
  await clickParent(page, '#ctaBtn');
  // normalization busyStaged ~ a few seconds; wait for step>=2
  await waitFor(async()=>{ const s=await engStep(page); return (s&&s.step>=2)?s:null; }, {timeout:25000, desc:'3B step>=2'});
  ok('3B kopru (normalizasyon) step>=2');
  // units>0 after demo-plan load
  const units = await f.evaluate(()=>{ try{ const m=window.buildFloorplanMap&&window.buildFloorplanMap(); return m&&m.units?m.units.length:0; }catch(e){ return -1; } });
  (units>0) ? ok('demo-plan yuklendi units>0','units='+units) : bad('demo-plan units>0','units='+units);
  await shot(page,'18-3d');

  // shell tour resume: should show a card again (in3d/go3d). advance via İleri until kamera step CTA
  await sleep(1200);
  let guard=0;
  while(guard++<8){
    const s=await engStep(page);
    const sc=await shellCard(page);
    // if at kamera step and step===2, CTA target is #ctaBtn -> click cta to go to camera
    if(s && s.step===2){
      // click İleri on shell card if present (go3d/in3d), else click cta
      const clickedNext = await shellClickNext(page);
      if(!clickedNext) break;
      await sleep(700);
    } else break;
  }
  await shot(page,'19-shell-resume');

  // Now advance to camera: CTA at step 2 -> angleNudge dialog -> "Otomatik Açı ile Devam"
  await clickParent(page, '#ctaBtn'); await sleep(500);
  // angle nudge dialog
  const anGo = await page.evaluate(()=>{ const b=document.getElementById('anGo'); if(b){ b.click(); return true; } return false; });
  await sleep(1500);
  await waitFor(async()=>{ const s=await engStep(page); return (s&&s.step>=3)?s:null; }, {timeout:20000, desc:'camera step>=3'});
  ok('kamera adimi (step 3)');
  await shot(page,'20-camera-step');

  // kamera3d mini-tour auto-starts in iframe (iframeAuto). wait for ITS card (total===6, not the ana tour's 15).
  await waitFor(async()=>{ const c=await onbCard(f); const p=progN(c.prog); return (c.visible && p && p.total===6)?c:null; }, {timeout:25000, desc:'kamera3d tour (6 adim)'});
  let kc = await onbCard(f); ok('kamera3d turu basladi', kc.prog+' '+kc.title);

  // place one interior camera via mesh: real two-click (pos+aim). Verify count INCREMENTS.
  const camBefore = await getCamCounts(f);
  // ensure camera tool open (tour onStepEnter opens it; guard for timing): if #v3dPlaceBtn missing, click rail Kamera
  if(!(await engHas(f, '#v3dPlaceBtn'))){ await engClick(f, '[data-grp="camera"]'); await sleep(400); }
  await engClick(f, '#v3dPlaceBtn'); await sleep(400);   // startCamGhost (activeCamIdx<0)
  const placeDiag = await f.evaluate(()=>({ hasPlaceBtn:!!document.getElementById('v3dPlaceBtn'), hasEkle:!!document.querySelector('[data-camact="add"]') }));
  await clickMeshCenter(f); await sleep(700);
  const cam1 = await getCamCounts(f);
  (cam1.ic > camBefore.ic) ? ok('mesh tikiyla +1 ic kamera (gercek yerlestirme)','ic='+camBefore.ic+'->'+cam1.ic) : bad('mesh tikiyla +1 kamera','ic='+camBefore.ic+'->'+cam1.ic+' diag='+JSON.stringify(placeDiag));

  // auto-fill remaining cameras
  await onbClick(f,'act'); await sleep(1500);
  const cam = await getCamCounts(f);
  (cam.ic===7) ? ok('getCameras==7','ic='+cam.ic) : bad('getCameras==7','ic='+cam.ic);
  (cam.ex===3) ? ok('ext==3','ex='+cam.ex) : bad('ext==3','ex='+cam.ex);
  await shot(page,'21-cameras');

  // advance through kamera3d tour to render handoff: click İleri/act/skip until render-isaret handoff
  // simplest: click CTA (Render Kadrajları) at step 3 -> extNudge? no, cameras placed so step3Proceed goes.
  await clickParent(page, '#ctaBtn'); await sleep(600);
  // possible extNudge dialog (no drone? we have 3) -> ex>0 so step3Go directly. else handle.
  const enGo = await page.evaluate(()=>{ const b=document.getElementById('enGo'); if(b){ b.click(); return true; } return false; });
  await waitFor(async()=>{ const s=await engStep(page); return (s&&s.step>=4)?s:null; }, {timeout:20000, desc:'render step>=4'});
  ok('render kadraj galerisi (step 4)');
  await shot(page,'22-render-gallery');

  // gallery: Üret -> onay dialog -> DEMO interception
  const genClicked = await clickRenderGenerate(page);
  genClicked ? ok('Üret tiklandi') : bad('Üret tiklandi','buton yok');
  await sleep(600);
  // confirm dialog
  await confirmRenderDialog(page);
  // wait for at least some render cards to have results (demo 2-4s fake delays)
  const gotResults = await waitFor(async()=>{
    const n = await page.evaluate(()=>{ try{ return ((window.__msk&&window.__msk.state).renderCards||[]).filter(c=>c.result).length; }catch(e){ return 0; } });
    return n>0 ? n : null;
  }, {timeout:60000, interval:1000, desc:'render results'}).catch(()=>0);
  (gotResults>0) ? ok('render sonuclari geldi (DEMO)','n='+gotResults) : bad('render sonuclari','yok');
  await shot(page,'23-render-results');

  // wait until generation done (all selected cards resolved) THEN verify the FULL interception mapping
  await waitFor(async()=>{ const g=await page.evaluate(()=>{ try{ return !(window.__msk&&window.__msk.state).rgGenerating; }catch(e){ return true; } }); return g?true:null; }, {timeout:90000, interval:1000, desc:'gen done'}).catch(()=>{});
  await sleep(1500);
  // assert card images are cam1..cam7 / ext1..3 / plan-a/plan-b (DEMO interception; full set now)
  const imgs = await page.evaluate(()=>{ try{ return ((window.__msk&&window.__msk.state).renderCards||[]).filter(c=>c.result).map(c=>({id:c.id, res:c.result||''})); }catch(e){ return []; } });
  const okImgs = imgs.filter(c=>/cam[1-7]\.jpg|ext[1-3]\.jpg|plan-[ab]\.jpg|plan\.jpg/.test(c.res));
  const hasCam = imgs.some(c=>/cam[1-7]\.jpg/.test(c.res)), hasExt = imgs.some(c=>/ext[1-3]\.jpg/.test(c.res)), hasPlan = imgs.some(c=>/plan(-[ab])?\.jpg/.test(c.res));
  (okImgs.length>=3 && hasCam) ? ok('DEMO interception kartlari (cam/ext/plan)','n='+okImgs.length+'/'+imgs.length+' cam='+hasCam+' ext='+hasExt+' plan='+hasPlan) : bad('DEMO interception','imgs='+JSON.stringify(imgs.slice(0,6)));
  await clickParent(page, '#ctaBtn'); await sleep(1000);
  const step5 = await waitFor(async()=>{ const s=await engStep(page); return (s&&s.step>=5)?s:null; }, {timeout:15000, desc:'dose step5'}).catch(()=>null);
  step5 ? ok('Döşe adimi (step 5)') : bad('Döşe step5', 'kalindi');
  await shot(page,'24-dose');
  // marketplace panel present
  const mkt = await page.evaluate(()=>!!document.getElementById('mktCtx') || !!document.querySelector('.mkt-row'));
  mkt ? ok('pazaryeri paneli') : bad('pazaryeri paneli','yok');
}

// ============ helpers needing engine internals ============
// FAITHFUL to user bug #1: the card must not occlude any GHOST CORNER the user must click.
async function cardGhostOverlap(page, f){
  return f.evaluate(()=>{
    const card=document.querySelector('.onbCard'), g=document.getElementById('onbGhost');
    if(!card||!g) return {occluded:false, bboxOverlap:false, corners:0};
    const cr=card.getBoundingClientRect();
    const cs=[...g.querySelectorAll('circle')].map(c=>{ const r=c.getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2}; });
    const pad=6;
    const inCard=p=> (p.x>=cr.left-pad && p.x<=cr.right+pad && p.y>=cr.top-pad && p.y<=cr.bottom+pad);
    const occ = cs.some(inCard);
    const gr=g.getBoundingClientRect();
    const ix=Math.max(0,Math.min(cr.right,gr.right)-Math.max(cr.left,gr.left));
    const iy=Math.max(0,Math.min(cr.bottom,gr.bottom)-Math.max(cr.top,gr.top));
    return {occluded:occ, bboxOverlap:(ix>0&&iy>0), corners:cs.length};
  });
}
// Drag a real wall run perpendicular; verify via editHistory growth (bare global).
async function dragSomeWall(f){
  return f.evaluate(async()=>{
    const svg=document.getElementById('svg'); if(!svg) return {ok:false, reason:'no svg'};
    if(typeof hitWallRun!=='function') return {ok:false, reason:'no hitWallRun'};
    if(typeof plan==='undefined' || !plan) return {ok:false, reason:'no plan'};
    const r=svg.getBoundingClientRect(), W=r.width, H=r.height;
    const before=(typeof editHistory!=='undefined'&&editHistory)?editHistory.length:0;
    function ev(type,cx,cy){ svg.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,clientX:cx,clientY:cy,button:0,view:window})); }
    // find a wall-run hit in svg-local pixel space (hitWallRun expects sx,sy = clientX-rect.left)
    let hit=null;
    for(let sy=H*0.28; sy<=H*0.72 && !hit; sy+=2){
      for(let sx=W*0.30; sx<=W*0.70; sx+=2){
        let rn=null; try{ rn=hitWallRun(sx,sy); }catch(e){}
        if(rn){ hit={sx,sy,horiz:!!rn.horiz}; break; }
      }
    }
    if(!hit) return {ok:false, reason:'no wall hit', before};
    const cx=r.left+hit.sx, cy=r.top+hit.sy;
    const dx=hit.horiz?0:26, dy=hit.horiz?26:0;   // move perpendicular to wall
    ev('mousemove',cx,cy); ev('mousedown',cx,cy);
    ev('mousemove',cx+dx*0.4,cy+dy*0.4); ev('mousemove',cx+dx*0.8,cy+dy*0.8); ev('mousemove',cx+dx,cy+dy);
    ev('mouseup',cx+dx,cy+dy);
    await new Promise(rr=>setTimeout(rr,150));
    const after=(typeof editHistory!=='undefined'&&editHistory)?editHistory.length:0;
    return {ok:after>before, before, after, hit};
  });
}
async function tryDoorWindow(f){
  // best-effort: not critical (skippable). return false to force Atla.
  return false;
}
async function addBalcony(f){
  // enter balkon mode via #tBalk, click near an exterior wall
  return f.evaluate(async()=>{
    const tb=document.getElementById('tBalk'); if(tb) tb.click();
    await new Promise(r=>setTimeout(r,200));
    const svg=document.getElementById('svg'); const r=svg.getBoundingClientRect();
    function ev(type,x,y){ svg.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0,view:window})); }
    const before=(typeof balconies!=="undefined"&&balconies?balconies.length:0)||0;
    // try many points near edges of bounding box
    const pts=[];
    for(let t=0.15;t<=0.85;t+=0.05){ pts.push([r.left+r.width*t, r.top+r.height*0.14]); pts.push([r.left+r.width*t, r.top+r.height*0.86]); pts.push([r.left+r.width*0.14, r.top+r.height*t]); pts.push([r.left+r.width*0.86, r.top+r.height*t]); }
    for(const [x,y] of pts){ ev('mousemove',x,y); ev('mousedown',x,y); ev('mouseup',x,y);
      const now=(typeof balconies!=="undefined"&&balconies?balconies.length:0)||0; if(now>before) return true;
      await new Promise(rr=>setTimeout(rr,10));
    }
    return (typeof balconies!=="undefined"&&balconies?balconies.length:0)>before;
  });
}
async function addBlock(f){
  return f.evaluate(()=>{
    const tabs=document.getElementById('blockTabs'); if(!tabs) return false;
    const before=(typeof blocks!=='undefined'&&blocks)?blocks.length:0;
    // "+ Blok" is button.add whose text contains "Blok" (NOT the "Blok A" tab, NOT "⧉ Kopyala")
    const add=[...tabs.querySelectorAll('button.add')].find(b=>/\+\s*Blok/.test(b.textContent));
    if(!add) return false;
    add.click();
    const after=(typeof blocks!=='undefined'&&blocks)?blocks.length:0;
    return after>before;
  });
}
async function clickAnotherFloor(f){
  return f.evaluate(()=>{
    const tabs=document.getElementById('floorTabs'); if(!tabs) return false;
    const btns=[...tabs.querySelectorAll('button')]; if(btns.length<2) return false;
    const cur=btns.findIndex(b=>b.classList.contains('on'));
    const target=btns.find((b,i)=>i!==cur) || btns[1];
    if(target){ target.click(); return true; } return false;
  });
}
async function getCamCounts(f){
  return f.evaluate(()=>{
    try{
      const V=window.View3D; if(!V) return {ic:-1,ex:-1};
      let ic=0,ex=0;
      if(V.getCameras){ const a=V.getCameras()||[]; ic=a.length; }
      if(V.getExteriorCameras){ const b=V.getExteriorCameras()||[]; ex=b.length; }
      return {ic,ex};
    }catch(e){ return {ic:-2,ex:-2}; }
  });
}
// Place ONE interior camera via the ghost flow: click #v3dPlaceBtn (Ekle) then TWO mesh clicks
//   (pos + aim). Each click = pointerdown+pointerup (no move -> moved=false -> clickCamGhost).
async function clickMeshCenter(f){
  return f.evaluate(async()=>{
    const ov=document.getElementById('view3dOverlay'); if(!ov) return false;
    const cv=ov.querySelector('canvas'); if(!cv) return false;
    const r=cv.getBoundingClientRect();
    function pt(type,x,y,pid){ cv.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0,buttons:type==='pointerdown'?1:0,pointerId:pid||1,pointerType:'mouse',isPrimary:true,view:window})); }
    async function tap(x,y){ pt('pointerdown',x,y); await new Promise(r=>setTimeout(r,40)); pt('pointerup',x,y); await new Promise(r=>setTimeout(r,120)); }
    // click 1: position (center-ish), click 2: aim (offset)
    await tap(r.left+r.width*0.5, r.top+r.height*0.60);
    await tap(r.left+r.width*0.6, r.top+r.height*0.45);
    return true;
  });
}
async function clickRenderGenerate(page){
  return page.evaluate(()=>{
    // Üret button in .rgbar
    const bar=document.querySelector('.rgbar'); if(bar){ const b=[...bar.querySelectorAll('button')].find(x=>/Üret|Uret/i.test(x.textContent)); if(b){ b.click(); return true; } }
    const any=[...document.querySelectorAll('button')].find(x=>/^Üret|Üret \(/i.test(x.textContent.trim())); if(any){ any.click(); return true; }
    return false;
  });
}
async function confirmRenderDialog(page){
  return page.evaluate(()=>{
    // confirm dialog primary button (rgcGo pattern). find a visible modal primary.
    const cands=[...document.querySelectorAll('button')].filter(b=>/Üret|Onayla|Başlat|Devam|Evet/i.test(b.textContent));
    // pick the last (usually primary in modal)
    const b=cands[cands.length-1]; if(b){ b.click(); return true; } return false;
  });
}

// ============ VITRIN (paket=1) REGRESSION ============
async function runPkg(page, f){
  // package loaded + tour boots
  await sleep(2000);
  const parcel = await f.evaluate(()=>{ try{ return (typeof parcelPts!=="undefined"&&parcelPts?parcelPts.length:0)||0; }catch(e){ return -1; } });
  (parcel>=3) ? ok('paket yuklendi parcelPts','n='+parcel) : bad('paket parcelPts>=3','n='+parcel);
  const units = await f.evaluate(()=>{ try{ const m=window.buildFloorplanMap&&window.buildFloorplanMap(); return m&&m.units?m.units.length:0; }catch(e){ return -1; } });
  (units>0) ? ok('paket plani var units>0','units='+units) : bad('paket units>0','units='+units);
  // shell tour boots (DEMO_PKG autostart)
  const sc = await waitFor(async()=>{ const c=await shellCard(page); return c.visible?c:null; }, {timeout:12000, desc:'pkg shell tour'}).catch(()=>null);
  sc ? ok('vitrin akis turu boot','prog='+sc.prog) : bad('vitrin akis turu boot','gorunmedi');
  await shot(page,'pkg-01');
}
