'use strict';
/* ================= çizim etkileşimi ================= */
function activePoly(){ return mode==='parcel'? {arr:parcelPts, cl:parcelClosed} : {arr:pts, cl:closed}; }
function snapPoint(sx,sy){
  let x=snapG(S2Wx(sx)), y=snapG(S2Wy(sy));
  const A=activePoly();
  if((mode==='draw'||mode==='parcel') && A.arr.length && !A.cl){
    /* 15° açı kilidi: kenar açısı 15°'nin katına, uzunluk 0,5 m ızgaraya oturur */
    const l=A.arr[A.arr.length-1], wx=S2Wx(sx), wy=S2Wy(sy);
    const d=Math.hypot(wx-l.x, wy-l.y);
    if(d>1e-9){
      const step=Math.PI/12;
      const a=Math.round(Math.atan2(wy-l.y, wx-l.x)/step)*step;
      const L=Math.max(M, snapG(d));
      x=Math.round((l.x+Math.cos(a)*L)*1000)/1000;
      y=Math.round((l.y+Math.sin(a)*L)*1000)/1000;
    }
    if(A.arr.length>=3){ const f=A.arr[0];
      if(Math.hypot(x-f.x,y-f.y) < 0.7){ return {x:f.x,y:f.y,closing:true}; } }
  }
  return {x,y};
}
/* ================= balkon geometrisi ================= */
function distSeg(px,py,ax,ay,bx,by){ const dx=bx-ax,dy=by-ay,l2=dx*dx+dy*dy;
  let t=l2?((px-ax)*dx+(py-ay)*dy)/l2:0; t=Math.max(0,Math.min(1,t));
  return Math.hypot(px-(ax+dx*t), py-(ay+dy*t)); }
