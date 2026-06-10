/* oda tipi değiştir / takas / böl / antreyi uzat testi — node tests/etiket.js */
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

const fs=require('fs');
const html=fs.readFileSync(__dirname+'/../kat-plani-tasarim.html','utf-8');
const src=html.slice(html.indexOf('<script>')+8, html.lastIndexOf('</script>'));

let pass=0, fail=0;
const T=(name,cond)=>{ if(cond){pass++;} else {fail++; console.log('  [FAIL]', name);} };

eval(src + `
;unitSpecs=[{oda:2,salon:1,ensuite:true,acik:false,adet:2},{oda:1,salon:1,ensuite:false,acik:true,adet:2}];
pts=[{x:0,y:0},{x:32,y:0},{x:32,y:16},{x:0,y:16}]; closed=true;
generate();

const integrity=()=>{ let ins=0; plan.inside.forEach(v=>ins+=v);
  const tot=plan.regions.reduce((s,g)=>s+g.cells.length,0);
  let cmOk=true;
  plan.regions.forEach(g=>g.cells.forEach(i=>{ if(plan.cm[i]!==g.id) cmOk=false; }));
  return tot===ins && cmOk; };
const u0=plan.unitObjs[0];

/* --- 1. tip değiştir: yatak → çalışma odası --- */
const bed=u0.rooms.find(g=>g.type==='yatak'&&g.name==='YATAK ODASI'&&g.cells.length);
T('yatak odası var', !!bed);
const spec0=u0.spec, oda0=u0.spec.oda, h0=editHistory.length;
T('retype çalıştı', retypeRoom(bed, RETYPE.find(d=>d.type==='oda')));
T('retype: ad/tip', bed.name==='ÇALIŞMA ODASI'&&bed.type==='oda');
T('retype: spec.oda azaldı', u0.spec.oda===oda0-1);
T('retype: bütünlük', integrity());
T('retype: geçmişe yazıldı', editHistory.length===h0+1);
T('retype geri al', undoEdit());
T('retype undo: ad/tip/spec', bed.name==='YATAK ODASI'&&bed.type==='yatak'&&u0.spec===spec0);

/* --- 2. korumalar --- */
const tekSalon=u0.rooms.find(g=>g.type==='salon'&&g.cells.length);
T('tek salon tipsizleşemez', !retypeRoom(tekSalon, RETYPE.find(d=>d.type==='yatak')));
T('antre tipi değiştirilemez', !retypeRoom(u0.antre, RETYPE.find(d=>d.type==='yatak')));
const ebY=u0.rooms.find(g=>g.name==='EB. YATAK ODASI'&&g.cells.length);
if(ebY&&u0.rooms.some(o=>o.name==='EB. BANYO'&&o.cells.length))
  T('EB. YATAK (banyolu) değiştirilemez', !retypeRoom(ebY, RETYPE.find(d=>d.type==='oda')));

/* --- 3. takas --- */
const mut=u0.rooms.find(g=>g.type==='mutfak'&&g.cells.length);
const bed2=u0.rooms.find(g=>g.type==='yatak'&&g.name==='YATAK ODASI'&&g.cells.length);
if(mut&&bed2){
  const mc=mut.cells.length, bc=bed2.cells.length, h1=editHistory.length;
  T('takas çalıştı', swapRooms(mut,bed2));
  T('takas: adlar yer değişti', mut.name==='YATAK ODASI'&&bed2.name==='MUTFAK');
  T('takas: tipler yer değişti', mut.type==='yatak'&&bed2.type==='mutfak');
  T('takas: hücreler yerinde', mut.cells.length===mc&&bed2.cells.length===bc);
  T('takas: bütünlük', integrity());
  T('takas geri al', undoEdit()&&mut.name==='MUTFAK'&&bed2.name==='YATAK ODASI'&&editHistory.length===h1);
}

/* --- 4. oda bölme --- */
const salon=u0.rooms.find(g=>g.type==='salon'&&g.cells.length);
const sc0=salon.cells.length, nReg=plan.regions.length, nRooms=u0.rooms.length;
T('split çalıştı', splitRoom(salon, false)||splitRoom(salon, true));
const nb=plan.regions[nReg];
T('split: yeni ODA doğdu', nb&&nb.type==='oda'&&nb.name==='ODA'&&nb.cells.length>=4);
T('split: hücre korunumu', salon.cells.length+nb.cells.length===sc0);
T('split: iki parça da bağlantılı', regConnected(salon)&&regConnected(nb));
T('split: dairede kayıtlı', u0.rooms.includes(nb)&&u0.rooms.length===nRooms+1);
T('split: bütünlük', integrity());
T('split: duvar tutamacı doğdu', plan.wallRuns.some(rn=>rn.a===nb.id||rn.b===nb.id));
/* bölünen parça tipi değiştirilebilir (5. maddenin etiket çözümü) */
T('split sonrası retype', retypeRoom(nb, RETYPE.find(d=>d.type==='yatak')));
T('split sonrası retype: spec', u0.spec.oda===oda0+1);
undoEdit(); // retype geri
T('split geri al', undoEdit());
T('split undo: salon eski boyut', salon.cells.length===sc0&&!u0.rooms.includes(nb));
T('split undo: bütünlük', integrity());

/* --- 5. küçük oda bölünemez --- */
const wc=u0.rooms.find(g=>(g.type==='wc'||g.type==='banyo')&&g.cells.length&&g.cells.length<16);
if(wc) T('küçük oda bölünemez', !splitRoom(wc,false)&&!splitRoom(wc,true));

/* --- 6. antreyi uzat: komşu odaya 'already' --- */
const adjRoom=u0.rooms.find(g=>g!==u0.antre&&g.cells.length&&g.cells.some(i=>{
  const r=(i/plan.cols)|0,c=i%plan.cols,aid=u0.antre.id;
  return (r>0&&plan.cm[i-plan.cols]===aid)||(r<plan.rows-1&&plan.cm[i+plan.cols]===aid)
       ||(c>0&&plan.cm[i-1]===aid)||(c<plan.cols-1&&plan.cm[i+1]===aid); }));
if(adjRoom) T('komşuya uzatma gereksiz (already)', extendAntreTo(adjRoom)==='already');

/* --- 7. antreyi uzat: bölmeyle koparılan odaya köprü --- */
const salon2=u0.rooms.find(g=>g.type==='salon'&&g.cells.length);
if(splitRoom(salon2,false)||splitRoom(salon2,true)){
  const oda=plan.regions[plan.regions.length-1];
  const aid=u0.antre.id;
  const isAdj=g=>g.cells.some(i=>{ const r=(i/plan.cols)|0,c=i%plan.cols;
    return (r>0&&plan.cm[i-plan.cols]===aid)||(r<plan.rows-1&&plan.cm[i+plan.cols]===aid)
         ||(c>0&&plan.cm[i-1]===aid)||(c<plan.cols-1&&plan.cm[i+1]===aid); });
  if(!isAdj(oda)){
    const r=extendAntreTo(oda);
    T('uzatma çalıştı', r===true);
    if(r===true){
      T('uzatma: oda artık komşu', isAdj(oda));
      T('uzatma: bütünlük', integrity());
      T('uzatma: antre bağlantılı', regConnected(u0.antre));
      T('uzatma geri al', undoEdit()&&integrity());
    }
  }
  undoEdit(); // bölmeyi geri al
}
T('son bütünlük', integrity());
`);
console.log(fail? `✗ ${fail} test düştü (${pass} geçti)` : `✓ tüm testler geçti (${pass})`);
process.exit(fail?1:0);
