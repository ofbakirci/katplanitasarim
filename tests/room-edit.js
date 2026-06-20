/* oda ekle/sil + geri al testi — node tests/room-edit.js */
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
;unitSpecs=[{oda:2,salon:1,ensuite:true,acik:false,adet:2},{oda:1,salon:1,ensuite:false,acik:true,adet:2}];
pts=[{x:0,y:0},{x:32,y:0},{x:32,y:16},{x:0,y:16}]; closed=true;
generate();

const integrity=()=>{ let ins=0; plan.inside.forEach(v=>ins+=v);
  const tot=plan.regions.reduce((s,g)=>s+g.cells.length,0);
  /* cm tutarlılığı */
  let cmOk=true;
  plan.regions.forEach(g=>g.cells.forEach(i=>{ if(plan.cm[i]!==g.id) cmOk=false; }));
  return tot===ins && cmOk; };
const snapshot=u=>u.rooms.filter(g=>g.cells.length).map(g=>g.name+':'+g.cells.length).join('|');

T('üretim bütünlüğü', integrity());
const u0=plan.unitObjs[0];
const before=snapshot(u0), specBefore=u0.spec, histLen=editHistory.length;

/* --- 1. yatak odası sil --- */
const bed=u0.rooms.find(g=>g.type==='yatak'&&g.cells.length);
T('yatak odası bulundu', !!bed);
const bedCells=bed.cells.length, nRoomsBefore=u0.rooms.length;
T('removeRoom çalıştı', removeRoom(bed));
T('sil: bütünlük', integrity());
T('sil: oda listeden düştü', !u0.rooms.includes(bed) && bed.cells.length===0);
T('sil: spec.oda azaldı', u0.spec.oda===specBefore.oda-1);
T('sil: spec kopyalandı (komşu daire etkilenmedi)',
  plan.unitObjs.filter(u=>u!==u0).every(u=>u.spec.oda!==specBefore.oda-1||u.spec!==u0.spec));
T('sil: geçmişe yazıldı', editHistory.length===histLen+1);

/* --- 2. geri al --- */
T('undoEdit true', undoEdit());
T('geri al: bütünlük', integrity());
T('geri al: oda dirildi', u0.rooms.includes(bed)&&bed.cells.length===bedCells);
T('geri al: snapshot birebir', snapshot(u0)===before);
T('geri al: spec eski referans', u0.spec===specBefore);

/* --- 3. salona banyo oy --- */
const salon=u0.rooms.find(g=>g.type==='salon'&&g.cells.length);
const salonCells=salon.cells.length, nReg=plan.regions.length;
T('addRoom banyo çalıştı', addRoom(salon, ROOM_ADD.find(d=>d.type==='banyo'&&!d.eb)));
T('ekle: bütünlük', integrity());
const nb=plan.regions[nReg];
T('ekle: yeni bölge', nb && nb.type==='banyo' && nb.cells.length>=4);
T('ekle: dairede kayıtlı', u0.rooms.includes(nb));
T('ekle: ev sahibi küçüldü', salon.cells.length===salonCells-nb.cells.length);
T('ekle: ev sahibi bağlantılı', regConnected(salon));
T('ekle: duvar tutamacı doğdu',
  plan.wallRuns.some(rn=>rn.a===nb.id||rn.b===nb.id));

/* --- 4. ekleneni geri al --- */
T('undo add true', undoEdit());
T('undo add: bütünlük', integrity());
T('undo add: salon eski boyut', salon.cells.length===salonCells);
T('undo add: oda listeden düştü', !u0.rooms.includes(nb)&&nb.cells.length===0);

/* --- 5. korumalar --- */
T('antre silinemez', !removeRoom(u0.antre));
const onlySalon=u0.rooms.find(g=>g.type==='salon'&&g.cells.length);
T('tek salon silinemez', !removeRoom(onlySalon));

/* --- 6. yatak odası ekle + spec --- */
const salon2=u0.rooms.find(g=>g.type==='salon'&&g.cells.length);
const odaBefore=u0.spec.oda;
if(addRoom(salon2, ROOM_ADD.find(d=>d.type==='yatak'))){
  T('yatak ekle: spec.oda arttı', u0.spec.oda===odaBefore+1);
  T('yatak ekle: bütünlük', integrity());
  undoEdit();
  T('yatak ekle geri al: spec.oda eski', u0.spec.oda===odaBefore);
} else console.log('  [INFO] yatak eklenemedi (salon küçük) — atlandı');

/* --- 7. generate() oda girdilerini temizler --- */
addRoom(salon2, ROOM_ADD.find(d=>d.type==='wc'));
generate();
T('generate: oda girdileri temizlendi', !editHistory.some(e=>e.type==='room'));
T('generate sonrası bütünlük', integrity());

