/* villa "katları ayrı planla": kat sekmeleri, merdiven düşey hizası, oturum/çıkma kuralları,
   anlık görüntü gidiş-dönüşü — node tests/villa-kat.js */
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
getEl('binaTipi').value='villa'; getEl('katSayisi').value='2'; getEl('katYuk').value='2.9';
global.document={getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t)};
global.window={addEventListener(){}};
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){}; global.Blob=function(){}; global.URL={createObjectURL:()=>''};
const {extractAppScript}=require('./support/app-js');
const src=extractAppScript();

let pass=0, fail=0;
const T=(name,cond)=>{ if(cond){pass++;} else {fail++; console.log('  [FAIL]', name);} };

eval(src+`
;(function(){
  /* --- zemin kat --- */
  pts=[{x:0,y:0},{x:14,y:0},{x:14,y:11},{x:0,y:11}]; closed=true;
  unitSpecs=[{oda:4,salon:1,ensuite:true,acik:false,adet:1}];
  generate();
  T('zemin: villa planı üretildi', !!plan && plan.villa);
  T('zemin: iç merdiven var', plan.regions.some(g=>g.type==='merdiven'&&g.cells.length));

  /* --- katları ayrı planla AÇ (sekme arayüzü olmadan, durum doğrudan kurulur) --- */
  document.getElementById('katAyri').checked=true;
  villaFloors=new Array(2).fill(null); activeFloor=0;
  T('floorsOn aktif', floorsOn());
  const sb0=stairBoxOf(plan);
  T('zemin: merdiven kutusu okunuyor', !!sb0);

  /* --- 1. kata geç: otomatik üretim + merdiven düşey hizası --- */
  switchFloor(1);
  T('1. kat: aktif kat 1', activeFloor===1);
  T('1. kat: plan üretildi', !!plan);
  T('1. kat: zemin anlık görüntüsü saklandı', !!(villaFloors[0]&&villaFloors[0].plan));
  const sb1=stairBoxOf(plan);
  T('1. kat: iç merdiven var', !!sb1);
  T('1. kat: merdiven düşeyde hizalı', !!sb1 &&
    Math.abs(sb1.x0-sb0.x0)<0.26 && Math.abs(sb1.y0-sb0.y0)<0.26 &&
    Math.abs(sb1.x1-sb0.x1)<0.26 && Math.abs(sb1.y1-sb0.y1)<0.26);
  let out=runChecks();
  T('1. kat: düşey hiza OK notu', out.some(o=>o.s==='ok'&&/düşey hiza/.test(o.t)));
  T('1. kat: giriş kapısı istenmiyor', !out.some(o=>/Giriş kapısı/.test(o.t)));
  T('1. kat: üst katta sokak kapısı çizilmiyor', !computeDoors().some(d=>d.kind==='unit'));

  /* --- üst katın programı ayrı: 3 yatak, salonsuz olabilir (villa modunda oda 0 da serbest) --- */
  unitSpecs=[{oda:3,salon:1,ensuite:true,acik:false,adet:1}];
  generate();
  T('1. kat: farklı program ile yeniden üretildi', !!plan);

  /* --- salonsuz yatak katı: salon=0 stüdyo DEĞİL; salon da mutfak da konmaz, ihlal yazılmaz --- */
  unitSpecs=[{oda:3,salon:0,ensuite:true,acik:false,adet:1}];
  generate();
  T('salonsuz kat: salon bölgesi yok', !plan.regions.some(g=>g.type==='salon'&&g.cells.length));
  T('salonsuz kat: mutfak da yok (yaşam katına ait)', !plan.regions.some(g=>g.type==='mutfak'&&g.cells.length));
  T('salonsuz kat: 3 yatak tam yerleşti (stüdyo eksiltmesi yok)',
    plan.unitObjs[0].rooms.filter(g=>g.type==='yatak'&&g.cells.length).length===3);
  out=runChecks();
  T('salonsuz kat: salon ihlali yazılmıyor', !out.some(o=>o.s==='bad'&&/[Ss]alon/.test(o.t)));
  T('salonsuz kat: evde salon var (zeminde) — ev geneli ihlali yok', !out.some(o=>/Evde hiç salon/.test(o.t)));

  /* --- her kat salonsuz: ev geneli ihlali (bir katta salon olsa yeterdi) --- */
  switchFloor(0);
  unitSpecs=[{oda:4,salon:0,ensuite:true,acik:false,adet:1}];
  generate(); out=runChecks();
  T('her kat salonsuz: ev geneli ihlal bildirildi', out.some(o=>o.s==='bad'&&/Evde hiç salon/.test(o.t)));
  unitSpecs=[{oda:4,salon:1,ensuite:true,acik:false,adet:1}];
  generate(); out=runChecks();
  T('zemine salon dönünce ihlal düştü', !out.some(o=>/Evde hiç salon/.test(o.t)));
  switchFloor(1);
  unitSpecs=[{oda:3,salon:1,ensuite:true,acik:false,adet:1}];
  generate();

  /* --- anahtar AÇIKKEN tek salon sağ tıkla silinebilir (spec salon=0'a düşer, ihlal yok) --- */
  const sal=plan.unitObjs[0].rooms.find(g=>g.type==='salon'&&g.cells.length);
  T('açıkken tek salon silinebilir', !!sal && removeRoom(sal)===true);
  T('silince spec salonsuz kata düştü', plan.unitObjs[0].spec.salon===0);
  out=runChecks();
  T('silince kat bazlı salon ihlali yok', !out.some(o=>o.s==='bad'&&/yerleştirilemedi.*zorunlu piyes/.test(o.t)));
  generate(); // program (salon:1) ile tazele, akış devam etsin

  /* --- oturum oranı kuralı: 9×8 = 72 m² < %70 × 154 m² --- */
  pts=[{x:0,y:0},{x:9,y:0},{x:9,y:8},{x:0,y:8}]; closed=true;
  generate(); out=runChecks();
  T('küçük oturum: oran ihlali bildirildi', out.some(o=>o.s==='bad'&&/oturumu/.test(o.t)));

  /* --- çıkma kuralı: 17×11, doğuya 3 m taşma > 1,5 m sınırı --- */
  pts=[{x:0,y:0},{x:17,y:0},{x:17,y:11},{x:0,y:11}]; closed=true;
  generate(); out=runChecks();
  T('taşan kat: çıkma ihlali bildirildi', out.some(o=>o.s==='bad'&&/taşıyor/.test(o.t)));

  /* --- normale dön, zemine geri geç: zemin aynen korunmuş olmalı --- */
  pts=[{x:0,y:0},{x:14,y:0},{x:14,y:11},{x:0,y:11}]; closed=true;
  generate();
  out=runChecks();
  T('eş oturum: oran/çıkma ihlali yok', !out.some(o=>o.s==='bad'&&(/oturumu|taşıyor/.test(o.t))));
  switchFloor(0);
  T('zemin: geri dönüldü', activeFloor===0 && !!plan);
  T('zemin: alan korundu (154 m²)', Math.abs(shoelace(pts)-154)<0.01);
  T('zemin: program korundu (4 yatak)', unitSpecs[0].oda===4);

  /* --- anlık görüntü gidiş-dönüşü (SVG'ye gömülen biçim) --- */
  const st=stateSnapshot();
  T('snapshot: katlar gömüldü', !!st.katAyri && Array.isArray(st.floors) && st.floors.length===2 && !!st.floors[1]);
  restoreState(st);
  T('restore: katlar geri geldi', floorsOn() && villaFloors.length===2 && activeFloor===0);
  switchFloor(1);
  T('restore sonrası 1. kat açılıyor', activeFloor===1 && !!plan && Math.abs(shoelace(pts)-154)<0.01);
  T('restore sonrası 1. kat programı 3 yatak', unitSpecs[0].oda===3);

  /* --- özelliği kapat: zemine dönülür --- */
  document.getElementById('katAyri').checked=false; floorsOff();
  T('kapatınca zemine dönüldü', activeFloor===0 && villaFloors===null && !!plan && unitSpecs[0].oda===4);

  /* --- özellik KAPALIYKEN eski davranış: salon=0 olsa da salon konur, ev geneli denetimi yok --- */
  unitSpecs=[{oda:3,salon:0,ensuite:true,acik:false,adet:1}];
  generate(); out=runChecks();
  T('kapalıyken salon yine konur (eski davranış)', plan.regions.some(g=>g.type==='salon'&&g.cells.length));
  T('kapalıyken ev geneli denetimi çalışmaz', !out.some(o=>/Evde hiç salon/.test(o.t)));
  const sal2=plan.unitObjs[0].rooms.find(g=>g.type==='salon'&&g.cells.length);
  T('kapalıyken tek salon silinemez (eski koruma)', !!sal2 && removeRoom(sal2)===false);
})();
`);
console.log(pass+' geçti, '+fail+' kaldı');
process.exit(fail?1:0);
