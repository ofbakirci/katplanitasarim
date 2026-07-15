'use strict';
/* ================= interaktif onboarding turlari (coklu-tur registry) =================
   KPTA'yi ilk kez acan kullaniciyi gezdiren spotlight'li rehber turlar.
   v2: TEK tur -> TUR REGISTRY'si (ONB_TOURS). Her turun kendi adimlari, kendi
   localStorage anahtarlari (onb.<turId>.status/.step/.v), kendi ctx getter'i,
   kendi tetikleyicisi var. Su an iki tur:
     - 'ana'      : 13 adimlik genel KPTA turu (#onbStart / ?onb=1 / ilk acilis)
     - 'kamera3d' : 3B kamera yerlestirme mini-turu (kamera UI'i acilinca watcher tetikler)

   MIMARI NOTLARI
   - Klasik script (diger modullerle AYNI global scope). Motor globallerini DOGRUDAN
     okur (plan, closed, parcelPts, blocks, activeFloor, editHistory, siteOn(), mode...)
     ama HER ZAMAN typeof-guard'li — cekirdek dosyalara kanca/monkey-patch YOK.
   - Saf mantik (adim dizileri + onbComputeTarget/onbDecideStart/onbWatchDecision/
     onbMigrateLegacy) her ortamda tanimlidir -> headless test edilebilir. check'ler
     yalniz `ctx` uzerinden okur (canli getter tur tanimindaki ctx; testte stub gecilir).
   - ENV GUARD: dosya test harness'inde de eval edilir (window={addEventListener(){}},
     setInterval YOK, window.innerWidth undefined). Auto-start, watcher, setInterval ve
     DOM tel orgusu YALNIZ gercek tarayicida (onbBrowser). Top-level'da yalniz tanim.
   - KAMERA3D SINYALLERI (view3d.js public API, hepsi typeof-guard'li):
       * tetik/adim-oncesi: View3D.isCamUIEnabled() (resmi bayrak); eski gomulu motor icin
         camPreviewForTest().camUI'ye dusulur. Ikisi de yoksa false -> watcher tetiklenmez, tur bozulmaz.
       * kameralar: View3D.getCameras() / getExteriorCameras() / isExteriorMode()
       * 3B gorunurluk: #view3dOverlay VAR ve style.display==='block'
         (view3d.js open'da 'block', close'da 'none'; getMap() close sonrasi null
         OLMADIGINDAN ona guvenilmez). Tur aktifken 3B kapanirsa gizle, acilinca surdur.
   - Z-INDEX: #view3dOverlay inline z-index:9999 -> varsayilan spotlight (60/61) altta
     kalir. kamera3d turunda overlay+karta 'onb3d' sinifi takilir (styles.css:
     #onbOverlay.onb3d z-index:10001, .onbCard.onb3d z-index:10002).
   - SOZLESME (kabuk + styles.css): #onbStart dugmesi; CSS id/class'lari #onbOverlay,
     .onbCard, .onbCard h3/p/.prog/.progBar>i/.onbBtns/.onbSkip/.onbNext/.onbClose,
     .onbPulse, .onb3d.
   - EMOJI YASAK: ikon gerekirse icons.js icon() (typeof-guard'li) ya da duz metin. */

/* ---- senaryo surumleri: adimlar degisince ARTIR -> done/dismissed kullanici yeniden gezer ---- */
const ONB_VERSION = 1;        // 'ana' turu
const ONB_KAM_VERSION = 1;    // 'kamera3d' turu

/* ================= ANA TUR — 13 adim =================
   Adim semasi: {id, title, body, target:{type:'dom',sel}|{type:'canvas'[,sel]},
   needsPro, skippable, baseline?(ctx)->v, check(ctx, base)->bool, action?:{label,run}}
   check() YALNIZ ctx uzerinden okur (canli: onbLiveCtx; test: stub). */
