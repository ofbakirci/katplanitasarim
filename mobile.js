'use strict';
/* ================= dokunmatik katman (mobil) ================= */
/* Eşleme: tek parmak tutamaçta = sürükleme, boşta = kaydırma, dokunuş = tıklama,
   uzun basış = sağ tık, çift dokunuş = çift tık, iki parmak = yakınlaştır+kaydır.
   Mevcut fare mantığı YENİDEN YAZILMAZ: sentetik MouseEvent'ler aynı dinleyicilere gider.
   (typeof MouseEvent guard'ı: Node testleri bu bloğu atlar.) */
if(typeof MouseEvent!=='undefined'){
(function(){
  let T=null, pinch=null, lastTap=null, lpTimer=null;
  const synth=(type,cx,cy)=>svg.dispatchEvent(new MouseEvent(type,{clientX:cx,clientY:cy,button:0,bubbles:true,cancelable:true}));
  const clearLP=()=>{ if(lpTimer){ clearTimeout(lpTimer); lpTimer=null; } };
  svg.addEventListener('touchstart',e=>{
    e.preventDefault(); hideRoomMenu();
    if(e.touches.length>=2){ // iki parmak: yakınlaştırma — tek parmak işi varsa kapat
      clearLP();
      if(dragging){ if(dragging.type==='pan') dragging=null; else finishDrag(); }
      T=null;
      const a=e.touches[0], b=e.touches[1], r=svg.getBoundingClientRect();
      const mx=(a.clientX+b.clientX)/2-r.left, my=(a.clientY+b.clientY)/2-r.top;
      pinch={d0:Math.max(10,Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)), p0:pxPerM, wx:S2Wx(mx), wy:S2Wy(my)};
      return;
    }
    pinch=null;
    const t=e.touches[0], r=svg.getBoundingClientRect();
    const sx=t.clientX-r.left, sy=t.clientY-r.top;
    T={sx,sy,cx:t.clientX,cy:t.clientY,moved:false,drag:false};
    /* tutamaç/kapı/balkon kenarı/kaydırma modu: sürükleme HEMEN başlar (mousedown mantığıyla) */
    let grab=false;
    if(mode==='pan') grab=true;
    else if(mode==='balkon'){ const h=hitBalk(S2Wx(sx),S2Wy(sy)); grab=!!(h&&h.part!=='body'); }
    else if(mode==='avlu'){ // AV-2 sonrası masaüstü paritesi: mevcut avlu gövde/kenar/köşe = taşı-boyutlandır sürüklemesi;
      // boşluk = yeni avlu çiz. Dokunmatikte SİLME: avlu-dışı modda uzun basış → mini menü (rooms.js) — burada timer'a düşmez.
      const hA=(typeof hitAvluHandle==='function')? hitAvluHandle(S2Wx(sx),S2Wy(sy)) : null;
      grab = hA? true : !!(closed && pip(S2Wx(sx),S2Wy(sy),pts)); }
    else if(mode==='site'){ grab=(typeof hitBlock==='function' && hitBlock(S2Wx(sx),S2Wy(sy))>=0); }
    else if(mode==='amenity'){ grab=(typeof hitAmenity==='function' && hitAmenity(sx,sy)!=null); }   // C4: mevcut imkanı sürükle (taşı); boşluk = dokunuş → ekle
    else if(mode==='door'){ grab=!!(plan&&hitDoor(sx,sy)); }
    else if(plan&&closed&&mode!=='parcel'){ grab=!!(hitCutHandle(sx,sy)||hitWallRun(sx,sy)); }
    if(grab){ synth('mousedown',t.clientX,t.clientY); T.drag=true; }
    else lpTimer=setTimeout(()=>{ lpTimer=null; // uzun basış → sağ tık menüsü
      if(T&&!T.moved){ const c=T; T=null;
        svg.dispatchEvent(new MouseEvent('contextmenu',{clientX:c.cx,clientY:c.cy,bubbles:true,cancelable:true})); } },500);
  },{passive:false});
  svg.addEventListener('touchmove',e=>{
    e.preventDefault();
    if(pinch&&e.touches.length>=2){
      const a=e.touches[0], b=e.touches[1], r=svg.getBoundingClientRect();
      const mx=(a.clientX+b.clientX)/2-r.left, my=(a.clientY+b.clientY)/2-r.top;
      const d=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
      pxPerM=Math.min(80, Math.max(4, pinch.p0*d/pinch.d0));
      panX=mx-pinch.wx*pxPerM; panY=my-pinch.wy*pxPerM; render();
      return;
    }
    if(!T) return;
    const t=e.touches[0];
    if(!T.moved && Math.hypot(t.clientX-T.cx, t.clientY-T.cy)>8){
      T.moved=true; clearLP();
      if(!T.drag){ dragging={type:'pan',sx:T.sx,sy:T.sy,px:panX,py:panY}; T.drag=true; } // boşta sürükleme = kaydır
    }
    if(T.drag) synth('mousemove',t.clientX,t.clientY);
  },{passive:false});
  svg.addEventListener('touchend',e=>{
    e.preventDefault();
    if(e.touches.length>0){ pinch=null; T=null; clearLP(); return; } // kalan parmak: yeni dokunuşla devam
    if(pinch){ pinch=null; return; }
    clearLP();
    if(!T) return;
    const tp=T; T=null;
    if(tp.drag){ finishDrag(); dragging=null; return; }
    if(tp.moved) return;
    /* DOKUNUŞ: kapı modunda çift dokunuş = çift tık (kapı ekle/sil) */
    const now=Date.now();
    if(lastTap && now-lastTap.t<350 && Math.hypot(tp.cx-lastTap.x, tp.cy-lastTap.y)<30){
      lastTap=null;
      if(mode==='door'&&plan){
        svg.dispatchEvent(new MouseEvent('dblclick',{clientX:tp.cx,clientY:tp.cy,bubbles:true,cancelable:true}));
        return;
      }
    } else lastTap={t:now,x:tp.cx,y:tp.cy};
    /* tekli dokunuş = sol tık (çizim noktası, parsel, balkon ekle...) */
    synth('mousedown',tp.cx,tp.cy);
    if(dragging){ finishDrag(); dragging=null; }
    /* dokunuş = imleç: oda ölçü vurgusu / sonraki nokta önizlemesi */
    synth('mousemove',tp.cx,tp.cy);
  },{passive:false});
  svg.addEventListener('touchcancel',()=>{
    clearLP(); if(T&&T.drag){ finishDrag(); dragging=null; } T=null; pinch=null; },{passive:false});
})();
/* ---- mobil çekmece + daire tablosu başlangıcı ---- */
(function(){
  const mq=(typeof matchMedia==='function')? matchMedia('(max-width: 700px)') : null;
  const btn=document.getElementById('menuBtn'), aside=document.querySelector('aside'),
        bk=document.getElementById('backdrop');
  if(!btn||!aside||!bk) return;
  const set=o=>{ aside.classList.toggle('open',o); bk.classList.toggle('show',o); };
  btn.onclick=()=>set(!aside.classList.contains('open'));
  bk.onclick=()=>set(false);
  const xc=document.getElementById('asideClose'); if(xc) xc.onclick=()=>set(false);
  document.getElementById('genBtn').addEventListener('click',()=>{ if(mq&&mq.matches) set(false); }); // planı görsün
  if(mq&&mq.matches){ // telefonda daire tablosu daraltılmış başlar (alt sayfa yarım ekranı yemesin)
    document.getElementById('utBody').style.display='none';
    document.getElementById('utToggle').textContent='+';
  }
})();
}
