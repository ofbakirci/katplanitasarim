'use strict';
/* ================= yapı katmanı (struct mode) =================
   Bina çekirdeği — merdiven / asansör / teknik şaft / yangın merdiveni — üretim
   sonrasında doğrudan taşınıp boyutlandırılır (tıpkı oda duvarı sürükleme gibi):
   yapı dikdörtgeni hücre kümesi olarak yeniden tanımlanır; içine giren hücreler
   komşu bölgelerden alınır, dışında kalan hücreler baskın komşuya devredilir. */
const STRUCT_TYPES={merdiven:1,asansor:1,yangin:1,teknik:1};
function isStructReg(g){
  return !!(g && STRUCT_TYPES[g.type] && g.cells.length && g.name!=='ORTAK DEPO');
}
function structRegions(){ return plan? plan.regions.filter(isStructReg) : []; }
/* bölgenin ızgara kapsayan kutusu (yapı öğeleri dikdörtgendir) */
function regBoxCells(g){
  const cols=plan.cols; let r0=1e9,r1=-1e9,c0=1e9,c1=-1e9;
  g.cells.forEach(i=>{const r=(i/cols)|0,c=i%cols; if(r<r0)r0=r;if(r>r1)r1=r;if(c<c0)c0=c;if(c>c1)c1=c;});
  return {r0,r1,c0,c1};
}
/* bırakılan hücreleri (yapı küçülünce/kayınca açığa çıkan) baskın komşu bölgeye devret */
function assignCellsToNeighbor(cells, excludeId){
  if(!cells.length) return;
  const p=plan, cols=p.cols, rows=p.rows, rel=new Set(cells);
  cells.forEach(i=>{ p.cm[i]=-1; });
  const seen=new Set();
  cells.forEach(start=>{
    if(seen.has(start)) return;
    const comp=[], st=[start]; seen.add(start);
    while(st.length){ const i=st.pop(); comp.push(i); const r=(i/cols)|0,c=i%cols;
      [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc])=>{ if(rr<0||cc<0||rr>=rows||cc>=cols) return;
        const j=rr*cols+cc; if(rel.has(j)&&!seen.has(j)){ seen.add(j); st.push(j); } }); }
    const cnt=new Map();
    comp.forEach(i=>{ const r=(i/cols)|0,c=i%cols;
      [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc])=>{ if(rr<0||cc<0||rr>=rows||cc>=cols) return;
        const ow=p.cm[rr*cols+cc];
        /* boşalan hücreler BAŞKA çekirdeğe gitmez (yoksa merdiven/asansör şişer — A-bozuk hatası);
           yalnız daire/oda bölgelerine devredilir */
        if(p.inside[rr*cols+cc]&&ow>=0&&ow!==excludeId&&!isStructReg(p.regions[ow])) cnt.set(ow,(cnt.get(ow)||0)+1); }); });
    let best=-1,bn=0; cnt.forEach((n,id)=>{ if(n>bn){bn=n;best=id;} });
    if(best>=0){ comp.forEach(i=>{ p.cm[i]=best; p.regions[best].cells.push(i); }); }
    /* komşusuz kalırsa hücre boşta (cm=-1) bırakılır — kullanıcı duvar aracıyla toplar */
  });
}
/* yapı bölgesini yeni ızgara dikdörtgenine taşı; komşular yeniden akar */
function applyStructRect(reg, nr0,nc0,nr1,nc1){
  const p=plan, cols=p.cols;
  const want=[];
  for(let r=nr0;r<=nr1;r++) for(let c=nc0;c<=nc1;c++){
    if(r<0||c<0||r>=p.rows||c>=cols) continue;
    const i=r*cols+c; if(p.inside[i]) want.push(i);
  }
  if(!want.length) return false;
  const wantSet=new Set(want), old=reg.cells.slice();
  want.forEach(i=>{ const ow=p.cm[i]; if(ow===reg.id) return;
    if(ow>=0){ const g=p.regions[ow]; g.cells=g.cells.filter(x=>x!==i); }
    p.cm[i]=reg.id; });
  reg.cells=want.slice();
  assignCellsToNeighbor(old.filter(i=>!wantSet.has(i)), reg.id);
  p.regions.forEach(g=>calcRegionMetrics(g,cols,p.minX,p.minY));
  return true;
}
/* yeni çekirdek öğesi ekle/sil (yapı modu paleti + tutamağı).
   Ad/renk haritaları core.js'teki COLORS + lockedCore adlarıyla uyumlu. */
