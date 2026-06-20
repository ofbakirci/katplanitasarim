'use strict';
/* ================= odaklama ve vurgulama ================= */
let highlightId=null, hlTimer=null;
function regBox(g){
  let r0=1e9,r1=-1e9,c0=1e9,c1=-1e9;
  g.cells.forEach(i=>{const r=(i/plan.cols)|0,c=i%plan.cols; r0=Math.min(r0,r);r1=Math.max(r1,r);c0=Math.min(c0,c);c1=Math.max(c1,c);});
  return [plan.minX+c0*M, plan.minY+r0*M, plan.minX+(c1+1)*M, plan.minY+(r1+1)*M];
}
function focusBox(x0,y0,x1,y1,id){
  const r=svg.getBoundingClientRect(), w=x1-x0, h=y1-y0;
  pxPerM=Math.min(60, Math.max(6, Math.min(r.width/(w+5), r.height/(h+5))));
  panX=(r.width-w*pxPerM)/2 - x0*pxPerM;
  panY=(r.height-h*pxPerM)/2 - y0*pxPerM;
  highlightId = id==null? null : id;
  clearTimeout(hlTimer);
  if(id!=null) hlTimer=setTimeout(()=>{ highlightId=null; render(); }, 3000);
  render();
}
function focusRegion(id){
  const g=plan&&plan.regions[id]; if(!g||!g.cells.length) return;
  const b=regBox(g); focusBox(b[0],b[1],b[2],b[3],id);
}
function focusUnit(k){
  const u=plan&&plan.unitObjs[k]; if(!u) return;
  let bx=[1e9,1e9,-1e9,-1e9];
  u.rooms.forEach(g=>{ if(!g.cells.length) return; const b=regBox(g);
    bx=[Math.min(bx[0],b[0]),Math.min(bx[1],b[1]),Math.max(bx[2],b[2]),Math.max(bx[3],b[3])]; });
  if(bx[0]<1e9) focusBox(bx[0],bx[1],bx[2],bx[3],null);
}

