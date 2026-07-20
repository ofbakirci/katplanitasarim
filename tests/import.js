/* İçe/dışa aktarma testi (kendi kendine yeter: node tests/import.js)
   1) Gidiş-dönüş: generate → stateSnapshot → restoreState → bölgeler birebir aynı,
      runChecks ihlal sayısı değişmez.
   2) Eski (durumsuz) SVG geometri çözümleyici: exportSVG çıktısından kpState SÖKÜLÜP
      importLegacySvg'ye verilir; daire sayısı/program/alanlar doğrulanır.
   Not: 2. bölüm DOMParser ister; `linkedom` yoksa atlanır (npm i linkedom).
*/
const fs=require('fs');
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
  textContent:'', value:'', disabled:false, onclick:null, click(){}
};}
const byId={}; const getEl=id=>byId[id]||(byId[id]=stubEl('div'));
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='5'; getEl('katYuk').value='2.9';
global.document={getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t)};
global.window={addEventListener(){}};
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){}; global.Blob=function(){}; global.URL={createObjectURL:()=>''};
global.alert=m=>{ throw new Error('alert: '+m); };
global.FileReader=function(){};
try{ global.DOMParser=require('linkedom').DOMParser; }catch(e){}

const src=extractAppScript();

eval(src+`
;unitSpecs=[{oda:2,salon:1,ensuite:true,acik:false,adet:4}];
pts=[{x:0,y:0},{x:40,y:0},{x:40,y:12},{x:0,y:12}]; closed=true;
generate();

/* --- 1) gidiş-dönüş --- */
const sig=p=>p.regions.filter(g=>g.cells.length)
  .map(g=>g.name+'|'+g.type+'|'+g.unit+'|'+g.cells.slice().sort((a,b)=>a-b).join(','))
  .sort().join(';');
const bads=o=>o.filter(x=>x.s==='bad').length;
const sig0=sig(plan), bad0=bads(runChecks()), units0=plan.unitObjs.length;
const st=stateSnapshot();
ok(!!st, 'stateSnapshot üretildi');
const js0=JSON.stringify(st);
ok(js0.length>1000, 'snapshot dolu');
/* durumu boz, sonra geri yükle */
plan=null; pts=[]; closed=false; unitSpecs=[];
restoreState(JSON.parse(js0));
ok(!!plan, 'restoreState plan kurdu');
ok(plan.unitObjs.length===units0, 'daire sayısı korunur ('+plan.unitObjs.length+'/'+units0+')');
ok(sig(plan)===sig0, 'bölge imzası birebir aynı');
ok(bads(runChecks())===bad0, 'ihlal sayısı değişmedi ('+bad0+')');
ok(plan.unitObjs.every(u=>u.spec&&typeof u.spec.oda==='number'), 'spec kopyaları sağlam');
ok(plan.unitObjs.filter(u=>u.comb).length===2, 'komb işaretleri korunur');
/* geri yükleme sonrası elle düzenleme çalışmalı: duvar listesi var */
ok(plan.wallRuns&&plan.wallRuns.length>0, 'wallRuns yeniden hesaplandı');
const sigRestored=sig(plan);
const rejects=(bad,msg)=>{
  let threw=false;
  try{ restoreState(bad); }catch(e){ threw=/durum geçersiz/.test(e.message); }
  ok(threw, msg);
  ok(sig(plan)===sigRestored, msg+' planı değiştirmedi');
};
const badCell=JSON.parse(js0); badCell.plan.regions[0].cells=[-1];
rejects(badCell, 'geçersiz hücre reddedildi');
const badUi=JSON.parse(js0); delete badUi.ui;
rejects(badUi, 'eksik ui reddedildi');

/* --- 1b) .mskpkg (MESKEN proje paketi) sniffing: importPlanText gömülü kpState'i çözer --- */
plan=null; pts=[]; closed=false; unitSpecs=[];
const pkgTxt=JSON.stringify({format:'mesken-proje-paketi', version:1, kpState:JSON.parse(js0), cameras:{}, renders:{}});
importPlanText(pkgTxt, 'proje-20260720.mskpkg');
ok(!!plan, 'mskpkg: importPlanText plan kurdu');
ok(plan.unitObjs.length===units0, 'mskpkg: daire sayısı korunur ('+plan.unitObjs.length+'/'+units0+')');
ok(sig(plan)===sig0, 'mskpkg: bölge imzası birebir aynı');
/* format alanı olmayan düz kpState JSON eskisi gibi çalışmalı (regresyon) */
plan=null; pts=[]; closed=false; unitSpecs=[];
importPlanText(js0, 'proje.json');
ok(!!plan && plan.unitObjs.length===units0, 'düz kpState JSON hâlâ çalışıyor');

/* --- 2) eski SVG geometri çözümleyici --- */
if(typeof DOMParser==='undefined'){
  console.log('  (linkedom yok: geometri çözümleyici testi atlandı — npm i linkedom)');
} else {
  /* gerçek bir dışa aktarım üret: render edilen svg'yi linkedom belgesine yaz */
  const before={units:plan.unitObjs.length,
    area:plan.unitObjs.map(u=>u.rooms.reduce((s,g)=>s+g.cells.length,0)*0.25).sort((a,b)=>a-b),
    ens:plan.unitObjs.filter(u=>u.rooms.some(g=>g.name==='EB. BANYO'&&g.cells.length)).length};
  /* exportClone yerine: tam ölçekli render'ı elle serileştir (stub DOM ağacından) */
  const save={p:pxPerM,x:panX,y:panY};
  exportView={width:Math.round((40+5)*45),height:Math.round((12+5)*45),left:0,top:0};
  pxPerM=45; panX=2.5*45; panY=2.5*45; render();
  const ser=e=>{
    const at=Object.entries(e.attrs||{}).map(([k,v])=>k+'="'+String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'"').join(' ');
    const tc=(e.textContent||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
    return '<'+e.tag+(at?' '+at:'')+'>'+tc+(e.children||[]).map(ser).join('')+'</'+e.tag+'>';
  };
  const inner=(svg.children||[]).map(ser).join('');
  exportView=null; pxPerM=save.p; panX=save.x; panY=save.y;
  const txt='<svg xmlns="http://www.w3.org/2000/svg">'+inner+'</svg>';
  ok(txt.length>10000, 'svg serileştirildi ('+txt.length+' bayt)');
  importLegacySvg(txt);
  ok(plan.unitObjs.length===before.units, 'eski-SVG: daire sayısı '+plan.unitObjs.length+'/'+before.units);
  const after=plan.unitObjs.map(u=>u.rooms.reduce((s,g)=>s+g.cells.length,0)*0.25).sort((a,b)=>a-b);
  ok(JSON.stringify(after)===JSON.stringify(before.area), 'eski-SVG: daire alanları aynı ('+after.join('/')+')');
  ok(plan.unitObjs.filter(u=>u.spec.ensuite).length===before.ens, 'eski-SVG: ensuite spec sayısı '+before.ens);
  ok(plan.unitObjs.every(u=>u.antre), 'eski-SVG: her dairede antre');
  const tot=plan.regions.reduce((s,g)=>s+g.cells.length,0);
  let ins=0; plan.inside.forEach(v=>{ if(v) ins++; });
  ok(tot===ins, 'eski-SVG: hücre bütünlüğü '+tot+'/'+ins);
}
`);
console.log(fail? ('✗ '+fail+' test düştü ('+pass+' geçti)') : ('✓ tüm içe/dışa aktarma testleri geçti ('+pass+')'));
process.exit(fail?1:0);