const STRUCT_NAME={merdiven:'MERDİVEN', asansor:'ASANSÖR', yangin:'YANGIN MERD.', teknik:'TEKNİK / ŞAFT'};
const STRUCT_SIZE={merdiven:{w:3.0,h:5.0}, asansor:{w:2.0,h:2.0}, yangin:{w:2.5,h:3.5}, teknik:{w:1.0,h:1.5}};
/* plan.stairs'ı güncel merdiven+yangın bölgelerinden yeniden kur — kaçış-mesafesi denetimi (checks.js)
   bu diziyi kullanır; ekle/sil sonrası senkron tutulmazsa denetim bayat konumlara bakar. */
function rebuildStairs(){
  const p=plan; if(!p) return;
  p.stairs = p.regions.filter(g=>(g.type==='merdiven'||g.type==='yangin')&&g.cells.length).map(g=>{
    const b=regBoxCells(g); return {r0:b.r0, c0:b.c0, h:b.r1-b.r0+1, w:b.c1-b.c0+1};
  });
}
/* tıklanan noktaya tipe göre varsayılan kutuda yeni yapı bölgesi koy. Bölge satır-içi kurulur
   (newReg planner-içi yerel); id===index değişmezi için yalnız push (asla splice). */
function addStructRegion(type, sx, sy){
  const p=plan; if(!p||!STRUCT_TYPES[type]) return false;
  const sz=(p.villa&&type==='merdiven')? {w:2.5,h:4.0} : STRUCT_SIZE[type];
  const wc=Math.max(1,Math.round(sz.w/M)), hc=Math.max(1,Math.round(sz.h/M));
  const gc=Math.floor((S2Wx(sx)-p.minX)/M), gr=Math.floor((S2Wy(sy)-p.minY)/M);
  let c0=gc-(wc>>1), r0=gr-(hc>>1), c1=c0+wc-1, r1=r0+hc-1;
  c0=Math.max(0,c0); r0=Math.max(0,r0); c1=Math.min(p.cols-1,c1); r1=Math.min(p.rows-1,r1);
  const g={id:p.regions.length, name:STRUCT_NAME[type], type, unit:-1, cells:[]};
  p.regions.push(g);
  if(!applyStructRect(g, r0,c0,r1,c1)){ p.regions.pop(); return false; } // bina dışına düştü → geri al
  rebuildStairs();
  p.wallRuns=computeWallRuns(); runChecks(); buildUnitTable(); render();
  return true;
}
/* yapı bölgesini sil: hücreleri boşalt + baskın komşuya devret. Bölge nesnesi 0-hücre atıl
   bırakılır (splice YOK) → isStructReg/structRegions süzer, id===index korunur, undo sağlam. */
function deleteStructRegion(regId){
  const p=plan; const reg=p&&p.regions[regId];
  if(!reg||!isStructReg(reg)) return false;
  const old=reg.cells.slice();
  reg.cells=[];
  assignCellsToNeighbor(old, reg.id);          // cm'i temizler + baskın daire/oda komşusuna verir
  calcRegionMetrics(reg, p.cols, p.minX, p.minY);
  rebuildStairs();
  p.wallRuns=computeWallRuns(); runChecks(); buildUnitTable(); render();
  return true;
}
/* bağlam-menüsü sarmalayıcıları (rooms.js sağ-tık menüsünden çağrılır):
   tam-durum undo girdisi + apartmanda çekirdek iskeletini (lockedCore) senkronla. */