/* ================= yüzen daire tablosu ================= */
function buildUnitTable(){
  const t=document.getElementById('unitTable'), body=document.getElementById('utBody');
  if(!plan||!plan.unitObjs.length){ t.style.display='none'; return; }
  t.style.display='flex';
  body.innerHTML='';
  plan.unitObjs.forEach((u,k)=>{
    if(!u.rooms.some(g=>g.cells.length)) return;   // silinmiş (komşuya katılmış) daire
    const tot=u.rooms.reduce((s,g)=>s+g.area,0);
    const d=document.createElement('div'); d.className='utUnit';
    let rows=u.rooms.filter(g=>g.cells.length).map(g=>
      `<tr data-reg="${g.id}"><td>${escapeHtml(g.name)}</td><td class="num">${fmt(g.bw)} × ${fmt(g.bh)}</td><td class="num">${fmt(g.area)} m²</td></tr>`).join('');
    const myBalks=balconies.filter(b=>balkUnit(b)===k);
    let balkTot=0;
    myBalks.forEach(b=>{ balkTot+=balkArea(b);
      rows+=`<tr><td>BALKON (açık)</td><td class="num">${fmt(b.t1-b.t0)} × ${fmt(b.depth)}</td><td class="num">${fmt(balkArea(b))} m²</td></tr>`; });
    d.innerHTML=`<h3 data-unit="${k}">D${k+1} · ${escapeHtml(unitTag(u.spec))} · ${fmt(tot)} m²${balkTot?` + ${fmt(balkTot)} m² balkon`:''}</h3><table class="utT">${rows}</table>`;
    body.appendChild(d);
  });
  body.querySelectorAll('tr[data-reg]').forEach(tr=>tr.onclick=()=>focusRegion(+tr.dataset.reg));
  body.querySelectorAll('h3[data-unit]').forEach(h=>h.onclick=()=>focusUnit(+h.dataset.unit));
}
(function(){ /* tabloyu sürükleme + daraltma */
  const t=document.getElementById('unitTable'), h=document.getElementById('utHead');
  let drag=null;
  h.addEventListener('pointerdown',e=>{ if(e.target.id==='utToggle') return;
    const r=t.getBoundingClientRect(), pr=t.parentElement.getBoundingClientRect();
    drag={dx:e.clientX-r.left, dy:e.clientY-r.top, pr}; t.style.right='auto'; e.preventDefault(); });
  window.addEventListener('pointermove',e=>{ if(!drag) return;
    t.style.left=Math.max(0, e.clientX-drag.pr.left-drag.dx)+'px';
    t.style.top=Math.max(0, e.clientY-drag.pr.top-drag.dy)+'px'; });
  window.addEventListener('pointerup',()=>drag=null);
  window.addEventListener('pointercancel',()=>drag=null);
  document.getElementById('utToggle').addEventListener('click',()=>{
    const b=document.getElementById('utBody');
    const off=b.style.display==='none';
    b.style.display=off?'block':'none';
    document.getElementById('utToggle').textContent=off?'–':'+'; });
})();
/* ================= çizim (render) ================= */
/* kenar ölçü etiketleri (her iki poligon için ortak) */
function polyDims(g, arr, isClosed, color){
  const cen=centroidOf(arr);
  const segs=[...arr.map((p,i)=>[p,arr[(i+1)%arr.length]])];
  if(!isClosed) segs.pop();
  segs.forEach(([a,b])=>{
    const L=Math.hypot(b.x-a.x,b.y-a.y); if(L<0.01)return;
    const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
    let nx=-(b.y-a.y)/L, ny=(b.x-a.x)/L;
    if((mx+nx-cen.x)**2+(my+ny-cen.y)**2 < (mx-nx-cen.x)**2+(my-ny-cen.y)**2){nx=-nx;ny=-ny;}
    const t=el('text',{x:W2Sx(mx+nx*0.8),y:W2Sy(my+ny*0.8),'text-anchor':'middle','dominant-baseline':'middle',
      'font-size':Math.max(10,Math.min(13,pxPerM*0.8)),fill:color,'font-weight':'600'});
    t.textContent=fmt(L)+' m'; g.appendChild(t);
  });
}
/* bahçe etiketi: parsel içinde ama bina dışında bir nokta */
function gardenLabelPos(){
  const cen=centroidOf(parcelPts), cand=[];
  for(let i=0;i<parcelPts.length;i++){
    const A=parcelPts[i],B=parcelPts[(i+1)%parcelPts.length];
    const mx=(A.x+B.x)/2,my=(A.y+B.y)/2;
    const dx=cen.x-mx, dy=cen.y-my, L=Math.hypot(dx,dy)||1;
    for(const k of [1.4, 2.6]) cand.push({x:mx+dx/L*k, y:my+dy/L*k});
  }
  return cand.find(p=>pip(p.x,p.y,parcelPts)&&(!closed||!pip(p.x,p.y,pts)))||null;
}
function render(){
  svg.innerHTML='';
  const r=exportView||svg.getBoundingClientRect();
  /* ızgara */
  const g0=el('g',{}); svg.appendChild(g0);
  const step=M*pxPerM, big=5*pxPerM;
  if(step>5){
    const x0=panX%step, y0=panY%step;
    for(let x=x0;x<r.width;x+=step) g0.appendChild(el('line',{x1:x,y1:0,x2:x,y2:r.height,stroke:'#eae5d9','stroke-width':1}));
    for(let y=y0;y<r.height;y+=step) g0.appendChild(el('line',{x1:0,y1:y,x2:r.width,y2:y,stroke:'#eae5d9','stroke-width':1}));
  }
  const X0=panX%big, Y0=panY%big;
  for(let x=X0;x<r.width;x+=big) g0.appendChild(el('line',{x1:x,y1:0,x2:x,y2:r.height,stroke:'#ddd5c4','stroke-width':1}));
  for(let y=Y0;y<r.height;y+=big) g0.appendChild(el('line',{x1:0,y1:y,x2:r.width,y2:y,stroke:'#ddd5c4','stroke-width':1}));

  /* parsel (bahçe) — plan katmanlarının altında */
  if(parcelPts.length){
    const g=el('g',{}); svg.appendChild(g);
    let d='M'+parcelPts.map(p=>W2Sx(p.x)+','+W2Sy(p.y)).join('L');
    if(parcelClosed) d+='Z';
    g.appendChild(el('path',{d,fill:parcelClosed?'rgba(106,153,78,.13)':'none',stroke:'#4a7c4a','stroke-width':2,'stroke-dasharray':'9 5','stroke-linejoin':'miter'}));
    if(!parcelClosed||mode==='parcel') parcelPts.forEach(p=>g.appendChild(el('circle',{cx:W2Sx(p.x),cy:W2Sy(p.y),r:4,fill:'#fff',stroke:'#4a7c4a','stroke-width':2})));
    polyDims(g, parcelPts, parcelClosed, '#4a7c4a');
    if(parcelClosed){
      const lbl=gardenLabelPos();
      if(lbl){ const t=el('text',{x:W2Sx(lbl.x),y:W2Sy(lbl.y),'text-anchor':'middle','font-size':Math.max(10,Math.min(14,pxPerM*0.9)),fill:'#4a7c4a','font-weight':'700'});
        t.textContent='BAHÇE · '+fmt(Math.max(0,shoelace(parcelPts)-(closed?shoelace(pts):0)))+' m²'; g.appendChild(t); }
    }
  }

  if(plan){ renderPlan(); }
  /* bina poligonu */
  if(pts.length){
    const g=el('g',{}); svg.appendChild(g);
    let d='M'+pts.map(p=>W2Sx(p.x)+','+W2Sy(p.y)).join('L');
    if(closed) d+='Z';
    g.appendChild(el('path',{d,fill:closed&&!plan?'rgba(179,90,46,.07)':'none',stroke:'#2b2620','stroke-width':plan?Math.max(3,pxPerM*0.22):2.5,'stroke-linejoin':'miter'}));
    if(!plan||!closed) pts.forEach(p=>g.appendChild(el('circle',{cx:W2Sx(p.x),cy:W2Sy(p.y),r:4,fill:'#fff',stroke:'#b35a2e','stroke-width':2})));
    polyDims(g, pts, closed, '#6b5e4d');
  }

  /* balkonlar */
  if(closed && (balconies.length || (mode==='balkon'&&hoverBalk&&hoverBalk.ghost))){
    const g=el('g',{}); svg.appendChild(g);
    const wallW=plan?Math.max(3,pxPerM*0.22):2.5;
    const drawB=(b,ghost)=>{
      const q=balkQuad(b);
      g.appendChild(el('path',{d:'M'+q.map(p=>W2Sx(p.x)+','+W2Sy(p.y)).join('L')+'Z',
        fill:ghost?'rgba(179,90,46,.15)':'rgba(213,229,241,.9)',stroke:'#2b2620',
        'stroke-width':ghost?1.2:1.5,'stroke-dasharray':ghost?'5 4':'none'}));
      if(ghost) return;
      /* korkuluk çizgisi (dış kenara paralel) */
      const {A,u,n}=balkBase(b.ei), ko=b.depth-0.12;
      g.appendChild(el('line',{x1:W2Sx(A.x+u.x*b.t0+n.x*ko),y1:W2Sy(A.y+u.y*b.t0+n.y*ko),
        x2:W2Sx(A.x+u.x*b.t1+n.x*ko),y2:W2Sy(A.y+u.y*b.t1+n.y*ko),stroke:'#2b2620','stroke-width':0.8}));
      /* kapı boşluğu: iç kenarın ortası */
      const tm=(b.t0+b.t1)/2;
      g.appendChild(el('line',{x1:W2Sx(A.x+u.x*(tm-0.45)),y1:W2Sy(A.y+u.y*(tm-0.45)),
        x2:W2Sx(A.x+u.x*(tm+0.45)),y2:W2Sy(A.y+u.y*(tm+0.45)),stroke:'#faf8f3','stroke-width':wallW+1}));
      /* etiket */
      if(pxPerM>7){
        const cx=(q[0].x+q[2].x)/2, cy=(q[0].y+q[2].y)/2;
        const fs=Math.max(8,Math.min(11,pxPerM*0.55));
        const t=el('text',{x:W2Sx(cx),y:W2Sy(cy)-fs*0.35,'text-anchor':'middle','dominant-baseline':'middle',
          'font-size':fs,fill:'#3f5b73','font-weight':'600'});
        t.textContent='BALKON '+fmt(balkArea(b))+' m²'; g.appendChild(t);
        const t2=el('text',{x:W2Sx(cx),y:W2Sy(cy)+fs*0.75,'text-anchor':'middle','dominant-baseline':'middle',
          'font-size':fs*0.9,fill:'#3f5b73'});
        t2.textContent=fmt(b.t1-b.t0)+' × '+fmt(b.depth)+' m'; g.appendChild(t2);
      }
      /* tutamaçlar */
      if(mode==='balkon'){
        const mid=(P,Q)=>({x:(P.x+Q.x)/2,y:(P.y+Q.y)/2});
        for(const h of [mid(q[2],q[3]),mid(q[0],q[3]),mid(q[1],q[2])])
          g.appendChild(el('rect',{x:W2Sx(h.x)-4,y:W2Sy(h.y)-4,width:8,height:8,fill:'#fff',stroke:'#b35a2e','stroke-width':2}));
      }
    };
    balconies.forEach(b=>drawB(b,false));
    if(mode==='balkon'&&hoverBalk&&hoverBalk.ghost) drawB(hoverBalk.ghost,true);
  }

  /* aktif poligon çizimi (bina veya parsel) */
  const act=activePoly();
  if(hoverP && !act.cl && (mode==='draw'||mode==='parcel')){
    const g=el('g',{}); svg.appendChild(g);
    const col=mode==='parcel'?'#4a7c4a':'#b35a2e';
    const l=act.arr[act.arr.length-1];
    if(l){ g.appendChild(el('line',{x1:W2Sx(l.x),y1:W2Sy(l.y),x2:W2Sx(hoverP.x),y2:W2Sy(hoverP.y),stroke:col,'stroke-width':2,'stroke-dasharray':'6 4'}));
      const L=Math.hypot(hoverP.x-l.x,hoverP.y-l.y);
      const t=el('text',{x:W2Sx((l.x+hoverP.x)/2),y:W2Sy((l.y+hoverP.y)/2)-8,'text-anchor':'middle','font-size':12,fill:col,'font-weight':'700'});
      t.textContent=fmt(L)+' m'; g.appendChild(t); }
    g.appendChild(el('circle',{cx:W2Sx(hoverP.x),cy:W2Sy(hoverP.y),r:5,fill:hoverP.closing?'#2e7d4f':col,opacity:.8}));
  }
  updateZoomUI();
}

