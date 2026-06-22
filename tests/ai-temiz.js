// AI boyama TEMİZ modu (aiCleanMode) regresyon testi.
// TUTAR: oda dolgu rengi + duvar/oda sınırı + kapı boşluğu + İngilizce oda etiketi.
// ATAR: m² değeri, D1–D6 rozeti, duvar ölçüsü, grid, parsel/balkon/avlu etiketi, düğüm/tutamaç (topçuk), seçim.
// KADRAJ: kenar-maskesi (controlnet-edges) PNG'siyle BİREBİR aynı çözünürlük → iki PNG üst üste tam biner.
// tests/export.js başlığındaki DOM stub'ını kullanır. Çalıştır: node tests/ai-temiz.js (veya: npm test)
function stubEl(tag){ const e={
  tag, attrs:{}, children:[], style:{}, dataset:{}, _ih:'',
  set innerHTML(v){ this._ih=v; this.children=[]; }, get innerHTML(){ return this._ih; },
  appendChild(c){ this.children.push(c); return c; },
  insertBefore(c,ref){ const i=this.children.indexOf(ref); this.children.splice(i<0?0:i,0,c); return c; },
  get firstChild(){ return this.children[0]||null; },
  addEventListener(){}, querySelectorAll(){ return []; },
  classList:{toggle(){},add(){},remove(){}},
  setAttribute(k,v){ this.attrs[k]=v; }, getAttribute(k){ return this.attrs[k]; },
  getBoundingClientRect(){ return {width:1400,height:1000,left:0,top:0}; },
  cloneNode(deep){ const c=stubEl(this.tag); Object.assign(c.attrs,this.attrs); c.textContent=this.textContent;
    if(deep) this.children.forEach(ch=>c.children.push(ch.cloneNode?ch.cloneNode(true):ch)); return c; },
  textContent:'', value:'', disabled:false, onclick:null, click(){}
}; return e; }
const byId={}; const getEl=id=>byId[id]||(byId[id]=stubEl('div'));
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='5'; getEl('katYuk').value='2.9';
global.document={getElementById:getEl,createElement:t=>stubEl(t),createElementNS:(n,t)=>stubEl(t)};
global.window={addEventListener(){}};
global.XMLSerializer=function(){this.serializeToString=e=>JSON.stringify(e.attrs);};
global.Image=function(){this.onload=null;Object.defineProperty(this,'src',{set(){}});};
global.Blob=function(){};global.URL={createObjectURL:()=>''};

let FAILS=0; const fail=m=>{ FAILS++; console.log('  [FAIL]', m); };
const ok=m=>console.log('  [ok]', m);

eval(require('./support/app-js').readAppScript() + `
;unitSpecs=[{oda:2,salon:1,ensuite:true,acik:false,adet:2},{oda:1,salon:1,ensuite:false,acik:true,adet:2}];
pts=[{x:0,y:0},{x:32,y:0},{x:32,y:16},{x:0,y:16}]; closed=true;
generate();

function collect(root){
  const o={texts:[],lines:[],rects:[],circles:[],paths:[]};
  (function walk(e,inheritStroke){ if(!e) return;
    const stroke=(e.attrs&&e.attrs.stroke)||inheritStroke;   // <g stroke> alt çizgilere miras kalır
    if(e.tag==='text') o.texts.push((e.textContent||'').trim());
    else if(e.tag==='line') o.lines.push(Object.assign({_stroke:stroke}, e.attrs));
    else if(e.tag==='rect') o.rects.push(e.attrs);
    else if(e.tag==='circle') o.circles.push(e.attrs);
    else if(e.tag==='path') o.paths.push(e.attrs);
    (e.children||[]).forEach(c=>walk(c,stroke));
  })(root,null);
  return o;
}

// 1) ZENGİN aiPaint klonu (mevcut, gürültülü) — karşılaştırma temeli
aiPaintMode=true; aiCleanMode=false;
const rich=exportClone(); const R=collect(rich.clone);
aiPaintMode=false;

// 2) TEMİZ klon (yeni)
aiPaintMode=true; aiCleanMode=true;
const cleanR=exportClone(); const C=collect(cleanR.clone);
aiPaintMode=false; aiCleanMode=false;

// 3) Kenar maskesi klonu — kadraj referansı
edgeMaskMode=true;
const edge=exportClone();
edgeMaskMode=false;

global.__R=R; global.__C=C; global.__rich=rich; global.__cleanR=cleanR; global.__edge=edge; global.__COLORS=COLORS;
`);

