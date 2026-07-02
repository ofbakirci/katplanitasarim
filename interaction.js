'use strict';
/* ================= çizim etkileşimi ================= */
/* SPACE = geçici kaydırma: basılı tutarken sol-tık sürükle görünümü kaydırır; bırakınca
   içinde olduğumuz araca (çiz/yapı/kapı…) kesintisiz dönülür (mode HİÇ değişmez). */
let spacePan=false;
function syncPanCursor(){ svg.classList.toggle('panning', mode==='pan' || spacePan || (dragging&&dragging.type==='pan')); }
/* B4: durum çubuğu tek-satır tutamaç ipucu (turuncu/mavi ayrımını görünür kılar).
   color verilmezse renk temizlenir. Mobilde #status gizli → dokunmatiği etkilemez. */
function setStatusHint(txt,color){ const e=document.getElementById('stHint'); if(!e) return;
  e.textContent=txt||''; if(color) e.style.color=color; }
function activePoly(){ if(mode==='roomdraw') return {arr:roomPts, cl:false}; return mode==='parcel'? {arr:parcelPts, cl:parcelClosed} : {arr:pts, cl:closed}; }
function snapPoint(sx,sy){
  let x=snapG(S2Wx(sx)), y=snapG(S2Wy(sy));
  const A=activePoly();
  /* bina çizerken parsel/çekme köşe & kenarlarına yapış ("oturt") — 15° kilidini ezer */
  if(mode==='draw' && !A.cl && typeof psSnapTarget==='function'){
    const t=psSnapTarget(S2Wx(sx), S2Wy(sy));
    if(t){
      if(A.arr.length>=3){ const f=A.arr[0];
        if(Math.hypot(t.x-f.x, t.y-f.y) < 0.7) return {x:f.x, y:f.y, closing:true}; }
      return {x:Math.round(t.x*1000)/1000, y:Math.round(t.y*1000)/1000, snapPS:true};
    }
  }
  if((mode==='draw'||mode==='parcel'||mode==='roomdraw') && A.arr.length && !A.cl){
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
/* ================= avlu (iç boşluk) ================= */
function rectPoly(x0,y0,x1,y1){ // ızgaraya snap'li dikdörtgen poligon (4 köşe)
  const ax=snapG(Math.min(x0,x1)), ay=snapG(Math.min(y0,y1)), bx=snapG(Math.max(x0,x1)), by=snapG(Math.max(y0,y1));
  return [{x:ax,y:ay},{x:bx,y:ay},{x:bx,y:by},{x:ax,y:by}];
}
function hitAvlu(wx,wy){ // imleç altındaki avlu (silme/önizleme için)
  for(let i=courtyards.length-1;i>=0;i--){ if(pip(wx,wy,courtyards[i].poly)) return {i, av:courtyards[i]}; }
  return null;
}
/* avlu eklendi/silindi → footprint değişti: plan varsa yeniden üret, kat/blok anlık görüntüsünü tazele */
function avluChanged(){
  if(plan && closed){ try{ resetCuts(); generate(); if(floorsOn()) villaFloors[activeFloor]=stateSnapshot(true); }
    catch(err){ console.error('avlu yeniden üretim:', err); } }
  else render();
}
svg.addEventListener('mousemove',e=>{
  const r=svg.getBoundingClientRect(), sx=e.clientX-r.left, sy=e.clientY-r.top;
  document.getElementById('stPos').textContent = fmt(S2Wx(sx))+' , '+fmt(S2Wy(sy))+' m';
  if(dragging){
    if(dragging.type==='pan'){ panX=dragging.px+(sx-dragging.sx); panY=dragging.py+(sy-dragging.sy); render(); }
    if(dragging.type==='cut'){
      const v=snapG(dragging.horiz? S2Wx(sx) : S2Wy(sy));
      dragging.arr[dragging.idx]=Math.min(dragging.max, Math.max(dragging.min, v));
      drawCutGhost(dragging, sx, sy);   // B1: drag SIRASINDA generate YOK — yalnız hayalet önizleme; reflow BIRAKINCA
    }
    if(dragging.type==='wall'){ dragWallTo(sx,sy); }
    if(dragging.type==='struct'){ dragStructTo(sx,sy); }
    if(dragging.type==='avlu'){ avluGhost={poly:rectPoly(dragging.x0,dragging.y0,S2Wx(sx),S2Wy(sy))}; render(); }
    if(dragging.type==='siteMove'){
      const dx=snapG(S2Wx(sx)-dragging.x0), dy=snapG(S2Wy(sy)-dragging.y0);
      dragging.dx=dx; dragging.dy=dy; if(dx||dy) dragging.moved=true;
      const o=dragging.orig;
      if(o.active){ const L=o.live;     // hafif önizleme (yalnız görünür kat)
        pts=L.pts.map(p=>({x:p.x+dx,y:p.y+dy}));
        courtyards=L.courtyards.map(av=>({poly:av.poly.map(p=>({x:p.x+dx,y:p.y+dy}))}));
        if(plan){ plan.minX=L.minX+dx; plan.minY=L.minY+dy; }
        const ov={}; for(const k in L.doorOv){ const d=L.doorOv[k]; ov[k]={...d,x:d.x+dx,y:d.y+dy}; } doorOverrides=ov;
        extraDoors=L.extraDoors.map(d=>({...d,x:d.x+dx,y:d.y+dy}));
      } else {
        blocks[dragging.idx]=translateStateObj(o.snap, dx, dy);
      }
      render();
    }
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
  if(spacePan){ syncPanCursor(); return; }   // space basılı: imleç grab kalsın, hover/işaretçi mantığı çalışmasın
  if((mode==='draw'&&!closed)||(mode==='parcel'&&!parcelClosed)||(mode==='roomdraw'&&plan)){ hoverP=snapPoint(sx,sy); render(); }
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
    let hsH=null;
    if(h){ svg.style.cursor = h.handle==='move'?'move'
      : h.handle==='n'||h.handle==='s'?'ns-resize'
      : h.handle==='e'||h.handle==='w'?'ew-resize'
      : h.handle==='nw'||h.handle==='se'?'nwse-resize':'nesw-resize';
      hsH={kind:'core',regId:h.regId,handle:h.handle};
      setStatusHint('Çekirdek — tutamaçtan taşı/boyutlandır','#2f6f8f');   // B4: mavi = çekirdek öğesi
    }
    else { const bh=hitBoundaryHandle(sx,sy); svg.style.cursor = bh? (bh.kind==='edge'?'copy':'move') : '';
      if(bh){ hsH={kind:bh.kind==='edge'?'bedge':'bvert',idx:bh.idx};
        setStatusHint(bh.kind==='edge'?'Bina kenarı — anchor eklemek için tıkla':'Bina köşesi — sürükleyerek taşı','#b35a2e'); }  // turuncu = bina sınırı
      else setStatusHint('');
    }
    const key=o=>o? (o.kind+':'+(o.regId!=null?o.regId+'/'+o.handle:o.idx)) : null;
    if(key(hsH)!==key(hoverStructH)){ hoverStructH=hsH; render(); }
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
  else if(mode==='avlu'){
    if(!closed){ svg.style.cursor=''; return; }
    svg.style.cursor = hitAvlu(S2Wx(sx),S2Wy(sy))? 'context-menu' : 'copy';
  }
  else if(mode==='site'){
    svg.style.cursor = (siteOn()&&hitBlock(S2Wx(sx),S2Wy(sy))>=0)? 'move' : '';
  }
  else if(plan && closed && mode!=='parcel'){ // oda duvarı + oda ölçüsü vurgusu
    const cutH=(mode==='pan')? null : hitCutHandle(sx,sy);
    const w=(mode==='pan'||cutH)? null : hitWallRun(sx,sy);
    if(mode!=='pan') svg.style.cursor = w? (w.horiz?'ns-resize':'ew-resize') : '';
    let hr=null;
    { const c=Math.floor((S2Wx(sx)-plan.minX)/M), r2=Math.floor((S2Wy(sy)-plan.minY)/M);
      if(r2>=0&&c>=0&&r2<plan.rows&&c<plan.cols){ const j=r2*plan.cols+c;
        if(plan.inside[j]&&plan.cm[j]>=0&&plan.regions[plan.cm[j]].type!=='koridor') hr=plan.cm[j]; } }
    /* B4: cut (turuncu) / duvar (mavi) hover — durum çubuğu ipucu + tutamaç hâlesi */
    const ck=cutH? cutH.zi+','+cutH.idx : null, oldCk=hoverCut? hoverCut.zi+','+hoverCut.idx : null;
    if(cutH) setStatusHint('Daire sınırı — bırakınca iki daire yeniden dizilir','#b35a2e');
    else if(w) setStatusHint('Duvar — odalar korunarak kayar','#2f6f8f');
    else setStatusHint('');
    if(w!==hoverWall || hr!==hoverRoomId || ck!==oldCk){ hoverWall=w; hoverRoomId=hr; hoverCut=cutH?{zi:cutH.zi,idx:cutH.idx}:null; render(); }
  }
});
svg.addEventListener('mouseleave',()=>{
  setStatusHint('');
  if(hoverWall||hoverRoomId!=null||hoverCut||hoverStructH){ hoverWall=null; hoverRoomId=null; hoverCut=null; hoverStructH=null; render(); } });
svg.addEventListener('mousedown',e=>{
  const r=svg.getBoundingClientRect(), sx=e.clientX-r.left, sy=e.clientY-r.top;
  if(e.button===1 || mode==='pan' || (spacePan && e.button===0)){ dragging={type:'pan',sx,sy,px:panX,py:panY}; e.preventDefault(); return; }
  if(mode==='balkon'){
    if(e.button!==0) return;
    const wx=S2Wx(sx), wy=S2Wy(sy), h=hitBalk(wx,wy);
    if(h){
      if(h.part==='depth'){ dragging={type:'balkD', b:h.b, undo:balkSnapshot()}; }
      else if(h.part==='t0'||h.part==='t1'){ dragging={type:'balkT', b:h.b, part:h.part, undo:balkSnapshot()}; }
      e.preventDefault(); return;
    }
    const nb=ghostBalk(wx,wy);
    if(nb){ pushEdit({type:'balk', prev:balkSnapshot()}); balconies.push(nb);
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
    if(e.button!==0) return;
    if(parcelClosed){                                  // FAZ 5: kapalı parselde kenara tıkla = yol cephesi seç (tekrar tıkla = kaldır)
      if(typeof psNearestParcelEdge==='function'){
        const fe=psNearestParcelEdge(sx,sy);
        if(fe>=0){ psFrontEdge=(psFrontEdge===fe?-1:fe); psComputeSetback();
          if(typeof psUpdateYolUI==='function') psUpdateYolUI(); render(); }
      }
      return;
    }
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
      if(g){ pushEdit({type:'park', prev:parkSnapshot()});
        plan.parking.bays.push(g); parkGhost=null; parkEditRefresh(); }
    }
    return;
  }
  if(mode==='avlu'){
    if(e.button!==0 || !closed) return;
    const wx=S2Wx(sx), wy=S2Wy(sy);
    if(hitAvlu(wx,wy)) return;        // mevcut avlu üstünde yeni çizme (silmek için sağ tık)
    if(!pip(wx,wy,pts)) return;       // yalnız bina sınırı içinde başlar
    dragging={type:'avlu', x0:wx, y0:wy, prev:courtyardsSnapshot()};
    avluGhost={poly:rectPoly(wx,wy,wx,wy)};
    e.preventDefault(); return;
  }
  if(mode==='site'){
    if(e.button!==0 || !siteOn()) return;
    const wx=S2Wx(sx), wy=S2Wy(sy), idx=hitBlock(wx,wy);
    if(idx<0) return;
    /* snap = commit için tam durum (çok katlı blok dâhil); live = sürükleme önizlemesi (görünür kat) */
    const orig=(idx===activeBlock)
      ? {active:true, snap:stateSnapshot(false),
         live:{pts:pts.map(p=>({...p})), courtyards:courtyardsSnapshot(),
           minX:plan?plan.minX:0, minY:plan?plan.minY:0,
           doorOv:JSON.parse(JSON.stringify(doorOverrides)), extraDoors:extraDoors.map(d=>({...d}))}}
      : {active:false, snap:JSON.parse(JSON.stringify(blocks[idx]))};
    dragging={type:'siteMove', idx, x0:wx, y0:wy, orig, dx:0, dy:0, moved:false};
    e.preventDefault(); return;
  }
  if(mode==='roomdraw'){
    if(e.button!==0) return;
    if(!plan){ roomDrawToast('Önce yerleşim oluşturun'); return; }
    const q=snapPoint(sx,sy);
    if(q.closing){ finishRoomPoly(); return; }
    if(roomPts.length && q.x===roomPts[roomPts.length-1].x && q.y===roomPts[roomPts.length-1].y) return;
    roomPts.push({x:q.x,y:q.y}); render(); return;
  }
  if(plan && e.button===0){ // ayırıcı tutamacı? oda duvarı?
    const h=hitCutHandle(sx,sy);
    if(h){ h.undo=customCutsZ&&customCutsZ.map(a=>a?a.slice():null);
      h.preUnits=captureUnitFootprints();   // sınır taşımada elle oda düzenini koru (footprint değişmeyen daireler)
      h.preSnap=plan?stateSnapshot(false):null;   // GERİ AL: cut-öncesi TAM durum (yeniden dizilen dairelerin elle düzeni de dâhil)
      dragging=h; return; }
    const wr=hitWallRun(sx,sy);
    if(wr){ dragging={type:'wall', run:wr, snap:snapshotRegions(), groupMove:e.shiftKey};
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
  if(mode==='roomdraw'){ e.preventDefault(); finishRoomPoly(); return; }
  if(mode!=='door'||!plan) return;
  e.preventDefault();
  const rb=svg.getBoundingClientRect(), sx=e.clientX-rb.left, sy=e.clientY-rb.top;
  const h=hitDoor(sx,sy);
  if(h){ /* sil: ekstra kapı kalkar, otomatik kapı bastırılır */
    pushEdit({type:'door', prev:doorSnapshot()});
    if(h.kind==='extra') extraDoors.splice(h.i,1);
    else doorHidden[h.key]=true;
    hoverDoor=null; runChecks(); render(); return;
  }
  let eg=edgeNear(S2Wx(sx),S2Wy(sy));
  if(!eg && (!floorsOn()||activeFloor===zeminIdx())) eg=extEdgeNear(S2Wx(sx),S2Wy(sy));  // zemin katta dış cepheye giriş kapısı
  if(eg){
    pushEdit({type:'door', prev:doorSnapshot()});
    extraDoors.push(eg); runChecks(); render();
  }
});
window.addEventListener('mouseup',finishDrag);
/* sürükleme biterken değişikliği geçmişe yaz (Geri Al için) */
function finishDrag(){
  if(!dragging) return;
  clearDragOverlay();   // B1: cut/duvar sürükleme hayalet katmanını kaldır
  if(dragging.type==='cut'){
    /* B1: reflow yalnız BIRAKINCA. Büyük planda (48x27) ~5 sn sürebilir → önce imleci
       progress'e al, tarayıcı boyayabilsin diye commit'i bir sonraki makro-göreve ertele.
       setTimeout kullan (rAF DEĞİL): arka-plan/odaksız sekmede rAF durur → commit asılı kalırdı. */
    const d=dragging; dragging=null;
    svg.style.cursor='progress';
    const commit=()=>{
      try{
        generate(true); // not: generate duvar girdilerini geçmişten siler — cut girdisi SONRA yazılır
        restoreEditedFootprints(d.preUnits);   // footprint'i değişmeyen dairelerin elle düzenini geri kur
        if(d.undo && JSON.stringify(d.undo)!==JSON.stringify(customCutsZ) && d.preSnap)
          pushEdit({type:'cut', state:d.preSnap}); // geri al: cut-öncesi TAM duruma birebir dön (restoreState)
      } finally { svg.style.cursor=''; syncPanCursor(); }
    };
    if(typeof setTimeout==='function') setTimeout(commit, 0);
    else commit();
    return;
  } else if(dragging.type==='wall' && dragging.snap && plan){
    if(snapshotChanged(dragging.snap))
      pushEdit({type:'wallsnap', snap:dragging.snap});
  } else if(dragging.type==='struct' && dragging.snap && plan){
    if(regionsChanged(dragging.snap)){
      if(plan.villa){ /* villa: tek merdiven üretim-sonrası kalır (yeniden üretmeden) */
        pushEdit({type:'wallsnap', snap:dragging.snap});
        plan.wallRuns=computeWallRuns(); runChecks(); buildUnitTable();
      } else { /* apartman: çekirdeği iskelet olarak kilitle + daireleri etrafına yeniden diz */
        captureLockedCore();
        pushEdit({type:'corelock', prev:dragging.prevCore});
        generate(); if(floorsOn()) villaFloors[activeFloor]=stateSnapshot(true);
        updateStructResetBtn();
      }
    }
  } else if(dragging.type==='bvert' && plan){
    /* bina sınırı değişti → çekirdek kilitliyken yeniden diz (kata özel sınır) */
    pushEdit({type:'bound', prevPts:dragging.prevPts, prevCore:dragging.prevCore});
    try{ generate(); if(floorsOn()) villaFloors[activeFloor]=stateSnapshot(true); }
    catch(err){ console.error('sınır düzenleme:', err); }
    document.getElementById('stArea').textContent=fmt(shoelace(pts))+' m²';
    document.getElementById('stPerim').textContent=fmt(perim(pts))+' m';
  } else if(dragging.type==='door' && dragging.undo){
    if(JSON.stringify(dragging.undo)!==JSON.stringify(doorSnapshot()))
      pushEdit({type:'door', prev:dragging.undo});
  } else if((dragging.type==='balkD'||dragging.type==='balkT') && dragging.undo){
    if(JSON.stringify(dragging.undo)!==JSON.stringify(balkSnapshot()))
      pushEdit({type:'balk', prev:dragging.undo});
    balkChecksRefresh();
  } else if(dragging.type==='park' && plan && plan.parking){
    if(!dragging.moved){ /* hareketsiz = tık → park yerini sil */
      plan.parking.bays.splice(dragging.idx,1);
      pushEdit({type:'park', prev:dragging.undo});
      hoverBay=null; parkEditRefresh();
    } else { /* taşındı → değişikliği geçmişe yaz */
      pushEdit({type:'park', prev:dragging.undo});
      parkEditRefresh();
    }
  } else if(dragging.type==='siteMove'){
    const d=dragging; dragging=null;
    if(d.moved){
      /* commit: aktif blok TAM durumdan (tüm katlar dâhil) yeniden kurulur; inaktif zaten çevrildi */
      if(d.orig.active){
        try{ restoreState(translateStateObj(d.orig.snap, d.dx, d.dy), {keepBlocks:true}); }
        catch(err){ console.error('blok taşı:', err); }
      }
      pushEdit({type:'sitemove', idx:d.idx, active:d.orig.active, snap:d.orig.snap});
      if(plan) runChecks(); renderBlockTabs(); render();
    } else if(typeof switchBlock==='function'){   // hareketsiz tık = bloğa geç (düzenle)
      switchBlock(d.idx); setMode('draw');
    }
    return;
  } else if(dragging.type==='avlu'){
    const gh=avluGhost; avluGhost=null; const prev=dragging.prev; dragging=null;
    if(gh && gh.poly){ const bb=bboxOf(gh.poly);
      if((bb.maxX-bb.minX)>=1 && (bb.maxY-bb.minY)>=1){   // anlamlı avlu: en az 1×1 m
        pushEdit({type:'avlu', prev});
        courtyards.push({poly:gh.poly});
        avluChanged(); return;
      }
    }
    render(); return;
  }
  dragging=null;
  syncPanCursor();   // space-pan sürüşü bittiyse (space bırakılmışsa) grab imlecini düşür
}
/* SPACE basılı tut → geçici kaydırma (mode değişmez). Metin alanlarında boşluk yazımına dokunma. */
window.addEventListener('keydown',e=>{
  if(e.code!=='Space' || e.repeat || spacePan) return;
  const t=e.target, tag=t&&t.tagName;
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(t&&t.isContentEditable)) return;
  spacePan=true; svg.style.cursor=''; syncPanCursor(); e.preventDefault();   // grab imleci .panning sınıfından gelsin
});
window.addEventListener('keyup',e=>{
  if(e.code!=='Space' || !spacePan) return;
  spacePan=false; syncPanCursor();   // sürüş sürüyorsa mouseup'a dek pan class'ı tutulur
});
window.addEventListener('blur',()=>{ if(spacePan){ spacePan=false; syncPanCursor(); } });  // sekme/odak kaybında takılı kalmasın
/* Ctrl/Cmd+Z = geri al, Ctrl/Cmd+Shift+Z veya Ctrl/Cmd+Y = ileri al. Metin alanlarında dokunma. */
window.addEventListener('keydown',e=>{
  if(!(e.ctrlKey||e.metaKey) || e.altKey) return;
  const t=e.target, tag=t&&t.tagName;
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(t&&t.isContentEditable)) return;
  const k=(e.key||'').toLowerCase();
  if(k==='z' && !e.shiftKey){ e.preventDefault(); document.getElementById('tUndo').click(); }
  else if((k==='z' && e.shiftKey) || k==='y'){ e.preventDefault(); document.getElementById('tRedo').click(); }
});
/* Esc: serbest oda çizimini iptal et (yarım poligonu at) */
window.addEventListener('keydown',e=>{
  if(e.key!=='Escape' || mode!=='roomdraw' || !roomPts.length) return;
  roomPts=[]; hoverP=null; render();
});
/* B3: modlara tek-tuş kısayol (modifier'sız). İlgili araç düğmesini tıklar →
   pro-only/site/park görünürlüğü ve tSite toggle mantığı otomatik korunur.
   Space/Esc/Ctrl+Z/Y'ye DOKUNMAZ (ayrı handler'lar); form alanı + sürükleme ortasında YUTULUR. */
const MODE_KEYS={d:'tDraw',o:'tRoom',k:'tDoor',b:'tBalk',a:'tAvlu',y:'tStruct',p:'tParcel',t:'tPark',s:'tSite'};
window.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey) return;          // Ctrl/Cmd/Alt kombinasyonları başka handler'larda
  if(dragging) return;                                 // sürükleme ortasında mod değişimi yok (B1 dragOverlay yarım kalmasın)
  const t=e.target, tag=t&&t.tagName;
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(t&&t.isContentEditable)) return;
  const id=MODE_KEYS[(e.key||'').toLowerCase()];
  if(!id) return;
  const btn=document.getElementById(id);
  if(!btn || btn.disabled || getComputedStyle(btn).display==='none') return;   // gizli (pro-only/site kapalı/park yok) → kısayol da yok
  e.preventDefault(); btn.click();
});
/* son elle düzenlemeyi geri al; geçmiş boşsa false döner (Geri Al eski davranışına düşer).
   Pop'tan ÖNCE o anki TAM durumu redoHistory'ye iter → İleri Al her tip için çalışır
   (heterojen delta-undo'larla uyumlu: ilk geri-al delta ile, sonrası iki yönde snapshot ile). */
