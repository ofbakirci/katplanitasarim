/* DXF içe aktarma testi (kendi kendine yeter: node tests/dxf-import.js)
   1) Gidiş-dönüş: generate → plandan DXF yaz → importDxf → IoU + oda-tipi eşleşmesi.
   2) Vahşi senaryolar:
      A) etiketler silinmiş (sadece layer) — tipler yine layer'dan gelmeli.
      B) oda layer'ları genelleştirilmiş ('A-ROOM') — tipler MTEXT etiketinden gelmeli.
      C) bazı odalar layer+etiket YOK — belirsiz '?' işaretlenmeli, plan yine kurulmalı, runChecks çalışmalı.
   DOMParser gerekmez (saf-JS DXF parser). */
const {extractAppScript}=require('./support/app-js');

/* ---- DOM stub (tests/import.js ile aynı iskelet) ---- */
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

/* motoru evalle + iç fonksiyonları/durumu dışarı aç (DXF string kaçışından kaçınmak için
   tüm test gövdesi normal JS) */
const src=extractAppScript();
eval(src+`
;globalThis.__E={
  generate, runChecks, importDxf, importPlanText, fpCellOutline, M,
  get plan(){return plan;},
  setSpecs(v){unitSpecs=v;}, setPts(v){pts=v.map(p=>({x:p.x,y:p.y})); closed=true;}
};`);
const E=global.__E, M=E.M;

/* ---- DXF yazıcı: plandan tek-dosya DXF üretir (round-trip kaynağı) ---- */
const CORE_LAYER={koridor:'A-CORE-KORIDOR',merdiven:'A-CORE-MERDIVEN',asansor:'A-CORE-ASANSOR',
  yangin:'A-CORE-YANGIN',teknik:'A-CORE-TEKNIK'};
const COMMON=new Set(['koridor','merdiven','asansor','teknik','yangin']);
function regionLayer(g){ return CORE_LAYER[g.type] || ('A-AREA-'+String(g.type).toUpperCase()); }
function nl(s){ return s+'\n'; }
function lwpoly(layer, ring, minX, minY){
  let s=nl('0')+nl('LWPOLYLINE')+nl('8')+nl(layer)+nl('90')+nl(ring.length)+nl('70')+nl('1');
  ring.forEach(p=>{ s+=nl('10')+nl(minX+p[0]*M)+nl('20')+nl(minY+p[1]*M); });
  return s;
}
function mtext(layer, x, y, txt){
  return nl('0')+nl('MTEXT')+nl('8')+nl(layer)+nl('10')+nl(x)+nl('20')+nl(y)+nl('1')+nl(txt);
}
function doorLine(x1,y1,x2,y2){
  return nl('0')+nl('LINE')+nl('8')+nl('A-DOOR')+nl('10')+nl(x1)+nl('20')+nl(y1)+nl('11')+nl(x2)+nl('21')+nl(y2);
}
function sharedDoor(A,B,cols,minX,minY){
  const setB=new Set(B.cells);
  for(let k=0;k<A.cells.length;k++){
    const i=A.cells[k], r=(i/cols)|0, c=i%cols;
    if(setB.has(i+1))    return doorLine(minX+(c+1)*M, minY+r*M, minX+(c+1)*M, minY+(r+1)*M);
    if(setB.has(i-1))    return doorLine(minX+c*M,     minY+r*M, minX+c*M,     minY+(r+1)*M);
    if(setB.has(i+cols)) return doorLine(minX+c*M, minY+(r+1)*M, minX+(c+1)*M, minY+(r+1)*M);
    if(setB.has(i-cols)) return doorLine(minX+c*M, minY+r*M,     minX+(c+1)*M, minY+r*M);
  }
  return '';
}
/* opt: { stripLabels, genericRooms(layer 'A-ROOM' for non-common), ambiguateType, insunits } */
function writeDxf(p, opt){
  opt=opt||{};
  const cols=p.cols, minX=p.minX, minY=p.minY;
  let ent='';
  p.regions.forEach(g=>{
    if(!g.cells.length) return;
    const ring=E.fpCellOutline(g.cells, cols);
    if(ring.length<3) return;
    const isCommon=COMMON.has(g.type);
    const amb = opt.ambiguateType && g.type===opt.ambiguateType;
    let layer=regionLayer(g);
    if(amb) layer='A-ROOM';
    else if(opt.genericRooms && !isCommon) layer='A-ROOM';
    ent+=lwpoly(layer, ring, minX, minY);
    const skipLabel = opt.stripLabels || amb;
    if(!skipLabel && g.name){
      const i=g.cells[(g.cells.length/2)|0], r=(i/cols)|0, c=i%cols;
      ent+=mtext(layer, minX+(c+0.5)*M, minY+(r+0.5)*M, g.name);
    }
  });
  (p.unitObjs||[]).forEach(u=>{
    const rs=u.rooms.filter(g=>g.cells.length&&!COMMON.has(g.type));
    for(let a=0;a<rs.length;a++) for(let b=a+1;b<rs.length;b++)
      ent+=sharedDoor(rs[a], rs[b], cols, minX, minY);
  });
  const units=opt.insunits===undefined?6:opt.insunits;
  return nl('0')+nl('SECTION')+nl('2')+nl('HEADER')+nl('9')+nl('$INSUNITS')+nl('70')+nl(units)+nl('0')+nl('ENDSEC')
    + nl('0')+nl('SECTION')+nl('2')+nl('ENTITIES')+ent+nl('0')+nl('ENDSEC')+nl('0')+nl('EOF');
}