/* kenar tabanı: pts[ei]→pts[ei+1] birim vektörü u, DIŞA bakan normal n */
function balkBase(ei){
  const A=pts[ei], B=pts[(ei+1)%pts.length];
  const L=Math.hypot(B.x-A.x,B.y-A.y);
  const u={x:(B.x-A.x)/L, y:(B.y-A.y)/L};
  let n={x:-u.y, y:u.x};
  const mx=(A.x+B.x)/2, my=(A.y+B.y)/2;
  if(pip(mx+n.x*0.05, my+n.y*0.05, pts)){ n={x:u.y,y:-u.x}; }
  return {A,u,n,L};
}
function balkQuad(b){
  const {A,u,n}=balkBase(b.ei);
  const P=(t,d)=>({x:A.x+u.x*t+n.x*d, y:A.y+u.y*t+n.y*d});
  return [P(b.t0,0), P(b.t1,0), P(b.t1,b.depth), P(b.t0,b.depth)];
}
const balkArea=b=>(b.t1-b.t0)*b.depth;
/* balkonun ait olduğu daire: iç kenarın hemen içindeki hücre */
function balkUnit(b){
  if(!plan) return -1;
  const {A,u,n}=balkBase(b.ei);
  const t=(b.t0+b.t1)/2;
  const x=A.x+u.x*t-n.x*0.3, y=A.y+u.y*t-n.y*0.3;
  const c=Math.floor((x-plan.minX)/M), r=Math.floor((y-plan.minY)/M);
  if(r<0||c<0||r>=plan.rows||c>=plan.cols) return -1;
  const j=r*plan.cols+c;
  if(!plan.inside[j]||plan.cm[j]<0) return -1;
  return plan.regions[plan.cm[j]].unit;
}
/* imleç altındaki balkon tutamağı: dış kenar=derinlik, uçlar=uzunluk, içi=taşı/sil */
function hitBalk(wx,wy){
  for(let i=balconies.length-1;i>=0;i--){
    const b=balconies[i], q=balkQuad(b), tol=Math.max(0.25, 6*HITSC/pxPerM);
    if(distSeg(wx,wy,q[3].x,q[3].y,q[2].x,q[2].y)<tol) return {b,i,part:'depth'};
    if(distSeg(wx,wy,q[0].x,q[0].y,q[3].x,q[3].y)<tol) return {b,i,part:'t0'};
    if(distSeg(wx,wy,q[1].x,q[1].y,q[2].x,q[2].y)<tol) return {b,i,part:'t1'};
    if(pip(wx,wy,q)) return {b,i,part:'body'};
  }
  return null;
}
/* tıklanan noktaya en yakın dış kenara yeni balkon önerisi */
function ghostBalk(wx,wy){
  if(!closed) return null;
  let best=null;
  for(let ei=0;ei<pts.length;ei++){
    const A=pts[ei], B=pts[(ei+1)%pts.length];
    const d=distSeg(wx,wy,A.x,A.y,B.x,B.y);
    if(d<1.2 && (!best||d<best.d)){
      const {u,L}=balkBase(ei);
      let t=(wx-A.x)*u.x+(wy-A.y)*u.y;
      const half=Math.min(1.5, L/2);
      let t0=snapG(Math.max(0, Math.min(t-half, L-2*half))), t1=Math.min(L, t0+2*half);
      if(t1-t0>=1) best={d, balk:{ei, t0, t1:snapG(t1), depth:1.5}};
    }
  }
  return best&&best.balk;
}
function balkSnapshot(){ return balconies.map(b=>({...b})); }
function balkChecksRefresh(){ if(plan) runChecks(); if(plan) buildUnitTable(); }
svg.addEventListener('mousemove',e=>{
  const r=svg.getBoundingClientRect(), sx=e.clientX-r.left, sy=e.clientY-r.top;
  document.getElementById('stPos').textContent = fmt(S2Wx(sx))+' , '+fmt(S2Wy(sy))+' m';
  if(dragging){
    if(dragging.type==='pan'){ panX=dragging.px+(sx-dragging.sx); panY=dragging.py+(sy-dragging.sy); render(); }
    if(dragging.type==='cut'){
      const v=snapG(dragging.horiz? S2Wx(sx) : S2Wy(sy));
      dragging.arr[dragging.idx]=Math.min(dragging.max, Math.max(dragging.min, v));
      generate(true);
    }
    if(dragging.type==='wall'){ dragWallTo(sx,sy); }
    if(dragging.type==='struct'){ dragStructTo(sx,sy); }
    if(dragging.type==='park'){ const b=plan&&plan.parking&&plan.parking.bays[dragging.idx];
      if(b){ const nx=snapG(S2Wx(sx)-dragging.gx), ny=snapG(S2Wy(sy)-dragging.gy);
        if(nx!==b.x||ny!==b.y){ b.x=nx; b.y=ny; dragging.moved=true; render(); } } }
    if(dragging.type==='bvert'){ pts[dragging.idx]={x:snapG(S2Wx(sx)), y:snapG(S2Wy(sy))};
      document.getElementById('stArea').textContent=fmt(shoelace(pts))+' m²';
      document.getElementById('stPerim').textContent=fmt(perim(pts))+' m'; render(); }
    if(dragging.type==='door'){
      const wx=S2Wx(sx), wy=S2Wy(sy);
      if(dragging.door.kind==='extra'){
        const eg=edgeNear(wx,wy);
        if(eg && extraDoors[dragging.door.i]){ extraDoors[dragging.door.i]=eg; render(); }
      } else {
        let best=null, bd=Infinity;
        dragging.door.edges.forEach(e2=>{
          const mx=e2.h? e2.x+0.45 : e2.x, my=e2.h? e2.y : e2.y+0.45;
          const dd=(mx-wx)**2+(my-wy)**2;
          if(dd<bd){ bd=dd; best=e2; }
        });
        if(best){ doorOverrides[dragging.door.key]={h:best.h,x:best.x,y:best.y}; render(); }
      }
    }
    if(dragging.type==='balkD'){
      const b=dragging.b, {A,n}=balkBase(b.ei);
      const d=(S2Wx(sx)-A.x)*n.x+(S2Wy(sy)-A.y)*n.y;
      b.depth=Math.max(0.5, Math.min(3, Math.round(d*10)/10)); render();
    }
    if(dragging.type==='balkT'){
      const b=dragging.b, {A,u,L}=balkBase(b.ei);
      const t=snapG((S2Wx(sx)-A.x)*u.x+(S2Wy(sy)-A.y)*u.y);
      if(dragging.part==='t0') b.t0=Math.max(0, Math.min(t, b.t1-1));
      else b.t1=Math.min(L, Math.max(t, b.t0+1));
      render();
    }
    return;
  }
  if((mode==='draw'&&!closed)||(mode==='parcel'&&!parcelClosed)){ hoverP=snapPoint(sx,sy); render(); }
  else if(mode==='balkon'){
    const wx=S2Wx(sx), wy=S2Wy(sy);
    const h=hitBalk(wx,wy);
    hoverBalk = h? {hit:h} : {ghost:ghostBalk(wx,wy)};
    svg.style.cursor = h? (h.part==='body'?'context-menu':'move') : (hoverBalk.ghost?'copy':'');
    render();
  }
  else if(mode==='door'){
    if(!plan) return;
    const h=hitDoor(sx,sy);
    svg.style.cursor = h? 'move' : '';
    if((h?h.key:null)!==(hoverDoor?hoverDoor.key:null)){ hoverDoor=h; render(); }
  }
  else if(mode==='struct'){
    if(!plan) return;
    const h=hitStructHandle(sx,sy);
    if(h){ svg.style.cursor = h.handle==='move'?'move'
      : h.handle==='n'||h.handle==='s'?'ns-resize'
      : h.handle==='e'||h.handle==='w'?'ew-resize'
      : h.handle==='nw'||h.handle==='se'?'nwse-resize':'nesw-resize'; }
    else { const bh=hitBoundaryHandle(sx,sy); svg.style.cursor = bh? (bh.kind==='edge'?'copy':'move') : ''; }
  }
  else if(mode==='park'){
    if(!plan||!plan.parking) return;
    const hb=hitBay(sx,sy);
    const ghost = (hb==null)? parkGhostAt(sx,sy) : null;
    const gKey=g=>g?g.x+','+g.y+','+g.w:'';
    if(hb!==hoverBay || gKey(ghost)!==gKey(parkGhost)){
      hoverBay=hb; parkGhost=ghost;
      svg.style.cursor = hb!=null? 'pointer' : (ghost?'copy':'not-allowed');
      render();
    }
  }
  else if(plan && closed && mode!=='parcel'){ // oda duvarı + oda ölçüsü vurgusu
    const w=(mode==='pan')? null : (hitCutHandle(sx,sy)? null : hitWallRun(sx,sy));
    if(mode!=='pan') svg.style.cursor = w? (w.horiz?'ns-resize':'ew-resize') : '';
    let hr=null;
    { const c=Math.floor((S2Wx(sx)-plan.minX)/M), r2=Math.floor((S2Wy(sy)-plan.minY)/M);
      if(r2>=0&&c>=0&&r2<plan.rows&&c<plan.cols){ const j=r2*plan.cols+c;
        if(plan.inside[j]&&plan.cm[j]>=0&&plan.regions[plan.cm[j]].type!=='koridor') hr=plan.cm[j]; } }
    if(w!==hoverWall || hr!==hoverRoomId){ hoverWall=w; hoverRoomId=hr; render(); }
  }
});
svg.addEventListener('mouseleave',()=>{
  if(hoverWall||hoverRoomId!=null){ hoverWall=null; hoverRoomId=null; render(); } });