const ONB_STEPS = [
  { id:'pro-mod', needsPro:false, skippable:false,
    title:'Profesyonel moda geç',
    body:'Parsel ve imar araçları Profesyonel modda açılır. Üst köşedeki Profesyonel düğmesine dokun.',
    target:{type:'dom', sel:'#modePro'},
    check:function(ctx){ return ctx.modePro(); } },

  { id:'parsel-sekme', needsPro:true, skippable:false,
    title:'Parsel/İmar sekmesi',
    body:'Sol paneldeki Parsel/İmar sekmesini aç — parseli buradan getireceğiz.',
    target:{type:'dom', sel:'.ptab[data-tab="parsel"]'},
    check:function(ctx){ return ctx.tabActive(); } },

  { id:'parsel-getir', needsPro:true, skippable:true,
    title:'Parseli getir',
    body:'Koordinat ya da Google Maps bağlantısıyla gerçek parseli çek. Denemek istersen örnek parselle de devam edebilirsin.',
    target:{type:'dom', sel:'#psFetch'},
    action:{ label:'Örnek parselle devam', run:function(){ onbDemoParcel(); } },
    check:function(ctx){ return ctx.parcelLen() >= 3; } },

  { id:'cekme-yol', needsPro:true, skippable:true,
    title:'Çekme ve yol cephesi',
    body:'İmar çekme mesafelerini gir ya da yola bakan cepheyi seç. Yapı sınırı bunlara göre içerlek çizilir.',
    target:{type:'dom', sel:'.ps-cekme-grid'},
    baseline:function(ctx){ return ctx.cekme(); },
    check:function(ctx, base){ return ctx.frontEdge() >= 0 || ctx.cekme() !== base; } },

  { id:'sinir-ciz', needsPro:false, skippable:false,
    title:'Yapı sınırını çiz',
    body:'"Parsele yapı sınırı çiz" düğmesine bas, sonra tuvalde bina dış hattını tıklayarak kapat.',
    target:{type:'dom', sel:'#psDrawBld'},
    check:function(ctx){ return ctx.closed(); } },

  { id:'yerlesim', needsPro:false, skippable:false,
    title:'Yerleşimi oluştur',
    body:'"Yerleşimi Oluştur" düğmesi daireleri otomatik yerleştirir.',
    target:{type:'dom', sel:'#genBtn'},
    check:function(ctx){ return !!ctx.plan(); } },

  { id:'oda-duzenle', needsPro:false, skippable:false,
    title:'Odaları düzenle',
    body:'Tuvalde duvarları sürükle, oda tiplerini değiştir — plan senin elinde şekillenir.',
    target:{type:'canvas'},
    baseline:function(ctx){ return ctx.editCount(); },
    check:function(ctx, base){ return ctx.editCount() > (base||0); } },

  { id:'kapi-pencere', needsPro:false, skippable:true,
    title:'Kapı ve pencere',
    body:'Kapı ya da Pencere aracını seç, duvara tıklayarak ekle veya taşı.',
    target:{type:'dom', sel:'#tDoor'},
    baseline:function(ctx){ return ctx.doorWinCount(); },
    check:function(ctx, base){ return ctx.doorWinCount() > (base||0); } },

  { id:'site-ac', needsPro:true, skippable:true,
    title:'Site modunu aç',
    body:'Birden çok blok yerleştirmek için Site (çoklu blok) anahtarını aç.',
    target:{type:'dom', sel:'#siteMod'},
    check:function(ctx){ return ctx.siteOn(); } },

  { id:'blok-ekle', needsPro:false, skippable:true,
    title:'Blok ekle',
    body:'Yeni blok ekleyip her birini ayrı planlayabilirsin. Blok sekmelerinden ekle.',
    target:{type:'dom', sel:'#blockTabs'},
    baseline:function(ctx){ return ctx.blocksLen(); },
    check:function(ctx, base){ return ctx.blocksLen() > (base||0); } },

  { id:'kat-ayri', needsPro:true, skippable:true,
    title:'Katları ayrı planla',
    body:'Her katı bağımsız planlamak için "Katları ayrı planla" anahtarını aç.',
    target:{type:'dom', sel:'#katAyri'},
    check:function(ctx){ return ctx.katAyri(); } },

  { id:'kat-gez', needsPro:false, skippable:true,
    title:'Katlarda gez',
    body:'Kat sekmelerinden katlar arasında geç; kat kullanımını (konut, ticari, otopark) seç.',
    target:{type:'dom', sel:'#floorTabs'},
    baseline:function(ctx){ return ctx.floorSig(); },
    check:function(ctx, base){ return ctx.floorSig() !== base; } },

  { id:'export', needsPro:false, skippable:false,
    title:'Planı dışa aktar',
    body:'Hazır! Planı SVG olarak indir ya da daha sonra "İçe aktar" ile geri yükle.',
    target:{type:'dom', sel:'#svgBtn'},
    check:function(ctx){ return ctx.exportClicked(); } }
];

/* ================= KAMERA3D MINI-TURU — 6 adim =================
   NOT: plandaki 1-2 BIRLESTIRILDI — "kamera-araci" adiminin tamamlanma sinyali
   (camUI aktif) turun TETIGIYLE ayni oldugundan adim aninda gecerdi (bos adim);
   rail bilgisi kamera-koy'un govdesine tasindi. Tum check'ler ctx (View3D poll'u). */
