/* Avlu (iç boşluk) + Site/blok testi (kendi kendine yeter: node tests/avlu-blok.js)
   A) Avlu footprint'ten oyulur: inside hücreleri azalır, avlu merkezi dışarı sayılır,
      daireler yine yerleşir, snapshot gidiş-dönüşünde avlu korunur.
   B) Otomatik blok adı: 0→A … 25→Z, 26→AA, 27→AB.
   C) Site snapshot: stateSnapshot(false,true) çevrimsiz st.blocks üretir (JSON ok),
      restoreState blokları + aktif bloğu geri kurar; siteFootprintTotal/siteGrossTotal toplar.
*/
const {extractAppScript}=require('./support/app-js');
let pass=0, fail=0;
const ok=(c,msg)=>{ if(c){pass++;} else {fail++; console.log('  ✗',msg);} };

function stubEl(tag){ return {
  tag, attrs:{}, children:[], style:{}, dataset:{}, _ih:'',
  set innerHTML(v){ this._ih=v; this.children=[]; }, get innerHTML(){ return this._ih; },
  appendChild(c){ this.children.push(c); return c; },
  insertBefore(c){ this.children.unshift(c); return c; },
  addEventListener(){}, querySelectorAll(){ return []; },
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

const src=extractAppScript();

eval(src+`
;unitSpecs=[{oda:2,salon:1,ensuite:true,acik:false,adet:4}];
pts=[{x:0,y:0},{x:40,y:0},{x:40,y:12},{x:0,y:12}]; closed=true;
courtyards=[]; generate();

/* ===== A) Avlu ===== */
const insideCount=p=>{ let n=0; for(let i=0;i<p.inside.length;i++) if(p.inside[i]) n++; return n; };
const in0=insideCount(plan), units0=plan.unitObjs.filter(u=>u.rooms.some(g=>g.cells.length)).length;
ok(units0>0, 'avlusuz: daireler yerleşti ('+units0+')');

/* 8×4 = 32 m² avlu bina ortasına → 32/(0.5²)=128 hücre düşmeli */
courtyards=[{poly:[{x:16,y:4},{x:24,y:4},{x:24,y:8},{x:16,y:8}]}];
generate();
const in1=insideCount(plan);
ok(in0-in1===128, 'avlu inside hücrelerini tam oyuyor (düşüş '+(in0-in1)+'=128)');

/* avlu merkezindeki (20,6) hücre artık dışarıda + hiçbir bölgeye ait değil */
const cc=Math.floor((20-plan.minX)/0.5), cr=Math.floor((6-plan.minY)/0.5), ci=cr*plan.cols+cc;
ok(plan.inside[ci]===0, 'avlu merkezi hücresi inside değil');
ok(plan.cm[ci]===-1, 'avlu merkezi hücresi hiçbir bölgeye atanmadı');
/* hiçbir bölge avlu hücresi içermez (atanan hücreler = inside hücreleri) */
let assigned=0; plan.regions.forEach(g=>assigned+=g.cells.length);
let badCell=false; plan.regions.forEach(g=>g.cells.forEach(i=>{ if(!plan.inside[i]) badCell=true; }));
ok(!badCell, 'hiçbir bölge avlu/ dış hücre içermiyor');
ok(plan.unitObjs.filter(u=>u.rooms.some(g=>g.cells.length)).length>0, 'avlulu: daireler yine yerleşti');

/* snapshot gidiş-dönüşü avluyu korur */
const st=stateSnapshot();
ok(st.courtyards && st.courtyards.length===1, 'snapshot avluyu taşıyor');
plan=null; courtyards=[]; pts=[]; closed=false;
restoreState(JSON.parse(JSON.stringify(st)));
ok(courtyards.length===1 && courtyards[0].poly.length===4, 'restore avluyu geri yükledi');
ok(insideCount(plan)===in1, 'restore inside maskesi birebir');

/* ===== B) Otomatik blok adı ===== */
ok(blockName(0)==='A' && blockName(1)==='B' && blockName(3)==='D', 'blok adı A B … D');
ok(blockName(25)==='Z' && blockName(26)==='AA' && blockName(27)==='AB', 'blok adı Z sonrası AA AB');

/* ===== C) Site snapshot ===== */
getEl('siteMod').checked=true;
blocks=[null, null]; activeBlock=0;          // 0 = aktif (canlı), 1 = boş
ok(siteOn(), 'site modu aktif');
const site=stateSnapshot(false, true);
ok(site.site===true && Array.isArray(site.blocks) && site.blocks.length===2, 'site snapshot st.blocks taşıyor');
ok(!('blocks' in (site.blocks[0]||{})), 'blok-seviyesi snapshot st.blocks İÇERMEZ (çevrim yok)');
let cyclic=false; try{ JSON.stringify(site); }catch(e){ cyclic=true; }
ok(!cyclic, 'site snapshot JSON serileştirilebilir (çevrimsiz)');

/* restore site: bloklar + aktif blok geri gelir */
blocks=null; activeBlock=5; getEl('siteMod').checked=false;
restoreState(JSON.parse(JSON.stringify(site)));
ok(Array.isArray(blocks) && blocks.length===2, 'restore blok dizisini kurdu');
ok(activeBlock===0 && siteOn(), 'restore aktif blok + site modu');

/* siteFootprintTotal / siteGrossTotal toplar (blok B'yi sahte sınırla doldur) */
blocks[1]={pts:[{x:50,y:0},{x:70,y:0},{x:70,y:10},{x:50,y:10}], ui:{katSayisi:'3'}, plan:{}};
const fpA=40*12, fpB=20*10;
ok(Math.abs(siteFootprintTotal()-(fpA+fpB))<1e-6, 'siteFootprintTotal = A+B ('+siteFootprintTotal()+')');
/* aktif blok (A) kat = katSayisi input (5), blok B = 3 */
ok(Math.abs(siteGrossTotal()-(fpA*5+fpB*3))<1e-6, 'siteGrossTotal = ΣTaban×kat ('+siteGrossTotal()+')');

/* ===== D) Blok taşıma (translateStateObj, saf) ===== */
const t0={pts:[{x:0,y:0},{x:10,y:0},{x:10,y:5},{x:0,y:5}], parcelPts:[{x:-5,y:-5}],
  courtyards:[{poly:[{x:2,y:2},{x:4,y:2},{x:4,y:4},{x:2,y:4}]}],
  plan:{minX:0,minY:0,regions:[{cells:[0,1,2]}]},
  doors:{ov:{'k':{h:true,x:3,y:1}}, extra:[{h:false,x:7,y:2}]}, cuts:[[1,2]]};
const t1=translateStateObj(t0,10,5);
ok(t1.pts[0].x===10 && t1.pts[0].y===5, 'taşıma: pts çevrildi');
ok(t1.courtyards[0].poly[0].x===12 && t1.courtyards[0].poly[0].y===7, 'taşıma: avlu çevrildi');
ok(t1.plan.minX===10 && t1.plan.minY===5, 'taşıma: plan.minX/minY çevrildi (hücreler ızgaradan taşınır)');
ok(t1.doors.ov.k.x===13 && t1.doors.ov.k.y===6, 'taşıma: kapı override çevrildi');
ok(t1.doors.extra[0].x===17 && t1.doors.extra[0].y===7, 'taşıma: ekstra kapı çevrildi');
ok(t1.cuts===null, 'taşıma: ayırıcılar sıfırlandı');
ok(JSON.stringify(t1.plan.regions[0].cells)===JSON.stringify([0,1,2]), 'taşıma: hücre indeksleri değişmedi');
ok(JSON.stringify(t1.parcelPts)===JSON.stringify(t0.parcelPts), 'taşıma: parsel çevrilmedi (site-ortak)');
ok(t0.pts[0].x===0 && t0.cuts!==null, 'taşıma: orijinal snapshot mutasyona uğramadı (saf)');
const sh=p=>{let a=0;for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length];a+=p[i].x*q.y-q.x*p[i].y;}return Math.abs(a)/2;};
ok(Math.abs(sh(t1.pts)-sh(t0.pts))<1e-9, 'taşıma: alan korunur');

/* ===== E) Avlu asgari ölçü denetimi ===== */
getEl('siteMod').checked=false; blocks=null;                 // site kapat (tek bina avlu denetimi)
courtyards=[{poly:[{x:18,y:4},{x:19,y:4},{x:19,y:8},{x:18,y:8}]}]; // 1×4 m → kısa kenar 1 m < 1,5
generate();
ok(runChecks().some(x=>x.s==='bad' && /Avlu/.test(x.t)), 'dar avlu (kısa kenar 1 m) bad denetim üretir');
courtyards=[{poly:[{x:14,y:3},{x:24,y:3},{x:24,y:9},{x:14,y:9}]}]; // 10×6 m → kısa kenar 6 m ≥ önerilen
generate();
ok(!runChecks().some(x=>x.s==='bad' && /Avlu/.test(x.t)), 'geniş avlu (kısa kenar 6 m) avlu bad üretmez');
`);

console.log((fail? '  '+fail+' BAŞARISIZ, ':'✓ ')+'tüm avlu/blok testleri '+(fail?'':'geçti ')+'('+pass+')');
process.exit(fail?1:0);
