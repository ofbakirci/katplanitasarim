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

/* ===== AV-3) Koridor-bölme guard + kırmızı denetim ===== */
/* standart apartman planında koridor yatay bant (x6.5..38, y5..6.5, tek parça) */
courtyards=[]; editHistory=[]; redoHistory=[]; generate();
const kor0=corridorComponentTotal();
ok(kor0>=1, 'AV-3 kurulum: koridor mevcut ('+kor0+' parça)');

/* GUARD: koridoru dik kesen avlu (x20..22, y4..8 tüm koridor enini kapatır) reddedilir */
const prevSnap=courtyardsSnapshot();
courtyards.push({poly:[{x:20,y:4},{x:22,y:4},{x:22,y:8},{x:20,y:8}]});
const guardOk=avluCommitGuard(prevSnap);
ok(guardOk===false, 'AV-3 guard: koridoru bölen avlu REDDEDİLDİ');
ok(courtyards.length===0, 'AV-3 guard: courtyards eski hâline döndü');
ok(corridorComponentTotal()===kor0, 'AV-3 guard: koridor parça sayısı korundu');

/* KIRMIZI DENETİM: guard'ı atlayan (içe aktarılmış) split-koridor planında AVLU bad satırı */
courtyards=[{poly:[{x:20,y:4},{x:22,y:4},{x:22,y:8},{x:20,y:8}]}];
resetCuts(); generate();
ok(corridorComponentTotal()>=2, 'AV-3: zorlanmış avlu koridoru 2+ parçaya böldü');
const kor=avluSplitsCorridor();
ok(kor!=null, 'AV-3: avluSplitsCorridor bölünmeyi tespit etti');
const bads=runChecks().filter(x=>x.s==='bad' && /koridoru bölmüş/i.test(x.t));
ok(bads.length===1, 'AV-3: AVLU kırmızı denetim satırı üretildi');
ok(bads.length && bads[0].id==='AVLU', 'AV-3: satır id kararlı AVLU');
ok(bads.length && bads[0].reg!=null && !!bads[0].action, 'AV-3: satır reg (odak) + action taşır');

/* avlu koridora değmezse (guard'lı yol) bad üretmez — köşede küçük avlu */
courtyards=[{poly:[{x:2,y:1},{x:4,y:1},{x:4,y:3},{x:2,y:3}]}]; resetCuts(); generate();
ok(!runChecks().some(x=>x.s==='bad' && /koridoru bölmüş/i.test(x.t)), 'AV-3: koridora değmeyen avlu bad üretmez');

/* ===== AV-4) AVLU-FARKINDA YERLEŞİM KALİTESİ (avlu-rework) =====
   Merkezi avlulu apartmanda: (a) kopuk bölge 0, (b) avluya taşma 0 (avlu içi hücre bölgeye
   atanmamış), (c) avlu-komşu yaşam alanı ≥1, (d) koridor payı makul. Metrik yardımcıları. */
function avluMetrics(){
  const p=plan, cols=p.cols, rows=p.rows;
  let corridorCells=0, insideTot=0, discon=0, spill=0;
  for(let i=0;i<p.inside.length;i++) if(p.inside[i]) insideTot++;
  p.regions.forEach(g=>{
    if(g.type==='koridor') corridorCells+=g.cells.length;
    if(g.cells.length>=2 && g.type!=='koridor' && g.type!=='isiklik' && !regConnected(g)) discon++;
  });
  const neigh=new Set();
  courtyards.forEach(av=>{ for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const cx=p.minX+(c+.5)*0.5, cy=p.minY+(r+.5)*0.5;
    if(pip(cx,cy,av.poly)){ const i=r*cols+c; if(p.cm[i]>=0) spill++;
      [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc])=>{ if(rr<0||cc<0||rr>=rows||cc>=cols)return;
        const j=rr*cols+cc; if(p.inside[j]&&p.cm[j]>=0) neigh.add(p.cm[j]); }); } } });
  const life=[...neigh].filter(id=>['salon','mutfak','yatak'].includes(p.regions[id]&&p.regions[id].type)).length;
  return {corridorPct:corridorCells/insideTot*100, discon, spill, life,
          neighTypes:[...neigh].map(id=>p.regions[id]&&p.regions[id].type)};
}
/* apartman 40×18, 4 daire, merkezi 10×6 avlu */
unitSpecs=[{oda:2,salon:1,ensuite:true,acik:false,adet:4}];
pts=[{x:0,y:0},{x:40,y:0},{x:40,y:18},{x:0,y:18}]; closed=true;
courtyards=[{poly:[{x:15,y:6},{x:25,y:6},{x:25,y:12},{x:15,y:12}]}]; editHistory=[]; redoHistory=[];
resetCuts(); generate();
const M4=avluMetrics();
ok(M4.discon===0, 'AV-4a: avlulu apartmanda kopuk bölge 0 (discon='+M4.discon+')');
ok(M4.spill===0, 'AV-4b: hiçbir oda avluya taşmadı (spill='+M4.spill+')');
ok(M4.life>=1, 'AV-4c: avlu-komşu yaşam alanı ≥1 (life='+M4.life+' tipler='+M4.neighTypes.join(',')+')');
ok(M4.corridorPct<20, 'AV-4d: koridor payı makul (<%20; '+M4.corridorPct.toFixed(1)+'%)');
/* avlu bir salon/oda tipini courtyardLightsRoom ile de doğrula (avlu-cephe API) */
const litRooms=plan.regions.filter(g=>g.cells.length && typeof courtyardLightsRoom==='function' && courtyardLightsRoom(g));
ok(litRooms.length>=1, 'AV-4e: courtyardLightsRoom ≥1 oda avluya bakıyor der ('+litRooms.length+')');

