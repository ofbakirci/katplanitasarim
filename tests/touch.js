/* dokunmatik katman testi — node tests/touch.js
   Tarayıcı dokunuş olaylarını taklit eder: dokunuş=tıklama, sürükleme=kaydırma,
   iki parmak=yakınlaştırma, uzun basış=sağ tık menüsü. */
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
/* dokunmatik katmanın çalışması için: MouseEvent + matchMedia + zamanlayıcı yakalama */
global.MouseEvent=class{ constructor(type,o){ this.type=type; Object.assign(this,o||{}); } preventDefault(){} };
global.matchMedia=q=>({matches:true, media:q});
let lpCb=null; const realST=setTimeout, realCT=clearTimeout;
global.setTimeout=(cb,ms)=>{ if(ms===500){ lpCb=cb; return {lp:1}; } return realST(cb,ms); };
global.clearTimeout=id=>{ if(id&&id.lp) lpCb=null; else realCT(id); };

const {extractAppScript}=require('./support/app-js');
const src=extractAppScript();

let pass=0, fail=0;
const T=(name,cond)=>{ if(cond){pass++;} else {fail++; console.log('  [FAIL]', name);} };
const svg=getEl('svg');
const TE=(type,touches)=>({ type, touches, preventDefault(){} });
const tp=(x,y)=>({clientX:x, clientY:y});
const fire=(type,touches)=>svg.h[type].forEach(f=>f(TE(type,touches)));

eval(src + `
;T('dokunuş dinleyicileri kayıtlı', !!(svg.h.touchstart&&svg.h.touchmove&&svg.h.touchend&&svg.h.touchcancel));
T('HITSC dokunmatikte büyüdü', HITSC>1);

/* --- 1. dokunuş = çizim noktası --- */
mode='draw'; pts=[]; closed=false;
fire('touchstart',[tp(200,200)]);
fire('touchend',[]);
T('dokunuş nokta ekledi', pts.length===1);
T('dokunuş kaydırmadı', panX===80&&panY===70);

/* --- 2. boşta sürükleme = kaydırma (nokta eklemez) --- */
const n0=pts.length, px0=panX;
fire('touchstart',[tp(400,300)]);
fire('touchmove',[tp(460,300)]);
fire('touchmove',[tp(520,300)]);
fire('touchend',[]);
T('sürükleme nokta eklemedi', pts.length===n0);
T('sürükleme kaydırdı', Math.abs(panX-(px0+120))<10);

/* --- 3. iki parmak = yakınlaştırma --- */
const z0=pxPerM;
fire('touchstart',[tp(500,400),tp(700,400)]);   // d0=200
fire('touchmove',[tp(400,400),tp(800,400)]);    // d=400 → 2x
fire('touchend',[]);
T('iki parmak yakınlaştırdı', Math.abs(pxPerM-Math.min(80,z0*2))<0.01);
T('yakınlaştırma sürükleme/nokta bırakmadı', pts.length===n0 && !dragging);

/* --- 4. plan + uzun basış = oda menüsü --- */
pts=[{x:0,y:0},{x:32,y:0},{x:32,y:16},{x:0,y:16}]; closed=true;
unitSpecs=[{oda:2,salon:1,ensuite:false,acik:false,adet:2}];
generate(); fitView();
T('plan üretildi', !!plan && plan.regions.length>0);
/* bir salon hücresinin ekran koordinatı (koridor menü/vurgu dışı) */
const salon=plan.regions.find(g=>g.type==='salon'&&g.cells.length);
T('salon bulundu', !!salon);
const ci=salon.cells[Math.floor(salon.cells.length/2)];
const wx=plan.minX+(ci%plan.cols)*M+M/2, wy=plan.minY+Math.floor(ci/plan.cols)*M+M/2;
const sx=W2Sx(wx), sy=W2Sy(wy), r={width:0,height:0};
lpCb=null;
fire('touchstart',[tp(sx,sy)]);
T('uzun basış zamanlayıcısı kuruldu', !!lpCb);
lpCb&&lpCb();                                   // 500 ms doldu
T('uzun basış menü açtı', roomMenu.style.display==='block');
fire('touchend',[]);
T('parmak kalkınca menü açık kaldı', roomMenu.style.display==='block');

/* --- 5. dokunuş menüyü kapatır + oda vurgusu --- */
fire('touchstart',[tp(sx,sy)]);
T('yeni dokunuş menüyü kapattı', roomMenu.style.display==='none');
fire('touchend',[]);
T('plan üstünde dokunuş oda vurguladı', hoverRoomId!=null);

/* --- 6. uzun basış sürüklemeyle iptal olur --- */
lpCb=null;
fire('touchstart',[tp(300,300)]);
fire('touchmove',[tp(400,300)]);
T('hareket uzun basışı iptal etti', lpCb===null);
fire('touchend',[]);

/* --- 7. avlu modunda mevcut avluya dokun-sürükle = TAŞIMA (pan değil) — AV-2 mobil paritesi --- */
courtyards=[{poly:rectPoly(2,2,4,4)}]; avluChanged();
T('avlu kuruldu', courtyards.length===1 && !!plan);
mode='avlu';
const av0=Math.min(...courtyards[0].poly.map(p=>p.x));
const bx=W2Sx(3), by=W2Sy(3), pxA=panX;         // gövde merkezi (3,3) dünya
fire('touchstart',[tp(bx,by)]);
fire('touchmove',[tp(bx+pxPerM,by)]);            // +1 m sağa
fire('touchmove',[tp(bx+pxPerM,by)]);
fire('touchend',[]);
const av1=Math.min(...courtyards[0].poly.map(p=>p.x));
T('avlu gövde sürüklemesi avluyu taşıdı', Math.abs(av1-(av0+1))<0.6);
T('avlu sürüklemesi canvas kaydırmadı', panX===pxA);
`);
console.log(fail? '✗ '+fail+' test başarısız ('+pass+' geçti)' : '✓ tüm dokunmatik testleri geçti ('+pass+')');
process.exit(fail?1:0);