function renderPlan(){
  const p=plan, g=el('g',{}); svg.appendChild(g);
  const cs=M*pxPerM;
  /* sınır poligonuna kırpma: ızgara basamakları arsa sınırı dışına taşmasın (eğik kenarlar) */
  const defs=el('defs',{}); g.appendChild(defs);
  const cp=el('clipPath',{id:'planClip'}); defs.appendChild(cp);
  cp.appendChild(el('path',{d:'M'+pts.map(q=>W2Sx(q.x)+','+W2Sy(q.y)).join('L')+'Z'}));
  const gc=el('g',{'clip-path':'url(#planClip)'}); g.appendChild(gc);
  const insideAt=(r,c)=>r>=0&&c>=0&&r<p.rows&&c<p.cols&&p.inside[r*p.cols+c];
  /* hücre dolguları (+sınır hücreleri dışarı taşar: eğik kenarla ızgara arasındaki
     şerit komşu odanın rengiyle dolar; kırpma poligonda keser) */
  p.regions.forEach(reg=>{
    const fill=COLORS[reg.type]||'#fff';
    const dash=reg.name==='ASANSÖR YERİ';
    reg.cells.forEach(i=>{
      const r=(i/p.cols)|0,c=i%p.cols;
      gc.appendChild(el('rect',{x:W2Sx(p.minX+c*M),y:W2Sy(p.minY+r*M),width:cs+0.5,height:cs+0.5,fill,opacity:dash?0.45:1}));
      for(const[dr,dc]of[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]])
        if(!insideAt(r+dr,c+dc))
          gc.appendChild(el('rect',{x:W2Sx(p.minX+(c+dc)*M),y:W2Sy(p.minY+(r+dr)*M),width:cs+0.5,height:cs+0.5,fill,opacity:dash?0.45:1}));
    });
  });
  /* duvarlar */
  const id=(r,c)=>(r<0||c<0||r>=p.rows||c>=p.cols)?-9:(p.inside[r*p.cols+c]?p.cm[r*p.cols+c]:-9);
  /* nokta poligon kenarı üzerinde mi? (eğik kenarda ızgara dış duvarı çizilmez; sınır çizgisi duvardır) */
  const onEdge=(x,y)=>{ for(let i=0;i<pts.length;i++){ const A=pts[i],B=pts[(i+1)%pts.length];
    if(Math.abs((B.x-A.x)*(y-A.y)-(B.y-A.y)*(x-A.x))>1e-6) continue;
    const dot=(x-A.x)*(B.x-A.x)+(y-A.y)*(B.y-A.y), l2=(B.x-A.x)**2+(B.y-A.y)**2;
    if(dot>=-1e-9&&dot<=l2+1e-9) return true; } return false; };
  const walls=el('g',{stroke:'#2b2620','stroke-linecap':'square'}); gc.appendChild(walls);
  for(let r=0;r<p.rows;r++)for(let c=0;c<p.cols;c++){
    const a=id(r,c); if(a===-9) continue;
    const x=p.minX+c*M, y=p.minY+r*M;
    const draw=(b,x1,y1,x2,y2)=>{ if(a!==b){
      const outer=(b===-9);
      if(outer && !(onEdge(x1,y1)&&onEdge(x2,y2))) return;
      walls.appendChild(el('line',{x1:W2Sx(x1),y1:W2Sy(y1),x2:W2Sx(x2),y2:W2Sy(y2),
        'stroke-width':outer?Math.max(2.5,pxPerM*0.22):Math.max(1,pxPerM*0.07)})); } };
    draw(id(r,c+1), x+M,y, x+M,y+M);
    draw(id(r+1,c), x,y+M, x+M,y+M);
    if(c===0||id(r,c-1)===-9) draw(-9, x,y, x,y+M);
    if(r===0||id(r-1,c)===-9) draw(-9, x,y, x+M,y);
  }
  /* kapılar (computeDoors: elle ayar destekli) + kapı modunda tutamaçlar */
  computeDoors().forEach(dr=>{
    if(dr.status!=='ok') return;
    const e=dr.e, hov=mode==='door' && hoverDoor && hoverDoor.key===dr.key;
    if(dr.kind==='unit'){
      const w=Math.max(2,pxPerM*0.2);
      let bx,by;
      if(e.h){ g.appendChild(el('line',{x1:W2Sx(e.x-0.05),y1:W2Sy(e.y),x2:W2Sx(e.x+0.95),y2:W2Sy(e.y),stroke:'#faf8f3','stroke-width':w}));
        bx=W2Sx(e.x+0.45); by=W2Sy(e.y); }
      else { g.appendChild(el('line',{x1:W2Sx(e.x),y1:W2Sy(e.y-0.05),x2:W2Sx(e.x),y2:W2Sy(e.y+0.95),stroke:'#faf8f3','stroke-width':w}));
        bx=W2Sx(e.x); by=W2Sy(e.y+0.45); }
      const fs2=Math.max(8.5,Math.min(13,pxPerM*0.5));
      g.appendChild(el('circle',{cx:bx,cy:by,r:fs2*1.05,fill:'#b35a2e',stroke:'#fff','stroke-width':1.5}));
      const tb=el('text',{x:bx,y:by+fs2*0.35,'text-anchor':'middle','font-size':fs2,fill:'#fff','font-weight':'700'});
      tb.textContent='D'+(dr.k+1); g.appendChild(tb);
      if(mode==='door') /* rozet etrafında halka tutamaç */
        g.appendChild(el('circle',{cx:bx,cy:by,r:fs2*1.05+3,fill:'none',stroke:'#b35a2e',
          'stroke-width':hov?2.5:1.5,'stroke-dasharray':hov?'none':'3 3'}));
    } else {
      const w=Math.max(1.5,pxPerM*0.12);
      if(e.h) g.appendChild(el('line',{x1:W2Sx(e.x+0.05),y1:W2Sy(e.y),x2:W2Sx(e.x+0.85),y2:W2Sy(e.y),stroke:'#faf8f3','stroke-width':w}));
      else    g.appendChild(el('line',{x1:W2Sx(e.x),y1:W2Sy(e.y+0.05),x2:W2Sx(e.x),y2:W2Sy(e.y+0.85),stroke:'#faf8f3','stroke-width':w}));
      if(mode==='door'){ /* kare tutamaç */
        const m2=doorMid(e);
        g.appendChild(el('rect',{x:m2.x-4.5,y:m2.y-4.5,width:9,height:9,
          fill:hov?'#b35a2e':'#fff',stroke:'#b35a2e','stroke-width':2}));
      }
    }
  });
  /* duvar uzunlukları: yakınlaşınca hepsi, imleç bir odanın üzerindeyken o oda her ölçekte.
     Aynı duvarı iki oda da etiketliyorsa teke iner ve duvarın ÜSTÜNE (haleyle) yazılır;
     hover'da yalnız o odanın ölçüleri belirgin kalır, diğerleri soluklaşır. */
  if(pxPerM>=22 || hoverRoomId!=null){
    const fsW=Math.max(8.5,Math.min(12,Math.max(pxPerM,22)*0.32));
    const allRuns=[]; // {h, pos, lo, hi, d, owner}
    p.regions.forEach(reg=>{
      if(!reg.cells.length||reg.type==='koridor') return;
      const set=new Set(reg.cells);
      const segH=new Map(), segV=new Map();
      reg.cells.forEach(i=>{ const r=(i/p.cols)|0, c=i%p.cols;
        const inn=(rr,cc2)=>{ if(rr<0||cc2<0||rr>=p.rows||cc2>=p.cols) return false; return set.has(rr*p.cols+cc2); };
        if(!inn(r-1,c)){ const k=r+'_1';   (segH.get(k)||segH.set(k,{y:r,d:1,cs:[]}).get(k)).cs.push(c); }
        if(!inn(r+1,c)){ const k=(r+1)+'_-1'; (segH.get(k)||segH.set(k,{y:r+1,d:-1,cs:[]}).get(k)).cs.push(c); }
        if(!inn(r,c-1)){ const k=c+'_1';   (segV.get(k)||segV.set(k,{x:c,d:1,cs:[]}).get(k)).cs.push(r); }
        if(!inn(r,c+1)){ const k=(c+1)+'_-1'; (segV.get(k)||segV.set(k,{x:c+1,d:-1,cs:[]}).get(k)).cs.push(r); }
      });
      const collect=(map,h)=>map.forEach(e=>{ e.cs.sort((a,b)=>a-b);
        let s=e.cs[0], prev=e.cs[0];
        for(let j=1;j<=e.cs.length;j++){
          if(j===e.cs.length||e.cs[j]!==prev+1){ allRuns.push({h,pos:h?e.y:e.x,lo:s,hi:prev+1,d:e.d,owner:reg.id}); if(j<e.cs.length){s=e.cs[j];prev=e.cs[j];} }
          else prev=e.cs[j]; } });
      collect(segH,1); collect(segV,0);
    });
    /* tekilleştirme: birebir aynı parça iki taraftan etiketleniyorsa tek etiket, duvar üstünde */
    const byKey=new Map();
    allRuns.forEach(rn=>{
      const k=rn.h+'_'+rn.pos+'_'+rn.lo+'_'+rn.hi;
      const ex=byKey.get(k);
      if(ex){ ex.owners.push(rn.owner); ex.d=0; }
      else byKey.set(k,{h:rn.h,pos:rn.pos,lo:rn.lo,hi:rn.hi,d:rn.d,owners:[rn.owner]});
    });
    byKey.forEach(rn=>{
      const L=(rn.hi-rn.lo)*M; if(L<1.5) return;
      const hov = hoverRoomId!=null && rn.owners.includes(hoverRoomId);
      if(pxPerM<22 && !hov) return;        // uzaktayken yalnız hover'lı oda
      const dim = hoverRoomId!=null && !hov;
      let tx,ty;
      if(rn.h){ tx=p.minX+((rn.lo+rn.hi)/2)*M; ty=p.minY+rn.pos*M+rn.d*0.32; }
      else { tx=p.minX+rn.pos*M+rn.d*0.55; ty=p.minY+((rn.lo+rn.hi)/2)*M; }
      const t=el('text',{x:W2Sx(tx),y:W2Sy(ty)+fsW*0.35,'text-anchor':'middle','font-size':fsW,
        fill:hov?'#2b2620':'#9c8e76','font-weight':hov?'700':'600',opacity:dim?0.15:1,
        stroke:'#faf8f3','stroke-width':3,'paint-order':'stroke','stroke-linejoin':'round'});
      t.textContent=fmt(L); g.appendChild(t);
    });
  }
  /* etiketler */
  p.regions.forEach(reg=>{
    if(!reg.cells.length||reg.area<2.0) return; // kırıntı bölgelere etiket yazma
    const fs=Math.max(8,Math.min(13,pxPerM*0.62));
    const t=el('text',{x:W2Sx(reg.cx),y:W2Sy(reg.cy)-fs*0.25,'text-anchor':'middle','font-size':fs,'font-weight':'700',fill:'#2b2620'});
    t.textContent=reg.name; g.appendChild(t);
    if(reg.area>=2){
      const t2=el('text',{x:W2Sx(reg.cx),y:W2Sy(reg.cy)+fs*0.95,'text-anchor':'middle','font-size':fs*0.9,fill:'#6b5e4d'});
      t2.textContent=fmt(reg.area)+' m²'; g.appendChild(t2); }
  });
  /* vurgulanan bölge */
  if(highlightId!=null && p.regions[highlightId] && p.regions[highlightId].cells.length){
    const hg=p.regions[highlightId];
    hg.cells.forEach(i=>{ const r=(i/p.cols)|0, c=i%p.cols;
      g.appendChild(el('rect',{x:W2Sx(p.minX+c*M),y:W2Sy(p.minY+r*M),width:cs+0.5,height:cs+0.5,fill:'rgba(179,90,46,.20)'})); });
    hg.cells.forEach(i=>{ const r=(i/p.cols)|0, c=i%p.cols;
      const x=p.minX+c*M, y=p.minY+r*M;
      const nb=(rr,cc2)=>{ if(rr<0||cc2<0||rr>=p.rows||cc2>=p.cols) return -1; const j=rr*p.cols+cc2; return p.inside[j]?p.cm[j]:-1; };
      const hl=(x1,y1,x2,y2)=>g.appendChild(el('line',{x1:W2Sx(x1),y1:W2Sy(y1),x2:W2Sx(x2),y2:W2Sy(y2),stroke:'#b35a2e','stroke-width':4,'stroke-linecap':'round'}));
      if(nb(r-1,c)!==hg.id) hl(x,y,x+M,y);
      if(nb(r+1,c)!==hg.id) hl(x,y+M,x+M,y+M);
      if(nb(r,c-1)!==hg.id) hl(x,y,x,y+M);
      if(nb(r,c+1)!==hg.id) hl(x+M,y,x+M,y+M);
    });
  }
  /* ayırıcı tutamaçları (bölge başına, hole paralel) — kapı/yapı modunda gizli */
  if(!p.villa && p.zoneUI && customCutsZ && mode!=='door' && mode!=='struct'){
    p.zoneUI.forEach(zu=>{
      (customCutsZ[zu.zi]||[]).forEach((v,idx)=>{
        const cx= zu.horiz? W2Sx(v) : W2Sx(zu.perp);
        const cy= zu.horiz? W2Sy(zu.perp) : W2Sy(v);
        const c=el('circle',{cx,cy,r:9,fill:'#b35a2e',stroke:'#fff','stroke-width':2.5,cursor:zu.horiz?'ew-resize':'ns-resize'});
        c.dataset.cut=JSON.stringify({zi:zu.zi,idx,horiz:zu.horiz,min:zu.min,max:zu.max});
        g.appendChild(c);
      });
    });
  }
  /* oda duvarı tutamaçları (kare) + vurgulanan duvar */
  if(p.wallRuns){
    const act = dragging&&dragging.type==='wall'? dragging.run
              : (hoverWall&&p.wallRuns.includes(hoverWall)? hoverWall : null);
    const EXTC='#2f6f8f'; // dış (daire sınırı / hol) duvar rengi — iç duvar turuncu
    if(act){
      const s=wallSeg(act);
      g.appendChild(el('line',{x1:W2Sx(s.x1),y1:W2Sy(s.y1),x2:W2Sx(s.x2),y2:W2Sy(s.y2),
        stroke:act.ext?EXTC:'#b35a2e','stroke-width':5,'stroke-linecap':'round',opacity:.85}));
    }
    if(pxPerM>=9 && mode!=='door' && mode!=='struct'){
      p.wallRuns.forEach(rn=>{
        const mx = rn.horiz? p.minX+((rn.lo+rn.hi)/2)*M : p.minX+rn.pos*M;
        const my = rn.horiz? p.minY+rn.pos*M : p.minY+((rn.lo+rn.hi)/2)*M;
        const hs=rn.ext?5.2:4.5, col=rn.ext?EXTC:'#b35a2e';
        g.appendChild(el(rn.ext?'circle':'rect', rn.ext
          ? {cx:W2Sx(mx),cy:W2Sy(my),r:hs,fill:rn===act?col:'#fff',stroke:col,'stroke-width':1.8,cursor:rn.horiz?'ns-resize':'ew-resize'}
          : {x:W2Sx(mx)-hs,y:W2Sy(my)-hs,width:hs*2,height:hs*2,rx:1.5,fill:rn===act?col:'#fff',stroke:col,'stroke-width':1.6,cursor:rn.horiz?'ns-resize':'ew-resize'}));
      });
    }
  }
  if(mode==='struct') renderStructLayer();
}
function hitCutHandle(sx,sy){
  const hs=svg.querySelectorAll('circle[data-cut]');
  for(const h of hs){
    const dx=sx-+h.getAttribute('cx'), dy=sy-+h.getAttribute('cy');
    if(dx*dx+dy*dy<=225*HITSC*HITSC){
      const info=JSON.parse(h.dataset.cut);
      if(!customCutsZ||!customCutsZ[info.zi]) return null;
      return {type:'cut', arr:customCutsZ[info.zi], idx:info.idx, horiz:info.horiz, min:info.min, max:info.max};
    }
  }
  return null;
}