function doAddStruct(type, sx, sy){
  if(!plan) return false;
  const st0=stateSnapshot();
  if(!addStructRegion(type, sx, sy)) return false;
  pushEdit({type:'structedit', state:st0});
  if(!plan.villa){ captureLockedCore(); updateStructResetBtn(); }
  if(floorsOn()) villaFloors[activeFloor]=stateSnapshot(true);
  return true;
}
function doDeleteStruct(regId){
  if(!plan) return false;
  const st0=stateSnapshot();
  if(!deleteStructRegion(regId)) return false;
  pushEdit({type:'structedit', state:st0});
  if(!plan.villa){ captureLockedCore(); updateStructResetBtn(); }
  if(floorsOn()) villaFloors[activeFloor]=stateSnapshot(true);
  return true;
}
/* sürükleme: tutamağa göre hedef dikdörtgeni hesapla, ızgaraya snap, uygula */
function dragStructTo(sx,sy){
  const p=plan, d=dragging;
  const gc=Math.floor((S2Wx(sx)-p.minX)/M), gr=Math.floor((S2Wy(sy)-p.minY)/M);
  let {r0,c0,r1,c1}=d.box0; const h=d.handle;
  if(h==='move'){
    const dr=gr-d.gr, dc=gc-d.gc; r0+=dr;r1+=dr;c0+=dc;c1+=dc;
    if(c0<0){c1-=c0;c0=0;} if(r0<0){r1-=r0;r0=0;}
    if(c1>p.cols-1){c0-=c1-(p.cols-1);c1=p.cols-1;}
    if(r1>p.rows-1){r0-=r1-(p.rows-1);r1=p.rows-1;}
  } else {
    if(h.indexOf('n')>=0) r0=Math.min(gr, r1);
    if(h.indexOf('s')>=0) r1=Math.max(gr, r0);
    if(h.indexOf('w')>=0) c0=Math.min(gc, c1);
    if(h.indexOf('e')>=0) c1=Math.max(gc, c0);
    r0=Math.max(0,r0);c0=Math.max(0,c0);r1=Math.min(p.rows-1,r1);c1=Math.min(p.cols-1,c1);
  }
  const reg=p.regions[d.regId]; if(!reg) return;
  if(applyStructRect(reg,r0,c0,r1,c1)){
    p.wallRuns=computeWallRuns(); runChecks(); buildUnitTable(); render();
  }
}
function hitStructHandle(sx,sy){
  const hs=svg.querySelectorAll('[data-struct]');
  for(const h of hs){
    const dx=sx-(+h.getAttribute('data-hx')), dy=sy-(+h.getAttribute('data-hy'));
    if(dx*dx+dy*dy<=210*HITSC*HITSC) return JSON.parse(h.dataset.struct);
  }
  return null;
}
/* yapı modunda bina sınırı tutamağı: köşe (taşı) ya da kenar ortası (anchor ekle) */
function hitBoundaryHandle(sx,sy){
  const vs=svg.querySelectorAll('[data-bvert]');
  for(const h of vs){ const dx=sx-(+h.getAttribute('data-hx')), dy=sy-(+h.getAttribute('data-hy'));
    if(dx*dx+dy*dy<=210*HITSC*HITSC) return {kind:'vert', idx:+h.dataset.bvert}; }
  const es=svg.querySelectorAll('[data-bedge]');
  for(const h of es){ const dx=sx-(+h.getAttribute('data-hx')), dy=sy-(+h.getAttribute('data-hy'));
    if(dx*dx+dy*dy<=210*HITSC*HITSC) return {kind:'edge', idx:+h.dataset.bedge}; }
  return null;
}
/* yapı katmanını çiz: dış soluk perde + çekirdek öğeleri belirgin + tutamaçlar */
function renderStructLayer(){
  const p=plan; if(!p) return;
  const vp=exportView||svg.getBoundingClientRect();
  const sg=el('g',{}); svg.appendChild(sg);
  sg.appendChild(el('rect',{x:0,y:0,width:vp.width,height:vp.height,fill:'#fbf9f4',opacity:0.6,'clip-path':'url(#planClip)'}));
  const cs=M*pxPerM, wx=c=>W2Sx(p.minX+c*M), wy=r=>W2Sy(p.minY+r*M);
  const regs=structRegions();
  regs.forEach(reg=>{
    reg.cells.forEach(i=>{ const r=(i/p.cols)|0,c=i%p.cols;
      sg.appendChild(el('rect',{x:wx(c),y:wy(r),width:cs+0.5,height:cs+0.5,fill:COLORS[reg.type]||'#fff'})); });
  });
  regs.forEach(reg=>{
    const b=regBoxCells(reg);
    /* belirgin çerçeve */
    sg.appendChild(el('rect',{x:wx(b.c0),y:wy(b.r0),width:(b.c1-b.c0+1)*cs,height:(b.r1-b.r0+1)*cs,
      fill:'none',stroke:'#2b2620','stroke-width':Math.max(2.5,pxPerM*0.18)}));
    /* etiket + ölçü */
    const cx=wx((b.c0+b.c1+1)/2), cy=wy((b.r0+b.r1+1)/2);
    const fs=Math.max(8,Math.min(13,pxPerM*0.6));
    const t=el('text',{x:cx,y:cy-fs*0.2,'text-anchor':'middle','font-size':fs,'font-weight':'700',fill:'#2b2620'});
    t.textContent=reg.name; sg.appendChild(t);
    const t2=el('text',{x:cx,y:cy+fs,'text-anchor':'middle','font-size':fs*0.85,fill:'#6b5e4d'});
    t2.textContent=fmt((b.c1-b.c0+1)*M)+' × '+fmt((b.r1-b.r0+1)*M)+' m'; sg.appendChild(t2);
    /* tutamaçlar: 4 köşe + 4 kenar (kare) + merkez (taşı, yuvarlak) */
    const HS=Math.max(5,pxPerM*0.32);
    const sq=(hx,hy,handle,cur)=>{
      const e=el('rect',{x:hx-HS,y:hy-HS,width:HS*2,height:HS*2,rx:1.5,fill:'#fff',stroke:'#2f6f8f','stroke-width':2,cursor:cur,'data-hx':hx,'data-hy':hy});
      e.dataset.struct=JSON.stringify({regId:reg.id,handle}); sg.appendChild(e);
    };
    const eW=wx(b.c0), eE=wx(b.c1+1), eN=wy(b.r0), eS=wy(b.r1+1), mC=wx((b.c0+b.c1+1)/2), mR=wy((b.r0+b.r1+1)/2);
    sq(eW,eN,'nw','nwse-resize'); sq(eE,eN,'ne','nesw-resize');
    sq(eW,eS,'sw','nesw-resize'); sq(eE,eS,'se','nwse-resize');
    sq(mC,eN,'n','ns-resize'); sq(mC,eS,'s','ns-resize');
    sq(eW,mR,'w','ew-resize'); sq(eE,mR,'e','ew-resize');
    const mv=el('circle',{cx:mC,cy:mR,r:HS*1.5,fill:'#2f6f8f',stroke:'#fff','stroke-width':2,cursor:'move','data-hx':mC,'data-hy':mR});
    mv.dataset.struct=JSON.stringify({regId:reg.id,handle:'move'}); sg.appendChild(mv);
    const cr=HS*1.5*0.55;   // taşı tutamacı = artı/crosshair (emoji yok, SVG çizgi)
    sg.appendChild(el('path',{d:'M'+(mC-cr)+' '+mR+'h'+(2*cr)+'M'+mC+' '+(mR-cr)+'v'+(2*cr),stroke:'#fff','stroke-width':2,'stroke-linecap':'round',fill:'none','pointer-events':'none'}));
  });
  /* --- bina sınırı: köşe tutamakları (taşı) + kenar ortası (+ anchor ekle) --- */
  if(closed && pts.length>=3){
    const bg=el('g',{}); sg.appendChild(bg);
    bg.appendChild(el('path',{d:'M'+pts.map(p=>W2Sx(p.x)+','+W2Sy(p.y)).join('L')+'Z',
      fill:'none', stroke:'#b35a2e', 'stroke-width':Math.max(2.5,pxPerM*0.16), opacity:0.9}));
    const er=Math.max(4,pxPerM*0.22), vr=Math.max(5,pxPerM*0.3);
    for(let i=0;i<pts.length;i++){
      const a=pts[i], b=pts[(i+1)%pts.length], mx=W2Sx((a.x+b.x)/2), my=W2Sy((a.y+b.y)/2);
      const e=el('circle',{cx:mx,cy:my,r:er,fill:'#fff',stroke:'#b35a2e','stroke-width':1.5,'stroke-dasharray':'2 2',cursor:'copy','data-hx':mx,'data-hy':my});
      e.dataset.bedge=i; bg.appendChild(e);
      const t=el('text',{x:mx,y:my+er*0.55,'text-anchor':'middle','font-size':er*1.4,fill:'#b35a2e','font-weight':'700','pointer-events':'none'}); t.textContent='+'; bg.appendChild(t);
    }
    pts.forEach((p,i)=>{
      const cx=W2Sx(p.x), cy=W2Sy(p.y);
      const e=el('circle',{cx,cy,r:vr,fill:'#b35a2e',stroke:'#fff','stroke-width':2,cursor:'move','data-hx':cx,'data-hy':cy});
      e.dataset.bvert=i; bg.appendChild(e);
    });
  }
  /* bağlam ipucu — alt-orta güvenli bölge (üst araç çubuğuyla çakışmaz). Ekle/sil: SAĞ TIK menüsü. */
  const hint=el('text',{x:vp.width/2,y:vp.height-14,'text-anchor':'middle','font-size':12,fill:'#9c8e76','font-weight':'600'});
  hint.textContent = regs.length
    ? 'Taşı/boyutlandır: tutamaçlar · ekle/sil: öğeye ya da odaya SAĞ TIKLAYIN'
    : 'Çekirdek öğesi yok — bir odaya SAĞ TIKLAYIP “Yapı elemanı ekle” deyin; sınırı köşelerinden düzenleyin.';
  sg.appendChild(hint);
}
/* dış (daire sınırı) duvarının tüm doğrusal parçaları: aynı yön + aynı konum +
   aynı daire-ikilisi → birlikte taşınır (apartman sınırı bütün olarak hareket eder) */
