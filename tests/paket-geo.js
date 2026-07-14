/* TKGM geo-referansı (psProj) kpState kaydına ekleme testi — node tests/paket-geo.js
   Kapsam:
   a) psProj elle set edilir + plan üretilir → stateSnapshot(false,true).geo dolu, ring uzunluğu doğru
   b) psProj=null; restoreState(st) → psProj alan-alan geri geldi
   c) delete st.geo; restoreState(st) → psProj===null (eski kayıt geriye-uyumluluğu regresyonu)
   psProj parsel.js'te tanımlı, io.js ile aynı eval kapsamında (extractAppScript tüm script src'leri
   birleştirir) — dışarı açmaya gerek yok, doğrudan okunur/yazılır. */
const {extractAppScript}=require('./support/app-js');
let pass=0, fail=0;
const ok=(c,msg)=>{ if(c){pass++;} else {fail++; console.log('  [FAIL]', msg); } };

function stubEl(tag){ return {
  tag, attrs:{}, children:[], style:{}, dataset:{}, _ih:'',
  set innerHTML(v){ this._ih=v; this.children=[]; }, get innerHTML(){ return this._ih; },
  appendChild(c){ this.children.push(c); return c; },
  insertBefore(c){ this.children.unshift(c); return c; },
  addEventListener(){}, querySelectorAll(){ return []; }, querySelector(){ return null; },
  cloneNode(){ return stubEl(this.tag); },
  classList:{toggle(){},add(){},remove(){}},
  setAttribute(k,v){ this.attrs[k]=v; }, getAttribute(k){ return this.attrs[k]; },
  getBoundingClientRect(){ return {width:1200,height:800,left:0,top:0}; },
  textContent:'', value:'', disabled:false, onclick:null, click(){}, parentElement:null, offsetHeight:0
};}
const byId={}; const getEl=id=>byId[id]||(byId[id]=stubEl('div'));
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='3'; getEl('katYuk').value='2.9';
global.document={ getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t), querySelectorAll:()=>[] };
global.window={addEventListener(){}};
global.matchMedia=()=>({matches:false});
global.alert=()=>{};
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){}; global.Blob=function(){}; global.URL={createObjectURL:()=>''};
const src=extractAppScript();

eval(src+`
;(function(){
  const RING=[[28.9,41.0],[28.902,41.0],[28.902,41.001],[28.9,41.001]];   // sahte WGS84 halkası (4 köşe)
  pts=[{x:0,y:0},{x:16,y:0},{x:16,y:12},{x:0,y:12}]; closed=true;
  unitSpecs=[{oda:2,salon:1,ensuite:false,acik:false,adet:2}];
  generate();

  /* --- (a) psProj elle set + plan üretildi → stateSnapshot.geo dolu --- */
  psProj={lng0:28.901, lat0:41.0005, mLng:83500, mLat:111100, dx:1.25, dy:-0.5, rot:0.12, ring:RING.map(c=>c.slice())};
  const st=stateSnapshot(false, true);
  ok(!!st, 'a: stateSnapshot üretildi');
  ok(!!st.geo, 'a: geo dolu');
  ok(st.geo && Array.isArray(st.geo.ring) && st.geo.ring.length===RING.length, 'a: ring uzunluğu doğru ('+(st.geo&&st.geo.ring&&st.geo.ring.length)+'/'+RING.length+')');
  ok(st.geo && st.geo.lng0===28.901 && st.geo.lat0===41.0005, 'a: lng0/lat0 doğru');
  ok(st.geo && st.geo.mLng===83500 && st.geo.mLat===111100, 'a: mLng/mLat doğru');
  ok(st.geo && st.geo.dx===1.25 && st.geo.dy===-0.5, 'a: dx/dy doğru');
  ok(st.geo && Math.abs(st.geo.rot-0.12)<1e-12, 'a: rot doğru');

  /* --- (b) psProj=null; restoreState(st) → psProj alan-alan geri geldi --- */
  psProj=null;
  restoreState(JSON.parse(JSON.stringify(st)), {fit:false});
  ok(!!psProj, 'b: restoreState psProj\\'u geri kurdu');
  ok(psProj && psProj.lng0===28.901 && psProj.lat0===41.0005, 'b: lng0/lat0 geri geldi');
  ok(psProj && psProj.mLng===83500 && psProj.mLat===111100, 'b: mLng/mLat geri geldi');
  ok(psProj && psProj.dx===1.25 && psProj.dy===-0.5, 'b: dx/dy geri geldi');
  ok(psProj && Math.abs(psProj.rot-0.12)<1e-12, 'b: rot geri geldi');
  ok(psProj && Array.isArray(psProj.ring) && psProj.ring.length===RING.length
     && JSON.stringify(psProj.ring)===JSON.stringify(RING), 'b: ring geri geldi (birebir)');

  /* --- (c) delete st.geo; restoreState(st) → psProj===null (eski kayıt regresyonu) --- */
  const stNoGeo=JSON.parse(JSON.stringify(st));
  delete stNoGeo.geo;
  psProj={lng0:1,lat0:1,mLng:1,mLat:1,dx:0,dy:0,rot:0,ring:RING};   // canlıyı kirlet
  restoreState(stNoGeo, {fit:false});
  ok(psProj===null, 'c: geo alanı olmayan (eski) kayıt psProj\\'u null bıraktı');

  /* --- (b2) normalizeFloorParcels: geo de parsel-ailesiyle damgalanır --- */
  const b2={ parcelPts:[{x:0,y:0},{x:1,y:0},{x:1,y:1}], parcelClosed:true, parcelRot:0.3, parcelImar:null,
    geo:{lng0:5,lat0:5,mLng:1,mLat:1,dx:0,dy:0,rot:0.3,ring:RING}, amenities:[],
    katAyri:true, floors:[null, {parcelPts:[{x:9,y:9}], pts:[{x:0,y:0}]}] };
  normalizeFloorParcels(b2);
  ok(JSON.stringify(b2.floors[1].geo)===JSON.stringify(b2.geo), 'b2: floor geo üst-seviyeden damgalandı');
  ok(b2.floors[1].geo.ring!==b2.geo.ring, 'b2: ring derin kopyalandı (paylaşım yok)');
  const b3={ parcelPts:[], parcelClosed:false, parcelRot:0, parcelImar:null, geo:null, amenities:[],
    katAyri:true, floors:[{parcelPts:[{x:1,y:1}]}] };
  normalizeFloorParcels(b3);
  ok(b3.floors[0].geo===null, 'b3: üst-seviye geo yoksa floor geo null damgalanır');
})();
`);
console.log(pass+' geçti, '+fail+' kaldı');
process.exit(fail?1:0);