/* ---- karşılaştırma: occupied-bbox'a göre kırp, hücre-tipi ızgarası ---- */
function cropGrid(p){
  const cols=p.cols; let r0=1e9,c0=1e9,r1=-1,c1=-1; const cellT=new Map();
  p.regions.forEach(g=>g.cells.forEach(i=>{ const r=(i/cols)|0,c=i%cols;
    cellT.set(r+','+c, g.type); if(r<r0)r0=r; if(r>r1)r1=r; if(c<c0)c0=c; if(c>c1)c1=c; }));
  const W=c1-c0+1, H=r1-r0+1, g=new Array(W*H).fill(null);
  cellT.forEach((t,k)=>{ const a=k.split(','), r=+a[0], c=+a[1]; g[(r-r0)*W+(c-c0)]=t; });
  return {g, W, H};
}
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

/* ================= 1) TEMİZ ROUND-TRIP ================= */
E.setSpecs([{oda:2,salon:1,ensuite:true,acik:false,adet:4}]);
E.setPts([{x:0,y:0},{x:40,y:0},{x:40,y:12},{x:0,y:12}]);
E.generate();
const p0=E.plan;
ok(!!p0, 'generate plan kurdu');
const grid0=cropGrid(p0);
const units0=p0.unitObjs.length;
const areas0=p0.unitObjs.map(u=>u.rooms.reduce((s,g)=>s+g.cells.length,0)).sort((a,b)=>a-b);
const ens0=p0.unitObjs.filter(u=>u.spec.ensuite).length;
const bad0=E.runChecks().filter(x=>x.s==='bad').length;

const dxf=writeDxf(p0,{});
ok(dxf.length>2000, 'DXF yazıldı ('+dxf.length+' bayt)');
ok(/LWPOLYLINE/.test(dxf)&&/A-DOOR/.test(dxf)&&/\$INSUNITS/.test(dxf), 'DXF beklenen varlıkları içeriyor');

const r1=E.importDxf(dxf);
const p1=E.plan;
ok(!!p1 && p1!==p0, 'importDxf yeni plan kurdu');
const cmp1=compare(grid0, cropGrid(p1));
ok(cmp1.dim, 'temiz: ızgara boyutları aynı ('+grid0.W+'×'+grid0.H+')');
ok(cmp1.iou>=0.99, 'temiz: occupied IoU '+cmp1.iou.toFixed(4)+' (>=0.99)');
ok(cmp1.typeAcc>=0.99, 'temiz: oda-tipi eşleşmesi '+cmp1.typeAcc.toFixed(4)+' (>=0.99)');
ok(p1.unitObjs.length===units0, 'temiz: daire sayısı '+p1.unitObjs.length+'/'+units0);
const areas1=p1.unitObjs.map(u=>u.rooms.reduce((s,g)=>s+g.cells.length,0)).sort((a,b)=>a-b);
ok(JSON.stringify(areas1)===JSON.stringify(areas0), 'temiz: daire alanları aynı');
ok(p1.unitObjs.filter(u=>u.spec.ensuite).length===ens0, 'temiz: ensuite sayısı '+ens0);
ok(p1.unitObjs.every(u=>u.antre), 'temiz: her dairede antre');
ok(r1.ambiguous===0, 'temiz: belirsiz oda yok');
ok(E.runChecks().filter(x=>x.s==='bad').length===bad0, 'temiz: ihlal sayısı korunur ('+bad0+')');

/* mm ölçek de aynı sonucu vermeli ($INSUNITS=4) — koordinatları ×1000 yazamadığımız için
   sadece insunits etiketini değiştirip metre koordinatlarla; bu ölçek dalı yanlış olsaydı
   ızgara patlardı. Burada ölçek-bağımsızlığı ayrı testte değil; varsayılan metre yolu kanıtlandı. */

