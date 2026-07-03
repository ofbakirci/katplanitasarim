/* Avlu düzenleme testi (kendi kendine yeter: node tests/avlu-edit.js)
   AV-1) Geçmiş/undo/redo: avlu yerleştir → geçmişte görünür (generate filtresi 'avlu'
         kaydını korur) → undo avluyu kaldırır → redo geri getirir; sil → undo geri getirir.
   (AV-2 taşı/boyutlandır ve AV-3 koridor-bölme guard vakaları ileriki dilimlerde eklenir.)
*/
const {extractAppScript}=require('./support/app-js');
let pass=0, fail=0;
const ok=(c,msg)=>{ if(c){pass++;} else {fail++; console.log('  ✗',msg);} };

function stubEl(tag){ return {
  tag, attrs:{}, children:[], style:{}, dataset:{}, _ih:'',
  set innerHTML(v){ this._ih=v; this.children=[]; }, get innerHTML(){ return this._ih; },
  appendChild(c){ this.children.push(c); return c; },
  insertBefore(c){ this.children.unshift(c); return c; },
  addEventListener(){}, querySelectorAll(){ return []; }, querySelector(){ return null; },
  cloneNode(){ return stubEl(this.tag); },
  classList:{toggle(){},add(){},remove(){}},
  setAttribute(k,v){ this.attrs[k]=v; }, getAttribute(k){ return this.attrs[k]; },
  getBoundingClientRect(){ return {width:1200,height:800,left:0,top:0}; },
  textContent:'', value:'', disabled:false, checked:false, onclick:null, click(){}
};}
const byId={}; const getEl=id=>byId[id]||(byId[id]=stubEl('div'));
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='5'; getEl('katYuk').value='2.9';
global.document={getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t)};
global.window={addEventListener(){}};
global.getComputedStyle=()=>({display:'none'});

const src=extractAppScript();

eval(src+`
;unitSpecs=[{oda:2,salon:1,ensuite:true,acik:false,adet:4}];
pts=[{x:0,y:0},{x:40,y:0},{x:40,y:12},{x:0,y:12}]; closed=true;
courtyards=[]; editHistory=[]; redoHistory=[]; generate();

const insideCount=p=>{ let n=0; for(let i=0;i<p.inside.length;i++) if(p.inside[i]) n++; return n; };
const in0=insideCount(plan);

/* ===== AV-1) Geçmiş / undo / redo ===== */
/* yerleştirme akışı (interaction.js finishDrag avlu dalının aynısı) */
pushEdit({type:'avlu', prev:courtyardsSnapshot()});
courtyards.push({poly:[{x:16,y:4},{x:24,y:4},{x:24,y:8},{x:16,y:8}]});   // 8×4 = 32 m²
avluChanged();   // → generate() → geçmiş filtresi

ok(editHistory.some(e=>e.type==='avlu'), 'AV-1: avlu kaydı generate sonrası geçmişte KALIR (filtre koruyor)');
ok(courtyards.length===1, 'yerleştirme: avlu var');
const inAvlu=insideCount(plan);
ok(inAvlu < in0, 'yerleştirme: footprint oyuldu (inside azaldı)');

/* undo → avlu gider */
ok(undoEdit(), 'undo döndü');
ok(courtyards.length===0, 'undo: avlu kaldırıldı');
ok(insideCount(plan)===in0, 'undo: inside maskesi avlusuz hâle döndü (birebir)');

/* redo → avlu geri gelir */
ok(redoEdit(), 'redo döndü');
ok(courtyards.length===1, 'redo: avlu geri geldi');
ok(insideCount(plan)===inAvlu, 'redo: inside maskesi avlulu hâle birebir döndü');

/* ===== AV-1 sil → undo ===== */
/* silme akışı (rooms.js contextmenu avlu dalının aynısı) */
pushEdit({type:'avlu', prev:courtyardsSnapshot()});
courtyards.splice(0,1); avluChanged();
ok(courtyards.length===0, 'sil: avlu kaldırıldı');
ok(editHistory.some(e=>e.type==='avlu'), 'sil: avlu kaydı geçmişte kalır');
ok(undoEdit() && courtyards.length===1, 'sil undo: avlu geri geldi');
ok(insideCount(plan)===inAvlu, 'sil undo: inside birebir avlulu hâle döndü');
`);

console.log((fail? '  '+fail+' BAŞARISIZ, ':'✓ ')+'tüm avlu düzenleme testleri '+(fail?'':'geçti ')+'('+pass+')');
process.exit(fail?1:0);
