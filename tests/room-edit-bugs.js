/* Oda düzenleme bug düzeltmeleri (2026-06-26):
   A) Oda yatak odasına çevrilince "N yatak odasından M yerleştirildi" uyarısı kaybolur.
   B) EB. YATAK ODASI tipe-çevir + ekle; bir yatak odasına bağlı EB. BANYO id ile korunur.
   C) ORTAK DEPO / atıl ortak alan düzenlenebilir: apartman holüne katılınca çekirdek erişimi açılır.
   Çalıştır: node tests/room-edit-bugs.js */
const fs=require('fs');
const path=require('path');
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
global.alert=()=>{};
const {extractAppScript}=require('./support/app-js');
const src=extractAppScript();

const svgPath=path.join(__dirname,'..','input','ortakdeporpoblemi.svg');
global.__SVG=fs.existsSync(svgPath)?fs.readFileSync(svgPath,'utf8'):null;

let P=0,F=0; global.__T=(n,c)=>{ if(c){P++;} else {F++; console.log('[FAIL]',n);} };

eval(src + `
const T=global.__T;
const badHas=re=>collectChecks().some(o=>o.s==='bad'&&re.test(o.t));

/* ===== C) ORTAK DEPO — gerçek kullanıcı planı (SVG) ===== */
if(global.__SVG){
  const m=global.__SVG.match(/<metadata[^>]*id="kpState"[^>]*>([\\s\\S]*?)<\\/metadata>/);
  if(m){
    const json=m[1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
    restoreState(JSON.parse(json));
    const depo=plan.regions.find(g=>g.name==='ORTAK DEPO'&&g.cells.length);
    T('C: ORTAK DEPO bölgesi var', !!depo);
    T('C: ORTAK DEPO ortak-atıl alan sayılır', !!depo&&isCommonOrphan(depo));
    T('C: çekirdek/koridor ortak-atıl SAYILMAZ',
      !isCommonOrphan(plan.regions.find(g=>g.type==='koridor'&&g.cells.length)) &&
      !plan.regions.filter(g=>isStructReg(g)).some(isCommonOrphan));
    T('C: başlangıçta hol çekirdeğe komşu DEĞİL (uyarı var)', badHas(/Apartman holü.*komşu değil/));
    const kor=plan.regions.find(g=>g.type==='koridor'&&g.cells.length);
    const korN0=kor.cells.length, depoN=depo.cells.length;
    const ok=commonAreaToCorridor(depo);
    plan.regions.forEach(g=>calcRegionMetrics(g,plan.cols,plan.minX,plan.minY));
    plan.wallRuns=computeWallRuns();
    T('C: holе katma başarılı', ok===true);
    T('C: hücreler holе geçti', kor.cells.length===korN0+depoN && depo.cells.length===0);
    T('C: artık hol çekirdeğe ulaşıyor (uyarı gitti)', !badHas(/Apartman holü.*komşu değil/));
  } else T('C: SVG kpState bulundu', false);
} else console.log('  (input/ortakdeporpoblemi.svg yok — C atlandı)');

/* dağıtarak sil: hücreler korunur, bölge boşalır — C'nin planına yaslanır;
   C atlandıysa (input/ yok, ör. CI) plan null → bu blok da atlanır (çökme değil) */
{
  const kor=(typeof plan!=='undefined'&&plan)?plan.regions.find(g=>g.type==='koridor'&&g.cells.length):null;
  if(!kor) console.log('  (plan yok — C dağıt-sil atlandı)');
  if(kor && kor.cells.length>6){
    const depo=newRegRuntime('ORTAK DEPO','teknik');
    const moved=kor.cells.slice(0,4);
    moved.forEach(i=>{ kor.cells=kor.cells.filter(x=>x!==i); plan.cm[i]=depo.id; depo.cells.push(i); });
    let insBefore=0; plan.inside.forEach(v=>insBefore+=v);
    const before=plan.regions.reduce((s,g)=>s+g.cells.length,0);
    T('C: dağıt-sil ORTAK DEPO algılandı', isCommonOrphan(depo));
    dissolveCommonArea(depo);
    const after=plan.regions.reduce((s,g)=>s+g.cells.length,0);
    T('C: dağıt-sil sonrası bölge boş', depo.cells.length===0);
    T('C: dağıt-sil hücre kaybı yok', after===before);
  }
}

/* ===== A) yatak odası açığı, oda çevrilince kapanır ===== */
unitSpecs=[{oda:2,salon:1,ensuite:false,acik:false,adet:1}];
pts=[{x:0,y:0},{x:14,y:0},{x:14,y:11},{x:0,y:11}]; closed=true; generate();
{
  const u=plan.unitObjs[0];
  const beds0=u.rooms.filter(g=>g.type==='yatak'&&g.cells.length).length;
  u.spec={...u.spec, oda:beds0+1};                  // ÜRETİCİ AÇIĞI taklidi (istenen > yerleşen)
  runChecks();
  T('A: başlangıçta yatak odası açığı uyarısı var', badHas(/yatak odasından .* yerleştiril/));
  const odaSpec0=u.spec.oda;
  const salon=u.rooms.find(g=>g.type==='salon'&&g.cells.length);
  T('A: bölünebilir salon var', !!salon && splitRoom(salon,false)===true);
  const oda=u.rooms.find(g=>g.type==='oda'&&g.name==='ODA'&&g.cells.length);
  T('A: bölünce nötr ODA doğdu', !!oda);
  T('A: ODA → YATAK ODASI çevrildi', retypeRoom(oda,{name:'YATAK ODASI',type:'yatak'})===true);
  const beds1=u.rooms.filter(g=>g.type==='yatak'&&g.cells.length).length;
  T('A: yatak odası sayısı 1 arttı', beds1===beds0+1);
  T('A: program talebi BÜYÜMEDİ (açık kapandı)', u.spec.oda===odaSpec0);
  T('A: yatak odası açığı uyarısı KAYBOLDU', !badHas(/yatak odasından .* yerleştiril/));
}

/* ===== B) EB. YATAK ODASI tipe-çevir / ekle + EB. BANYO id bağı ===== */
{
  T('B: RETYPE listesinde EB. YATAK ODASI var', RETYPE.some(d=>d.name==='EB. YATAK ODASI'));
  T('B: ROOM_ADD listesinde EB. YATAK ODASI var', ROOM_ADD.some(d=>d.name==='EB. YATAK ODASI'));
  const u=plan.unitObjs[0];
  const bed=u.rooms.find(g=>g.type==='yatak'&&g.cells.length&&g.name==='YATAK ODASI');
  const odaSpecB=u.spec.oda;
  T('B: yatak odası EB. YATAK ODASI yapıldı', !!bed && retypeRoom(bed,{name:'EB. YATAK ODASI',type:'yatak'})===true && bed.name==='EB. YATAK ODASI' && bed.type==='yatak');
  T('B: yatak→yatak yeniden adlandırma oda sayısını DEĞİŞTİRMEDİ', u.spec.oda===odaSpecB); // regresyon: net-0 olmalı
  // EB. BANYO oy → ebHost bağlanır
  const set=new Set(bed.cells); let hint=bed.cells[0];
  for(const i of bed.cells){ const c=i%plan.cols; if(c+1<plan.cols&&set.has(i+1)&&set.has(i+plan.cols)&&set.has(i+plan.cols+1)){ hint=i; break; } }
  T('B: EB. BANYO oyuldu', addRoom(bed,{name:'EB. BANYO',type:'banyo',h:4,w:4,eb:true},hint)===true);
  const eb=u.rooms.find(g=>g.name==='EB. BANYO'&&g.cells.length);
  T('B: EB. BANYO ebHost = host id', !!eb && eb.ebHost===bed.id);
  T('B: EB. BANYO'+"'lu oda tipsizleşemez (koruma)", retypeRoom(bed,{name:'YATAK ODASI',type:'yatak'})===false);
}

console.log(F? ('\\n'+F+' HATA') : ('\\n✓ oda-düzenleme bug testleri geçti ('+P+')'));
process.exitCode=F?1:0;
`);