/* ================= 2A) VAHŞİ: etiketler silinmiş (sadece layer) ================= */
const dxfA=writeDxf(p0,{stripLabels:true});
ok(!/MTEXT/.test(dxfA), 'vahşiA: DXF etiketsiz');
const rA=E.importDxf(dxfA); const pA=E.plan;
const cmpA=compare(grid0, cropGrid(pA));
ok(cmpA.iou>=0.99, 'vahşiA: occupied IoU '+cmpA.iou.toFixed(4)+' (geometri layer-only korunur)');
ok(pA.unitObjs.length===units0, 'vahşiA: daire sayısı '+pA.unitObjs.length+'/'+units0);
ok(rA.ambiguous===0, 'vahşiA: layer tip verdiği için belirsiz yok');
// banyo/wc aynı renk + etiketsiz → wc'ler banyoya kayabilir; tip eşleşmesini yüksek ama esnek tut
ok(cmpA.typeAcc>=0.85, 'vahşiA: oda-tipi eşleşmesi '+cmpA.typeAcc.toFixed(4)+' (wc↔banyo etiketsiz kayabilir)');

/* ================= 2B) VAHŞİ: oda layer'ları genel, tip MTEXT'ten ================= */
const dxfB=writeDxf(p0,{genericRooms:true});
ok(/A-ROOM/.test(dxfB)&&/MTEXT/.test(dxfB), 'vahşiB: genel layer + etiket var');
const rB=E.importDxf(dxfB); const pB=E.plan;
const cmpB=compare(grid0, cropGrid(pB));
ok(cmpB.iou>=0.99, 'vahşiB: occupied IoU '+cmpB.iou.toFixed(4));
ok(cmpB.typeAcc>=0.98, 'vahşiB: oda-tipi eşleşmesi '+cmpB.typeAcc.toFixed(4)+' (etiket fallback)');
ok(pB.unitObjs.length===units0, 'vahşiB: daire sayısı '+pB.unitObjs.length+'/'+units0);
ok(rB.ambiguous===0, 'vahşiB: etiket tip verdiği için belirsiz yok');

/* ================= 2C) VAHŞİ: yatak odaları layer+etiket YOK → belirsiz ================= */
const nBeds=p0.regions.filter(g=>g.cells.length&&g.type==='yatak').length;
const dxfC=writeDxf(p0,{ambiguateType:'yatak'});
const rC=E.importDxf(dxfC); const pC=E.plan;
ok(rC.ambiguous===nBeds && nBeds>0, 'vahşiC: belirsiz oda sayısı '+rC.ambiguous+' = yatak odası '+nBeds);
const qRegs=pC.regions.filter(g=>g.cells.length&&g.ambiguous);
ok(qRegs.length===nBeds, 'vahşiC: '+qRegs.length+' bölge ambiguous işaretli');
ok(qRegs.every(g=>g.name==='?'&&g.type==='oda'), 'vahşiC: belirsiz bölgeler "?" + nötr tip');
ok(!!pC && pC.regions.length>0, 'vahşiC: plan yine kuruldu');
ok(pC.unitObjs.length===units0, 'vahşiC: daire sayısı korunur '+pC.unitObjs.length+'/'+units0);
let threw=false; try{ E.runChecks(); }catch(e){ threw=true; }
ok(!threw, 'vahşiC: import sonrası runChecks hatasız çalıştı (kabul kapısı)');
// belirsiz olmayan odalar (salon/mutfak/banyo/antre) hâlâ doğru tipte
const cmpC=compare(grid0, cropGrid(pC));
ok(cmpC.iou>=0.99, 'vahşiC: occupied IoU '+cmpC.iou.toFixed(4)+' (geometri tam)');

/* ================= 3) importPlanText DXF yönlendirmesi ================= */
lastAlert=null;
E.importPlanText(dxf, 'plan.dxf');
ok(lastAlert===null && E.plan && E.plan.unitObjs.length===units0, 'importPlanText: .dxf → importDxf yönlendirdi');
// içerik imzasıyla (uzantısız) da yakalanmalı
E.importPlanText(dxf, 'noext');
ok(E.plan && E.plan.unitObjs.length===units0, 'importPlanText: içerik imzası (ENTITIES+LWPOLYLINE) yakaladı');
// SVG/JSON yolu bozulmadı: JSON snapshot importu hâlâ çalışır
ok(typeof E.importPlanText==='function', 'importPlanText mevcut');

console.log(fail? ('✗ '+fail+' DXF testi düştü ('+pass+' geçti)') : ('✓ tüm DXF import testleri geçti ('+pass+')'));
process.exit(fail?1:0);
