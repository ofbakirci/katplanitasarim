/* salonu açık mutfağa dönüştür (context menü) + geri al testi — node tests/acik-mutfak.js */
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
const snapshot=u=>u.rooms.filter(g=>g.cells.length).map(g=>g.name+':'+g.cells.length).join('|');

/* ayrı mutfaklı daire bul */
const k=plan.unitObjs.findIndex(u=>u.rooms.some(g=>g.type==='mutfak'&&g.cells.length)
  && u.rooms.some(g=>g.type==='salon'&&g.cells.length));
T('ayrı mutfaklı daire var', k>=0);
const u=plan.unitObjs[k];
const salon=u.rooms.find(g=>g.type==='salon'&&g.cells.length);
const mut=u.rooms.find(g=>g.type==='mutfak'&&g.cells.length);
const before=snapshot(u), salonName=salon.name, salonCells=salon.cells.length,
      mutCells=mut.cells.length, specBefore=u.spec, histLen=editHistory.length;

/* --- 1. dönüştür --- */
const r=openKitchen(salon);
T('openKitchen true', r===true);
T('bütünlük', integrity());
T('mutfak listeden düştü', !u.rooms.includes(mut) && mut.cells.length===0);
T('hücreler salona geçti', salon.cells.length===salonCells+mutCells);
T('salon adı SALON + MUTFAK', salon.name==='SALON + MUTFAK');
T('spec.acik=true (kopya)', u.spec.acik===true && u.spec!==specBefore);
T('geçmişe yazıldı', editHistory.length===histLen+1);

/* --- 2. yeniden çağrı: mutfak yok --- */
T('ikinci çağrı nomut', openKitchen(salon)==='nomut');

/* --- 3. geri al --- */
T('undoEdit true', undoEdit());
T('geri al: bütünlük', integrity());
T('geri al: mutfak dirildi', u.rooms.includes(mut)&&mut.cells.length===mutCells);
T('geri al: salon adı döndü', salon.name===salonName);
T('geri al: spec döndü', u.spec===specBefore);
T('geri al: snapshot birebir', snapshot(u)===before);

/* --- 4. korumalar --- */
T('mutfak odasıyla çağrılamaz', openKitchen(mut)===false);
const ant=u.antre; if(ant) T('antreyle çağrılamaz', openKitchen(ant)===false);

console.log(pass+' geçti, '+fail+' kaldı');
process.exit(fail?1:0);
`);
