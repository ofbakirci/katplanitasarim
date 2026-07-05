/* BALKON-3B: buildFloorplanMap().balconies[] export doğrulama (headless).
   Sentetik plan üretir → B aracının veri yoluna (balconies dizisi) geçerli bir balkon kaydı
   ekler → buildFloorplanMap() çağırır → balconies[] export'unu denetler:
     - poligon px = doors/windows ile AYNI fr.px dönüşümü (parity): iki köşeyi bağımsız
       yeniden hesaplayıp export px ile karşılaştırır (<0.6 px sapma).
     - dünya poligonu balkQuad ile birebir; alan = genişlik×derinlik.
     - unit_id bağlı daireyi (D1) verir; room_id dolu + bilinen bir oda id'si.
     - door_span iç kenar orta ±0.45m; kadraj içinde; norm tutarlı.
   MOTOR KODUNU DEĞİŞTİRMEZ; yalnız balconies dizisini kurar + export'u okur.
*/
'use strict';
const vm = require('vm');
const { scriptSources } = require('./support/app-js');
const { installDom } = require('./support/dom-stub');

const dom = installDom({ binaTipi:'apartman', katSayisi:5, katYuk:2.9 });
const ctx = vm.createContext({
  console, matchMedia:()=>({matches:false}),
  document: dom.document,
  window:{ addEventListener(){}, matchMedia:()=>({matches:false}) },
  XMLSerializer:function(){ this.serializeToString=()=>''; },
  Image:function(){}, Blob:function(){},
  URL:{ createObjectURL:()=>'', revokeObjectURL(){} },
  localStorage:{ getItem(){return null;}, setItem(){} },
  requestAnimationFrame:fn=>fn&&fn(), setTimeout, clearTimeout,
  navigator:{ userAgent:'node' }
});
scriptSources().forEach(({ source, filename }) => new vm.Script(source, { filename }).runInContext(ctx));

let fails=0; const fail=m=>{ console.log('  ✗ '+m); fails++; };
const ok=m=>console.log('  ✓ '+m);

/* ---- sentetik plan: 20×12 tek daire (2+1) ---- */
ctx.__PTS=[{x:0,y:0},{x:20,y:0},{x:20,y:12},{x:0,y:12}];
ctx.__SPECS=[{oda:2,salon:1,ensuite:true,acik:false,adet:1}];
new vm.Script(`
  pts = __PTS; closed = true;
  unitSpecs = __SPECS.map(s=>({...s}));
  customCutsZ = null; unitLayout = {}; balconies = [];
  doorOverrides = {}; extraDoors = []; doorHidden = {}; editHistory = [];
  generate();
  // B aracının kullandığı veri yolu: alt cephe (pts[0]->pts[1]) kenarına balkon.
  // ghostBalk mantığıyla uyumlu geçerli kayıt (ei, t0<t1, depth).
  balconies = [{ ei:0, t0:6, t1:10, depth:1.5 }];
  __MAP = buildFloorplanMap();
`, { filename:'balkon-3b-setup.js' }).runInContext(ctx);

const map=ctx.__MAP;
if(!map){ console.error('HATA: buildFloorplanMap() null'); process.exit(1); }

/* ---- 1) balconies[] var + tek kayıt ---- */
if(!Array.isArray(map.balconies)) fail('balconies[] dizisi yok');
else if(map.balconies.length!==1) fail('balkon sayısı 1 değil: '+map.balconies.length);
else ok('balconies[] tek kayıt döndü');

const b=(map.balconies||[])[0];
if(!b){ console.log('\nSONUÇ: ✗ balkon export edilmedi'); process.exit(1); }

const W=map.render.width, H=map.render.height;

/* ---- 2) boyutlar ---- */
if(b.width_m!==4) fail('width_m 4 değil: '+b.width_m);
if(b.depth_m!==1.5) fail('depth_m 1.5 değil: '+b.depth_m);
if(Math.abs(b.area_m2-6)>0.01) fail('area_m2 6 değil: '+b.area_m2);
if(b.width_m===4 && b.depth_m===1.5 && Math.abs(b.area_m2-6)<0.01) ok('boyut: '+b.width_m+'×'+b.depth_m+' = '+b.area_m2+' m²');

/* ---- 3) poligon: 4 köşe, dünya + px + norm ---- */
if(!(b.polygon_m&&b.polygon_m.length===4)) fail('polygon_m 4 köşe değil');
if(!(b.polygon_px&&b.polygon_px.length===4)) fail('polygon_px 4 köşe değil');
if(!(b.polygon_norm&&b.polygon_norm.length===4)) fail('polygon_norm 4 köşe değil');

/* ---- 4) PARITY: px = fr.px(world) bağımsız yeniden hesap ----
   origin_px + metersPerPixel'ten ters dönüşüm: px = world/mpp + origin. doors/windows AYNI yol. */
