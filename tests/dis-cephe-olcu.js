/* Dış cephe ölçü etiketi testi (A1+A2 fix) — node tests/dis-cephe-olcu.js
   Concave (L-şekilli, kademeli) bina sınırında polyDims'in ürettiği etiketlerin:
   1) sayısı kenar sayısına eşit olmalı (dejenere yoksa hiçbiri kaybolmamalı),
   2) her biri poligonun DIŞINDA olmalı (centroid-yakınlığı sezgisi yerine sarma işareti),
   3) birbirinden en az ~16px ayrık olmalı (çakışma azaltma). */
function stubEl(tag){ return {
  tag, attrs:{}, children:[], style:{}, dataset:{}, _ih:'', h:{},
  set innerHTML(v){ this._ih=v; this.children=[]; }, get innerHTML(){ return this._ih; },
  appendChild(c){ this.children.push(c); return c; },
  addEventListener(t,f){ (this.h[t]=this.h[t]||[]).push(f); },
  dispatchEvent(e){ (this.h[e.type]||[]).forEach(f=>f(e)); return true; },
  querySelectorAll(){ return []; }, querySelector(){ return null; },
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  setAttribute(k,v){ this.attrs[k]=v; }, getAttribute(k){ return this.attrs[k]; },
  getBoundingClientRect(){ return {width:1200,height:800,left:0,top:0}; },
  textContent:'', value:'', disabled:false, onclick:null, click(){}, parentElement:null, offsetHeight:0
};}
const byId={};
const getEl=id=>byId[id]||(byId[id]=stubEl('div'));
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='5'; getEl('katYuk').value='2.9';
getEl('roomMenu').parentElement=stubEl('div');
global.document={getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t), querySelector:()=>stubEl('aside')};
global.window={addEventListener(){}};
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){}; global.Blob=function(){}; global.URL={createObjectURL:()=>''};

const {extractAppScript}=require('./support/app-js');
const src=extractAppScript();

let pass=0, fail=0;
const T=(name,cond)=>{ if(cond){pass++;} else {fail++; console.log('  [FAIL]', name);} };

eval(src + `
;/* concave L-şekilli, kısa kademeli sınır — 6 kenar (dış cephe fix'i öncesinde bazı kenarlar
   centroid-yakınlığı yüzünden içeri bakan yanlış tarafa etiketleniyordu) */
pts=[{x:0,y:0},{x:10,y:0},{x:10,y:4},{x:6,y:4},{x:6,y:1},{x:0,y:1}]; closed=true;
mode='draw'; parcelPts=[]; parcelClosed=false; plan=null;
render();

const texts=[];
(function walk(e2){ if(!e2) return; if(e2.tag==='text') texts.push(e2); (e2.children||[]).forEach(walk); })(svg);
/* fmt() tr-TR ondalık virgül kullanır; ölçü etiketleri "N m" ya da "N,N m" biçiminde */
const dimTexts=texts.filter(t=>/^\\d+([.,]\\d+)? m$/.test(t.textContent));

T('etiket sayısı = kenar sayısı (6)', dimTexts.length===pts.length);

/* Assert 2: her etiket dünya konumu poligonun DIŞINDA (pip false) */
let allOutside=true;
dimTexts.forEach(t=>{
  const wx=S2Wx(+t.attrs.x), wy=S2Wy(+t.attrs.y);
  if(pip(wx,wy,pts)) allOutside=false;
});
T('tüm etiketler poligon dışında', allOutside);

/* Assert 3: herhangi iki etiket arasındaki ekran mesafesi >= ~16px */
let minD=Infinity;
for(let i=0;i<dimTexts.length;i++) for(let j=i+1;j<dimTexts.length;j++){
  const dx=+dimTexts[i].attrs.x-+dimTexts[j].attrs.x, dy=+dimTexts[i].attrs.y-+dimTexts[j].attrs.y;
  minD=Math.min(minD, Math.hypot(dx,dy));
}
T('etiketler en az ~16px ayrık', minD>=16-1e-6);

/* dış bükey (convex) bir dikdörtgende de eski davranış korunmalı: 4 etiket, hepsi dışarıda */
pts=[{x:0,y:0},{x:8,y:0},{x:8,y:5},{x:0,y:5}]; closed=true; render();
const texts2=[];
(function walk(e2){ if(!e2) return; if(e2.tag==='text') texts2.push(e2); (e2.children||[]).forEach(walk); })(svg);
const dimTexts2=texts2.filter(t=>/^\\d+([.,]\\d+)? m$/.test(t.textContent));
T('dikdörtgende etiket sayısı = 4', dimTexts2.length===4);
T('dikdörtgende tüm etiketler dışarıda', dimTexts2.every(t=>!pip(S2Wx(+t.attrs.x),S2Wy(+t.attrs.y),pts)));
`);
console.log(fail? `✗ ${fail} test düştü (${pass} geçti)` : `✓ tüm testler geçti (${pass})`);
process.exit(fail?1:0);
