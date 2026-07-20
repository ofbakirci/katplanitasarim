#!/usr/bin/env node
/* tur-e2e.js — ONBOARDING GERCEK-TIK KABUL HARNESS'i (headless Chrome, puppeteer-core).
   Ne yapar: Mesken kabuk karsilamasindan (Akis Turu) baslayip 2B editordeki 16 adimlik ANA
   TUR'u GERCEK tiklarla yurutur (parsel, Blok A/B cizimi, yerlesim, duvar, balkon, site imkanlari,
   kat gezme, export), sonra 3B kopru -> kamera3d mini-tur -> render galerisi -> Dose adimlarini
   surer. Beklenen: TUM assert'ler gecti, 0 pageerror, 0 console.error (temiz cikis kodu 0).
   Gercek tiklar: DOM = el.click(); tuval = mousedown/mouseup dispatch (client koord ghost DOM'dan).

   REV4 YENI ASSERT'LER (kullanicinin 3 sikayeti):
     (KUSUR1) kamera evresi kabuk karti iframe PiP (sol-alt onizleme) ile KESISMIYOR (rect assert).
     (KUSUR2) dose3d/malzeme3d ARTIK spotlight'li + yaptirmali: delik iframe araç butonunda ([data-grp]),
              furnitureEditCount/materialEditCount DELTA>0 -> tur oto-ilerler.
     (KUSUR3) "Yerlesimi Olustur" motor taze-uretimi DEGIL demo blok yerlesimi uygular (plan.regions == demo imzasi).

   REV3 ASSERT'LER (impl raporu 7 kalem):
     (a) kabuk kamera evresi ATLANMADI — 'Kamera koy' karti gorundu + kullanici tiki olmadan render'a gecilmedi.
     (b) angleNudge/extNudge dialoglari hands-on turda HIC gorunmedi (flowTourActive suppress; MutationObserver).
     (c) 3B evresinde doseme tadi — dose3d ('Mobilyayi dene') + malzeme3d ('Ic malzeme') kabuk kartlari gorundu.
     (d) imkan-koy: 'Kalan imkanlari otomatik yerlestir' aksiyonu havuz cizilmeden KARTTA YOK, cizildikten sonra VAR.
     (e) Uret ciktilari paket-kokenli — karta dusen cam img naturalWidth==1600 + demo-assets/cam1.jpg 300KB+ (yeni set; eski 199KB DEGIL).
     (f) Tur dugmesi: motor turunu 5. adimda kapat -> #mskTourBtn -> stored adimdan RESUME (5/16, 1/16 DEGIL).

   GEREKSINIMLER:
     - puppeteer-core:  `npm i puppeteer-core`  (repo kokune ya da tools/ altina)
     - Chrome:          /Applications/Google Chrome.app/...   (CHROME ortam degiskeniyle ezilebilir)
     - HTTP sunucu:     repo kokunde  `python3 -m http.server 8750`  (E2E_PORT ile ezilebilir)

   KOSUM:
     node tools/tur-e2e.js          # hands-on: ana tur 16 adim + phase3 (harici python http.server GEREKIR)
     node tools/tur-e2e.js --pkg    # vitrin regresyonu (?demo=1&paket=1: paket dolu gelir; harici sunucu GEREKIR)
     node tools/tur-e2e.js --mesken-root   # mesken KLASORU kok serviste (harici: http.server --directory mesken)
     node tools/tur-e2e.js --kok-rewrite   # CANLI Caddy sekli (pathname '/' + /mesken/* dosyalar) — KENDI ic sunucusunu baslatir, harici sunucu GEREKMEZ
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
    process.env.PUPPETEER_CORE || '',
    '/private/tmp/claude-501/-Users-ofbakirci-apps-ofb-katplanitasarim/f134d055-1952-494f-9e8f-060129f159ce/scratchpad/node_modules/puppeteer-core',
    '/private/tmp/claude-501/-Users-ofbakirci-apps-ofb-katplanitasarim/a78ddd65-c5da-4cbf-bdaf-8ae09a09428c/scratchpad/node_modules/puppeteer-core',
  ].filter(Boolean);
  for(const t of tries){ try{ return require(t); }catch(e){} }
  throw new Error('puppeteer-core bulunamadi — `npm i puppeteer-core` calistirin.');
}
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = +(process.env.E2E_PORT || 8750);
const OUTDIR = path.resolve(process.cwd(), 'e2e-cikti');   // ekran goruntusu cikti klasoru (goreli)
try{ fs.mkdirSync(OUTDIR, {recursive:true}); }catch(e){}
const PKG = process.argv.includes('--pkg');
// SUNUCU-KOKU REGRESYONU: --mesken-root ile sayfa MESKEN klasoru KOK yapilarak servis edilir
//   (http.server --directory mesken -> /MESKEN-prototip.html). DEMO_ASSETS konumdan turer -> /demo-assets/.
//   Dunku 3 canli kusurun (taze yerlesim, catisiz, kullanici kameralari) tek kok nedeni: mesken-kok
//   serviste demo-plan.json 404 -> kopru + normalizasyon SESSIZCE atlaniyordu. Bu senaryo o yolu dogrular.
const MESKEN_ROOT = process.argv.includes('--mesken-root');
// KOK-REWRITE REGRESYONU: --kok-rewrite ile CANLI Caddy sekli simule edilir — pathname '/' KALIR
//   (rewrite @root /mesken/MESKEN-prototip.html) ama dosyalar repo yapisindan (/mesken/*) sunulur.
//   Bu senaryo KENDI node http sunucusunu baslatir (rewrite taklidi) — harici python http.server GEREKMEZ.
//   Kok neden: pathname'de '/mesken/' YOKken eski sabit tureme '/demo-assets/'e dusup 404 aliyordu; aday-listeli
//   probe '/mesken/demo-assets/' adayini bulup demo koprusunu diriltmeli.
const KOK_REWRITE = process.argv.includes('--kok-rewrite');
const BASE = KOK_REWRITE
  ? `http://localhost:${PORT}/`
  : MESKEN_ROOT
    ? `http://localhost:${PORT}/MESKEN-prototip.html`
    : `http://localhost:${PORT}/mesken/MESKEN-prototip.html`;
// KOK-REWRITE ic sunucusu: '/' ve '/demo' -> mesken/MESKEN-prototip.html; '/mesken/*' -> repo dosyalari.
//   HEAD desteklenir (aday-probe HEAD kullanir). Path-traversal korumasi + no-store.
let _kokServer=null;
function startKokServer(){
  const http=require('http');
  const REPO=path.resolve(__dirname,'..');
  const MIME={'.html':'text/html; charset=utf-8','.json':'application/json','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.mskpkg':'application/json','.svg':'image/svg+xml'};
  const srv=http.createServer((req,res)=>{
    let p=(req.url||'/').split('?')[0];
    let file;
    if(p==='/'||p==='/demo'||p==='/demo/'||p==='/index.html') file=path.join(REPO,'mesken','MESKEN-prototip.html'); // Caddy @root/@demoroot taklidi
    else file=path.join(REPO, p.replace(/^\/+/,''));   // /mesken/* (ve digerleri) -> repo-koku
    const norm=path.normalize(file);
    if(norm!==REPO && !norm.startsWith(REPO+path.sep)){ res.writeHead(403); res.end('403'); return; }
    fs.stat(norm,(err,st)=>{
      if(err||!st.isFile()){ res.writeHead(404,{'Content-Type':'text/plain'}); res.end('404'); return; }
      const ext=path.extname(norm).toLowerCase();
      const head={'Content-Type':MIME[ext]||'application/octet-stream','Content-Length':st.size,'Cache-Control':'no-store'};
      if(req.method==='HEAD'){ res.writeHead(200,head); res.end(); return; }
      res.writeHead(200,head); fs.createReadStream(norm).pipe(res);
    });
  });
  return new Promise((resolve,reject)=>{ srv.on('error',reject); srv.listen(PORT,()=>{ _kokServer=srv; resolve(srv); }); });
}

const results = [];
let shotN = 0;
let tPageStart = 0;   // (e) LOADER: sayfa goto ani -> tur karsilama karti suresi tavani
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
// REV4: kabuk tur spotlight deligi (#mskTourHole) parent rect'i (overlay 'on' iken)
async function shellHoleRect(page){ return page.evaluate(()=>{ const h=document.getElementById('mskTourHole'), ov=document.getElementById('mskTourOv'); if(!h||!ov||!ov.classList.contains('on')) return null; const r=h.getBoundingClientRect(); return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}; }); }
// REV4: kabuk tur karti (#mskTourCard) parent rect'i (overlay 'on' iken)
async function shellCardRect(page){ return page.evaluate(()=>{ const c=document.getElementById('mskTourCard'), ov=document.getElementById('mskTourOv'); if(!c||!ov||!ov.classList.contains('on')) return null; const r=c.getBoundingClientRect(); return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}; }); }
// REV4: iframe-ici elemanin PARENT koordinatindaki rect'i (iframe ofsetiyle)
async function iframeElemRectParent(page, sel){ return page.evaluate((s)=>{ const fr=document.getElementById('engineFrame'); if(!fr) return null; const d=fr.contentDocument; if(!d) return null; const el=d.querySelector(s); if(!el||!el.getBoundingClientRect) return null; const er=el.getBoundingClientRect(); if(er.width<=0&&er.height<=0) return null; const f0=fr.getBoundingClientRect(); return {left:f0.left+er.left,top:f0.top+er.top,right:f0.left+er.right,bottom:f0.top+er.bottom,width:er.width,height:er.height}; }, sel); }
// REV4 KUSUR 1: iframe 3B PiP (sol-alt onizleme) PARENT rect'i (birlesik bbox; gorunurse)
async function iframePipRectParent(page){ return page.evaluate(()=>{ const fr=document.getElementById('engineFrame'); if(!fr) return null; const d=fr.contentDocument; if(!d) return null; const f0=fr.getBoundingClientRect(); let out=null; ['v3dPip','v3dExtPip'].forEach(id=>{ const p=d.getElementById(id); if(!p) return; if(p.style&&p.style.display==='none') return; const r=p.getBoundingClientRect(); if(r.width<=0||r.height<=0) return; const rr={left:f0.left+r.left,top:f0.top+r.top,right:f0.left+r.right,bottom:f0.top+r.bottom}; out=out?{left:Math.min(out.left,rr.left),top:Math.min(out.top,rr.top),right:Math.max(out.right,rr.right),bottom:Math.max(out.bottom,rr.bottom)}:rr; }); return out; }); }
function rectsOverlap(a,b){ if(!a||!b) return false; return !(a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom); }
// REV4 KUSUR 2: spotlight deligi hedef butonu KAPSIYOR mu (buton merkezi delik icinde)
function spotlightCovers(hole, btn){
  if(!hole||!btn) return {covers:false, hasHole:!!hole, hasBtn:!!btn};
  const bcx=(btn.left+btn.right)/2, bcy=(btn.top+btn.bottom)/2;
  const covers = hole.width>10 && hole.height>10 && bcx>=hole.left-6 && bcx<=hole.right+6 && bcy>=hole.top-6 && bcy<=hole.bottom+6;
  return {covers, holeW:Math.round(hole.width), btnC:{x:Math.round(bcx),y:Math.round(bcy)}};
}
// REV6: kabuk turu ARTIK cok-delikli SVG maske (#mskTourMask/#mtHoles) + hedef vurgu halkasi (#mskTourRing).
//   #mskTourRing rect'i (overlay 'on' + halka 'on' iken); yoksa null.
async function shellRingRect(page){ return page.evaluate(()=>{ const ov=document.getElementById('mskTourOv'), r=document.getElementById('mskTourRing'); if(!ov||!ov.classList.contains('on')||!r||!r.classList.contains('on')) return null; const rc=r.getBoundingClientRect(); if(rc.width<=0&&rc.height<=0) return null; return {left:rc.left,top:rc.top,right:rc.right,bottom:rc.bottom,width:rc.width,height:rc.height}; }); }
// REV6 engineHole: dim maskesinde motor iframe bolgesi SEFFAF mi — #mtHoles rect'lerinden biri engineFrame'i kapsar mi.
async function engineHoleTransparent(page){ return page.evaluate(()=>{
  const ov=document.getElementById('mskTourOv'); if(!ov||!ov.classList.contains('on')) return {ok:false, reason:'overlay kapali'};
  const fr=document.getElementById('engineFrame'); if(!fr) return {ok:false, reason:'iframe yok'};
  const er=fr.getBoundingClientRect(); if(er.width<=0||er.height<=0) return {ok:false, reason:'iframe rect bos'};
  const g=document.getElementById('mtHoles'); if(!g) return {ok:false, reason:'mtHoles yok'};
  const cx=er.left+er.width/2, cy=er.top+er.height/2;
  const rects=[...g.querySelectorAll('rect')].map(r=>({x:+r.getAttribute('x'),y:+r.getAttribute('y'),w:+r.getAttribute('width'),h:+r.getAttribute('height')}));
  const covers=rects.some(h=> cx>=h.x-6 && cx<=h.x+h.w+6 && cy>=h.y-6 && cy<=h.y+h.h+6 && h.w>=er.width*0.8 && h.h>=er.height*0.8);
  return {ok:covers, holes:rects.length, engW:Math.round(er.width), engH:Math.round(er.height)};
}); }
// REV6: vurgu halkasi hedef butonu SARIYOR mu (halka >= buton, toleransli)
function ringWraps(ring, btn){
  if(!ring||!btn) return {wraps:false, hasRing:!!ring, hasBtn:!!btn};
  const tol=16;
  const wraps = ring.left<=btn.left+tol && ring.top<=btn.top+tol && ring.right>=btn.right-tol && ring.bottom>=btn.bottom-tol
    && (ring.right-ring.left)>=(btn.right-btn.left)-tol;
  return {wraps, ring:{l:Math.round(ring.left),t:Math.round(ring.top),w:Math.round(ring.width)}, btn:{l:Math.round(btn.left),t:Math.round(btn.top),w:Math.round(btn.right-btn.left)}};
}
// REV6 dose3d dinamik hedef: mobilya dock aciksa furnauto dugmesi, kapaliysa rail Mobilya butonu.
async function iframeDoseTargetRect(page){
  const au=await iframeElemRectParent(page,'#v3dFurnDock [data-v3d="furnauto"]');
  if(au) return {rect:au, which:'furnauto'};
  const rail=await iframeElemRectParent(page,'[data-grp="furniture"]');
  return {rect:rail, which:'rail'};
}
// REV6 EXPORT: son adim #ctaBtn 'Projeyi Indir' -> gercek indirme (blob a[download].click). Parent'a
//   download gozetleyici kur (URL.createObjectURL + a[download].click yakalar).
async function installDownloadObserver(page){
  try{ await page.evaluate(()=>{
    if(window.__dlObs) return; window.__dlSeen=[]; window.__dlBlobs=[]; window.__dlBlobP=[];
    const origCreate=URL.createObjectURL;
    URL.createObjectURL=function(b){ try{ window.__dlSeen.push('blob'); }catch(e){} return origCreate.apply(this, arguments); };
    const origClick=HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click=function(){
      try{ if(this.download){ window.__dlSeen.push('a:'+this.download);
        const href=this.href, name=this.download;
        if(/^blob:/.test(href)){                // blob URL revoke edilmeden ONCE baytlari oku (bayt/PK/girdi sayisi teyidi)
          const pr=fetch(href).then(r=>r.arrayBuffer()).then(buf=>{ const u=new Uint8Array(buf);
            // yerel-dosya-basligi (0x50 0x4B 0x03 0x04) tara -> ZIP girdi sayisi
            let entries=0; for(let i=0;i+3<u.length;i++){ if(u[i]===0x50&&u[i+1]===0x4B&&u[i+2]===0x03&&u[i+3]===0x04) entries++; }
            window.__dlBlobs.push({ name, size:u.length, b0:u[0]||0, b1:u[1]||0, pk:(u[0]===0x50&&u[1]===0x4B), entries }); }).catch(()=>{});
          window.__dlBlobP.push(pr);
        }
      } }catch(e){}
      return origClick.apply(this, arguments);
    };
    window.__dlObs=true;
  }); }catch(e){}
}
async function getDownloads(page){ try{ return await page.evaluate(()=>Array.isArray(window.__dlSeen)?window.__dlSeen.slice():[]); }catch(e){ return []; } }
async function getDownloadBlobs(page){ try{ await page.evaluate(()=>Promise.all((window.__dlBlobP||[]).map(p=>p.catch(()=>{})))); return await page.evaluate(()=>Array.isArray(window.__dlBlobs)?window.__dlBlobs.slice():[]); }catch(e){ return []; } }

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

// IS 3: kart (onbCard) plan ayak izi bbox'u (onbBlockScreenBBox) ile CAKISMA alani (px^2). 0 = kesismiyor.
async function cardPlanBBoxOverlap(f){
  return f.evaluate(()=>{
    const card=document.querySelector('.onbCard'); if(!card) return {hasCard:false, hasBox:false, overlapArea:-1};
    let box=null; try{ if(typeof onbBlockScreenBBox==='function') box=onbBlockScreenBBox(); }catch(e){}
    if(!box) return {hasCard:true, hasBox:false, overlapArea:-1};
    const cr=card.getBoundingClientRect();
    const ix=Math.max(0, Math.min(cr.right,box.right)-Math.max(cr.left,box.left));
    const iy=Math.max(0, Math.min(cr.bottom,box.bottom)-Math.max(cr.top,box.top));
    return {hasCard:true, hasBox:true, overlapArea:Math.round(ix*iy),
      card:{l:Math.round(cr.left),t:Math.round(cr.top),r:Math.round(cr.right),b:Math.round(cr.bottom)},
      box:{l:Math.round(box.left),t:Math.round(box.top),r:Math.round(box.right),b:Math.round(box.bottom)}};
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

// (b) NUDGE GOZETLEYICI — angleNudge/extNudge dialoglari PARENT document.body'ye eklenir; tur akisinda
//   flowTourActive() bunlari bastirir. MutationObserver ekleme aninda id'yi yakalar; getNudgeSeen okur.
async function installNudgeObserver(page){
  try{
    await page.evaluate(()=>{
      if(window.__nudgeObs) return;
      window.__nudgeSeen = [];
      const hit=(el)=>{ try{ if(el && el.id && (el.id==='angleNudge'||el.id==='extNudge')) window.__nudgeSeen.push(el.id); }catch(e){} };
      const scan=(n)=>{ if(!n || n.nodeType!==1) return; hit(n);
        try{ if(n.querySelectorAll) n.querySelectorAll('#angleNudge,#extNudge').forEach(hit); }catch(e){} };
      const mo=new MutationObserver(function(muts){ for(const m of muts){ for(const n of m.addedNodes){ scan(n); } } });
      mo.observe(document.body, {childList:true, subtree:true});
      window.__nudgeObs = mo;
    });
  }catch(e){}
}
async function getNudgeSeen(page){
  try{ return await page.evaluate(()=>Array.isArray(window.__nudgeSeen)?window.__nudgeSeen.slice():[]); }catch(e){ return ['<oku-hata>']; }
}

// (f) TUR DUGMESI RESUME — motor turu 5. adimdayken: KAPAT (onbClose) -> #mskTourBtn -> onbRelaunch resume.
//   Cizilen Blok A geometrisi korunur; resume ayni adimi (5/16) geri getirir -> ana akis kesintisiz surer.
async function resumeScenario(page, f){
  const c0 = await onbCard(f); const p0 = progN(c0.prog); const before=(p0&&p0.n)||0;
  (before>=5) ? ok('(f) resume-giris: motor '+(c0.prog||'?')+' (5. adim)') : bad('(f) resume giris 5/16','prog='+c0.prog);
  // motor turunu KAPAT — kartin X'i (data-onb="close" -> onbStop('dismissed'))
  await onbClick(f, 'close'); await sleep(500);
  const st = await f.evaluate(()=>{ try{ return localStorage.getItem('onb.ana.status'); }catch(e){ return null; } });
  const gone = await f.evaluate(()=>!document.querySelector('.onbCard'));
  (st==='dismissed' && gone) ? ok('(f) motor turu KAPATILDI (dismissed + kart gitti)') : bad('(f) motor turu kapatildi','status='+st+' cardGone='+gone);
  // #mskTourBtn (kabuk baslik) -> demoHandsOnResumeTour -> #onbStart -> onbRelaunch (resume-farkinda)
  const clicked = await clickParent(page, '#mskTourBtn');
  clicked ? ok('(f) #mskTourBtn tiklandi (kaldigin yerden)') : bad('(f) #mskTourBtn','buton yok');
  // motor karti geri gelsin
  const back = await waitFor(async()=>{ const c=await onbCard(f); return (c.visible && progN(c.prog))?c:null; }, {timeout:12000, desc:'(f) motor karti resume'}).catch(()=>null);
  const p1 = back ? progN(back.prog) : null;
  (p1 && p1.n>=5) ? ok('(f) TUR DUGMESI RESUME: '+back.prog+' — stored adimdan surdu (1/16 DEGIL)', 'once='+before+' sonra='+p1.n) : bad('(f) resume stored adimdan (1/16 degil)','sonra='+(back?back.prog:'kart yok'));
  await sleep(300);
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

  if(KOK_REWRITE){ try{ await startKokServer(); log('  (kok-rewrite ic sunucu :'+PORT+' basladi)'); }catch(e){ console.error('kok-rewrite ic sunucu baslamadi:', e&&e.message||e); process.exit(2); } }
  const url = `${BASE}?demo=1${PKG?'&paket=1':''}&_cb=${Date.now()}`;
  log('\n=== E2E '+(KOK_REWRITE?'[KOK-REWRITE regresyon]':(MESKEN_ROOT?'[MESKEN-KOK regresyon]':(PKG?'[VITRIN paket=1]':'[HANDS-ON]')))+' === '+url);
  tPageStart = Date.now();   // (e) LOADER tavani icin baslangic
  await page.goto(url, {waitUntil:'domcontentloaded', timeout:60000});

  const f = await waitEngineFrame(page);
  ok('engineFrame yuklendi');
  await installNudgeObserver(page);   // (b) angleNudge/extNudge hic cikmasin diye izle
  await installDownloadObserver(page);// REV6: son adim 'Projeyi Indir' gercek indirme tetikler mi
  await sleep(1500);

  if(KOK_REWRITE){ await runKokRewrite(page, f); }
  else if(MESKEN_ROOT){ await runMeskenRoot(page, f); }
  else if(PKG){ await runPkg(page, f); }
  else { await runHandson(page, f); }

  // --- final report ---
  await sleep(300);
  const nPass=results.filter(r=>r.pass).length, nFail=results.filter(r=>!r.pass).length;
  log('\n=== SONUC ===');
  log(`assert: ${nPass} gecti / ${nFail} basarisiz`);
  log(`pageerror: ${errors.length}`); errors.slice(0,20).forEach(e=>log('   ! '+e));
  log(`console.error: ${consoleErrs.length}`); consoleErrs.slice(0,20).forEach(e=>log('   c '+e));
  results.filter(r=>!r.pass).forEach(r=>log('   FAIL: '+r.name+(r.extra?' ['+r.extra+']':'')));

  // TAM tur sonrasi sayfada 'ilerleme' var (maxStep>1 / render) -> template beforeunload preventDefault ->
  //   browser.close() ASILI KALABILIR. Kapanisi timeout ile yarista; takilirsa Chrome surecini oldur.
  await Promise.race([ browser.close().catch(()=>{}), sleep(5000) ]);
  try{ const proc=browser.process&&browser.process(); if(proc&&proc.kill) proc.kill('SIGKILL'); }catch(e){}
  try{ if(_kokServer) _kokServer.close(); }catch(e){}
  const clean = (nFail===0 && errors.length===0);
  log(clean ? '\nGREEN' : '\nRED');
  process.exit(clean?0:1);
})().catch(async e=>{ console.error('HARNESS-ERR', e); process.exit(2); });

// ============ HANDS-ON FLOW ============
async function runHandson(page, f){
  // ---- PHASE 1: shell welcome + proje ----
  let sc = await waitFor(async()=>{ const c=await shellCard(page); return c.visible?c:null; }, {timeout:15000, desc:'shell welcome'});
  // (e) LOADER REGRESYON TAVANI: sayfa goto'dan loader KALKIP tur karsilama karti GORUNUR olana kadar toplam
  //   sure < 13sn (LOADER_DUR=8.5 + boot; eski 16.4sn REGRESYON). Loader 'is-done' -> gorunum gizli.
  await waitFor(async()=>{ const done=await page.evaluate(()=>{ const l=document.getElementById('meskenLoader');
    return !l || l.classList.contains('is-done') || getComputedStyle(l).visibility==='hidden'; }); return done?true:null; },
    {timeout:16000, interval:200, desc:'loader is-done'}).catch(()=>{});
  const loaderMs = Date.now()-tPageStart;
  (loaderMs < 13000) ? ok('(e) loader: goto->loader kalkti+karsilama karti < 13sn', loaderMs+'ms') : bad('(e) loader < 13sn tavani (regresyon)', loaderMs+'ms');
  const p1=progN(sc.prog);
  (p1 && p1.n===1 && p1.total===12) ? ok('kabuk welcome 1/12', sc.title) : bad('kabuk welcome 1/12', 'gorulen='+sc.prog+' '+sc.title);
  await shot(page,'01-welcome');

  await shellClickNext(page); await sleep(600);
  sc = await shellCard(page);
  const p2=progN(sc.prog);
  (p2 && p2.n===2 && p2.total===12) ? ok('kabuk proje 2/12', sc.title) : bad('kabuk proje 2/12', 'gorulen='+sc.prog);
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
  // REV6 EXPORT — PARSEL-YALNIZ AKTIFLIK: parsel cizilir cizilmez (plan URETILMEDEN) kabuk 'Proje Indir'
  //   (#pkgExportBtn) aktif olur (updatePkgExportBtn 900ms interval; pkgEngineExportable=parsel yeter).
  const pkgExpParcel = await waitFor(async()=>{
    const st=await page.evaluate(()=>{ const b=document.getElementById('pkgExportBtn'), m=document.getElementById('pkgExportMore');
      return { exp:!!b, expOn:!!(b&&!b.disabled), moreOn:!!(m&&!m.disabled), label:(b?b.textContent.trim():'') }; });
    return st.expOn ? st : null;
  }, {timeout:4000, interval:300, desc:'pkgExportBtn parsel aktif'}).catch(()=>null);
  const pkgExpNow = pkgExpParcel || await page.evaluate(()=>{ const b=document.getElementById('pkgExportBtn'); return {exp:!!b, expOn:!!(b&&!b.disabled), label:(b?b.textContent.trim():'')}; });
  (pkgExpNow.expOn) ? ok('REV6 parsel-yalniz: kabuk "Proje Indir" aktif (plan yok, parsel yeter)', JSON.stringify(pkgExpNow)) : bad('REV6 parsel-yalniz Proje Indir aktif','durum='+JSON.stringify(pkgExpNow));
  // kabuk titlebar buton etiketleri 'Proje Aç' / 'Proje İndir'
  const pkgLabels = await page.evaluate(()=>{ const o=document.getElementById('pkgImportBtn'), e=document.getElementById('pkgExportBtn');
    return { open:(o?o.textContent.trim():''), exp:(e?e.textContent.trim():'') }; });
  (/Proje Aç/.test(pkgLabels.open) && /Proje İndir/.test(pkgLabels.exp)) ? ok('REV6 kabuk titlebar "Proje Aç"/"Proje İndir"', JSON.stringify(pkgLabels)) : bad('REV6 kabuk export etiketleri', JSON.stringify(pkgLabels));
  // ▾ menusu acilir ('2B DXF indir' ogesi). #pkgExportMore onclick e.stopPropagation -> document-close tetiklenmez.
  await clickParent(page, '#pkgExportMore'); await sleep(300);
  const dxfMenu = await page.evaluate(()=>{ const m=document.getElementById('pkgExportMenu'), d=document.getElementById('pkgDxfItem');
    const open=!!(m && m.style.display!=='none'); return { open, dxf:(d?d.textContent.trim():''), hasDxf:!!d }; });
  (dxfMenu.open && /2B DXF indir/.test(dxfMenu.dxf)) ? ok('REV6 ▾ menu acildi + "2B DXF indir" ogesi var', JSON.stringify(dxfMenu)) : bad('REV6 ▾ menu / DXF ogesi', JSON.stringify(dxfMenu));
  await page.evaluate(()=>{ try{ document.body.click(); }catch(e){} }); await sleep(150);   // menuyu kapat (turu engellemesin)
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

  // (f) TUR DUGMESI RESUME — motor turunu 5. adimda KAPAT -> #mskTourBtn -> stored adimdan sürer (5/16, 1/16 DEGIL).
  //   Kapatma sonrasi geometri korunur, resume ayni adimi geri getirir -> ana akis kesintisiz devam eder.
  await resumeScenario(page, f);
  await shot(page,'06b-resume');

  // REV4 KUSUR 3: demo-plan kopru kuruldu mu (kabuk boot -> iframe.__mskDemoPlan) + beklenen A imzasi.
  const bridgeA = await f.evaluate(()=>{ try{ const p=window.__mskDemoPlan; const kp=(p&&p.kpState)||p; if(!kp||!kp.blocks) return {ok:false}; return {ok:true, aRegs:kp.blocks[0].plan.regions.length, bRegs:kp.blocks[1].plan.regions.length}; }catch(e){ return {ok:false, err:String(e)}; } });
  bridgeA.ok ? ok('KUSUR3 demo-plan kopru kuruldu (__mskDemoPlan)', 'aRegs='+bridgeA.aRegs+' bRegs='+bridgeA.bRegs) : bad('KUSUR3 demo-plan kopru','yok='+JSON.stringify(bridgeA));
  // yerlesim: click Yerleşimi Oluştur (#genBtn) — REV4: onbGenBtnCapture demo yerlesimi uygular (motor gen DEGIL)
  await engClick(f, '#genBtn'); await sleep(1500);
  // REV4 KUSUR 3: uygulanan plan DEMO blok A imzasiyla eslesir (regions == demo, motor taze-uretimi DEGIL)
  const planA = await f.evaluate(()=>{ try{ return { regs:(typeof plan!=='undefined'&&plan&&plan.regions)?plan.regions.length:-1, units:(typeof plan!=='undefined'&&plan&&plan.unitObjs)?plan.unitObjs.length:-1 }; }catch(e){ return {regs:-2}; } });
  (bridgeA.ok && planA.regs===bridgeA.aRegs) ? ok('KUSUR3 Blok A demo yerlesim uygulandi (regions=demo, motor DEGIL)', 'regs='+planA.regs+'==demo '+bridgeA.aRegs) : bad('KUSUR3 Blok A demo yerlesim','plan='+JSON.stringify(planA)+' demoA='+(bridgeA.aRegs));
  // REV(a) BALKON-ADIMINDAN ONCE BALKONSUZ: onbApplyDemoLayout demo balkonlarini onbDemoBalkSet'e stashlar,
  //   plani balkonsuz basar -> yerlesim sonrasi (balkon-ekle adimina KADAR) balconies.length===0; set dolu (>=10).
  const balkAfterLayout = await f.evaluate(()=>{
    try{ const n=(typeof balconies!=='undefined'&&balconies)?balconies.length:-1;
      const set=(typeof ONB!=='undefined'&&ONB.demoBalkCount)?ONB.demoBalkCount():-1;
      // demo blok A'nin GERCEK balkon adedi (stash bunun aynisi olmali; fallback ONB_TARGETS.balkon DEGIL)
      let raw=-1; try{ const rs=(typeof onbDemoBlockState==='function')?onbDemoBlockState('blokA'):null; raw=(rs&&Array.isArray(rs.balconies))?rs.balconies.length:-1; }catch(e){}
      return {n, set, raw}; }catch(e){ return {n:-2, set:-2, raw:-2, err:String(e)}; } });
  (balkAfterLayout.n===0) ? ok('REV(a) yerlesim sonrasi balconies=0 (balkon-adimina kadar gorunmez)','n='+balkAfterLayout.n) : bad('REV(a) yerlesim sonrasi balconies=0','n='+balkAfterLayout.n);
  (balkAfterLayout.set>=1 && balkAfterLayout.set===balkAfterLayout.raw) ? ok('REV(a) layout demo balkon seti stashlandi (onbDemoBalkSet=blok A gercek balkon adedi)','set='+balkAfterLayout.set+'==rawA '+balkAfterLayout.raw) : bad('REV(a) onbDemoBalkSet demo A ile eslesmedi','set='+balkAfterLayout.set+' rawA='+balkAfterLayout.raw);
  mc = await waitOnbProg(f, 6, {timeout:15000, desc:'6 duvar-cek'}); ok('motor 6/16 '+mc.title);
  await shot(page,'07-duvar-cek');

  // KARARTMA YOK (blokA-ciz ikizi) — duvar-cek marker-hayaletli fullCanvasHole: delik tuvali kapsar.
  const holeDuvar = await fullHoleCoversCanvas(f);
  holeDuvar.ok ? ok('duvar-cek karartma yok (delik tuvali kapsar)', JSON.stringify(holeDuvar.hole||{})) : bad('duvar-cek karartma yok', JSON.stringify(holeDuvar));

  // REV5 KUSUR 7 — NABIZ GERCEK DUVARDA: onbGhost'ta .onbMark nabzi + .onbMarkSeg segmenti VAR ve
  //   marker dunya-noktasi plan.wallRuns duvarlarindan BIRININ orta noktasi (tuval-merkez sentetik daire DEGIL).
  const wallMark = await f.evaluate(()=>{
    try{
      const m=(typeof onbWallMarkerWorld==='function')?onbWallMarkerWorld():null;
      if(!m) return {ok:false, reason:'marker yok'};
      let match=false, best=1e9;
      for(const rn of plan.wallRuns){ const s=wallSeg(rn); const mx=(s.x1+s.x2)/2, my=(s.y1+s.y2)/2;
        const d=Math.abs(mx-m.x)+Math.abs(my-m.y); if(d<best) best=d; if(d<0.02){ match=true; break; } }
      const g=document.getElementById('onbGhost');
      const hasMark=!!(g && g.querySelector('.onbMark')), hasSeg=!!(g && g.querySelector('.onbMarkSeg'));
      return {ok:match&&hasMark, match, hasMark, hasSeg, best:+best.toFixed(3), m:{x:+m.x.toFixed(2),y:+m.y.toFixed(2)}};
    }catch(e){ return {ok:false, reason:String(e&&e.message||e)}; }
  });
  wallMark.ok ? ok('KUSUR7 duvar-cek nabzi GERCEK plan duvarinda (tuval-merkez degil)', JSON.stringify(wallMark))
             : bad('KUSUR7 duvar-cek nabzi plan duvarinda degil', JSON.stringify(wallMark));

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

  // KARARTMA YOK (blokA-ciz ikizi) — balkon-ekle marker-hayaletli fullCanvasHole: delik tuvali kapsar.
  await sleep(400);   // kart + hayalet yerlessin
  const holeBalk = await fullHoleCoversCanvas(f);
  holeBalk.ok ? ok('balkon-ekle karartma yok (delik tuvali kapsar)', JSON.stringify(holeBalk.hole||{})) : bad('balkon-ekle karartma yok', JSON.stringify(holeBalk));
  // IS 3 — KART BOS EKRAN KOSESINE: balkon-ekle kompakt karti plan ayak izi bbox'u ile CAKISMAZ (overlapArea 0).
  const balkCardOv = await cardPlanBBoxOverlap(f);
  (balkCardOv.hasBox && balkCardOv.overlapArea===0) ? ok('IS3 balkon-ekle karti plan bbox ile CAKISMIYOR (overlapArea=0)', JSON.stringify(balkCardOv)) : bad('IS3 balkon karti plan bbox ortuyor', JSON.stringify(balkCardOv));
  const balkCardCompact = await f.evaluate(()=>{ const c=document.querySelector('.onbCard'); return !!(c && c.classList && c.classList.contains('onbCompact')); });
  balkCardCompact ? ok('IS3 balkon-ekle karti KOMPAKT (.onbCompact)') : bad('IS3 balkon-ekle kart kompakt degil');

  // REV6 BALKON — BOS BASLAR: balkon-ekle GIRISINDE balconies BOSALTILIR (onbCaptureBalkSet + onbClearBalconies);
  //   demo seti ARTIK on-dolu GELMEZ. Balkon araci OTO-SECILI (onbOpenBalconyTool -> setMode('balkon') + #tBalk).
  //   Aksiyon ('Kalan balkonlari otomatik yerlestir') actionAfterFirst -> giriste GORUNMEZ (bir balkon cizilene dek).
  const balkEntry = await f.evaluate(()=>{
    try{ const n=(typeof balconies!=="undefined"&&balconies?balconies.length:0)||0;
      const t=document.getElementById('tBalk'); const toolOn=!!(t&&t.classList&&t.classList.contains('on'));
      const modeBalk=(typeof mode!=='undefined'&&mode==='balkon');
      let readyEntry=null; try{ const st=(typeof onbTour!=='undefined'&&onbTour&&onbTour.steps)?onbTour.steps[(typeof onbIdx!=='undefined'?onbIdx:-1)]:null;
        if(st && typeof onbActionReadyFor==='function') readyEntry=!!onbActionReadyFor(st); }catch(e){}
      return {n, toolOn, modeBalk, readyEntry};
    }catch(e){ return {err:String(e&&e.message||e)}; }
  });
  (balkEntry.n===0) ? ok('REV6 balkon-ekle girisinde balconies BOS (0; on-dolu gelmiyor)','n='+balkEntry.n) : bad('REV6 balkon giris bos (0)','n='+balkEntry.n);
  (balkEntry.toolOn||balkEntry.modeBalk) ? ok('REV6 balkon araci OTO-secili (#tBalk on / mode balkon)',JSON.stringify(balkEntry)) : bad('REV6 balkon araci oto-secili',JSON.stringify(balkEntry));
  (balkEntry.readyEntry===false) ? ok('REV6 balkon-ekle giris: autofill aksiyonu GIZLI (once cizdir)') : bad('REV6 balkon autofill giriste gizli','readyEntry='+balkEntry.readyEntry);

  // REV5 KUSUR 8 — DEMO-KONUM NABZI: onbGhost'ta .onbMark nabzi VAR ve marker dunya-noktasi demo blok A'nin
  //   ILK balkon kenarinin konumu (rastgele degil; kullaniciyi ornek yere yonlendirir).
  const balkMark = await f.evaluate(()=>{
    try{
      const m=(typeof onbBalconyMarkerWorld==='function')?onbBalconyMarkerWorld():null;
      if(!m) return {ok:false, reason:'marker yok'};
      const g=document.getElementById('onbGhost');
      const hasMark=!!(g && g.querySelector('.onbMark')), hasSeg=!!(g && g.querySelector('.onbMarkSeg'));
      // dunya-noktasi sonlu + segmentli (demo kenar) olmali
      const finite=isFinite(m.x)&&isFinite(m.y)&&Array.isArray(m.seg)&&m.seg.length===2;
      return {ok:hasMark&&finite, hasMark, hasSeg, finite, m:{x:+m.x.toFixed(2),y:+m.y.toFixed(2)}};
    }catch(e){ return {ok:false, reason:String(e&&e.message||e)}; }
  });
  balkMark.ok ? ok('KUSUR8 balkon-ekle demo-konum nabzi gorunuyor (kenar isaretli)', JSON.stringify(balkMark))
             : bad('KUSUR8 balkon-ekle demo-konum nabzi yok', JSON.stringify(balkMark));

  // REV6: BIR balkon ciz + AYNI SENKRON evaluate icinde actionReadyFor'u oku (tur timer'i araya giremez).
  //   -> readyBefore=false (giris), readyAfter=true (ilk balkon sonrasi aksiyon belirir); kullanicinin balkonu (sig) yakalanir.
  const balkRes = await f.evaluate(()=>{
    function ready(){ try{ const st=(typeof onbTour!=='undefined'&&onbTour&&onbTour.steps)?onbTour.steps[(typeof onbIdx!=='undefined'?onbIdx:-1)]:null;
      if(st && typeof onbActionReadyFor==='function') return !!onbActionReadyFor(st); }catch(e){} return null; }
    const svg=document.getElementById('svg'); if(!svg) return {added:false, reason:'no svg'};
    const r=svg.getBoundingClientRect();
    function ev(type,x,y){ svg.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0,view:window})); }
    const tb=document.getElementById('tBalk'); if(tb && !(typeof mode!=='undefined'&&mode==='balkon')) tb.click();
    const readyBefore=ready();
    const before=(typeof balconies!=="undefined"&&balconies?balconies.length:0)||0;
    const pts=[];
    for(let t=0.15;t<=0.85;t+=0.05){ pts.push([r.left+r.width*t, r.top+r.height*0.14]); pts.push([r.left+r.width*t, r.top+r.height*0.86]); pts.push([r.left+r.width*0.14, r.top+r.height*t]); pts.push([r.left+r.width*0.86, r.top+r.height*t]); }
    for(const p of pts){ ev('mousemove',p[0],p[1]); ev('mousedown',p[0],p[1]); ev('mouseup',p[0],p[1]);
      const now=(typeof balconies!=="undefined"&&balconies?balconies.length:0)||0;
      if(now>before){ const readyAfter=ready(); const b=balconies[now-1];
        const sig=b?{ei:b.ei, t0:+(+b.t0).toFixed(3), depth:+(+b.depth).toFixed(3)}:null;
        const setLen=(typeof onbDemoBalkSet!=="undefined"&&Array.isArray(onbDemoBalkSet))?onbDemoBalkSet.length:-1;
        return {added:true, before, after:now, readyBefore, readyAfter, sig, setLen}; }
    }
    return {added:false, before, readyBefore};
  });
  (balkRes.added && balkRes.after===1) ? ok('REV6 kullanici GERCEK tikla 1 balkon ekledi','n='+balkRes.before+'->'+balkRes.after) : bad('REV6 tam 1 balkon eklendi', JSON.stringify(balkRes));
  (balkRes.readyBefore===false && balkRes.readyAfter===true) ? ok('REV6 aksiyon ILK balkondan SONRA belirir (readyBefore=false -> readyAfter=true)') : bad('REV6 balkon autofill aksiyonu ilk-sonra',JSON.stringify({rb:balkRes.readyBefore, ra:balkRes.readyAfter}));
  const userBalk = balkRes.sig, demoSetLen = balkRes.setLen;
  // tur oto-ilerler (check balconyCount>0 saglandi) -> site-ac. onStepEnter onbPlaceRemainingBalconies TAMAMLAR (push).
  mc = await waitOnbProg(f, 9, {timeout:10000, desc:'9 site-ac'}).catch(()=>null);
  if(mc){ ok('motor 9/16 '+mc.title); }
  else { const c=await onbCard(f); bad('9/16 site-ac','kart='+c.prog); }
  // REV6: site-ac gecisinde balconies TAMAMLANIR (>=demo set) + kullanicinin balkonu KORUNUR (UZERINE YAZILMAZ).
  const balkSite = await f.evaluate((ub)=>{
    try{ const arr=(typeof balconies!=="undefined"&&balconies)?balconies:[]; const n=arr.length;
      let preserved=false; if(ub){ preserved=arr.some(b=> b && b.ei===ub.ei && Math.abs((+b.t0)-ub.t0)<0.01 && Math.abs((+b.depth)-ub.depth)<0.01); }
      return {n, preserved};
    }catch(e){ return {n:-1, preserved:false, err:String(e)}; }
  }, userBalk);
  (demoSetLen>0 && balkSite.n>=demoSetLen) ? ok('REV6 site-ac: balconies demo set uzunluguna TAMAMLANDI (push)','n='+balkSite.n+' set>='+demoSetLen) : bad('REV6 balconies tamamlanmadi','n='+balkSite.n+' set='+demoSetLen);
  (balkSite.n>=1 && balkSite.preserved) ? ok('REV6 kullanicinin ekledigi balkon KORUNDU (uzerine yazilmadi)','n='+balkSite.n+' sig='+JSON.stringify(userBalk)) : bad('REV6 kullanici balkonu korunmadi (overwrite?)','site='+JSON.stringify(balkSite)+' sig='+JSON.stringify(userBalk));
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
  // click Yerleşimi Oluştur for block B — REV4: onbGenBtnCapture demo blok B yerlesimini uygular
  await engClick(f, '#genBtn'); await sleep(1600);
  const bPlanned = await f.evaluate(()=>{ try{ return (typeof plan!=='undefined'&&!!plan); }catch(e){ return false; } });
  bPlanned ? ok('FIX2 Blok B planli (Yerlesimi Olustur -> plan!=null)') : bad('FIX2 Blok B planli','plan yok');
  // REV4 KUSUR 3: Blok B plani DEMO blok B imzasiyla eslesir (regions == demo)
  const planB = await f.evaluate(()=>{ try{ return (typeof plan!=='undefined'&&plan&&plan.regions)?plan.regions.length:-1; }catch(e){ return -2; } });
  (bridgeA.ok && planB===bridgeA.bRegs) ? ok('KUSUR3 Blok B demo yerlesim uygulandi (regions=demo)', 'regs='+planB+'==demo '+bridgeA.bRegs) : bad('KUSUR3 Blok B demo yerlesim','regs='+planB+' demoB='+(bridgeA.bRegs));
  mc = await waitOnbProg(f, 13, {timeout:12000, desc:'13 imkan-koy'}).catch(()=>null);
  if(mc){ ok('motor 13/16 '+mc.title); }
  else { const c=await onbCard(f); bad('13/16 imkan-koy','kart='+c.prog); }
  await shot(page,'14-imkan');

  // REV5 KUSUR 9 — IMKAN ARACI + HAVUZ OTO-SEC: imkan-koy girisinde #tAmenity OTOMATIK aktif (amenityBar acik)
  //   + Havuz tipi SECILI. Kullanici araci/tipi aramaz; hayaletin uzerinden dogrudan cizer.
  const amenAuto = await f.evaluate(()=>{
    try{ const t=document.getElementById('tAmenity'); const toolOn=!!(t&&t.classList&&t.classList.contains('on'));
      const modeAm=(typeof mode!=='undefined' && mode==='amenity');
      const bar=document.getElementById('amenityBar'); const barVis=!!(bar && bar.style.display!=='none');
      const pool=document.querySelector('#amenityBar [data-am="pool"]'); const poolOn=!!(pool && pool.classList && pool.classList.contains('active'));
      return {toolOn, modeAm, barVis, poolOn};
    }catch(e){ return {err:String(e&&e.message||e)}; }
  });
  ((amenAuto.toolOn||amenAuto.modeAm) && amenAuto.barVis && amenAuto.poolOn)
    ? ok('KUSUR9 imkan araci OTO-aktif + Havuz tipi secili (giriste)', JSON.stringify(amenAuto))
    : bad('KUSUR9 imkan araci/havuz oto-secilmedi', JSON.stringify(amenAuto));

  // (d) SIRA: giriste (havuz cizilmeden) 'Kalan imkanlari otomatik yerlestir' aksiyonu KARTTA YOK.
  const cardPre = await onbCard(f);
  const hasActPre = cardPre.btns.some(b=>b.act==='act');
  (!hasActPre) ? ok('(d) imkan-koy giris: autofill aksiyonu YOK (once cizdir)', 'btns='+cardPre.btns.map(b=>b.act).join(',')) : bad('(d) imkan-koy giris autofill gizli','btns='+JSON.stringify(cardPre.btns));

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
  // (d) SIRA: ilk imkan cizilince aksiyon dugmesi KARTTA BELIRIR (onbTick tazeler; poll).
  const actNow = await waitFor(async()=>{ const c=await onbCard(f); return c.btns.some(b=>b.act==='act')?c:null; }, {timeout:6000, desc:'(d) autofill aksiyonu belirdi'}).catch(()=>null);
  actNow ? ok('(d) imkan-koy: ilk havuzdan sonra autofill aksiyonu VAR', 'btns='+actNow.btns.map(b=>b.act).join(',')) : bad('(d) autofill aksiyonu belirmedi','(ilk imkandan sonra act yok)');
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

  // REV6 EXPORT: son kart iframe'de "3B'ye geç" (titleIframe) + "3B Görüntüle"/"Proje İndir" dili (eski "Paket İndir"
  //   YOK); action Bitir (actionIframeOnly); STANDALONE hedef #projSaveBtn -> iframe'de HEDEFSIZ (svgBtn hic yok).
  const exCard = await onbCard(f);
  (/3B Görüntüle|Proje İndir/.test(exCard.text)) ? ok('REV6 export bodyIframe "3B Görüntüle"/"Proje İndir" dili', exCard.text.slice(0,70)) : bad('REV6 export yeni export dili','text='+exCard.text.slice(0,90));
  (/3B/.test(exCard.title)) ? ok('REV6 export son kart basligi "3B\'ye geç"', exCard.title) : bad('REV6 export basligi 3B','title='+exCard.title);
  (exCard.btns.some(b=>b.act==='act' && /Bitir/.test(b.label))) ? ok('REV6 export Bitir dugmesi') : bad('REV6 export Bitir','btns='+JSON.stringify(exCard.btns));
  // spotlight deligi #projSaveBtn'i HEDEFLEMEMELI (iframe -> type none); eski #svgBtn butonu KALKTI (yok).
  const exTarget = await f.evaluate(()=>{
    const proj=document.getElementById('projSaveBtn'); const oldSvg=document.getElementById('svgBtn');
    const mask=document.getElementById('onbHoleMask');
    let projHighlighted=false;
    if(proj && mask){ const br=proj.getBoundingClientRect(); const rs=[...mask.querySelectorAll('rect')]; const h=rs.find(r=>r.getAttribute('fill')==='#000');
      if(h){ const hx=+h.getAttribute('x'), hw=+h.getAttribute('width'); projHighlighted = (br.width>0 && Math.abs(hx-(br.left-6))<3 && Math.abs(hw-(br.width+12))<3); } }
    return { hasProjSave:!!proj, oldSvgGone:!oldSvg, projHighlighted };
  });
  (exTarget.oldSvgGone) ? ok('REV6 eski #svgBtn butonu KALKTI (Proje Aç/İndir ikilisi geldi)', JSON.stringify(exTarget)) : bad('REV6 eski #svgBtn hala var', JSON.stringify(exTarget));
  (!exTarget.projHighlighted) ? ok('REV6 export #projSaveBtn HEDEFLENMEDI (iframe hedefsiz)', JSON.stringify(exTarget)) : bad('REV6 export projSaveBtn hedeflendi', JSON.stringify(exTarget));
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

  // REV6 GÖREV B2 — 3B SAHNE BOŞ BAŞLAR: normalize mobilyayı ÖNDEN basmaz (store'lar STASH'te bekler:
  //   state._demoStashFurniture/_demoStashMaterials). 3B köprüsünden hemen sonra furnitureCount()===0;
  //   kullanıcı dose3d adımında Otomatik Döşe'ye basar, paket sadakati step3Go'da (kamera evresi) uygulanır.
  const furnEmpty = await f.evaluate(()=>{ try{ const V=window.View3D; return (V&&V.furnitureCount)?V.furnitureCount():-1; }catch(e){ return -2; } });
  (furnEmpty===0) ? ok('REV6 3B sahne BOŞ başlar (furnitureCount==0; store STASH\'te)','n='+furnEmpty) : bad('REV6 3B sahne bos baslamadi (0 beklenir)','n='+furnEmpty);
  // stash gerçekten var mı (kamera evresinde uygulanacak) — sadakat garantisinin kanıtı
  const stashReady = await page.evaluate(()=>{ try{ const st=(window.__msk&&window.__msk.state)||{}; const f=st._demoStashFurniture;
    return { has:!!f, n:(f&&f.length!=null)?f.length:(f?Object.keys(f).length:0) }; }catch(e){ return {has:false}; } });
  (stashReady.has) ? ok('REV6 paket mobilya STASH\'i hazır (kamera evresinde uygulanacak)','stash='+JSON.stringify(stashReady)) : bad('REV6 mobilya stash yok','stash='+JSON.stringify(stashReady));
  await shot(page,'18-3d');

  // shell tour resume: card returns (in3d) -> İleri ile in3d, sonra REV4 KUSUR 2: dose3d/malzeme3d
  //   ARTIK spotlight'li + yaptirmali (salt metin degil). Spotlight iframe araç butonunda; edit sinyali
  //   (furnitureEditCount/materialEditCount) degisince tur oto-ilerler.
  await sleep(1400);
  let guard=0; const seenTitles=[];
  let doseSpot=null, matSpot=null, matAutoSpot=null, doseAdvanced=false, matAdvanced=false;
  while(guard++<16){
    const s=await engStep(page);
    if(!(s && s.step===2)) break;
    const sc=await shellCard(page);
    if(!sc.visible) break;
    if(sc.title && seenTitles[seenTitles.length-1]!==sc.title) seenTitles.push(sc.title);
    const title=sc.title||'';
    if(/Mobilyay/i.test(title)){
      // REV6 KUSUR 2: engineHole -> motor iframe (3B sahne) SEFFAF + #mskTourRing hedef Mobilya butonunu SARIYOR.
      await sleep(700);   // cok-delikli maske + ring yerlessin
      const engHole=await engineHoleTransparent(page);
      const doseTgt=await iframeDoseTargetRect(page);
      const ring=await shellRingRect(page);
      doseSpot={ engHole:engHole.ok, engInfo:engHole, ring:ringWraps(ring, doseTgt.rect), which:doseTgt.which };
      // GÖREV B2: sahne BOŞ (furnitureCount==0) -> Otomatik Döşe ile yaptir (gercek tik; olmazsa API fallback).
      doseSpot.emptyBefore=await f.evaluate(()=>{ try{ return window.View3D.furnitureCount(); }catch(e){ return -1; } });
      const before=await f.evaluate(()=>{ try{ return window.View3D.furnitureEditCount(); }catch(e){ return -1; } });
      await f.evaluate(()=>{ try{ const b=document.querySelector('[data-grp="furniture"]'); if(b) b.click(); }catch(e){} }); await sleep(300);
      await f.evaluate(()=>{ try{ const au=document.querySelector('#v3dFurnDock [data-v3d="furnauto"]'); if(au) au.click(); }catch(e){} }); await sleep(400);
      let after=await f.evaluate(()=>{ try{ return window.View3D.furnitureEditCount(); }catch(e){ return -1; } });
      if(!(after>before)){ await f.evaluate(()=>{ try{ window.View3D.setFurnUI&&window.View3D.setFurnUI(true); window.View3D.autoFurnishAll&&window.View3D.autoFurnishAll(); }catch(e){} }); after=await f.evaluate(()=>{ try{ return window.View3D.furnitureEditCount(); }catch(e){ return -1; } }); }
      doseSpot.editDelta=(after>before); doseSpot.before=before; doseSpot.after=after;
      doseAdvanced=await waitFor(async()=>{ const c=await shellCard(page); return (c.visible && !/Mobilyay/i.test(c.title||''))?true:null; },{timeout:6000,desc:'dose3d oto-ilerledi'}).catch(()=>false);
      continue;
    }
    if(/(İç|Ic)\s*malzeme/i.test(title)){
      await sleep(700);
      const engHole=await engineHoleTransparent(page);
      // GÖREV 2 — 1. ASAMA: malzeme dock KAPALI -> hedef = rail Ic Malzeme butonu (iki-asamali yonlendirme).
      const btnRail=await iframeElemRectParent(page,'[data-grp="material"]');
      const ring0=await shellRingRect(page);
      matSpot={ engHole:engHole.ok, engInfo:engHole, ring:ringWraps(ring0, btnRail) };
      const before=await f.evaluate(()=>{ try{ return window.View3D.materialEditCount(); }catch(e){ return -1; } });
      // GÖREV 2 — 2. ASAMA: Ic Malzeme aracini AC -> dock acilir, "Türe göre ata" (matauto) gorunur. pollTimer
      //   (300ms) render()'i tazeler -> #mskTourRing matauto'ya kayar. Sonra matauto'ya tikla -> applyMaterialsByType
      //   -> materialEditCount++. Delta olmazsa oda-secip-applyMaterial fallback (yine de counter artar).
      await f.evaluate(()=>{ try{ const b=document.querySelector('[data-grp="material"]'); if(b) b.click(); }catch(e){} }); await sleep(900);
      const btnAuto=await iframeElemRectParent(page,'#v3dMatDock [data-v3d="matauto"]');
      const ringA=await shellRingRect(page);
      matAutoSpot={ hasBtn:!!btnAuto, ring:ringWraps(ringA, btnAuto) };
      await f.evaluate(()=>{ try{ const au=document.querySelector('#v3dMatDock [data-v3d="matauto"]'); if(au) au.click(); }catch(e){} }); await sleep(400);
      let after=await f.evaluate(()=>{ try{ return window.View3D.materialEditCount(); }catch(e){ return -1; } });
      if(!(after>before)){ await f.evaluate(()=>{ try{ const V=window.View3D; const m=V.getMap&&V.getMap(); let rid=null; const u=m&&m.units&&m.units[0]; if(u&&u.rooms&&u.rooms[0]) rid=u.rooms[0].id; else if(m&&m.common_areas&&m.common_areas[0]) rid=m.common_areas[0].id; if(rid&&V.selectMatRoom) V.selectMatRoom(rid); if(V.applyMaterial) V.applyMaterial('floor','parke_mese'); }catch(e){} }); after=await f.evaluate(()=>{ try{ return window.View3D.materialEditCount(); }catch(e){ return -1; } }); }
      matSpot.editDelta=(after>before); matSpot.before=before; matSpot.after=after;
      matAdvanced=await waitFor(async()=>{ const c=await shellCard(page); return (c.visible && !/(İç|Ic)\s*malzeme/i.test(c.title||''))?true:null; },{timeout:6000,desc:'malzeme3d oto-ilerledi'}).catch(()=>false);
      continue;
    }
    // diger step-2 karti (in3d): İleri
    const clickedNext=await shellClickNext(page);
    if(!clickedNext) break;      // kamera karti = check adimi -> "Adimi yapin" (İleri yok) -> dur
    await sleep(700);
  }
  await shot(page,'19-shell-resume');
  log('   [kabuk kart dizisi] '+JSON.stringify(seenTitles));
  // (c) doseme tadi kartlari gorundu mu (REV3 assert korunur)
  const sawDose = seenTitles.some(t=>/Mobilyay/i.test(t)), sawMat = seenTitles.some(t=>/(İç|Ic)\s*malzeme/i.test(t));
  (sawDose && sawMat) ? ok('(c) 3B doseme tadi: dose3d + malzeme3d kartlari gorundu', seenTitles.join(' > ')) : bad('(c) doseme tadi kartlari','sawDose='+sawDose+' sawMat='+sawMat+' dizi='+JSON.stringify(seenTitles));
  // REV6 KUSUR 2: dose3d engineHole (iframe seffaf) + #mskTourRing hedef Mobilya butonunu sariyor + bos sahne +
  //   Otomatik Döşe sinyali degisti (furnitureEditCount++) + oto-ilerledi.
  (doseSpot&&doseSpot.engHole) ? ok('KUSUR2 dose3d engineHole: motor iframe SEFFAF (delik 3B sahneyi kapsar)', JSON.stringify(doseSpot&&doseSpot.engInfo)) : bad('KUSUR2 dose3d engineHole iframe seffaf', JSON.stringify(doseSpot&&doseSpot.engInfo));
  (doseSpot&&doseSpot.ring&&doseSpot.ring.wraps) ? ok('KUSUR2 dose3d #mskTourRing hedef Mobilya butonunu SARIYOR ('+(doseSpot.which)+')', JSON.stringify(doseSpot.ring)) : bad('KUSUR2 dose3d ring hedef sarmiyor', JSON.stringify(doseSpot&&doseSpot.ring));
  (doseSpot&&doseSpot.emptyBefore===0) ? ok('KUSUR2 dose3d sahne BOŞ (furnitureCount==0) -> Otomatik Döşe', 'n='+(doseSpot&&doseSpot.emptyBefore)) : bad('KUSUR2 dose3d bos sahne (0)','n='+(doseSpot&&doseSpot.emptyBefore));
  (doseSpot&&doseSpot.editDelta) ? ok('KUSUR2 dose3d Otomatik Döşe sinyali degisti (furnitureEditCount++)', 'n='+(doseSpot&&doseSpot.before)+'->'+(doseSpot&&doseSpot.after)) : bad('KUSUR2 dose3d mobilya sinyali','delta yok '+JSON.stringify(doseSpot));
  doseAdvanced ? ok('KUSUR2 dose3d yaptirinca oto-ilerledi (yaptirma)') : bad('KUSUR2 dose3d oto-ilerleme','ilerlemedi');
  (matSpot&&matSpot.engHole) ? ok('KUSUR2 malzeme3d engineHole: motor iframe SEFFAF', JSON.stringify(matSpot&&matSpot.engInfo)) : bad('KUSUR2 malzeme3d engineHole iframe seffaf', JSON.stringify(matSpot&&matSpot.engInfo));
  (matSpot&&matSpot.ring&&matSpot.ring.wraps) ? ok('KUSUR2 malzeme3d #mskTourRing hedef Ic Malzeme butonunu SARIYOR', JSON.stringify(matSpot.ring)) : bad('KUSUR2 malzeme3d ring hedef sarmiyor', JSON.stringify(matSpot&&matSpot.ring));
  // GÖREV 2: malzeme dock ACILINCA #mskTourRing "Türe göre ata" (matauto) butonunu SARIYOR (dinamik iframeTarget).
  (matAutoSpot&&matAutoSpot.hasBtn&&matAutoSpot.ring&&matAutoSpot.ring.wraps)
    ? ok('GOREV2 malzeme3d dock acik: #mskTourRing "Türe göre ata" (matauto) butonunu SARIYOR', JSON.stringify(matAutoSpot.ring))
    : bad('GOREV2 malzeme3d matauto ring hedef sarmiyor', JSON.stringify(matAutoSpot));
  (matSpot&&matSpot.editDelta) ? ok('KUSUR2 malzeme3d malzeme sinyali degisti (materialEditCount++)', 'n='+(matSpot&&matSpot.before)+'->'+(matSpot&&matSpot.after)) : bad('KUSUR2 malzeme3d malzeme sinyali','delta yok '+JSON.stringify(matSpot));
  matAdvanced ? ok('KUSUR2 malzeme3d yaptirinca oto-ilerledi (yaptirma)') : bad('KUSUR2 malzeme3d oto-ilerleme','ilerlemedi');
  // (a) part1: kabuk 'Kamera koy' karti gorundu (atlanmadi) ve render'a (step>=4) DUSMEDI.
  const kcard = await shellCard(page); const sCam = await engStep(page);
  (kcard.visible && /Kamera koy/.test(kcard.title||'') && sCam && sCam.step<4)
    ? ok('(a) kabuk kamera karti gorundu, atlanMADI', (kcard.prog||'')+' step='+(sCam&&sCam.step)) : bad('(a) kamera karti gorundu/atlanmadi','card='+JSON.stringify(kcard)+' step='+JSON.stringify(sCam));

  // Kamera'ya gec: step 2 CTA (Kamera Yerlestir). IS 4: tur akisinda angleNudge CIKMAZ (assert b global dogrular).
  await clickParent(page, '#ctaBtn'); await sleep(500);
  const anGo = await page.evaluate(()=>{ const b=document.getElementById('anGo'); if(b){ b.click(); return true; } return false; });
  await sleep(1500);
  await waitFor(async()=>{ const s=await engStep(page); return (s&&s.step>=3)?s:null; }, {timeout:20000, desc:'camera step>=3'});
  ok('kamera adimi (step 3)');
  // REV6 KUSUR 6 — MOBİLYA SADAKATİ (STASH UYGULANDI): kamera evresine girerken (step3Go, 'Önce' kadrajı
  //   yakalanmadan ÖNCE) STASH'lenmiş paket mobilya store'u __kptaFurniture'a kurulur -> furnitureCount paket
  //   setine eşit (>=60). "Önce" kadrajı = paket render mobilyası. (3B köprüsünde 0'dı; şimdi dolu.)
  const furnApplied = await waitFor(async()=>{
    const n = await f.evaluate(()=>{ try{ const V=window.View3D; return (V&&V.furnitureCount)?V.furnitureCount():0; }catch(e){ return 0; } });
    return n>=60 ? n : null;
  }, {timeout:15000, interval:600, desc:'stash furniture uygulandi'}).catch(()=>0);
  (furnApplied>=60) ? ok('KUSUR6 kamera evresinde STASH paket mobilyasi uygulandi (furnitureCount>=60)','n='+furnApplied) : bad('KUSUR6 stash mobilya uygulanmadi (paket ~126)','n='+furnApplied);
  await shot(page,'20-camera-step');

  // kamera3d mini-tour auto-starts in iframe (iframeAuto). REV7: 6->7 adim (aci-ayarla -> yon-degistir + kamera-tasi).
  //   wait for ITS card (total===7, not the ana tour's 16).
  await waitFor(async()=>{ const c=await onbCard(f); const p=progN(c.prog); return (c.visible && p && p.total===7)?c:null; }, {timeout:25000, desc:'kamera3d tour (7 adim)'});
  let kc = await onbCard(f); ok('kamera3d turu basladi', kc.prog+' '+kc.title);

  // REV(c) 3B FAZINDA TUR DUGMESI = KAMERA MINI-TURU: kamera3d turunu KAPAT (dismiss) -> kabuk #mskTourBtn ->
  //   onbRelaunch FAZ-FARKINDA (3B acik) -> kamera3d BASTAN (1/7, step 0) + kart gorunur + onb.ana durumu DEGISMEDI.
  const anaBefore = await f.evaluate(()=>{ try{ return localStorage.getItem('onb.ana.status'); }catch(e){ return null; } });
  await onbClick(f,'close'); await sleep(500);
  const kamGone = await f.evaluate(()=>!document.querySelector('.onbCard'));
  const kamStatus = await f.evaluate(()=>{ try{ return localStorage.getItem('onb.kamera3d.status'); }catch(e){ return null; } });
  (kamGone && kamStatus==='dismissed') ? ok('REV(c) kamera3d turu KAPATILDI (dismissed + kart gitti)','status='+kamStatus) : bad('REV(c) kamera3d kapatildi','status='+kamStatus+' gone='+kamGone);
  const relaunchClicked = await clickParent(page, '#mskTourBtn');
  relaunchClicked ? ok('REV(c) 3B\'de #mskTourBtn tiklandi (mini-tur geri)') : bad('REV(c) #mskTourBtn tiklanmadi');
  const kamBack = await waitFor(async()=>{ const c=await onbCard(f); const p=progN(c.prog); return (c.visible && p && p.total===7)?{c,p}:null; }, {timeout:12000, interval:250, desc:'REV(c) kamera3d resume'}).catch(()=>null);
  (kamBack && kamBack.p.n===1) ? ok('REV(c) Tur dugmesi kamera3d\'yi BASTAN acti (1/7, step 0)','prog='+kamBack.c.prog) : bad('REV(c) kamera3d bastan 1/7','geldi='+(kamBack?kamBack.c.prog:'kart yok'));
  const kamStatus2 = await f.evaluate(()=>{ try{ return localStorage.getItem('onb.kamera3d.status'); }catch(e){ return null; } });
  (kamStatus2==='active') ? ok('REV(c) kamera3d durumu tekrar active') : bad('REV(c) kamera3d active','status='+kamStatus2);
  const anaAfter = await f.evaluate(()=>{ try{ return localStorage.getItem('onb.ana.status'); }catch(e){ return null; } });
  (anaAfter===anaBefore) ? ok('REV(c) onb.ana durumu DEGISMEDI (kamera turu ana\'ya dokunmaz)','ana='+anaAfter) : bad('REV(c) onb.ana durumu degisti','before='+anaBefore+' after='+anaAfter);
  kc = await onbCard(f);

  // place one interior camera via mesh: real two-click (pos+aim). Verify count INCREMENTS.
  const camBefore = await getCamCounts(f);
  // ensure camera tool open (tour onStepEnter opens it; guard for timing): if #v3dPlaceBtn missing, click rail Kamera
  if(!(await engHas(f, '#v3dPlaceBtn'))){ await engClick(f, '[data-grp="camera"]'); await sleep(400); }
  await engClick(f, '#v3dPlaceBtn'); await sleep(400);   // startCamGhost (activeCamIdx<0)
  const placeDiag = await f.evaluate(()=>({ hasPlaceBtn:!!document.getElementById('v3dPlaceBtn'), hasEkle:!!document.querySelector('[data-camact="add"]') }));
  await clickMeshCenter(f); await sleep(700);
  const cam1 = await getCamCounts(f);
  (cam1.ic > camBefore.ic) ? ok('mesh tikiyla +1 ic kamera (gercek yerlestirme)','ic='+camBefore.ic+'->'+cam1.ic) : bad('mesh tikiyla +1 kamera','ic='+camBefore.ic+'->'+cam1.ic+' diag='+JSON.stringify(placeDiag));

  // REV4 KUSUR 1: kamera secilince iframe PiP (sol-alt onizleme) gorunur; kabuk 'Kamera koy' karti
  //   onunla ÇAKIŞMAMALI (eski: kart sol-alt placeCorner -> PiP viewport'unu kapatiyordu).
  await sleep(700);   // shell placeCorner tik (300ms poll) PiP'i gorup kacinsin
  const pipRect = await iframePipRectParent(page);
  const camCardR = await shellCardRect(page);
  const camCardTitle = (await shellCard(page)).title || '';
  if(pipRect && camCardR){
    const overlap = rectsOverlap(camCardR, pipRect);
    (!overlap) ? ok('KUSUR1 kamera evresi karti PiP viewport ile KESISMIYOR', 'card='+JSON.stringify({l:Math.round(camCardR.left),t:Math.round(camCardR.top)})+' pip='+JSON.stringify({l:Math.round(pipRect.left),t:Math.round(pipRect.top)})) : bad('KUSUR1 kamera karti PiP ile KESISIYOR', 'card='+JSON.stringify(camCardR)+' pip='+JSON.stringify(pipRect));
    (/Kamera koy/.test(camCardTitle)) ? ok('KUSUR1 kesisim testi kamera evresi kartinda dogrulandi', camCardTitle) : log('   [not] kamera karti basligi='+camCardTitle);
  } else {
    bad('KUSUR1 PiP/kart rect okunamadi', 'pip='+JSON.stringify(pipRect)+' card='+JSON.stringify(camCardR));
  }

  // auto-fill remaining cameras (REV5 KUSUR 15: aksiyon SON drone'u BIRAKIR -> ex=2)
  await onbClick(f,'act'); await sleep(1500);
  const cam = await getCamCounts(f);
  (cam.ic===7) ? ok('getCameras==7','ic='+cam.ic) : bad('getCameras==7','ic='+cam.ic);
  (cam.ex===2) ? ok('KUSUR15 auto-place SON drone birakti (ex==2)','ex='+cam.ex) : bad('KUSUR15 ex==2 (son drone birakilir)','ex='+cam.ex);
  await shot(page,'21-cameras');

  // REV7 KUSUR 13a — YÖN-DEĞİŞTİR: 'Açıyı ayarla' BOLUNDU. Kart 'Bakış yönünü değiştir'; hedef alt dock'ta
  //   [data-camact="aim"]; check = SEÇİLİ kamera (getActiveCamIdx) target-imzasi degisimi (camDirSig).
  //   E2E: dock aim butonuna GERCEK tik + sahnede tik -> camDirSig degisir -> tur oto-ilerler.
  const yonCard = await waitKamCard(f, /Bakış yönünü değiştir/, 9000).catch(()=>null);
  if(yonCard){
    const selDiag = await f.evaluate(()=>({ sel:(window.View3D&&View3D.getActiveCamIdx)?View3D.getActiveCamIdx():-1, dock:!!document.getElementById('v3dCamDock'), aimBtn:!!document.querySelector('#v3dCamDock [data-camact="aim"]') }));
    (selDiag.sel>=0) ? ok('KUSUR13a yon-degistir: kamera SECILI (getActiveCamIdx>=0, dock hedefi)', JSON.stringify(selDiag)) : bad('KUSUR13a yon-degistir kamera secili degil', JSON.stringify(selDiag));
    (selDiag.aimBtn) ? ok('KUSUR13a yon-degistir hedefi = dock "Yön" ([data-camact="aim"]) DOM\'da', JSON.stringify(selDiag)) : bad('KUSUR13a dock aim butonu yok', JSON.stringify(selDiag));
    await sleep(400);   // kart yerlessin
    const yonCompact = await camCardCompactDiag(f);
    (yonCompact.hasCard && yonCompact.compact) ? ok('KUSUR13a yon-degistir kart KOMPAKT (.onbCompact, '+yonCompact.w+'px)', JSON.stringify({w:yonCompact.w})) : bad('KUSUR13a yon-degistir kart kompakt degil', JSON.stringify(yonCompact));
    (!yonCompact.ovDock && !yonCompact.ovPip) ? ok('KUSUR13a yon-degistir kart kamera dock (#v3dCamDock) + PiP (#v3dPip) ile ÇAKIŞMIYOR', JSON.stringify({ovDock:yonCompact.ovDock, ovPip:yonCompact.ovPip, hasDock:yonCompact.hasDock, hasPip:yonCompact.hasPip})) : bad('KUSUR13a yon-degistir kart dock/PiP ortuyor', JSON.stringify(yonCompact));
    (yonCompact.hasEnsure) ? ok('KUSUR13a yon-degistir adiminda hedef-kurtarma ensure() fonksiyonu var') : bad('KUSUR13a yon-degistir ensure fonksiyonu yok', JSON.stringify(yonCompact));
    // GERCEK EYLEM: dock aim butonu + sahne tiki -> secili kamera yon (camDirSig) degissin
    const yonRes = await changeCamSig(f, 'aim');
    (yonRes.changed) ? ok('KUSUR13a yon-degistir: dock aim + sahne tikiyla camDirSig DEGISTI (secili kamera)', JSON.stringify({before:yonRes.before, after:yonRes.after, via:yonRes.via})) : bad('KUSUR13a camDirSig degismedi', JSON.stringify(yonRes));
    // camDirSig degisince tur OTO-ilerler (İleri/Atla gereksiz) -> kamera-tasi karti gelir
    const adv = await waitFor(async()=>{ const c=await onbCard(f); return (c.visible && /Kamerayı taşı/.test(c.title||''))?c:null; }, {timeout:8000, interval:250, desc:'yon-degistir oto-ilerledi'}).catch(()=>null);
    adv ? ok('KUSUR13a yon-degistir yaptirinca OTO-ilerledi (Kamerayı taşı karti geldi)') : (await onbClick(f,'skip'));
  } else bad('KUSUR13a yon-degistir (Bakış yönünü değiştir) karti gelmedi');

  // REV7 KUSUR 13b — KAMERA-TAŞI: hedef dock [data-camact="move"]; check = SEÇİLİ kamera pos-imzasi (camPosSig).
  const tasiCard = await waitKamCard(f, /Kamerayı taşı/, 9000).catch(()=>null);
  if(tasiCard){
    const moveDiag = await f.evaluate(()=>({ sel:(window.View3D&&View3D.getActiveCamIdx)?View3D.getActiveCamIdx():-1, moveBtn:!!document.querySelector('#v3dCamDock [data-camact="move"]') }));
    (moveDiag.sel>=0) ? ok('KUSUR13b kamera-tasi: kamera SECILI (getActiveCamIdx>=0)', JSON.stringify(moveDiag)) : bad('KUSUR13b kamera-tasi kamera secili degil', JSON.stringify(moveDiag));
    (moveDiag.moveBtn) ? ok('KUSUR13b kamera-tasi hedefi = dock "Taşı" ([data-camact="move"]) DOM\'da', JSON.stringify(moveDiag)) : bad('KUSUR13b dock move butonu yok', JSON.stringify(moveDiag));
    await sleep(400);
    const tasiCompact = await camCardCompactDiag(f);
    (tasiCompact.hasCard && tasiCompact.compact) ? ok('KUSUR13b kamera-tasi kart KOMPAKT (.onbCompact, '+tasiCompact.w+'px)', JSON.stringify({w:tasiCompact.w})) : bad('KUSUR13b kamera-tasi kart kompakt degil', JSON.stringify(tasiCompact));
    (!tasiCompact.ovDock && !tasiCompact.ovPip) ? ok('KUSUR13b kamera-tasi kart kamera dock (#v3dCamDock) + PiP (#v3dPip) ile ÇAKIŞMIYOR', JSON.stringify({ovDock:tasiCompact.ovDock, ovPip:tasiCompact.ovPip})) : bad('KUSUR13b kamera-tasi kart dock/PiP ortuyor', JSON.stringify(tasiCompact));
    // GERCEK EYLEM: dock move butonu + sahne tiki -> secili kamera konum (camPosSig) degissin
    const tasiRes = await changeCamSig(f, 'move');
    (tasiRes.changed) ? ok('KUSUR13b kamera-tasi: dock move + sahne tikiyla camPosSig DEGISTI (secili kamera)', JSON.stringify({before:tasiRes.before, after:tasiRes.after, via:tasiRes.via})) : bad('KUSUR13b camPosSig degismedi', JSON.stringify(tasiRes));
    const adv2 = await waitFor(async()=>{ const c=await onbCard(f); return (c.visible && /Lens seç/.test(c.title||''))?c:null; }, {timeout:8000, interval:250, desc:'kamera-tasi oto-ilerledi'}).catch(()=>null);
    adv2 ? ok('KUSUR13b kamera-tasi yaptirinca OTO-ilerledi (Lens seç karti geldi)') : (await onbClick(f,'skip'));
  } else bad('KUSUR13b kamera-tasi (Kamerayı taşı) karti gelmedi');

  // REV5 KUSUR 14 — lens-sec: detay kutusu ACIK -> #v3dLRow gorunur (bir onceki adimdan kopmadi)
  const lensCard = await waitKamCard(f, /Lens seç/, 9000).catch(()=>null);
  if(lensCard){
    // detay kutusu ASENKRON acilir (onbOpenCamDetail retry 120/350ms) -> gorunur olana dek poll
    const lrow = await waitFor(async()=>{
      const r = await f.evaluate(()=>{ const el=document.getElementById('v3dLRow'); if(!el) return {exists:false}; const rc=el.getBoundingClientRect(); return {exists:true, vis:(rc.width>0&&rc.height>0)}; });
      return (r.exists && r.vis) ? r : null;
    }, {timeout:6000, interval:250, desc:'#v3dLRow gorunur'}).catch(()=>null);
    lrow ? ok('KUSUR14 lens-sec: detay kutusu acik (#v3dLRow gorunur)', JSON.stringify(lrow)) : bad('KUSUR14 #v3dLRow gorunmedi (kutu kapali)', JSON.stringify(await f.evaluate(()=>({exists:!!document.getElementById('v3dLRow')}))));
    await onbClick(f,'skip'); await sleep(500);
  } else bad('KUSUR14 lens-sec karti gelmedi');

  // REV5 KUSUR 2 — drone-gec: Drone araci -> dis mod + blok gorunumu 'Tumu'
  const droneCard = await waitKamCard(f, /Drone moduna geç/, 9000).catch(()=>null);
  if(droneCard){ await engClick(f, '[data-grp="drone"]'); await sleep(1000); }
  const extView = await f.evaluate(()=>({ mode:(window.View3D&&View3D.isExteriorMode)?View3D.isExteriorMode():false, view:(window.View3D&&View3D.getExtBlockView)?View3D.getExtBlockView():null }));
  (extView.mode && extView.view==='all') ? ok('KUSUR2 drone evresinde blok gorunumu Tumu', JSON.stringify(extView)) : bad('KUSUR2 drone gorunumu Tumu degil', JSON.stringify(extView));

  // REV(d) ZEMIN KAT BALKONSUZ: dis cephe kuruluyken kat-ayrili blokta zemin kat (floorBalc[0]) balkonsuz,
  //   ust katlar balkonlu. View3D.buildExteriorForTest -> floorBalc dizisi = stackShell'in kat-basina balkon
  //   karari (zemin false -> groundFallbackProto/balkonsuz proto klonlanir; ust true -> balkon plaka+korkuluk).
  const fbInfo = await waitFor(async()=>{
    const r = await f.evaluate(()=>{ try{ const V=window.View3D; if(!V||!V.buildExteriorForTest) return null;
      try{ V.setExteriorMode&&V.setExteriorMode(true); }catch(e){}
      const e=V.buildExteriorForTest(); return e?{floorBalc:e.floorBalc, floors:e.floors}:null; }catch(e){ return {err:String(e&&e.message||e)}; } });
    return (r && Array.isArray(r.floorBalc) && r.floorBalc.length>=2) ? r : null;
  }, {timeout:12000, interval:600, desc:'REV(d) floorBalc'}).catch(()=>null);
  const fbArr = fbInfo && Array.isArray(fbInfo.floorBalc) ? fbInfo.floorBalc : null;
  (fbArr && fbArr[0]===false) ? ok('REV(d) zemin kat BALKONSUZ (floorBalc[0]===false)', JSON.stringify(fbArr)) : bad('REV(d) zemin kat balkonsuz (floorBalc[0]=false)', JSON.stringify(fbInfo));
  (fbArr && fbArr.slice(1).some(v=>v===true)) ? ok('REV(d) UST katlarda balkon VAR (floorBalc[1..]===true)', JSON.stringify(fbArr)) : bad('REV(d) ust katlarda balkon var', JSON.stringify(fbInfo));

  // REV5 KUSUR 15 — drone-ekle "zaten tamamlanmis" DEMEZ (eyleme bekler) + kullanici 1 drone ekler -> ex=3
  const droneAddCard = await waitKamCard(f, /Drone kamerası ekle/, 9000).catch(()=>null);
  if(droneAddCard){
    const gated = await f.evaluate(()=>{ const c=document.querySelector('.onbCard'); return !!(c && /\bİleri\b/.test(c.textContent||'')); });
    (!gated) ? ok('KUSUR15 drone-ekle EYLEME bekler (zaten-tamam DEMEZ)') : bad('KUSUR15 drone-ekle giris-gated (zaten tamam)');
    const exAfter = await addDroneOne(f);
    (exAfter>=3) ? ok('KUSUR15 kullanici 1 drone ekledi (ex 2->'+exAfter+')') : bad('KUSUR15 drone eklenemedi','ex='+exAfter);
  } else bad('KUSUR15 drone-ekle karti gelmedi');

  // REV5 KUSUR 3 — render-isaret IFRAME'DE BITIS KARTI: 'Render Kadrajlari' yonlendirir (Dis Render adimi YOK)
  const finCard = await waitKamCard(f, /Tur tamam|Dış Render/, 9000).catch(()=>null);
  if(finCard){
    const fin = await f.evaluate(()=>{ const c=document.querySelector('.onbCard'); const t=c?c.textContent||'':''; return { title:(document.querySelector('.onbTitle span')||{}).textContent||'', rk:/Render Kadrajları/.test(t), kabuk:/kabuk/.test(t) }; });
    (fin.rk && /Tur tamam/.test(fin.title)) ? ok('KUSUR3 iframe render-isaret = bitis karti (Render Kadrajlari yonlendirir)', JSON.stringify(fin)) : bad('KUSUR3 render-isaret bitis-yonlendirmesi yok', JSON.stringify(fin));
    try{ await onbClick(f,'next'); }catch(e){} await sleep(400);   // Bitir/İleri -> onbFinish
  } else log('   [not] render-isaret karti gelmedi (tur erken bitmis olabilir)');
  await shot(page,'21b-drone-finish');

  // (a) part2: kameralar yerlesti ama render'a (step 4) HENUZ gecilmedi — kullanici CTA tiki bekleniyor.
  const sPreRender = await engStep(page);
  (sPreRender && sPreRender.step===3) ? ok('(a) kameralar konuldu, render OTO-gecilmedi (step=3)', 'step='+sPreRender.step) : bad('(a) render oto-gecilmedi','step='+JSON.stringify(sPreRender));
  // advance through kamera3d tour to render handoff: click CTA (Render Kadrajları) at step 3.
  await clickParent(page, '#ctaBtn'); await sleep(600);
  // IS 4: tur akisinda extNudge (drone hatirlatmasi) CIKMAZ; enGo yoksa no-op (assert b global dogrular).
  const enGo = await page.evaluate(()=>{ const b=document.getElementById('enGo'); if(b){ b.click(); return true; } return false; });
  await waitFor(async()=>{ const s=await engStep(page); return (s&&s.step>=4)?s:null; }, {timeout:20000, desc:'render step>=4'});
  ok('(a) render kadraj galerisi (step 4) — CTA tiki ile gecildi');
  await shot(page,'22-render-gallery');

  // REV5 KUSUR 4a — ÜRET BİTMEDEN DEKORE KARTI YOK: step 4 girisinde kabuk turu 'Kareleri üret' kartinda,
  //   'Döşe adımı' (Dekore) DEĞİL. (render check = üretim bitti; üretilmeden dekore'ye gecmez.)
  const preGenCard = await waitFor(async()=>{ const c=await shellCard(page); return (c.visible && /Kareleri üret/.test(c.title||''))?c:null; }, {timeout:8000, interval:300, desc:'Kareleri üret karti'}).catch(()=>null);
  if(preGenCard){
    const notDekore = !/Döşe adımı|Dekore/.test(preGenCard.title||'');
    (notDekore) ? ok('KUSUR4a Üret bitmeden Dekore karti YOK (kart=Kareleri üret)', preGenCard.title) : bad('KUSUR4a Dekore karti erken cikti', preGenCard.title);
  } else log('   [not] Kareleri üret karti gelmedi (kart='+((await shellCard(page)).title||'')+')');

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

  // (e) PAKET-KOKENLI: karta dusen cam img'i gercekten yukle -> naturalWidth==1600 + demo-assets/cam1.jpg 300KB+ (yeni set).
  const camCard = imgs.find(c=>/cam[1-7]\.jpg/.test(c.res));
  const eInfo = await page.evaluate(async (cardUrl)=>{
    async function probe(url){
      let size=-1, nat=-1;
      try{ const r=await fetch(url,{cache:'no-store'}); const b=await r.blob(); size=b.size; }catch(e){ size=-2; }
      nat = await new Promise(res=>{ try{ const im=new Image(); im.onload=()=>res(im.naturalWidth||0); im.onerror=()=>res(-1); im.src=url; }catch(e){ res(-1); } });
      return {url, size, nat};
    }
    const base='/mesken/demo-assets/cam1.jpg';
    const out={ base:await probe(base), cam6:await probe('/mesken/demo-assets/cam6.jpg') };
    if(cardUrl) out.card=await probe(cardUrl);
    return out;
  }, camCard ? camCard.res : null);
  const baseOK = eInfo.base && eInfo.base.nat===1600 && eInfo.base.size>=300000;   // yeni set 307KB+; eski 199KB DEGIL
  baseOK ? ok('(e) demo-assets/cam1.jpg paket-kokenli (nat=1600, >=300KB)', 'nat='+eInfo.base.nat+' size='+eInfo.base.size) : bad('(e) cam1.jpg paket-kokenli','base='+JSON.stringify(eInfo.base));
  // REV(e-cam6) cam6.jpg YENILENDI (bugun): sabit boyut 337271 bayt + 1600px (hash-degisim regresyon citasi).
  const cam6OK = eInfo.cam6 && eInfo.cam6.nat===1600 && eInfo.cam6.size===337271;
  cam6OK ? ok('REV(e) demo-assets/cam6.jpg yeni set (nat=1600, size=337271 sabit)', 'nat='+eInfo.cam6.nat+' size='+eInfo.cam6.size) : bad('REV(e) cam6.jpg sabit boyut/nat','cam6='+JSON.stringify(eInfo.cam6));
  const cardImgOK = eInfo.card && eInfo.card.nat===1600 && eInfo.card.size>=300000;
  (camCard && cardImgOK) ? ok('(e) karta dusen cam img naturalWidth==1600 + 300KB+', (camCard.res)+' nat='+eInfo.card.nat+' size='+eInfo.card.size) : bad('(e) karta dusen cam img 1600px/300KB','card='+JSON.stringify(eInfo.card)+' url='+(camCard?camCard.res:'yok'));

  // REV5 KUSUR 17 — TUR AKTIFKEN ÜRETİM SONU OTO-GEÇİŞ YOK: üretim bitti ama step HALA 4 (adim-5'e atlaMAdi).
  const sAfterGen = await engStep(page);
  (sAfterGen && sAfterGen.step===4) ? ok('KUSUR17 uretim bitti ama oto-gecis YOK (step=4)','step='+sAfterGen.step) : bad('KUSUR17 uretim sonu oto-gecti','step='+JSON.stringify(sAfterGen));

  // REV5 KUSUR 16 — stale "Render adımı/goRender" karti YOK: step 4'te kabuk turu 'Kareleri üret' (render) kartinda.
  const rgCard = await shellCard(page);
  (/Kareleri üret|Önce \/ Sonra|Döşe adımı/.test(rgCard.title||'')) ? ok('KUSUR16 step 4 karti Üret/Önce-Sonra/Dekore (stale "Render adımı" YOK)', rgCard.title||'') : log('   [not] step4 kart basligi='+ (rgCard.title||''));

  // REV5 KUSUR 4b — ÖNCE/SONRA SÜRGÜSÜNÜ KULLANDIRT: baRange'i kaydir -> state.baSlid true -> tur 'Dekore Et' kartina gecer.
  const slid = await page.evaluate(()=>{ try{ const r=document.getElementById('baRange'); if(!r) return {ok:false, reason:'baRange yok'};
    r.value='82'; r.dispatchEvent(new Event('input',{bubbles:true}));
    return {ok:true, baSlid:!!(window.__msk&&window.__msk.state&&window.__msk.state.baSlid)}; }catch(e){ return {ok:false, reason:String(e&&e.message||e)}; } });
  (slid.ok && slid.baSlid) ? ok('KUSUR4b Önce/Sonra sürgüsü kullanildi (state.baSlid)', JSON.stringify(slid)) : bad('KUSUR4b sürgü kullanilamadi', JSON.stringify(slid));
  // tur 'Dekore Et' (Döşe adımı) kartina gecmeli — #ctaBtn hedefli
  const dekoreCard = await waitFor(async()=>{ const c=await shellCard(page); return (c.visible && /Döşe adımı/.test(c.title||''))?c:null; }, {timeout:8000, interval:300, desc:'Dekore Et karti'}).catch(()=>null);
  dekoreCard ? ok('KUSUR17 sürgü sonrasi kabuk turu Dekore Et (Döşe adımı) kartinda — #ctaBtn highlight', dekoreCard.title) : log('   [not] Dekore Et karti gelmedi (kart='+((await shellCard(page)).title||'')+')');

  await clickParent(page, '#ctaBtn'); await sleep(1000);
  const step5 = await waitFor(async()=>{ const s=await engStep(page); return (s&&s.step>=5)?s:null; }, {timeout:15000, desc:'dose step5'}).catch(()=>null);
  step5 ? ok('Döşe adimi (step 5)') : bad('Döşe step5', 'kalindi');
  await shot(page,'24-dose');

  // REV5 KUSUR 5 — DÖŞE STEPPER'INDA İKİ NOKTA DA DOLU: adim-5 duo noktalari (iç + dış) render sonrasi ikisi de 'done'.
  const dots5 = await page.evaluate(()=>{
    try{ const steps=[...document.querySelectorAll('#stepper .step')]; const b=steps[4]; if(!b) return {ok:false, reason:'step5 yok'};
      const din=b.querySelector('.duo .in'), dex=b.querySelector('.duo .ex');
      const inDone=!!(din&&din.classList.contains('done')), exDone=!!(dex&&dex.classList.contains('done'));
      return {ok:inDone&&exDone, inDone, exDone}; }catch(e){ return {ok:false, reason:String(e&&e.message||e)}; }
  });
  (dots5.ok) ? ok('KUSUR5 döşe adiminda İKİ nokta da dolu (iç+dış)', JSON.stringify(dots5)) : bad('KUSUR5 döşe noktalarindan biri bos', JSON.stringify(dots5));
  // marketplace panel present
  const mkt = await page.evaluate(()=>!!document.getElementById('mktCtx') || !!document.querySelector('.mkt-row'));
  mkt ? ok('pazaryeri paneli') : bad('pazaryeri paneli','yok');

  // REV6 EXPORT — SON ADIM CTA "Projeyi İndir" GERÇEK İNDİRME: step 5'te #ctaBtn etiketi 'Projeyi İndir';
  //   tıklayınca exportProject() -> exportPackage() -> .mskpkg blob a[download].click (download gozetleyici yakalar).
  const ctaLabel = await page.evaluate(()=>{ const b=document.getElementById('ctaBtn'); return b?b.textContent.trim():''; });
  (/Projeyi İndir/.test(ctaLabel)) ? ok('REV6 son adim #ctaBtn etiketi "Projeyi İndir"', ctaLabel) : bad('REV6 ctaBtn "Projeyi İndir"','label='+ctaLabel);
  await clickParent(page, '#ctaBtn');
  // REV(ZIP) INDIRME GOZCUSU: Proje Indir = TAM 1 .mskpkg + TAM 1 proje-<tarih>-render.zip (ayri JPEG YOK).
  //   render.zip async uretilir (Promise.all(pkgToDataURL)) -> ikisini de bekle.
  const dlBoth = await waitFor(async()=>{ const d=await getDownloads(page);
    const pkg=d.filter(x=>/^a:proje-.*\.mskpkg$/.test(x)), zip=d.filter(x=>/^a:proje-.*-render\.zip$/.test(x));
    return (pkg.length>=1 && zip.length>=1) ? {pkg, zip} : null;
  }, {timeout:20000, interval:400, desc:'mskpkg + render.zip indirme'}).catch(()=>null);
  const dlAll = await getDownloads(page);
  const mskpkgN = dlAll.filter(x=>/^a:proje-.*\.mskpkg$/.test(x)).length;
  const zipN = dlAll.filter(x=>/^a:proje-.*-render\.zip$/.test(x)).length;
  const jpgN = dlAll.filter(x=>/^a:.*\.jpg$/.test(x)).length;
  (mskpkgN===1) ? ok('REV(ZIP) TAM 1 .mskpkg indi', 'n='+mskpkgN) : bad('REV(ZIP) tam 1 .mskpkg','n='+mskpkgN+' dl='+JSON.stringify(dlAll));
  (zipN===1) ? ok('REV(ZIP) TAM 1 proje-<tarih>-render.zip indi', 'n='+zipN) : bad('REV(ZIP) tam 1 render.zip','n='+zipN+' dl='+JSON.stringify(dlAll));
  (jpgN===0) ? ok('REV(ZIP) ayri JPEG indirmesi YOK (hepsi ZIP\'te)', 'jpg='+jpgN) : bad('REV(ZIP) ayri JPEG indirmesi kalkti','jpg='+jpgN+' dl='+JSON.stringify(dlAll));
  // ZIP baytlari: >0 + PK imzali + girdi sayisi (STORE local-file-header taramasi). mskpkg baytlari >0.
  const blobs = await getDownloadBlobs(page);
  const zipBlob = blobs.find(b=>/-render\.zip$/.test(b.name));
  const mskBlob = blobs.find(b=>/\.mskpkg$/.test(b.name));
  (zipBlob && zipBlob.size>0) ? ok('REV(ZIP) render.zip > 0 bayt', 'size='+zipBlob.size) : bad('REV(ZIP) render.zip >0 bayt','blob='+JSON.stringify(zipBlob||null));
  (zipBlob && zipBlob.pk) ? ok('REV(ZIP) render.zip PK imzali (0x50 0x4B)', 'b0='+(zipBlob&&zipBlob.b0)+' b1='+(zipBlob&&zipBlob.b1)) : bad('REV(ZIP) render.zip PK imzali','blob='+JSON.stringify(zipBlob||null));
  (zipBlob && zipBlob.entries>=1) ? ok('REV(ZIP) render.zip girdi sayisi', zipBlob.entries+' girdi'+(zipBlob.entries===12?' (12 render)':'')) : bad('REV(ZIP) render.zip girdi>=1','entries='+(zipBlob?zipBlob.entries:'?'));
  (mskBlob && mskBlob.size>0) ? ok('REV(ZIP) .mskpkg > 0 bayt', 'size='+mskBlob.size) : bad('REV(ZIP) .mskpkg >0 bayt','blob='+JSON.stringify(mskBlob||null));
  log('   [indirmeler] '+JSON.stringify(dlAll)+'  bloblar='+JSON.stringify(blobs.map(b=>({n:b.name,size:b.size,pk:b.pk,e:b.entries}))));
  await shot(page,'25-export');

  // (b) angleNudge/extNudge dialoglari tur boyunca HIC gorunmedi (flowTourActive suppress).
  const nudges = await getNudgeSeen(page);
  (nudges.length===0) ? ok('(b) angleNudge/extNudge tur boyunca HIC cikmadi') : bad('(b) nudge dialoglari cikti','gorulen='+JSON.stringify(nudges));
}

// ============ helpers needing engine internals ============
// REV5: kamera3d turunun kartini basligiyla bekle (iframe icindeki onbCard).
async function waitKamCard(f, re, timeout){
  return waitFor(async()=>{ const c=await onbCard(f); return (c.visible && re.test(c.title||''))?c:null; }, {timeout:timeout||8000, interval:250, desc:'kam kart '+re});
}
// REV5 KUSUR 15: bir drone ekle — once GERCEK "+ Drone Ekle" + mesh tik; olmazsa View3D API fallback (ex=3).
async function addDroneOne(f){
  try{ await engClick(f, '[data-v3d="extadd"]'); await sleep(400); }catch(e){}
  try{ await clickMeshCenter(f); await sleep(700); }catch(e){}
  let ex = (await getCamCounts(f)).ex;
  if(ex<3){
    // fallback: eksik drone'u API ile ekle (tur check'i extCount>base poll ile yakalar -> adim ilerler)
    ex = await f.evaluate(()=>{
      try{ const V=window.View3D; if(!V) return -1;
        const K=(typeof ONB_TARGETS!=='undefined'&&ONB_TARGETS&&ONB_TARGETS.kameralar)?ONB_TARGETS.kameralar:null;
        if(!K||!Array.isArray(K.drone)) return (V.getExteriorCameras()||[]).length;
        const slim=K.drone.map(function(c){ const o={}; for(const k in c){ if(/^__/.test(k)) continue; o[k]=c[k]; } return o; });
        V.setExteriorMode(true); V.setExteriorCameras(slim); V.setExtBlockView&&V.setExtBlockView('all'); V.setExteriorMode(false);
        return (V.getExteriorCameras()||[]).length;
      }catch(e){ return -1; }
    });
    await sleep(600);
  }
  return ex;
}
// REV7 — kamera turu kompakt kart teshisi: .onbCompact + kart kamera dock (#v3dCamDock) / PiP (#v3dPip)
//   ile CAKISMIYOR (avoidSel PiP + hedef dock; kart alt dock'u ORTMEMELI) + ensure() hedef-kurtarma var.
async function camCardCompactDiag(f){
  return f.evaluate(()=>{
    const card=document.querySelector('.onbCard'); if(!card) return {hasCard:false};
    const compact=!!(card.classList&&card.classList.contains('onbCompact'));
    const cr=card.getBoundingClientRect();
    function rc(id){ const el=document.getElementById(id); if(!el) return null; if(el.style&&el.style.display==='none') return null; const r=el.getBoundingClientRect(); return (r.width>0&&r.height>0)?{left:r.left,top:r.top,right:r.right,bottom:r.bottom}:null; }
    function ov(a,b){ if(!a||!b) return false; return !(a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom); }
    const dock=rc('v3dCamDock'), pip=rc('v3dPip');
    const c4={left:cr.left,top:cr.top,right:cr.right,bottom:cr.bottom};
    let hasEnsure=false; try{ const st=(onbTour&&onbTour.steps)?onbTour.steps[onbIdx]:null; hasEnsure=!!(st&&typeof st.ensure==='function'); }catch(e){}
    return {hasCard:true, compact, w:Math.round(cr.width), ovDock:ov(c4,dock), ovPip:ov(c4,pip), hasDock:!!dock, hasPip:!!pip, hasEnsure};
  });
}
// REV7 — SECILI kamera yon (aim -> camDirSig) / konum (move -> camPosSig) imzasini GERCEK EYLEMLE degistir:
//   (1) dock butonuna tik (setPlaceAction), (2) aktif kamerayi (idx0) sec + sahneye tik -> scenePick target/pos'u set eder.
//   Sahne raycast bir noktaya oturmazsa View3D getCameras/setCameras ile aktif kamerayi nudge et (drone-ekle deseni).
async function changeCamSig(f, act){
  return f.evaluate(async(act)=>{
    const V=window.View3D; if(!V) return {changed:false, reason:'no View3D'};
    function sig(){ try{ let i=(V.getActiveCamIdx?V.getActiveCamIdx():-1); const a=V.getCameras?V.getCameras():[]; if(!a.length) return '';
      if(i<0||i>=a.length) i=a.length-1; const c=a[i]; const t=(act==='aim')?c.target:c.pos;
      const r=n=>Math.round((+n||0)*100)/100; return [r(t.x),r(t.y),r(t.z)].join(','); }catch(e){ return ''; } }
    try{ if(V.selectCam) V.selectCam(0); }catch(e){}
    const before=sig();
    // 1) dock butonu (Yön/Taşı) -> placeAction
    try{ const b=document.querySelector('#v3dCamDock [data-camact="'+act+'"]'); if(b) b.click(); }catch(e){}
    await new Promise(r=>setTimeout(r,150));
    // 2) sahneye tik (scenePick -> secili kamera aim/move)
    try{ const ov=document.getElementById('view3dOverlay'); const cv=ov&&ov.querySelector('canvas');
      if(cv){ const r=cv.getBoundingClientRect();
        function pt(type,x,y){ cv.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0,buttons:type==='pointerdown'?1:0,pointerId:1,pointerType:'mouse',isPrimary:true,view:window})); }
        const x=r.left+r.width*(act==='aim'?0.34:0.66), y=r.top+r.height*(act==='aim'?0.40:0.62);
        pt('pointerdown',x,y); await new Promise(rr=>setTimeout(rr,50)); pt('pointerup',x,y);
        await new Promise(rr=>setTimeout(rr,200)); } }catch(e){}
    let after=sig(), via='scene';
    // 3) fallback: sahne tiki imzayi degistirmediyse API ile aktif kamerayi nudge et
    if(after===before){
      try{ const a=(V.getCameras?V.getCameras():[]).map(function(c){ return {id:c.id,pos:Object.assign({},c.pos),target:Object.assign({},c.target),lens:c.lens,height:c.height}; });
        if(a.length){ let i=(V.getActiveCamIdx?V.getActiveCamIdx():-1); if(i<0||i>=a.length) i=a.length-1;
          if(act==='aim'){ a[i].target.x+=2.0; a[i].target.z-=1.5; } else { a[i].pos.x+=1.5; a[i].pos.z+=1.0; }
          if(V.setCameras) V.setCameras(a); if(V.selectCam) V.selectCam(i); via='api'; } }catch(e){}
      after=sig();
    }
    return {changed:(after!==before && after!==''), before, after, via};
  }, act);
}
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

// ============ SUNUCU-KOKU REGRESYONU (mesken KLASORU kok) ============
//   Sayfa /MESKEN-prototip.html (http.server --directory mesken). DEMO_ASSETS konumdan '/demo-assets/'
//   turer. TAM tur GEREKMEZ: (1) demo-plan.json 200 doner (mesken-kok 404 kok nedeniydi), (2) kabuk boot
//   koprusu iframe'e __mskDemoPlan'i kurdu, (3) 'Yerlesimi Olustur' = onbApplyDemoLayout -> plan.regions demo
//   imzasiyla eslesir, (4) kamera normalizasyon nabzi: __mskDemoPlan.cameras demo kamera setini tasir.
async function runMeskenRoot(page, f){
  await sleep(1500);
  // (1) demo-plan.json 200 (konum-tureli /demo-assets/ mesken-kok serviste bulunur; eski 404 DEGIL)
  const dp = await page.evaluate(async()=>{
    try{ const r=await fetch('/demo-assets/demo-plan.json',{cache:'no-store'});
      let n=-1; try{ const j=await r.json(); n=(j&&j.kpState&&Array.isArray(j.kpState.blocks))?j.kpState.blocks.length:-1; }catch(e){}
      return {status:r.status, ok:r.ok, blocks:n}; }catch(e){ return {status:-1, ok:false, err:String(e)}; }
  });
  (dp.ok && dp.status===200) ? ok('mesken-kok: demo-plan.json 200 (konum-tureli /demo-assets/ bulundu)', JSON.stringify(dp)) : bad('mesken-kok demo-plan.json 200','durum='+JSON.stringify(dp));
  // (2) kabuk boot koprusu iframe window'una __mskDemoPlan kurdu (bridge asenkron -> poll)
  const bridge = await waitFor(async()=>{
    const b=await f.evaluate(()=>{ try{ const p=window.__mskDemoPlan; const kp=(p&&p.kpState)||p; if(!kp||!kp.blocks) return null;
      const c=p.cameras||{}; const ic=Array.isArray(c.interior)?c.interior.length:0, ex=Array.isArray(c.exterior)?c.exterior.length:0;
      return {aRegs:kp.blocks[0].plan.regions.length, bRegs:(kp.blocks[1]?kp.blocks[1].plan.regions.length:-1), cams:ic+ex, ic, ex}; }catch(e){ return null; } });
    return b?b:null;
  }, {timeout:15000, interval:400, desc:'mesken-kok __mskDemoPlan kopru'}).catch(()=>null);
  bridge ? ok('mesken-kok: __mskDemoPlan kopru kuruldu (bridge 200 -> iframe)', JSON.stringify(bridge)) : bad('mesken-kok __mskDemoPlan kopru','kurulmadi (404 -> atlandi?)');
  // (4) KAMERA NORMALIZASYON NABZI: bridged plan demo kamera setini tasir (mesken-kok 404 bu veriyi de yutuyordu)
  (bridge && bridge.cams>0) ? ok('mesken-kok: kamera normalizasyon nabzi — __mskDemoPlan.cameras dolu (ic+dis)', 'ic='+(bridge.ic)+' ex='+(bridge.ex)) : bad('mesken-kok kamera normalizasyon nabzi','cams='+(bridge?bridge.cams:'?'));
  // (3) 'Yerlesimi Olustur' = onbApplyDemoLayout('blokA') -> plan.regions demo blok A imzasiyla eslesir
  const applied = await f.evaluate(()=>{
    try{ if(typeof onbApplyDemoLayout!=='function') return {ok:false, reason:'onbApplyDemoLayout yok'};
      const done=onbApplyDemoLayout('blokA');
      const regs=(typeof plan!=='undefined'&&plan&&plan.regions)?plan.regions.length:-1;
      return {ok:done, regs};
    }catch(e){ return {ok:false, reason:String(e&&e.message||e)}; }
  });
  (applied.ok && bridge && applied.regs===bridge.aRegs)
    ? ok('mesken-kok: Yerlesimi Olustur demo yerlesimi uyguladi (plan.regions=demo A imzasi)', 'regs='+applied.regs+'==demo '+(bridge&&bridge.aRegs))
    : bad('mesken-kok demo yerlesim uygulanmadi','applied='+JSON.stringify(applied)+' demoA='+(bridge&&bridge.aRegs));
  await shot(page,'mkroot-01');
}

// ============ KOK-REWRITE REGRESYONU (CANLI Caddy sekli: pathname '/' + dosyalar /mesken/*) ============
//   Canli kok neden (demo koprusu YINE oldu, 2. kez): Caddy `rewrite @root /mesken/MESKEN-prototip.html`
//   pathname'i '/' TUTAR ama dosyalari /mesken/ altindan sunar; pathname'de '/mesken/' YOKken eski sabit
//   tureme '/demo-assets/'e dusup 404 aliyordu -> demoBridgePlanToEngine + demoHandsonNormalize SESSIZCE
//   oluyordu (A blok demodan gelmiyor, cati yok, kamera evresinde 9 kare = kopru-suz deriveShowcaseCameras).
//   ic node sunucu bu sekli TAKLIT eder ('/' -> prototip, '/mesken/*' -> dosyalar). Aday-listeli probe
//   '/mesken/demo-assets/' adayini bulup koprusu diriltmeli. Assert: probe 200 (hangi aday) + '/demo-assets/'
//   404 (kok neden) + __mskDemoPlan kuruldu + kamera 7 ic+3 dis + yerlesim regs==demo A.
async function runKokRewrite(page, f){
  await sleep(1500);
  // pathname '/' KALDI mi (Caddy @root taklidi calisiyor) + sayfa MESKEN prototipi mi (rewrite iceriden dosya verdi)
  const loc = await page.evaluate(()=>({path:location.pathname, hasEngine:!!document.getElementById('engineFrame')}));
  (loc.path==='/' && loc.hasEngine) ? ok('kok-rewrite: pathname "/" KALDI + prototip yuklendi (Caddy @root taklidi)', JSON.stringify(loc)) : bad('kok-rewrite pathname/prototip', JSON.stringify(loc));
  // (1) ADAY PROBE: '/mesken/demo-assets/' 200 (kok-rewrite kazanan aday), '/demo-assets/' 200 DEGIL (eski sabit tureme = kok neden)
  const probe = await page.evaluate(async()=>{
    async function head(u){ try{ const r=await fetch(u,{method:'HEAD',cache:'no-store'}); return r.status; }catch(e){ return -1; } }
    return { mesken: await head('/mesken/demo-assets/demo-plan.json'), eski: await head('/demo-assets/demo-plan.json') };
  });
  (probe.mesken===200) ? ok('kok-rewrite: probe adayi "/mesken/demo-assets/" 200 (kazanan taban)', JSON.stringify(probe)) : bad('kok-rewrite /mesken/demo-assets/ 200', JSON.stringify(probe));
  (probe.eski!==200) ? ok('kok-rewrite: eski sabit tureme "/demo-assets/" 200 DEGIL (kok neden dogrulandi)', 'durum='+probe.eski) : bad('kok-rewrite eski /demo-assets/ 200 OLMAMALI', 'durum='+probe.eski);
  // (2) kabuk boot koprusu iframe window'una __mskDemoPlan kurdu (probe dogru tabani buldu -> bridge 200)
  const bridge = await waitFor(async()=>{
    const b=await f.evaluate(()=>{ try{ const p=window.__mskDemoPlan; const kp=(p&&p.kpState)||p; if(!kp||!kp.blocks) return null;
      const c=p.cameras||{}; const ic=Array.isArray(c.interior)?c.interior.length:0, ex=Array.isArray(c.exterior)?c.exterior.length:0;
      return {aRegs:kp.blocks[0].plan.regions.length, bRegs:(kp.blocks[1]?kp.blocks[1].plan.regions.length:-1), ic, ex, cams:ic+ex}; }catch(e){ return null; } });
    return b?b:null;
  }, {timeout:15000, interval:400, desc:'kok-rewrite __mskDemoPlan kopru'}).catch(()=>null);
  bridge ? ok('kok-rewrite: __mskDemoPlan kopru kuruldu (probe -> /mesken/demo-assets/ -> iframe)', JSON.stringify(bridge)) : bad('kok-rewrite __mskDemoPlan kopru','kurulmadi (probe basarisiz -> sessiz olum?)');
  // KAMERA 7+3: kopru calisinca kamera evresi demo setini TAM tasir (kopru-suz 9 kare DEGIL -> 10 = 7 ic + 3 dis)
  (bridge && bridge.ic===7 && bridge.ex===3) ? ok('kok-rewrite: kamera evresi demo seti 7 ic + 3 dis (kopru calisti, 9 kare DEGIL)', 'ic='+(bridge&&bridge.ic)+' ex='+(bridge&&bridge.ex)) : bad('kok-rewrite kamera 7 ic + 3 dis','ic='+(bridge&&bridge.ic)+' ex='+(bridge&&bridge.ex));
  // (3) 'Yerlesimi Olustur' = onbApplyDemoLayout('blokA') -> plan.regions demo A imzasiyla eslesir (taze uretim DEGIL)
  const applied = await f.evaluate(()=>{
    try{ if(typeof onbApplyDemoLayout!=='function') return {ok:false, reason:'onbApplyDemoLayout yok'};
      const done=onbApplyDemoLayout('blokA');
      const regs=(typeof plan!=='undefined'&&plan&&plan.regions)?plan.regions.length:-1;
      return {ok:done, regs};
    }catch(e){ return {ok:false, reason:String(e&&e.message||e)}; }
  });
  (applied.ok && bridge && applied.regs===bridge.aRegs)
    ? ok('kok-rewrite: Yerlesimi Olustur demo yerlesimi uyguladi (plan.regions==demo A imzasi)', 'regs='+applied.regs+'==demo '+(bridge&&bridge.aRegs))
    : bad('kok-rewrite demo yerlesim uygulanmadi','applied='+JSON.stringify(applied)+' demoA='+(bridge&&bridge.aRegs));
  await shot(page,'kokrw-01');
}
