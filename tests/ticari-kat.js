/* ticari (konut-dışı) zemin kat düzeni + kat düzeni kopyala/uygula — node tests/ticari-kat.js
   Regresyon: çekirdek köşeye sıkışmamalı, apartman holü + bina/dükkân girişleri olmalı,
   konut katı ortalı çekirdeği miras almalı; kopyala/uygula uyumlu katlara düzeni taşımalı. */
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
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='5'; getEl('katYuk').value='2.9';
let fakeChecks=[];   // applyFloorLayout'un okuduğu #floorPasteList onay kutuları (testte denetlenir)
global.document={ getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t),
  querySelectorAll:sel=> (sel&&sel.indexOf('floorPasteList')>=0)? fakeChecks : [] };
global.window={addEventListener(){}};
global.matchMedia=()=>({matches:false});
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){}; global.Blob=function(){}; global.URL={createObjectURL:()=>''};
const {extractAppScript}=require('./support/app-js');
const src=extractAppScript();

let pass=0, fail=0;
const T=(name,cond)=>{ if(cond){pass++;} else {fail++; console.log('  [FAIL]', name);} };

eval(src+`
;(function(){
  const cellsOf=type=>plan.regions.filter(g=>g.type===type&&g.cells.length);
  const coreMinCol=()=>{ let c0=1e9; ['merdiven','asansor','yangin','teknik'].forEach(t=>
    cellsOf(t).forEach(g=>g.cells.forEach(i=>{ const c=i%plan.cols; if(c<c0)c0=c; }))); return c0; };
  const adjacent=(typeA,typeB)=>{ const setB=new Set();
    cellsOf(typeB).forEach(g=>g.cells.forEach(i=>setB.add(i)));
    return cellsOf(typeA).some(g=>g.cells.some(i=>{ const r=(i/plan.cols)|0,c=i%plan.cols;
      return setB.has((r-1)*plan.cols+c)||setB.has((r+1)*plan.cols+c)||setB.has(r*plan.cols+c-1)||setB.has(r*plan.cols+c+1); })); };

  /* --- zemin: 14×11 apartman, 2 adet 2+1; sonra TİCARİ --- */
  pts=[{x:0,y:0},{x:14,y:0},{x:14,y:11},{x:0,y:11}]; closed=true;
  unitSpecs=[{oda:2,salon:1,ensuite:false,acik:false,adet:2}];
  generate();
  T('konut zemin üretildi (sağlamlık)', !!plan && plan.unitObjs.length>=1);
  document.getElementById('katAyri').checked=true;
  villaFloors=new Array(5).fill(null); activeFloor=zeminIdx(); villaOffset=bodrumSayisi;
  villaFloors[zeminIdx()]=stateSnapshot(true);
  katKullanim='ticari'; generate();

  /* --- Part A: ticari düzen --- */
  T('ticari: merdiven çekirdeği var', cellsOf('merdiven').length>0);
  T('ticari: çekirdek KÖŞEYE sıkışmadı (c0>0, ortalı)', coreMinCol()>0);
  T('ticari: APARTMAN HOLÜ (koridor) var', cellsOf('koridor').length>0);
  T('ticari: hol çekirdeğe (merdiven) komşu', adjacent('koridor','merdiven'));
  T('ticari: dükkânlar var', cellsOf('dukkan').length>0);
  T('ticari: sliver dükkân yok (her dükkân ≥ ~9 m²)',
    cellsOf('dukkan').every(g=>g.cells.length*M*M >= 9 - 1e-9));
  const doors=computeDoors();
  T('ticari: BİNA GİRİŞİ (hol → sokak) kapısı var',
    doors.some(d=>d.kind==='ext'&&d.status==='ok'&&d.key[0]==='g'&&d.key[1]==='h'));
  T('ticari: dükkân girişleri var',
    doors.some(d=>d.kind==='ext'&&d.status==='ok'&&d.key[0]==='g'&&d.key[1]==='d'));
  T('ticari: daire (unit) üretilmez', plan.unitObjs.length===0);
  villaFloors[zeminIdx()]=stateSnapshot(true);
  const zeminCoreC0=coreMinCol();

  /* --- üst konut katı: ortalı çekirdeği miras alır --- */
  switchFloor(1);
  T('1. kat konut: plan + daire var', !!plan && plan.unitObjs.length>=1);
  T('1. kat: çekirdek zeminden ortalı miras (c0 aynı)', Math.abs(coreMinCol()-zeminCoreC0)<=1);
  T('1. kat: çekirdek yine köşede değil', coreMinCol()>0);

  /* --- Part B: kat düzeni kopyala → uygula --- */
  switchFloor(2); switchFloor(1);                 // 1,2. kat ziyaret edildi; 1. kat aktif
  copyActiveFloorLayout();
  T('kopyala: tampon doldu (kaynak=1. kat)', !!floorClip && floorClip.src===1);
  T('uyumluluk: konut 2. kat uygun', floorPasteOK(2)===true);
  T('uyumluluk: konut 3. kat (boş) uygun', floorPasteOK(3)===true);
  T('uyumluluk: TİCARİ zemin UYGUN DEĞİL (farklı kullanım)', floorPasteOK(zeminIdx())===false);
  T('uyumluluk: kaynak kat kendine uygulanmaz', floorPasteOK(1)===false);

  /* ayırt edici işaret: 1. katın bir SALON'unu yeniden adlandır, yeniden kopyala */
  const sal=plan.regions.find(g=>g.type==='salon'&&g.cells.length);
  if(sal) sal.name='SALON ✱T';
  copyActiveFloorLayout();
  fakeChecks=[ {checked:true,disabled:false,dataset:{k:'2'}},
               {checked:true,disabled:false,dataset:{k:'3'}} ];
  applyFloorLayout();
  const mark=k=>{ const f=villaFloors[k]; return !!(f&&f.plan&&f.plan.regions.some(r=>r.name==='SALON ✱T')); };
  T('uygula: 2. kata düzen geçti (işaret var)', mark(2));
  T('uygula: 3. kata (boş kat) düzen geçti', mark(3));
  T('uygula: işaretlenmeyen 4. kat değişmedi', !villaFloors[4]);
})();
`);
console.log(pass+' geçti, '+fail+' kaldı');
process.exit(fail?1:0);
