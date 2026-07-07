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
/* AV-2: imleç altındaki avlu tutamağı — köşe (2-eksen boyut) / kenar (1-eksen boyut) / gövde (taşı).
   Balkon hitBalk deseniyle aynı ruh; avlu ekseni-hizalı dikdörtgen olduğundan bbox'tan hesaplanır. */
function avluHandleTol(){ return Math.max(0.3, 7*HITSC/pxPerM); }
function hitAvluHandle(wx,wy){
  const tol=avluHandleTol();
  for(let i=courtyards.length-1;i>=0;i--){
    const bb=bboxOf(courtyards[i].poly);
    const corners=[['nw',bb.minX,bb.minY],['ne',bb.maxX,bb.minY],['se',bb.maxX,bb.maxY],['sw',bb.minX,bb.maxY]];
    for(const [part,cx,cy] of corners){ if(Math.abs(wx-cx)<tol && Math.abs(wy-cy)<tol) return {i,part}; }
    const onX = wx>bb.minX-tol && wx<bb.maxX+tol, onY = wy>bb.minY-tol && wy<bb.maxY+tol;
    if(onX && Math.abs(wy-bb.minY)<tol) return {i,part:'n'};
    if(onX && Math.abs(wy-bb.maxY)<tol) return {i,part:'s'};
    if(onY && Math.abs(wx-bb.minX)<tol) return {i,part:'w'};
    if(onY && Math.abs(wx-bb.maxX)<tol) return {i,part:'e'};
    if(pip(wx,wy,courtyards[i].poly)) return {i,part:'body'};
  }
  return null;
}
/* AV-2: aday avlu poligonu geçerli mi — 4 köşe de bina sınırı (pts) içinde olmalı (sınır dışına taşamaz).
   Asgari 1×1 m boyut resize/move mantığında zaten korunur. */
function avluPolyValid(poly){ return poly && poly.length>=4 && poly.every(p=>pip(p.x,p.y,pts)); }
const avluCursor={n:'ns-resize',s:'ns-resize',e:'ew-resize',w:'ew-resize',nw:'nwse-resize',se:'nwse-resize',ne:'nesw-resize',sw:'nesw-resize',body:'move'};
/* avlu eklendi/silindi → footprint değişti: plan varsa yeniden üret, kat/blok anlık görüntüsünü tazele */
function avluChanged(){
  if(courtyards&&courtyards.length) avluSuggestion=null;   // OTO-AVLU: avlu var → öneri sönsün
  if(plan && closed){ try{ resetCuts(); generate(); if(floorsOn()) villaFloors[activeFloor]=stateSnapshot(true); }
    catch(err){ console.error('avlu yeniden üretim:', err); } }
  else render();
}
/* AV-3 GUARD: avlu yerleştirme/taşıma/boyutlandırma commit'i. courtyards ZATEN yeni hâle
   getirilmiş, prev = eski snapshot. Koridoru fiziken ikiye bölen avlu REDDEDİLİR:
   üret → koridor parça sayısı (DELTA) arttıysa prev'e dön + yeniden üret + uyar.
   Post-hoc revert (moveWallStep ruhu). true=commit tutuldu, false=reddedildi. */
function avluCommitGuard(prev){
  if(!(plan && closed)){ render(); return true; }
  const before=corridorComponentTotal();     // avlu-öncesi plan koridor parçaları
  try{ resetCuts(); generate(); }catch(err){ console.error('avlu üretim:', err); }
  if(corridorComponentTotal() > before){      // avlu koridoru EK parçaya böldü (2→2 meşru geçer)
    courtyards=(prev||[]).map(av=>({poly:av.poly.map(p=>({x:p.x,y:p.y}))}));
    try{ resetCuts(); generate(); }catch(err){ console.error(err); }
    setStatusHint('Avlu koridoru bölemez (dolaşım kopar)','#b35a2e');
    if(floorsOn()) villaFloors[activeFloor]=stateSnapshot(true);
    return false;
  }
  if(floorsOn()) villaFloors[activeFloor]=stateSnapshot(true);
  return true;
}
/* OTO-AVLU (avlu-rework): önerilen avluyu yerleştir. Normal ekleme akışının aynısı
   (pushEdit + avluCommitGuard) → undo/redo pürüzsüz, koridor-bölme guard'ı geçerli.
   Guard reddederse öneri kaldırılır (kullanıcı elle daha uygun boşluk çizsin). */
