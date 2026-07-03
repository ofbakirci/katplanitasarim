/* L1-A4 — DXF ROUNDTRIP (kendi kendine yeter: node tests/dxf-roundtrip.js)
   ÜRETİM yazıcısını (io.js buildDXF, R12/mm) sınar: generate → buildDXF → MEVCUT
   dxf.js importer'ı (importDxf, rasterize eden) → hücre-tipi ızgarası IoU + tip eşleşmesi.
   3 plan tipi: standart apartman, L-şekil apartman, villa.

   EŞİK GEREKÇESİ (IoU >= 0.95): importer DXF poligonlarını M=0.5 m ızgaraya YENİDEN
   rasterize eder (hücre-merkezi pip); üretim yazıcısı oda cephesini fpSmoothOutline ile
   pts'e snap'ler (io.js polygon_px deseni). Eksen-hizalı planlarda snap = fpCellOutline
   (ızgara-tam) → IoU ~1; eğik cephe/rasterize yuvarlaması küçük kayıp bırakabilir →
   %100 BEKLENMEZ (dxf.js'e DOKUNULMADI, olduğu gibi kullanılır). Tip eşleşmesi KATMAN'dan
   (A-AREA-<TİP>) gelir → yüksek; banyo/wc aynı renk + etiket kayması küçük sapma verebilir. */
const {extractAppScript}=require('./support/app-js');

/* ---- DOM stub (dxf-import.js ile aynı iskelet) ---- */
function stubEl(tag){ return {
  tag, attrs:{}, children:[], style:{}, dataset:{}, _ih:'',
  set innerHTML(v){ this._ih=v; this.children=[]; }, get innerHTML(){ return this._ih; },
  appendChild(c){ this.children.push(c); return c; },
  insertBefore(c){ this.children.unshift(c); return c; },
  addEventListener(){}, querySelectorAll(){ return []; },
  cloneNode(){ return stubEl(this.tag); },
  classList:{toggle(){},add(){},remove(){}},
  setAttribute(k,v){ this.attrs[k]=v; }, getAttribute(k){ return this.attrs[k]; },
  getBoundingClientRect(){ return {width:1200,height:800,left:0,top:0}; },
  textContent:'', value:'', disabled:false, onclick:null, click(){}
};}
const byId={}; const getEl=id=>byId[id]||(byId[id]=stubEl('div'));
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='5'; getEl('katYuk').value='2.9';
global.document={getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t)};
global.window={addEventListener(){}};
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){}; global.Blob=function(){}; global.URL={createObjectURL:()=>''};
let lastAlert=null; global.alert=m=>{ lastAlert=m; };
global.FileReader=function(){};

let pass=0, fail=0;
const ok=(c,msg)=>{ if(c){pass++;} else {fail++; console.log('  ✗',msg);} };

const src=extractAppScript();
eval(src+`
;globalThis.__E={
  generate, runChecks, importDxf, buildDXF, M,
  get plan(){return plan;},
  setSpecs(v){unitSpecs=v;}, setPts(v){pts=v.map(p=>({x:p.x,y:p.y})); closed=true;},
  setBinaTipi(v){ document.getElementById('binaTipi').value=v; }
};`);
const E=global.__E, M=E.M;

/* ---- karşılaştırma: occupied-bbox'a göre kırp, hücre-tipi ızgarası (dxf-import.js ile aynı) ---- */
function cropGrid(p){
  const cols=p.cols; let r0=1e9,c0=1e9,r1=-1,c1=-1; const cellT=new Map();
  p.regions.forEach(g=>g.cells.forEach(i=>{ const r=(i/cols)|0,c=i%cols;
    cellT.set(r+','+c, g.type); if(r<r0)r0=r; if(r>r1)r1=r; if(c<c0)c0=c; if(c>c1)c1=c; }));
  const W=c1-c0+1, H=r1-r0+1, g=new Array(W*H).fill(null);
  cellT.forEach((t,k)=>{ const a=k.split(','), r=+a[0], c=+a[1]; g[(r-r0)*W+(c-c0)]=t; });
  return {g, W, H};
}
/* Üretim yazıcısı Y'yi negatifler (CAD Y-yukarı → plan ekrandaki gibi dik durur).
   dxf.js importer'ı Y-naif (koordinatı olduğu gibi okur) → reimport, orijinalin DİKEY
   AYNASI olur. Bu BİLİNEN ve KASITLI: DXF dosyası CAD için doğru; roundtrip sadakati
   aynaya-göre ölçülür (importer'a dokunmadan). Referansı aynalayıp kıyaslıyoruz. */