function undoEdit(){
  if(!editHistory.length) return false;
  const cur = plan ? stateSnapshot(false) : null;   // ileri-al için mevcut durum (plan yoksa redo yok)
  const e = editHistory.pop();
  if(cur) redoHistory.push({state:cur, label:e.label||labelFor(e)});
  if(e.type==='balk'){
    balconies=e.prev.map(b=>({...b}));
    balkChecksRefresh(); render(); return true;
  }
  if(e.type==='door'){ doorRestore(e.prev); hoverDoor=null; if(plan) runChecks(); render(); return true; }
  if(e.type==='park'){ if(plan&&e.prev){ plan.parking=e.prev; hoverBay=null; parkGhost=null;
    runChecks(); render(); if(floorsOn()) villaFloors[activeFloor]=stateSnapshot(true); } return true; }
  if(e.type==='avlu'){ courtyards=(e.prev||[]).map(av=>({poly:av.poly.map(p=>({x:p.x,y:p.y}))})); avluGhost=null; avluChanged(); return true; }
  if(e.type==='sitemove'){
    if(e.active){ try{ restoreState(e.snap, {keepBlocks:true}); }catch(err){ console.error(err); } }
    else if(blocks){ blocks[e.idx]=JSON.parse(JSON.stringify(e.snap)); render(); }
    hoverWall=null; if(typeof renderBlockTabs==='function') renderBlockTabs(); return true; }
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
  } else if(e.type==='unitswap'){
    if(e.state){ // daire takası: tam durum anlık görüntüsü ile birebir geri dön
      const keep=editHistory;
      try{ restoreState(e.state, {fit:false}); }catch(err){ console.error(err); }
      editHistory=keep;
    }
  } else if(e.type==='structedit'){
    if(e.state){ // yapı elemanı ekle/sil: tam durum anlık görüntüsü (bölge ekleme/silme dahil) birebir geri döner
      const keep=editHistory;
      try{ restoreState(e.state, {fit:false}); }catch(err){ console.error(err); }
      editHistory=keep;
      updateStructResetBtn(); // iskelet düğmesi lockedCore'a göre tazelensin
    }
  } else if(e.type==='roomdraw'){
    if(e.state){ // serbest oda çizimi: çoklu-donör carve → TAM durum anlık görüntüsü birebir geri döner
      const keep=editHistory;
      try{ restoreState(e.state, {fit:false}); }catch(err){ console.error(err); }
      editHistory=keep;
    }
  } else if(e.type==='cut'){
    if(e.state){ // daire sınırı: cut-öncesi TAM durum (yeniden dizilen dairelerin elle düzeni dâhil) birebir geri döner
      const keep=editHistory;
      try{ restoreState(e.state, {fit:false}); }catch(err){ console.error(err); }
      editHistory=keep;
    } else { customCutsZ=e.cuts; generate(true); restoreEditedFootprints(e.preUnits); } // eski girdi uyumu (oturum-içi)
  } else if(e.type==='__snap'){ // ileri-al'dan dönen tam-durum girdisi (redoEdit yazar)
    const keep=editHistory;
    try{ restoreState(e.state, {fit:false}); }catch(err){ console.error(err); }
    editHistory=keep;
    updateStructResetBtn();
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
/* yapılan son geri-al'ı yeniden uygula (İleri Al). undoEdit'in simetriği:
   hedef snapshot'ı yükle, o anki durumu __snap olarak editHistory'ye geri it (tekrar geri-alınabilsin).
   restoreState editHistory'yi sıfırlar → keepE ile koru; redoHistory'ye dokunmaz ama keepR ile garanti. */
function redoEdit(){
  if(!redoHistory.length) return false;
  const r=redoHistory.pop();
  const cur = plan ? stateSnapshot(false) : null;
  const keepE=editHistory, keepR=redoHistory;
  try{ restoreState(r.state, {fit:false}); }catch(err){ console.error(err); }
  editHistory=keepE; redoHistory=keepR;
  if(cur) editHistory.push({type:'__snap', state:cur, label:r.label}); // ham push: redoHistory'yi temizleme
  updateStructResetBtn();
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
/* serbest oda çizimi: kısa uyarı baloncuğu (canvasWrap'a, ~1,6 sn) */
function roomDrawToast(msg){
  let t=document.getElementById('drawToast');
  if(!t){ t=document.createElement('div'); t.id='drawToast';
    (document.getElementById('canvasWrap')||document.body).appendChild(t); }
  t.textContent=msg; t.classList.add('show');
  clearTimeout(roomDrawToast._t); roomDrawToast._t=setTimeout(()=>t.classList.remove('show'),1600);
}
/* serbest oda çizimini kapat: poligonu rasterize edip yeni ODA'ya çevir (rooms.js) */
function finishRoomPoly(){
  if(roomPts.length<3){ roomPts=[]; hoverP=null; render(); return; }
  const poly=roomPts.slice(); roomPts=[]; hoverP=null;
  const res=addRoomFromPolygon(poly);             // başarıda refreshAfterRoomEdit zaten render eder
  if(!res||!res.ok){
    roomDrawToast(res&&res.reason==='nounit' ? 'Bir daire üstüne çizin'
      : res&&res.reason==='salon' ? 'Mecburi piyes (salon/antre) yutulamaz — daha küçük çizin'
      : 'Çok küçük — daha geniş çizin');
    render();
  }
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
  pushEdit({type:'park', prev:parkSnapshot()}); // yön/sıfırla da geri alınabilir olsun
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
/* otopark/sığınak katında Park butonunu göster; başka kata geçince park modundan çık */
function updateParkBtn(){
  const pk=document.getElementById('tPark'); if(!pk) return;
  const ok = !!(plan && plan.parking && usageEnabled() && (katKullanim==='otopark'||katKullanim==='siginak'));
  pk.style.display = ok? '' : 'none';
  if(!ok && mode==='park') setMode('draw');
}
/* araç çubuğu */
/* B2: mod rozeti — aktif mod adı + tek satır ipucu (emoji YOK; ikon inline SVG).
   Varsayılan modlar (draw/pan) sade kalsın diye rozet gizlenir; park kendi çubuğunu gösterir. */
const MODE_BADGE={
  parcel:  {ic:'parcel',    name:'Parsel',  hint:'Kenarlara tıklayarak arsa sınırını çiz; kapatmak için başa dön'},
  balkon:  {ic:'balcony',   name:'Balkon',  hint:'Dış duvara tıkla-ekle; tutamaçlardan boyutlandır'},
  avlu:    {ic:'avlu',      name:'Avlu',    hint:'Sınır içinde sürükleyerek aydınlık boşluğu oy'},
  door:    {ic:'door',      name:'Kapı',    hint:'Kapıyı sürükleyerek komşu duvara taşı'},
  struct:  {ic:'structure', name:'Yapı',    hint:'Çekirdek ve bina köşe tutamaçlarından boyutlandır'},
  roomdraw:{ic:'roomdraw',  name:'Oda Çiz', hint:'Kapalı poligon çizerek yeni oda oluştur'},
  site:    {ic:'blok',      name:'Site',    hint:'Blokları sürükleyerek yerleştir'}
};
function updateModeBadge(m){
  const bg=document.getElementById('modeBadge'); if(!bg) return;
  const info=MODE_BADGE[m];
  if(!info){ bg.style.display='none'; return; }
  bg.querySelector('.mbName').innerHTML=(typeof icon==='function'?icon(info.ic):'')+'<span>'+info.name+'</span>';
  bg.querySelector('.mbHint').textContent=info.hint;
  bg.style.display='flex';
  /* villa/site sekmeleri ya da park çubuğu görünüyorsa rozeti bir satır aşağı it */
  const shown=id=>{ const e=document.getElementById(id); return e && getComputedStyle(e).display!=='none'; };
  bg.classList.toggle('shifted', shown('floorTabs')||shown('blockTabs'));
}
const setMode=m=>{ mode=m; hoverP=null; hoverBalk=null; hoverDoor=null; hoverStruct=null; hoverBay=null; parkGhost=null; avluGhost=null; roomPts=[]; hoverCut=null; hoverStructH=null; setStatusHint('');
  for(const[id,mm]of[['tDraw','draw'],['tParcel','parcel'],['tBalk','balkon'],['tAvlu','avlu'],['tDoor','door'],['tStruct','struct'],['tRoom','roomdraw'],['tPark','park'],['tSite','site'],['tPan','pan']]){
    const elb=document.getElementById(id); if(elb) elb.classList.toggle('active',m===mm); }
  const pb=document.getElementById('parkBar'); if(pb) pb.style.display=(m==='park')?'flex':'none';
  if(m==='park') showParkBar();
  updateModeBadge(m);
  positionOnb();
  svg.classList.toggle('panning',m==='pan'); render(); };
document.getElementById('tbToggle').onclick=()=>{
  const tb=document.getElementById('toolbar');
  const off=tb.classList.toggle('collapsed');
  document.getElementById('tbToggle').textContent=off?'»':'«';
};
/* onboarding ("Nasıl kullanılır?") kutusu kaldırıldı (kullanıcı isteği). */
document.getElementById('tDraw').onclick=()=>setMode('draw');
document.getElementById('tParcel').onclick=()=>setMode('parcel');
document.getElementById('tBalk').onclick=()=>setMode('balkon');
document.getElementById('tAvlu').onclick=()=>setMode('avlu');
document.getElementById('tDoor').onclick=()=>setMode('door');
document.getElementById('tStruct').onclick=()=>setMode('struct');
{ const tr=document.getElementById('tRoom'); if(tr) tr.onclick=()=>setMode('roomdraw'); }
document.getElementById('tPark').onclick=()=>setMode('park');
{ const sb=document.getElementById('tSite'); if(sb) sb.onclick=()=>{ if(siteOn()) setMode(mode==='site'?'draw':'site'); }; }
document.getElementById('tPan').onclick=()=>setMode('pan');
/* park düzeni çubuğu: yön + sıfırla */
if(typeof document.querySelectorAll==='function')
  document.querySelectorAll('#parkBar button[data-orient]').forEach(b=>b.onclick=()=>setParkOrient(b.dataset.orient));
{ const pr=document.getElementById('parkReset'); if(pr) pr.onclick=()=>setParkOrient('auto'); }
document.getElementById('tUndo').onclick=()=>{
  if(mode==='parcel'){ if(parcelClosed){ parcelClosed=false; } else parcelPts.pop(); balkChecksRefresh(); render(); return; }
  if(undoEdit()) return; // önce elle duvar/ayırıcı/balkon düzenlemeleri
  if(closed&&plan&&!confirm('Geri alınacak düzenleme kalmadı. Plan SİLİNİP çizim aşamasına dönülsün mü?')) return; // emniyet: saatlik emek tek tıkla gitmesin
  if(closed){closed=false;plan=null;balconies=[];editHistory=[];redoHistory=[];document.getElementById('genBtn').disabled=true;document.getElementById('unitTable').style.display='none';} else pts.pop(); resetCuts(); render(); };
document.getElementById('tRedo').onclick=()=>{ redoEdit(); };
document.getElementById('tHist').onclick=()=>{ const p=document.getElementById('histPanel');
  if(p){ const open=p.style.display==='none'||!p.style.display; p.style.display=open?'flex':'none'; if(open) refreshHistoryUI(true); } };
document.getElementById('tClear').onclick=()=>{ pts=[];roomPts=[];closed=false;plan=null;editHistory=[];redoHistory=[];resetCuts();
  parcelPts=[];parcelClosed=false;balconies=[];courtyards=[];avluGhost=null;hoverBalk=null;doorOverrides={};extraDoors=[];doorHidden={};hoverDoor=null;
  if(villaFloors){ villaFloors[activeFloor]=null; renderFloorTabs(); } // yalnız aktif kat temizlenir
  else { lockedCore=null; } // tek bina: iskelet de sıfırlanır
  updateStructResetBtn();
  document.getElementById('genBtn').disabled=true; document.getElementById('svgBtn').disabled=true; document.getElementById('pngBtn').disabled=true; document.getElementById('aiOutputBtn').disabled=true;
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