const R=global.__R, C=global.__C, rich=global.__rich, cleanR=global.__cleanR, edge=global.__edge, COLORS=global.__COLORS;
const colorVals=new Set(Object.values(COLORS).map(s=>String(s).toLowerCase()));
const isNumLabel=s=>/^[\d.,]+(\s*m²?)?$/.test(s);          // "7,5" / "3" / "33,75 m²" / "12 m"
const isDbadge=s=>/^D\d+$/.test(s);                        // "D1".."D6"
const hasOrange=arr=>arr.some(a=>String(a.stroke).toLowerCase()==='#b35a2e'||String(a.fill).toLowerCase()==='#b35a2e');
const gridLines=arr=>arr.filter(a=>['#eae5d9','#ddd5c4'].includes(String(a.stroke).toLowerCase()));

console.log('\\n=== ZENGİN (eski) klon — temel ===');
console.log('  text:', R.texts.length, '| m² etiketi:', R.texts.filter(s=>s.includes('m²')).length,
            '| D-rozet:', R.texts.filter(isDbadge).length, '| grid çizgi:', gridLines(R.lines).length,
            '| turuncu tutamaç:', hasOrange(R.rects)||hasOrange(R.circles));

console.log('\\n=== TEMİZ klon — doğrulama ===');
console.log('  text örnekleri:', JSON.stringify(C.texts.slice(0,14)));

// KALDIRILANLAR
C.texts.some(s=>s.includes('m²')) ? fail('m² etiketi TEMİZ klonda hâlâ var') : ok('m² değeri yok');
C.texts.some(isDbadge)            ? fail('D1–D6 rozeti TEMİZ klonda hâlâ var') : ok('D1–D6 rozeti yok');
C.texts.filter(isNumLabel).length ? fail('ölçü/sayı etiketi var: '+JSON.stringify(C.texts.filter(isNumLabel))) : ok('ölçü/kenar sayıları yok');
gridLines(C.lines).length         ? fail('grid çizgileri TEMİZ klonda var: '+gridLines(C.lines).length) : ok('grid yok');
(hasOrange(C.rects)||hasOrange(C.circles)) ? fail('turuncu düğüm/tutamaç (#b35a2e) TEMİZ klonda var') : ok('düğüm/tutamaç (topçuk) yok');
C.texts.some(s=>/BAHÇE|BALKON|AVLU|Balcony/.test(s)) ? fail('parsel/balkon/avlu etiketi var') : ok('parsel/balkon/avlu etiketi yok');

// TUTULANLAR
const enLabels=C.texts.filter(s=>s && !isNumLabel(s));
enLabels.length>0 ? ok('oda EN etiketi var ('+enLabels.length+' adet, örn. '+JSON.stringify(enLabels.slice(0,5))+')') : fail('oda etiketi YOK');
const fillRects=C.rects.filter(a=>colorVals.has(String(a.fill).toLowerCase()));
fillRects.length>0 ? ok('oda dolgu renkleri var ('+fillRects.length+' hücre)') : fail('oda dolgu rengi YOK');
const wallLines=C.lines.filter(a=>String(a._stroke).toLowerCase()==='#2b2620');   // iç duvarlar: <g stroke='#2b2620'> mirası
const wallPath=C.paths.filter(a=>String(a.stroke).toLowerCase()==='#2b2620');     // dış kabuk (bina poligonu)
(wallLines.length>0||wallPath.length>0) ? ok('duvar/oda sınırı çizgileri var ('+wallLines.length+' iç segment + '+wallPath.length+' dış kabuk)') : fail('duvar çizgisi YOK');
const doorGaps=C.lines.filter(a=>String(a._stroke).toLowerCase()==='#faf8f3');
doorGaps.length>0 ? ok('kapı boşlukları (açıklık çizgisi) var ('+doorGaps.length+' adet)') : fail('kapı boşluğu YOK');

// KADRAJ — kenar maskesiyle BİREBİR
console.log('\\n=== KADRAJ ===');
console.log('  TEMİZ:', cleanR.W+'×'+cleanR.H, '| kenar-maskesi:', edge.W+'×'+edge.H, '| ZENGİN(eski):', rich.W+'×'+rich.H);
(cleanR.W===edge.W && cleanR.H===edge.H) ? ok('TEMİZ kadraj kenar-maskesiyle BİREBİR (PNG×2 → '+(cleanR.W*2)+'×'+(cleanR.H*2)+')')
                                         : fail('kadraj kenar-maskesiyle uyuşmuyor!');

console.log('\\n'+(FAILS? '*** '+FAILS+' HATA ***' : '*** TÜM DOĞRULAMALAR GEÇTİ ***'));
process.exit(FAILS?1:0);
