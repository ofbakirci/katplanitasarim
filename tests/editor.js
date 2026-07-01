// Editör testleri: daire iç düzen tercihi (unitLayout) + dış (sınır) duvar sürükleme.
// APP_JS ile farklı hazırlanmış app script yolu verilebilir.
function stubEl(tag){ return {
  tag, attrs:{}, children:[], style:{}, dataset:{}, _ih:'',
  set innerHTML(v){ this._ih=v; this.children=[]; }, get innerHTML(){ return this._ih; },
  appendChild(c){ return c; }, addEventListener(){}, querySelectorAll(){ return []; },
  classList:{toggle(){},add(){},remove(){}},
  setAttribute(){}, getAttribute(){ return null; },
  getBoundingClientRect(){ return {width:1400,height:1000,left:0,top:0}; },
  textContent:'', value:'', disabled:false, onclick:null, click(){}
};}
const byId={}; const getEl=id=>byId[id]||(byId[id]=stubEl('div'));
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='5'; getEl('katYuk').value='2.9';
global.document={getElementById:getEl,createElement:t=>stubEl(t),createElementNS:(n,t)=>stubEl(t)};
global.window={addEventListener(){}};
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){};global.Blob=function(){};global.URL={createObjectURL:()=>''};
const t=(name,ok)=>console.log((ok?' ✓ ':' ✗ FAIL ')+name);
eval(require('./support/app-js').readAppScript() + `
;unitSpecs=[{oda:2,salon:1,ensuite:true,acik:false,adet:5},{oda:1,salon:1,ensuite:false,acik:true,adet:8}];
pts=[{x:0,y:0},{x:40,y:0},{x:40,y:30},{x:0,y:30}]; closed=true;
generate();
const snap=()=>plan.unitObjs.map(u=>u.rooms.filter(g=>g.cells.length).map(g=>g.name+':'+g.area.toFixed(1)).join(','));
const base=snap();

// --- 1) iç düzen tercihi (unitLayout): kapsam + etki ---
const bedArea=k=>{ const b=plan.unitObjs[k].rooms.filter(g=>g.type==='yatak'&&!g.name.startsWith('EB'));
  return b.length? Math.max(...b.map(g=>g.area)) : 0; };
const d4auto=bedArea(3);
unitLayout={3:'flat'}; generate(true);
const f=snap(); let changed=[]; for(let k=0;k<base.length;k++) if(base[k]!==f[k]) changed.push(k);
/* hedef daire (3) HER ZAMAN değişmeli; rectifyUnitBalance (c) daire-alan-dengeleme daire
   SINIRLARINI iç düzen tercihinden BAĞIMSIZ olarak dengeler — bu fixture'da D4/D5 (3,4)
   zaten en büyük 2 daire ve komşu, flat tercihi D4'ün iç oda geometrisini değiştirince
   ortak sınırdaki aday duvar şeritleri de değişir (kasıtlı: bkz planner.js rectifyUnitBalance
   üstü yorum). Bu yüzden hedefin KENDİSİ + en fazla 1 doğrudan KOMŞU daire değişebilir;
   uzak/ilgisiz daireler ASLA değişmemeli. */
const wrAfterFlat=computeWallRuns();
const uOfAfterFlat=new Map(); plan.unitObjs.forEach((u,k)=>u.rooms.forEach(g=>uOfAfterFlat.set(g.id,k)));
t('flat tercihi yalnız hedef daireyi (+ en fazla 1 komşu) değiştirir',
  changed.includes(3) && changed.length<=2 &&
  changed.every(k=>k===3 || wrAfterFlat.some(r=>{
    const ra=uOfAfterFlat.get(r.a), rb=uOfAfterFlat.get(r.b); return r.ext && ((ra===3&&rb===k)||(ra===k&&rb===3));
  })));
t('flat tercihi D4 yatak odasını iyileştirir (sliver yok)', bedArea(3)>=9);
unitLayout={}; generate(true);
t('tercih kaldırınca taban plana döner', JSON.stringify(snap())===JSON.stringify(base));

// --- 2) dış (sınır) duvar sürükleme ---
plan.wallRuns=computeWallRuns();
const uOf=new Map(); plan.unitObjs.forEach((u,k)=>u.rooms.forEach(g=>uOf.set(g.id,k)));
const ext=plan.wallRuns.filter(r=>r.ext), intr=plan.wallRuns.filter(r=>!r.ext);
t('iç ve dış duvarlar ayrışıyor', intr.length>0 && ext.length>0);
const dd=ext.filter(r=>uOf.get(r.a)!==undefined&&uOf.get(r.b)!==undefined);
t('daire-daire sınır duvarı sürüklenebilir', dd.length>0);
const pw=dd[0], kA=uOf.get(pw.a), kB=uOf.get(pw.b);
const area=k=>plan.unitObjs[k].rooms.reduce((s,g)=>s+g.area,0);
const tot0=area(kA)+area(kB), cells0=plan.regions.reduce((s,g)=>s+g.cells.length,0);
const ok=moveWallStep(pw,1);
plan.regions.forEach(g=>calcRegionMetrics(g,plan.cols,plan.minX,plan.minY));
t('sınır duvarı taşındı', ok);
t('toplam alan korunur (hücre komşuya geçer)', Math.abs(area(kA)+area(kB)-tot0)<0.01);
t('hücre bütünlüğü korunur', cells0===plan.regions.reduce((s,g)=>s+g.cells.length,0));
// çekirdek/kaçış duvarları sabit
const coreTouch=plan.wallRuns.some(r=>['merdiven','yangin','asansor','teknik'].includes(plan.regions[r.a].type)||['merdiven','yangin','asansor','teknik'].includes(plan.regions[r.b].type));
t('çekirdek/kaçış duvarları sürüklenemez', !coreTouch);

// --- 3) apartman sınırı bütün olarak taşınır (grup) + birleşme + geri al ---
unitLayout={}; generate(); plan.wallRuns=computeWallRuns();
const uOf2=new Map(); plan.unitObjs.forEach((u,k)=>u.rooms.forEach(g=>uOf2.set(g.id,k)));
// kuzeyde üst üste binen iki daire (D4/D5) sınırı: çok parçalı AMA tek doğru (aynı pos/horiz)
// olmalı — iki daire arasında L köşesi gibi farklı hizalardaki parçaları da sayan kaba
// pairCount, boundaryGroup'un (aynı pos/horiz) GRUPLAMADIĞI bir çifti seçebilir (test kırılganlığı).
const pairCount={};
plan.wallRuns.filter(r=>r.ext).forEach(r=>{const a=uOf2.get(r.a),b=uOf2.get(r.b);
  if(a!==undefined&&b!==undefined){const k=[a,b].sort().join('-'); pairCount[k]=(pairCount[k]||0)+1;}});
const isCollinearPair=([k])=>{
  const [ka,kb]=k.split('-').map(Number);
  const segs=plan.wallRuns.filter(r=>{const a=uOf2.get(r.a),b=uOf2.get(r.b); return (a===ka&&b===kb)||(a===kb&&b===ka);});
  return segs.every(s=>s.horiz===segs[0].horiz && s.pos===segs[0].pos);
};
const multi=Object.entries(pairCount).filter(([k,n])=>n>=2).find(isCollinearPair);
t('çok parçalı apartman sınırı var (üst üste daire)', !!multi);
if(multi){
  const [ka,kb]=multi[0].split('-').map(Number);
  const segs=plan.wallRuns.filter(r=>{const a=uOf2.get(r.a),b=uOf2.get(r.b); return (a===ka&&b===kb)||(a===kb&&b===ka);});
  const grp=boundaryGroup(segs[0]);
  t('boundaryGroup tüm sınır parçalarını kapsıyor', grp.length===segs.filter(s=>s.pos===segs[0].pos&&s.horiz===segs[0].horiz).length && grp.length>=2);
  const cellsBefore=plan.regions.reduce((s,g)=>s+g.cells.length,0);
  const snap=snapshotRegions();
  const areaK=k=>plan.unitObjs[k].rooms.reduce((s,g)=>s+g.area,0);
  const aA=areaK(ka), aB=areaK(kb);
  const want=segs[0].pos+ (segs[0].pos< plan.corridorR0 ? 3 : -3);
  boundaryGroup(segs[0]).forEach(rn=>{let g2=0; while(rn.pos!==want&&g2++<160){ if(!moveWallStep(rn,want>rn.pos?1:-1))break; }});
  plan.regions.forEach(g=>calcRegionMetrics(g,plan.cols,plan.minX,plan.minY));
  t('grup taşıma iki daireyi de yeniden boyutlandırır', Math.abs(areaK(ka)-aA)>1 && Math.abs(areaK(kb)-aB)>1);
  t('grup taşımada toplam hücre korunur', cellsBefore===plan.regions.reduce((s,g)=>s+g.cells.length,0));
  // geri al
  restoreRegions(snap);
  t('geri al sınırı eski yerine döndürür', Math.abs(areaK(ka)-aA)<0.01 && Math.abs(areaK(kb)-aB)<0.01);
}
// birleşme: tek salon / antre yutulamaz (güvenlik)
const someUnit=plan.unitObjs.find(u=>u.rooms.some(g=>g.type==='salon'&&!u.rooms.some(o=>o!==g&&o.type==='salon'&&o.cells.length)));
const onlySalon=someUnit && someUnit.rooms.find(g=>g.type==='salon');
t('tek salon yutulamaz (canAbsorb=false)', onlySalon? canAbsorb(onlySalon)===false : true);
const someAntre=plan.unitObjs.find(u=>u.antre&&u.antre.cells.length);
t('antre yutulamaz (canAbsorb=false)', someAntre? canAbsorb(someAntre.antre)===false : true);

// --- 4) daireyi sil (komşuya kat) — tek salon/mutfak takılmadan tüm daire dağıtılır ---
unitLayout={}; generate(); plan.wallRuns=computeWallRuns();
const liveCount=()=>plan.unitObjs.filter(u=>u.rooms.some(g=>g.cells.length)).length;
const cellsAll=()=>plan.regions.reduce((s,g)=>s+g.cells.length,0);
const areaOf=k=>plan.unitObjs[k].rooms.reduce((s,g)=>s+g.area,0);
// kuzeyde komşusu olan bir daire seç (D4/D5 gibi üst üste)
const uOf3=new Map(); plan.unitObjs.forEach((u,k)=>u.rooms.forEach(g=>uOf3.set(g.id,k)));
let target=-1, tneigh=-1;
for(let k=0;k<plan.unitObjs.length;k++){
  const nb=new Set(); plan.unitObjs[k].rooms.forEach(g=>g.cells.forEach(i=>{const r=(i/plan.cols)|0,c=i%plan.cols;
    [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc])=>{if(rr<0||cc<0||rr>=plan.rows||cc>=plan.cols)return;const j=rr*plan.cols+cc;const kk=uOf3.get(plan.cm[j]);if(kk!==undefined&&kk!==k)nb.add(kk);});}));
  if(nb.size){ target=k; tneigh=[...nb][0]; break; }
}
t('silinecek daire ve komşusu bulundu', target>=0 && tneigh>=0);
if(target>=0){
  const c0=cellsAll(), lv0=liveCount(), nbArea0=areaOf(tneigh);
  const snap=snapshotRegions();
  const ok=dissolveUnit(target);
  t('daire silindi', ok && areaOf(target)===0);
  t('komşu daire büyüdü (alan ona katıldı)', areaOf(tneigh)>nbArea0);
  t('silmede toplam hücre korunur', cellsAll()===c0);
  t('canlı daire sayısı 1 azaldı', liveCount()===lv0-1);
  restoreRegions(snap);
  t('silmeyi geri al daireyi geri getirir', liveCount()===lv0 && cellsAll()===c0);
}
`);