/* --- 7b. EB. BANYO ekle (yalnız yatak odasından) --- */
byId['binaTipi'].value='apartman'; byId['katSayisi'].value='5';
unitSpecs=[{oda:2,salon:1,ensuite:false,acik:false,adet:2},{oda:1,salon:1,ensuite:false,acik:true,adet:2}];
pts=[{x:0,y:0},{x:32,y:0},{x:32,y:16},{x:0,y:16}]; closed=true;
generate();
const eb=ROOM_ADD.find(d=>d.eb);
const u2=plan.unitObjs[0];
const salonX=u2.rooms.find(g=>g.type==='salon'&&g.cells.length);
T('eb banyo salondan oyulamaz', !addRoom(salonX, eb));
const bedX=u2.rooms.find(g=>g.type==='yatak'&&g.cells.length);
const bedName=bedX.name;
if(addRoom(bedX, eb)){
  T('eb banyo: bütünlük', integrity());
  T('eb banyo: ev sahibi EB. YATAK oldu', bedX.name==='EB. YATAK ODASI');
  T('eb banyo: spec.ensuite', u2.spec.ensuite===true);
  T('eb banyo geri al', undoEdit() && bedX.name===bedName && u2.spec.ensuite===false && integrity());
} else console.log('  [INFO] eb banyo eklenemedi (oda küçük) — atlandı');

/* --- 7c. tek daire/kat: bant koridor yok, ORTAK DEPO yok --- */
byId['katSayisi'].value='5';
unitSpecs=[{oda:6,salon:2,ensuite:true,acik:false,adet:1}];
pts=[{x:0,y:0},{x:34.5,y:0},{x:34.5,y:18},{x:0,y:18}]; closed=true; // ~621 m²
generate();
T('tek daire: bütünlük', integrity());
T('tek daire: 1 daire', plan.unitObjs.length===1);
const depo=plan.regions.filter(g=>g.name==='ORTAK DEPO'&&g.cells.length);
T('tek daire: ORTAK DEPO yok', depo.length===0);
const uS=plan.unitObjs[0];
const uArea=uS.rooms.reduce((s,g)=>s+g.cells.length,0)*0.25;
T('tek daire: daire taban alanının >%80\\'i ('+uArea+' m²)', uArea>621*0.8);
T('tek daire: merdiven var', plan.regions.some(g=>g.type==='merdiven'&&g.cells.length));
T('tek daire: asansör var', plan.regions.some(g=>g.type==='asansor'&&g.cells.length));
T('tek daire: lobi var', plan.regions.some(g=>g.type==='koridor'&&g.cells.length));
T('tek daire: antre lobiye komşu', (()=>{ if(!uS.antre) return false;
  const kor=plan.regions.find(g=>g.type==='koridor');
  return uS.antre.cells.some(i=>{ const r=(i/plan.cols)|0,c=i%plan.cols;
    return [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].some(([rr,cc])=>{
      if(rr<0||cc<0||rr>=plan.rows||cc>=plan.cols) return false;
      return plan.cm[rr*plan.cols+cc]===kor.id; }); }); })());
T('tek daire: kaçış merdiveni kayıtlı', plan.stairs.length>=1);

/* --- 7d. tek daire/kat 12 katlı: 2 asansör + yangın --- */
byId['katSayisi'].value='12';
generate();
T('tek daire 12 kat: bütünlük', integrity());
T('tek daire 12 kat: 2 asansör', plan.regions.filter(g=>g.type==='asansor'&&g.cells.length).length===2);
T('tek daire 12 kat: yangın merd.', plan.regions.some(g=>g.type==='yangin'&&g.cells.length));
T('tek daire 12 kat: ORTAK DEPO yok', !plan.regions.some(g=>g.name==='ORTAK DEPO'&&g.cells.length));

/* --- 7e. çok daire hâlâ bant düzeninde --- */
byId['katSayisi'].value='5';
unitSpecs=[{oda:2,salon:1,ensuite:false,acik:false,adet:4}];
generate();
T('4 daire: bant koridor', plan.corridorR0>=0);
T('4 daire: bütünlük', integrity());

/* --- 8. villa --- */
byId['binaTipi'].value='villa'; byId['katSayisi'].value='2';
unitSpecs=[{oda:4,salon:1,ensuite:true,acik:false,adet:1}];
pts=[{x:0,y:0},{x:12,y:0},{x:12,y:10},{x:0,y:10}]; closed=true;
generate();
const v=plan.unitObjs[0];
const vBed=v.rooms.find(g=>g.type==='yatak'&&g.cells.length);
T('villa: yatak sil', removeRoom(vBed));
T('villa: bütünlük', integrity());
T('villa: merdiven silinemez', !removeRoom(v.rooms.find(g=>g.type==='merdiven')||{id:-1,type:'merdiven',cells:[]}));
undoEdit();
T('villa geri al: bütünlük', integrity());
`);
console.log(fail? '✗ '+fail+' hata, '+pass+' başarılı' : '✓ tüm testler geçti ('+pass+')');
process.exit(fail?1:0);
