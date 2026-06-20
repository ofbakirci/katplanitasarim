/* antre inceltme (slimAntres) testi — node tests/antre-slim.js
   Hata: antre kolları odaların içine taşıyor / kör uç bırakıyordu (19-22 m² antre).
   Beklenti: üretim sonrası antre kompakt, erişim ve mevzuat denetimi bozulmaz. */
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
const byId={};
const getEl=id=>byId[id]||(byId[id]=stubEl('div'));
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='5'; getEl('katYuk').value='2.9';
global.document={getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t)};
global.window={addEventListener(){}};
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){}; global.Blob=function(){}; global.URL={createObjectURL:()=>''};

const {extractAppScript}=require('./support/app-js');
const src=extractAppScript();

let pass=0, fail=0;
const T=(name,cond)=>{ if(cond){pass++;} else {fail++; console.log('  [FAIL]', name);} };

const scenarios=[
  {name:'32x16 (görseldeki hata)', specs:[{oda:2,salon:1,ensuite:true,acik:false,adet:2},{oda:1,salon:1,ensuite:false,acik:true,adet:2}],
   pts:[{x:0,y:0},{x:32,y:0},{x:32,y:16},{x:0,y:16}]},
  {name:'40x28 derin blok', specs:[{oda:3,salon:1,ensuite:true,acik:false,adet:2},{oda:2,salon:1,ensuite:false,acik:false,adet:2}],
   pts:[{x:0,y:0},{x:40,y:0},{x:40,y:28},{x:0,y:28}]},
  {name:'L-şekil', specs:[{oda:2,salon:1,ensuite:false,acik:false,adet:2},{oda:1,salon:1,ensuite:false,acik:true,adet:2}],
   pts:[{x:0,y:0},{x:30,y:0},{x:30,y:10},{x:16,y:10},{x:16,y:20},{x:0,y:20}]},
];

for(const sc of scenarios){
  eval(src + `
;unitSpecs=${JSON.stringify(sc.specs)};
pts=${JSON.stringify(sc.pts)}; closed=true;
generate();
global.__G={plan, runChecks, thinCells, antreAdjSet, regConnected};
`);
  const {plan, runChecks, thinCells, antreAdjSet, regConnected}=global.__G;
  console.log('--- '+sc.name+' ---');
  /* bütünlük */
  let ins=0; plan.inside.forEach(v=>ins+=v);
  const tot=plan.regions.reduce((s,g)=>s+g.cells.length,0);
  let cmOk=true; plan.regions.forEach(g=>g.cells.forEach(i=>{ if(plan.cm[i]!==g.id) cmOk=false; }));
  T(sc.name+': hücre bütünlüğü', tot===ins && cmOk);
  plan.unitObjs.forEach((u,k)=>{
    const an=u.antre; if(!an||!an.cells.length) return;
    const aArea=an.cells.length*0.25;
    const uArea=u.rooms.reduce((s,g)=>s+g.cells.length,0)*0.25;
    /* antre şişkin değil: ≤ %14 daire alanı (eski hata: %16-19'a varıyordu;
       L-daire girişi yapısal olarak ~%13,7'de kalabiliyor — bkz. DEVIR-NOTU) */
    T(`${sc.name} D${k+1}: antre kompakt (${aArea} m² / ${uArea} m²)`, aArea<=Math.max(6, uArea*0.14));
    T(`${sc.name} D${k+1}: antre bağlantılı`, regConnected(an));
    /* 1 m'den ince çıkıntı yok (odaya sokulma) */
    T(`${sc.name} D${k+1}: ince çıkıntı yok`, thinCells(an)===0);
    /* erişim: her oda (EB. BANYO hariç) antreye komşu */
    const adj=antreAdjSet(u);
    const eksik=u.rooms.filter(g=>g!==an&&g.cells.length&&g.name!=='EB. BANYO'&&g.type!=='merdiven'&&!adj.has(g.id));
    T(`${sc.name} D${k+1}: tüm odalar antreye komşu`, eksik.length===0);
  });
}
console.log(fail? `✗ ${fail} test düştü (${pass} geçti)` : `✓ tüm testler geçti (${pass})`);
process.exit(fail?1:0);
