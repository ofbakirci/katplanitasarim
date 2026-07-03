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

/* ===== AV-2) Taşı / boyutlandır / geçersiz-geri-al ===== */
/* temiz zemin: tek avlu 16..24 × 4..8 */
courtyards=[{poly:[{x:16,y:4},{x:24,y:4},{x:24,y:8},{x:16,y:8}]}]; editHistory=[]; redoHistory=[]; generate();
const prevPoly=JSON.stringify(courtyards[0].poly);

/* TAŞI: gövdeyi +2m x taşı (finishDrag avluMove yolunun aynısı) */
avluDragIdx=0;
dragging={type:'avluMove', i:0, part:'body', prev:courtyardsSnapshot(), box0:bboxOf(courtyards[0].poly), gx:20, gy:6};
let mp=rectPoly(18,4,26,8);
avluGhost={poly:mp, invalid:!avluPolyValid(mp)};
finishDrag();
ok(avluDragIdx===-1, 'taşı: avluDragIdx sıfırlandı');
ok(courtyards.length===1 && bboxOf(courtyards[0].poly).minX===18, 'AV-2 taşı: avlu +2m taşındı (minX 18)');
ok(editHistory.some(e=>e.type==='avlu'), 'AV-2 taşı: geçmişe yazıldı');
ok(undoEdit() && JSON.stringify(courtyards[0].poly)===prevPoly, 'AV-2 taşı undo: eski konuma döndü');

/* BOYUTLANDIR: doğu kenarını +4m aç (finishDrag avluResize) */
const box0=bboxOf(courtyards[0].poly), w0=box0.maxX-box0.minX;
avluDragIdx=0;
dragging={type:'avluResize', i:0, part:'e', prev:courtyardsSnapshot(), box0, gx:0, gy:0};
let rp=rectPoly(box0.minX, box0.minY, box0.maxX+4, box0.maxY);
avluGhost={poly:rp, invalid:!avluPolyValid(rp)};
finishDrag();
ok(Math.abs((bboxOf(courtyards[0].poly).maxX-bboxOf(courtyards[0].poly).minX)-(w0+4))<1e-6, 'AV-2 boyut: genişlik +4m');
ok(undoEdit() && Math.abs((bboxOf(courtyards[0].poly).maxX-bboxOf(courtyards[0].poly).minX)-w0)<1e-6, 'AV-2 boyut undo: eski genişliğe döndü');

/* GEÇERSİZ: sınır dışına taşı → geri alınır, geçmiş kirlenmez */
const ehLen=editHistory.length, keepPoly=JSON.stringify(courtyards[0].poly);
avluDragIdx=0;
dragging={type:'avluMove', i:0, part:'body', prev:courtyardsSnapshot(), box0:bboxOf(courtyards[0].poly), gx:20, gy:6};
let op=rectPoly(38,4,46,8);   // maxX 46 > footprint 40 → köşe sınır dışı
avluGhost={poly:op, invalid:!avluPolyValid(op)};
ok(avluGhost.invalid, 'AV-2 geçersiz: sınır-dışı aday invalid işaretlendi');
finishDrag();
ok(JSON.stringify(courtyards[0].poly)===keepPoly, 'AV-2 geçersiz: avlu eski konumda kaldı (geri alındı)');
ok(editHistory.length===ehLen, 'AV-2 geçersiz: geçmişe kayıt yazılmadı');
`);

console.log((fail? '  '+fail+' BAŞARISIZ, ':'✓ ')+'tüm avlu düzenleme testleri '+(fail?'':'geçti ')+'('+pass+')');
process.exit(fail?1:0);