/* ===== AV-5) OTO-AVLU ÖNERİSİ (avlu-rework) ===== */
/* sığ taban → öneri yok */
courtyards=[]; pts=[{x:0,y:0},{x:40,y:0},{x:40,y:12},{x:0,y:12}]; closed=true; resetCuts(); generate();
ok(suggestCourtyard()===null, 'AV-5: sığ taban avlu ÖNERMEZ');
/* derin/karanlık taban → öneri var, aday geçerli (sınır içi + kısa kenar ≥ avluMinKisa) */
unitSpecs=[{oda:3,salon:1,ensuite:true,acik:false,adet:3}];
pts=[{x:0,y:0},{x:28,y:0},{x:28,y:28},{x:0,y:28}]; closed=true; courtyards=[]; resetCuts(); generate();
const sug=suggestCourtyard();
ok(sug!=null, 'AV-5: derin/karanlık taban avlu ÖNERİR');
ok(sug && sug.poly.every(pt=>pip(pt.x,pt.y,pts)), 'AV-5: aday avlu bina sınırı içinde');
ok(sug && Math.min(bboxOf(sug.poly).maxX-bboxOf(sug.poly).minX, bboxOf(sug.poly).maxY-bboxOf(sug.poly).minY)>=REG.avluMinKisa,
   'AV-5: aday kısa kenar ≥ avluMinKisa');
/* avlu zaten varken öneri yok */
courtyards=[{poly:[{x:12,y:12},{x:16,y:12},{x:16,y:16},{x:12,y:16}]}]; resetCuts(); generate();
ok(suggestCourtyard()===null, 'AV-5: avlu mevcutken öneri YOK');
/* placeSuggestedCourtyard: öneriyi yerleştirme akışı. Guard koridoru bölerse REDDEDER
   (avlu-farkında güvenlik) → placed=false, öneri söner, courtyards değişmez. Guard geçerse
   yerleşir + geçmişe yazılır + undo edilebilir. İki yol da MEŞRU; sözleşmeyi test ederiz. */
/* guard-güvenli vaka: tek daire/kat (koridor yok) → öneri her zaman yerleşir */
getEl('katSayisi').value='6';
unitSpecs=[{oda:2,salon:1,ensuite:true,acik:false,adet:1}];
pts=[{x:0,y:0},{x:26,y:0},{x:26,y:26},{x:0,y:26}]; closed=true; courtyards=[]; editHistory=[]; redoHistory=[];
resetCuts(); generate();
avluSuggestion=suggestCourtyard(); const sugPoly=avluSuggestion&&JSON.stringify(avluSuggestion.poly);
ok(avluSuggestion!=null, 'AV-5: tek-daire derin tabanda avluSuggestion set edildi');
const placed=placeSuggestedCourtyard();
ok(placed===true, 'AV-5: guard-güvenli tabanda placeSuggestedCourtyard yerleştirdi');
ok(courtyards.length===1 && JSON.stringify(courtyards[0].poly)===sugPoly, 'AV-5: yerleşen avlu = önerilen poligon');
ok(avluSuggestion===null, 'AV-5: yerleştirmeden sonra öneri söndü');
ok(editHistory.some(e=>e.type==='avlu'), 'AV-5: yerleştirme geçmişe yazıldı (undo edilebilir)');
ok(undoEdit() && courtyards.length===0, 'AV-5: öneri-yerleştirme undo ile geri alındı');
/* guard-reddi vakası: koridoru bölecek öneride placed=false + courtyards değişmez */
unitSpecs=[{oda:3,salon:1,ensuite:true,acik:false,adet:3}];
pts=[{x:0,y:0},{x:28,y:0},{x:28,y:28},{x:0,y:28}]; closed=true; courtyards=[]; editHistory=[]; redoHistory=[];
resetCuts(); generate();
avluSuggestion=suggestCourtyard();
if(avluSuggestion){ const eh0=editHistory.length; const p2=placeSuggestedCourtyard();
  ok(p2===true ? courtyards.length===1 : (courtyards.length===0 && editHistory.length===eh0),
     'AV-5: guard sözleşmesi — geçerse yerleşir, reddederse courtyards+geçmiş dokunulmaz'); }
else ok(true, 'AV-5: (bu tabanda öneri yok — sözleşme testi atlandı)');
`);

console.log((fail? '  '+fail+' BAŞARISIZ, ':'✓ ')+'tüm avlu düzenleme testleri '+(fail?'':'geçti ')+'('+pass+')');
process.exit(fail?1:0);
