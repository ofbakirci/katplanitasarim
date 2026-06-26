/* oda ekleme hint (sağ tık konumu) + EB. BANYO menü/koruma testleri — node tests/oda-hint.js */
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
const byId={}; const getEl=id=>byId[id]||(byId[id]=stubEl('div'));
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='5'; getEl('katYuk').value='2.9';
global.document={getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t)};
global.window={addEventListener(){}};
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){}; global.Blob=function(){}; global.URL={createObjectURL:()=>''};
const {extractAppScript}=require('./support/app-js');
const src=extractAppScript();
eval(src + `
;unitSpecs=[{oda:2,salon:1,ensuite:false,acik:false,adet:2}];
pts=[{x:0,y:0},{x:32,y:0},{x:32,y:16},{x:0,y:16}]; closed=true;
generate();
const u=plan.unitObjs[0];
const salon=u.rooms.find(g=>g.type==='salon'&&g.cells.length);
const bbox=g=>{let r0=1e9,r1=-1,c0=1e9,c1=-1; g.cells.forEach(i=>{const r=(i/plan.cols)|0,c=i%plan.cols;
  r0=Math.min(r0,r);r1=Math.max(r1,r);c0=Math.min(c0,c);c1=Math.max(c1,c);}); return {r0,r1,c0,c1};};
const sb=bbox(salon);
let P=0,F=0; const T=(n,c)=>{ if(c){P++;} else {F++; console.log('[FAIL]',n);} };
/* 1) köşe tohumda pencere sliver'a düşmemeli (eski kod burada false dönüyordu) */
const okB=addRoom(salon,{name:'WC',type:'wc',h:2,w:3}, sb.r1*plan.cols+sb.c1);
const wcB=u.rooms.find(g=>g.name==='WC'&&g.cells.length);
T('köşe hint ekleme (sliver yok)', okB&&!!wcB&&wcB.cells.length>=4);
undoEdit();
/* 2) yön denetimi: EB. BANYO'da tohum havuzu TÜM oda hücreleri (antre şartı yok) —
   sağ hint sağ köşeye, sol hint sol köşeye oymalı */
const bedD=u.rooms.find(g=>g.type==='yatak'&&g.cells.length);
const db=bbox(bedD);
T('eb sağ hint', addRoom(bedD,{name:'EB. BANYO',type:'banyo',h:4,w:4,eb:true}, db.r0*plan.cols+db.c1)===true);
let eb=u.rooms.find(g=>g.name==='EB. BANYO'&&g.cells.length);
const ebR=bbox(eb); undoEdit();
T('eb sol hint', addRoom(bedD,{name:'EB. BANYO',type:'banyo',h:4,w:4,eb:true}, db.r0*plan.cols+db.c0)===true);
eb=u.rooms.find(g=>g.name==='EB. BANYO'&&g.cells.length);
const ebL=bbox(eb); undoEdit();
T('sağ hint sağa, sol hint sola dayar', ebL.c0<ebR.c0 && ebR.c1>ebL.c1);
T('sağ hint sağ kenara oturur', ebR.c1===db.c1);
T('sol hint sol kenara oturur', ebL.c0===db.c0);
/* 3) hintsiz eski yol */
T('hintsiz addRoom', addRoom(salon,{name:'WC',type:'wc',h:2,w:3})===true);
undoEdit();
/* 4) EB. BANYO: id-bazlı bağ (ebHost) + AYNI odada çift koruması + FARKLI odaya çoklu ensuite + geri al (Bug B) */
const bed=u.rooms.find(g=>g.type==='yatak'&&g.cells.length);
T('EB. BANYO eklendi (hint ile)', addRoom(bed,{name:'EB. BANYO',type:'banyo',h:4,w:4,eb:true}, bed.cells[bed.cells.length-1])===true);
T('host EB. YATAK oldu', bed.name==='EB. YATAK ODASI');
T('spec.ensuite=true', u.spec.ensuite===true);
const eb1=u.rooms.find(g=>g.name==='EB. BANYO'&&g.cells.length);
T('eb1 ebHost = host id', !!eb1 && eb1.ebHost===bed.id);
/* AYNI yatak odasından 2. EB. BANYO engellenir (false döner, geçmişe yazmaz) */
T('aynı odada 2. EB engellendi', addRoom(bed,{name:'EB. BANYO',type:'banyo',h:4,w:4,eb:true}, bed.cells[0])===false);
/* FARKLI yatak odasına EB. BANYO serbest → çoklu ensuite (eski global limit kalktı) */
const bed2=u.rooms.find(g=>g.type==='yatak'&&g.cells.length&&g!==bed&&g.name!=='EB. YATAK ODASI');
T('ikinci yatak odası bulundu', !!bed2);
let added2=false;
if(bed2){
  /* bed2 L-biçimli olabilir; iç bir 2×2 köşesini hint seç ki oyma geometrik olarak garanti olsun */
  const set2=new Set(bed2.cells); let hint2=bed2.cells[0];
  for(const i of bed2.cells){ const c=i%plan.cols;
    if(c+1<plan.cols && set2.has(i+1)&&set2.has(i+plan.cols)&&set2.has(i+plan.cols+1)){ hint2=i; break; } }
  added2 = addRoom(bed2,{name:'EB. BANYO',type:'banyo',h:4,w:4,eb:true}, hint2)===true;
  T('farklı odaya 2. EB serbest (çoklu ensuite)', added2);
  if(added2){
    const ebs=u.rooms.filter(g=>g.name==='EB. BANYO'&&g.cells.length);
    T('iki EB. BANYO bir arada', ebs.length===2);
    T('eb2 ebHost = bed2 id', !!u.rooms.find(g=>g.name==='EB. BANYO'&&g.cells.length&&g.ebHost===bed2.id));
    undoEdit(); // 2. EB geri al
    T('2. EB geri alındı, ensuite sürüyor', u.spec.ensuite===true && u.rooms.filter(g=>g.name==='EB. BANYO'&&g.cells.length).length===1);
  }
}
undoEdit(); // 1. EB geri al
T('geri al: ensuite gitti', u.spec.ensuite===false && !u.rooms.some(g=>g.name==='EB. BANYO'&&g.cells.length));
/* bütünlük */
let ins=0; plan.inside.forEach(v=>ins+=v);
const tot=plan.regions.reduce((s,g)=>s+g.cells.length,0);
let cmOk=true; plan.regions.forEach(g=>g.cells.forEach(i=>{ if(plan.cm[i]!==g.id) cmOk=false; }));
T('hücre bütünlüğü', tot===ins && cmOk);
console.log(F? F+' HATA' : '✓ hint testleri geçti ('+P+')');
process.exitCode = F?1:0;
`);
