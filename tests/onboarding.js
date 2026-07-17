/* ONBOARDING turlari — saf mantik testi — node tests/onboarding.js
   Modul dosyadan DOGRUDAN okunup eval edilir — app.js'e bagimlilik yok (adim
   dizileri + durum makinesi saf, ctx uzerinden okur).

   ENV GUARD kaniti: window.innerWidth TANIMSIZ (asagidaki window stub'inda yok) ->
   onbBrowser() false -> auto-start / watcher / setInterval / DOM tel orgusu CALISMAZ;
   top-level yalniz tanim yapar.

   Kapsam: (1) registry + senaryo butunlugu (2 tur), (2) ana tur check'leri stub ctx,
   (3) baseline'li adimlar, (4) computeTarget + sira-atlama senkronu,
   (5) decideStart durum makinesi (tur-surumlu), (6) localStorage tur-kapsamli anahtarlar
   + legacy migrasyon, (7) iframe guard, (8) ornek parsel reveal, (9) kart CSS sozlesmesi,
   (10) kamera3d check'leri stub ctx, (11) watcher karari (iframe-bypass dahil). */
'use strict';
const fs = require('fs');
const path = require('path');

/* --- test globalleri — window.innerWidth BILINCLI YOK --- */
const store = {};
global.window = { addEventListener(){} };                 // innerWidth yok -> onbBrowser()=false
global.localStorage = { getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{ store[k]=String(v); }, removeItem:k=>{ delete store[k]; } };
global.document = undefined;                              // onbEl/onbSel guard'li -> null doner

const src = fs.readFileSync(path.join(__dirname, '..', 'onboarding.js'), 'utf8');

let pass=0, fail=0;
const T=(name,cond)=>{ if(cond){ pass++; } else { fail++; console.log('  [FAIL]', name); } };

/* ANA tur ctx stub'u: tum alanlar "tamamlanmamis"; testler tek tek override eder. */
function baseCtx(over){
  const c={
    modePro:()=>false, tabActive:()=>false, parcelLen:()=>0, frontEdge:()=>-1,
    cekme:()=>'|||', closed:()=>false, plan:()=>null, editCount:()=>0,
    doorWinCount:()=>0, siteOn:()=>false, blocksLen:()=>0, katAyri:()=>false,
    floorSig:()=>'0|konut', exportClicked:()=>false
  };
  return Object.assign(c, over||{});
}
/* Tum ana adimlari saglayan ctx. baseline'li adimlar yalniz YAKALANMIS tabana gore
   "saglanmis" olur -> FULL_BASES ile gecilir (aktif adimin _base yakalamasi taklidi). */
function fullCtx(){
  return baseCtx({
    modePro:()=>true, tabActive:()=>true, parcelLen:()=>4, frontEdge:()=>2,
    closed:()=>true, plan:()=>({}), editCount:()=>5, doorWinCount:()=>2,
    siteOn:()=>true, blocksLen:()=>2, katAyri:()=>true, exportClicked:()=>true,
    floorSig:()=>'2|ticari'
  });
}
const FULL_BASES = {6:0, 7:0, 9:0, 11:'0|konut'};   // oda(6) kapi(7) blok(9) kat-gez(11)

/* KAMERA3D ctx stub'u */
function kamCtx(over){
  const c={
    camUI:()=>false, camCount:()=>0, lastCamSig:()=>'', lensSig:()=>'',
    extMode:()=>false, extCount:()=>0, extRenderClicked:()=>false
  };
  return Object.assign(c, over||{});
}

