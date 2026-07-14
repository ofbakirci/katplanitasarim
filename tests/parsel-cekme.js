/* PARSEL ÇEKME (yapı yaklaşma sınırı) testi — node tests/parsel-cekme.js
   Vaka: CW (saat yönü) sıralı + İÇBÜKEY parselde tkgmSetbackMiter'ın alan kontrolü
   yön-körüydü (`oa<=1` sonucu CCW varsayar) → CW parselde doğru miter ofseti bile
   negatif alanlı olduğundan HEP reddedilir → tkgmSetbackHP'ye düşülür → HP içbükeyde
   konveks çekirdeğe ÇÖKER (girinti kenarları yutulur; çekme 3m yerine 14-21m).
   Fikstürler kullanıcının indirdiği iki gerçek plandan (kat-plani.svg / kat-plani-2.svg,
   kpState.parcelPts) GÖMÜLÜ — dosya bağımlılığı yok. Fix: parsel.js tkgmSetbackMiter
   `Math.abs(oa)<=1 || Math.sign(oa)!==Math.sign(a2)` (yön-farkında geçerlilik). */
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
global.document={getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t)};
global.window={addEventListener(){}};
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){}; global.Blob=function(){}; global.URL={createObjectURL:()=>''};

const {extractAppScript}=require('./support/app-js');
const src=extractAppScript();

let pass=0, fail=0;
const T=(name,cond)=>{ if(cond){pass++;} else {fail++; console.log('  [FAIL]', name);} };

/* ---- fikstürler ---- */
// VAKA 1: kat-plani.svg — 8 kenar, CW (area2=-2898), reflex köşe 4-5 (girinti); eski kod 6 köşeye çökertiyordu
const VAKA1=[{x:-18,y:25},{x:22.5,y:25},{x:29,y:9.5},{x:7.5,y:-11.5},{x:4.5,y:-9},{x:-8.5,y:-12},{x:-18.5,y:-14.5},{x:-18.5,y:-12}];
// VAKA 2: kat-plani-2.svg — 8 kenar, CW (area2=-1224), 3 reflex köşe (1,3,6); eski kod 5 köşeye çökertiyordu
const VAKA2=[{x:26,y:-8.5},{x:-3,y:-8.5},{x:-14,y:-9},{x:-13.5,y:-4},{x:-13.5,y:9},{x:-4,y:9.5},{x:-3.5,y:6},{x:25.5,y:6.5}];
const CEKME=3;                                     // her iki planda varsayılan yan çekme (psFrontEdge seçilmemiş)

/* kenar boyunca örneklenen dik klerens (setback poligonuna min uzaklık) */
function edgeClearances(poly, sb){
  const distPP=(px,py,q)=>{ let best=1e9;
    for(let i=0;i<q.length;i++){ const a=q[i],b=q[(i+1)%q.length];
      const dx=b.x-a.x, dy=b.y-a.y, L=dx*dx+dy*dy||1;
      let t=((px-a.x)*dx+(py-a.y)*dy)/L; t=Math.max(0,Math.min(1,t));
      const d=Math.hypot(px-(a.x+t*dx), py-(a.y+t*dy)); if(d<best) best=d; }
    return best; };
  return poly.map((a,i)=>{ const b=poly[(i+1)%poly.length]; const ds=[];
    for(let t=0.1;t<=0.9;t+=0.1) ds.push(distPP(a.x+(b.x-a.x)*t, a.y+(b.y-a.y)*t, sb));
    return {min:Math.min(...ds), max:Math.max(...ds)}; });
}

eval(src + `
;(function(){
  const dArr1=VAKA1.map(()=>CEKME), dArr2=VAKA2.map(()=>CEKME);

  /* (a) CW-içbükey parseller: sınır çökmemeli — köşe sayısı parsel kenar sayısını izler */
  T('vaka1 içbükey', !tkgmIsConvex(VAKA1));
  T('vaka2 içbükey', !tkgmIsConvex(VAKA2));
  const sb1=tkgmSetback(VAKA1, dArr1);
  const sb2=tkgmSetback(VAKA2, dArr2);
  T('vaka1 çökmedi (8 köşe, eski kod 6)', sb1.length===8);
  T('vaka2 çökmedi (8 köşe, eski kod 5)', sb2.length===8);
  T('vaka1 tüm köşeler parsel içinde', sb1.every(q=>pip(q.x,q.y,VAKA1)));
  T('vaka2 tüm köşeler parsel içinde', sb2.every(q=>pip(q.x,q.y,VAKA2)));

  /* (b) kenar-kenar dik klerens ~ çekme; keskin reflex köşe civarındaki gerçek geometrik
     daralmaya tolerans (vaka1 girinti tepesinde 1.73m gerçek min). Eski çökmüş HP'de
     girinti kenarında min 14.46'ydı → üst sınır 3.05 bunu kesin yakalar. */
  edgeClearances(VAKA1, sb1).forEach((c,i)=>{
    T('vaka1 kenar '+i+' sınırı izliyor (min<=3.05, ölçülen '+c.min.toFixed(2)+')', c.min<=CEKME+0.05);
    T('vaka1 kenar '+i+' aşırı yaklaşmıyor (min>=1.7)', c.min>=1.7);
    T('vaka1 kenar '+i+' sapmıyor (max<=4.5, ölçülen '+c.max.toFixed(2)+')', c.max<=4.5);
  });
  edgeClearances(VAKA2, sb2).forEach((c,i)=>{
    T('vaka2 kenar '+i+' klerens ~3 (ölçülen '+c.min.toFixed(2)+')', Math.abs(c.min-CEKME)<=0.05);
    T('vaka2 kenar '+i+' sapmıyor (max<=4.5)', c.max<=4.5);
  });

  /* (c) KONTRAST/regresyon: konveks CCW parsel (HP yolu) değişmeden doğru */
  const RECT=[{x:0,y:0},{x:20,y:0},{x:20,y:10},{x:0,y:10}];        // CCW
  T('rect konveks', tkgmIsConvex(RECT));
  const sbR=tkgmSetback(RECT, RECT.map(()=>CEKME));
  T('rect 4 köşe', sbR.length===4);
  const wantR=[[3,3],[17,3],[17,7],[3,7]];
  T('rect birebir iç dikdörtgen', wantR.every(w=>sbR.some(q=>Math.abs(q.x-w[0])<1e-6 && Math.abs(q.y-w[1])<1e-6)));

  /* (d) CCW içbükey (miter yolu eskiden de geçiyordu — bozulmadığını sabitle):
     vaka1'in ters sıralısı = aynı geometri CCW; sonuç köşe KÜMESİ CW sonucuyla aynı olmalı */
  const V1CCW=VAKA1.slice().reverse();
  T('vaka1-ccw içbükey', !tkgmIsConvex(V1CCW));
  const sbC=tkgmSetback(V1CCW, V1CCW.map(()=>CEKME));
  T('vaka1-ccw çökmedi (8 köşe)', sbC.length===8);
  const key=q=>Math.round(q.x*100)+','+Math.round(q.y*100);
  const s1=new Set(sb1.map(key));
  T('vaka1-ccw köşe kümesi CW ile aynı', sbC.length===sb1.length && sbC.every(q=>s1.has(key(q))));
})();
`);

console.log('parsel-cekme:', pass+' pass, '+fail+' fail');
process.exit(fail?1:0);