svg.addEventListener('mousedown',e=>{
  const r=svg.getBoundingClientRect(), sx=e.clientX-r.left, sy=e.clientY-r.top;
  if(e.button===1 || mode==='pan'){ dragging={type:'pan',sx,sy,px:panX,py:panY}; e.preventDefault(); return; }
  if(mode==='balkon'){
    if(e.button!==0) return;
    const wx=S2Wx(sx), wy=S2Wy(sy), h=hitBalk(wx,wy);
    if(h){
      if(h.part==='depth'){ dragging={type:'balkD', b:h.b, undo:balkSnapshot()}; }
      else if(h.part==='t0'||h.part==='t1'){ dragging={type:'balkT', b:h.b, part:h.part, undo:balkSnapshot()}; }
      e.preventDefault(); return;
    }
    const nb=ghostBalk(wx,wy);
    if(nb){ editHistory.push({type:'balk', prev:balkSnapshot()}); balconies.push(nb);
      hoverBalk=null; balkChecksRefresh(); render(); }
    return;
  }
  if(mode==='door'){
    if(e.button!==0 || !plan) return;
    const h=hitDoor(sx,sy);
    if(h){ dragging={type:'door', door:h, undo:doorSnapshot()}; e.preventDefault(); }
    return;
  }
  if(mode==='struct'){
    if(e.button!==0 || !plan) return;
    const h=hitStructHandle(sx,sy);
    if(h){ const reg=plan.regions[h.regId];
      if(reg){ const gc=Math.floor((S2Wx(sx)-plan.minX)/M), gr=Math.floor((S2Wy(sy)-plan.minY)/M);
        dragging={type:'struct', regId:h.regId, handle:h.handle, box0:regBoxCells(reg), gr, gc,
          snap:snapshotRegions(), prevCore:lockedCore?lockedCore.map(o=>({...o})):null};
        e.preventDefault(); }
      return; }
    const bh=hitBoundaryHandle(sx,sy);
    if(bh){
      const prevPts=pts.map(p=>({...p}));
      let idx=bh.idx;
      if(bh.kind==='edge'){ const a=pts[bh.idx], b=pts[(bh.idx+1)%pts.length];
        pts.splice(bh.idx+1,0,{x:snapG((a.x+b.x)/2), y:snapG((a.y+b.y)/2)}); idx=bh.idx+1; }
      dragging={type:'bvert', idx, prevPts, prevCore:lockedCore?lockedCore.map(o=>({...o})):null};
      e.preventDefault(); render();
    }
    return;
  }
  if(mode==='parcel'){
    if(parcelClosed || e.button!==0) return;
    const p=snapPoint(sx,sy);
    if(p.closing){ parcelClosed=true; hoverP=null; balkChecksRefresh(); render(); return; }
    if(parcelPts.length && p.x===parcelPts[parcelPts.length-1].x && p.y===parcelPts[parcelPts.length-1].y) return;
    parcelPts.push({x:p.x,y:p.y}); render(); return;
  }
  if(mode==='park'){
    if(e.button!==0||!plan||!plan.parking) return;
    const hb=hitBay(sx,sy);
    if(hb!=null){ const b=plan.parking.bays[hb];
      dragging={type:'park', idx:hb, gx:S2Wx(sx)-b.x, gy:S2Wy(sy)-b.y, undo:parkSnapshot(), moved:false};
      e.preventDefault();
    } else { const g=parkGhostAt(sx,sy);
      if(g){ editHistory.push({type:'park', prev:parkSnapshot()});
        plan.parking.bays.push(g); parkGhost=null; parkEditRefresh(); }
    }
    return;
  }
  if(plan && e.button===0){ // ayırıcı tutamacı? oda duvarı?
    const h=hitCutHandle(sx,sy);
    if(h){ h.undo=customCutsZ&&customCutsZ.map(a=>a?a.slice():null); dragging=h; return; }
    const wr=hitWallRun(sx,sy);
    if(wr){ dragging={type:'wall', run:wr, snap:snapshotRegions()};
      hoverWall=wr; e.preventDefault(); return; }
  }
  if(mode!=='draw' || closed || e.button!==0) return;
  const p=snapPoint(sx,sy);
  if(p.closing){ finishPoly(); return; }
  if(pts.length && p.x===pts[pts.length-1].x && p.y===pts[pts.length-1].y) return;
  pts.push({x:p.x,y:p.y}); render();
});
/* kapı modu: çift tık — duvarda kapı ekle, mevcut kapıyı sil */
svg.addEventListener('dblclick',e=>{
  if(mode!=='door'||!plan) return;
  e.preventDefault();
  const rb=svg.getBoundingClientRect(), sx=e.clientX-rb.left, sy=e.clientY-rb.top;
  const h=hitDoor(sx,sy);
  if(h){ /* sil: ekstra kapı kalkar, otomatik kapı bastırılır */
    editHistory.push({type:'door', prev:doorSnapshot()});
    if(h.kind==='extra') extraDoors.splice(h.i,1);
    else doorHidden[h.key]=true;
    hoverDoor=null; runChecks(); render(); return;
  }
  const eg=edgeNear(S2Wx(sx),S2Wy(sy));
  if(eg){
    editHistory.push({type:'door', prev:doorSnapshot()});
    extraDoors.push(eg); runChecks(); render();
  }
});
window.addEventListener('mouseup',finishDrag);
/* sürükleme biterken değişikliği geçmişe yaz (Geri Al için) */
function finishDrag(){
  if(!dragging) return;
  if(dragging.type==='cut'){
    generate(true); // not: generate duvar girdilerini geçmişten siler — cut girdisi SONRA yazılır
    if(dragging.undo && JSON.stringify(dragging.undo)!==JSON.stringify(customCutsZ))
      editHistory.push({type:'cut', cuts:dragging.undo});
  } else if(dragging.type==='wall' && dragging.snap && plan){
    if(snapshotChanged(dragging.snap))
      editHistory.push({type:'wallsnap', snap:dragging.snap});
  } else if(dragging.type==='struct' && dragging.snap && plan){
    if(regionsChanged(dragging.snap)){
      if(plan.villa){ /* villa: tek merdiven üretim-sonrası kalır (yeniden üretmeden) */
        editHistory.push({type:'wallsnap', snap:dragging.snap});
        plan.wallRuns=computeWallRuns(); runChecks(); buildUnitTable();
      } else { /* apartman: çekirdeği iskelet olarak kilitle + daireleri etrafına yeniden diz */
        captureLockedCore();
        editHistory.push({type:'corelock', prev:dragging.prevCore});
        generate(); if(floorsOn()) villaFloors[activeFloor]=stateSnapshot(true);
        updateStructResetBtn();
      }
    }
  } else if(dragging.type==='bvert' && plan){
    /* bina sınırı değişti → çekirdek kilitliyken yeniden diz (kata özel sınır) */
    editHistory.push({type:'bound', prevPts:dragging.prevPts, prevCore:dragging.prevCore});
    try{ generate(); if(floorsOn()) villaFloors[activeFloor]=stateSnapshot(true); }
    catch(err){ console.error('sınır düzenleme:', err); }
    document.getElementById('stArea').textContent=fmt(shoelace(pts))+' m²';
    document.getElementById('stPerim').textContent=fmt(perim(pts))+' m';
  } else if(dragging.type==='door' && dragging.undo){
    if(JSON.stringify(dragging.undo)!==JSON.stringify(doorSnapshot()))
      editHistory.push({type:'door', prev:dragging.undo});
  } else if((dragging.type==='balkD'||dragging.type==='balkT') && dragging.undo){
    if(JSON.stringify(dragging.undo)!==JSON.stringify(balkSnapshot()))
      editHistory.push({type:'balk', prev:dragging.undo});
    balkChecksRefresh();
  } else if(dragging.type==='park' && plan && plan.parking){
    if(!dragging.moved){ /* hareketsiz = tık → park yerini sil */
      plan.parking.bays.splice(dragging.idx,1);
      editHistory.push({type:'park', prev:dragging.undo});
      hoverBay=null; parkEditRefresh();
    } else { /* taşındı → değişikliği geçmişe yaz */
      editHistory.push({type:'park', prev:dragging.undo});
      parkEditRefresh();
    }
  }
  dragging=null;
}
/* son elle düzenlemeyi geri al; geçmiş boşsa false döner (Geri Al eski davranışına düşer) */
function undoEdit(){
  const e=editHistory.pop(); if(!e) return false;
  if(e.type==='balk'){
    balconies=e.prev.map(b=>({...b}));
    balkChecksRefresh(); render(); return true;
  }
  if(e.type==='door'){ doorRestore(e.prev); hoverDoor=null; if(plan) runChecks(); render(); return true; }
  if(e.type==='park'){ if(plan&&e.prev){ plan.parking=e.prev; hoverBay=null; parkGhost=null;
    runChecks(); render(); if(floorsOn()) villaFloors[activeFloor]=stateSnapshot(true); } return true; }
  if(e.type==='wallsnap'){
    if(!plan) return true;
    restoreRegions(e.snap);
    hoverWall=null;
    plan.wallRuns=computeWallRuns();
    runChecks(); buildUnitTable(); render();
  } else if(e.type==='room'){
    if(!plan||!plan.unitObjs[e.unit]) return true; // bayat girdi: yut
    const u=plan.unitObjs[e.unit], rm=new Set(e.cells);
    if(e.op==='remove'){ // hücreler hedef odadan geri alınır, oda diriltilir
      const tgt=plan.regions[e.tgt];
      if(e.tgtName!==undefined) tgt.name=e.tgtName;        // açık mutfak dönüşümünde salon adı değişti
      tgt.cells=tgt.cells.filter(i=>!rm.has(i));
      e.reg.cells=e.cells.slice();
      e.cells.forEach(i=>plan.cm[i]=e.reg.id);
      u.rooms.splice(Math.min(e.roomsIdx,u.rooms.length),0,e.reg);
      calcRegionMetrics(tgt, plan.cols, plan.minX, plan.minY);
    } else { // 'add': oyulan hücreler ev sahibi odaya geri döner (oda bölme de bu yol)
      const host=plan.regions[e.host];
      if(e.hostName!==undefined) host.name=e.hostName;     // eb. banyo eklerken yapılan ad değişikliği
      e.cells.forEach(i=>{ plan.cm[i]=host.id; host.cells.push(i); });
      e.reg.cells=[];
      u.rooms=u.rooms.filter(o=>o!==e.reg);
      if(u.antre===e.reg) u.antre=null;                    // sonradan eklenen antre geri alındı
      calcRegionMetrics(host, plan.cols, plan.minX, plan.minY);
    }
    calcRegionMetrics(e.reg, plan.cols, plan.minX, plan.minY);
    u.spec=e.spec;
    hoverWall=null; hoverRoomId=null;
    plan.wallRuns=computeWallRuns();
    runChecks(); buildUnitTable(); render();
  } else if(e.type==='retype'){
    if(plan&&plan.unitObjs[e.unit]){
      e.reg.name=e.name; e.reg.type=e.rtype; plan.unitObjs[e.unit].spec=e.spec;
      plan.wallRuns=computeWallRuns(); runChecks(); buildUnitTable(); render(); }
  } else if(e.type==='swap'){
    if(plan){ const g1=plan.regions[e.a], g2=plan.regions[e.b];
      if(g1&&g2){ const n=g1.name,t=g1.type; g1.name=g2.name; g1.type=g2.type; g2.name=n; g2.type=t; }
      plan.wallRuns=computeWallRuns(); runChecks(); buildUnitTable(); render(); }
  } else if(e.type==='corelock'){
    lockedCore=e.prev; // önceki iskelet (null = otomatik)
    if(plan&&closed){ generate(); if(floorsOn()) villaFloors[activeFloor]=stateSnapshot(true); }
    updateStructResetBtn();
  } else if(e.type==='bound'){
    pts=e.prevPts.map(p=>({...p})); lockedCore=e.prevCore;
    if(closed){ try{ generate(); if(floorsOn()) villaFloors[activeFloor]=stateSnapshot(true); }catch(err){ console.error(err); } }
    document.getElementById('stArea').textContent=fmt(shoelace(pts))+' m²';
    document.getElementById('stPerim').textContent=fmt(perim(pts))+' m';
    updateStructResetBtn();
  } else if(e.type==='cut'){
    customCutsZ=e.cuts; generate(true);
  } else if(e.type==='ulayout'){
    if(e.state){ // tam durum anlık görüntüsü: elle düzenlemeler dahil birebir geri döner
      const keep=editHistory; // restoreState yığını sıfırlar; kalan geçmiş korunur
      try{ restoreState(e.state, {fit:false}); }
      catch(err){ unitLayout=Object.assign({}, e.prev); generate(true); }
      editHistory=keep;
      unitLayout=Object.assign({}, e.prev);
    } else { unitLayout=Object.assign({}, e.prev); generate(true); }
  }
  return true;
}
svg.addEventListener('wheel',e=>{
  e.preventDefault();
  const r=svg.getBoundingClientRect(), sx=e.clientX-r.left, sy=e.clientY-r.top;
  const wx=S2Wx(sx), wy=S2Wy(sy);
  pxPerM = Math.min(80, Math.max(4, pxPerM*(e.deltaY<0?1.12:0.89)));
  panX = sx - wx*pxPerM; panY = sy - wy*pxPerM; render();
},{passive:false});
function finishPoly(){
  if(pts.length<3) return;
  closed=true; hoverP=null;
  document.getElementById('genBtn').disabled=false;
  document.getElementById('stArea').textContent=fmt(shoelace(pts))+' m²';
  document.getElementById('stPerim').textContent=fmt(perim(pts))+' m';
  render();
}
/* ================= park yeri düzenleme (otopark/sığınak katı) =================
   Park modunda: park yerine tık=sil, boş uygun yere tık=ekle, park yerini sürükle=taşı.
   Düzen çubuğundan yön (Oto/Yatay/Dikey) ve Sıfırla. Elle dokununca manual=true →
   otomatik yeniden hesap bunu ezmez; kat geçişi/kayıt taşır; Geri Al adım adım çözer. */
