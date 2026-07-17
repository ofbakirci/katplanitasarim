/* Site paketi PARSEL↔BLOK hizalama değişmezi + blok-başına geo damgası — node tests/paket-parsel-geo.js

   Bağlam: kullanıcı proje-20260716-4.mskpkg'yi içe aktarınca "parselin üzerine oturmuyor site"
   bildirdi. Bu test o paketin kpState İSKELETİNDEN (183MB paket teste GÖMÜLMEZ — yalnız parsel
   pentagonu + iki blok footprint'i + birkaç imkan) türetilmiş küçük bir SİTE durumu kurar ve
   stateSnapshot(false,true) → restoreState round-trip'inin parsel/blok/imkan koordinatlarını
   BİREBİR koruduğunu (kayma YOK) + blokların parsel poligonu İÇİNDE kaldığını doğrular.

   Kapsam:
   a) Site wrap round-trip: parcelPts / parcelRot / pts(aktif blok) / amenities / blocks[i].pts
      restoreState sonrası girdiyle BİREBİR aynı (import parcelRot'u YENİDEN uygulamıyor → çift
      döndürme YOK; blok-yerel vs site-global çerçeve karışmıyor).
   b) Hizalama: her iki blok footprint'inin TÜM köşeleri parsel poligonunun içinde (nokta-poligon).
      Bu, "site parselin üzerine oturuyor" değişmezinin regresyon kilididir.
   c) normalizeFloorParcels: üst-seviye geo blocks[] üzerine damgalanır (paket-geo.js YALNIZ floors[]
      test ediyordu; site yolu = blocks[] ayrı hüküm) — ring derin kopya, geo'suz üst → blok null.

   psProj/parcelPts/blocks/amenities parsel.js+app.js+io.js aynı eval kapsamında (extractAppScript). */
const {extractAppScript}=require('./support/app-js');
let pass=0, fail=0;
const ok=(c,msg)=>{ if(c){pass++;} else {fail++; console.log('  [FAIL]', msg); } };