const asserts = `
;(function(){
  /* (1) registry + senaryo butunlugu */
  T('ONB tanimli', typeof ONB==='object' && ONB);
  T('registry: 2 tur', Array.isArray(ONB_TOURS) && ONB_TOURS.length===2);
  T('registry: tur id benzersiz', new Set(ONB_TOURS.map(t=>t.id)).size===ONB_TOURS.length);
  T('registry: ana + kamera3d', !!onbTourById('ana') && !!onbTourById('kamera3d'));
  T('registry: her turda version/steps/ctx', ONB_TOURS.every(t=>typeof t.version==='number' && Array.isArray(t.steps) && typeof t.ctx==='function'));
  T('registry: kamera3d iframeAuto+zBoost+watch+visible', (function(){ const k=onbTourById('kamera3d');
      return k.iframeAuto===true && k.zBoost===true && k.watch===true && typeof k.visible==='function'; })());
  T('registry: ana iframeAuto/zBoost/watch kapali', (function(){ const a=onbTourById('ana');
      return a.iframeAuto===false && a.zBoost===false && a.watch===false && a.visible===null; })());
  T('VERSION=1 / KAM_VERSION=1', ONB.VERSION===1 && ONB.KAM_VERSION===1);
  T('ana 13 adim', ONB_STEPS.length===13);
  T('kamera3d 6 adim', ONB_KAM_STEPS.length===6);
  const allIds=ONB_STEPS.map(s=>s.id).concat(ONB_KAM_STEPS.map(s=>s.id));
  T('tum adim id benzersiz (turlar arasi dahil)', new Set(allIds).size===allIds.length);
  T('ana id sirasi', ONB_STEPS.map(s=>s.id).join(',')==='pro-mod,parsel-sekme,parsel-getir,cekme-yol,sinir-ciz,yerlesim,oda-duzenle,kapi-pencere,site-ac,blok-ekle,kat-ayri,kat-gez,export');
  T('kamera3d id sirasi', ONB_KAM_STEPS.map(s=>s.id).join(',')==='kamera-koy,aci-ayarla,lens-sec,drone-gec,drone-ekle,render-isaret');
  T('tum check fonksiyon', ONB_STEPS.concat(ONB_KAM_STEPS).every(s=>typeof s.check==='function'));
  T('tum title/body dolu', ONB_STEPS.concat(ONB_KAM_STEPS).every(s=>typeof s.title==='string' && s.title && typeof s.body==='string' && s.body));
  T('tum target gecerli', ONB_STEPS.concat(ONB_KAM_STEPS).every(s=>s.target && (s.target.type==='canvas' || (s.target.type==='dom' && typeof s.target.sel==='string'))));
  T('emoji yok', !/[\\u{1F000}-\\u{1FAFF}\\u{2600}-\\u{27BF}]/u.test(ONB_STEPS.concat(ONB_KAM_STEPS).map(s=>s.title+s.body).join('')));
  const step=id=>ONB_STEPS.find(s=>s.id===id);
  const kstep=id=>ONB_KAM_STEPS.find(s=>s.id===id);
  T('parsel-getir action var', typeof step('parsel-getir').action.run==='function' && step('parsel-getir').action.label==='Örnek parselle devam');
  T('skippable 3,4,8 isaretli', step('parsel-getir').skippable && step('cekme-yol').skippable && step('kapi-pencere').skippable);
  T('needsPro parsel adimlarinda', step('parsel-sekme').needsPro && step('parsel-getir').needsPro && step('cekme-yol').needsPro);
  T('kamera3d cogu skippable (5/6)', ONB_KAM_STEPS.filter(s=>s.skippable).length===5);
  T('render-isaret Bitir action', typeof kstep('render-isaret').action.run==='function' && kstep('render-isaret').action.label==='Bitir');
  T('aci-ayarla canvas hedefi 3B tuval', kstep('aci-ayarla').target.type==='canvas' && kstep('aci-ayarla').target.sel==='#view3dOverlay canvas');

  /* (2) ana check dogruluklari — stub ctx */
  T('pro-mod: modePro', step('pro-mod').check(baseCtx({modePro:()=>true}))===true && step('pro-mod').check(baseCtx())===false);
  T('parsel-sekme: tabActive', step('parsel-sekme').check(baseCtx({tabActive:()=>true}))===true);
  T('parsel-getir: parcelLen>=3', step('parsel-getir').check(baseCtx({parcelLen:()=>3}))===true && step('parsel-getir').check(baseCtx({parcelLen:()=>2}))===false);
  T('sinir-ciz: closed', step('sinir-ciz').check(baseCtx({closed:()=>true}))===true && step('sinir-ciz').check(baseCtx())===false);
  T('yerlesim: plan!=null', step('yerlesim').check(baseCtx({plan:()=>({})}))===true && step('yerlesim').check(baseCtx())===false);
  T('site-ac: siteOn', step('site-ac').check(baseCtx({siteOn:()=>true}))===true);
  T('kat-ayri: katAyri', step('kat-ayri').check(baseCtx({katAyri:()=>true}))===true);
  T('export: exportClicked', step('export').check(baseCtx({exportClicked:()=>true}))===true && step('export').check(baseCtx())===false);
  T('cekme-yol: frontEdge>=0', step('cekme-yol').check(baseCtx({frontEdge:()=>0}), '|||')===true);
  T('cekme-yol: cekme degisti', step('cekme-yol').check(baseCtx({cekme:()=>'|5||'}), '|||')===true);
  T('cekme-yol: degismemis -> false', step('cekme-yol').check(baseCtx(), '|||')===false);

  /* (3) baseline'li adimlar — buyume kontrolu */
  T('oda-duzenle: editCount>base', step('oda-duzenle').check(baseCtx({editCount:()=>3}),2)===true && step('oda-duzenle').check(baseCtx({editCount:()=>2}),2)===false);
  T('oda-duzenle baseline getter', step('oda-duzenle').baseline(baseCtx({editCount:()=>7}))===7);
  T('kapi-pencere: doorWinCount>base', step('kapi-pencere').check(baseCtx({doorWinCount:()=>1}),0)===true && step('kapi-pencere').check(baseCtx({doorWinCount:()=>0}),0)===false);
  T('blok-ekle: blocksLen>base', step('blok-ekle').check(baseCtx({blocksLen:()=>2}),1)===true && step('blok-ekle').check(baseCtx({blocksLen:()=>1}),1)===false);
  T('kat-gez: floorSig degisti', step('kat-gez').check(baseCtx({floorSig:()=>'2|ticari'}),'0|konut')===true && step('kat-gez').check(baseCtx(),'0|konut')===false);

  /* (4) computeTarget + sira-atlama senkronu (yeni imza: steps, ctx, bases) */
  T('bos ctx -> 0', ONB.computeTarget(ONB_STEPS, baseCtx(), {})===0);
  T('yalniz adim1 -> 1', ONB.computeTarget(ONB_STEPS, baseCtx({modePro:()=>true}), {})===1);
  T('tumu saglandi -> 13 (bitti)', ONB.computeTarget(ONB_STEPS, fullCtx(), FULL_BASES)===13);
  T('skip-ahead: plan var -> >=6', ONB.computeTarget(ONB_STEPS, baseCtx({plan:()=>({})}), {})>=6);
  T('baseline aktif adim senkronu', ONB.computeTarget(ONB_STEPS, baseCtx({modePro:()=>true,tabActive:()=>true,parcelLen:()=>4,frontEdge:()=>2,closed:()=>true,plan:()=>({}),editCount:()=>5}), {6:2})===7);

  /* (5) decideStart durum makinesi — tur-surumlu (3. parametre) */
  T('force -> start', ONB.decideStart({status:'done',v:1}, true, 1)==='start');
  T('active+ayni surum -> resume', ONB.decideStart({status:'active',v:1}, false, 1)==='resume');
  T('active+eski surum -> start', ONB.decideStart({status:'active',v:0}, false, 1)==='start');
  T('done+ayni surum -> idle', ONB.decideStart({status:'done',v:1}, false, 1)==='idle');
  T('done+eski surum -> start', ONB.decideStart({status:'done',v:0}, false, 1)==='start');
  T('dismissed+ayni surum -> idle', ONB.decideStart({status:'dismissed',v:1}, false, 1)==='idle');
  T('durum yok -> start', ONB.decideStart({status:null,v:0}, false, 1)==='start');
  T('ver verilmezse ONB_VERSION varsayilir', ONB.decideStart({status:'done',v:1}, false)==='idle');

  /* (6) localStorage tur-kapsamli anahtarlar + legacy migrasyon */
  const ana=onbTourById('ana'), kam=onbTourById('kamera3d');
  onbSet('onb.ana.step','7'); T('onbStepStored(ana) round-trip', onbStepStored(ana)===7);
  onbSet('onb.kamera3d.step','3'); T('onbStepStored(kamera3d) bagimsiz', onbStepStored(kam)===3 && onbStepStored(ana)===7);
  onbSet('onb.ana.step','abc'); T('stepStored bozuk -> 0', onbStepStored(ana)===0);
  onbDel('onb.ana.step'); onbDel('onb.kamera3d.step');
  /* migrasyon: eski tek-tur anahtarlar -> onb.ana.*; eski silinir; done korunur */
  onbSet('onb.status','done'); onbSet('onb.step','12'); onbSet('onb.v','1');
  T('migrasyon calisti', onbMigrateLegacy()===true);
  T('migrasyon: ana.status=done', onbGet('onb.ana.status')==='done');
  T('migrasyon: ana.step=12', onbGet('onb.ana.step')==='12');
  T('migrasyon: ana.v=1', onbGet('onb.ana.v')==='1');
  T('migrasyon: eski anahtarlar silindi', onbGet('onb.status')===null && onbGet('onb.step')===null && onbGet('onb.v')===null);
  T('migrasyon idempotent (legacy yok -> false)', onbMigrateLegacy()===false);
  /* mevcut yeni-anahtar EZILMEZ */
  onbSet('onb.status','dismissed');
  T('migrasyon: yeni anahtar varsa ezmez', onbMigrateLegacy()===true && onbGet('onb.ana.status')==='done');
  onbDel('onb.ana.status'); onbDel('onb.ana.step'); onbDel('onb.ana.v');
  T('onbStored bos', onbStored(ana).status===null && onbStored(ana).v===0);

  /* (7) iframe guard — saf fonksiyon */
  T('onbInIframe headless -> false', onbInIframe()===false);
  (function(){ const w=global.window;
    global.window={addEventListener(){}, self:{a:1}, top:{b:2}};
    T('onbInIframe: self!==top -> true', onbInIframe()===true);
    global.window={addEventListener(){}, get self(){ throw new Error('cross-origin'); }, top:{}};
    T('onbInIframe: erisim firlatir -> true (cross-origin varsayimi)', onbInIframe()===true);
    global.window=w;
  })();

  /* (8) ornek parsel — tkgmLoadParcel cagrisi + applyData esdegeri #psImar reveal */
  (function(){ const d=global.document;
    const els={}; const mk=()=>({style:{display:'none'}, className:'', innerHTML:''});
    global.document={getElementById:id=>(els[id]=els[id]||mk())};
    let called=0, ring=null;
    global.tkgmLoadParcel=function(w){ called++; ring=w; };
    onbDemoParcel();
    T('demo parsel: tkgmLoadParcel 4 koseyle cagrildi', called===1 && Array.isArray(ring) && ring.length===4);
    T('demo parsel: #psImar reveal edildi', els.psImar && els.psImar.style.display==='block');
    T('demo parsel: #psMsg bilgi mesaji', els.psMsg && els.psMsg.style.display==='block' && /ps-ok/.test(els.psMsg.className));
    delete global.tkgmLoadParcel; global.document=d;
  })();

  /* (9) kart isaretlemesi CSS sozlesmesine uygun — kaynak-smoke */
  T('kart: .progBar dolgu cubugu', src.indexOf('<div class="progBar"><i')>=0);
  T('kart: .prog sayac metni', src.indexOf('<div class="prog">')>=0);
  T('kart: .onbClose x glif + aria-label', /class="onbClose"[^>]*aria-label="Turu kapat"[^>]*>×</.test(src));
  T('z-boost: onb3d sinifi kaynakta', src.indexOf("'onb3d'")>=0);

  /* (10) kamera3d check'leri — stub ctx */
  T('kamera-koy: camCount>base', kstep('kamera-koy').check(kamCtx({camCount:()=>1}),0)===true && kstep('kamera-koy').check(kamCtx({camCount:()=>1}),1)===false);
  T('kamera-koy baseline getter', kstep('kamera-koy').baseline(kamCtx({camCount:()=>2}))===2);
  T('aci-ayarla: sig degisti + kamera var', kstep('aci-ayarla').check(kamCtx({camCount:()=>1,lastCamSig:()=>'1,2,3,4,5,6'}),'0,0,0,0,0,0')===true);
  T('aci-ayarla: kamera yoksa false', kstep('aci-ayarla').check(kamCtx({camCount:()=>0,lastCamSig:()=>'x'}),'y')===false);
  T('aci-ayarla: sig ayni -> false', kstep('aci-ayarla').check(kamCtx({camCount:()=>1,lastCamSig:()=>'a'}),'a')===false);
  T('lens-sec: lensSig degisti', kstep('lens-sec').check(kamCtx({lensSig:()=>'24,35'}),'24,24')===true && kstep('lens-sec').check(kamCtx({lensSig:()=>'24,24'}),'24,24')===false);
  T('drone-gec: extMode', kstep('drone-gec').check(kamCtx({extMode:()=>true}))===true && kstep('drone-gec').check(kamCtx())===false);
  T('drone-ekle: extCount>base', kstep('drone-ekle').check(kamCtx({extCount:()=>1}),0)===true && kstep('drone-ekle').check(kamCtx({extCount:()=>1}),1)===false);
  T('render-isaret: extRenderClicked', kstep('render-isaret').check(kamCtx({extRenderClicked:()=>true}))===true && kstep('render-isaret').check(kamCtx())===false);
  /* computeTarget kamera3d adimlariyla da calisir */
  T('kam computeTarget: bos -> 0', ONB.computeTarget(ONB_KAM_STEPS, kamCtx(), {})===0);
  T('kam computeTarget: tumu -> 6', ONB.computeTarget(ONB_KAM_STEPS,
      kamCtx({camCount:()=>2, lastCamSig:()=>'s', lensSig:()=>'l', extMode:()=>true, extCount:()=>1, extRenderClicked:()=>true}),
      {0:0, 1:'eski', 2:'eskiLens', 4:0})===6);
  /* headless canli kamCtx: View3D yok -> guvenli varsayilanlar */
  (function(){ const c=onbKamCtx();
    T('canli kamCtx headless guvenli', c.camUI()===false && c.camCount()===0 && c.lastCamSig()==='' && c.extMode()===false && c.extCount()===0);
  })();

  /* (11) watcher karari — iframe-bypass dahil (saf) */
  const kamT=onbTourById('kamera3d'), anaT=onbTourById('ana');
  const env=o=>Object.assign({active:false,inIframe:false,visible:true,camUI:true},o||{});
  T('watch: kosullar tam + durum yok -> start', onbWatchDecision(kamT, env(), {status:null,v:0})==='start');
  T('watch: IFRAMEDE DE start (iframeAuto bypass)', onbWatchDecision(kamT, env({inIframe:true}), {status:null,v:0})==='start');
  T('watch: active tur varken null', onbWatchDecision(kamT, env({active:true}), {status:null,v:0})===null);
  T('watch: 3B gorunmezken null', onbWatchDecision(kamT, env({visible:false}), {status:null,v:0})===null);
  T('watch: camUI kapaliyken null', onbWatchDecision(kamT, env({camUI:false}), {status:null,v:0})===null);
  T('watch: done -> null (bir kez)', onbWatchDecision(kamT, env(), {status:'done',v:1})===null);
  T('watch: dismissed -> null', onbWatchDecision(kamT, env(), {status:'dismissed',v:1})===null);
  T('watch: active kayit -> resume (3B yeniden acildi)', onbWatchDecision(kamT, env(), {status:'active',v:1})==='resume');
  T('watch: eski surum done -> start (yeniden gezdir)', onbWatchDecision(kamT, env(), {status:'done',v:0})==='start');
  T('watch: watch=false tur -> null', onbWatchDecision(anaT, env(), {status:null,v:0})===null);
  T('watch: iframeAuto=false hipotetik tur iframede null', onbWatchDecision({watch:true,iframeAuto:false,version:1}, env({inIframe:true}), {status:null,v:0})===null);

  /* (12a) ONB_TARGETS demo-paket hedef butunlugu */
  T('ONB_TARGETS tanimli + kaynak/baslik', typeof ONB_TARGETS==='object' && ONB_TARGETS.kaynak==='proje-20260716-4.mskpkg' && ONB_TARGETS.baslik==='3 daire');
  T('ONB_TARGETS parsel koordinat (Google Maps)', ONB_TARGETS.parsel.koordinat==='41.08046386954354, 29.022807303237602');
  T('ONB_TARGETS parsel ilce/mahalle/ada/parsel/alan', ONB_TARGETS.parsel.ilce==='BEŞİKTAŞ' && ONB_TARGETS.parsel.mahalle==='AKAT' && ONB_TARGETS.parsel.ada==='2010' && ONB_TARGETS.parsel.parsel==='257' && ONB_TARGETS.parsel.alan===2058);
  T('ONB_TARGETS imar emsal/taks/hmax', ONB_TARGETS.parsel.imar.emsal===3 && ONB_TARGETS.parsel.imar.maksTaks===0.75 && ONB_TARGETS.parsel.imar.hmax===15.5);
  T('ONB_TARGETS bina tip/kat/bodrum/cati', ONB_TARGETS.bina.tip==='apartman' && ONB_TARGETS.bina.kat===4 && ONB_TARGETS.bina.bodrum===2 && ONB_TARGETS.bina.cati==='kirma');
  T('ONB_TARGETS sinir 8 kose L', ONB_TARGETS.sinir.kose===8 && ONB_TARGETS.sinir.sekil==='L');
  T('ONB_TARGETS bloklar/balkon/kesme', ONB_TARGETS.bloklar===2 && ONB_TARGETS.balkon===10 && ONB_TARGETS.kesme===3);
  T('ONB_TARGETS daireler karmasi + toplam 3', ONB_TARGETS.daireler.length===2 && ONB_TARGETS.daireler[0].acikMutfak===true && ONB_TARGETS.daireler[1].ensuite===true && ONB_TARGETS.daireler.reduce((a,d)=>a+d.adet,0)===3);
  T('ONB_TARGETS kamera 7 ic 3 drone', ONB_TARGETS.kamera.ic===7 && ONB_TARGETS.kamera.drone===3);
  T('ONB.TARGETS export = ONB_TARGETS', ONB.TARGETS===ONB_TARGETS);

  /* (12b) GERIYE-UYUM: targets'siz stub ctx'te HEDEFLI check'ler BUGUNKU davranista */
  T('GERIYE-UYUM sinir-ciz hedefsiz: yalniz closed', step('sinir-ciz').check(baseCtx({closed:()=>true}))===true && step('sinir-ciz').check(baseCtx())===false);
  T('GERIYE-UYUM sinir-ciz hedefsiz: ptsLen yok sayilir', step('sinir-ciz').check(baseCtx({closed:()=>true, ptsLen:()=>0}))===true);
  T('GERIYE-UYUM blok-ekle hedefsiz: base ustu buyume', step('blok-ekle').check(baseCtx({blocksLen:()=>2}),1)===true && step('blok-ekle').check(baseCtx({blocksLen:()=>1}),1)===false);
  T('GERIYE-UYUM: fullCtx (targets yok) hala 13', ONB.computeTarget(ONB_STEPS, fullCtx(), FULL_BASES)===13);

  /* (12c) HEDEFLI toleranslar — targets bagli ctx (sinir-ciz>=6, blok-ekle>=2) */
  const tgCtx = over => baseCtx(Object.assign({ targets:ONB_TARGETS, ptsLen:()=>0 }, over));
  T('HEDEFLI sinir-ciz: closed + pts>=6 -> true', step('sinir-ciz').check(tgCtx({closed:()=>true, ptsLen:()=>6}))===true);
  T('HEDEFLI sinir-ciz: closed + pts=8 -> true', step('sinir-ciz').check(tgCtx({closed:()=>true, ptsLen:()=>8}))===true);
  T('HEDEFLI sinir-ciz: closed + pts=5 -> false (8 kose -> >=6)', step('sinir-ciz').check(tgCtx({closed:()=>true, ptsLen:()=>5}))===false);
  T('HEDEFLI sinir-ciz: kapali degil -> false', step('sinir-ciz').check(tgCtx({closed:()=>false, ptsLen:()=>9}))===false);
  T('HEDEFLI sinir-ciz: targets var ama ptsLen yoksa closed yeterli', step('sinir-ciz').check(baseCtx({targets:ONB_TARGETS, closed:()=>true}))===true);
  T('HEDEFLI blok-ekle: >=2 -> true, 1 -> false', step('blok-ekle').check(tgCtx({blocksLen:()=>2}))===true && step('blok-ekle').check(tgCtx({blocksLen:()=>1}))===false);
  T('HEDEFLI blok-ekle: 3 blok da gecerli', step('blok-ekle').check(tgCtx({blocksLen:()=>3}))===true);

  /* (12d) render-isaret iframe metin dali (onbStepBody saf helper) */
  T('onbStepBody: iframe disi -> body', onbStepBody(kstep('render-isaret'), false)===kstep('render-isaret').body);
  T('onbStepBody: iframe ici -> bodyIframe', onbStepBody(kstep('render-isaret'), true)===kstep('render-isaret').bodyIframe);
  T('render-isaret bodyIframe var + Render Kadraj vurgusu', typeof kstep('render-isaret').bodyIframe==='string' && kstep('render-isaret').bodyIframe.indexOf('Render Kadrajları')>=0 && kstep('render-isaret').bodyIframe.indexOf('kabukta')>=0);
  T('render-isaret ana metin AYNEN (Dış Render)', kstep('render-isaret').body.indexOf('Dış Render düğmesi')>=0);
  T('onbStepBody: bodyIframe olmayan adim iframede de body', onbStepBody(kstep('kamera-koy'), true)===kstep('kamera-koy').body);
  T('ONB.stepBody export', ONB.stepBody===onbStepBody);

  /* (12e) DINAMIK metinler ONB_TARGETS'tan turer (koordinat, '2 blok', '8', daire karmasi...) */
  T('DINAMIK parsel-getir: koordinat metinde', step('parsel-getir').body.indexOf(ONB_TARGETS.parsel.koordinat)>=0);
  T('DINAMIK parsel-getir: ilce/mahalle baslik-harf', step('parsel-getir').body.indexOf('Beşiktaş/Akat')>=0);
  T('DINAMIK parsel-getir: ada/parsel/alan', step('parsel-getir').body.indexOf('ada '+ONB_TARGETS.parsel.ada)>=0 && step('parsel-getir').body.indexOf('parsel '+ONB_TARGETS.parsel.parsel)>=0 && step('parsel-getir').body.indexOf(String(ONB_TARGETS.parsel.alan))>=0);
  T('DINAMIK parsel-sekme: ada/emsal dokusu', step('parsel-sekme').body.indexOf(ONB_TARGETS.parsel.ada)>=0 && step('parsel-sekme').body.indexOf('emsal '+ONB_TARGETS.parsel.imar.emsal)>=0);
  T('DINAMIK cekme-yol: TAKS/Hmax', step('cekme-yol').body.indexOf('TAKS '+ONB_TARGETS.parsel.imar.maksTaks)>=0 && step('cekme-yol').body.indexOf('Hmax '+ONB_TARGETS.parsel.imar.hmax)>=0);
  T('DINAMIK sinir-ciz: kose sayisi + sekil', step('sinir-ciz').body.indexOf(String(ONB_TARGETS.sinir.kose))>=0 && step('sinir-ciz').body.indexOf(ONB_TARGETS.sinir.sekil)>=0);
  T('DINAMIK yerlesim: daire karmasi 2+1/3+1', step('yerlesim').body.indexOf('2+1')>=0 && step('yerlesim').body.indexOf('3+1')>=0 && step('yerlesim').body.indexOf(ONB_TARGETS.baslik)>=0);
  T('DINAMIK blok-ekle: "2 blok"', step('blok-ekle').body.indexOf(ONB_TARGETS.bloklar+' blok')>=0);
  T('DINAMIK kat-ayri: kat+bodrum', step('kat-ayri').body.indexOf(String(ONB_TARGETS.bina.kat))>=0 && step('kat-ayri').body.indexOf(ONB_TARGETS.bina.bodrum+' bodrum')>=0);
  T('DINAMIK kat-gez: kat+bodrum', step('kat-gez').body.indexOf(String(ONB_TARGETS.bina.kat))>=0 && step('kat-gez').body.indexOf('bodrum')>=0);
  T('DINAMIK kamera-koy: 7 ic kamera', kstep('kamera-koy').body.indexOf(String(ONB_TARGETS.kamera.ic))>=0 && kstep('kamera-koy').body.indexOf('iç kamera')>=0);
  T('DINAMIK drone-ekle: 3 drone', kstep('drone-ekle').body.indexOf(String(ONB_TARGETS.kamera.drone))>=0 && kstep('drone-ekle').body.indexOf('drone')>=0);
  T('onbTr Turkce baslik-harf (BESIKTAS/AKAT)', onbTr('BEŞİKTAŞ')==='Beşiktaş' && onbTr('AKAT')==='Akat');
  T('onbTr bos/kenar durumlari', onbTr('')==='' && onbTr(null)==='' && onbTr('A')==='A');
  T('onbDaireOzet formati', onbDaireOzet().indexOf('1 daire 2+1 açık mutfak')>=0 && onbDaireOzet().indexOf('2 daire 3+1 ensuite')>=0);
  /* dinamik metin GERCEKTEN targets'tan turuyor: adim body'leri, sabit degerler ONB_TARGETS'tan uretilebiliyor */
  T('DINAMIK turetim: blok metni sayidan bagimsiz degil', step('blok-ekle').body.indexOf(String(ONB_TARGETS.bloklar))>=0);

  /* eklenen adim alanlari 'tum title/body dolu' + 'emoji yok' sozlesmesini bozmaz */
  T('render-isaret bodyIframe emoji yok', !/[\\u{1F000}-\\u{1FAFF}\\u{2600}-\\u{27BF}]/u.test(kstep('render-isaret').bodyIframe));

  /* ENV GUARD: tarayici degil -> denetleyici duragan (setInterval/watcher kurulmadi) */
  T('onbBrowser()=false (headless)', onbBrowser()===false);
  T('onbActive baslangicta false', onbActive===false && onbTimer===null && onbWatchTimer===null && onbTour===null);
})();
`;

// baseCtx/fullCtx/kamCtx eval kapsaminda gorunur (dogrudan eval, cevresel scope erisimi)
eval(src + asserts);

console.log('onboarding:', pass+' pass, '+fail+' fail');
process.exit(fail?1:0);