function parkSnapshot(){ return (plan&&plan.parking)? JSON.parse(JSON.stringify(plan.parking)) : null; }
/* dünya noktası b park yerinin (ang derece) içinde mi */
function hitBay(sx,sy){
  if(!plan||!plan.parking) return null;
  const wx=S2Wx(sx), wy=S2Wy(sy), bays=plan.parking.bays;
  for(let i=bays.length-1;i>=0;i--){ const b=bays[i];
    let px=wx-(b.x+b.w/2), py=wy-(b.y+b.h/2);
    if(b.ang){ const a=-b.ang*Math.PI/180, c=Math.cos(a), s=Math.sin(a); const nx=px*c-py*s, ny=px*s+py*c; px=nx; py=ny; }
    if(Math.abs(px)<=b.w/2+0.02 && Math.abs(py)<=b.h/2+0.02) return i;
  }
  return null;
}
/* park yeri tümüyle otopark alanında mı (çekirdek/duvar/dış değil) — ekleme/önizleme denetimi */
function bayAreaOk(b){
  if(!plan) return false;
  const a=(b.ang||0)*Math.PI/180, c=Math.cos(a), s=Math.sin(a), cx=b.x+b.w/2, cy=b.y+b.h/2;
  for(let dx=-b.w/2+0.25; dx<b.w/2; dx+=0.5)
    for(let dy=-b.h/2+0.25; dy<b.h/2; dy+=0.5){
      const wx=cx+dx*c-dy*s, wy=cy+dx*s+dy*c;
      const col=Math.floor((wx-plan.minX)/M), row=Math.floor((wy-plan.minY)/M);
      if(row<0||col<0||row>=plan.rows||col>=plan.cols) return false;
      const j=row*plan.cols+col;
      if(!plan.inside[j]||plan.cm[j]<0||plan.regions[plan.cm[j]].type!=='otopark') return false;
    }
  return true;
}
/* imleç altında eklenebilecek boş park yeri (yöne göre yatay/dikey) | null */
function parkGhostAt(sx,sy){
  if(!plan||!plan.parking) return null;
  const vert=!!plan.parking.vertical;
  const w=(vert?REG.parkBayLen:REG.parkBayWid), h=(vert?REG.parkBayWid:REG.parkBayLen);
  const b={x:snapG(S2Wx(sx)-w/2), y:snapG(S2Wy(sy)-h/2), w, h, ang:0};
  return bayAreaOk(b)? b : null;
}
function parkEditRefresh(){ if(!plan||!plan.parking) return;
  plan.parking.manual=true; runChecks(); render();
  if(floorsOn()) villaFloors[activeFloor]=stateSnapshot(true);
}
function setParkOrient(o){
  if(!plan||!plan.parking) return;
  editHistory.push({type:'park', prev:parkSnapshot()}); // yön/sıfırla da geri alınabilir olsun
  const np=parkingForPlan(plan, o==='auto'?undefined:(o==='v'));
  np.orient=o; np.manual=false; plan.parking=np;
  hoverBay=null; parkGhost=null;
  runChecks(); render(); if(floorsOn()) villaFloors[activeFloor]=stateSnapshot(true);
  showParkBar();
}
function showParkBar(){
  const bar=document.getElementById('parkBar'); if(!bar||!bar.querySelectorAll) return;
  const o=(plan&&plan.parking&&plan.parking.orient)||'auto';
  bar.querySelectorAll('button[data-orient]').forEach(b=>b.classList.toggle('active', b.dataset.orient===o));
}
/* otopark/sığınak katında 🅿️ Park butonunu göster; başka kata geçince park modundan çık */
function updateParkBtn(){
  const pk=document.getElementById('tPark'); if(!pk) return;
  const ok = !!(plan && plan.parking && usageEnabled() && (katKullanim==='otopark'||katKullanim==='siginak'));
  pk.style.display = ok? '' : 'none';
  if(!ok && mode==='park') setMode('draw');
}
/* araç çubuğu */
const setMode=m=>{ mode=m; hoverP=null; hoverBalk=null; hoverDoor=null; hoverStruct=null; hoverBay=null; parkGhost=null;
  for(const[id,mm]of[['tDraw','draw'],['tParcel','parcel'],['tBalk','balkon'],['tDoor','door'],['tStruct','struct'],['tPark','park'],['tPan','pan']]){
    const elb=document.getElementById(id); if(elb) elb.classList.toggle('active',m===mm); }
  const pb=document.getElementById('parkBar'); if(pb) pb.style.display=(m==='park')?'flex':'none';
  if(m==='park') showParkBar();
  svg.classList.toggle('panning',m==='pan'); render(); };