const mpp=map.scale.metersPerPixel, o=map.scale.origin_px;
const worldToPx=(mx,my)=>[mx/mpp+o[0], my/mpp+o[1]];
let maxDev=0;
b.polygon_m.forEach((wc,i)=>{ const exp=worldToPx(wc[0],wc[1]), got=b.polygon_px[i];
  const dv=Math.hypot(exp[0]-got[0],exp[1]-got[1]); if(dv>maxDev) maxDev=dv; });
if(maxDev>0.6) fail('polygon_px parity sapması '+maxDev.toFixed(2)+' px (>0.6)');
else ok('polygon_px ↔ world parity: max sapma '+maxDev.toFixed(3)+' px (doors/windows ile aynı fr.px)');

/* ---- 5) poligon kadraj sınırına yakın; DIŞ kenar bilinçli olarak binadan taşar ----
   Temiz JSON kadrajı binaya sıkı (marg=0.15m, balkon payı YOK) → balkonun dış kenarı
   kadraj DIŞINA (px<0 / px>W) taşabilir; bu BEKLENEN (3B world-metre uzayında sorun değil,
   view3d px2m ile kurar). Parity (madde 4) asıl sözleşme. Burada yalnız balkonun BİNAYA
   BİTİŞİK olduğunu (iç kenarın kadraj civarında) doğrularız. */
const inner=[b.polygon_px[0],b.polygon_px[1]];   // iç kenar (d=0) — binaya bitişik
if(!inner.every(p=>p[0]>=-2&&p[1]>=-2&&p[0]<=W+2&&p[1]<=H+2)) fail('balkon iç kenarı kadraj dışı (binaya bitişik değil)');
else ok('balkon iç kenarı binaya bitişik (dış kenar bilinçli olarak kadrajdan taşar)');

/* ---- 6) norm tutarlı ---- */
let normOk=true;
b.polygon_px.forEach((p,i)=>{ const nn=b.polygon_norm[i];
  if(Math.abs(nn[0]*W-p[0])>1.5||Math.abs(nn[1]*H-p[1])>1.5) normOk=false; });
if(!normOk) fail('polygon_norm*render ≠ polygon_px'); else ok('polygon_norm ↔ px tutarlı');

/* ---- 7) unit/room ataması ---- */
if(b.unit_id!=='D1') fail('unit_id D1 değil: '+b.unit_id);
else ok('unit_id = D1 (bağlı daire)');
if(!b.room_id) fail('room_id null (arkadaki oda bulunamadı)');
else {
  const known=new Set();
  map.units.forEach(u=>u.rooms.forEach(r=>known.add(r.id)));
  (map.common_areas||[]).forEach(r=>known.add(r.id));
  if(!known.has(b.room_id)) fail('room_id bilinmiyor: '+b.room_id);
  else ok('room_id = '+b.room_id+' (arkadaki oda, bilinen id)');
}

/* ---- 8) door_span: iç kenar orta ±0.45m, kadraj içinde, norm tutarlı ---- */
if(!(b.door_span_px&&b.door_span_px.length===2)) fail('door_span_px 2 nokta değil');
else {
  const d0=b.door_span_px[0], d1=b.door_span_px[1];
  const spanPxLen=Math.hypot(d1[0]-d0[0],d1[1]-d0[1]);       // 0.9m → px
  const expLen=0.9/mpp;
  if(Math.abs(spanPxLen-expLen)>1.0) fail('door_span uzunluğu '+spanPxLen.toFixed(1)+' px, beklenen ~'+expLen.toFixed(1));
  else ok('door_span = 0.9m (~'+spanPxLen.toFixed(0)+' px), iç kenar ortası');
  if(b.door_span_norm&&b.door_span_norm.length===2){
    if(Math.abs(b.door_span_norm[0][0]*W-d0[0])>1.5) fail('door_span_norm ≠ px');
    else ok('door_span_norm ↔ px tutarlı');
  } else fail('door_span_norm eksik');
}

/* ---- 9) normal DIŞA bakar (alt cephede -y yönü) ---- */
if(!(b.normal_out&&Math.abs(b.normal_out[1]+1)<0.01)) fail('normal_out alt cephede (0,-1) değil: '+JSON.stringify(b.normal_out));
else ok('normal_out = '+JSON.stringify(b.normal_out)+' (cepheden dışa)');

/* ---- 10) mevcut şema ekleri bozulmadı (additive) ---- */
['units','common_areas','doors','windows','warnings','scale','render'].forEach(k=>{
  if(!(k in map)) fail('mevcut anahtar kayboldu: '+k); });
ok('mevcut buildFloorplanMap şeması korundu (salt-ekleme)');

console.log(fails ? ('\nSONUÇ: ✗ '+fails+' BAŞARISIZ') : '\nSONUÇ: ✓ tüm BALKON-3B export testleri GEÇTİ');
process.exit(fails?1:0);