function placeSuggestedCourtyard(){
  if(!avluSuggestion) return false;
  const prev=courtyardsSnapshot();
  courtyards.push({poly:avluSuggestion.poly.map(p=>({x:p.x,y:p.y}))});
  avluSuggestion=null;
  if(avluCommitGuard(prev)){ pushEdit({type:'avlu', prev}); return true; }
  setStatusHint('Önerilen avlu bu planda koridoru bölüyor — kendin daha uygun bir boşluk çiz.','#b35a2e');
  return false;
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
    if(dragging.type==='avluMove'){
      const dx=snapG(S2Wx(sx)-dragging.gx), dy=snapG(S2Wy(sy)-dragging.gy), b=dragging.box0;
      const poly=rectPoly(b.minX+dx, b.minY+dy, b.maxX+dx, b.maxY+dy);
      avluGhost={poly, invalid:!avluPolyValid(poly)}; render();
    }
    if(dragging.type==='avluResize'){
      const wx=snapG(S2Wx(sx)), wy=snapG(S2Wy(sy)), p=dragging.part; let {minX,minY,maxX,maxY}=dragging.box0;
      if(p.indexOf('n')>=0) minY=Math.min(wy, maxY-1);   // min 1 m korunur
      if(p.indexOf('s')>=0) maxY=Math.max(wy, minY+1);
      if(p.indexOf('w')>=0) minX=Math.min(wx, maxX-1);
      if(p.indexOf('e')>=0) maxX=Math.max(wx, minX+1);
      const poly=rectPoly(minX,minY,maxX,maxY);
      avluGhost={poly, invalid:!avluPolyValid(poly)}; render();
    }
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
    if(dragging.type==='amenity'){ const a=amenities[dragging.idx];
      if(a){ const nx=snapG(S2Wx(sx)-dragging.gx), ny=snapG(S2Wy(sy)-dragging.gy);
        if(nx!==a.x||ny!==a.y){ a.x=nx; a.y=ny; dragging.moved=true; render(); } } }
    if(dragging.type==='amenityResize'){ const a=amenities[dragging.idx];   // H1b: köşe/kenar sürükle → boyutlandır
      if(a){ const nb=amenityResizeBox(dragging.box0, dragging.part, snapG(S2Wx(sx)), snapG(S2Wy(sy)));
        if(nb.x!==a.x||nb.y!==a.y||nb.w!==a.w||nb.h!==a.h){ a.x=nb.x; a.y=nb.y; a.w=nb.w; a.h=nb.h; dragging.moved=true; render(); } } }
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
    if(dragging.type==='window' && !dragging.win.cyt){   // C3: AVLU penceresi avlu kenarına ÇAPALI → taşınmaz
      const near=winEdgeNear(S2Wx(sx),S2Wy(sy));         //   (winEdgeNear yalnız bina sınırı pts'ini gezer; avlu ei uzayı ayrı).
      if(near){ const w=dragging.win;                    //   Genişlik/yükseklik/parapet seçim paneliyle yine ayarlanır.
        if(w.kind==='window' && w.i!=null && extraWindows[w.i]){         // ekstra pencere
          extraWindows[w.i].ei=near.ei; extraWindows[w.i].t=near.t;
        } else {                                                         // otomatik pencere → override (ei+t taşı)
          const ov=windowOverrides[w.key]||{}; ov.ei=near.ei; ov.t=near.t; windowOverrides[w.key]=ov;
        }
        dragging.moved=true; render();
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
  if((mode==='draw'&&!closed)||(mode==='parcel'&&!parcelClosed)||(mode==='roomdraw'&&plan)){
    hoverP=snapPoint(sx,sy);
    /* S4a: bina çizerken (site modu) aday sınır [pts + hoverP] başka blokla/parselle çakışıyorsa
       hayaleti kırmızıya çevir + uyar; kapatma bu adayla değil finishPoly'de reddedilir. */
    if(mode==='draw' && !closed && typeof siteOn==='function' && siteOn() && typeof blockDrawValidity==='function'){
      const cand = hoverP.closing ? pts.slice() : pts.concat([{x:hoverP.x, y:hoverP.y}]);
      const v = cand.length>=3 ? blockDrawValidity(cand) : {ok:true};
      blockDrawBad = v.ok ? null : {reason:v.reason, name:v.name};
      if(!v.ok) setStatusHint(v.reason==='block'
          ? 'Blok '+v.name+' ile çakışıyor — sınırı üstünden geçiremezsiniz.'
          : 'Sınır parsel dışına taşıyor.', '#c0392b');
      else if(pts.length) setStatusHint('Blok '+blockName(activeBlock)+' sınırını çizin — diğer bloklar soluk görünür.','#2f6f8f');
    } else blockDrawBad=null;
    render();
  }
  else if(mode==='draw'&&closed&&!plan){   // P3: yerleşim öncesi kapalı bina → köşe/kenar tutamacı hover geri bildirimi
    const bh=hitBoundaryHandle(sx,sy);
    const nh=bh?{kind:'bvert',idx:bh.idx}:null;
    svg.style.cursor = bh? (bh.kind==='edge'?'copy':'move') : '';
    if(bh) setStatusHint('Köşeyi taşı · kenar ortasına tıkla = köşe ekle','#b35a2e'); else setStatusHint('Sınır köşelerini sürükleyerek binayı düzenleyin','#6b5e4d');
    if(JSON.stringify(nh)!==JSON.stringify(hoverStructH)){ hoverStructH=nh; render(); }
  }
  else if(mode==='parcel'&&parcelClosed){ setStatusHint('Parsel kapalı — yol cephesi seçmek için bir kenara tıklayın','#4a7c4a'); svg.style.cursor='pointer'; }  // B6: kalıcı ipucu
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
  else if(mode==='window'){
    if(!plan) return;
    const h=hitWindow(sx,sy);
    const near=h?null:winEdgeNear(S2Wx(sx),S2Wy(sy));
    svg.style.cursor = h? 'move' : (near?'copy':'');
    if((h?h.key:null)!==(hoverWindow?hoverWindow.key:null)){ hoverWindow=h; render(); }
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
    parkLastSx=sx; parkLastSy=sy;                         // U3: R basınca önizleme aynı noktada dönsün
    const hb=hitBay(sx,sy);
    const ghost = (hb==null)? parkGhostAt(sx,sy) : null;
    const gKey=g=>g?g.x+','+g.y+','+g.w+','+(g.invalid?'x':''):'';
    if(hb!==hoverBay || gKey(ghost)!==gKey(parkGhost)){
      hoverBay=hb; parkGhost=ghost;
      svg.style.cursor = hb!=null? 'pointer' : ((ghost&&!ghost.invalid)?'copy':'not-allowed'); // I4: geçersiz→yasak imleç
      render();
    }
  }
  else if(mode==='amenity'){
    amenityLastSx=sx; amenityLastSy=sy;                    // R basınca önizleme aynı noktada dönsün
    const rh=hitAmenityHandle(sx,sy);                      // H1b: tutamaç üstünde resize imleci + hover kilidi
    const ha=(rh? rh.i : hitAmenity(sx,sy));
    const ghost = (ha==null)? amenityGhostAt(sx,sy) : null;
    const gKey=g=>g?g.type+','+g.x+','+g.y+','+g.w+','+(g.invalid?'x':''):'';
    if(ha!==hoverAmenity || gKey(ghost)!==gKey(amenityGhost)){
      hoverAmenity=ha; amenityGhost=ghost; render();
    }
    svg.style.cursor = rh? amenityCursor[rh.part] : (ha!=null? 'pointer' : ((ghost&&!ghost.invalid)?'copy':'not-allowed'));
  }
  else if(mode==='avlu'){
    if(!closed){ svg.style.cursor=''; return; }
    const hh=hitAvluHandle(S2Wx(sx),S2Wy(sy));   // AV-2: köşe/kenar boyut imleci · gövde taşı · boşluk çiz
    svg.style.cursor = hh? avluCursor[hh.part] : 'copy';
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
    if(nb){
      /* E3(b): dejenere/çok kısa balkonu ENGELLE + eğik dış kenarda dürüst bilgi ver.
         ghostBalk asgari 1 m açıklık ve depth 1,5 m üretir; yine de span<1 m (dejenere) ise
         yerleştirme. Eğik (90°'ye hizalı OLMAYAN) kenarda balkon geometrik olarak DESTEKLENİR
         (dörtgen sağlam, taşınır/silinir) ama plan ızgarası dik olduğundan balkon eğik cepheye
         paralel oturur — kullanıcıya sessiz kalmayıp durumu bildiririz. */
      if((nb.t1-nb.t0) < 1-1e-6){ setStatusHint('Balkon için kenar teması çok kısa (en az 1 m) — kenara daha yakın tıklayın.', '#b45309'); return; }
      const A=pts[nb.ei], B=pts[(nb.ei+1)%pts.length];
      const dx=Math.abs(B.x-A.x), dy=Math.abs(B.y-A.y);
      const tilted = dx>1e-3 && dy>1e-3;   // ne yatay ne dikey → eğik dış duvar
      pushEdit({type:'balk', prev:balkSnapshot()}); balconies.push(nb);
      hoverBalk=null; balkChecksRefresh(); render();
      setStatusHint(tilted
        ? 'Balkon eğik dış duvara eklendi (eğik cepheye paralel oturur). Sağ tık → sil, ya da tutamaçlardan boyutlandır.'
        : 'Balkon eklendi. Sağ tık → sil, ya da tutamaçlardan boyutlandır.');
    } else {
      setStatusHint('Balkon eklenemedi — bir dış duvara daha yakın tıklayın.', '#b45309');
    }
    return;
  }
  if(mode==='door'){
    if(e.button!==0 || !plan) return;
    const h=hitDoor(sx,sy);
    if(h){ dragging={type:'door', door:h, undo:doorSnapshot()}; e.preventDefault(); }
    return;
  }
  if(mode==='window'){
    if(e.button!==0 || !plan) return;
    const h=hitWindow(sx,sy);
    if(h){ selWindow=h.key; dragging={type:'window', win:h, undo:windowSnapshot(), moved:false}; e.preventDefault(); if(typeof updateWindowPanel==='function') updateWindowPanel(); render(); }
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
    if(p.closing){ parcelClosed=true; hoverP=null; balkChecksRefresh();
      setStatusHint('Parsel kapalı — yol cephesi seçmek için bir kenara tıklayın','#4a7c4a'); render(); return; }  // B6: kapanış geri bildirimi
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
      if(g && !g.invalid){ pushEdit({type:'park', prev:parkSnapshot()});   // I4: geçersiz (çakışan/alan-dışı) hayalet eklenmez
        plan.parking.bays.push({x:g.x,y:g.y,w:g.w,h:g.h,ang:g.ang}); parkGhost=null; parkEditRefresh(); }
    }
    return;
  }
  if(mode==='amenity'){
    if(e.button!==0) return;
    const hh=hitAmenityHandle(sx,sy);   // H1b: köşe/kenar tutamacı → boyutlandır (taşımadan ÖNCE)
    if(hh){ const a=amenities[hh.i];
      dragging={type:'amenityResize', idx:hh.i, part:hh.part, box0:amenityBBox(a), undo:amenitySnapshot(), moved:false};
      hoverAmenity=hh.i; e.preventDefault(); render(); return;
    }
    const ha=hitAmenity(sx,sy);
    if(ha!=null){ const a=amenities[ha];   // mevcut imkan → sürükle (taşı) ya da hareketsiz tık = sil
      dragging={type:'amenity', idx:ha, gx:S2Wx(sx)-a.x, gy:S2Wy(sy)-a.y, undo:amenitySnapshot(), moved:false};
      e.preventDefault();
    } else { const g=amenityGhostAt(sx,sy);   // boş yer → yeni imkan ekle (geçersiz hayalet eklenmez)
      if(g && !g.invalid){ pushEdit({type:'amenity', prev:amenitySnapshot()});
        amenities.push({type:g.type, x:g.x, y:g.y, w:g.w, h:g.h, ang:g.ang}); amenityGhost=null; amenityEditRefresh(); }
    }
    return;
  }
  if(mode==='avlu'){
    if(e.button!==0 || !closed) return;
    const wx=S2Wx(sx), wy=S2Wy(sy);
    /* OTO-AVLU (avlu-rework): önerilen boşluğa tıklama = tek-tık yerleştir (normal düzenlenebilir). */
    if(avluSuggestion && !avluGhost && pip(wx,wy,avluSuggestion.poly)){
      placeSuggestedCourtyard(); e.preventDefault(); return;
    }
    const hh=hitAvluHandle(wx,wy);   // AV-2: mevcut avlu tutamağı → taşı/boyutlandır
    if(hh){
      avluDragIdx=hh.i;
      dragging={type:(hh.part==='body'?'avluMove':'avluResize'), i:hh.i, part:hh.part,
                prev:courtyardsSnapshot(), box0:bboxOf(courtyards[hh.i].poly), gx:wx, gy:wy};
      avluGhost={poly:courtyards[hh.i].poly.map(p=>({x:p.x,y:p.y})), invalid:false};
      e.preventDefault(); render(); return;
    }
    if(!pip(wx,wy,pts)) return;       // yalnız bina sınırı içinde yeni çizim başlar
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
  /* P3: kapalı bina + henüz yerleşim yok → köşe tutamacını sürükle (add-anchor kenar ortası dâhil) */
  if(mode==='draw' && closed && !plan && e.button===0){
    const bh=hitBoundaryHandle(sx,sy);
    if(bh){
      const prevPts=pts.map(p=>({...p}));
      let idx=bh.idx;
      if(bh.kind==='edge'){ const a=pts[bh.idx], b=pts[(bh.idx+1)%pts.length];
        pts.splice(bh.idx+1,0,{x:snapG((a.x+b.x)/2), y:snapG((a.y+b.y)/2)}); idx=bh.idx+1; }
      dragging={type:'bvert', idx, prevPts, prevCore:lockedCore?lockedCore.map(o=>({...o})):null};
      e.preventDefault(); render(); return;
    }
    return;   // kapalı: yeni nokta ekleme
  }
  if(mode!=='draw' || closed || e.button!==0) return;
  const p=snapPoint(sx,sy);
  if(p.closing){ finishPoly(); return; }
  if(pts.length && p.x===pts[pts.length-1].x && p.y===pts[pts.length-1].y) return;
  pts.push({x:p.x,y:p.y}); render();
});
/* pencere modu: çift tık — cepheye pencere ekle, mevcut pencereyi sil */
svg.addEventListener('dblclick',e=>{
  if(mode==='window'&&plan){
    e.preventDefault();
    const rb=svg.getBoundingClientRect(), sx=e.clientX-rb.left, sy=e.clientY-rb.top;
    const h=hitWindow(sx,sy);
    if(h){ /* sil: ekstra pencere kalkar, otomatik pencere bastırılır */
      pushEdit({type:'window', prev:windowSnapshot()});
      if(h.i!=null) extraWindows.splice(h.i,1); else windowHidden[h.key]=true;
      if(selWindow===h.key) selWindow=null;
      hoverWindow=null; if(typeof updateWindowPanel==='function') updateWindowPanel(); render(); return;
    }
    const near=winEdgeNear(S2Wx(sx),S2Wy(sy));
    if(near){
      pushEdit({type:'window', prev:windowSnapshot()});
      extraWindows.push({ei:near.ei, t:near.t});
      selWindow='xw'+(extraWindows.length-1);
      if(typeof updateWindowPanel==='function') updateWindowPanel(); render();
    }
    return;
  }
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
    /* S4a: düzenlenen blok sınırı da diğer bloklarla çakışamaz → çakışırsa köşeyi geri al + uyar */
    if(typeof siteOn==='function' && siteOn() && typeof blockCollisionName==='function'){
      const nm=blockCollisionName(pts, activeBlock);
      if(nm){ pts=dragging.prevPts.map(p=>({...p}));
        setStatusHint('Blok '+nm+' ile çakışıyor — köşe geri alındı.','#c0392b');
        document.getElementById('stArea').textContent=fmt(shoelace(pts))+' m²';
        document.getElementById('stPerim').textContent=fmt(perim(pts))+' m';
        dragging=null; render(); return; }
    }
    /* bina sınırı değişti → çekirdek kilitliyken yeniden diz (kata özel sınır) */
    pushEdit({type:'bound', prevPts:dragging.prevPts, prevCore:dragging.prevCore});
    try{ generate(); if(floorsOn()) villaFloors[activeFloor]=stateSnapshot(true); }
    catch(err){ console.error('sınır düzenleme:', err); }
    document.getElementById('stArea').textContent=fmt(shoelace(pts))+' m²';
    document.getElementById('stPerim').textContent=fmt(perim(pts))+' m';
  } else if(dragging.type==='bvert'){
    /* S4a: yerleşim öncesi düzenlemede de çakışma engeli */
    if(typeof siteOn==='function' && siteOn() && typeof blockCollisionName==='function'){
      const nm=blockCollisionName(pts, activeBlock);
      if(nm){ pts=dragging.prevPts.map(p=>({...p}));
        setStatusHint('Blok '+nm+' ile çakışıyor — köşe geri alındı.','#c0392b');
        document.getElementById('stArea').textContent=fmt(shoelace(pts))+' m²';
        document.getElementById('stPerim').textContent=fmt(perim(pts))+' m';
        dragging=null; render(); return; }
    }
    /* P3: yerleşim ÖNCESİ (plan yok) sınır köşe düzenlemesi → yalnız pts geri-al (generate YOK) */
    if(JSON.stringify(dragging.prevPts)!==JSON.stringify(pts))
      pushEdit({type:'bounddraw', prevPts:dragging.prevPts});
    document.getElementById('stArea').textContent=fmt(shoelace(pts))+' m²';
    document.getElementById('stPerim').textContent=fmt(perim(pts))+' m';
  } else if(dragging.type==='door' && dragging.undo){
    if(JSON.stringify(dragging.undo)!==JSON.stringify(doorSnapshot()))
      pushEdit({type:'door', prev:dragging.undo});
  } else if(dragging.type==='window' && dragging.undo){
    if(JSON.stringify(dragging.undo)!==JSON.stringify(windowSnapshot()))
      pushEdit({type:'window', prev:dragging.undo});
    if(typeof updateWindowPanel==='function') updateWindowPanel();
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
  } else if(dragging.type==='amenity'){
    const a=amenities[dragging.idx];
    if(!dragging.moved){ /* hareketsiz = tık → imkanı sil */
      amenities.splice(dragging.idx,1);
      pushEdit({type:'amenity', prev:dragging.undo});
      hoverAmenity=null; amenityEditRefresh();
    } else if(a && (!amenityAreaOk(a) || amenityOverlapsExisting(a, dragging.idx))){
      /* geçersiz konuma bırakıldı (parsel dışı / bina üstü / çakışma) → eski hâle dön */
      amenities=dragging.undo;
      setStatusHint('İmkan parsel içinde, bina dışında ve boş bir yere konmalı — eski konuma dönüldü.','#b35a2e');
      hoverAmenity=null; amenityEditRefresh();
    } else { /* geçerli taşıma → geçmişe yaz */
      pushEdit({type:'amenity', prev:dragging.undo});
      amenityEditRefresh();
    }
  } else if(dragging.type==='amenityResize'){   // H1b: boyutlandırma bitir → geçerliyse geçmişe, değilse geri al
    const a=amenities[dragging.idx];
    if(!dragging.moved){ hoverAmenity=dragging.idx; render(); }   // salt tık = boyut değişmedi (sil DEĞİL — köşe tık)
    else if(a && (!amenityAreaOk(a) || amenityOverlapsExisting(a, dragging.idx))){
      amenities=dragging.undo;
      setStatusHint('İmkan bu boyutta parsel dışına/başka öğeye taşıyor — eski boyuta dönüldü.','#b35a2e');
      hoverAmenity=null; amenityEditRefresh();
    } else { amenityRememberSize(a); pushEdit({type:'amenity', prev:dragging.undo}); amenityEditRefresh(); }
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
  } else if(dragging.type==='avluMove' || dragging.type==='avluResize'){
    const gh=avluGhost, d=dragging; avluGhost=null; avluDragIdx=-1; dragging=null;
    if(!gh || !gh.poly || gh.invalid){   // geçersiz (sınır dışı) → eski hâle dön
      courtyards=(d.prev||[]).map(av=>({poly:av.poly.map(p=>({x:p.x,y:p.y}))}));
      setStatusHint('Avlu bina sınırı dışına taşınamaz','#b35a2e'); render(); return;
    }
    if(courtyards[d.i]) courtyards[d.i]={poly:gh.poly};
    if(JSON.stringify(courtyardsSnapshot())!==JSON.stringify(d.prev)){
      if(avluCommitGuard(d.prev)) pushEdit({type:'avlu', prev:d.prev});   // koridor bölünmediyse geçmişe yaz (guard üretti)
      return;
    }
    render(); return;   // konum değişmedi
  } else if(dragging.type==='avlu'){
    const gh=avluGhost; avluGhost=null; const prev=dragging.prev; dragging=null;
    if(gh && gh.poly){ const bb=bboxOf(gh.poly);
      if((bb.maxX-bb.minX)>=1 && (bb.maxY-bb.minY)>=1){   // anlamlı avlu: en az 1×1 m
        courtyards.push({poly:gh.poly});
        if(avluCommitGuard(prev)) pushEdit({type:'avlu', prev});   // koridor bölünmediyse geçmişe yaz
        return;
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
/* E3(c) EMNİYET AĞI: balkon modunda üzerine gelinen (hover) balkonu Del/Backspace ile sil.
   Sağ-tık silme (balkon modu + her mod) asıl yol; bu, hayalet balkona takılan kullanıcı için
   klavye kaçış kapısı. Yalnız balkon modunda + gerçek bir balkon hover'dayken; form alanı yut. */
window.addEventListener('keydown',e=>{
  if(e.key!=='Delete' && e.key!=='Backspace') return;
  if(mode!=='balkon' || !(hoverBalk&&hoverBalk.hit)) return;
  const t=e.target, tag=t&&t.tagName;
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(t&&t.isContentEditable)) return;
  e.preventDefault();
  pushEdit({type:'balk', prev:balkSnapshot()});
  balconies.splice(hoverBalk.hit.i,1); hoverBalk=null; balkChecksRefresh(); render();
});
/* U3: park modunda R → yerleştirilecek park yerinin yönünü (yatay/dikey) çevir.
   Önizleme (parkGhost) aynı imleç noktasında ANINDA döner. parkGhostVert override'ı
   yalnız yeni ekleme önizlemesini etkiler; çubuktan Oto/Yatay/Dikey seçilince sıfırlanır. */
window.addEventListener('keydown',e=>{
  if(mode!=='park' || (e.key||'').toLowerCase()!=='r') return;
  if(e.ctrlKey||e.metaKey||e.altKey) return;
  const t=e.target, tag=t&&t.tagName;
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(t&&t.isContentEditable)) return;
  e.preventDefault();
  const cur = (parkGhostVert!=null)? parkGhostVert : !!(plan&&plan.parking&&plan.parking.vertical);
  parkGhostVert = !cur;
  if(parkLastSx!=null){ hoverBay=hitBay(parkLastSx,parkLastSy);
    parkGhost = hoverBay==null? parkGhostAt(parkLastSx,parkLastSy) : null;
    svg.style.cursor = hoverBay!=null? 'pointer' : ((parkGhost&&!parkGhost.invalid)?'copy':'not-allowed'); }
  render();
});
/* CEPHE-2 C4: İMKAN yatay/dikey döndürme — masaüstü R + dokunmatik "Döndür" butonu ORTAK yolu.
   Amenity bar placeholder'ı R diyordu ama handler yoktu (masaüstü açığı). Buton olayı (interaction.js
   bind) ve R tuşu ikisi de bunu çağırır → dokunmatik parite (touch'ta R tuşu yok). */
function toggleAmenityOrient(){
  if(mode!=='amenity') return;
  amenityGhostVert = !(amenityGhostVert!=null? amenityGhostVert : false);
  if(amenityLastSx!=null){ hoverAmenity=hitAmenity(amenityLastSx,amenityLastSy);
    amenityGhost = hoverAmenity==null? amenityGhostAt(amenityLastSx,amenityLastSy) : null; }
  render();
}
window.addEventListener('keydown',e=>{
  if(mode!=='amenity' || (e.key||'').toLowerCase()!=='r') return;
  if(e.ctrlKey||e.metaKey||e.altKey) return;
  const t=e.target, tag=t&&t.tagName;
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(t&&t.isContentEditable)) return;
  e.preventDefault(); toggleAmenityOrient();
});
/* B3: modlara tek-tuş kısayol (modifier'sız). İlgili araç düğmesini tıklar →
   pro-only/site/park görünürlüğü ve tSite toggle mantığı otomatik korunur.
   Space/Esc/Ctrl+Z/Y'ye DOKUNMAZ (ayrı handler'lar); form alanı + sürükleme ortasında YUTULUR. */
const MODE_KEYS={d:'tDraw',o:'tRoom',k:'tDoor',w:'tWin',b:'tBalk',a:'tAvlu',y:'tStruct',p:'tParcel',t:'tPark',i:'tAmenity',s:'tSite'};
window.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey) return;          // Ctrl/Cmd/Alt kombinasyonları başka handler'larda
  if(dragging) return;                                 // sürükleme ortasında mod değişimi yok (B1 dragOverlay yarım kalmasın)
  const t=e.target, tag=t&&t.tagName;
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(t&&t.isContentEditable)) return;
  const id=MODE_KEYS[(e.key||'').toLowerCase()];
  if(!id) return;
  const btn=document.getElementById(id);
  // yalnız GERÇEKTEN kullanılamaz düğme (pro-only kapalı / site kapalı / park yok — düğmenin KENDİ display'i none) → kısayol yok.
  // Collapsed toolbar kısayolu KAPATMAZ: ata .tbgrp display:none olsa da düğmenin kendi computed display'i 'flex' kalır → aktif (bilinçli; kısayol tam da toolbar gizliyken değerli).
  if(!btn || btn.disabled || getComputedStyle(btn).display==='none') return;
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
  if(e.type==='window'){ windowRestore(e.prev); hoverWindow=null; if(typeof updateWindowPanel==='function') updateWindowPanel(); render(); return true; }
  if(e.type==='park'){ if(plan&&e.prev){ plan.parking=e.prev; hoverBay=null; parkGhost=null;
    runChecks(); render(); if(floorsOn()) villaFloors[activeFloor]=stateSnapshot(true); } return true; }
  if(e.type==='amenity'){ amenities=(e.prev||[]).map(a=>({...a})); hoverAmenity=null; amenityGhost=null;
    if(plan) runChecks(); render(); if(floorsOn()) villaFloors[activeFloor]=stateSnapshot(true); return true; }
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
  } else if(e.type==='bounddraw'){
    /* P3: yerleşim öncesi sınır köşe düzenlemesinin geri-alımı (generate YOK) */
    pts=e.prevPts.map(p=>({...p}));
    document.getElementById('stArea').textContent=fmt(shoelace(pts))+' m²';
    document.getElementById('stPerim').textContent=fmt(perim(pts))+' m';
    render();
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
  /* S4a: site modunda blok sınırı başka bir blokla çakışamaz (ya da parsel dışına taşamaz) →
     kapatma reddedilir, son köşe geri alınabilsin diye çizim açık bırakılır. */
  if(typeof siteOn==='function' && siteOn() && typeof blockDrawValidity==='function'){
    const v=blockDrawValidity(pts);
    if(!v.ok){
      setStatusHint(v.reason==='block'
        ? 'Blok '+v.name+' ile çakışıyor — sınırı başka bir bloğun üstünden geçiremezsiniz. Son köşeyi geri alıp yeniden çizin.'
        : 'Sınır parsel dışına taşıyor — parsel içinde kalacak şekilde çizin.', '#c0392b');
      render();
      return;   // kapatma reddi: closed=false kalır, kullanıcı köşeyi düzeltir
    }
  }
  closed=true; hoverP=null; blockDrawBad=null;
  document.getElementById('genBtn').disabled=false;
  document.getElementById('stArea').textContent=fmt(shoelace(pts))+' m²';
  document.getElementById('stPerim').textContent=fmt(perim(pts))+' m';
  if(typeof updateAmenityBtn==='function') updateAmenityBtn();   // F1: bina sınırı kapanınca imkan düğmesi görünür (yerleşim beklemeden keşfedilebilir)
  if(typeof siteOn==='function' && siteOn()) setStatusHint('Blok sınırı kapandı — "Yerleşimi Oluştur" ile daireleri yerleştirin.','#2f6f8f');
  render();
}
/* serbest oda çizimi: kısa uyarı baloncuğu (canvasWrap'a, ~1,6 sn) */
function roomDrawToast(msg, dur){
  let t=document.getElementById('drawToast');
  if(!t){ t=document.createElement('div'); t.id='drawToast';
    (document.getElementById('canvasWrap')||document.body).appendChild(t); }
  t.textContent=msg;
  // uzun bilgi mesajı (U2) sarabilsin; kısa toast'lar tek satır kalır
  t.classList.toggle('wide', (msg||'').length>60);
  t.classList.add('show');
  clearTimeout(roomDrawToast._t); roomDrawToast._t=setTimeout(()=>t.classList.remove('show'), dur||1600);
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
/* I2 (UI-İPUCU-2): park yeri hangi bölge tiplerine konabilir. Otopark HER katta uygundur;
   sığınak KATINDA taban zeminin çoğu SIĞINAK bölgesidir (beton bodrum) → kullanıcı orada da
   araç yerleştirebilmeli ("sadece silebiliyorum, ekleyemiyorum" = otopark-dışı zemine tıklıyordu).
   Kat kullanımından bağımsız olarak BÖLGE TİPİNE bakılır; çekirdek/koridor/dış hariç. */
function bayPlaceableType(t){
  if(t==='otopark') return true;
  if(t==='siginak' && plan && plan.katKullanim==='siginak') return true; // sığınak katı: sığınak zemini de park-uygun
  return false;
}
/* park yeri tümüyle park-uygun bölgede mi (çekirdek/koridor/duvar/dış değil) — ekleme/önizleme denetimi */
function bayAreaOk(b){
  if(!plan) return false;
  const a=(b.ang||0)*Math.PI/180, c=Math.cos(a), s=Math.sin(a), cx=b.x+b.w/2, cy=b.y+b.h/2;
  for(let dx=-b.w/2+0.25; dx<b.w/2; dx+=0.5)
    for(let dy=-b.h/2+0.25; dy<b.h/2; dy+=0.5){
      const wx=cx+dx*c-dy*s, wy=cy+dx*s+dy*c;
      const col=Math.floor((wx-plan.minX)/M), row=Math.floor((wy-plan.minY)/M);
      if(row<0||col<0||row>=plan.rows||col>=plan.cols) return false;
      const j=row*plan.cols+col;
      if(!plan.inside[j]||plan.cm[j]<0||!bayPlaceableType(plan.regions[plan.cm[j]].type)) return false;
    }
  return true;
}
/* I4 (UI-İPUCU-2): iki park dikdörtgeni (ang derece) çakışıyor mu — SAT (ayrık-eksen). skip=
   kendi index'i (taşımada). Yeni ekleme mevcut park yerlerinin ÜSTÜNE düşmesin. */
function bayCorners(b){
  const a=(b.ang||0)*Math.PI/180, c=Math.cos(a), s=Math.sin(a), cx=b.x+b.w/2, cy=b.y+b.h/2, hw=b.w/2, hh=b.h/2;
  return [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]].map(([dx,dy])=>({x:cx+dx*c-dy*s, y:cy+dx*s+dy*c}));
}
function polyOverlapSAT(A,B){
  const axes=[];
  [A,B].forEach(P=>{ for(let i=0;i<4;i++){ const p=P[i], q=P[(i+1)%4]; axes.push({x:-(q.y-p.y), y:q.x-p.x}); } });
  for(const ax of axes){
    let aMin=Infinity,aMax=-Infinity,bMin=Infinity,bMax=-Infinity;
    A.forEach(p=>{ const d=p.x*ax.x+p.y*ax.y; if(d<aMin)aMin=d; if(d>aMax)aMax=d; });
    B.forEach(p=>{ const d=p.x*ax.x+p.y*ax.y; if(d<bMin)bMin=d; if(d>bMax)bMax=d; });
    if(aMax<bMin+1e-6 || bMax<aMin+1e-6) return false; // ayrık eksen bulundu → çakışma yok
  }
  return true;
}
function bayOverlapsExisting(b, skip){
  if(!plan||!plan.parking||!plan.parking.bays) return false;
  const A=bayCorners(b);
  const bays=plan.parking.bays;
  for(let i=0;i<bays.length;i++){ if(i===skip) continue;
    if(polyOverlapSAT(A, bayCorners(bays[i]))) return true; }
  return false;
}
/* imleç altında eklenebilecek park yeri önizlemesi (yöne göre yatay/dikey).
   invalid: park-uygun alan dışında ya da mevcut bir park yeriyle çakışıyor → KIRMIZI hayalet,
   eklemede reddedilir (mobilya geçersiz-bırakma deseniyle tutarlı). Alanın tümüyle dışındaysa
   (bina dışı/çekirdek) hiç gösterilmez (null); yalnız "yaklaştı ama geçersiz" durumunda kırmızı. */