function stubEl(tag){ return {
  tag, attrs:{}, children:[], style:{}, dataset:{}, _ih:'', checked:false,
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

/* proje-20260716-4.mskpkg iskeleti (koordinatlar birebir gerçek paketten; plan/oda verisi HARİÇ) */
const FIX={
  parcelPts:[{x:43,y:12.5},{x:44.5,y:-16},{x:-31,y:-16},{x:-30,y:8.5},{x:-27,y:11}],
  parcelRot:-1.5153036887208142,
  block0:[{x:-25,y:-10},{x:-25,y:2},{x:-5,y:2},{x:-5,y:-10}],
  block1:[{x:38.5,y:-11.5},{x:38.5,y:8.5},{x:28.5,y:8.5},{x:28.5,y:4.5},{x:28.5,y:-1.5},{x:6.5,y:-1.5},{x:6.5,y:-11.5},{x:28.5,y:-11.5}],
  amenities:[{type:'green',x:-30.5,y:-16,w:37,h:6,ang:0},{type:'pool',x:0,y:-0.5,w:21.5,h:8,ang:0},{type:'playground',x:-5,y:-10,w:8.5,h:5,ang:0}]
};

eval(src+`
;(function(){
  const F=${JSON.stringify(FIX)};
  function pip(pt,poly){ let x=pt.x,y=pt.y,ins=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){ const xi=poly[i].x,yi=poly[i].y,xj=poly[j].x,yj=poly[j].y;
      if(((yi>y)!=(yj>y)) && (x<(xj-xi)*(y-yi)/(yj-yi)+xi)) ins=!ins; } return ins; }
  const eqPts=(a,b)=> a.length===b.length && a.every((p,i)=> p.x===b[i].x && p.y===b[i].y);

  /* aktif blok (Blok B / index 1) planını üret — footprint gerçek paketten */
  pts=F.block1.map(p=>({x:p.x,y:p.y})); closed=true;
  unitSpecs=[{oda:2,salon:1,ensuite:false,acik:false,adet:2}];
  generate();

  /* parsel-ailesi + imkanlar (site-ortak) */
  parcelPts=F.parcelPts.map(p=>({x:p.x,y:p.y})); parcelClosed=true; parcelRot=F.parcelRot; parcelImar=null;
  amenities=F.amenities.map(a=>Object.assign({},a));

  /* SİTE: blocks[] = [Blok A(index0), Blok B(index1=aktif)]. Blok A = aktif snapshot'ın klonu,
     footprint'i Blok A'nınki (invariant testi koordinat korunumu; A'nın oda planı önemsiz). */
  const st1=stateSnapshot(false);                      // Blok B tam snapshot (plan dahil)
  const st0=JSON.parse(JSON.stringify(st1)); st0.pts=F.block0.map(p=>({x:p.x,y:p.y}));
  blocks=[st0, st1]; activeBlock=1;
  document.getElementById('siteMod').checked=true;     // siteOn() = blocks && siteMod.checked
  ok(typeof siteOn==='function' && siteOn(), 'kurulum: siteOn() aktif');

  /* wrap = TÜM site durumu (blocks gömülü) */
  const wrap=stateSnapshot(false, true);
  ok(!!wrap && wrap.site===true, 'a: site wrap üretildi');
  ok(Array.isArray(wrap.blocks) && wrap.blocks.length===2, 'a: wrap 2 blok taşıyor');
  ok(wrap.activeBlock===1, 'a: aktif blok index korundu');

  /* canlıyı KİRLET (kayma olsaydı geri gelmezdi) sonra tam restore */
  parcelPts=[]; parcelRot=0; amenities=[]; blocks=null; activeBlock=0; pts=[];
  document.getElementById('siteMod').checked=false;
  restoreState(JSON.parse(JSON.stringify(wrap)), {fit:false});

  /* --- (a) round-trip: koordinatlar BİREBİR (import kayma/döndürme uygulamıyor) --- */
  ok(eqPts(parcelPts, F.parcelPts), 'a: parcelPts birebir korundu (parcelRot YENİDEN uygulanmadı)');
  ok(parcelRot===F.parcelRot, 'a: parcelRot birebir korundu');
  ok(eqPts(pts, F.block1), 'a: aktif blok (B) footprint birebir korundu');
  ok(Array.isArray(blocks) && blocks.length===2 && activeBlock===1, 'a: blocks[]/activeBlock geri geldi');
  ok(blocks[0] && eqPts(blocks[0].pts, F.block0), 'a: Blok A footprint birebir korundu');
  ok(blocks[1] && eqPts(blocks[1].pts, F.block1), 'a: Blok B footprint birebir korundu');
  ok(amenities.length===F.amenities.length && amenities.every((a,i)=> a.x===F.amenities[i].x && a.y===F.amenities[i].y && a.w===F.amenities[i].w && a.h===F.amenities[i].h && a.type===F.amenities[i].type), 'a: amenities birebir korundu (site-ortak)');

  /* --- (b) HİZALAMA: her iki blok TÜM köşeleriyle parsel poligonu İÇİNDE (kayma yok) --- */
  ok(blocks[0].pts.every(p=>pip(p, parcelPts)), 'b: Blok A tüm köşeleri parsel içinde');
  ok(blocks[1].pts.every(p=>pip(p, parcelPts)), 'b: Blok B tüm köşeleri parsel içinde');
  ok(F.amenities.every(a=>[[a.x,a.y],[a.x+a.w,a.y],[a.x+a.w,a.y+a.h],[a.x,a.y+a.h]].every(c=>pip({x:c[0],y:c[1]}, parcelPts))), 'b: tüm imkanlar parsel içinde');

  /* --- (c) normalizeFloorParcels: üst-seviye geo blocks[] üzerine damgalanır (SİTE yolu) --- */
  const RING=[[29.0228,41.0805],[29.0230,41.0803],[29.0225,41.0802],[29.0223,41.0805]];
  const w2={ parcelPts:F.parcelPts, parcelClosed:true, parcelRot:F.parcelRot, parcelImar:null,
    geo:{lng0:29.0228, lat0:41.0805, mLng:84000, mLat:111320, dx:5, dy:-3, rot:0.12, ring:RING.map(c=>c.slice())},
    amenities:[],
    blocks:[ {pts:F.block0.slice(), geo:null}, {pts:F.block1.slice(), geo:null} ] };
  normalizeFloorParcels(w2);
  ok(JSON.stringify(w2.blocks[0].geo)===JSON.stringify(w2.geo), 'c: Blok A geo üst-seviyeden damgalandı');
  ok(JSON.stringify(w2.blocks[1].geo)===JSON.stringify(w2.geo), 'c: Blok B geo üst-seviyeden damgalandı');
  ok(w2.blocks[0].geo.ring!==w2.geo.ring, 'c: blok geo.ring derin kopya (paylaşım yok)');
  ok(eqPts(w2.blocks[0].pts, F.block0) && eqPts(w2.blocks[1].pts, F.block1), 'c: normalize blok footprint\\'lerine DOKUNMADI');

  /* --- (c2) geo'suz üst-seviye → blok geo null (eski/SVG-dönemi paket geriye-uyumu) --- */
  const w3={ parcelPts:F.parcelPts, parcelClosed:true, parcelRot:0, parcelImar:null, geo:null, amenities:[],
    blocks:[ {pts:F.block0.slice(), geo:{lng0:1,lat0:1,mLng:1,mLat:1,dx:0,dy:0,rot:0,ring:RING}} ] };
  normalizeFloorParcels(w3);
  ok(w3.blocks[0].geo===null, 'c2: üst geo yoksa blok geo null damgalanır (SVG-dönemi geriye-uyum)');
})();
`);
console.log(pass+' geçti, '+fail+' kaldı');
process.exit(fail?1:0);