document.getElementById('tbToggle').onclick=()=>{
  const tb=document.getElementById('toolbar');
  const off=tb.classList.toggle('collapsed');
  document.getElementById('tbToggle').textContent=off?'»':'«';
};
/* ---- onboarding stepper ---- */
(()=>{
  const STEPS_DESKTOP=[
    {t:'Sınırı çizin', h:'<b>✏️ Çiz</b> aracıyla tıklayarak bina dış sınırını oluşturun; kenarlar 15°’ye ve 0,5 m ızgaraya oturur. Başlangıç noktasına tıklayınca sınır kapanır. Hızlı denemek için <b>▭ Örnek sınır</b>.'},
    {t:'Parsel ve balkon', h:'<b>⬠ Parsel</b> ile arsa sınırını çizin; bahçe alanı, TAKS ve çekme mesafeleri hesaplanır. <b>▦ Balkon</b> aracında dış duvara tıklayıp balkon ekleyin (tutamaçlarla boyutlandırın, SAĞ TIK siler).'},
    {t:'Yerleşimi oluşturun', h:'Sol panelden daire tiplerini ayarlayın ve <b>Yerleşimi Oluştur</b>’a basın. Mevzuat paneli her değişiklikte canlı güncellenir.'},
    {t:'İnce ayar yapın', h:'<b>Turuncu yuvarlak</b> tutamaçlar daire ayırıcılarını, <b>kare</b> tutamaçlar oda duvarlarını taşır. Bir odaya <b>SAĞ TIK</b>: oda ekle / sil / tipini değiştir / takas / böl; antreye sağ tık: kırp. <b>🚪 Kapı</b> aracında kapıları sürükleyin; duvara <b>ÇİFT TIK</b> kapı ekler, kapıya ÇİFT TIK siler, SAĞ TIK otomatik yere döndürür. <b>🏗 Yapı</b> aracı çekirdeği (merdiven, asansör, teknik şaft, yangın merdiveni) öne çıkarır: <b>✛</b> ile taşıyın, <b>kare</b> tutamaçlardan boyutlandırın; bina sınırını köşelerinden sürükleyin, <b>+</b> ile yeni köşe ekleyin. Çekirdek bir <b>iskelettir</b>: kilitli kalır, daireler etrafına dizilir, "Yerleşimi Oluştur" onu sıfırlamaz (sıfırlamak için "🗑 Yapı iskeletini sıfırla"). Dokunmatik ekranda: <b>uzun basış</b> = sağ tık, <b>çift dokunuş</b> = çift tık, <b>iki parmak</b> = yakınlaştır, boşta sürükleme = kaydır. Not: Yerleşimi yeniden oluşturmak elle yapılan değişiklikleri sıfırlar.'},
    {t:'Kontrol ve dışa aktarım', h:'<b>↩︎ Geri al</b> elle yapılan değişiklikleri adım adım geri alır. Mevzuat kontrolleri yeşile dönünce <b>SVG / PNG indir</b> ile dışa aktarın.'}
  ];
  const STEPS_MOBILE=[
    {t:'Sınırı çizin', h:'<b>✏️ Çiz</b> aracında ekrana <b>dokunarak</b> köşe ekleyin; başlangıç noktasına dokununca sınır kapanır. <b>Boşta sürükleme</b> görünümü kaydırır, <b>iki parmak</b> yakınlaştırır. Hızlı denemek için <b>▭ Örnek sınır</b>.'},
    {t:'Parsel ve balkon', h:'<b>⬠ Parsel</b> ile arsa sınırını çizin. <b>▦ Balkon</b> aracında dış duvara dokunup balkon ekleyin; kenar tutamaçlarını parmağınızla sürükleyerek boyutlandırın, <b>uzun basış</b> siler.'},
    {t:'Yerleşimi oluşturun', h:'Sol üstteki <b>☰</b> menüden daire tiplerini girin ve <b>Yerleşimi Oluştur</b>’a basın. Mevzuat kontrolü ve lejant da bu menüde.'},
    {t:'İnce ayar yapın', h:'<b>Turuncu yuvarlak</b> tutamaç daire ayırıcısını, <b>kare</b> tutamaç oda duvarını taşır — parmağınızla sürükleyin. Bir odaya <b>UZUN BASIN</b>: oda ekle / sil / tipini değiştir / takas / böl. <b>🚪 Kapı</b> aracında kapıları sürükleyin; duvara <b>ÇİFT DOKUNUŞ</b> kapı ekler, kapıya çift dokunuş siler. <b>🏗 Yapı</b> aracı çekirdeği (merdiven, asansör, şaft, yangın merd.) öne çıkarır: <b>✛</b> ile taşıyın, kare tutamaçlardan boyutlandırın. Not: Yerleşimi yeniden oluşturmak elle değişiklikleri sıfırlar.'},
    {t:'Kontrol ve dışa aktarım', h:'<b>↩︎ Geri al</b> değişiklikleri adım adım geri alır. Alttaki <b>Daire Tablosu</b> başlığına dokununca açılır. Kontroller yeşile dönünce ☰ menüden <b>SVG / PNG indir</b>.'}
  ];
  const STEPS=(typeof matchMedia==='function'&&matchMedia('(max-width: 700px)').matches)? STEPS_MOBILE : STEPS_DESKTOP;
  const onb=document.getElementById('onb'), body=document.getElementById('onbBody'),
        dots=document.getElementById('onbDots'), step=document.getElementById('onbStep'),
        prev=document.getElementById('onbPrev'), next=document.getElementById('onbNext');
  let i=0;
  dots.innerHTML=STEPS.map(()=>'<i></i>').join('');
  const render=()=>{
    body.innerHTML='<b>'+STEPS[i].t+'</b><br>'+STEPS[i].h;
    step.textContent=(i+1)+'/'+STEPS.length;
    [...dots.children].forEach((d,k)=>d.classList.toggle('on',k===i));
    prev.style.visibility=i?'visible':'hidden';
    next.textContent=i===STEPS.length-1?'Bitti ✓':'İleri ›';
  };
  const close=()=>{onb.classList.add('collapsed'); try{localStorage.setItem('kpOnboardSeen','1');}catch(e){}};
  prev.onclick=()=>{if(i>0){i--;render();}};
  next.onclick=()=>{i<STEPS.length-1?(i++,render()):close();};
  document.getElementById('onbClose').onclick=e=>{e.stopPropagation(); close();};
  document.getElementById('onbHead').onclick=e=>{if(onb.classList.contains('collapsed')){onb.classList.remove('collapsed'); i=0; render();}};
  [...dots.children].forEach((d,k)=>d.onclick=()=>{i=k;render();});
  let seen=false; try{seen=!!localStorage.getItem('kpOnboardSeen');}catch(e){}
  if(seen) onb.classList.add('collapsed');
  render();
})();
document.getElementById('tDraw').onclick=()=>setMode('draw');
document.getElementById('tParcel').onclick=()=>setMode('parcel');
document.getElementById('tBalk').onclick=()=>setMode('balkon');
document.getElementById('tDoor').onclick=()=>setMode('door');
document.getElementById('tStruct').onclick=()=>setMode('struct');
document.getElementById('tPark').onclick=()=>setMode('park');
document.getElementById('tPan').onclick=()=>setMode('pan');
/* park düzeni çubuğu: yön + sıfırla */
if(typeof document.querySelectorAll==='function')
  document.querySelectorAll('#parkBar button[data-orient]').forEach(b=>b.onclick=()=>setParkOrient(b.dataset.orient));
{ const pr=document.getElementById('parkReset'); if(pr) pr.onclick=()=>setParkOrient('auto'); }
document.getElementById('tUndo').onclick=()=>{
  if(mode==='parcel'){ if(parcelClosed){ parcelClosed=false; } else parcelPts.pop(); balkChecksRefresh(); render(); return; }
  if(undoEdit()) return; // önce elle duvar/ayırıcı/balkon düzenlemeleri
  if(closed&&plan&&!confirm('Geri alınacak düzenleme kalmadı. Plan SİLİNİP çizim aşamasına dönülsün mü?')) return; // emniyet: saatlik emek tek tıkla gitmesin
  if(closed){closed=false;plan=null;balconies=[];editHistory=[];document.getElementById('genBtn').disabled=true;document.getElementById('unitTable').style.display='none';} else pts.pop(); resetCuts(); render(); };
