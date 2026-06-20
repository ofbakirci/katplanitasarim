/* antre boyut raporu — node tests/antre-size.js
   Birkaç senaryoda ANTRE alanını ve oda alanlarını listeler. */
function stubEl(tag){ return {
  tag, attrs:{}, children:[], style:{}, dataset:{}, _ih:'',
  set innerHTML(v){ this._ih=v; this.children=[]; }, get innerHTML(){ return this._ih; },
  appendChild(c){ this.children.push(c); return c; },
  addEventListener(){}, querySelectorAll(){ return []; }, querySelector(){ return null; },
  classList:{toggle(){},add(){},remove(){}},
  setAttribute(k,v){ this.attrs[k]=v; }, getAttribute(k){ return this.attrs[k]; },
  getBoundingClientRect(){ return {width:1400,height:1000,left:0,top:0}; },
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

const scenarios=[
  {name:'32x16  2+1eb / 1+1',   specs:[{oda:2,salon:1,ensuite:true,acik:false,adet:2},{oda:1,salon:1,ensuite:false,acik:true,adet:2}], pts:[{x:0,y:0},{x:32,y:0},{x:32,y:16},{x:0,y:16}]},
  {name:'40x28  3+1eb / 2+1',   specs:[{oda:3,salon:1,ensuite:true,acik:false,adet:2},{oda:2,salon:1,ensuite:false,acik:false,adet:2}], pts:[{x:0,y:0},{x:40,y:0},{x:40,y:28},{x:0,y:28}]},
  {name:'24x12  2+1 küçük',     specs:[{oda:2,salon:1,ensuite:false,acik:false,adet:2}], pts:[{x:0,y:0},{x:24,y:0},{x:24,y:12},{x:0,y:12}]},
];

for(const sc of scenarios){
  eval(src + `
;unitSpecs=${JSON.stringify(sc.specs)};
pts=${JSON.stringify(sc.pts)}; closed=true;
generate();
global.__plan=plan;
`);
  const plan=global.__plan;
  console.log('\\n=== '+sc.name+' ===');
  plan.unitObjs.forEach((u,k)=>{
    const A=g=>(g.cells.length*0.25).toFixed(1);
    const an=u.rooms.find(g=>g.name==='ANTRE'&&g.cells.length);
    const tot=u.rooms.reduce((s,g)=>s+g.cells.length,0)*0.25;
    const rooms=u.rooms.filter(g=>g.cells.length).map(g=>g.name+' '+A(g)).join(', ');
    console.log(`  D${k+1} (${tot.toFixed(0)} m²) antre=${an?A(an):'-'} | ${rooms}`);
  });
}