function mirrorV(gr){ const {g,W,H}=gr; const o=new Array(W*H).fill(null);
  for(let r=0;r<H;r++)for(let c=0;c<W;c++) o[(H-1-r)*W+c]=g[r*W+c];
  return {g:o,W,H}; }
function compare(a, b){
  if(a.W!==b.W || a.H!==b.H) return {iou:0, typeAcc:0, dim:false};
  let inter=0, uni=0, both=0, match=0;
  for(let i=0;i<a.g.length;i++){
    const oa=a.g[i]!=null, ob=b.g[i]!=null;
    if(oa||ob) uni++;
    if(oa&&ob){ inter++; both++; if(a.g[i]===b.g[i]) match++; }
  }
  return {iou:uni?inter/uni:0, typeAcc:both?match/both:0, dim:true, both, match};
}

/* ---- tek vaka koşucusu: kur → buildDXF → importDxf → kıyas ---- */
function runCase(name, setup){
  setup();
  E.generate();
  const p0=E.plan;
  ok(!!p0, name+': generate plan kurdu');
  const grid0=cropGrid(p0);

  const dxf=E.buildDXF();
  ok(typeof dxf==='string' && dxf.length>2000, name+': DXF üretildi ('+(dxf?dxf.length:0)+' bayt)');
  ok(/AC1009/.test(dxf), name+': R12 (AC1009) başlığı var');
  ok(/\$INSUNITS\n70\n4/.test(dxf), name+': $INSUNITS=4 (mm)');
  ok(/POLYLINE/.test(dxf)&&/SEQEND/.test(dxf), name+': R12 POLYLINE/SEQEND (LWPOLYLINE değil)');
  ok(!/LWPOLYLINE/.test(dxf), name+': LWPOLYLINE YOK (R12 uyumu)');
  ok(/A-AREA-/.test(dxf)&&/A-WALL/.test(dxf)&&/A-DOOR/.test(dxf)&&/A-TEXT/.test(dxf), name+': beklenen katmanlar var');
  ok(/[\x80-￿]/.test(dxf)===false, name+': TEXT saf ASCII (Türkçe translit)');

  const r=E.importDxf(dxf);
  const p1=E.plan;
  ok(!!p1 && p1!==p0, name+': importDxf yeni plan kurdu');
  const cmp=compare(mirrorV(grid0), cropGrid(p1));   // reimport dikey ayna (Y-naif importer) — bkz. mirrorV notu
  ok(cmp.dim, name+': ızgara boyutları aynı ('+grid0.W+'×'+grid0.H+')');
  ok(cmp.iou>=0.95, name+': occupied IoU '+cmp.iou.toFixed(4)+' (>=0.95)');
  ok(cmp.typeAcc>=0.90, name+': oda-tipi eşleşmesi '+cmp.typeAcc.toFixed(4)+' (>=0.90)');
  let threw=false; try{ E.runChecks(); }catch(e){ threw=true; }
  ok(!threw, name+': import sonrası runChecks hatasız (kabul kapısı)');
  console.log('  · '+name+': IoU='+cmp.iou.toFixed(4)+' typeAcc='+cmp.typeAcc.toFixed(4)
    +' grid='+grid0.W+'×'+grid0.H+' amb='+(r&&r.ambiguous));
  return {cmp, grid0};
}

/* ================= 1) STANDART APARTMAN (dikdörtgen) ================= */
runCase('standart', ()=>{
  E.setBinaTipi('apartman');
  E.setSpecs([{oda:2,salon:1,ensuite:true,acik:false,adet:4}]);
  E.setPts([{x:0,y:0},{x:40,y:0},{x:40,y:12},{x:0,y:12}]);
});

/* ================= 2) L-ŞEKİL APARTMAN ================= */
runCase('L-sekil', ()=>{
  E.setBinaTipi('apartman');
  E.setSpecs([{oda:2,salon:1,ensuite:false,acik:false,adet:3}]);
  E.setPts([{x:0,y:0},{x:34,y:0},{x:34,y:10},{x:16,y:10},{x:16,y:20},{x:0,y:20}]);
});

/* ================= 3) VİLLA ================= */
runCase('villa', ()=>{
  E.setBinaTipi('villa');
  E.setSpecs([{oda:3,salon:1,ensuite:true,acik:true,adet:1}]);
  E.setPts([{x:0,y:0},{x:16,y:0},{x:16,y:14},{x:0,y:14}]);
});

console.log(fail? ('✗ '+fail+' DXF roundtrip testi düştü ('+pass+' geçti)')
                : ('✓ tüm DXF roundtrip testleri geçti ('+pass+')'));
process.exit(fail?1:0);