function boundaryGroup(run){
  if(!run.ext || !plan.wallRuns) return [run];
  const uo=id=>{ for(let k=0;k<plan.unitObjs.length;k++) if(plan.unitObjs[k].rooms.some(g=>g.id===id)) return k; return 'h'; };
  const key=r=>r.horiz+'|'+[uo(r.a),uo(r.b)].sort().join('-');
  const k0=key(run);
  return plan.wallRuns.filter(r=>r.horiz===run.horiz && r.pos===run.pos && key(r)===k0);
}
function dragWallTo(sx,sy){
  const p=plan, run=dragging.run;
  const want = run.horiz? Math.round((S2Wy(sy)-p.minY)/M) : Math.round((S2Wx(sx)-p.minX)/M);
  // varsayılan: yalnız sürüklenen parça taşınır → daire sınırında parça parça esneklik
  // (sınırda jog/girinti açılabilir). Shift'e basılı tutulursa aynı hizadaki tüm parçalar
  // birlikte taşınır (apartman sınırını düz tutmak için eski davranış).
  const group = dragging.groupMove? boundaryGroup(run) : [run];
  let moved=false, merged=false;
  group.forEach(rn=>{ let guard=0;
    while(rn.pos!==want && guard++<160){
      const res=moveWallStep(rn, want>rn.pos?1:-1);
      if(!res) break;
      moved=true; if(res==='merged'){ merged=true; break; } // birleşme: bu parça tüketildi
    } });
  if(!moved) return;
  p.regions.forEach(g=>calcRegionMetrics(g, p.cols, p.minX, p.minY));
  p.wallRuns=computeWallRuns();
  const nr=p.wallRuns.find(rn=>rn.a===run.a&&rn.b===run.b&&rn.horiz===run.horiz&&rn.pos===run.pos&&rn.hi>run.lo&&rn.lo<run.hi);
  dragging.run=nr||run;
  hoverWall=nr||null;
  runChecks(); buildUnitTable(); render();   // canlı yeniden denetim
}
