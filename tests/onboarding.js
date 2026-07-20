/* ONBOARDING turlari — saf mantik testi — node tests/onboarding.js
   Modul dosyadan DOGRUDAN okunup eval edilir — app.js'e bagimlilik yok (adim
   dizileri + durum makinesi + normalizasyon saf cozuculeri saf, ctx uzerinden okur).

   ENV GUARD kaniti: window.innerWidth TANIMSIZ (asagidaki window stub'inda yok) ->
   onbBrowser() false -> auto-start / watcher / setInterval / DOM tel orgusu CALISMAZ;
   top-level yalniz tanim yapar.

   v4 "bir kez yaptir gerisi otomatik" (15 adim) kapsam: (1) registry + senaryo butunlugu,
   (2) ana tur check'leri, (3) baseline'li adimlar, (4) computeTarget + ardisik kapi/gate,
   (5) decideStart (surum 2), (6) localStorage + legacy migrasyon, (7) iframe guard,
   (8) ornek parsel reveal, (9) kart CSS sozlesmesi, (10) kamera3d check'leri,
   (11) watcher karari, (12) ONB_TARGETS butunlugu + dinamik metin,
   (13) NORMALIZASYON saf cozuculer (daire/balkon/blok/imkan/kamera) + aksiyonlar,
   (14) fonksiyon hedefi (site-ac akilli) + stepEnter headless guvenligi + ghost-fade. */
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
    doorWinCount:()=>0, siteOn:()=>false, blocksLen:()=>0, amenitiesLen:()=>0,
    balconyCount:()=>0, katAyri:()=>false,
    floorSig:()=>'0|konut', exportClicked:()=>false
  };
  return Object.assign(c, over||{});
}
/* Tum ana adimlari saglayan ctx. baseline'li adimlar yalniz YAKALANMIS tabana gore
   "saglanmis" olur -> FULL_BASES ile gecilir. imkan-koy check MUTLAK (>=9). */
function fullCtx(){
  return baseCtx({
    modePro:()=>true, tabActive:()=>true, parcelLen:()=>4, frontEdge:()=>2,
    closed:()=>true, plan:()=>({}), editCount:()=>5, doorWinCount:()=>2, balconyCount:()=>2,
    siteOn:()=>true, blocksLen:()=>2, amenitiesLen:()=>9, katAyri:()=>true, exportClicked:()=>true,
    floorSig:()=>'2|ticari'
  });
}
/* baseline'li adim indeksleri (16 adim): duvar-cek(5) kapi(6) balkon-ekle(7) blok-ekle(9)
   imkan-koy(12) kat-gez(14). blokA-ciz(3)/yerlesim(4)/blokB-ciz(10)/blokB-yerlesim(11) baseline'siz
   (check=closed/plan); imkan-koy check MUTLAK ama baseline'i var (base yok sayilir).
   NOT: blokB-yerlesim(11) eklendi -> imkan-koy 11->12, kat-gez 13->14 kaydi. */
