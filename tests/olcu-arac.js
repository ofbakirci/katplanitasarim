/* Ölçü aracı (measure) testi — node tests/olcu-arac.js
   Mod kaydı (MODE_KEYS/MODE_BADGE/buton) + iki tık ile measureStart/End set edilmesi +
   render çıktısında doğru mesafe rozeti + Esc temizlemesi. Dokunmatik katman/touch.js
   deseninin ikizi: svg.h[type] içine kaydolan dinleyicileri doğrudan tetikleriz. */
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
const winHandlers={};
global.window={addEventListener(t,f){ (winHandlers[t]=winHandlers[t]||[]).push(f); }};
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){}; global.Blob=function(){}; global.URL={createObjectURL:()=>''};

const {extractAppScript}=require('./support/app-js');
const src=extractAppScript();

let pass=0, fail=0;
const T=(name,cond)=>{ if(cond){pass++;} else {fail++; console.log('  [FAIL]', name);} };
const svg=getEl('svg');
const md=(sx,sy)=>svg.h.mousedown.forEach(f=>f({clientX:sx,clientY:sy,button:0,preventDefault(){}}));
const mm=(sx,sy)=>svg.h.mousemove.forEach(f=>f({clientX:sx,clientY:sy,preventDefault(){}}));
const esc=()=>(winHandlers.keydown||[]).forEach(f=>f({key:'Escape',target:{},preventDefault(){}}));

eval(src + `
;/* --- kanca kaydı: buton + MODE_KEYS + MODE_BADGE --- */
T('tMeasure butonu var', !!document.getElementById('tMeasure'));
T('MODE_KEYS m -> tMeasure', MODE_KEYS['m']==='tMeasure');
T('MODE_BADGE measure kayıtlı', !!MODE_BADGE['measure'] && MODE_BADGE['measure'].key==='M');

/* --- moda geç: pxPerM/panX/panY varsayılan (16 / 80 / 70), snapG ızgarası 0,5 m --- */
setMode('measure');
T('mode measure oldu', mode==='measure');
T('moda girince ölçüm boş', measureStart==null && measureEnd==null);

/* --- 1. tık: (0,0) dünya konumu → screen (80,70) --- */
md(W2Sx(0), W2Sy(0));
T('ilk tık measureStart set etti', !!measureStart && measureStart.x===0 && measureStart.y===0);
T('ilk tıkta measureEnd hâlâ boş', measureEnd==null);

/* --- mousemove: canlı önizleme measureHover'ı günceller, render çıktısında rozet görünür --- */
mm(W2Sx(1), W2Sy(1));
T('mousemove measureHover set etti', !!measureHover);

/* --- 2. tık: 3-4-5 üçgeni → (3,4) dünya konumu, mesafe tam 5 m --- */
md(W2Sx(3), W2Sy(4));
T('ikinci tık measureEnd set etti', !!measureEnd && measureEnd.x===3 && measureEnd.y===4);

/* render çıktısında "5 m" rozeti var mı (dragMeasureLabel bir metin düğümü üretir) */
render();
const texts=[];
(function walk(e2){ if(!e2) return; if(e2.tag==='text') texts.push(e2.textContent); (e2.children||[]).forEach(walk); })(svg);
T('mesafe rozeti "5 m" render edildi', texts.includes('5 m'));

/* --- yeni ilk tık: eski ölçüm silinir, yeni ölçüme başlar --- */
md(W2Sx(10), W2Sy(10));
T('yeni ilk tık eskisini sildi', measureStart.x===10 && measureStart.y===10 && measureEnd==null);

/* --- Esc: ölçümü temizler --- */
measureStart=null; measureEnd=null; measureHover=null;   // temiz başlangıç (önceki blok yarım ölçüm bırakmış olabilir)
md(W2Sx(0), W2Sy(0)); md(W2Sx(3), W2Sy(4));
T('esc öncesi ölçüm dolu', !!measureStart && !!measureEnd);
esc();
T('esc ölçümü temizledi', measureStart==null && measureEnd==null && measureHover==null);

/* --- mod değişince ölçüm temizlenir --- */
md(W2Sx(0), W2Sy(0)); md(W2Sx(3), W2Sy(4));
T('mod-değişim testi öncesi ölçüm dolu', !!measureStart && !!measureEnd);
setMode('draw');
T('mod değişince ölçüm temizlendi', measureStart==null && measureEnd==null);
setMode('measure');
`);
console.log(fail? `✗ ${fail} test düştü (${pass} geçti)` : `✓ tüm testler geçti (${pass})`);
process.exit(fail?1:0);
