/* S4a — Tek parselde çoklu blok ÇİZİM CİLASI testi (kendi kendine yeter: node tests/blok-cizim.js)
   Bu iş SALT UX/guard katmanıdır; motor üretimi (generate/snapshot) DEĞİŞMEZ.
   Kapsam:
   A) Poligon-poligon çakışma geometrisi (segIntersects / polysOverlap): kesişim + kapsama + ayrık.
   B) blockCollisionName / blockDrawValidity: site modunda aday blok sınırı başka blokla çakışır → red.
   C) blockOutsideParcel: parsel çizilmişse aday sınır dışına taşarsa red.
   D) finishPoly çakışma reddi: çakışan sınır kapatılamaz (closed=false kalır), temiz sınır kapanır.
   E) removeBlock: son blok silinemez (uyarı) + çoklu blokta silinir.
   F) addBlock: yeni blok eklenir, boş+aktif, çizim yönlendirmesi (statusHint).
   G) Toplam hesap: siteFootprintTotal / siteGrossTotal blok eklendikçe doğru toplar.
   H) updateSiteSummary: site özeti satırları (blok sayısı / Σ taban / Σ inşaat) DOM'a yazılır.
*/
const {extractAppScript}=require('./support/app-js');
let pass=0, fail=0;
const ok=(c,msg)=>{ if(c){pass++;} else {fail++; console.log('  ✗',msg);} };

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
  textContent:'', value:'', disabled:false, checked:false, onclick:null, click(){}
};}
const byId={}; const getEl=id=>byId[id]||(byId[id]=stubEl('div'));
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='5'; getEl('katYuk').value='2.9';
global.document={getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t)};
global.window={addEventListener(){}};
global.getComputedStyle=()=>({display:'none'});
global.confirm=()=>true;               // silme onayı: otomatik EVET
global.alert=()=>{};

const src=extractAppScript();

