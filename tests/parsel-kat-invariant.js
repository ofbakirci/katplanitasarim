/* Parsel bina-değişmezi — node tests/parsel-kat-invariant.js
   Kök hata (kat-plani-4.svg): kat snapshot'ları parsel taşıyor, bir kattayken parsel değişince
   (TKGM/çizim/döndürme) diğer katların bayat parseli kat geçişinde geri basılıyordu.
   (a) kat geçişi (keepFloors) parseli snapshot'tan OKUMAZ — canlı değer korunur;
   (b) içe aktarmada ıraksak floors normalize edilir (üst-seviye parsel damgalanır);
   (c) undo yolu (keepFloors'suz restore) parseli geri basmaya DEVAM eder (regresyon);
   (d) kat-düzeni-kopyala (floorClip) yolu yeşil kalır. */
function stubEl(tag){ return {
  tag, attrs:{}, children:[], style:{}, dataset:{}, _ih:'',
  set innerHTML(v){ this._ih=v; this.children=[]; }, get innerHTML(){ return this._ih; },
  appendChild(c){ this.children.push(c); return c; },
  addEventListener(){}, querySelectorAll(){ return []; }, querySelector(){ return null; },
  classList:{toggle(){},add(){},remove(){}},
  setAttribute(k,v){ this.attrs[k]=v; }, getAttribute(k){ return this.attrs[k]; },
  getBoundingClientRect(){ return {width:1200,height:800,left:0,top:0}; },
  textContent:'', value:'', disabled:false, onclick:null, click(){}, parentElement:null, offsetHeight:0
};}
const byId={}; const getEl=id=>byId[id]||(byId[id]=stubEl('div'));
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='3'; getEl('katYuk').value='2.9';
let fakeChecks=[];
global.document={ getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t),
  querySelectorAll:sel=> (sel&&sel.indexOf('floorPasteList')>=0)? fakeChecks : [] };
global.window={addEventListener(){}};
global.matchMedia=()=>({matches:false});
global.alert=()=>{};
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){}; global.Blob=function(){}; global.URL={createObjectURL:()=>''};
const {extractAppScript}=require('./support/app-js');
const src=extractAppScript();

let pass=0, fail=0;
const T=(name,cond)=>{ if(cond){pass++;} else {fail++; console.log('  [FAIL]', name);} };

