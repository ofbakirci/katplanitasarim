/* BUG doğrulama: çok katlı villada (a) iç merdiven MUTLAKA yerleşir, (b) giriş kapısı
   antrenin hangi cepheye düştüğünden bağımsız yerleşir, (c) runChecks gerçek merdiven
   denetimi yapar. L/T (layoutVillaSofa bail eden) + dikdörtgen (regresyon) villalar.
   node tests/villa-stair-entrance.js */
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
global.document={getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t),
  querySelectorAll:()=>[], querySelector:()=>null, addEventListener(){}, body:stubEl('body')};
global.window={addEventListener(){}};
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){}; global.Blob=function(){}; global.URL={createObjectURL:()=>''};
const {extractAppScript}=require('./support/app-js');
const src=extractAppScript();

let pass=0, fail=0;
const T=(name,cond)=>{ if(cond){pass++; console.log('  [ok]  '+name);} else {fail++; console.log('  [FAIL] '+name);} };

eval(src+`
;global.RUNV=(poly, spec)=>{
  pts=poly.map(p=>({x:p[0],y:p[1]})); closed=true;
  unitSpecs=[spec];
  customCutsZ=null; unitLayout={}; balconies=[];
  doorOverrides={}; extraDoors=[]; doorHidden={}; editHistory=[];
  generate();
  const stair=plan.regions.find(g=>g.type==='merdiven'&&g.cells.length);
  const doors=computeDoors();
  const entry=doors.find(d=>d.kind==='unit'&&d.e);
  const checks=runChecks();
  const note=checks.find(x=>/iç merdiven/.test(x.t||''));
  const u=plan.unitObjs[0];
  const beds=u.rooms.filter(g=>g.type==='yatak'&&g.cells.length).length;
  const bads=checks.filter(x=>x.s==='bad').map(x=>x.t);
  return {
    hasStair: !!stair,
    stairArea: stair? (stair.cells.length*0.25) : 0,
    hasEntry: !!entry,
    entryEdge: entry? (entry.e.h? 'yatay' : 'dikey') : null,
    noteStatus: note? note.s : null,
    noteText: note? note.t : null,
    villa: !!plan.villa,
    beds, bads
  };
};
;global.BUG3_WEST=()=>{
  const cols=4, rows=6, inside=new Array(rows*cols).fill(1);
  const cm=new Array(rows*cols).fill(1);                 // varsayılan: SALON (id 1)
  for(let r=1;r<rows-1;r++) cm[r*cols+0]=0;             // sol sütun ortası = ANTRE (id 0): YALNIZ batı dış cepheye değer (kuzey/güney salona komşu)
  const antre={id:0,name:'ANTRE',type:'antre',cells:[]}, salon={id:1,name:'SALON',type:'salon',cells:[]};
  for(let i=0;i<rows*cols;i++)(cm[i]===0?antre:salon).cells.push(i);
  plan={villa:true, rows, cols, inside, cm, minX:0, minY:0,
        regions:[antre,salon], unitObjs:[{antre, rooms:[antre,salon], spec:{}}]};
  doorOverrides={}; doorHidden={}; extraDoors=[];
  const d=computeDoors().find(x=>x.kind==='unit');
  return d && d.e ? (d.e.h? 'yatay':'dikey') : null;
};`);

/* L-villa: antre büyük olasılıkla güney DIŞI bir cepheye düşer; doluluk 157/192=0.82<0.85 → bail */
const L=[[0,0],[16,0],[16,7],[9,7],[9,12],[0,12]];
/* T-villa: doluluk 100/180=0.56<0.85 → bail */
const Tp=[[0,0],[15,0],[15,4],[10,4],[10,12],[5,12],[5,4],[0,4]];
/* dikdörtgen villa: layoutVillaSofa başarılı (regresyon — merdiven first-class olmalı) */
const R=[[0,0],[14,0],[14,11],[0,11]];

console.log('\n=== case_villa_L_5p1 (2 kat, 5+1 ensuite, L taban) ===');
{ const r=global.RUNV(L,{oda:5,salon:1,ensuite:true,acik:false,adet:1});
  console.log('   merdiven alanı='+r.stairArea.toFixed(1)+'m²  giriş kenarı='+r.entryEdge+'  yatak='+r.beds+'  not='+r.noteStatus);
  console.log('   not: '+r.noteText);
  T('L: villa planı üretildi', r.villa);
  T('L: iç merdiven YERLEŞTİ (BUG1)', r.hasStair);
  T('L: merdiven makul boyutta (≥6m²)', r.stairArea>=6);
  T('L: giriş kapısı yerleşti (BUG3)', r.hasEntry);
  T('L: merdiven notu OK (BUG2 maskeleme yok)', r.noteStatus==='ok');
  r.bads.forEach(b=>console.log('     · bad: '+b));
}

console.log('\n=== villa_T_3p1 (2 kat, 3+1 ensuite, T taban) ===');
{ const r=global.RUNV(Tp,{oda:3,salon:1,ensuite:true,acik:false,adet:1});
  console.log('   merdiven alanı='+r.stairArea.toFixed(1)+'m²  giriş kenarı='+r.entryEdge+'  yatak='+r.beds+'  not='+r.noteStatus);
  T('T: iç merdiven YERLEŞTİ (BUG1)', r.hasStair);
  T('T: giriş kapısı yerleşti (BUG3)', r.hasEntry);
  T('T: merdiven notu OK', r.noteStatus==='ok');
}

console.log('\n=== villa_rect_4p1 (2 kat, 4+1 ensuite, dikdörtgen — REGRESYON) ===');
{ const r=global.RUNV(R,{oda:4,salon:1,ensuite:true,acik:false,adet:1});
  console.log('   merdiven alanı='+r.stairArea.toFixed(1)+'m²  giriş kenarı='+r.entryEdge+'  yatak='+r.beds+'  not='+r.noteStatus);
  T('rect: iç merdiven first-class (regresyon)', r.hasStair);
  T('rect: giriş kapısı yerleşti', r.hasEntry);
  T('rect: merdiven notu OK', r.noteStatus==='ok');
}

/* tek katlı villa: merdiven istenmez, not basılmaz (yanlış bad olmamalı) */
console.log('\n=== villa_1kat (tek kat — merdiven istenmez) ===');
getEl('katSayisi').value='1';
{ const r=global.RUNV(R,{oda:3,salon:1,ensuite:true,acik:false,adet:1});
  T('1kat: merdiven notu yok (kat>1 değil)', r.noteText===null);
}

/* BUG3 izole: antresi YALNIZ batı cepheye değen sentetik villa (güney dış kenar YOK).
   Pre-fix: güney dışında dış cephe test edilmediği için kapı HİÇ yerleşmezdi. */
console.log('\n=== BUG3 izole: antre yalnız BATI cepheye değiyor ===');
{ const edge=global.BUG3_WEST();
  console.log('   giriş kenarı = '+edge);
  T('BUG3: batı-cepheli antrede giriş kapısı yerleşti', edge!==null);
  T('BUG3: kapı dikey (batı) kenarda', edge==='dikey');
}

console.log('\n'+(fail? ('FAIL — '+fail+' başarısız, '+pass+' geçti') : ('TÜM TESTLER GEÇTİ ('+pass+')')));
process.exit(fail? 1:0);