function parkGhostAt(sx,sy){
  if(!plan||!plan.parking) return null;
  // U3: R ile çevirme aktifse (parkGhostVert!==null) o yönü kullan; yoksa çubuk yönü.
  const vert = (parkGhostVert!=null)? parkGhostVert : !!plan.parking.vertical;
  const w=(vert?REG.parkBayLen:REG.parkBayWid), h=(vert?REG.parkBayWid:REG.parkBayLen);
  const b={x:snapG(S2Wx(sx)-w/2), y:snapG(S2Wy(sy)-h/2), w, h, ang:0};
  const areaOk=bayAreaOk(b);
  if(!areaOk){
    // I4: park alanına DEĞİYOR ama tam oturmuyor → kırmızı uyarı hayaleti; tam dışıysa gizle
    return bayTouchesPark(b)? {...b, invalid:true} : null;
  }
  if(bayOverlapsExisting(b, -1)) return {...b, invalid:true}; // I4: mevcut park üstüne
  return b;
}
/* park yerinin merkezi park-uygun bir bölgeye düşüyor mu (kırmızı uyarıyı yalnız park
   alanına yakınken göster; bina dışı/çekirdek boşluğunda hiç hayalet çıkmasın) */
function bayTouchesPark(b){
  const cx=b.x+b.w/2, cy=b.y+b.h/2;
  const col=Math.floor((cx-plan.minX)/M), row=Math.floor((cy-plan.minY)/M);
  if(row<0||col<0||row>=plan.rows||col>=plan.cols) return false;
  const j=row*plan.cols+col;
  return plan.inside[j] && plan.cm[j]>=0 && bayPlaceableType(plan.regions[plan.cm[j]].type);
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
  hoverBay=null; parkGhost=null; parkGhostVert=null; // U3: çubuk yönü seçildi → R override'ı sıfırla
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

/* ===================== S3: SİTE İMKANLARI (parsel-katmanı) =====================
   Park yeri (bay) ailesinin PARSEL-katmanı akrabası: aynı vektör dikdörtgen + SAT çakışma
   (bayCorners/polyOverlapSAT ORTAK) + R döndürme + kırmızı hayalet deseni. FARK: park yeri
   plan ızgarasında (bina içi) yaşar; imkan PARSEL bahçesinde (bina footprint'i DIŞI) dünya
   koordinatında yaşar → site-ORTAK (blocks[] snapshot'larına değil global amenities[]'e). */
function amenitySnapshot(){ return amenities.map(a=>({...a})); }
function amenityDef(t){ return (REG.amenities&&REG.amenities[t])||REG.amenities.green; }
/* imkan yerleşim geçerli mi: (1) parsel İÇİNDE (parsel çizilmemişse serbest), (2) TÜM bina
   footprint'lerinin DIŞINDA (site modunda tüm bloklar), (3) örneklenen tüm noktalar sağlar. */
function amenityAreaOk(a){
  const cx=a.x+a.w/2, cy=a.y+a.h/2, ang=(a.ang||0)*Math.PI/180, c=Math.cos(ang), s=Math.sin(ang);
  const foots=buildingFootprints();
  const haveParcel = parcelClosed && parcelPts.length>=3;
  for(let dx=-a.w/2+0.4; dx<a.w/2; dx+=0.8)
    for(let dy=-a.h/2+0.4; dy<a.h/2; dy+=0.8){
      const wx=cx+dx*c-dy*s, wy=cy+dx*s+dy*c;
      if(haveParcel && !pip(wx,wy,parcelPts)) return false;   // parsel dışına taşamaz
      for(let i=0;i<foots.length;i++){ if(pip(wx,wy,foots[i])) return false; } // bina üstüne konamaz
    }
  return true;
}
/* düzenlenen + diğer blokların bina konturları (dünya koord poligonları) — imkan bunların dışında kalmalı */
function buildingFootprints(){
  const out=[];
  if(typeof siteOn==='function' && siteOn() && typeof siteBlocksData==='function'){
    siteBlocksData().forEach(bd=>{ if(bd.pts&&bd.pts.length>=3) out.push(bd.pts); });
  } else if(closed && pts.length>=3){ out.push(pts); }
  return out;
}
/* imkan merkezi parsel içinde mi (kırmızı uyarıyı yalnız parsele yakınken göster) */
function amenityTouchesSite(a){
  const cx=a.x+a.w/2, cy=a.y+a.h/2;
  if(parcelClosed && parcelPts.length>=3) return pip(cx,cy,parcelPts);
  return true;   // parsel yok → her yerde serbest (kırmızı yalnız çakışmadan gelir)
}
/* imkan başka bir imkanla çakışıyor mu (SAT — park yeriyle ORTAK bayCorners/polyOverlapSAT). skip=kendi index'i */
function amenityOverlapsExisting(a, skip){
  const A=bayCorners(a);
  for(let i=0;i<amenities.length;i++){ if(i===skip) continue;
    if(polyOverlapSAT(A, bayCorners(amenities[i]))) return true; }
  // park yerleriyle de çakışmasın (bina içi park kat-özel, ama parsel görünümünde üst üste binmesin)
  if(plan && plan.parking && plan.parking.bays){
    for(let i=0;i<plan.parking.bays.length;i++){ if(polyOverlapSAT(A, bayCorners(plan.parking.bays[i]))) return true; }
  }
  return false;
}
/* dünya noktası imkan dikdörtgeni içinde mi → index | null (park hitBay ile aynı ang-unrotate mantığı) */
function hitAmenity(sx,sy){
  const wx=S2Wx(sx), wy=S2Wy(sy);
  for(let i=amenities.length-1;i>=0;i--){ const a=amenities[i];
    let px=wx-(a.x+a.w/2), py=wy-(a.y+a.h/2);
    if(a.ang){ const t=-a.ang*Math.PI/180, c=Math.cos(t), s=Math.sin(t); const nx=px*c-py*s, ny=px*s+py*c; px=nx; py=ny; }
    if(Math.abs(px)<=a.w/2+0.02 && Math.abs(py)<=a.h/2+0.02) return i;
  }
  return null;
}
/* İMKAN-BOYUT: aktif tipin YATAY (eksen-hizalı, ang 0) taban boyutu — tip-başına hatırlanmış
   varsa o, yoksa katalog varsayılanı (def.w/def.h). Hayalet + döndürme bu tabandan türer. */
function amenityBaseSize(t){
  const def=amenityDef(t), r=amenityGhostSize[t];
  return { w:(r&&r.w)||def.w, h:(r&&r.h)||def.h };
}
/* imleç altında eklenebilecek imkan önizlemesi (aktif tip + R yönü + HATIRLANAN boyut).
   Geçersizse (parsel dışı / bina üstü / çakışma) KIRMIZI hayalet; parsele hiç yaklaşmadıysa gizle
   (null) — park deseniyle bir. */
function amenityGhostAt(sx,sy){
  const base=amenityBaseSize(amenityType);
  const vert = (amenityGhostVert!=null)? amenityGhostVert : false;
  const w = vert? base.h : base.w, h = vert? base.w : base.h;
  const a={type:amenityType, x:snapG(S2Wx(sx)-w/2), y:snapG(S2Wy(sy)-h/2), w, h, ang:0};
  if(!amenityAreaOk(a)) return amenityTouchesSite(a)? {...a, invalid:true} : null;
  if(amenityOverlapsExisting(a, -1)) return {...a, invalid:true};
  return a;
}
function amenityEditRefresh(){ runChecks(); render();
  if(floorsOn()) villaFloors[activeFloor]=stateSnapshot(true); }
/* H1b: imkan BOYUTLANDIRMA — seçili/hover imkanın köşe/kenar tutamaçları (avlu hitAvluHandle deseni).
   Yalnız ang===0 (eksen-hizalı) imkanlarda; döndürülmüş (R ile 90°) imkan yine w/h swap'lı kalır ama
   köşe boyutlandırma eksen-hizalıya odaklanır (basit + güvenli). part: nw/ne/se/sw · n/s/e/w · body. */
const AMENITY_MIN=2;   // brief: asgari 2×2 m (tip min'i daha küçük olsa da bu taban uygulanır)
function amenityHandleTol(){ return Math.max(0.3, 7*HITSC/pxPerM); }
function amenityBBox(a){ return { minX:a.x, minY:a.y, maxX:a.x+a.w, maxY:a.y+a.h }; }
function hitAmenityHandle(sx,sy){
  if(typeof amenities==='undefined' || !amenities.length) return null;
  const wx=S2Wx(sx), wy=S2Wy(sy), tol=amenityHandleTol();
  for(let i=amenities.length-1;i>=0;i--){ const a=amenities[i];
    if(a.ang) continue;   // döndürülmüş imkan: köşe tutamacı yok (taşı/sil + bar +/- ile boyutlanır)
    const bb=amenityBBox(a);
    const corners=[['nw',bb.minX,bb.minY],['ne',bb.maxX,bb.minY],['se',bb.maxX,bb.maxY],['sw',bb.minX,bb.maxY]];
    for(const [part,cx,cy] of corners){ if(Math.abs(wx-cx)<tol && Math.abs(wy-cy)<tol) return {i,part}; }
    const onX = wx>bb.minX-tol && wx<bb.maxX+tol, onY = wy>bb.minY-tol && wy<bb.maxY+tol;
    if(onX && Math.abs(wy-bb.minY)<tol) return {i,part:'n'};
    if(onX && Math.abs(wy-bb.maxY)<tol) return {i,part:'s'};
    if(onY && Math.abs(wx-bb.minX)<tol) return {i,part:'w'};
    if(onY && Math.abs(wx-bb.maxX)<tol) return {i,part:'e'};
  }
  return null;
}
const amenityCursor={n:'ns-resize',s:'ns-resize',e:'ew-resize',w:'ew-resize',nw:'nwse-resize',se:'nwse-resize',ne:'nesw-resize',sw:'nesw-resize'};
/* boyutlandırma uygular: box0'dan part yönünde min AMENITY_MIN korunarak yeni x/y/w/h; imkan dünya-koord {x,y,w,h}. */
function amenityResizeBox(box0, part, wx, wy){
  let {minX,minY,maxX,maxY}=box0;
  if(part.indexOf('n')>=0) minY=Math.min(wy, maxY-AMENITY_MIN);
  if(part.indexOf('s')>=0) maxY=Math.max(wy, minY+AMENITY_MIN);
  if(part.indexOf('w')>=0) minX=Math.min(wx, maxX-AMENITY_MIN);
  if(part.indexOf('e')>=0) maxX=Math.max(wx, minX+AMENITY_MIN);
  return { x:minX, y:minY, w:maxX-minX, h:maxY-minY };
}
/* H1b: dokunmatik/kesin +/- boyut — seçili (son eklenen ya da hover) imkanı adımlı büyüt/küçült.
   delta: her eksende ±step (tip step'i); merkez sabit kalır; min AMENITY_MIN; çakışma/parsel guard'lı. */
function amenityResizeStep(idx, sign){
  if(typeof amenities==='undefined' || idx<0 || idx>=amenities.length) return false;
  const a=amenities[idx], def=amenityDef(a.type), step=(def&&def.step)||0.5;
  const prev=amenitySnapshot();
  const cx=a.x+a.w/2, cy=a.y+a.h/2;
  const nw=Math.max(AMENITY_MIN, a.w+sign*step), nh=Math.max(AMENITY_MIN, a.h+sign*step);
  const cand={type:a.type, x:snapG(cx-nw/2), y:snapG(cy-nh/2), w:nw, h:nh, ang:a.ang||0};
  if(!amenityAreaOk(cand) || amenityOverlapsExisting(cand, idx)){
    setStatusHint('İmkan bu boyutta parsel dışına/başka öğeye taşıyor — değiştirilmedi.','#b35a2e'); return false;
  }
  a.x=cand.x; a.y=cand.y; a.w=cand.w; a.h=cand.h;
  amenityRememberSize(a);
  pushEdit({type:'amenity', prev}); amenityEditRefresh(); return true;
}
/* İMKAN-BOYUT: yerleşmiş bir imkanın boyutunu o tipin HAYALET tabanı olarak hatırla (sonraki aynı-tip
   hayalet + yerleşen o boyda başlasın). Döndürülmüşte (ang≈90) on-screen w/h swap'lı → YATAY tabana
   normalize (h→w) çevirerek sakla. Min AMENITY_MIN taban. */
function amenityRememberSize(a){
  if(!a||!a.type) return;
  const rot = Math.abs(((a.ang||0)%180))===90;
  const w = Math.max(AMENITY_MIN, rot? a.h : a.w), h = Math.max(AMENITY_MIN, rot? a.w : a.h);
  amenityGhostSize[a.type]={ w:+w.toFixed(3), h:+h.toFixed(3) };
}
/* +/- bar için seçili imkan index'i: hover varsa o, yoksa son eklenen (varsa). */
function amenitySelIdx(){ if(hoverAmenity!=null) return hoverAmenity;
  return (typeof amenities!=='undefined' && amenities.length)? amenities.length-1 : -1; }
/* İMKAN-BOYUT: henüz yerleştirilmemiş HAYALETİ adımlı büyüt/küçült. Boyut aktif TİP için hatırlanır
   (amenityGhostSize) → sonraki aynı-tip hayalet + yerleşen imkan o boyda doğar. R döndürme tabanı
   YATAY (ang 0) w/h olarak tutar; hayalet vert ise ekranda swap edilir. Min AMENITY_MIN taban.
   Geçerlilik (kırmızı/normal) hayalet yeniden türetilerek ANINDA güncellenir. */
function amenityGhostResizeStep(sign){
  if(mode!=='amenity') return false;
  const def=amenityDef(amenityType), step=(def&&def.step)||0.5;
  const base=amenityBaseSize(amenityType);
  const nw=Math.max(AMENITY_MIN, +(base.w+sign*step).toFixed(3));
  const nh=Math.max(AMENITY_MIN, +(base.h+sign*step).toFixed(3));
  amenityGhostSize[amenityType]={w:nw, h:nh};
  if(amenityLastSx!=null){ hoverAmenity=hitAmenity(amenityLastSx,amenityLastSy);
    amenityGhost = hoverAmenity==null? amenityGhostAt(amenityLastSx,amenityLastSy) : null; }
  render(); return true;
}
function setAmenityType(t){
  if(!REG.amenities[t]) return;
  amenityType=t; amenityGhost=null; amenityGhostVert=null;
  showAmenityBar();
  if(amenityLastSx!=null){ hoverAmenity=hitAmenity(amenityLastSx,amenityLastSy);
    amenityGhost = hoverAmenity==null? amenityGhostAt(amenityLastSx,amenityLastSy) : null; }
  render();
}
function showAmenityBar(){
  const bar=document.getElementById('amenityBar'); if(!bar||!bar.querySelectorAll) return;
  bar.querySelectorAll('button[data-am]').forEach(b=>b.classList.toggle('active', b.dataset.am===amenityType));
}
/* İmkan butonu görünürlüğü: parsel çizili + bahçe var (bina parselden küçük) ya da her zaman
   erişilebilir — imkanlar parsel-katmanı, kat kullanımından bağımsız. Kolay erişim için DAİMA
   göster (yalnız bir plan/sınır varken); hiç bina yoksa gizle. */
function updateAmenityBtn(){
  const ab=document.getElementById('tAmenity'); if(!ab) return;
  const ok = !!(closed && pts.length>=3);
  ab.style.display = ok? '' : 'none';
  if(!ok && mode==='amenity') setMode('draw');
}
/* araç çubuğu */
/* B2: mod rozeti — aktif mod adı + tek satır ipucu (emoji YOK; ikon inline SVG).
   Varsayılan modlar (draw/pan) sade kalsın diye rozet gizlenir; park kendi çubuğunu gösterir. */
const MODE_BADGE={
  draw:    {ic:'draw',      name:'Çiz',     key:'D', hint:'Tıkla: köşe ekle · çift-tık ya da ilk köşeye tık: sınırı kapat · Space: geçici kaydır'},
  parcel:  {ic:'parcel',    name:'Parsel',  key:'P', hint:'Tıkla: köşe ekle · ilk köşeye tık: kapat · Geri Al: son köşeyi sil'},
  balkon:  {ic:'balcony',   name:'Balkon',  key:'B', hint:'Dış duvara tıkla: balkon ekle · tutamaçtan boyutlandır · sağ tık ya da Del: sil'},
  avlu:    {ic:'avlu',      name:'Avlu',    key:'A', hint:'Boşlukta sürükle: yeni avlu · gövde: taşı · kenar/köşe: boyutlandır · sağ tık: sil'},
  door:    {ic:'door',      name:'Kapı',    key:'K', hint:'Kapıyı sürükle: komşu duvara taşı · çift-tık: kapı ekle/sil'},
  window:  {ic:'window',    name:'Pencere', key:'W', hint:'Cepheye çift-tık: pencere ekle · sürükle: taşı · çift-tık: sil · seç: genişlik/yükseklik/parapet ayarla'},
  struct:  {ic:'structure', name:'Yapı',    key:'Y', hint:'Çekirdek ve bina köşe tutamaçlarından sürükleyerek boyutlandır'},
  roomdraw:{ic:'roomdraw',  name:'Oda Çiz', key:'O', hint:'Daire üstüne kapalı poligon çiz: yeni oda · çift-tık ya da ilk köşe: kapat · Esc: iptal'},
  site:    {ic:'blok',      name:'Site',    key:'S', hint:'Blokları sürükleyerek yerleştir'}
  /* NOT: park modunun kendi alt çubuğu (#parkBar) var — "R=yatay/dikey döndür" orada; rozet
     eklenirse çubukla üst üste biner (mevcut tasarım kararı), bu yüzden bilinçle dışarıda. */
};
function updateModeBadge(m){
  const bg=document.getElementById('modeBadge'); if(!bg||!bg.querySelector) return; // test/DOM-stub ortamı: atla
  const info=MODE_BADGE[m];
  if(!info){ bg.style.display='none'; return; }
  const nm=bg.querySelector('.mbName'), hn=bg.querySelector('.mbHint'); if(!nm||!hn) return;
  /* I5b: araç adının yanında KLAVYE KISAYOLU — "Çiz (D)" formatı; ipucu satırı aracın kullanımı. */
  const nameHtml=info.name+(info.key?' <span class="mbKey">('+info.key+')</span>':'');
  nm.innerHTML=(typeof icon==='function'?icon(info.ic):'')+'<span>'+nameHtml+'</span>';
  hn.textContent=info.hint;
  bg.style.display='flex';
  /* villa/site sekmeleri ya da park çubuğu görünüyorsa rozeti bir satır aşağı it */
  const shown=id=>{ const e=document.getElementById(id); return e && getComputedStyle(e).display!=='none'; };
  bg.classList.toggle('shifted', shown('floorTabs')||shown('blockTabs'));
}
const setMode=m=>{ mode=m; hoverP=null; blockDrawBad=null; hoverBalk=null; hoverDoor=null; hoverWindow=null; selWindow=null; hoverStruct=null; hoverBay=null; parkGhost=null; parkGhostVert=null; avluGhost=null; avluDragIdx=-1; roomPts=[]; hoverCut=null; hoverStructH=null; hoverAmenity=null; amenityGhost=null; amenityGhostVert=null; setStatusHint('');
  /* OTO-AVLU (avlu-rework): avlu moduna girince derin/karanlık footprint için nazik öneri hesapla.
     Dayatma YOK — statusHint + tıkla-yerleştir aday ghost; başka moda geçince temizlenir. */
  avluSuggestion=null;
  if(m==='avlu' && plan && closed && typeof suggestCourtyard==='function'){
    try{ avluSuggestion=suggestCourtyard(); }catch(err){ avluSuggestion=null; }
    if(avluSuggestion) setStatusHint('Bu taban derin/karanlık — orta bölge için avlu önerilir. Önerilen boşluğa tıkla ya da kendin sürükle.','#2f6f8f');
  }
  for(const[id,mm]of[['tDraw','draw'],['tParcel','parcel'],['tBalk','balkon'],['tAvlu','avlu'],['tDoor','door'],['tWin','window'],['tStruct','struct'],['tRoom','roomdraw'],['tPark','park'],['tAmenity','amenity'],['tSite','site'],['tPan','pan']]){
    const elb=document.getElementById(id); if(elb) elb.classList.toggle('active',m===mm); }
  const pb=document.getElementById('parkBar'); if(pb) pb.style.display=(m==='park')?'flex':'none';
  if(m==='park') showParkBar();
  const amb=document.getElementById('amenityBar'); if(amb) amb.style.display=(m==='amenity')?'flex':'none';
  if(m==='amenity') showAmenityBar();
  if(typeof updateWindowPanel==='function') updateWindowPanel();
  updateModeBadge(m);
  positionOnb();
  svg.classList.toggle('panning',m==='pan'); render(); };
document.getElementById('tbToggle').onclick=()=>{
  const tb=document.getElementById('toolbar');
  const off=tb.classList.toggle('collapsed');
  document.getElementById('tbToggle').textContent=off?'»':'«';
  syncToolbarOverflow();
};
/* Araç çubuğu taşma göstergesi — KISA viewport'ta (ör. Mesken embed) ray boyu aşınca kullanıcı
   kaydırabileceğini + alt butonların (Örnek sınır/3B) varlığını GÖRSÜN: .tb-overflow → alt-solma maskesi
   (footer-benzeri dolu kenar hissini kırar), en alta gelince .tb-atbottom maskeyi kapatır (son ikon net). */
function syncToolbarOverflow(){
  const tb=document.getElementById('toolbar'); if(!tb) return;
  const over=tb.scrollHeight - tb.clientHeight > 2;
  tb.classList.toggle('tb-overflow', over);
  tb.classList.toggle('tb-atbottom', over && (tb.scrollTop >= tb.scrollHeight - tb.clientHeight - 2));
}
{ const tb=document.getElementById('toolbar');
  if(tb) tb.addEventListener('scroll', syncToolbarOverflow, {passive:true});
  window.addEventListener('resize', syncToolbarOverflow);
  syncToolbarOverflow();
  // ilk ölçüm layout'tan önce olabilir → bir tur sonra tekrar dene
  if(typeof requestAnimationFrame==='function') requestAnimationFrame(syncToolbarOverflow);
}
/* I5a (UI-İPUCU-2): TOOLBAR HOVER TOOLTIP kök nedeni — #toolbar overflow-y:auto (kısa viewport'ta
   kaydırma) + overflow-x:hidden, CSS'te ::after tooltip'i left:calc(100%+10px) ile rayın SAĞINA
   koyuyordu ama overflow-kutusu onu KIRPIYORDU (hiç görünmüyordu). Çözüm: CSS ::after yerine
   body'ye eklenen TEK paylaşımlı tooltip'i JS ile konumla → kırpma kutusundan kaçar, her
   viewport'ta çalışır. Görsel dil aynen: rayın sağında, koyu balon, "Çiz (D)" formatı. */
/* 2026-07-07 genişletme: TÜM [data-tip] öğeleri bu balondan (belge-geneli delege).
   Eski genel CSS ::after ipuçları viewport kenarını bilmediğinden sekmelerde TAŞIYORDU —
   kaldırıldı; burada boyut ölçülüp kenara KELEPÇELENİR, alta sığmazsa ÜSTE açılır.
   Toolbar içindekiler eski dilde rayın SAĞINA açılmaya devam eder. */
(function(){
  if(typeof document==='undefined' || !document.addEventListener || !document.body) return;
  let tip=null;
  const ensureTip=()=>{ if(tip) return tip;
    tip=document.createElement('div'); tip.id='tbTip'; document.body.appendChild(tip); return tip; };
  const M=8, GAP=7;
  const show=el=>{ const txt=el.getAttribute('data-tip'); if(!txt) return;
    const t=ensureTip(); t.textContent=txt;
    t.style.left='-9999px'; t.style.top='0px'; t.classList.add('show');   // önce görünmez ölç
    const w=t.offsetWidth, h=t.offsetHeight, r=el.getBoundingClientRect();
    const vw=window.innerWidth, vh=window.innerHeight;
    if(el.closest && el.closest('#toolbar')){                 // ray: sağa açılır (mevcut dil)
      t.style.left=Math.min(r.right+10, vw-w-M)+'px';
      t.style.top=Math.max(M, Math.min(r.top+r.height/2-h/2, vh-h-M))+'px';
    } else {                                                  // genel: altına, kelepçeli; sığmazsa üstüne
      let x=r.left+r.width/2-w/2; x=Math.max(M, Math.min(x, vw-w-M));
      let y=r.bottom+GAP; if(y+h>vh-M) y=r.top-GAP-h; if(y<M) y=M;
      t.style.left=x+'px'; t.style.top=y+'px';
    } };
  const hide=()=>{ if(tip) tip.classList.remove('show'); };
  document.addEventListener('mouseover',e=>{
    const b=e.target.closest && e.target.closest('[data-tip]');
    if(b) show(b); else hide();
  });
  document.addEventListener('mouseleave',hide);
  window.addEventListener('scroll',hide,{passive:true,capture:true});
  document.addEventListener('pointerdown',hide,true);
})();
/* onboarding ("Nasıl kullanılır?") kutusu kaldırıldı (kullanıcı isteği). */
document.getElementById('tDraw').onclick=()=>setMode('draw');
document.getElementById('tParcel').onclick=()=>setMode('parcel');
document.getElementById('tBalk').onclick=()=>setMode('balkon');
document.getElementById('tAvlu').onclick=()=>setMode('avlu');
document.getElementById('tDoor').onclick=()=>setMode('door');
{ const tw=document.getElementById('tWin'); if(tw) tw.onclick=()=>setMode('window'); }
/* seçili pencere ayar paneli: genişlik + yükseklik + parapet + tam boy cam.
   Değişiklikler otomatik pencerede windowOverrides[key]'e, ekstra pencerede
   extraWindows[i]'ye yazılır; canlı render + geçmişe tek 'window' düzenlemesi. */
function winRecForKey(key){ return (typeof computeWindows==='function'?computeWindows():[]).find(w=>w.key===key)||null; }
function setWinField(key, field, val){
  const rec=winRecForKey(key); if(!rec) return;
  const target = (rec.i!=null) ? extraWindows[rec.i] : (windowOverrides[key]||(windowOverrides[key]={}));
  if(!target) return;
  target[field]=val;
  if(typeof runChecks==='function' && plan) render(); else render();
}
function updateWindowPanel(){
  const wp=document.getElementById('winPanel'); if(!wp) return;
  if(mode!=='window' || !selWindow){ wp.style.display='none'; wp.innerHTML=''; return; }
  const rec=winRecForKey(selWindow); if(!rec){ wp.style.display='none'; wp.innerHTML=''; selWindow=null; return; }
  const P=REG.pencere;
  const w=(typeof winWidthM==='function')?winWidthM(rec):(rec.w||P.wDef);
  const full=!!rec.full;
  const h=(typeof winHeightM==='function')?winHeightM(rec):(rec.height!=null?rec.height:P.h);
  const sill=(typeof winSillM==='function')?winSillM(rec):(rec.sill!=null?rec.sill:P.sill);
  wp.innerHTML=
    '<div class="wpH">Pencere'+(rec.roomType?(' · '+rec.roomType):'')+'</div>'+
    '<div class="wpR"><label>Genişlik</label><input type="range" id="wpW" min="0.6" max="3" step="0.1" value="'+w.toFixed(1)+'"><span class="wpV" id="wpWv">'+fmt(w)+' m</span></div>'+
    '<div class="wpR"><label>Yükseklik</label><input type="range" id="wpH" min="0.6" max="2.7" step="0.1" value="'+h.toFixed(1)+'"'+(full?' disabled':'')+'><span class="wpV" id="wpHv">'+fmt(h)+' m</span></div>'+
    '<div class="wpR"><label>Parapet</label><input type="range" id="wpS" min="0" max="1.5" step="0.05" value="'+sill.toFixed(2)+'"'+(full?' disabled':'')+'><span class="wpV" id="wpSv">'+fmt(sill)+' m</span></div>'+
    '<div class="wpR wpChk"><label for="wpFull">Tam boy cam</label><input type="checkbox" id="wpFull"'+(full?' checked':'')+'></div>'+
    '<div class="wpNote">Genişlik 2B\'de görünür · yükseklik/parapet 3B\'yi etkiler · çift-tık sil</div>';
  wp.style.display='block';
  let liveUndo=null;
  const beginEdit=()=>{ if(!liveUndo) liveUndo=windowSnapshot(); };
  const commitEdit=()=>{ if(liveUndo){ if(JSON.stringify(liveUndo)!==JSON.stringify(windowSnapshot())) pushEdit({type:'window', prev:liveUndo}); liveUndo=null; } };
  const wire=(id,vid,field,unit)=>{ const inp=wp.querySelector('#'+id), lab=wp.querySelector('#'+vid); if(!inp) return;
    inp.oninput=()=>{ beginEdit(); if(lab) lab.textContent=fmt(+inp.value)+' '+unit; setWinField(selWindow, field, +inp.value); };
    inp.onchange=commitEdit; };
  wire('wpW','wpWv','w','m'); wire('wpH','wpHv','height','m'); wire('wpS','wpSv','sill','m');
  const fc=wp.querySelector('#wpFull');
  if(fc) fc.onchange=()=>{ beginEdit(); setWinField(selWindow,'full',fc.checked); commitEdit(); updateWindowPanel(); };
}
document.getElementById('tStruct').onclick=()=>setMode('struct');
{ const tr=document.getElementById('tRoom'); if(tr) tr.onclick=()=>setMode('roomdraw'); }
document.getElementById('tPark').onclick=()=>setMode('park');
/* S3-FIX (F1): site imkanları düğmesine tık = imkan moduna geç. S3 commit'i düğmeyi + modu +
   pointer işleyicilerini + setMode kaydını ekledi ama BU onclick bağını unuttu → düğme (ve onu
   .click()'leyen "I" kısayolu) ölüydü. Diğer araç düğmeleriyle aynı desen. */
{ const am=document.getElementById('tAmenity'); if(am) am.onclick=()=>setMode('amenity'); }
{ const sb=document.getElementById('tSite'); if(sb) sb.onclick=()=>{ if(siteOn()) setMode(mode==='site'?'draw':'site'); }; }
document.getElementById('tPan').onclick=()=>setMode('pan');
/* U2 → SAHA-1/H3: eski BLOKLAYAN kapı (stopImmediatePropagation + generic engelleme) KALDIRILDI.
   Konut-dışı katta 3B artık ENGELLENMEZ, OTOMATİK YÖNLENDİRİLİR: view3d.js boot() içindeki
   nonResidentialFallback() konut katı varsa oraya geçip iç 3B açar (+ bilgi toast'u), yoksa dış
   (Bina) görünümü açar. Tüm giriş yolları (kabuk 3B / prototip adım-2 / kat-geçişi) boot ortak
   kapısından geçtiği için tek yerde ele alınır. Buradaki capture-guard artık view3d'nin kendi
   handler'ını çalıştırmasını engellememeli — bu yüzden tamamen kaldırıldı. */
/* park düzeni çubuğu: yön + sıfırla */
if(typeof document.querySelectorAll==='function')
  document.querySelectorAll('#parkBar button[data-orient]').forEach(b=>b.onclick=()=>setParkOrient(b.dataset.orient));
{ const pr=document.getElementById('parkReset'); if(pr) pr.onclick=()=>setParkOrient('auto'); }
/* S3: site imkanları çubuğu — tip seçimi (data-am) */
if(typeof document.querySelectorAll==='function')
  document.querySelectorAll('#amenityBar button[data-am]').forEach(b=>b.onclick=()=>setAmenityType(b.dataset.am));
/* C4: imkan Döndür butonu (dokunmatik parite — R tuşunun buton karşılığı) */
{ const ar=document.getElementById('amenityRot'); if(ar) ar.onclick=()=>toggleAmenityOrient(); }
/* H1b + İMKAN-BOYUT: imkan Büyüt/Küçült — dokunmatik/kesin boyutlandırma (köşe tutamacının buton
   karşılığı). İKİ durumu da boyutlandırır:
     (1) imleç YERLEŞMİŞ bir imkanın üstündeyse (hover) → o imkanı boyutlandırır (H1b);
     (2) aksi halde (imkan modunda, hayalet varken) → YERLEŞTİRME HAYALETİNİ boyutlandırır
         → tip-başına hatırlanır, sonraki hayalet + yerleşen imkan o boyda doğar (İMKAN-BOYUT).
   Kök neden düzeltmesi: buton eskiden yalnız amenitySelIdx()>=0 (yerleşmiş) yola bağlıydı →
   yerleştirmeden ÖNCE küçültme yapılamıyordu. */
function amenityBarResize(sign){
  if(hoverAmenity!=null) return amenityResizeStep(hoverAmenity, sign);   // yerleşmiş imkan (hover)
  if(mode==='amenity') return amenityGhostResizeStep(sign);               // yerleştirme hayaleti
  const i=amenitySelIdx();                                                // düşüş: son eklenen
  if(i<0){ setStatusHint('Önce bir imkan ekleyip üstüne gel (ya da hayaleti bahçeye getir).','#b35a2e'); return false; }
  return amenityResizeStep(i,sign);
}
{ const ab=document.getElementById('amenityBigger'); if(ab) ab.onclick=()=>amenityBarResize(+1); }
{ const as=document.getElementById('amenitySmaller'); if(as) as.onclick=()=>amenityBarResize(-1); }
document.getElementById('tUndo').onclick=()=>{
  if(mode==='parcel'){ if(parcelClosed){ parcelClosed=false; } else parcelPts.pop(); balkChecksRefresh(); render(); return; }
  if(undoEdit()) return; // önce elle duvar/ayırıcı/balkon düzenlemeleri
  if(closed&&plan&&!confirm('Geri alınacak düzenleme kalmadı. Plan SİLİNİP çizim aşamasına dönülsün mü?')) return; // emniyet: saatlik emek tek tıkla gitmesin
  if(closed){closed=false;plan=null;balconies=[];editHistory=[];redoHistory=[];document.getElementById('genBtn').disabled=true;document.getElementById('unitTable').style.display='none';} else pts.pop(); resetCuts(); render(); };
document.getElementById('tRedo').onclick=()=>{ redoEdit(); };
document.getElementById('tHist').onclick=()=>{ const p=document.getElementById('histPanel');
  if(p){ const open=p.style.display==='none'||!p.style.display; p.style.display=open?'flex':'none'; if(open) refreshHistoryUI(true); } };
document.getElementById('tClear').onclick=()=>{ pts=[];roomPts=[];closed=false;plan=null;editHistory=[];redoHistory=[];resetCuts();
  parcelPts=[];parcelClosed=false;balconies=[];courtyards=[];avluGhost=null;hoverBalk=null;doorOverrides={};extraDoors=[];doorHidden={};hoverDoor=null;windowOverrides={};extraWindows=[];windowHidden={};hoverWindow=null;
  amenities=[];hoverAmenity=null;amenityGhost=null;
  if(villaFloors){ villaFloors[activeFloor]=null; renderFloorTabs(); } // yalnız aktif kat temizlenir
  else { lockedCore=null; } // tek bina: iskelet de sıfırlanır
  updateStructResetBtn();
  document.getElementById('genBtn').disabled=true; document.getElementById('svgBtn').disabled=true; document.getElementById('pngBtn').disabled=true;
  document.getElementById('unitTable').style.display='none';
  document.getElementById('stArea').textContent='–'; document.getElementById('stPerim').textContent='–'; render(); };
document.getElementById('tFit').onclick=fitView;
document.getElementById('tSample').onclick=()=>{ pts=[{x:0,y:0},{x:32,y:0},{x:32,y:16},{x:0,y:16}]; closed=true;
  document.getElementById('genBtn').disabled=false; resetCuts(); fitView();
  if(typeof updateAmenityBtn==='function') updateAmenityBtn();   // F1: örnek sınırda da imkan düğmesi görünür
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