document.getElementById('tClear').onclick=()=>{ pts=[];closed=false;plan=null;editHistory=[];resetCuts();
  parcelPts=[];parcelClosed=false;balconies=[];hoverBalk=null;doorOverrides={};extraDoors=[];doorHidden={};hoverDoor=null;
  if(villaFloors){ villaFloors[activeFloor]=null; renderFloorTabs(); } // yalnız aktif kat temizlenir
  else { lockedCore=null; } // tek bina: iskelet de sıfırlanır
  updateStructResetBtn();
  document.getElementById('genBtn').disabled=true; document.getElementById('svgBtn').disabled=true; document.getElementById('pngBtn').disabled=true;
  document.getElementById('unitTable').style.display='none';
  document.getElementById('stArea').textContent='–'; document.getElementById('stPerim').textContent='–'; render(); };
document.getElementById('tFit').onclick=fitView;
document.getElementById('tSample').onclick=()=>{ pts=[{x:0,y:0},{x:32,y:0},{x:32,y:16},{x:0,y:16}]; closed=true;
  document.getElementById('genBtn').disabled=false; resetCuts(); fitView();
  document.getElementById('stArea').textContent=fmt(shoelace(pts))+' m²';
  document.getElementById('stPerim').textContent=fmt(perim(pts))+' m'; };