const ONB_KAM_STEPS = [
  { id:'kamera-koy', skippable:true,
    title:'Kamera yerleştir',
    body:'Kamera aracı raydan açıldı. Dock\'taki Ekle ile plana iç kamera koy — tıkladığın nokta kameranın yeri olur.',
    target:{type:'dom', sel:'#v3dPlaceBtn'},
    baseline:function(ctx){ return ctx.camCount(); },
    check:function(ctx, base){ return ctx.camCount() > (base||0); } },

  { id:'aci-ayarla', skippable:true,
    title:'Açıyı ayarla',
    body:'Kamerayı sürükleyerek taşı ya da Yön ile bakış noktasını değiştir — önizleme anında güncellenir.',
    target:{type:'canvas', sel:'#view3dOverlay canvas'},
    baseline:function(ctx){ return ctx.lastCamSig(); },
    check:function(ctx, base){ return ctx.camCount() > 0 && ctx.lastCamSig() !== base; } },

  { id:'lens-sec', skippable:true,
    title:'Lens seç',
    body:'16-24-35-50 mm lensler görüş açısını değiştirir: küçük sayı geniş açı, büyük sayı yakın plan.',
    target:{type:'dom', sel:'#v3dLRow'},
    baseline:function(ctx){ return ctx.lensSig(); },
    check:function(ctx, base){ return ctx.lensSig() !== base; } },

  { id:'drone-gec', skippable:true,
    title:'Drone moduna geç',
    body:'Dış çekim için raydan Drone aracına geç — sahne dış cepheye döner.',
    target:{type:'dom', sel:'[data-grp="drone"]'},
    check:function(ctx){ return ctx.extMode(); } },

  { id:'drone-ekle', skippable:true,
    title:'Drone kamerası ekle',
    body:'"+ Drone Ekle" ile binanın etrafına dış kamera yerleştir.',
    target:{type:'dom', sel:'[data-v3d="extadd"]'},
    baseline:function(ctx){ return ctx.extCount(); },
    check:function(ctx, base){ return ctx.extCount() > (base||0); } },

  { id:'render-isaret', skippable:false,
    title:'Dış Render',
    body:'Hazır! Dış Render düğmesi yerleştirdiğin drone açılarından görsel üretir. İstediğin zaman buradan devam edebilirsin.',
    target:{type:'dom', sel:'[data-v3d="extrender"]'},
    action:{ label:'Bitir', run:function(){ onbFinish(); } },
    check:function(ctx){ return ctx.extRenderClicked(); } }
];

/* ================= TUR REGISTRY =================
   {id, version, steps, ctx()->stateGetter, iframeAuto (iframe'de auto-start OK),
    zBoost ('onb3d' sinifi tak), visible?()->bool (false iken turu gizle/duraklat),
    watch (arka plan watcher'i bu turu tetikler)} */
const ONB_TOURS = [
  { id:'ana',      version:ONB_VERSION,     steps:ONB_STEPS,     ctx:function(){ return onbLiveCtx(); },
    iframeAuto:false, zBoost:false, visible:null, watch:false },
  { id:'kamera3d', version:ONB_KAM_VERSION, steps:ONB_KAM_STEPS, ctx:function(){ return onbKamCtx(); },
    iframeAuto:true,  zBoost:true,  visible:function(){ return onbV3dVisible(); }, watch:true }
];
function onbTourById(id){ for(let i=0;i<ONB_TOURS.length;i++) if(ONB_TOURS[i].id===id) return ONB_TOURS[i]; return null; }

/* ================= saf durum makinesi (her ortamda) ================= */

/* Verili adim dizisi + ctx icin gosterilecek adim indeksi: EN ILERI saglanan adimin
   BIR SONRASI (kullanici sirayi atladiysa oraya senkronlan). Tumu saglandiysa
   steps.length doner (= tur bitti). bases: {idx:baseline} — ziyaret edilmis
   baseline'li adimlarin yakalanmis taban degerleri; yoksa taze hesaplanir. */
function onbComputeTarget(steps, ctx, bases){
  let far = -1;
  for(let i=0; i<steps.length; i++){
    const s = steps[i];
    let base;
    if(bases && (i in bases)) base = bases[i];
    else if(s.baseline){ try{ base = s.baseline(ctx); }catch(e){ base = undefined; } }
    let ok = false;
    try{ ok = !!s.check(ctx, base); }catch(e){ ok = false; }
    if(ok) far = i;
  }
  return far + 1;   // >= steps.length => tur bitti
}

/* Depolanmis duruma gore baslatma karari: 'start' | 'resume' | 'idle'.
   Senaryo surumu degismisse (v!==ver) done/dismissed dahi olsa yeniden gezdir. */
function onbDecideStart(stored, force, ver){
  if(ver===undefined) ver=ONB_VERSION;
  if(force) return 'start';
  if(stored && stored.status === 'active') return (stored.v === ver) ? 'resume' : 'start';
  if(stored && (stored.status === 'done' || stored.status === 'dismissed'))
    return (stored.v === ver) ? 'idle' : 'start';
  return 'start';   // hic durum yok -> ilk kez
}

/* Watcher karari (kamera3d tetigi) — SAF: env={active,inIframe,visible,camUI}.
   FARK: iframeAuto'lu tur iframe'de DE tetiklenir (mesken prototipi kamera adimi
   bu turun asil sahnesi); digerleri iframe'de tetiklenmez. */
function onbWatchDecision(tour, env, stored){
  if(!tour || !tour.watch) return null;
  if(env.active) return null;                       // zaten bir tur calisiyor
  if(env.inIframe && !tour.iframeAuto) return null;
  if(!env.visible || !env.camUI) return null;
  const d = onbDecideStart(stored, false, tour.version);
  return (d==='start' || d==='resume') ? d : null;
}

/* Eski TEK-TUR anahtarlarini (onb.status/.step/.v) 'ana' turuna tasi.
   KARAR: v-bump DEGIL migrasyon — mevcut kullanicinin done/dismissed durumu
   korunur (ana turu yeniden dayatilmaz). Idempotent; eski anahtarlar silinir. */