const FULL_BASES = {5:0, 6:0, 7:0, 9:1, 12:0, 14:'0|konut'};

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
  T('VERSION=4 (REV5) / KAM_VERSION=3', ONB.VERSION===4 && ONB.KAM_VERSION===3);
  T('ana 16 adim (blokB-yerlesim eklendi)', ONB_STEPS.length===16);
  T('kamera3d 6 adim', ONB_KAM_STEPS.length===6);
  const allIds=ONB_STEPS.map(s=>s.id).concat(ONB_KAM_STEPS.map(s=>s.id));
  T('tum adim id benzersiz (turlar arasi dahil)', new Set(allIds).size===allIds.length);
  T('ana id sirasi (blokB-ciz -> blokB-yerlesim -> imkan-koy)', ONB_STEPS.map(s=>s.id).join(',')==='pro-mod,parsel-sekme,parsel-getir,blokA-ciz,yerlesim,duvar-cek,kapi-pencere,balkon-ekle,site-ac,blok-ekle,blokB-ciz,blokB-yerlesim,imkan-koy,kat-ayri,kat-gez,export');
  T('eski id\\'ler kalkti (sinir-ciz/oda-duzenle/blok-b-ciz/cekme-yol)', !ONB_STEPS.find(s=>['sinir-ciz','oda-duzenle','blok-b-ciz','cekme-yol'].indexOf(s.id)>=0));
  T('kamera3d id sirasi', ONB_KAM_STEPS.map(s=>s.id).join(',')==='kamera-koy,aci-ayarla,lens-sec,drone-gec,drone-ekle,render-isaret');
  T('tum check fonksiyon', ONB_STEPS.concat(ONB_KAM_STEPS).every(s=>typeof s.check==='function'));
  T('tum title/body dolu', ONB_STEPS.concat(ONB_KAM_STEPS).every(s=>typeof s.title==='string' && s.title && typeof s.body==='string' && s.body));
  /* target obje YA DA fonksiyon (site-ac akilli hedef) -> coz + gecerli */
  T('tum target gecerli (obje ya da fonksiyon)', ONB_STEPS.concat(ONB_KAM_STEPS).every(s=>{
      const tg = ONB.stepTarget(s, null);
      return tg && (tg.type==='canvas' || (tg.type==='dom' && typeof tg.sel==='string')); }));
  T('emoji yok', !/[\\u{1F000}-\\u{1FAFF}\\u{2600}-\\u{27BF}]/u.test(ONB_STEPS.concat(ONB_KAM_STEPS).map(s=>s.title+s.body).join('')));
  const step=id=>ONB_STEPS.find(s=>s.id===id);
  const kstep=id=>ONB_KAM_STEPS.find(s=>s.id===id);
  T('parsel-getir action var', typeof step('parsel-getir').action.run==='function' && step('parsel-getir').action.label==='Örnek parselle devam');
  T('parsel-getir govde: otomatik cekme notu', step('parsel-getir').body.indexOf('Çekme sınırı')>=0 && step('parsel-getir').body.indexOf('otomatik')>=0);
  T('skippable isaretli (parsel-getir/kapi-pencere/balkon-ekle/site-ac/blok-ekle/blokB-ciz/imkan-koy)', step('parsel-getir').skippable && step('kapi-pencere').skippable && step('balkon-ekle').skippable && step('site-ac').skippable && step('blok-ekle').skippable && step('blokB-ciz').skippable && step('imkan-koy').skippable);
  T('cizim/temel adimlar skippable degil (blokA-ciz/yerlesim/duvar-cek/export/pro-mod/parsel-sekme)', step('blokA-ciz').skippable===false && step('yerlesim').skippable===false && step('duvar-cek').skippable===false && step('export').skippable===false && step('pro-mod').skippable===false && step('parsel-sekme').skippable===false);
  T('needsPro parsel/site/kat-ayri adimlarinda', step('parsel-sekme').needsPro && step('parsel-getir').needsPro && step('site-ac').needsPro && step('kat-ayri').needsPro);
  T('kamera3d cogu skippable (5/6)', ONB_KAM_STEPS.filter(s=>s.skippable).length===5);
  T('render-isaret Bitir action', typeof kstep('render-isaret').action.run==='function' && kstep('render-isaret').action.label==='Bitir');
  T('aci-ayarla hedefi #v3dCamBar (REV5: kamera secili -> cubuk simgede)', kstep('aci-ayarla').target.type==='dom' && kstep('aci-ayarla').target.sel==='#v3dCamBar');
  T('lens-sec hedefi #v3dLRow (REV5: detay kutusu ac)', kstep('lens-sec').target.type==='dom' && kstep('lens-sec').target.sel==='#v3dLRow');
  /* pro-mod giris-saglanmis (Pro zaten acik) uyarlanabilir metin (bodyDone) */
  T('pro-mod bodyDone var + "zaten açık" + İleri', typeof step('pro-mod').bodyDone==='string' && step('pro-mod').bodyDone.indexOf('zaten açık')>=0 && step('pro-mod').bodyDone.indexOf('İleri')>=0);
  T('pro-mod bodyDone emoji yok', !/[\\u{1F000}-\\u{1FAFF}\\u{2600}-\\u{27BF}]/u.test(step('pro-mod').bodyDone));

  /* blokA-ciz (eski sinir-ciz): HAYALET + elle cizim; hedef Çiz araci (#tDraw) */
  T('blokA-ciz title Blok A', step('blokA-ciz').title.indexOf('Blok A')>=0);
  T('blokA-ciz hedefi Çiz araci (#tDraw)', step('blokA-ciz').target.type==='dom' && step('blokA-ciz').target.sel==='#tDraw');
  T('blokA-ciz body elle cizim + hayalet + "örneğe hizalarım"', step('blokA-ciz').body.indexOf('Çiz aracıyla')>=0 && step('blokA-ciz').body.indexOf('köşe köşe')>=0 && step('blokA-ciz').body.indexOf('hayalet')>=0 && step('blokA-ciz').body.indexOf('hizalarım')>=0);
  T('blokA-ciz ghost = blokA', step('blokA-ciz').ghost && step('blokA-ciz').ghost.blocks && step('blokA-ciz').ghost.blocks[0]==='blokA');
  T('blokA-ciz check jenerik (yalniz closed)', step('blokA-ciz').check(baseCtx({closed:()=>true}))===true && step('blokA-ciz').check(baseCtx())===false);
  /* blokB-ciz (eski blok-b-ciz) -> Blok B L HAYALET */
  T('blokB-ciz var + title Blok B', !!step('blokB-ciz') && step('blokB-ciz').title.indexOf('Blok B')>=0);
  T('blokB-ciz hedefi Çiz araci (#tDraw)', step('blokB-ciz').target.type==='dom' && step('blokB-ciz').target.sel==='#tDraw');
  T('blokB-ciz ghost = blokB', step('blokB-ciz').ghost && step('blokB-ciz').ghost.blocks && step('blokB-ciz').ghost.blocks[0]==='blokB');
  T('blokB-ciz body elle cizim + L + hayalet', step('blokB-ciz').body.indexOf('köşe köşe')>=0 && step('blokB-ciz').body.indexOf(ONB_TARGETS.sinir.sekil)>=0 && step('blokB-ciz').body.indexOf('hayalet')>=0);
  T('blokB-ciz check = closed (jenerik)', step('blokB-ciz').check(baseCtx({closed:()=>true}))===true && step('blokB-ciz').check(baseCtx())===false);

  /* duvar-cek (eski oda-duzenle): TEK duvar cektir; ML/otomasyon vurgusu */
  T('duvar-cek title', step('duvar-cek').title.indexOf('duvar')>=0);
  T('duvar-cek canvas hedefi', step('duvar-cek').target.type==='canvas');
  T('duvar-cek body: isaretli duvar + ML/otomatik vurgusu', step('duvar-cek').body.indexOf('işaretli duvarı')>=0 && (step('duvar-cek').body.indexOf('ML')>=0 || step('duvar-cek').body.indexOf('otomat')>=0));
  T('duvar-cek REV5 ghost marker=wall + fullCanvasHole', step('duvar-cek').ghost && step('duvar-cek').ghost.marker==='wall' && step('duvar-cek').fullCanvasHole===true);
  T('balkon-ekle REV5 ghost marker=balcony + fullCanvasHole', step('balkon-ekle').ghost && step('balkon-ekle').ghost.marker==='balcony' && step('balkon-ekle').fullCanvasHole===true);
  T('onbGhostPolys marker=balcony -> markers 1 (SAF, dunya nokta+seg)', (function(){ const r=onbGhostPolys({marker:'balcony'}); return Array.isArray(r.markers) && r.markers.length===1 && typeof r.markers[0].x==='number' && Array.isArray(r.markers[0].seg) && r.markers[0].seg.length===2; })());
  T('onbGhostPolys marker=wall headless -> markers 0 (plan yok)', (function(){ const r=onbGhostPolys({marker:'wall'}); return Array.isArray(r.markers) && r.markers.length===0; })());
  T('duvar-cek check: editCount>base', step('duvar-cek').check(baseCtx({editCount:()=>3}),2)===true && step('duvar-cek').check(baseCtx({editCount:()=>2}),2)===false);
  T('duvar-cek baseline getter', step('duvar-cek').baseline(baseCtx({editCount:()=>7}))===7);

  /* kapi-pencere: HAFIF (10 balkon notu KALKTI) */
  T('kapi-pencere hedefi #tDoor', step('kapi-pencere').target.sel==='#tDoor');
  T('kapi-pencere: "10 balkon" notu KALKTI', step('kapi-pencere').body.indexOf('balkon')<0);
  T('kapi-pencere check: doorWinCount>base', step('kapi-pencere').check(baseCtx({doorWinCount:()=>1}),0)===true && step('kapi-pencere').check(baseCtx({doorWinCount:()=>0}),0)===false);

  /* balkon-ekle (YENI): bir balkon + oto-tamamla; hedef #tBalk; check balconyCount buyume */
  T('balkon-ekle var + hedef #tBalk', !!step('balkon-ekle') && step('balkon-ekle').target.type==='dom' && step('balkon-ekle').target.sel==='#tBalk');
  T('balkon-ekle body: bir tane yeter + kalanini tamamlarim', step('balkon-ekle').body.indexOf('bir tane yeter')>=0 && step('balkon-ekle').body.indexOf('tamamlarım')>=0);
  T('balkon-ekle baseline getter', step('balkon-ekle').baseline(baseCtx({balconyCount:()=>3}))===3);
  T('balkon-ekle check: balconyCount>base', step('balkon-ekle').check(baseCtx({balconyCount:()=>1}),0)===true && step('balkon-ekle').check(baseCtx({balconyCount:()=>0}),0)===false);

  /* site-ac (AKILLI HEDEF fonksiyonu) */
  T('site-ac target FONKSIYON', typeof step('site-ac').target==='function');
  T('site-ac smart: bina tab aktif degil -> sekme butonu', (function(){ const tg=ONB.stepTarget(step('site-ac'), null);
      return tg.type==='dom' && tg.sel==='.ptab[data-tab="bina"]'; })());
  (function(){ const d=global.document;
    global.document={ querySelector:sel=> sel==='.ptab[data-tab="bina"]' ? {classList:{contains:c=>c==='active'}} : null };
    T('site-ac smart: bina tab aktif -> #siteMod', ONB.stepTarget(step('site-ac'), null).sel==='#siteMod');
    global.document=d;
  })();
  T('site-ac check: siteOn', step('site-ac').check(baseCtx({siteOn:()=>true}))===true && step('site-ac').check(baseCtx())===false);

  /* imkan-koy (poligon + AKSIYON + check>=9) */
  T('imkan-koy var + title', !!step('imkan-koy') && step('imkan-koy').title.indexOf('imkan')>=0);
  T('imkan-koy hedefi #tAmenity', step('imkan-koy').target.type==='dom' && step('imkan-koy').target.sel==='#tAmenity');
  T('imkan-koy ghost = amenities', step('imkan-koy').ghost && step('imkan-koy').ghost.amenities===true);
  T('imkan-koy action: Kalan imkanlari otomatik yerlestir', typeof step('imkan-koy').action.run==='function' && step('imkan-koy').action.label==='Kalan imkanları otomatik yerleştir');
  T('imkan-koy check MUTLAK: amenities>=9', step('imkan-koy').check(baseCtx({amenitiesLen:()=>9}))===true && step('imkan-koy').check(baseCtx({amenitiesLen:()=>8}))===false);
  T('imkan-koy body: havuz + poligon + üçgen espri', step('imkan-koy').body.indexOf('Havuz')>=0 && step('imkan-koy').body.indexOf('poligon')>=0 && step('imkan-koy').body.indexOf('üçgen')>=0);

  /* (2) diger ana check dogruluklari — stub ctx */
  T('pro-mod: modePro', step('pro-mod').check(baseCtx({modePro:()=>true}))===true && step('pro-mod').check(baseCtx())===false);
  T('parsel-sekme: tabActive', step('parsel-sekme').check(baseCtx({tabActive:()=>true}))===true);
  T('parsel-getir: parcelLen>=3', step('parsel-getir').check(baseCtx({parcelLen:()=>3}))===true && step('parsel-getir').check(baseCtx({parcelLen:()=>2}))===false);
  T('yerlesim: plan!=null', step('yerlesim').check(baseCtx({plan:()=>({})}))===true && step('yerlesim').check(baseCtx())===false);
  T('kat-ayri: katAyri', step('kat-ayri').check(baseCtx({katAyri:()=>true}))===true);
  T('export: exportClicked', step('export').check(baseCtx({exportClicked:()=>true}))===true && step('export').check(baseCtx())===false);

  /* (3) baseline'li adimlar — buyume kontrolu */
  T('blok-ekle: blocksLen>base', step('blok-ekle').check(baseCtx({blocksLen:()=>2}),1)===true && step('blok-ekle').check(baseCtx({blocksLen:()=>1}),1)===false);
  T('kat-gez: floorSig degisti', step('kat-gez').check(baseCtx({floorSig:()=>'2|ticari'}),'0|konut')===true && step('kat-gez').check(baseCtx(),'0|konut')===false);

  /* (4) computeTarget = ARDISIK KAPI: ilk saglanmayan VEYA giris-saglanmis-İleri-bekleyen adimda durur */
  T('bos ctx -> 0', ONB.computeTarget(ONB_STEPS, baseCtx(), {})===0);
  T('yalniz adim1 -> 1', ONB.computeTarget(ONB_STEPS, baseCtx({modePro:()=>true}), {})===1);
  T('tumu saglandi -> 16 (bitti)', ONB.computeTarget(ONB_STEPS, fullCtx(), FULL_BASES)===16);
  T('ardisik kapi: gap yutmaz (plan var, pro yok -> 0)', ONB.computeTarget(ONB_STEPS, baseCtx({plan:()=>({})}), {})===0);
  T('ardisik kapi: gap yutmaz (adim0-1 ok, parsel-getir degil, plan ok -> 2)', ONB.computeTarget(ONB_STEPS, baseCtx({modePro:()=>true,tabActive:()=>true,plan:()=>({})}), {})===2);
  T('baseline aktif adim senkronu (duvar-cek->kapi-pencere -> 6)', ONB.computeTarget(ONB_STEPS, baseCtx({modePro:()=>true,tabActive:()=>true,parcelLen:()=>4,closed:()=>true,plan:()=>({}),editCount:()=>5}), {5:2})===6);
  T('gate: adim0 saglanmis+gate -> 0 (İleri bekler, atlamaz)', ONB.computeTarget(ONB_STEPS, baseCtx({modePro:()=>true}), {}, {0:true})===0);
  T('gate: adim0 saglanmis+gate YOK -> 1 (oto gecer)', ONB.computeTarget(ONB_STEPS, baseCtx({modePro:()=>true}), {}, {})===1);
  T('gate: adim1 gate -> 1', ONB.computeTarget(ONB_STEPS, baseCtx({modePro:()=>true,tabActive:()=>true}), {}, {1:true})===1);
  T('gate: gate=false adim atlanir', ONB.computeTarget(ONB_STEPS, baseCtx({modePro:()=>true,tabActive:()=>true}), {}, {0:false,1:false})===2);

  /* (5) decideStart durum makinesi — tur-surumlu (surum 3) */
  T('force -> start', ONB.decideStart({status:'done',v:3}, true, 3)==='start');
  T('active+ayni surum -> resume', ONB.decideStart({status:'active',v:3}, false, 3)==='resume');
  T('active+eski surum -> start', ONB.decideStart({status:'active',v:2}, false, 3)==='start');
  T('done+ayni surum -> idle', ONB.decideStart({status:'done',v:3}, false, 3)==='idle');
  T('done+eski surum (v2) -> start (16-adim revizyonu yeniden gezdirir)', ONB.decideStart({status:'done',v:2}, false, 3)==='start');
  T('dismissed+ayni surum -> idle', ONB.decideStart({status:'dismissed',v:3}, false, 3)==='idle');
  T('durum yok -> start', ONB.decideStart({status:null,v:0}, false, 3)==='start');
  T('ver verilmezse ONB_VERSION(4) varsayilir', ONB.decideStart({status:'done',v:4}, false)==='idle');

  /* (6) localStorage tur-kapsamli anahtarlar + legacy migrasyon */
  const ana=onbTourById('ana'), kam=onbTourById('kamera3d');
  onbSet('onb.ana.step','7'); T('onbStepStored(ana) round-trip', onbStepStored(ana)===7);
  onbSet('onb.kamera3d.step','3'); T('onbStepStored(kamera3d) bagimsiz', onbStepStored(kam)===3 && onbStepStored(ana)===7);
  onbSet('onb.ana.step','abc'); T('stepStored bozuk -> 0', onbStepStored(ana)===0);
  onbDel('onb.ana.step'); onbDel('onb.kamera3d.step');
  onbSet('onb.status','done'); onbSet('onb.step','12'); onbSet('onb.v','1');
  T('migrasyon calisti', onbMigrateLegacy()===true);
  T('migrasyon: ana.status=done', onbGet('onb.ana.status')==='done');
  T('migrasyon: ana.step=12', onbGet('onb.ana.step')==='12');
  T('migrasyon: ana.v=1', onbGet('onb.ana.v')==='1');
  T('migrasyon: eski anahtarlar silindi', onbGet('onb.status')===null && onbGet('onb.step')===null && onbGet('onb.v')===null);
  T('migrasyon idempotent (legacy yok -> false)', onbMigrateLegacy()===false);
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

  /* (8) ornek parsel — BIZIM parsel (ONB_TARGETS.parsel.geo) motor globallerine DOGRUDAN kurulur */
  (function(){ const d=global.document;
    const els={}; const mk=()=>({style:{display:'none'}, className:'', innerHTML:'', value:''});
    global.document={getElementById:id=>(els[id]=els[id]||mk())};
    global.parcelPts=[]; global.parcelClosed=false; global.parcelRot=0; global.psFrontEdge=99; global.parcelImar=null;
    let setbackCalls=0, renderCalls=0, fitCalls=0, syncCalls=0, imarArg='__none__';
    global.psComputeSetback=function(){ setbackCalls++; };
    global.imarRender=function(im){ imarArg=im; };
    global.psSyncRotUI=function(){ syncCalls++; };
    global.render=function(){ renderCalls++; };
    global.fitView=function(){ fitCalls++; };
    onbDemoParcel();
    const geo=ONB_TARGETS.parsel.geo;
    T('demo parsel: parcelPts = geo.pts 5 nokta BIREBIR', Array.isArray(global.parcelPts) && global.parcelPts.length===5 &&
        global.parcelPts.every((p,i)=>p.x===geo.pts[i].x && p.y===geo.pts[i].y));
    T('demo parsel: parcelClosed=true', global.parcelClosed===true);
    T('demo parsel: parcelRot = geo.rot (-1.5153..)', global.parcelRot===geo.rot && global.parcelRot===-1.5153036887208142);
    T('demo parsel: psFrontEdge sifirlandi (-1)', global.psFrontEdge===-1);
    T('demo parsel: parcelImar ada/emsal/taks/hmax/provider', !!global.parcelImar && global.parcelImar.ada==='2010' &&
        global.parcelImar.emsal===3 && global.parcelImar.maksTaks===0.75 && global.parcelImar.hmax===15.5 && global.parcelImar.provider==='istanbul');
    T('demo parsel: parcelImar KOPYA (sabit ONB_TARGETS.geo.imar mutasyona ugramaz)', global.parcelImar!==geo.imar);
    T('demo parsel: imarRender parcelImar ile cagrildi', imarArg===global.parcelImar);
    T('demo parsel: motor hatti (setback/render/fitView/syncRotUI) cagrildi', setbackCalls===1 && renderCalls===1 && fitCalls===1 && syncCalls===1);
    T('demo parsel: #psImar reveal edildi', els.psImar && els.psImar.style.display==='block');
    T('demo parsel: #psMsg bilgi mesaji (ada 2010)', els.psMsg && els.psMsg.style.display==='block' && /ps-ok/.test(els.psMsg.className) && /ada 2010/.test(els.psMsg.innerHTML));
    delete global.psComputeSetback; delete global.imarRender; delete global.psSyncRotUI; delete global.render; delete global.fitView;
    delete global.parcelPts; delete global.parcelClosed; delete global.parcelRot; delete global.psFrontEdge; delete global.parcelImar;
    global.document=d;
  })();

  /* (9) kart isaretlemesi CSS sozlesmesine uygun — kaynak-smoke */
  T('kart: .progBar dolgu cubugu', src.indexOf('<div class="progBar"><i')>=0);
  T('kart: .prog sayac metni', src.indexOf('<div class="prog">')>=0);
  T('kart: .onbClose x glif + aria-label', /class="onbClose"[^>]*aria-label="Turu kapat"[^>]*>×</.test(src));
  T('z-boost: onb3d sinifi kaynakta', src.indexOf("'onb3d'")>=0);

  /* (10) kamera3d check'leri — stub ctx */
  /* HEDEFLI (imkan-koy deseni): tam demo seti (7 ic + 3 drone) yerlesene dek gecmez —
     TEK kamera adimi gecirmemeli (aksi halde "Kalan kameralari otomatik yerlestir" atlanir). */
  T('kamera-koy: tam demo seti (ic>=7 && drone>=3) gerekir',
    kstep('kamera-koy').check(kamCtx({camCount:()=>7, extCount:()=>3}))===true
    && kstep('kamera-koy').check(kamCtx({camCount:()=>7, extCount:()=>0}))===false
    && kstep('kamera-koy').check(kamCtx({camCount:()=>1, extCount:()=>3}))===false);
  T('kamera-koy baseline getter', kstep('kamera-koy').baseline(kamCtx({camCount:()=>2}))===2);
  T('kamera-koy action: Kalan kameralari otomatik yerlestir', typeof kstep('kamera-koy').action.run==='function' && kstep('kamera-koy').action.label==='Kalan kameraları otomatik yerleştir');
  T('aci-ayarla: sig degisti + kamera var', kstep('aci-ayarla').check(kamCtx({camCount:()=>1,lastCamSig:()=>'1,2,3,4,5,6'}),'0,0,0,0,0,0')===true);
  T('aci-ayarla: kamera yoksa false', kstep('aci-ayarla').check(kamCtx({camCount:()=>0,lastCamSig:()=>'x'}),'y')===false);
  T('aci-ayarla: sig ayni -> false', kstep('aci-ayarla').check(kamCtx({camCount:()=>1,lastCamSig:()=>'a'}),'a')===false);
  T('lens-sec: lensSig degisti', kstep('lens-sec').check(kamCtx({lensSig:()=>'24,35'}),'24,24')===true && kstep('lens-sec').check(kamCtx({lensSig:()=>'24,24'}),'24,24')===false);
  T('drone-gec: extMode', kstep('drone-gec').check(kamCtx({extMode:()=>true}))===true && kstep('drone-gec').check(kamCtx())===false);
  T('drone-ekle: REV5 baseline-delta (extCount>base; kullanici 1 drone ekler)', typeof kstep('drone-ekle').baseline==='function' && kstep('drone-ekle').baseline(kamCtx({extCount:()=>2}))===2 && kstep('drone-ekle').check(kamCtx({extCount:()=>3}),2)===true && kstep('drone-ekle').check(kamCtx({extCount:()=>2}),2)===false);
  T('render-isaret: extRenderClicked', kstep('render-isaret').check(kamCtx({extRenderClicked:()=>true}))===true && kstep('render-isaret').check(kamCtx())===false);
  T('kam computeTarget: bos -> 0', ONB.computeTarget(ONB_KAM_STEPS, kamCtx(), {})===0);
  T('kam computeTarget: tumu -> 6 (REV5: drone-ekle baseline delta)', ONB.computeTarget(ONB_KAM_STEPS,
      kamCtx({camCount:()=>7, lastCamSig:()=>'s', lensSig:()=>'l', extMode:()=>true, extCount:()=>3, extRenderClicked:()=>true}),
      {0:0, 1:'eski', 2:'eskiLens', 4:2})===6);   // 4:drone-ekle giris-tabani (extCount 3>2 -> saglandi)
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
  T('watch: done -> null (bir kez)', onbWatchDecision(kamT, env(), {status:'done',v:3})===null);
  T('watch: dismissed -> null', onbWatchDecision(kamT, env(), {status:'dismissed',v:3})===null);
  T('watch: active kayit -> resume (3B yeniden acildi)', onbWatchDecision(kamT, env(), {status:'active',v:3})==='resume');
  T('watch: eski surum done -> start (yeniden gezdir)', onbWatchDecision(kamT, env(), {status:'done',v:1})==='start');
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
  T('ONB_TARGETS.parsel.geo 5 nokta + kapali + rot', (function(){ const g=ONB_TARGETS.parsel.geo;
      return g && Array.isArray(g.pts) && g.pts.length===5 && g.closed===true && g.rot===-1.5153036887208142; })());
  T('ONB_TARGETS.parsel.geo pts eksene-hizali (ilk/son nokta)', (function(){ const p=ONB_TARGETS.parsel.geo.pts;
      return p[0].x===43 && p[0].y===12.5 && p[4].x===-27 && p[4].y===11; })());
  T('ONB_TARGETS.parsel.geo.imar KIRPILMIS (scan/snippet YOK) + provider', (function(){ const im=ONB_TARGETS.parsel.geo.imar;
      return im && im.ada==='2010' && im.parsel==='257' && im.emsal===3 && im.maksTaks===0.75 && im.hmax===15.5 &&
             im.provider==='istanbul' && im.scan===null && !('snippet' in im); })());

  /* (12a-2) GHOST hedef geometrileri */
  T('ONB_TARGETS.blokA 4 kose dikdortgen + label A + alan', (function(){ const b=ONB_TARGETS.blokA;
      return b && Array.isArray(b.pts) && b.pts.length===4 && b.label==='A' && b.alan===240 &&
             b.pts[0].x===-25 && b.pts[0].y===-10 && b.pts[2].x===-5 && b.pts[2].y===2; })());
  T('ONB_TARGETS.blokB 8 kose L + label B + alan', (function(){ const b=ONB_TARGETS.blokB;
      return b && Array.isArray(b.pts) && b.pts.length===8 && b.label==='B' && b.alan===420 &&
             b.pts[0].x===38.5 && b.pts[0].y===-11.5 && b.pts[7].x===28.5 && b.pts[7].y===-11.5; })());
  T('ONB_TARGETS.imkanlar 9 kutu {type,x,y,w,h}', (function(){ const a=ONB_TARGETS.imkanlar;
      return Array.isArray(a) && a.length===9 && a.every(o=>typeof o.type==='string' && ['green','playground','pool','ornament','seating'].indexOf(o.type)>=0 &&
             typeof o.x==='number' && typeof o.y==='number' && o.w>0 && o.h>0); })());
  T('ONB_TARGETS.imkanlar tip dagilimi (havuz1 oyun1 sus2 yesil5)', (function(){ const c={}; ONB_TARGETS.imkanlar.forEach(a=>c[a.type]=(c[a.type]||0)+1);
      return c.pool===1 && c.playground===1 && c.ornament===2 && c.green===5; })());

  /* (12a-3) YENI: balkonlar + kameralar demo setleri */
  T('ONB_TARGETS.balkonlar 5 kayit (blok A; ei/t0/t1/depth)', (function(){ const b=ONB_TARGETS.balkonlar;
      return Array.isArray(b) && b.length===5 && b.every(x=>typeof x.ei==='number' && typeof x.t0==='number' && typeof x.t1==='number' && typeof x.depth==='number'); })());
  T('ONB_TARGETS.kameralar 7 ic + 3 drone (slim; __floor/__block YOK)', (function(){ const K=ONB_TARGETS.kameralar;
      return K && Array.isArray(K.ic) && K.ic.length===7 && Array.isArray(K.drone) && K.drone.length===3 &&
             K.ic.every(c=>!('__floor' in c) && !('__block' in c) && c.pos && c.target && c.lens===24) &&
             K.drone.every(c=>!('__floor' in c) && !('__block' in c) && c.pos && c.target && typeof c.__cx==='number'); })());

  /* (12a-4) onbGhostPolys SAF cozucu */
  T('onbGhostPolys blokA -> 1 poligon 4 nokta + label', (function(){ const r=onbGhostPolys({blocks:['blokA']});
      return r.polys.length===1 && r.rects.length===0 && r.polys[0].pts.length===4 && r.polys[0].label==='A'; })());
  T('onbGhostPolys blokB -> 1 poligon 8 nokta + label', (function(){ const r=onbGhostPolys({blocks:['blokB']});
      return r.polys.length===1 && r.polys[0].pts.length===8 && r.polys[0].label==='B'; })());
  T('onbGhostPolys amenities -> 9 kutu', (function(){ const r=onbGhostPolys({amenities:true});
      return r.rects.length===9 && r.polys.length===0; })());
  T('onbGhostPolys bos spec -> bos', (function(){ const r=onbGhostPolys(null); return r.polys.length===0 && r.rects.length===0; })());
  T('ONB.ghostPolys export', ONB.ghostPolys===onbGhostPolys);
  T('blokA-ciz ghost cozumu = blokA poligon', onbGhostPolys(step('blokA-ciz').ghost).polys.length===1);
  T('blokB-ciz ghost cozumu = blokB poligon', onbGhostPolys(step('blokB-ciz').ghost).polys[0].pts.length===8);
  T('imkan-koy ghost cozumu = 9 imkan', onbGhostPolys(step('imkan-koy').ghost).rects.length===9);

  /* (12a-5) onbImkanOzet + ctx accessor'lari */
  T('onbImkanOzet okunur ozet (havuz + park + 5 yesil + 2 sus)', (function(){ const s=onbImkanOzet();
      return s.indexOf('yüzme havuzu')>=0 && s.indexOf('çocuk parkı')>=0 && s.indexOf('5 yeşil alan')>=0 && s.indexOf('2 süs havuzu')>=0; })());
  T('ONB.imkanOzet export', ONB.imkanOzet===onbImkanOzet);
  T('onbLiveCtx amenitiesLen headless -> 0 (amenities tanimsiz)', onbLiveCtx().amenitiesLen()===0);
  T('onbLiveCtx balconyCount headless -> 0 (balconies tanimsiz)', onbLiveCtx().balconyCount()===0);

  /* (13) NORMALIZASYON — SAF cozuculer */
  T('demoUnitSpecs: motor anahtari acik (acikMutfak DEGIL)', (function(){ const u=ONB.demoUnitSpecs();
      return u.length===2 && u[0].acik===true && u[0].oda===2 && u[0].adet===1 && !('acikMutfak' in u[0]) && u[0].ensuite===false &&
             u[1].ensuite===true && u[1].oda===3 && u[1].adet===2 && u[1].acik===false; })());
  T('demoBalconies: 5 kayit + kopya (ONB_TARGETS.balkonlar mutasyona ugramaz)', (function(){ const b=ONB.demoBalconies();
      b[0].depth=999; return ONB.demoBalconies().length===5 && ONB_TARGETS.balkonlar[0].depth!==999; })());
  T('blockFootprint blokA 4 nokta KOPYA', (function(){ const f=ONB.blockFootprint('blokA');
      return f.length===4 && f!==ONB_TARGETS.blokA.pts && f[0].x===ONB_TARGETS.blokA.pts[0].x && f[0]!==ONB_TARGETS.blokA.pts[0]; })());
  T('blockFootprint blokB 8 nokta', ONB.blockFootprint('blokB').length===8);
  T('blockFootprint bilinmeyen -> []', ONB.blockFootprint('yok').length===0);
  T('imkanCenter bbox merkezi', (function(){ const c=ONB.imkanCenter({x:0,y:0,w:10,h:8}); return c.x===5 && c.y===4; })());
  T('imkanCenter pts centroid', (function(){ const c=ONB.imkanCenter({pts:[{x:0,y:0},{x:4,y:0},{x:4,y:4},{x:0,y:4}]}); return c.x===2 && c.y===2; })());
  T('imkanPlaced eslesme (tip + merkez tolerans)', (function(){ const t=ONB_TARGETS.imkanlar.find(a=>a.type==='pool'); const c=ONB.imkanCenter(t);
      return ONB.imkanPlaced(t, [{type:'pool', x:c.x-1, y:c.y-1, w:2, h:2}])===true &&
             ONB.imkanPlaced(t, [{type:'green', x:c.x, y:c.y, w:2, h:2}])===false &&
             ONB.imkanPlaced(t, [])===false; })());
  T('amenityRecord: bbox\\'tan pts turetir + M1 semasi {type,pts,ang}', (function(){ const r=ONB.amenityRecord({type:'pool',x:0,y:0,w:10,h:8});
      return r.type==='pool' && r.ang===0 && Array.isArray(r.pts) && r.pts.length===4 && r.pts[2].x===10 && r.pts[2].y===8 && r.x===0 && r.w===10; })());
  T('amenityRecord: pts VARSA korunur', (function(){ const r=ONB.amenityRecord({type:'pool',x:0,y:0,w:6,h:6,pts:[{x:0,y:0},{x:6,y:0},{x:3,y:6}]});
      return r.pts.length===3 && r.pts[2].x===3 && r.pts[2].y===6; })());
  T('remainingImkanlar bos -> 9 (hepsi kalan)', ONB.remainingImkanlar([]).length===9);
  T('remainingImkanlar havuz konmus -> 8', (function(){ const pool=ONB_TARGETS.imkanlar.find(a=>a.type==='pool');
      return ONB.remainingImkanlar([{type:'pool',x:pool.x,y:pool.y,w:pool.w,h:pool.h}]).length===8; })());
  T('remainingImkanlar kayitlari M1 semasi (pts)', (function(){ const r=ONB.remainingImkanlar([]); return r.every(a=>Array.isArray(a.pts) && a.pts.length>=3 && typeof a.type==='string'); })());
  T('slimCams __floor/__block/__blockIdx/__blockName DUSER', (function(){ const s=ONB.slimCams([{id:'c',pos:{x:1},__floor:3,__block:0,__blockIdx:0,__blockName:'A',lens:24}]);
      return s.length===1 && !('__floor' in s[0]) && !('__block' in s[0]) && !('__blockIdx' in s[0]) && !('__blockName' in s[0]) && s[0].id==='c' && s[0].lens===24; })());
  T('slimCams drone __cx/__cz KORUR', (function(){ const s=ONB.slimCams(ONB_TARGETS.kameralar.drone); return s.length===3 && typeof s[0].__cx==='number' && typeof s[0].__cz==='number' && !('__block' in s[0]); })());
  /* export kancalari */
  T('ONB normalizasyon export\\'lari', typeof ONB.demoUnitSpecs==='function' && typeof ONB.demoBalconies==='function' && typeof ONB.blockFootprint==='function' && typeof ONB.remainingImkanlar==='function' && typeof ONB.slimCams==='function' && typeof ONB.stepTarget==='function' && typeof ONB.stepEnter==='function');
  /* stepEnter headless GUVENLI (motor globalleri yok -> no-op, throw yok) */
  T('stepEnter headless throw ETMEZ', (function(){ try{ ['blokA-ciz','yerlesim','balkon-ekle','site-ac','blokB-ciz','blokB-yerlesim','imkan-koy','kat-ayri','export'].forEach(id=>ONB.stepEnter(id)); return true; }catch(e){ return false; } })());

  /* (12b) GERIYE-UYUM: hedefli-tolerans YOK -> check'ler JENERIK */
  T('JENERIK blokA-ciz: yalniz closed', step('blokA-ciz').check(baseCtx({closed:()=>true}))===true && step('blokA-ciz').check(baseCtx())===false);
  T('JENERIK blok-ekle: base ustu buyume', step('blok-ekle').check(baseCtx({blocksLen:()=>2}),1)===true && step('blok-ekle').check(baseCtx({blocksLen:()=>1}),1)===false);
  T('GERIYE-UYUM: fullCtx hala 16', ONB.computeTarget(ONB_STEPS, fullCtx(), FULL_BASES)===16);

  /* (12d) render-isaret iframe metin dali (onbStepBody saf helper) */
  T('onbStepBody: iframe disi -> body', onbStepBody(kstep('render-isaret'), false)===kstep('render-isaret').body);
  T('onbStepBody: iframe ici -> bodyIframe', onbStepBody(kstep('render-isaret'), true)===kstep('render-isaret').bodyIframe);
  T('render-isaret bodyIframe var + Render Kadraj vurgusu', typeof kstep('render-isaret').bodyIframe==='string' && kstep('render-isaret').bodyIframe.indexOf('Render Kadrajları')>=0 && kstep('render-isaret').bodyIframe.indexOf('kabukta')>=0);
  T('render-isaret ana metin AYNEN (Dış Render)', kstep('render-isaret').body.indexOf('Dış Render düğmesi')>=0);
  T('onbStepBody: bodyIframe olmayan adim iframede de body', onbStepBody(kstep('kamera-koy'), true)===kstep('kamera-koy').body);
  T('ONB.stepBody export', ONB.stepBody===onbStepBody);

  /* (12e) DINAMIK metinler ONB_TARGETS'tan turer */
  T('DINAMIK parsel-getir: koordinat metinde', step('parsel-getir').body.indexOf(ONB_TARGETS.parsel.koordinat)>=0);
  T('DINAMIK parsel-getir: ilce/mahalle baslik-harf', step('parsel-getir').body.indexOf('Beşiktaş/Akat')>=0);
  T('DINAMIK parsel-getir: ada/parsel/alan', step('parsel-getir').body.indexOf('ada '+ONB_TARGETS.parsel.ada)>=0 && step('parsel-getir').body.indexOf('parsel '+ONB_TARGETS.parsel.parsel)>=0 && step('parsel-getir').body.indexOf(String(ONB_TARGETS.parsel.alan))>=0);
  T('DINAMIK parsel-sekme: ada/emsal dokusu', step('parsel-sekme').body.indexOf(ONB_TARGETS.parsel.ada)>=0 && step('parsel-sekme').body.indexOf('emsal '+ONB_TARGETS.parsel.imar.emsal)>=0);
  T('DINAMIK blokB-ciz: L kose sayisi + sekil + alan', step('blokB-ciz').body.indexOf(String(ONB_TARGETS.sinir.kose))>=0 && step('blokB-ciz').body.indexOf(ONB_TARGETS.sinir.sekil)>=0 && step('blokB-ciz').body.indexOf(String(ONB_TARGETS.blokB.alan))>=0);
  T('DINAMIK blokA-ciz: Blok A alan', step('blokA-ciz').body.indexOf(String(ONB_TARGETS.blokA.alan))>=0);
  T('DINAMIK yerlesim (Blok A): TEK daire 3+1 ensuite + "Blok A"', step('yerlesim').body.indexOf('3+1')>=0 && step('yerlesim').body.indexOf('Blok A')>=0 && step('yerlesim').title.indexOf('Blok A')>=0);
  T('DINAMIK blokB-yerlesim: 2+1 acik + 3+1 ensuite (B karmasi)', step('blokB-yerlesim').body.indexOf('2+1')>=0 && step('blokB-yerlesim').body.indexOf('açık mutfak')>=0 && step('blokB-yerlesim').body.indexOf('3+1')>=0);
  T('DINAMIK balkon-ekle: balkon sayisi (10)', step('balkon-ekle').body.indexOf(String(ONB_TARGETS.balkon))>=0);
  T('DINAMIK blok-ekle: "2 blok"', step('blok-ekle').body.indexOf(ONB_TARGETS.bloklar+' blok')>=0);
  T('DINAMIK kat-ayri: kat+bodrum', step('kat-ayri').body.indexOf(String(ONB_TARGETS.bina.kat))>=0 && step('kat-ayri').body.indexOf(ONB_TARGETS.bina.bodrum+' bodrum')>=0);
  T('DINAMIK kat-gez: kat+bodrum', step('kat-gez').body.indexOf(String(ONB_TARGETS.bina.kat))>=0 && step('kat-gez').body.indexOf('bodrum')>=0);
  T('DINAMIK kamera-koy: 7 ic kamera', kstep('kamera-koy').body.indexOf(String(ONB_TARGETS.kamera.ic))>=0 && kstep('kamera-koy').body.indexOf('iç kamera')>=0);
  T('DINAMIK drone-ekle: 3 drone', kstep('drone-ekle').body.indexOf(String(ONB_TARGETS.kamera.drone))>=0 && kstep('drone-ekle').body.indexOf('drone')>=0);
  T('onbTr Turkce baslik-harf (BESIKTAS/AKAT)', onbTr('BEŞİKTAŞ')==='Beşiktaş' && onbTr('AKAT')==='Akat');
  T('onbTr bos/kenar durumlari', onbTr('')==='' && onbTr(null)==='' && onbTr('A')==='A');
  T('onbDaireOzet formati (argsiz = top-level)', onbDaireOzet().indexOf('1 daire 2+1 açık mutfak')>=0 && onbDaireOzet().indexOf('2 daire 3+1 ensuite')>=0);

  /* ================= (15) SABAH-TESTI REV — 6 DUZELTME ================= */
  /* FIX1 — BLOK-FARKINDA daire karmasi (paket teyitli: A tek 3+1 ensuite; B 1x2+1 acik + 2x3+1) */
  T('FIX1 blokA.daireler TEK daire 3+1 ensuite', (function(){ const d=ONB_TARGETS.blokA.daireler;
      return Array.isArray(d) && d.length===1 && d[0].oda===3 && d[0].salon===1 && d[0].ensuite===true && d[0].adet===1 && !d[0].acikMutfak; })());
  T('FIX1 blokB.daireler 1x2+1 acik + 2x3+1 ensuite', (function(){ const d=ONB_TARGETS.blokB.daireler;
      return Array.isArray(d) && d.length===2 && d[0].oda===2 && d[0].acikMutfak===true && d[0].adet===1 && d[1].oda===3 && d[1].ensuite===true && d[1].adet===2; })());
  T('FIX1 demoUnitSpecs("blokA") TEK kayit motor formati (acik)', (function(){ const u=ONB.demoUnitSpecs('blokA');
      return u.length===1 && u[0].oda===3 && u[0].ensuite===true && u[0].acik===false && u[0].adet===1 && !('acikMutfak' in u[0]); })());
  T('FIX1 demoUnitSpecs("blokB") 2 kayit (2+1 acik + 3+1 ensuite)', (function(){ const u=ONB.demoUnitSpecs('blokB');
      return u.length===2 && u[0].oda===2 && u[0].acik===true && u[0].ensuite===false && u[1].oda===3 && u[1].ensuite===true && u[1].acik===false && u[1].adet===2; })());
  T('FIX1 demoUnitSpecs() argsiz = top-level (B aynasi, geriye-uyum)', (function(){ const u=ONB.demoUnitSpecs();
      return u.length===2 && u[0].oda===2 && u[0].acik===true && u[1].oda===3 && u[1].ensuite===true; })());
  T('FIX1 onbDaireOzet("blokA") = "1 daire 3+1 ensuite"', onbDaireOzet('blokA')==='1 daire 3+1 ensuite');
  T('FIX1 onbDaireOzet("blokB") = B karmasi', onbDaireOzet('blokB').indexOf('1 daire 2+1 açık mutfak')>=0 && onbDaireOzet('blokB').indexOf('2 daire 3+1 ensuite')>=0);

  /* FIX2 — blokB-yerlesim adimi (Blok B icin "Yerlesimi Olustur") */
  T('FIX2 blokB-yerlesim var + title + hedef #genBtn + check plan + skippable degil', (function(){ const s=step('blokB-yerlesim');
      return !!s && s.title.indexOf('Blok B')>=0 && s.target.type==='dom' && s.target.sel==='#genBtn' &&
        s.check(baseCtx({plan:()=>({})}))===true && s.check(baseCtx())===false && s.skippable===false; })());
  T('FIX2 blokB-yerlesim blokB-ciz SONRASI, imkan-koy ONCESI', (function(){ const ids=ONB_STEPS.map(s=>s.id);
      return ids.indexOf('blokB-yerlesim')===ids.indexOf('blokB-ciz')+1 && ids.indexOf('blokB-yerlesim')===ids.indexOf('imkan-koy')-1; })());

  /* FIX3/FIX5 — cizim adimlarinda fullCanvasHole (karartma kalkti); Daireler sekmesi export'u */
  T('FIX5 fullCanvasHole: blokA-ciz/blokB-ciz/imkan-koy', step('blokA-ciz').fullCanvasHole===true && step('blokB-ciz').fullCanvasHole===true && step('imkan-koy').fullCanvasHole===true);
  T('FIX5 fullCanvasHole: dugme-hedefli adimlarda YOK (yerlesim/blokB-yerlesim/kat-ayri)', !step('yerlesim').fullCanvasHole && !step('blokB-yerlesim').fullCanvasHole && !step('kat-ayri').fullCanvasHole);

  /* FIX4 — export iframe-farkinda (paket-odakli): standalone #svgBtn AYNEN, iframe HEDEFSIZ + Bitir */
  T('FIX4 export target FONKSIYON', typeof step('export').target==='function');
  T('FIX4 export standalone (iframe disi) -> #svgBtn hedefi', (function(){ const tg=ONB.stepTarget(step('export'), null); return tg.type==='dom' && tg.sel==='#svgBtn'; })());
  (function(){ const w=global.window;
    global.window={addEventListener(){}, self:{a:1}, top:{b:2}};   // iframe simulasyonu (onbInIframe -> true)
    T('FIX4 export iframe -> HEDEFSIZ (svgBtn hedeflenMEZ)', ONB.stepTarget(step('export'), null).type==='none');
    global.window=w;
  })();
  T('FIX4 export bodyIframe: "Paket İndir" + "3B Görüntüle"', onbStepBody(step('export'), true).indexOf('Paket İndir')>=0 && onbStepBody(step('export'), true).indexOf('3B Görüntüle')>=0);
  T('FIX4 export standalone body SVG (AYNEN)', step('export').body.indexOf('SVG')>=0);
  T('FIX4 export action Bitir + actionIframeOnly', typeof step('export').action.run==='function' && step('export').action.label==='Bitir' && step('export').actionIframeOnly===true);
  T('FIX4 export bodyIframe emoji yok', !/[\\u{1F000}-\\u{1FAFF}\\u{2600}-\\u{27BF}]/u.test(step('export').bodyIframe));

  /* ================= (16) REV3 — PURUZSUZLUK DUZELTMELERI ================= */
  /* IS 5 — IMKAN-KOY AKSIYON SIRASI: "Kalan imkanlari otomatik yerlestir" ancak ILK imkan
     cizilince (amenitiesLen>base) belirir; giriste GIZLI. onbActionReadyFor kapisi. */
  T('IS5 imkan-koy actionAfterFirst isaretli', step('imkan-koy').actionAfterFirst===true);
  T('IS5 diger aksiyonlu adimlar actionAfterFirst DEGIL (parsel-getir/kamera-koy/render-isaret)',
    !step('parsel-getir').actionAfterFirst && !kstep('kamera-koy').actionAfterFirst && !kstep('render-isaret').actionAfterFirst);
  T('IS5 ONB.actionReadyFor export', typeof ONB.actionReadyFor==='function');
  T('IS5 actionReadyFor: aksiyonsuz adim -> false', ONB.actionReadyFor(step('pro-mod'))===false);
  T('IS5 actionReadyFor: kosulsuz aksiyon (parsel-getir) -> true', ONB.actionReadyFor(step('parsel-getir'))===true);
  (function(){ var st=onbTour, bs=onbBases, ix=onbIdx;
    onbIdx=12; onbBases={12:0};   // imkan-koy indeksi
    onbTour={ ctx:function(){ return baseCtx({amenitiesLen:()=>0}); } };
    T('IS5 actionReadyFor: giriste (0 imkan) aksiyon GIZLI', ONB.actionReadyFor(step('imkan-koy'))===false);
    onbTour={ ctx:function(){ return baseCtx({amenitiesLen:()=>1}); } };
    T('IS5 actionReadyFor: ilk imkan sonrasi aksiyon GORUNUR', ONB.actionReadyFor(step('imkan-koy'))===true);
    onbTour=st; onbBases=bs; onbIdx=ix;
  })();

  /* IS 6 — TUR DUGMESI = KALDIGIN YERDEN: onbRelaunch resume-farkinda (active/dismissed+step>0
     + ayni surum -> resume; taze/done/surum-bump -> bastan). Export mevcut (davranis browser). */
  T('IS6 ONB.relaunch export', typeof ONB.relaunch==='function');

  /* ENV GUARD: tarayici degil -> denetleyici duragan (setInterval/watcher kurulmadi) */
  T('onbBrowser()=false (headless)', onbBrowser()===false);
  T('onbActive baslangicta false', onbActive===false && onbTimer===null && onbWatchTimer===null && onbTour===null);
})();
`;

// baseCtx/fullCtx/kamCtx eval kapsaminda gorunur (dogrudan eval, cevresel scope erisimi)
eval(src + asserts);

console.log('onboarding:', pass+' pass, '+fail+' fail');
process.exit(fail?1:0);