eval(src+`
;unitSpecs=[{oda:2,salon:1,ensuite:true,acik:false,adet:4}];

/* ===== A) Poligon-poligon çakışma geometrisi ===== */
const R=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
ok(segIntersects({x:0,y:0},{x:10,y:0},{x:5,y:-5},{x:5,y:5}), 'segIntersects: dik kesişen segmentler');
ok(!segIntersects({x:0,y:0},{x:10,y:0},{x:0,y:5},{x:10,y:5}), 'segIntersects: paralel segmentler kesişmez');
ok(polysOverlap(R(0,0,10,10), R(5,5,15,15)), 'polysOverlap: köşe-örtüşen dikdörtgenler');
ok(polysOverlap(R(0,0,20,20), R(5,5,10,10)), 'polysOverlap: biri diğerini tümüyle içeriyor (kapsama)');
ok(!polysOverlap(R(0,0,10,10), R(20,0,30,10)), 'polysOverlap: ayrık dikdörtgenler örtüşmez');
ok(!polysOverlap(R(0,0,10,10), R(10,0,20,10)), 'polysOverlap: bitişik (kenar teması) örtüşme sayılmaz');

/* ===== B) blockCollisionName / blockDrawValidity ===== */
getEl('siteMod').checked=true;
pts=R(0,0,20,10); closed=true; generate();
blocks=[stateSnapshot(false), null]; activeBlock=1;   // A planlı, B aktif-boş (canlı çiziliyor)
pts=[]; closed=false;                                  // aktif blok B canlı boş
ok(siteOn(), 'site modu aktif');
// aday B sınırı A ile çakışıyor → red
let v=blockDrawValidity(R(10,2,30,8));
ok(!v.ok && v.reason==='block' && v.name==='A', 'blockDrawValidity: A üstünden geçen aday → red (Blok A)');
// aday B sınırı ayrık → geçerli
v=blockDrawValidity(R(25,0,45,10));
ok(v.ok, 'blockDrawValidity: ayrık aday → geçerli');
ok(blockCollisionName(R(10,2,30,8),-1)==='A', 'blockCollisionName: çakışan bloğun adını döndürür');
ok(blockCollisionName(R(25,0,45,10),-1)===null, 'blockCollisionName: ayrık → null');
// düzenlenen aktif bloğu ignoreIdx ile atlama (kendini saymaz)
ok(blockCollisionName(R(10,2,30,8), activeBlock)==='A', 'blockCollisionName: aktif blok ignoreIdx ile atlanır, A hâlâ çakışır');

/* ===== C) parsel dışına taşma ===== */
parcelPts=R(-2,-2,50,20); parcelClosed=true;
ok(!blockOutsideParcel(R(25,0,45,10)), 'blockOutsideParcel: parsel içinde → false');
ok(blockOutsideParcel(R(45,0,60,10)), 'blockOutsideParcel: parsel dışına taşan aday → true');
v=blockDrawValidity(R(45,0,60,10));
ok(!v.ok && v.reason==='parcel', 'blockDrawValidity: parsel dışı aday → red (parsel)');
parcelPts=[]; parcelClosed=false;                     // parseli temizle (sonraki adımlar için)

/* ===== D) finishPoly çakışma reddi ===== */
activeBlock=1; pts=R(10,2,30,8); closed=false;         // B çakışan sınır çiziliyor
finishPoly();
ok(closed===false, 'finishPoly: çakışan sınır kapatılamaz (closed=false kalır)');
ok(/çakış/i.test(getEl('stHint').textContent), 'finishPoly: çakışma uyarısı statusHint\\'e yazıldı');
pts=R(25,0,45,10); closed=false;                       // B temiz sınır
finishPoly();
ok(closed===true, 'finishPoly: çakışmayan temiz sınır kapanır (closed=true)');

/* ===== E) removeBlock son-blok korumalı + çoklu blokta siler ===== */
blocks=[stateSnapshot(false)]; activeBlock=0;          // tek blok
getEl('stHint').textContent='';
removeBlock(0);
ok(blocks.length===1, 'removeBlock: son blok silinemez (blocks.length=1 kalır)');
ok(/son blok/i.test(getEl('stHint').textContent), 'removeBlock: son-blok uyarısı statusHint\\'e yazıldı');
// iki blok → sil
blocks=[stateSnapshot(false), {pts:R(30,0,50,10), ui:{katSayisi:'3'}, plan:{minX:30,minY:0,cols:0,regions:[]}}];
activeBlock=0;
removeBlock(1);
ok(blocks.length===1, 'removeBlock: çoklu blokta blok silindi (2→1)');

/* ===== F) addBlock: yeni boş+aktif blok + çizim yönlendirmesi ===== */
blocks=[stateSnapshot(false)]; activeBlock=0;
getEl('stHint').textContent='';
addBlock();
ok(blocks.length===2, 'addBlock: yeni blok eklendi (1→2)');
ok(activeBlock===1, 'addBlock: yeni blok aktif oldu');
ok(blocks[1]===null && closed===false && pts.length===0, 'addBlock: yeni blok boş tuval (null snapshot, çizime hazır)');
ok(/sınır/i.test(getEl('stHint').textContent), 'addBlock: çizim yönlendirmesi statusHint\\'e yazıldı');

/* ===== G) toplam hesap (siteFootprintTotal / siteGrossTotal) ===== */
// A planlı (aktif değil, snapshot pts=R(0,0,20,10)=200, ui.katSayisi=5); B'yi sahte sınırla doldur
blocks[0].ui={katSayisi:'5'};                          // snapshot ui kat
blocks[1]={pts:R(30,0,50,12), ui:{katSayisi:'3'}, plan:{minX:30,minY:0,cols:0,regions:[]}};
activeBlock=0; pts=R(0,0,20,10); closed=true;          // aktif=A canlı
const fpA=200, fpB=20*12;
ok(Math.abs(siteFootprintTotal()-(fpA+fpB))<1e-6, 'siteFootprintTotal = A+B ('+siteFootprintTotal()+'=440)');
getEl('katSayisi').value='5';                          // aktif blok A canlı kat
ok(Math.abs(siteGrossTotal()-(fpA*5+fpB*3))<1e-6, 'siteGrossTotal = ΣTaban×kat ('+siteGrossTotal()+'=1720)');

/* ===== H) updateSiteSummary DOM'a yazar ===== */
updateSiteSummary();
const ss=getEl('siteSummary').innerHTML;
ok(getEl('siteSummarySec').style.display==='', 'updateSiteSummary: site modunda özet bölümü görünür');
ok(/2 adet/.test(ss), 'updateSiteSummary: blok sayısı yazıldı');
ok(/Taban/.test(ss) && /440/.test(ss), 'updateSiteSummary: Σ taban (440 m²) yazıldı');
ok(/İnşaat/.test(ss) && new RegExp(fmt(1720).replace('.','\\\\.')).test(ss), 'updateSiteSummary: Σ inşaat (1720 m²) yazıldı');
// site kapalı → özet gizlenir
getEl('siteMod').checked=false; blocks=null;
updateSiteSummary();
ok(getEl('siteSummarySec').style.display==='none', 'updateSiteSummary: site kapalıyken özet gizli');
`);

console.log((fail? '  '+fail+' BAŞARISIZ, ':'✓ ')+'tüm blok-çizim (S4a) testleri '+(fail?'':'geçti ')+'('+pass+')');
process.exit(fail?1:0);