eval(src+`
;(function(){
  const P1=[{x:-4,y:-4},{x:22,y:-4},{x:22,y:18},{x:-4,y:18}];                 // 4 köşe
  const P2=[{x:-6,y:-6},{x:24,y:-6},{x:26,y:8},{x:20,y:20},{x:-6,y:20}];     // 5 köşe (farklı)
  const eq=(a,b)=> JSON.stringify(a)===JSON.stringify(b);

  /* --- kurulum: apartman, katAyri, 3 kat --- */
  pts=[{x:0,y:0},{x:16,y:0},{x:16,y:12},{x:0,y:12}]; closed=true;
  unitSpecs=[{oda:2,salon:1,ensuite:false,acik:false,adet:2}];
  generate();
  parcelPts=P1.map(p=>({...p})); parcelClosed=true; parcelRot=0.365; parcelImar={maksTaks:0.4};
  document.getElementById('katAyri').checked=true;
  villaFloors=new Array(totalFloors()).fill(null); activeFloor=zeminIdx(); villaOffset=bodrumSayisi;
  villaFloors[zeminIdx()]=stateSnapshot(true);
  T('kurulum: plan + P1 parsel + katAyri', !!plan && floorsOn() && eq(parcelPts,P1));

  /* --- (a) kat geçişinde parsel CANLI kalır --- */
  switchFloor(1); switchFloor(2);                    // 1. ve 2. kat ziyaret → snapshot'ları P1 gömer
  switchFloor(zeminIdx());
  T('a: ziyaretler sonrası parsel P1', eq(parcelPts,P1) && Math.abs(parcelRot-0.365)<1e-9);
  /* zemindeyken parsel DEĞİŞİR (TKGM yeniden sorgu benzetimi) */
  parcelPts=P2.map(p=>({...p})); parcelRot=-1.515; parcelImar={maksTaks:0.6};
  villaFloors[activeFloor]=stateSnapshot(true);
  switchFloor(1);                                    // 1. katın snapshot'ı hâlâ P1 taşıyor
  T('a: kat geçişinde bayat P1 SIZMADI (canlı P2 korundu)', eq(parcelPts,P2));
  T('a: parcelRot canlı kaldı', Math.abs(parcelRot-(-1.515))<1e-9);
  T('a: parcelImar canlı kaldı', parcelImar && parcelImar.maksTaks===0.6);
  switchFloor(2); switchFloor(zeminIdx()); switchFloor(1);
  T('a: çoklu gezinmede de parsel sabit P2', eq(parcelPts,P2) && Math.abs(parcelRot-(-1.515))<1e-9);
  T('a: footprint kat-başına korunur (parsel fixi pts eşitlemez)', pts.length>=3);

  /* --- (c) undo yolu (keepFloors'suz restore) parseli GERİ BASAR — regresyon --- */
  const snapP2=stateSnapshot(false);
  parcelPts=P1.map(p=>({...p})); parcelRot=0.365;    // canlıyı boz
  restoreState(snapP2, {fit:false});                 // undo deseni: opt.keepFloors YOK
  T('c: keepFloors\\'suz restore parseli geri bastı (undo çalışır)', eq(parcelPts,P2) && Math.abs(parcelRot-(-1.515))<1e-9);

  /* --- (b) içe aktarmada ıraksak floors NORMALİZE edilir (kat-plani-4 küçültülmüş fikstürü) --- */
  const fx=stateSnapshot(false);                     // katAyri + floors gömülü tam durum
  T('b: fikstür katları taşıyor', fx.katAyri && Array.isArray(fx.floors) && fx.floors.filter(f=>f).length>=3);
  fx.floors.forEach((f,i)=>{ if(f && i!==fx.activeFloor){ f.parcelPts=P1.map(p=>({...p})); f.parcelRot=0.365; f.parcelImar={maksTaks:0.4}; } });   // ıraksat (kat-plani-4 deseni: aktif kat yeni, diğerleri eski)
  importPlanText(JSON.stringify(fx), 'fikstur.json');
  T('b: yükleme sonrası üst-seviye parsel P2', eq(parcelPts,P2));
  const allNorm=villaFloors.every(f=>!f || (eq(f.parcelPts,P2) && Math.abs(f.parcelRot-(-1.515))<1e-9 && f.parcelImar && f.parcelImar.maksTaks===0.6));
  T('b: TÜM kat snapshot\\'ları üst-seviye parsele damgalandı', allNorm);
  T('b: footprint\\'lere dokunulmadı', villaFloors.every(f=>!f || (Array.isArray(f.pts) && f.pts.length>=3)));
  switchFloor((activeFloor+1)%totalFloors());
  T('b: yükleme sonrası kat geçişinde parsel sabit', eq(parcelPts,P2));

  /* --- (b2) normalizeFloorParcels saf birim: bloklar-arası da eşitlenir (parsel SİTE-ortak) --- */
  const b2={ katAyri:true, parcelPts:P2, parcelClosed:true, parcelRot:-1.515, parcelImar:null, amenities:[],
    floors:[null, {parcelPts:P1, parcelRot:0.365, pts:[{x:0,y:0}]}],
    blocks:[ {katAyri:true, parcelPts:P1, parcelRot:0.365, amenities:[], pts:[{x:9,y:9}], floors:[{parcelPts:P1, parcelRot:0.365}]} ] };
  normalizeFloorParcels(b2);
  T('b2: floors damgalandı', eq(b2.floors[1].parcelPts,P2) && Math.abs(b2.floors[1].parcelRot-(-1.515))<1e-9);
  T('b2: blok ÜST-seviyesi üst-seviyeden damgalandı', eq(b2.blocks[0].parcelPts,P2) && Math.abs(b2.blocks[0].parcelRot-(-1.515))<1e-9);
  T('b2: blok floors da üst-seviyeden damgalandı', eq(b2.blocks[0].floors[0].parcelPts,P2));
  T('b2: blok footprint korunur', eq(b2.blocks[0].pts,[{x:9,y:9}]));
  T('b2: null kat güvenli', b2.floors[0]===null);

  /* --- (d) kat-düzeni-kopyala yolu yeşil (floorClip) --- */
  copyActiveFloorLayout();
  T('d: kopyala tampon doldu', !!floorClip && floorClip.src===activeFloor);
  const hedef=(activeFloor+1)%totalFloors();
  fakeChecks=[ {checked:true,disabled:false,dataset:{k:String(hedef)}} ];
  applyFloorLayout();
  T('d: uygula hedef katı güncelledi', !!(villaFloors[hedef]&&villaFloors[hedef].plan));
  T('d: uygula sonrası parsel hâlâ P2', eq(parcelPts,P2));

  /* --- (e) BLOK tarafı: parsel SİTE-değişmezi (keepBlocks geçişi + yeni blok devri) --- */
  const P3=[{x:-8,y:-8},{x:30,y:-8},{x:30,y:24},{x:-8,y:24}];   // 4 köşe (üçüncü parsel)
  document.getElementById('siteMod').checked=true;
  blocks=[null,null]; activeBlock=0; saveActiveBlock();          // blok A = canlı durum (P2 parselli)
  T('e: site açık + blok A kayıtlı', siteOn()===true && !!(blocks[0]&&blocks[0].plan));
  switchBlock(1);                                                // boş blok B → clearCanvasForNewBlock
  T('e: yeni blok mevcut parseli DEVRALDI (P2 canlı)', activeBlock===1 && eq(parcelPts,P2));
  pts=[{x:30,y:0},{x:44,y:0},{x:44,y:10},{x:30,y:10}]; closed=true; generate();   // blok B planı
  T('e: blok B üretildi', !!plan);
  switchBlock(0);                                                // A'ya dön (A+B snapshot'ları P2'li)
  T('e: blok A geri geldi', activeBlock===0 && !!plan);
  /* blok A'dayken parsel DEĞİŞİR */
  parcelPts=P3.map(p=>({...p})); parcelRot=0.7; parcelImar={maksTaks:0.5};
  switchBlock(1);                                                // B snapshot'ı hâlâ P2 taşıyor
  T('e: blok geçişinde bayat P2 SIZMADI (canlı P3 korundu)', eq(parcelPts,P3) && Math.abs(parcelRot-0.7)<1e-9);
  switchBlock(0); switchBlock(1);
  T('e: çoklu blok gezinmesinde parsel sabit P3', eq(parcelPts,P3) && parcelImar && parcelImar.maksTaks===0.5);
  T('e: blok footprint kendi kaldı (B)', pts.length===4 && pts[0].x===30);

  /* --- (e2) ıraksak-BLOKLU fikstür import → tek parsele normalize --- */
  const sfx=stateSnapshot(false, true);                          // site tam durumu (st.blocks)
  T('e2: fikstür blokları taşıyor', Array.isArray(sfx.blocks) && sfx.blocks.filter(b=>b).length===2);
  sfx.blocks.forEach((b,i)=>{ if(b && i!==sfx.activeBlock){ b.parcelPts=P1.map(p=>({...p})); b.parcelRot=0.365; b.parcelImar={maksTaks:0.4}; } });   // ıraksat
  importPlanText(JSON.stringify(sfx), 'site-fikstur.json');
  T('e2: yükleme sonrası canlı parsel P3', eq(parcelPts,P3));
  T('e2: TÜM blok snapshot\\'ları tek parsele indi', blocks.every(b=>!b || (eq(b.parcelPts,P3) && Math.abs(b.parcelRot-0.7)<1e-9)));
  T('e2: blok footprint\\'leri korundu', blocks.every(b=>!b || (Array.isArray(b.pts) && b.pts.length>=3)));
  switchBlock((activeBlock+1)%blocks.length);
  T('e2: yükleme sonrası blok geçişinde parsel sabit', eq(parcelPts,P3));

  /* --- (e3) undo tam-restore (opt'suz) parseli geri basar — regresyon --- */
  const siteSnap=stateSnapshot(false, true);
  parcelPts=P1.map(p=>({...p})); parcelRot=0.365;               // canlıyı boz
  restoreState(siteSnap, {fit:false});                          // keepFloors/keepBlocks YOK
  T('e3: tam restore parseli geri bastı', eq(parcelPts,P3) && Math.abs(parcelRot-0.7)<1e-9);
})();
`);
console.log(pass+' geçti, '+fail+' kaldı');
process.exit(fail?1:0);
