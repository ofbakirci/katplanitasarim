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
    const mvt=el('text',{x:mC,y:mR+fs*0.35,'text-anchor':'middle','font-size':fs,fill:'#fff','font-weight':'700','pointer-events':'none'});
    mvt.textContent='✛'; sg.appendChild(mvt);
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
  if(!regs.length){
    const t=el('text',{x:vp.width/2,y:36,'text-anchor':'middle','font-size':13,fill:'#9c8e76','font-weight':'600'});
    t.textContent='Çekirdek öğesi yok — bina sınırını köşelerinden düzenleyebilir, + ile yeni köşe ekleyebilirsiniz.'; svg.appendChild(t);
  }
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
  const group = boundaryGroup(run);
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