function onbMigrateLegacy(){
  const st = onbGet('onb.status');
  if(st == null) return false;
  if(onbGet('onb.ana.status') == null){
    onbSet('onb.ana.status', st);
    const sp = onbGet('onb.step'); if(sp != null) onbSet('onb.ana.step', sp);
    const v  = onbGet('onb.v');    if(v  != null) onbSet('onb.ana.v', v);
  }
  onbDel('onb.status'); onbDel('onb.step'); onbDel('onb.v');
  return true;
}

/* ================= canli state getter'lar (tarayici; testte stub) ================= */
function onbEl(id){ try{ return (typeof document!=='undefined' && document.getElementById) ? document.getElementById(id) : null; }catch(e){ return null; } }
function onbSel(sel){ try{ return (typeof document!=='undefined' && document.querySelector) ? document.querySelector(sel) : null; }catch(e){ return null; } }
function onbHasBodyClass(c){ try{ return !!(document.body && document.body.classList && document.body.classList.contains(c)); }catch(e){ return false; } }
function onbVisible(el){ try{ const r=el.getBoundingClientRect(); return r.width>0 && r.height>0; }catch(e){ return false; } }
function onbEsc(s){ return String(s==null?'':s).replace(/[&<>]/g, c=> c==='&'?'&amp;' : c==='<'?'&lt;' : '&gt;'); }

function onbDoorWinCount(){
  if(typeof editHistory==='undefined' || !editHistory || !editHistory.length) return 0;
  let n=0; for(let i=0;i<editHistory.length;i++){ const e=editHistory[i]; if(e && (e.type==='door' || e.type==='window')) n++; }
  return n;
}
function onbCekmeSig(){
  const ids=['psCekme','psCekmeOn','psCekmeYan','psCekmeArka']; let s='';
  for(let i=0;i<ids.length;i++){ const el=onbEl(ids[i]); s += '|' + (el ? String(el.value) : ''); }
  return s;
}
function onbFloorSig(){
  const f = (typeof activeFloor!=='undefined') ? activeFloor : 0;
  const kk = onbEl('katKullanim');
  return f + '|' + (kk ? String(kk.value) : 'konut');
}
function onbLiveCtx(){
  return {
    modePro:      function(){ return onbHasBodyClass('mode-pro'); },
    tabActive:    function(){ const e=onbSel('.ptab[data-tab="parsel"]'); return !!(e && e.classList && e.classList.contains('active')); },
    parcelLen:    function(){ return (typeof parcelPts!=='undefined' && parcelPts) ? parcelPts.length : 0; },
    frontEdge:    function(){ return (typeof psFrontEdge!=='undefined') ? psFrontEdge : -1; },
    cekme:        function(){ return onbCekmeSig(); },
    closed:       function(){ return (typeof closed!=='undefined') ? !!closed : false; },
    plan:         function(){ return (typeof plan!=='undefined') ? plan : null; },
    editCount:    function(){ return (typeof editHistory!=='undefined' && editHistory) ? editHistory.length : 0; },
    doorWinCount: function(){ return onbDoorWinCount(); },
    siteOn:       function(){ return (typeof siteOn==='function') ? !!siteOn() : false; },
    blocksLen:    function(){ return (typeof blocks!=='undefined' && blocks) ? blocks.length : 0; },
    katAyri:      function(){ const e=onbEl('katAyri'); return !!(e && e.checked); },
    floorSig:     function(){ return onbFloorSig(); },
    exportClicked:function(){ return !!onbExportFlag; }
  };
}

/* --- kamera3d ctx: View3D public API poll'u (hepsi try/catch + typeof guard) --- */
function onbV3d(){ try{ return (typeof window!=='undefined' && window.View3D) ? window.View3D : null; }catch(e){ return null; } }
function onbV3dVisible(){
  const o=onbEl('view3dOverlay');
  return !!(o && o.style && o.style.display==='block');
}
function onbKamCams(){ const v=onbV3d(); try{ return (v && typeof v.getCameras==='function') ? (v.getCameras()||[]) : []; }catch(e){ return []; } }
function onbKamExt(){ const v=onbV3d(); try{ return (v && typeof v.getExteriorCameras==='function') ? (v.getExteriorCameras()||[]) : []; }catch(e){ return []; } }
function onbKamCtx(){
  return {
    /* resmi bayrak isCamUIEnabled; eski motor gomulmusse camPreviewForTest'e (teshis ucu) dusulur */
    camUI:function(){ const v=onbV3d();
      try{
        if(v && typeof v.isCamUIEnabled==='function') return !!v.isCamUIEnabled();
        return !!(v && typeof v.camPreviewForTest==='function' && v.camPreviewForTest().camUI);
      }catch(e){ return false; } },
    camCount:function(){ return onbKamCams().length; },
    /* aktif kamera indeksi public DEGIL -> son eklenen (dizinin sonu) izlenir */
    lastCamSig:function(){ const c=onbKamCams(); if(!c.length) return '';
      try{ const l=c[c.length-1], r=function(n){ return Math.round((+n||0)*100)/100; };
        return [r(l.pos.x),r(l.pos.y),r(l.pos.z),r(l.target.x),r(l.target.y),r(l.target.z)].join(','); }
      catch(e){ return ''; } },
    lensSig:function(){ try{ return onbKamCams().map(function(c){ return c.lens||24; }).join(','); }catch(e){ return ''; } },
    extMode:function(){ const v=onbV3d();
      try{ return !!(v && typeof v.isExteriorMode==='function' && v.isExteriorMode()); }catch(e){ return false; } },
    extCount:function(){ return onbKamExt().length; },
    extRenderClicked:function(){ return !!onbExtRenderFlag; }
  };
}

