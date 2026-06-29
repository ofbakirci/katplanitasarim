/* İÇE AKTARILAN BOZUK DÜZEN OTOMATİK ONARIMI testi — node tests/repair-import.js
   Vaka (kat-plani-44): düzenleme (cut sürükleme / oda silme / takas) bağımsız bölüm
   hücrelerini APARTMAN HOLÜ'ne (koridor) döküp odaları HÜCRESİZ bırakabiliyor. Kaydedilip
   yeniden açılınca hol kat alanının %35'ini yutmuş (sağlıklı: ~%5), 14 hücresiz "hayalet"
   oda kalmış, daireler 2+1 yerine 0+1/1+1/0+1'e düşmüş olur. Sonuç: koridor parçalı →
   moveWallStep'in regConnected'ı kuzeye/hole doğru her duvar sürüklemesini reddeder ("hol
   doldurulamıyor"). healDisconnected/fixOrphans koridoru ATLADIĞI için onaramaz.
   Fix: importPlanText yüklemede planLooksBroken() ile sezer → generate(true) ile spec+cut'tan
   YENİDEN ÜRETİR (repairImportedPlan). Sağlıklı planda NO-OP (yanlış-pozitif yok). */
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
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='5'; getEl('katYuk').value='2.9';
global.document={getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t)};
global.window={addEventListener(){}};
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){}; global.Blob=function(){}; global.URL={createObjectURL:()=>''};

const {extractAppScript}=require('./support/app-js');
const src=extractAppScript();

let pass=0, fail=0;
const T=(name,cond)=>{ if(cond){pass++;} else {fail++; console.log('  [FAIL]', name);} };

eval(src + `
;unitSpecs=[{oda:2,salon:1,ensuite:false,acik:false,adet:3}];
pts=[{x:0,y:0},{x:21,y:0},{x:21,y:15},{x:0,y:15}]; closed=true;
generate();

const insideCount=()=>{ let n=0; for(let i=0;i<plan.inside.length;i++) if(plan.inside[i]) n++; return n; };
const corrCells=()=>plan.regions.filter(g=>g.type==='koridor').reduce((s,g)=>s+g.cells.length,0);
const ghostCount=()=>plan.regions.filter(g=>g.cells.length===0 && g.type!=='koridor' && g.type!=='isiklik'
  && !['merdiven','yangin','asansor','teknik'].includes(g.type)).length;

/* ===== 1) SAĞLIKLI taze üretim: bozuk DEĞİL, onarım NO-OP (yanlış-pozitif olmamalı) ===== */
T('taze üretim: ≥2 daire + koridor var', plan.unitObjs.length>=2 && plan.regions.some(g=>g.type==='koridor'));
T('taze üretim: planLooksBroken()===false', planLooksBroken()===false);
T('taze üretim: repairImportedPlan() NO-OP', repairImportedPlan()===false);
T('taze üretim: planAutoRepaired false kaldı', planAutoRepaired===false);
const healthyUnitArea=plan.unitObjs.reduce((s,u)=>s+u.rooms.reduce((a,g)=>a+g.cells.length,0),0);

/* ===== 2) BOZUKLUĞU ÜRET (bug taklidi): salon/antre/çekirdek DIŞINDAKİ tüm odaların
   hücrelerini koridora dök → çok sayıda hücresiz hayalet oda + şişmiş hol ===== */
const corr=plan.regions.find(g=>g.type==='koridor');
const PROTECT=new Set(['salon','antre','merdiven','yangin','asansor','teknik','koridor','isiklik']);
plan.regions.forEach(g=>{
  if(g===corr || !g.cells.length || PROTECT.has(g.type)) return;
  g.cells.forEach(i=>{ plan.cm[i]=corr.id; corr.cells.push(i); });
  g.cells=[];
});
plan.regions.forEach(g=>calcRegionMetrics(g, plan.cols, plan.minX, plan.minY));

T('hasar: hol kat alanının >%25'+"'"+'i', corrCells()/insideCount()>0.25);
T('hasar: 5+ hücresiz hayalet oda', ghostCount()>=5);
T('hasar: planLooksBroken()===true', planLooksBroken()===true);

/* ===== 3) ONAR ===== */
const fixed=repairImportedPlan();
T('onarım: çalıştı (true döndü)', fixed===true);
T('onarım: planAutoRepaired bayrağı set', planAutoRepaired===true);
T('onarım sonrası: planLooksBroken()===false (idempotent, döngü yok)', planLooksBroken()===false);
T('onarım sonrası: hol makul (<%18)', corrCells()/insideCount()<0.18);
T('onarım sonrası: hayalet oda azaldı (<5)', ghostCount()<5);
T('onarım sonrası: daireler alanını geri kazandı', plan.unitObjs.reduce((s,u)=>s+u.rooms.reduce((a,g)=>a+g.cells.length,0),0) >= healthyUnitArea*0.9);
T('onarım sonrası: her dairede salon var', plan.unitObjs.every(u=>u.rooms.some(g=>g.type==='salon'&&g.cells.length)));
T('onarım sonrası: cut bölünmesi korundu (3 daire)', plan.unitObjs.length===3);

/* ===== 4) bütünlük: hücreler çift sayılmadı, cm tutarlı, tüm iç hücre bir bölgede ===== */
(function(){ let ok=true; const seen=new Set();
  plan.regions.forEach(g=>g.cells.forEach(i=>{ if(seen.has(i)) ok=false; seen.add(i); if(plan.cm[i]!==g.id) ok=false; }));
  let ins=0; for(let i=0;i<plan.inside.length;i++) if(plan.inside[i]) ins++;
  let tot=0; plan.regions.forEach(g=>tot+=g.cells.length);
  T('onarım sonrası: hücre bütünlüğü', ok && tot===ins);
})();
`);

console.log(fail? '✗ '+fail+' hata, '+pass+' başarılı' : '✓ içe-aktarım onarım testleri geçti ('+pass+')');
process.exit(fail?1:0);