function fitView(){
  const all=pts.concat(parcelPts);
  if(!all.length) return; const bb=bboxOf(all);
  const r=svg.getBoundingClientRect();
  pxPerM=Math.min(80, Math.max(4, Math.min(r.width/(bb.maxX-bb.minX+6), r.height/(bb.maxY-bb.minY+6))));
  panX=(r.width-(bb.maxX-bb.minX)*pxPerM)/2 - bb.minX*pxPerM;
  panY=(r.height-(bb.maxY-bb.minY)*pxPerM)/2 - bb.minY*pxPerM; render();
}
/* ---- zoom kaydırıcısı (sağ alt) ---- */
const ZMIN=4, ZMAX=80, ZBASE=16;                          // px/m: alt sınır, üst sınır, %100 referansı
function zoomCenter(np){                                   // tuvalin merkezi etrafında yakınlaş/uzaklaş
  const r=svg.getBoundingClientRect();
  const cx=r.width/2, cy=r.height/2;
  const wx=S2Wx(cx), wy=S2Wy(cy);
  pxPerM=Math.min(ZMAX, Math.max(ZMIN, np));
  panX=cx-wx*pxPerM; panY=cy-wy*pxPerM; render();
}
function updateZoomUI(){                                   // pxPerM her değiştiğinde kaydırıcıyı/etiketi eşitle (render() çağırır)
  const R=document.getElementById('zRange'); if(!R) return;
  R.value=Math.round(1000*Math.log(pxPerM/ZMIN)/Math.log(ZMAX/ZMIN));
  document.getElementById('zoomLbl').textContent=Math.round(pxPerM/ZBASE*100)+'%';
}
(function(){
  const R=document.getElementById('zRange');
  R.addEventListener('input',()=>zoomCenter(ZMIN*Math.pow(ZMAX/ZMIN, R.value/1000)));
  document.getElementById('zIn').onclick=()=>zoomCenter(pxPerM*1.2);
  document.getElementById('zOut').onclick=()=>zoomCenter(pxPerM/1.2);
  updateZoomUI();
})();