/* ornek (statik) parsel — AG CAGRISIZ demo ring'i tkgmLoadParcel yoluyla yukle
   (psProj yoksa savunmaci yol parcelPts'i dogrudan yazar). ~32x22 m dikdortgen.
   ONEMLI: parsel.js applyData() (gercek TKGM akisi) parseli yukledikten sonra
   #psImar blogunu acar (display:block) — adim 5'in hedefi #psDrawBld o blogun
   ICINDE. applyData initParselSorgu closure'i (disaridan cagirilamaz), bu yuzden
   esdeger reveal'i burada yapariz; imarLoad (ag) bilincli atlanir. */
function onbDemoParcel(){
  if(typeof tkgmLoadParcel!=='function') return;
  const world=[{x:-16,y:-11},{x:16,y:-11},{x:16,y:11},{x:-16,y:11}];
  try{ tkgmLoadParcel(world.map(function(p){ return {x:p.x, y:p.y}; })); }catch(e){ return; }
  const imar=onbEl('psImar'); if(imar && imar.style) imar.style.display='block';
  const msg=onbEl('psMsg');
  if(msg && msg.style){ msg.style.display='block'; msg.className='ps-msg ps-ok';
    msg.innerHTML='Örnek parsel yüklendi <span class="ps-dim">(demo — TKGM sorgusu yapılmadı)</span>'; }
}

/* ================= calisma zamani denetleyicisi (yalniz tarayici) ================= */
let onbTour     = null;          // aktif tur (ONB_TOURS elemani) | null
let onbActive   = false;
let onbIdx      = 0;
let onbPaused   = false;         // needsPro adiminda Basit moda dusuldu -> duraklat karti
let onbHidden   = false;         // tur.visible() false (3B kapandi) -> UI gizli, bekle
let onbBases    = {};            // {idx: yakalanmis baseline}
let onbTimer    = null;          // ~250ms algilama dongusu (tur aktifken)
let onbWatchTimer = null;        // ~750ms tetik watcher'i (kamera3d)
let onbRaf      = 0;             // spotlight takip rAF
let onbExportFlag = false;       // #svgBtn/#impBtn tiklandi (ana adim 13)
let onbExtRenderFlag = false;    // [data-v3d="extrender"] tiklandi (kamera3d adim 6)
let onbUI       = null;          // {svg,bg,hole,holeC,dim,card}
let onbWired    = false;         // resize/scroll dinleyicisi bir kez

function onbBrowser(){ return typeof window!=='undefined' && typeof window.innerWidth==='number' && typeof document!=='undefined'; }

/* --- localStorage (try/catch) — anahtarlar TUR-KAPSAMLI: onb.<turId>.<alan> --- */
function onbGet(k){ try{ return (typeof localStorage!=='undefined' && localStorage) ? localStorage.getItem(k) : null; }catch(e){ return null; } }
function onbSet(k,v){ try{ if(typeof localStorage!=='undefined' && localStorage) localStorage.setItem(k,v); }catch(e){} }
function onbDel(k){ try{ if(typeof localStorage!=='undefined' && localStorage && localStorage.removeItem) localStorage.removeItem(k); }catch(e){} }
function onbStepStored(tour){ const n=parseInt(onbGet('onb.'+tour.id+'.step'),10); return isNaN(n)?0:n; }
function onbStored(tour){
  return { status:onbGet('onb.'+tour.id+'.status'),
           v:(parseInt(onbGet('onb.'+tour.id+'.v'),10)||0),
           step:onbStepStored(tour) };
}

function onbUrlForce(){
  try{ return typeof location!=='undefined' && location.search && /[?&]onb=1(?:&|$)/.test(location.search); }
  catch(e){ return false; }
}

/* Gomulu iframe tespiti (mesken prototipi motoru srcdoc iframe'de calistirir).
   srcdoc iframe same-origin -> window.top erisimi guvenli; yine de cross-origin
   ihtimaline karsi try/catch (erisim FIRLATIYORSA kesin iframe'deyiz -> true). */
function onbInIframe(){
  try{ return typeof window!=='undefined' && window.self !== window.top; }
  catch(e){ return true; }
}

/* --- UI kur / yik --- */
function onbBuildUI(){
  if(onbUI || typeof document==='undefined' || !document.body) return;
  const NS='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(NS,'svg'); svg.setAttribute('id','onbOverlay');
  const defs=document.createElementNS(NS,'defs');
  const mask=document.createElementNS(NS,'mask'); mask.setAttribute('id','onbHoleMask'); mask.setAttribute('maskUnits','userSpaceOnUse');
  const bg=document.createElementNS(NS,'rect'); bg.setAttribute('x',0); bg.setAttribute('y',0); bg.setAttribute('fill','#fff');
  const hole=document.createElementNS(NS,'rect'); hole.setAttribute('fill','#000'); hole.setAttribute('rx',8);
  const holeC=document.createElementNS(NS,'circle'); holeC.setAttribute('fill','#000'); holeC.setAttribute('r',0); holeC.setAttribute('class','onbPulse');
  mask.appendChild(bg); mask.appendChild(hole); mask.appendChild(holeC); defs.appendChild(mask);
  const dim=document.createElementNS(NS,'rect'); dim.setAttribute('id','onbDim'); dim.setAttribute('x',0); dim.setAttribute('y',0);
  dim.setAttribute('fill','var(--scrim)'); dim.setAttribute('mask','url(#onbHoleMask)');
  svg.appendChild(defs); svg.appendChild(dim);
  const card=document.createElement('div'); card.className='onbCard';
  document.body.appendChild(svg); document.body.appendChild(card);
  onbUI={svg:svg, bg:bg, hole:hole, holeC:holeC, dim:dim, card:card};
  card.addEventListener('click', onbCardClick);
  if(!onbWired){ onbWired=true;
    window.addEventListener('resize', function(){ if(onbActive) onbReposition(); });
    window.addEventListener('scroll', function(){ if(onbActive) onbReposition(); }, {passive:true, capture:true});
  }
}
function onbTeardown(){ if(onbUI){ try{ onbUI.svg.remove(); onbUI.card.remove(); }catch(e){} onbUI=null; } }
/* z-boost: 3B overlay (inline z-index:9999) ustunde kalmak icin 'onb3d' sinifi */
function onbApplyZBoost(on){
  if(!onbUI) return;
  try{ onbUI.svg.classList.toggle('onb3d', !!on); onbUI.card.classList.toggle('onb3d', !!on); }catch(e){}
}
/* tur.visible() false iken UI'yi gizle (durum korunur, 3B tekrar acilinca surer) */
function onbSetHidden(h){
  if(!onbUI) return;
  onbUI.svg.style.display = h ? 'none' : '';
  onbUI.card.style.display = h ? 'none' : '';
}

/* --- kart --- */
function onbCardClick(e){
  const b=(e.target && e.target.closest) ? e.target.closest('[data-onb]') : null; if(!b) return;
  const a=b.getAttribute('data-onb');
  if(a==='close') onbStop('dismissed');
  else if(a==='skip') onbSkip();
  else if(a==='pro'){ const m=onbEl('modePro'); if(m && m.click) m.click(); }
  else if(a==='act'){ const s=onbTour && onbTour.steps[onbIdx]; if(s && s.action && typeof s.action.run==='function') s.action.run(); }
}
function onbRenderCard(){
  if(!onbUI || !onbUI.card || !onbTour) return;
  const s=onbTour.steps[onbIdx]; if(!s) return;
  const total=onbTour.steps.length, n=onbIdx+1, pct=Math.round(n/total*100);
  const ic=(typeof icon==='function') ? icon('bulb','inl') : '';
  let btns='';
  if(s.skippable) btns += '<button type="button" class="onbSkip" data-onb="skip">Atla</button>';
  if(onbPaused) btns += '<button type="button" class="onbAct onbNext" data-onb="pro">Profesyonel moda geç</button>';
  else if(s.action && s.action.label) btns += '<button type="button" class="onbAct onbNext" data-onb="act">'+onbEsc(s.action.label)+'</button>';
  const text = onbPaused
    ? 'Bu adım Profesyonel modda çalışır. Devam etmek için Profesyonel moda geç.'
    : onbEsc(s.body);
  /* CSS sozlesmesi (styles.css): baslik=h3, metin=p, sayac=.prog,
     ilerleme cubugu=.progBar>i, kapat=24x24 ikon-buton (.onbClose, absolute kose). */
  onbUI.card.innerHTML =
      '<button type="button" class="onbClose" data-onb="close" aria-label="Turu kapat" title="Turu kapat">×</button>'
    + '<h3 class="onbTitle">'+ic+'<span>'+onbEsc(s.title)+'</span></h3>'
    + '<p class="onbText">'+text+'</p>'
    + '<div class="prog">'+n+' / '+total+'</div>'
    + '<div class="progBar"><i style="width:'+pct+'%"></i></div>'
    + '<div class="onbBtns">'+btns+'</div>';
}

/* --- spotlight (delik) + kart konumu --- */
function onbTargetRect(){
  const s=onbTour && onbTour.steps[onbIdx]; if(!s) return {kind:'none'};
  if(s.target && s.target.type==='canvas'){
    /* sel verilirse o tuval (kamera3d: #view3dOverlay canvas), yoksa ana #canvasWrap */
    const w = s.target.sel ? onbSel(s.target.sel) : onbEl('canvasWrap');
    if(w && w.getBoundingClientRect && onbVisible(w)) return {kind:'canvas', rect:w.getBoundingClientRect()};
    return {kind:'none'};
  }
  if(s.target && s.target.type==='dom'){
    const el=onbSel(s.target.sel);
    if(el && el.getBoundingClientRect && onbVisible(el)) return {kind:'dom', rect:el.getBoundingClientRect()};
    return {kind:'none'};
  }
  return {kind:'none'};
}
function onbPositionCard(rect){
  if(!onbUI || !onbUI.card) return;
  const M=12, GAP=14, vw=window.innerWidth, vh=window.innerHeight;
  const w=onbUI.card.offsetWidth||300, h=onbUI.card.offsetHeight||160;
  let x, y;
  if(!rect){ x=(vw-w)/2; y=(vh-h)/2; }
  else{
    x=rect.left+rect.width/2-w/2;
    y=rect.bottom+GAP;
    if(y+h>vh-M) y=rect.top-GAP-h;      // altina sigmazsa ustune
    if(y<M) y=M;
  }
  x=Math.max(M, Math.min(x, vw-w-M));
  y=Math.max(M, Math.min(y, vh-h-M));
  onbUI.card.style.left=x+'px'; onbUI.card.style.top=y+'px';
}
function onbReposition(){
  if(!onbUI || onbHidden || typeof window==='undefined') return;
  const vw=window.innerWidth, vh=window.innerHeight;
  onbUI.svg.setAttribute('width',vw); onbUI.svg.setAttribute('height',vh);
  onbUI.bg.setAttribute('width',vw); onbUI.bg.setAttribute('height',vh);
  onbUI.dim.setAttribute('width',vw); onbUI.dim.setAttribute('height',vh);
  const t=onbTargetRect();
  if(t.kind==='dom'){ const r=t.rect, pad=6;
    onbUI.hole.setAttribute('x', r.left-pad); onbUI.hole.setAttribute('y', r.top-pad);
    onbUI.hole.setAttribute('width', Math.max(0, r.width+pad*2)); onbUI.hole.setAttribute('height', Math.max(0, r.height+pad*2));
    onbUI.holeC.setAttribute('r', 0);
    onbPositionCard(r);
  } else if(t.kind==='canvas'){ const r=t.rect;
    const cx=r.left+r.width/2, cy=r.top+r.height/2, rad=Math.max(40, Math.min(r.width, r.height)*0.18);
    onbUI.holeC.setAttribute('cx',cx); onbUI.holeC.setAttribute('cy',cy); onbUI.holeC.setAttribute('r',rad);
    onbUI.hole.setAttribute('width',0); onbUI.hole.setAttribute('height',0);
    onbPositionCard({left:cx-rad, top:cy-rad, right:cx+rad, bottom:cy+rad, width:rad*2, height:rad*2});
  } else {
    onbUI.hole.setAttribute('width',0); onbUI.hole.setAttribute('height',0); onbUI.holeC.setAttribute('r',0);
    onbPositionCard(null);
  }
}
function onbFrame(){ if(!onbActive){ onbRaf=0; return; } onbReposition(); onbRaf=requestAnimationFrame(onbFrame); }

/* --- adim gecisleri --- */
function onbGoto(idx){
  if(!onbTour) return;
  onbIdx=Math.max(0, Math.min(idx, onbTour.steps.length-1));
  const s=onbTour.steps[onbIdx];
  if(s.baseline && !(onbIdx in onbBases)){
    try{ onbBases[onbIdx]=s.baseline(onbTour.ctx()); }catch(e){ onbBases[onbIdx]=undefined; }
  }
  onbSet('onb.'+onbTour.id+'.step', String(onbIdx));
  onbPaused = !!s.needsPro && !onbLiveCtx().modePro();
  onbRenderCard();
  onbReposition();
}
function onbSkip(){ if(!onbTour) return; if(onbIdx>=onbTour.steps.length-1){ onbFinish(); return; } onbGoto(onbIdx+1); }
function onbTick(){
  if(!onbActive || !onbTour) return;
  /* 3B-baglantili tur: overlay kapaliysa gizle+duraklat, acilinca surdur */
  if(onbTour.visible){
    const vis=!!onbTour.visible();
    if(!vis){ if(!onbHidden){ onbHidden=true; onbSetHidden(true); } return; }
    if(onbHidden){ onbHidden=false; onbSetHidden(false); onbReposition(); }
  }
  const s=onbTour.steps[onbIdx], ctx=onbTour.ctx();
  const nowPaused = !!s.needsPro && !onbLiveCtx().modePro();
  if(nowPaused!==onbPaused){ onbPaused=nowPaused; onbRenderCard(); }
  if(onbPaused) return;                       // Pro gerekli ama kapali -> ilerleme yok
  const t=onbComputeTarget(onbTour.steps, ctx, onbBases);   // skip-ahead sync
  if(t>=onbTour.steps.length){ onbFinish(); return; }
  if(t>onbIdx){ onbGoto(t); return; }
  /* rAF-bagimsiz konum tazeleme: gizli/gomulu baglamlarda (ornek: arka plan sekmesi,
     mesken iframe'i) tarayici rAF'i ASKIYA ALIR — spotlight takibi tick'ten de surer. */
  onbReposition();
}
function onbClearTimers(){
  if(onbTimer){ clearInterval(onbTimer); onbTimer=null; }
  if(onbRaf){ if(typeof cancelAnimationFrame==='function') cancelAnimationFrame(onbRaf); onbRaf=0; }
}
function onbFinish(){
  if(onbTour){ onbSet('onb.'+onbTour.id+'.status','done'); onbSet('onb.'+onbTour.id+'.v',String(onbTour.version)); }
  onbActive=false; onbTour=null; onbHidden=false; onbClearTimers(); onbTeardown();
}
function onbStop(status){
  if(onbTour){ onbSet('onb.'+onbTour.id+'.status', status||'dismissed'); onbSet('onb.'+onbTour.id+'.v',String(onbTour.version)); }
  onbActive=false; onbTour=null; onbHidden=false; onbClearTimers(); onbTeardown();
}

/* reset=true -> 0'dan tam tur; degilse depolanmis adim + saglanmislari otomatik gec */
function onbLaunchTour(tour, reset){
  if(!tour || !onbBrowser() || !document.body) return;
  if(onbActive) onbStop('dismissed');          // ayni anda tek tur
  onbTour=tour; onbActive=true; onbPaused=false; onbHidden=false; onbBases={};
  if(tour.id==='ana') onbExportFlag=false;
  if(tour.id==='kamera3d') onbExtRenderFlag=false;
  onbSet('onb.'+tour.id+'.status','active'); onbSet('onb.'+tour.id+'.v', String(tour.version));
  let idx = reset ? 0 : Math.max(onbStepStored(tour), onbComputeTarget(tour.steps, tour.ctx(), {}));
  if(idx>=tour.steps.length){ onbFinish(); return; }
  onbBuildUI();
  onbApplyZBoost(!!tour.zBoost);
  onbGoto(idx);
  if(!onbTimer) onbTimer=setInterval(onbTick, 250);
  if(!onbRaf && typeof requestAnimationFrame==='function') onbRaf=requestAnimationFrame(onbFrame);
}
/* geriye-uyum sarmalayici: eski cagri yollari 'ana'yi baslatir */
function onbLaunch(reset){ onbLaunchTour(onbTourById('ana'), reset); }

function onbAutoStart(){
  const tour=onbTourById('ana');
  const force=onbUrlForce();
  if(onbInIframe() && !force) return;          // gomulu iframe: ANA tur kendiliginden BASLAMAZ (kamera3d watcher'i ayri, o iframeAuto)
  const d=onbDecideStart(onbStored(tour), force, tour.version);
  if(d==='start') onbLaunchTour(tour, true);
  else if(d==='resume') onbLaunchTour(tour, false);
  /* 'idle' -> tamamlanmis/kapatilmis, ayni surum: dokunma (kullanici #onbStart ile acar) */
}

/* ~750ms tetik watcher'i: kamera UI'i etkinlesince kamera3d mini-turunu baslat.
   Ucuz: tur aktifken hicbir sey yapmaz; View3D API'sine yalniz overlay GORUNURKEN dokunur. */
function onbWatchTick(){
  for(let i=0;i<ONB_TOURS.length;i++){
    const tour=ONB_TOURS[i]; if(!tour.watch) continue;
    const vis=onbV3dVisible();
    const env={ active:onbActive, inIframe:onbInIframe(), visible:vis,
                camUI:vis ? tour.ctx().camUI() : false };
    const d=onbWatchDecision(tour, env, onbStored(tour));
    if(d) onbLaunchTour(tour, d==='start');
  }
}

function onbBoot(){
  onbMigrateLegacy();
  const b=onbEl('onbStart'); if(b && b.addEventListener) b.addEventListener('click', function(){ onbLaunch(true); });
  if(typeof document!=='undefined' && document.addEventListener){
    document.addEventListener('click', function(e){                 // delege tamamlanma tiklamalari
      const t=(e.target && e.target.closest) ? e.target.closest('#svgBtn,#impBtn,[data-v3d="extrender"]') : null;
      if(!t) return;
      if(t.getAttribute && t.getAttribute('data-v3d')==='extrender') onbExtRenderFlag=true;   // kamera3d adim 6
      else onbExportFlag=true;                                                                // ana adim 13
    }, true);
  }
  onbAutoStart();
  if(!onbWatchTimer && typeof setInterval==='function') onbWatchTimer=setInterval(onbWatchTick, 750);
}

/* ---- headless test icin saf mantik kancasi (ONB); tarayicida da zararsiz ---- */
var ONB = {
  VERSION: ONB_VERSION,
  KAM_VERSION: ONB_KAM_VERSION,
  STEPS: ONB_STEPS,               // geriye-uyum: 'ana' adimlari
  KAM_STEPS: ONB_KAM_STEPS,
  TOURS: ONB_TOURS,
  tourById: onbTourById,
  computeTarget: onbComputeTarget,
  decideStart: onbDecideStart,
  watchDecision: onbWatchDecision,
  migrateLegacy: onbMigrateLegacy,
  liveCtx: onbLiveCtx,
  kamCtx: onbKamCtx,
  launch: onbLaunch,
  launchTour: onbLaunchTour,
  stop: onbStop
};

/* ================= tetik (YALNIZ gercek tarayici) ================= */
if(onbBrowser()){
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', onbBoot);
  else setTimeout(onbBoot, 0);
}
