'use strict';
/* ================= dışa aktarma ================= */
const EXPORT_FONT="'Helvetica Neue',Helvetica,Arial,sans-serif"; // sayfa CSS'i dışa aktarılan SVG'ye taşınmaz; font belirtilmezse tarayıcı varsayılan serif (Times) kullanır
let aiPaintMode=false; // AI boyama export modu: EN etiket, daire tablosu yok (balkon KORUNUR, m² KALIR)
let edgeMaskMode=false; // ControlNet/Flux-Canny duvar-kenar export modu: beyaz zemin + saf siyah SÜREKLİ duvarlar; etiket/renk/m²/mobilya/grid/balkon/ölçü YOK
let aiCleanMode=false;  // AI boyama TEMİZ modu: SADECE oda dolgusu + duvar + kapı boşluğu + EN oda etiketi. Düğüm/m²/ölçü/D-rozet/grid/parsel/balkon/seçim YOK. Kadraj kenar-maskesiyle birebir (bd=0 → iki PNG üst üste biner).
/* ⛔ RENDER HEDEF ORANI: dollhouse render (nano-banana-pro, 4K 16:9) = 5504×3072.
   AI Output kadrajı (PNG + harita) bu ORANA letterbox'lanır → render modeline GİREN plan PNG'si
   ile ÇIKAN dollhouse AYNI en-boy oranında olur; kalan tek fark üniform ölçektir, onu da
   koordinatların _norm (0–1) alanı çözer. Bina kadrajın ortasında, kenarlara boş pay eklenir. */
const FP_RENDER_W=5504, FP_RENDER_H=3072, FP_RENDER_ASPECT=FP_RENDER_W/FP_RENDER_H;
/* bina kadrajını (genişlik/yükseklik, metre) render oranına pad et → eklenecek YARI marj (m).
   Geniş-yatık bina (w/h<oran) → yatay pay; dar bina → dikey pay. Ölçek (S) DEĞİŞMEZ: yalnız
   boş kenar eklenir, bina pikselleri birebir aynı kalır. */
function fpLetterbox(w,h){
  if(w/h < FP_RENDER_ASPECT) return { dx:(h*FP_RENDER_ASPECT - w)/2, dy:0 };
  return { dx:0, dy:(w/FP_RENDER_ASPECT - h)/2 };
}
function exportTableGroup(x0,maxH){
  /* yüzen daire tablosunun SVG kopyası — özdeş daireler gruplanır, plan yüksekliğini aşınca yeni sütuna sarar */
  if(!plan||!plan.unitObjs.length) return null;
  const W=300, pad=12, gap=14, topY=34;
  /* özdeş daireleri grupla (aynı tip + aynı oda listesi) */
  const groups=[], sig=new Map();
  plan.unitObjs.forEach((u,k)=>{
    const tot=u.rooms.reduce((s,r2)=>s+r2.area,0);
    const rows=u.rooms.filter(r2=>r2.cells.length).map(r2=>[r2.name,`${fmt(r2.bw)} × ${fmt(r2.bh)}`,`${fmt(r2.area)} m²`]);
    const myBalks=balconies.filter(b=>balkUnit(b)===k);
    myBalks.forEach(b=>rows.push(['BALKON (açık)',`${fmt(b.t1-b.t0)} × ${fmt(b.depth)}`,`${fmt(balkArea(b))} m²`]));
    const balkTot=myBalks.reduce((s,b)=>s+balkArea(b),0);
    const key=unitTag(u.spec)+'|'+fmt(tot)+'|'+rows.map(r2=>r2.join(',')).join(';');
    if(sig.has(key)) sig.get(key).ks.push(k);
    else { const o={ks:[k],tag:unitTag(u.spec),tot,balkTot,rows}; sig.set(key,o); groups.push(o); }
  });
  const rng=ks=>{ const out=[]; let s=ks[0],p2=ks[0];
    for(let i=1;i<=ks.length;i++){ const v=ks[i];
      if(v===p2+1){p2=v;continue;}
      out.push(s===p2?`D${s+1}`:`D${s+1}–D${p2+1}`); s=p2=v; }
    return out.join(', '); };
  maxH=Math.max(maxH||0,420);
  const g=el('g',{'font-family':EXPORT_FONT});
  const txt=(s,x,yy,a)=>{ const t=el('text',Object.assign({x,y:yy,'font-size':a.size||11,fill:a.color||'#3a3a3a'},
      a.weight?{'font-weight':a.weight}:{}, a.anchor?{'text-anchor':a.anchor}:{}));
    t.textContent=s; g.appendChild(t); return t; };
  txt('DAİRE TABLOSU',x0+pad,24,{size:13,weight:'700',color:'#1f1f1f'});
  let col=0, y=topY; const colHs=[];
  const colX=()=>x0+col*(W+gap);
  groups.forEach(gr=>{
    const bh=22+gr.rows.length*15;
    if(y+bh>maxH-14 && y>topY){ colHs[col]=y; col++; y=topY; }
    y+=22;
    txt(`${rng(gr.ks)} · ${gr.tag} · ${fmt(gr.tot)} m²${gr.balkTot?` + ${fmt(gr.balkTot)} m² balkon`:''}${gr.ks.length>1?` (${gr.ks.length} daire)`:''}`,
        colX()+pad,y,{size:11.5,weight:'700',color:'#8a4b2d'});
    gr.rows.forEach(r2=>{ y+=15;
      txt(r2[0],colX()+pad+6,y,{size:10.5});
      txt(r2[1],colX()+W-pad-72,y,{size:10.5,anchor:'end',color:'#888'});
      txt(r2[2],colX()+W-pad,y,{size:10.5,anchor:'end'}); });
  });
  colHs[col]=y;
  for(let i=0;i<=col;i++)
    g.insertBefore(el('rect',{x:x0+i*(W+gap),y:8,width:W,height:colHs[i]+6,fill:'#ffffff',stroke:'#c9c2b4','stroke-width':1,rx:6}),g.firstChild);
  return {g, w:(col+1)*(W+gap)-gap, h:Math.max(...colHs)+22};
}
function exportClone(){
  const site=(typeof siteOn==='function')&&siteOn();
  /* ekran yakınlığından bağımsız, sabit ölçekte çiz. bbox: site → TÜM bloklar + parsel;
     tek bina → aktif sınır + parsel */
  let allPts=pts.concat(parcelPts);
  if(site && typeof siteBlocksData==='function'){
    let a=[]; siteBlocksData().forEach(bd=>{ a=a.concat(bd.pts); });
    a=a.concat(parcelPts); if(a.length>=3) allPts=a;
  }
  const bb=bboxOf(allPts);
  const bd=(edgeMaskMode||aiCleanMode)?0:balconies.reduce((m,b)=>Math.max(m,b.depth||0),0); // kenar maskesi VE AI-temiz: balkon çizilmez → taşma payı yok (kadraj tam dikdörtgen, iki PNG üst üste biner).
  const marg=2.5+bd; // ölçü yazıları + balkon taşması (m)
  let w=bb.maxX-bb.minX+marg*2, h=bb.maxY-bb.minY+marg*2;
  const S=Math.max(site?14:22,Math.min(45,2200/w)); // ≥22 px/m (site daha büyük olabilir → ≥14); S pad ÖNCESİ genişlikten → çözünürlük değişmez
  // AI temiz/kenar (render girdisi): kadrajı render oranına letterbox'la (bina ortada, boş kenar)
  const lb=(edgeMaskMode||aiCleanMode)? fpLetterbox(w,h) : {dx:0,dy:0};
  w+=lb.dx*2; h+=lb.dy*2;
  const save={p:pxPerM,x:panX,y:panY,m:mode};
  exportView={width:Math.round(w*S),height:Math.round(h*S),left:0,top:0};
  pxPerM=S; panX=(marg-bb.minX+lb.dx)*S; panY=(marg-bb.minY+lb.dy)*S;
  if(site) mode='site';            // tüm blokları aynı tuvalde çiz (genel görünüm)
  render();
  const clone=svg.cloneNode(true);
  const planW=exportView.width, planH=exportView.height;
  exportView=null; pxPerM=save.p; panX=save.x; panY=save.y; mode=save.m; render(); // ekranı eski haline döndür
  clone.setAttribute('font-family',EXPORT_FONT);
  const tbl=(site||aiPaintMode||edgeMaskMode)? null : exportTableGroup(planW+12, planH);  // site / AI boyama / kenar maskesi: daire tablosu yok
  let W=planW, H=planH;
  if(tbl){ clone.appendChild(tbl.g); W=planW+tbl.w+24; H=Math.max(H,tbl.h+8); }
  clone.setAttribute('width',W); clone.setAttribute('height',H);
  return {clone,W,H};
}
/* ================= durum anlık görüntüsü (SVG'ye gömülür / içe alınır) =================
   Dışa aktarılan her SVG <metadata id="kpState"> içinde TAM plan durumunu taşır:
   girdiler (sınır, parsel, balkon, daire tipleri, ayırıcılar) + bölge hücreleri
   (elle duvar/oda düzenlemeleri dâhil) + kapı ayarları. İçe aktarınca generate()
   ÇAĞRILMADAN plan aynen geri kurulur — elle düzenlemeler kalıcılaşır. */
function stateSnapshot(bare, withBlocks){
  if(!plan) return null;
  const el2=id=>document.getElementById(id).value;
  const st={v:1, app:'kat-plani-tasarim',
    ui:{binaTipi:el2('binaTipi'), katSayisi:el2('katSayisi'), katYuk:el2('katYuk'), koridorYon:koridorYon, bodrumSayisi:String(bodrumSayisi)},
    pts:pts.map(p=>({x:p.x,y:p.y})), parcelPts:parcelPts.map(p=>({x:p.x,y:p.y})),
    parcelClosed, parcelRot, parcelImar, balconies:balconies.map(b=>({...b})),
    courtyards:courtyards.map(av=>({poly:av.poly.map(p=>({x:p.x,y:p.y}))})),
    specs:unitSpecs.map(s=>({...s})), cuts:customCutsZ, unitLayout:Object.assign({},unitLayout),
    doors:{ov:doorOverrides, extra:extraDoors, hidden:doorHidden},
    plan:{rows:plan.rows, cols:plan.cols, minX:plan.minX, minY:plan.minY,
      corridorR0:plan.corridorR0, corridorR1:plan.corridorR1,
      kat:plan.kat, binaYuk:plan.binaYuk, perFloor:plan.perFloor, villa:plan.villa,
      nAsansor:plan.nAsansor, asansorYeri:plan.asansorYeri,
      fireStairNeeded:plan.fireStairNeeded, teknikNeeded:plan.teknikNeeded,
      katKullanim:plan.katKullanim||'konut',
      parking:plan.parking? JSON.parse(JSON.stringify(plan.parking)) : undefined, // park yerleşimi (elle düzenlemeler dahil)
      inside:Array.from(plan.inside, v=>v?1:0),
      stairs:plan.stairs.map(s=>({...s})), zoneUI:plan.zoneUI||[],
      regions:plan.regions.map(g=>({id:g.id,name:g.name,type:g.type,unit:g.unit,cells:g.cells.slice()})),
      units:plan.unitObjs.map(u=>({spec:{...u.spec}, comb:!!u.comb,
        antre:u.antre?u.antre.id:-1, rooms:u.rooms.map(g=>g.id)}))}};
  /* villa katları: aktif kat tazelenip TÜM katlar dışa aktarıma gömülür
     (bare=true → kat içi anlık görüntü; floors alanı eklenmez, özyineleme kesilir) */
  if(!bare && floorsOn()){
    villaFloors[activeFloor]=stateSnapshot(true);
    st.katAyri=true; st.activeFloor=activeFloor; st.floors=villaFloors.slice();
  }
  if(!bare && lockedCore) st.lockedCore=lockedCore.map(o=>({...o})); // bina iskeleti (katlar arası ortak)
  /* site blokları: TAM site durumunda her blok (kendi katlarıyla) gömülür. wrap = blok-seviyesi
     st'nin sığ kopyası + st.blocks; st'nin kendisi .blocks İÇERMEZ → çevrim/özyineleme yok. */
  if(!bare && withBlocks && typeof siteOn==='function' && siteOn()){
    blocks[activeBlock]=st;
    const wrap=Object.assign({}, st);
    wrap.site=true; wrap.activeBlock=activeBlock; wrap.blocks=blocks.slice();
    return wrap;
  }
  return st;
}
function validateState(st){
  const fail=m=>{ throw new Error('durum geçersiz: '+m); };
  const finite=n=>Number.isFinite(n);
  if(!st||typeof st!=='object') fail('kök nesne yok');
  if(st.v!==1||!st.plan||typeof st.plan!=='object') fail('sürüm/plan tanınmadı');
  if(!st.ui||typeof st.ui!=='object') fail('arayüz bilgisi yok');
  ['binaTipi','katSayisi','katYuk'].forEach(k=>{ if(typeof st.ui[k]!=='string') fail('arayüz alanı hatalı'); });
  if(!Array.isArray(st.pts)||st.pts.length<3) fail('bina sınırı yok');
  st.pts.forEach(p=>{ if(!p||!finite(p.x)||!finite(p.y)) fail('bina sınırı koordinatı hatalı'); });
  if(!Array.isArray(st.specs)||!st.specs.length) fail('daire programı yok');
  st.specs.forEach(s=>{
    if(!s||typeof s!=='object') fail('daire programı hatalı');
    ['oda','salon','adet'].forEach(k=>{ if(!Number.isInteger(s[k])||s[k]<0) fail('daire programı sayısı hatalı'); });
  });
  const sp=st.plan, n=sp.rows*sp.cols;
  if(!Number.isInteger(sp.rows)||!Number.isInteger(sp.cols)||sp.rows<=0||sp.cols<=0||n>2000000) fail('ızgara boyutu hatalı');
  if(!finite(sp.minX)||!finite(sp.minY)) fail('ızgara konumu hatalı');
  if(!Array.isArray(sp.inside)||sp.inside.length!==n) fail('inside uzunluğu hatalı');
  sp.inside.forEach(v=>{ if(v!==0&&v!==1&&v!==false&&v!==true) fail('inside değeri hatalı'); });
  if(!Array.isArray(sp.regions)||!Array.isArray(sp.units)) fail('bölge/daire listesi hatalı');
  const ids=new Set();
  sp.regions.forEach((g,i)=>{
    if(!g||typeof g!=='object') fail('bölge nesnesi hatalı');
    if(!Number.isInteger(g.id)||g.id<0) fail('bölge id hatalı');
    if(ids.has(g.id)) fail('tekrarlı bölge id');
    ids.add(g.id);
    if(typeof g.name!=='string'||typeof g.type!=='string') fail('bölge adı/tipi hatalı');
    if(!Array.isArray(g.cells)) fail('bölge hücreleri hatalı');
    g.cells.forEach(c=>{ if(!Number.isInteger(c)||c<0||c>=n) fail('bölge hücresi ızgara dışında'); });
    if(i>50000) fail('bölge sayısı aşırı');
  });
  sp.units.forEach(u=>{
    if(!u||typeof u!=='object'||!Array.isArray(u.rooms)) fail('daire nesnesi hatalı');
    u.rooms.forEach(id=>{ if(!ids.has(id)) fail('daire odası bilinmeyen bölgeye bağlı'); });
    if(u.antre!=null&&u.antre>=0&&!ids.has(u.antre)) fail('antre bilinmeyen bölgeye bağlı');
  });
}
function restoreState(st, opt){
  validateState(st);
  if(!st||st.v!==1||!st.plan) throw new Error('durum sürümü tanınmadı');
  document.getElementById('binaTipi').value=st.ui.binaTipi;
  document.getElementById('katSayisi').value=st.ui.katSayisi;
  document.getElementById('katYuk').value=st.ui.katYuk;
  koridorYon=st.ui.koridorYon||'oto'; { const ky=document.getElementById('koridorYon'); if(ky) ky.value=koridorYon; }
  bodrumSayisi=Math.max(0,+(st.ui.bodrumSayisi||0)||0); villaOffset=bodrumSayisi; // floors dizisi bu offsetle kurulur
  { const bi=document.getElementById('bodrumSayisi'); if(bi) bi.value=String(bodrumSayisi); }
  katKullanim=(st.plan&&st.plan.katKullanim)||'konut'; // bu katın kullanım tipi (per-kat)
  pts=st.pts.map(p=>({x:p.x,y:p.y})); closed=true;
  parcelPts=(st.parcelPts||[]).map(p=>({x:p.x,y:p.y})); parcelClosed=!!st.parcelClosed; psFrontEdge=-1;
  parcelRot=(typeof st.parcelRot==='number' && isFinite(st.parcelRot))?st.parcelRot:0;
  parcelImar = st.parcelImar || null;                          // imar durumu kayıttan geri yüklenir (yeniden sorgulanmaz)
  psProj=null; psSatReq=null;                                  // kayıttan: geo referansı yok (parcelPts döndürülmüş saklanır)
  if(typeof psComputeSetback==='function') psComputeSetback();
  if(parcelPts.length>=3 && parcelClosed){ const imar=document.getElementById('psImar'); if(imar) imar.style.display='block'; if(typeof imarRender==='function') imarRender(parcelImar); }
  if(typeof psSyncRotUI==='function') psSyncRotUI();
  balconies=(st.balconies||[]).map(b=>({...b}));
  courtyards=(st.courtyards||[]).map(av=>({poly:(av.poly||[]).map(p=>({x:p.x,y:p.y}))})); avluGhost=null;
  unitSpecs=st.specs.map(s=>({...s})); renderUnits();
  customCutsZ=st.cuts||null; unitLayout=st.unitLayout||{};
  doorOverrides=(st.doors&&st.doors.ov)||{};
  extraDoors=(st.doors&&st.doors.extra)||[];
  doorHidden=(st.doors&&st.doors.hidden)||{};
  editHistory=[];
  /* villa katları: dosyadan geliyorsa diziyi kur; kat geçişinde (keepFloors) dokunma */
  const ka=document.getElementById('katAyri');
  if(st.katAyri && st.floors){
    villaFloors=st.floors.slice(); activeFloor=st.activeFloor||0;
    if(ka) ka.checked=true;
  } else if(!opt||!opt.keepFloors){
    villaFloors=null; activeFloor=0;
    if(ka) ka.checked=false;
  }
  /* site blokları: dosyadan TAM site durumu geliyorsa diziyi kur; blok geçişinde (keepBlocks) dokunma */
  const sm=document.getElementById('siteMod');
  if(st.blocks){
    blocks=st.blocks.slice(); activeBlock=st.activeBlock||0;
    if(sm) sm.checked=true;
  } else if(!opt||!opt.keepBlocks){
    blocks=null; activeBlock=0;
    if(sm) sm.checked=false;
  }
  /* bina iskeleti yalnız TAM durum geri-yüklemesinde (dosya/ulayout) gelir; kat geçişinde global kalır */
  if(!opt||!opt.keepFloors) lockedCore = st.lockedCore? st.lockedCore.map(o=>({...o})) : null;
  const sp=st.plan;
  const regions=sp.regions.map(g=>({id:g.id,name:g.name,type:g.type,unit:g.unit,cells:g.cells.slice()}));
  const cm=new Int16Array(sp.rows*sp.cols); cm.fill(-1);
  regions.forEach(g=>g.cells.forEach(i=>{ cm[i]=g.id; }));
  const inside=Uint8Array.from(sp.inside);
  const byId2={}; regions.forEach(g=>{ byId2[g.id]=g; });
  const unitObjs=sp.units.map(u=>({spec:{...u.spec}, comb:!!u.comb,
    antre:u.antre>=0?(byId2[u.antre]||null):null,
    rooms:u.rooms.map(id2=>byId2[id2]).filter(Boolean)}));
  plan={regions, cm, inside, rows:sp.rows, cols:sp.cols, minX:sp.minX, minY:sp.minY,
    corridorR0:sp.corridorR0, corridorR1:sp.corridorR1,
    stairs:(sp.stairs||[]).map(s=>({...s})), unitObjs,
    villa:!!sp.villa, kat:sp.kat, binaYuk:sp.binaYuk, perFloor:sp.perFloor,
    nAsansor:sp.nAsansor, asansorYeri:sp.asansorYeri,
    fireStairNeeded:sp.fireStairNeeded, teknikNeeded:sp.teknikNeeded,
    katKullanim:sp.katKullanim||'konut',
    zoneUI:sp.zoneUI||[]};
  regions.forEach(g=>calcRegionMetrics(g, plan.cols, plan.minX, plan.minY));
  /* park yerleşimi: kayıtta varsa (elle düzenlemeler dahil) aynen geri yükle, yoksa yeniden kur */
  if(sp.parking) plan.parking=JSON.parse(JSON.stringify(sp.parking));
  else if(regions.some(g=>g.type==='otopark')) plan.parking=parkingForPlan(plan);
  hoverWall=null; hoverRoomId=null; hoverDoor=null; hoverBalk=null; hoverP=null;
  plan.wallRuns=computeWallRuns();
  document.getElementById('genBtn').disabled=false;
  document.getElementById('svgBtn').disabled=false;
  document.getElementById('pngBtn').disabled=false;
  document.getElementById('aiOutputBtn').disabled=false;
  document.getElementById('unitTable').style.display='';
  /* durum çubuğu: içe aktarılan sınırın alan/çevresi (eski değer asılı kalmasın) */
  document.getElementById('stArea').textContent=fmt(shoelace(pts))+' m²';
  document.getElementById('stPerim').textContent=fmt(perim(pts))+' m';
  updateKatAyriUI(); updateStructResetBtn();
  runChecks(); buildUnitTable(); renderFloorTabs(); if(typeof renderBlockTabs==='function') renderBlockTabs();
  if(!opt||opt.fit!==false) fitView(); render();
}
function exportSVG(){
  const {clone}=exportClone();
  clone.setAttribute('style','background:#faf8f3');
  const st=stateSnapshot(false, true);   // site açıksa TÜM bloklar gömülür
  if(st){
    const md=document.createElementNS('http://www.w3.org/2000/svg','metadata');
    md.setAttribute('id','kpState');
    md.textContent=JSON.stringify(st);
    if(clone.insertBefore) clone.insertBefore(md, clone.firstChild||null); else clone.appendChild(md);
  }
  const blob=new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='kat-plani.svg'; a.click();
}
function exportPNG(){
  const {clone,W,H}=exportClone();
  const data='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(clone))));
  const img=new Image();
  img.onload=()=>{ const cv=document.createElement('canvas'); cv.width=W*2; cv.height=H*2;
    const ctx=cv.getContext('2d'); ctx.fillStyle='#faf8f3'; ctx.fillRect(0,0,cv.width,cv.height);
    ctx.scale(2,2); ctx.drawImage(img,0,0);
    const a=document.createElement('a'); a.href=cv.toDataURL('image/png'); a.download='kat-plani.png'; a.click(); };
  img.src=data;
}
/* AI boyama (Higgsfield / nano-banana) tabanı — TEMİZ: SADECE oda dolgu rengi + net siyah
   duvar/oda sınırı + görünür kapı boşluğu + İngilizce oda etiketi. Düğüm/tutamaç, m² değerleri,
   duvar ölçüleri, D1–D6 rozetleri, grid, parsel/bahçe, balkon ve seçim/hover göstergeleri ÇİZİLMEZ.
   Kadraj kenar-maskesiyle (controlnet-edges) BİREBİR aynı (bd=0) → iki PNG üst üste tam çakışır. */
function exportAIPaintPNG(){
  aiPaintMode=true; aiCleanMode=true;    // aiPaintMode → EN etiket; aiCleanMode → gürültü katmanlarını ATLA + bd=0 kadraj
  try {
    const {clone,W,H}=exportClone();   // aiCleanMode true → tablo + balkon payı atlanır, kadraj kenar-maskesiyle birebir
    const data='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(clone))));
    const img=new Image();
    img.onload=()=>{ const cv=document.createElement('canvas'); cv.width=W*2; cv.height=H*2;
      const ctx=cv.getContext('2d'); ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,cv.width,cv.height); // model için temiz beyaz zemin
      ctx.scale(2,2); ctx.drawImage(img,0,0);
      const a=document.createElement('a'); a.href=cv.toDataURL('image/png'); a.download='kat-plani-AI-boyama.png'; a.click(); };
    img.src=data;
  } finally { aiPaintMode=false; aiCleanMode=false; render(); } // ekrandaki planı TR etiketle, tüm katmanlarla geri çiz
}
/* ControlNet / Flux-Canny duvar-kenar haritası: beyaz zemin + saf siyah SÜREKLİ duvarlar.
   AI Boyama PNG ile BİREBİR aynı kadraj/ölçek (aynı exportClone) → iki PNG üst üste tam çakışır;
   render() edgeMaskMode'da yalnız duvar maskesi çizer (etiket/renk/mobilya/grid/balkon/ölçü/kapı yok). */
function exportEdgeMaskPNG(){
  edgeMaskMode=true;
  try {
    const {clone,W,H}=exportClone();   // edgeMaskMode true → exportClone tabloyu+balkon payını atlar
    const data='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(clone))));
    const img=new Image();
    img.onload=()=>{ const cv=document.createElement('canvas'); cv.width=W*2; cv.height=H*2;
      const ctx=cv.getContext('2d'); ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,cv.width,cv.height); // saf beyaz zemin (Canny temiz yakalasın)
      ctx.scale(2,2); ctx.drawImage(img,0,0);
      const a=document.createElement('a'); a.href=cv.toDataURL('image/png'); a.download='kat-plani-controlnet-edges.png'; a.click(); };
    img.src=data;
  } finally { edgeMaskMode=false; render(); } // ekrandaki planı normal geri çiz
}
/* ============================================================================
   ODA / DAİRE HARİTASI — makine-okunur export (AI Output'a EK; PNG'ler bozulmaz)
   ----------------------------------------------------------------------------
   floorplan-map.json + floorplan-overlay.svg: her odanın ve dairenin AI Output
   render PNG'sinin PİKSEL uzayındaki konumu (bbox/polygon/centroid/alan/tip).
   ⛔ TEK KOORDİNAT SİSTEMİ: oda/daire poligonları, bbox'lar VE (4. adımdaki
   kamera export'unun) kamera x/y'si AYNI px uzayında — birim dönüşümü yok.
   Uzay = AI boyama (exportAIPaintPNG) / kenar (exportEdgeMaskPNG) PNG'siyle
   BİREBİR aynı kadraj: aşağıdaki S/panX/panY formülleri exportClone()'un
   aiCleanMode/edgeMaskMode dalıyla (bd=0, tablo yok) AYNI, sonra ctx.scale(2,2)
   için ×2. İki PNG ve bu harita üst üste tam çakışır. */
function fpFraming(){
  const site=(typeof siteOn==='function')&&siteOn();
  let allPts=pts.concat(parcelPts);                       // exportClone ile birebir bbox
  if(site && typeof siteBlocksData==='function'){
    let a=[]; siteBlocksData().forEach(bd=>{ a=a.concat(bd.pts); });
    a=a.concat(parcelPts); if(a.length>=3) allPts=a;
  }
  const bb=bboxOf(allPts);
  const marg=2.5;                                          // bd=0 (AI temiz/kenar: balkon çizilmez)
  let w=bb.maxX-bb.minX+marg*2, h=bb.maxY-bb.minY+marg*2;
  const S=Math.max(site?14:22,Math.min(45,2200/w));        // px/m — exportClone ile AYNI (pad ÖNCESİ)
  const SC=2;                                              // canvas ctx.scale(2,2) → PNG = SVG×2
  const lb=fpLetterbox(w,h);                               // render oranına letterbox — exportClone (aiClean/edge) ile AYNI
  w+=lb.dx*2; h+=lb.dy*2;
  const panX=(marg-bb.minX+lb.dx)*S, panY=(marg-bb.minY+lb.dy)*S;
  const W=Math.round(w*S)*SC, H=Math.round(h*S)*SC;
  const px=(mx,my)=>[ Math.round((mx*S+panX)*SC*10)/10, Math.round((my*S+panY)*SC*10)/10 ];
  const norm=p=>[ Math.round(p[0]/W*1e5)/1e5, Math.round(p[1]/H*1e5)/1e5 ];  // 0–1 (render çözünürlüğünden bağımsız)
  return { S, SC, panX, panY, W, H, px, norm };
}
/* type → standart İngilizce enum (downstream prompt dallanması için) */
const FP_TYPE_ENUM = {
  salon:'living', mutfak:'kitchen', yatak:'bedroom', banyo:'bathroom', wc:'wc',
  antre:'hall', koridor:'hall', oda:'room', merdiven:'stairs', asansor:'elevator',
  teknik:'shaft', yangin:'fire_stairs', otopark:'parking', siginak:'shelter',
  dukkan:'shop', depo:'storage', balkon:'balcony'
};
function fpRoomEnum(reg){
  const nm=(reg.name||'').trim().toLocaleUpperCase('tr-TR');
  if(nm.indexOf('SALON + MUTFAK')===0) return 'living_kitchen';
  if(nm==='STÜDYO') return 'studio';
  if(nm.indexOf('EB. YATAK')===0||nm.indexOf('EBEVEYN')===0) return 'bedroom';     // ebeveyn yatak = bedroom
  if(nm.indexOf('ÇALIŞMA')===0) return 'study';
  if(nm==='KİLER'||nm==='ORTAK DEPO') return 'storage';
  return FP_TYPE_ENUM[reg.type] || 'room';
}
/* bir hücre kümesinin dik açılı dış sınır poligonu (ızgara köşe koordinatında [c,r]).
   Yarı-kenar yönlendirmesi (bölge solda) → kapalı halka; düz duvardaki ara köşeler atılır. */
function fpCellOutline(cells, cols){
  if(!cells||!cells.length) return [];
  const set=new Set(cells);
  const has=(r,c)=> c>=0 && c<cols && set.has(r*cols+c);
  const K=(c,r)=>c+'|'+r, nxt=new Map();
  const add=(c1,r1,c2,r2)=>nxt.set(K(c1,r1),[c2,r2]);
  cells.forEach(i=>{
    const r=(i/cols)|0, c=i%cols;
    if(!has(r-1,c)) add(c,r,     c+1,r);    // üst  (sol→sağ)
    if(!has(r+1,c)) add(c+1,r+1, c,r+1);    // alt  (sağ→sol)
    if(!has(r,c-1)) add(c,r+1,   c,r);      // sol  (alt→üst)
    if(!has(r,c+1)) add(c+1,r,   c+1,r+1);  // sağ  (üst→alt)
  });
  if(!nxt.size) return [];
  const startK=nxt.keys().next().value;
  const ring=[]; let curK=startK, guard=0;
  do {
    const [c,r]=curK.split('|').map(Number); ring.push([c,r]);
    const n=nxt.get(curK); if(!n) break;
    curK=K(n[0],n[1]);
  } while(curK!==startK && guard++<1e6);
  // düz duvardaki ara köşeleri at (yalnız dönüş noktaları kalsın)
  const n=ring.length; if(n<3) return ring;
  const out=[];
  for(let i=0;i<n;i++){
    const a=ring[(i-1+n)%n], b=ring[i], c=ring[(i+1)%n];
    if((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])!==0) out.push(b);
  }
  return out.length>=3? out : ring;
}
/* bir bölgenin px geometrisi (bbox/polygon/centroid/alan) — verilen kadrajda */
function fpRegionGeom(g, fr){
  const cols=plan.cols, mnX=plan.minX, mnY=plan.minY, n=g.cells.length||1;
  let r0=1e9,r1=-1e9,c0=1e9,c1=-1e9,sr=0,sc=0;
  g.cells.forEach(i=>{const r=(i/cols)|0,c=i%cols; if(r<r0)r0=r;if(r>r1)r1=r;if(c<c0)c0=c;if(c>c1)c1=c;sr+=r;sc+=c;});
  const [bx0,by0]=fr.px(mnX+c0*M, mnY+r0*M), [bx1,by1]=fr.px(mnX+(c1+1)*M, mnY+(r1+1)*M);
  const bbox_px=[Math.min(bx0,bx1),Math.min(by0,by1),Math.max(bx0,bx1),Math.max(by0,by1)];
  const polygon_px=fpCellOutline(g.cells,cols).map(p=>fr.px(mnX+p[0]*M, mnY+p[1]*M));
  const centroid_px=fr.px(mnX+(sc/n+0.5)*M, mnY+(sr/n+0.5)*M);
  // label_anchor: etiketin GERÇEKTE yazıldığı nokta (pole of inaccessibility, calcRegionMetrics'ten).
  // L/U/girintili odalarda centroid komşu odaya düşebilir; bu nokta hep kendi poligonu İÇİNDE.
  const label_anchor_px=(typeof g.labelX==='number')?fr.px(g.labelX, g.labelY):centroid_px;
  const nb0=fr.norm([bbox_px[0],bbox_px[1]]), nb1=fr.norm([bbox_px[2],bbox_px[3]]);
  return {
    type:fpRoomEnum(g), type_tr:g.type, name:g.name,
    name_en:(typeof regLabelEN==='function')?regLabelEN(g):g.name,
    bbox_px, polygon_px, centroid_px, label_anchor_px,
    bbox_norm:[nb0[0],nb0[1],nb1[0],nb1[1]],
    polygon_norm:polygon_px.map(p=>fr.norm(p)),
    centroid_norm:fr.norm(centroid_px),
    label_anchor_norm:fr.norm(label_anchor_px),
    area_m2:+(g.cells.length*M*M).toFixed(2)
  };
}
/* daire için konum etiketi: bina bbox'una göre sol/sağ + alt/üst */
function fpUnitLabel(u){
  const cols=plan.cols; let X0=1e9,Y0=1e9,X1=-1e9,Y1=-1e9, ux=0,uy=0,nc=0;
  u.rooms.forEach(g=>g.cells.forEach(i=>{const r=(i/cols)|0,c=i%cols; X0=Math.min(X0,c);Y0=Math.min(Y0,r);X1=Math.max(X1,c);Y1=Math.max(Y1,r);ux+=c;uy+=r;nc++;}));
  if(!nc) return 'Daire';
  const cx=ux/nc, cy=uy/nc, midC=plan.cols/2, midR=plan.rows/2;
  const h=cx<midC*0.85?'Sol':(cx>midC*1.15?'Sağ':'Orta'), v=cy<midR*0.85?'Üst':(cy>midR*1.15?'Alt':'Orta');
  return ((h==='Orta'&&v==='Orta')?'Merkez':(h+' '+v).trim())+' Daire';
}
/* ana harita — render PNG px uzayında units(+rooms) + ortak alanlar */
function buildFloorplanMap(opt){
  if(!plan||!plan.unitObjs) return null;
  const fr=fpFraming(), cols=plan.cols, mnX=plan.minX, mnY=plan.minY;
  const mpp=Math.round(1/(fr.S*fr.SC)*1e6)/1e6;            // metre / px
  const units=plan.unitObjs.map((u,k)=>{
    const id='D'+(k+1);
    const live=u.rooms.filter(g=>g.cells.length);
    const cnt={}; live.forEach(g=>{const e=fpRoomEnum(g); cnt[e]=(cnt[e]||0)+1;});
    const seen={};
    const rooms=live.map(g=>{
      const o=fpRegionGeom(g,fr); const e=o.type;
      seen[e]=(seen[e]||0)+1;
      o.id=id+'-'+e+(cnt[e]>1?('-'+seen[e]):'');
      return o;
    });
    let X0=1e9,Y0=1e9,X1=-1e9,Y1=-1e9;
    rooms.forEach(o=>{X0=Math.min(X0,o.bbox_px[0]);Y0=Math.min(Y0,o.bbox_px[1]);X1=Math.max(X1,o.bbox_px[2]);Y1=Math.max(Y1,o.bbox_px[3]);});
    const allCells=[].concat(...live.map(g=>g.cells));
    const polygon_px=fpCellOutline(allCells,cols).map(p=>fr.px(mnX+p[0]*M, mnY+p[1]*M));
    const un0=fr.norm([X0,Y0]), un1=fr.norm([X1,Y1]);
    return {
      id, label:fpUnitLabel(u),
      type:(typeof unitTag==='function')?unitTag(u.spec):'',
      bbox_px:[X0,Y0,X1,Y1],
      polygon_px,
      bbox_norm:[un0[0],un0[1],un1[0],un1[1]],
      polygon_norm:polygon_px.map(p=>fr.norm(p)),
      rooms
    };
  });
  const common=plan.regions.filter(g=>g.cells.length && g.unit<0).map(g=>{
    const o=fpRegionGeom(g,fr); o.id='C-'+g.id; return o;
  });
  return {
    render:{ file:(opt&&opt.file)||'kat-plani-AI-boyama.png', width:fr.W, height:fr.H,
      aspect:+(fr.W/fr.H).toFixed(4), target_aspect:+FP_RENDER_ASPECT.toFixed(4) },
    space:'render-png-pixels',
    note:'Koordinatlar AI Output PNG pikseli (AI-boyama & controlnet-edges ile birebir çakışır). Kadraj RENDER ORANINA letterbox\'lı (bina ortada, boş kenar) → render modeline giren plan PNG ile çıkan dollhouse AYNI oranda. Render FARKLI çözünürlükteyse _px yerine _norm (0–1) kullan: render_px = norm * renderW (x) / renderH (y); oran aynı olduğundan x ve y birebir oturur.',
    scale:{ metersPerPixel:mpp, origin_px:fr.px(0,0),
      formula:'px = world_m * '+(fr.S*fr.SC)+' + origin_px ; world_m = (px - origin_px) * metersPerPixel',
      norm_formula:'render_px_x = x_norm * renderWidth ; render_px_y = y_norm * renderHeight (kadraj render oranında → her iki eksen tek çarpan)' },
    units, common_areas:common
  };
}
/* render üstüne bindirilebilen doğrulama SVG'si (aynı viewBox; düz string → headless de çalışır) */
function buildFloorplanOverlaySVG(map){
  if(!map) map=buildFloorplanMap(); if(!map) return '';
  const W=map.render.width, H=map.render.height;
  const PAL=['#b35a2e','#2f6f8f','#4a7c4a','#8a4b2d','#6b4e9e','#b8860b','#1f7a8c','#a23e48'];
  const esc=s=>String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const ptsAttr=poly=>poly.map(p=>p[0]+','+p[1]).join(' ');
  let s='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'" font-family="sans-serif">\n';
  s+='<rect width="'+W+'" height="'+H+'" fill="none"/>\n';
  (map.common_areas||[]).forEach(o=>{
    if(o.polygon_px&&o.polygon_px.length>=3) s+='<polygon points="'+ptsAttr(o.polygon_px)+'" fill="#9aa0a6" fill-opacity="0.12" stroke="#5f6368" stroke-width="2" stroke-dasharray="10 7"/>\n';
  });
  map.units.forEach((u,i)=>{
    const col=PAL[i%PAL.length];
    if(u.polygon_px&&u.polygon_px.length>=3) s+='<polygon points="'+ptsAttr(u.polygon_px)+'" fill="none" stroke="'+col+'" stroke-width="6" stroke-linejoin="round"/>\n';
    (u.rooms||[]).forEach(o=>{
      if(o.polygon_px&&o.polygon_px.length>=3) s+='<polygon points="'+ptsAttr(o.polygon_px)+'" fill="'+col+'" fill-opacity="0.10" stroke="'+col+'" stroke-width="2"/>\n';
      const fs=Math.max(16,Math.min(40,(o.bbox_px[2]-o.bbox_px[0])*0.10));
      const la=o.label_anchor_px||o.centroid_px;     // etiket çapası (L/U odada komşuya taşmaz)
      s+='<text x="'+la[0]+'" y="'+la[1]+'" text-anchor="middle" font-size="'+fs.toFixed(0)+'" fill="#1f1f1f" font-weight="700">'+esc(o.name)+'</text>\n';
      s+='<text x="'+la[0]+'" y="'+(la[1]+fs*1.05).toFixed(0)+'" text-anchor="middle" font-size="'+(fs*0.7).toFixed(0)+'" fill="'+col+'" font-weight="700">'+esc(o.id)+'</text>\n';
    });
    s+='<text x="'+(u.bbox_px[0]+10)+'" y="'+(u.bbox_px[1]+Math.max(28,(u.bbox_px[3]-u.bbox_px[1])*0.06)).toFixed(0)+'" font-size="'+Math.max(26,(u.bbox_px[2]-u.bbox_px[0])*0.08).toFixed(0)+'" fill="'+col+'" font-weight="800">'+esc(u.id)+' · '+esc(u.label)+'</text>\n';
  });
  return s+'</svg>\n';
}
/* ---- kamera görüş alanı → oda ataması (koni AĞIRLIĞI + tolerans + kırpılmış koni) ----
   room_id'yi TUTAMAÇ noktasının pip'inden DEĞİL, kameranın görüş KONİSİNİN en çok doldurduğu
   odadan belirler: kamera çoğu kez bir odanın eşiğinde/köşesinde durup İÇERİ bakar; onu anlatan
   oda, konisinin doldurduğu odadır. Koniyi her oda poligonuna kırpıp (Sutherland–Hodgman; koni
   KONVEKS olduğundan L-şekilli/iç bükey odalar için de geçerli) kesişim ALANINI tartar.
   Döner: { room_id, room_weights:[{room_id,coverage_ratio}], cone_spills, cone_polygon_px, cone_polygon_norm }.
   ⛔ TEK UZAY: cam.x_px/y_px ile oda polygon_px aynı render-png pikselinde olmalı. */
const FP_LENS_FOV = { 16:100, 24:74, 35:54, 50:40 };   // arayüzdeki cone ile birebir yatay FOV
function fpLensFov(mm){ return FP_LENS_FOV[mm] || 65; }
function fpPolyArea(poly){ let a=0; for(let i=0,j=poly.length-1;i<poly.length;j=i++) a+=(poly[j][0]+poly[i][0])*(poly[j][1]-poly[i][1]); return Math.abs(a)/2; }
function fpPipIn(x,y,poly){ let c=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){ const a=poly[i],b=poly[j];
  if(((a[1]>y)!==(b[1]>y)) && (x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])) c=!c; } return c; }
function fpSegDist(p,a,b){ const vx=b[0]-a[0], vy=b[1]-a[1], wx=p[0]-a[0], wy=p[1]-a[1];
  const L=vx*vx+vy*vy; let t=L?((wx*vx+wy*vy)/L):0; t=t<0?0:(t>1?1:t);
  return Math.hypot(a[0]+t*vx-p[0], a[1]+t*vy-p[1]); }
function fpDistToPoly(p,poly){ if(fpPipIn(p[0],p[1],poly)) return 0; let d=Infinity;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++) d=Math.min(d, fpSegDist(p,poly[j],poly[i])); return d; }
/* subject (her tür, iç bükey olabilir) ∩ clip (KONVEKS) → kırpılmış poligon */
function fpClipConvex(subject, clip){
  let w=0; for(let i=0;i<clip.length;i++){ const a=clip[i], b=clip[(i+1)%clip.length]; w+=a[0]*b[1]-b[0]*a[1]; }
  const ccw = w>=0;
  const inside=(p,a,b)=>{ const cr=(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]); return ccw? cr>=-1e-7 : cr<=1e-7; };
  const inter=(p,q,a,b)=>{ const A1=b[1]-a[1],B1=a[0]-b[0],C1=A1*a[0]+B1*a[1];
    const A2=q[1]-p[1],B2=p[0]-q[0],C2=A2*p[0]+B2*p[1], d=A1*B2-A2*B1;
    return d?[(B2*C1-B1*C2)/d,(A1*C2-A2*C1)/d]:q.slice(); };
  let out=subject.slice();
  for(let i=0,j=clip.length-1;i<clip.length;j=i++){
    const a=clip[j], b=clip[i], inp=out; out=[]; if(!inp.length) break;
    let P=inp[inp.length-1];
    for(let k=0;k<inp.length;k++){ const Q=inp[k];
      if(inside(Q,a,b)){ if(!inside(P,a,b)) out.push(inter(P,Q,a,b)); out.push(Q); }
      else if(inside(P,a,b)) out.push(inter(P,Q,a,b));
      P=Q; }
  }
  return out;
}
/* görüş konisi → konveks yelpaze poligonu (tepe + yay; FOV<180 → konveks). depth = görüş derinliği px */
function fpConePolygon(A, headingDeg, fovDeg, depth){
  const th=headingDeg||0, half=fovDeg/2, n=Math.max(2, Math.ceil(fovDeg/12)), pts=[A.slice()];
  for(let k=0;k<=n;k++){ const a=(th-half + fovDeg*k/n)*Math.PI/180; pts.push([A[0]+depth*Math.sin(a), A[1]-depth*Math.cos(a)]); }
  return pts;
}
function cameraViewInfo(map, cam){
  if(!map||!cam||!map.render) return null;
  const W=map.render.width, H=map.render.height, A=[cam.x_px, cam.y_px];
  const EMPTY={ room_id:null, room_weights:[], cone_spills:false, cone_polygon_px:null, cone_polygon_norm:null };
  const norm=p=>[Math.round(p[0]/W*1e5)/1e5, Math.round(p[1]/H*1e5)/1e5];
  const units=map.units||[];
  /* kameranın AİT olduğu daire (içinde / en yakın) → görüş derinliği o dairenin köşegeni kadar
     (kadrajın tamamına yayılıp uzak/büyük odaları yanlışlıkla kapsamasın). */
  let home=null, hd=Infinity;
  units.forEach(u=>{ if(!u.polygon_px||u.polygon_px.length<3) return; const d=fpDistToPoly(A,u.polygon_px); if(d<hd){ hd=d; home=u; } });
  const depth=(home? Math.hypot(home.bbox_px[2]-home.bbox_px[0], home.bbox_px[3]-home.bbox_px[1]) : Math.hypot(W,H)*0.5)*1.15;
  const cands=[];
  if(home) (home.rooms||[]).forEach(r=>{ if(r.polygon_px&&r.polygon_px.length>=3) cands.push(r); });
  (map.common_areas||[]).forEach(r=>{ if(r.polygon_px&&r.polygon_px.length>=3) cands.push(r); });
  if(!cands.length) return EMPTY;
  const cone=fpConePolygon(A, cam.heading_deg||0, fpLensFov(cam.lens_mm), depth);
  const coneOf=room=>{ const clip=fpClipConvex(room.polygon_px, cone); return clip.length>=3?{ poly:clip, area:fpPolyArea(clip) }:null; };
  /* room_id seçimi — kanıt tablosuyla birebir + 2.5D-kenar dayanıklı:
     1) tutamaç bir odanın İÇİNDE ise → kamera O odadadır (kullanıcı oraya koydu). Şema kapısız/dolu
        poligon → kamera kendi odasını görür; cone_polygon = koni ∩ oda, komşuya sızmaz, spill yok.
     2) tutamaç hiçbir odada değil (eşik/duvar/2.5D-kenar) → koninin EN ÇOK doldurduğu oda kazanır
        (içeri baktığı oda); birden çok odaya bakıyorsa room_weights + cone_spills bunu gösterir.
     3) koni de hiçbir odaya değmiyorsa → tutamaca EN YAKIN oda → room_id ASLA null kalmaz. */
  let chosen=null, weights, spills;
  const apexRoom=cands.find(r=>fpPipIn(A[0], A[1], r.polygon_px)) || null;
  if(apexRoom){
    chosen=apexRoom; weights=[{ room_id:apexRoom.id, coverage_ratio:1 }]; spills=false;
  } else {
    const hits=[]; cands.forEach(r=>{ const c=coneOf(r); if(c&&c.area>1) hits.push({ room:r, area:c.area }); });
    hits.sort((a,b)=>b.area-a.area);
    if(hits.length){
      const total=hits.reduce((s,h)=>s+h.area,0);
      chosen=hits[0].room;
      weights=hits.map(h=>({ room_id:h.room.id, coverage_ratio:Math.round(h.area/total*1e3)/1e3 })).filter(w=>w.coverage_ratio>=0.02);
      spills=weights.filter(w=>w.coverage_ratio>=0.12).length>1;
    } else {
      let nd=Infinity; cands.forEach(r=>{ const d=fpDistToPoly(A, r.polygon_px); if(d<nd){ nd=d; chosen=r; } });
      weights=chosen?[{ room_id:chosen.id, coverage_ratio:1 }]:[]; spills=false;
    }
  }
  if(!chosen) return EMPTY;
  /* cone_polygon: koni ∩ SEÇİLEN oda → komşu odaya sızmaz (describe bunu doğrudan kırpar) */
  const cc=coneOf(chosen);
  let cpoly=null, cnorm=null;
  if(cc&&cc.poly.length>=3){ cpoly=cc.poly.map(p=>[Math.round(p[0]*10)/10, Math.round(p[1]*10)/10]); cnorm=cc.poly.map(norm); }
  return { room_id:chosen.id, room_weights:weights, cone_spills:spills, cone_polygon_px:cpoly, cone_polygon_norm:cnorm };
}
function fpDownload(name, text, mime){
  const blob=new Blob([text],{type:mime||'application/octet-stream'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click();
  setTimeout(()=>{ try{ URL.revokeObjectURL(a.href); }catch(e){} }, 2000);
}
function exportFloorplanMapFiles(){
  const map=buildFloorplanMap(); if(!map){ alert('Önce yerleşim oluşturun.'); return; }
  fpDownload('floorplan-map.json', JSON.stringify(map,null,2), 'application/json');
  setTimeout(()=>fpDownload('floorplan-overlay.svg', buildFloorplanOverlaySVG(map), 'image/svg+xml'), 300);
}
if(typeof window!=='undefined'){ window.buildFloorplanMap=buildFloorplanMap; window.buildFloorplanOverlaySVG=buildFloorplanOverlaySVG; window.cameraViewInfo=cameraViewInfo; }
/* AI Output: tek tıkla DÖRT dosya — renkli boyama tabanı + duvar kenar haritası
   (aynı kadraj) + oda/daire haritası JSON + doğrulama overlay SVG.
   Boyama rengi/etiketi verir, kenar haritası geometriyi kilitler → stilli + %100
   layout-sadık; harita+overlay odaları makineye okunur kılar (gözle tahmin biter). */
function exportAIOutput(){
  exportAIPaintPNG();                        // 1) kat-plani-AI-boyama.png  (renkli, EN etiket)
  setTimeout(exportEdgeMaskPNG, 500);        // 2) kat-plani-controlnet-edges.png
  setTimeout(exportFloorplanMapFiles, 1000); // 3) floorplan-map.json + 4) floorplan-overlay.svg
}
document.getElementById('svgBtn').onclick=exportSVG;
document.getElementById('pngBtn').onclick=exportPNG;
document.getElementById('aiOutputBtn').onclick=exportAIOutput;

/* ================= içe aktarma =================
   1) kpState gömülü SVG / .json → restoreState (birebir geri yükleme)
   2) Eski (durumsuz) dışa aktarılmış SVG → geometri çözümleyici:
      hücre dolgu kareleri (0,5 m) + duvar çizgileri + kapı boşlukları + etiketlerden
      bölgeler, daireler ve program geri kurulur. Deneysel; balkon/parsel taşınmaz. */
function importLegacySvg(txt){
  const doc=new DOMParser().parseFromString(txt,'image/svg+xml');
  if(doc.querySelector('parsererror')) throw new Error('SVG okunamadı');
  /* ölçek: ızgara çizgileri 0,5 m aralıklı */
  const gxs=[...doc.querySelectorAll('line[stroke="#eae5d9"]')]
    .map(l=>parseFloat(l.getAttribute('x1')))
    .filter((v,i,a)=>!isNaN(v)&&a.indexOf(v)===i).sort((a,b)=>a-b);
  let S=45;
  if(gxs.length>=2){ const ds=[]; for(let i=1;i<gxs.length;i++) ds.push(gxs[i]-gxs[i-1]);
    ds.sort((a,b)=>a-b); S=2*ds[Math.floor(ds.length/2)]; }
  /* dış sınır: en kalın çizgili, dolgusuz path */
  let bp=null,bw=0;
  doc.querySelectorAll('path').forEach(p2=>{
    const sw=parseFloat(p2.getAttribute('stroke-width')||0), f=p2.getAttribute('fill');
    if(sw>bw&&(f==='none'||!f)){ bw=sw; bp=p2; } });
  if(!bp) throw new Error('bina sınırı bulunamadı');
  const nums=(bp.getAttribute('d').match(/-?[\d.]+/g)||[]).map(Number);
  const bpts=[]; for(let i=0;i+1<nums.length;i+=2) bpts.push({x:nums[i],y:nums[i+1]});
  if(bpts.length<3) throw new Error('bina sınırı çözülemedi');
  const ox=Math.min(...bpts.map(p2=>p2.x)), oy=Math.min(...bpts.map(p2=>p2.y));
  const toM=v=>Math.round(v/S*2)/2;
  const poly=bpts.map(p2=>({x:toM(p2.x-ox), y:toM(p2.y-oy)}));
  const W=Math.max(...poly.map(p2=>p2.x)), H=Math.max(...poly.map(p2=>p2.y));
  const cols2=Math.round(W/M), rows2=Math.round(H/M);
  const pip2=(x,y)=>{ let inn=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const a=poly[i],b=poly[j];
      if((a.y>y)!==(b.y>y) && x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x) inn=!inn; }
    return inn; };
  /* hücreler: tipe boyalı 0,5 m kareler (sınır dışı taşma kopyaları PIP ile elenir) */
  const colorType={}; for(const t in COLORS) colorType[COLORS[t].toLowerCase()]=t;
  const cellType=new Array(rows2*cols2).fill(null);
  const csPx=S*M;
  doc.querySelectorAll('rect').forEach(rc=>{
    const f=(rc.getAttribute('fill')||'').toLowerCase();
    const t=colorType[f]; if(!t) return;
    const w2=parseFloat(rc.getAttribute('width')), x=parseFloat(rc.getAttribute('x')), y=parseFloat(rc.getAttribute('y'));
    if(!(Math.abs(w2-csPx)<2)) return; // hücre boyutunda değil (tablo/araç kutusu)
    const mx=(x-ox)/S+M/2, my=(y-oy)/S+M/2;
    if(!pip2(mx,my)) return;
    const c=Math.floor(mx/M), r=Math.floor(my/M);
    if(r<0||c<0||r>=rows2||c>=cols2) return;
    cellType[r*cols2+c]=t; });
  if(!cellType.some(Boolean)) throw new Error('oda hücreleri bulunamadı');
  /* duvarlar: hücreler arası kapalı kenarlar (dikey: vKey r,c = (r,c-1)|(r,c) arası) */
  const vWall=new Set(), hWall=new Set();
  doc.querySelectorAll('line').forEach(l=>{
    const st2=l.getAttribute('stroke');
    if(st2&&st2!=='#2b2620'&&st2!=='#faf8f3') return; // duvar grubu stroke'u kalıtır (attr yok) ya da kapı
    if(st2==='#faf8f3') return;
    const x1=parseFloat(l.getAttribute('x1')),y1=parseFloat(l.getAttribute('y1')),
          x2=parseFloat(l.getAttribute('x2')),y2=parseFloat(l.getAttribute('y2'));
    if([x1,y1,x2,y2].some(isNaN)) return;
    if(Math.abs(x1-x2)<0.01){ // dikey duvar
      const c=Math.round((x1-ox)/S/M); if(c<=0||c>=cols2) return;
      const r0=Math.round((Math.min(y1,y2)-oy)/S/M), r1=Math.round((Math.max(y1,y2)-oy)/S/M);
      for(let r=r0;r<r1;r++) if(r>=0&&r<rows2) vWall.add(r+','+c);
    } else if(Math.abs(y1-y2)<0.01){
      const r=Math.round((y1-oy)/S/M); if(r<=0||r>=rows2) return;
      const c0=Math.round((Math.min(x1,x2)-ox)/S/M), c1=Math.round((Math.max(x1,x2)-ox)/S/M);
      for(let c=c0;c<c1;c++) if(c>=0&&c<cols2) hWall.add(r+','+c);
    } });
  /* bölgeler: duvarsız komşuluk bileşenleri */
  const regOf=new Array(rows2*cols2).fill(-1); const regs=[];
  for(let i=0;i<rows2*cols2;i++){
    if(!cellType[i]||regOf[i]>=0) continue;
    const id2=regs.length, cells2=[], stk=[i]; regOf[i]=id2;
    while(stk.length){ const j=stk.pop(); cells2.push(j);
      const r=(j/cols2)|0, c=j%cols2;
      const tryN=(jj,open)=>{ if(jj<0||jj>=rows2*cols2||!cellType[jj]||regOf[jj]>=0||!open) return;
        regOf[jj]=id2; stk.push(jj); };
      tryN(r>0?j-cols2:-1, r>0&&!hWall.has(r+','+c));
      tryN(r<rows2-1?j+cols2:-1, r<rows2-1&&!hWall.has((r+1)+','+c));
      tryN(c>0?j-1:-1, c>0&&!vWall.has(r+','+c));
      tryN(c<cols2-1?j+1:-1, c<cols2-1&&!vWall.has(r+','+(c+1))); }
    const tc={}; cells2.forEach(j=>{ tc[cellType[j]]=(tc[cellType[j]]||0)+1; });
    const ty=Object.keys(tc).sort((a,b)=>tc[b]-tc[a])[0];
    regs.push({id:id2, name:null, type:ty, unit:-1, cells:cells2});
  }
  /* etiketler: oda adı metinleri bölgeye ad verir (BANYO/WC ayrımı, EB. BANYO, KİLER)
     — ölçü yazıları (paint-order/stroke'lu, salt rakam) elenir */
  doc.querySelectorAll('text').forEach(tx=>{
    if(tx.getAttribute('font-weight')!=='700'||tx.getAttribute('fill')!=='#2b2620') return;
    if(tx.getAttribute('paint-order')||tx.getAttribute('stroke')) return;
    const nm=(tx.textContent||'').trim();
    if(!nm||nm.length>30||/^[\d,.\s×x]+$/.test(nm)) return;
    const mx=(parseFloat(tx.getAttribute('x'))-ox)/S, my=(parseFloat(tx.getAttribute('y'))-oy)/S;
    const c=Math.floor(mx/M), r=Math.floor(my/M);
    if(r<0||c<0||r>=rows2||c>=cols2) return;
    const rid=regOf[r*cols2+c]; if(rid<0) return;
    if(!regs[rid].name) regs[rid].name=nm; });
  const NAME_TYPE={'WC':'wc','BANYO':'banyo','EB. BANYO':'banyo','KİLER':'antre','APARTMAN HOLÜ':'koridor',
    'MERDİVEN':'merdiven','ASANSÖR':'asansor','ASANSÖR YERİ':'asansor','YANGIN MERD.':'yangin',
    'TEKNİK / ŞAFT':'teknik','ORTAK DEPO':'teknik','ANTRE':'antre','MUTFAK':'mutfak'};
  regs.forEach(g=>{
    /* banyo ve wc aynı renk: etiketi BANYO olan ya da etiketsiz ≥2,5 m² 'wc' aslında banyodur */
    if(g.type==='wc'&&g.name&&g.name!=='WC') g.type='banyo';
    if(g.type==='wc'&&!g.name&&g.cells.length>=10) g.type='banyo';
    if(!g.name) g.name=({koridor:'APARTMAN HOLÜ',merdiven:'MERDİVEN',asansor:'ASANSÖR',
      teknik:'TEKNİK / ŞAFT',yangin:'YANGIN MERD.'})[g.type]||(TYPE_TR[g.type]||'ODA').toUpperCase();
    if(NAME_TYPE[g.name]) g.type=NAME_TYPE[g.name];
    if(g.name.indexOf('SALON')===0||g.name==='STÜDYO'||g.name==='OTURMA ODASI') g.type='salon';
    if(g.name.indexOf('YATAK')>=0) g.type='yatak'; });
  /* kapılar: #faf8f3 çizgiler duvar boşluğudur → bölge çiftlerini bağlar */
  const doorPairs=[];
  doc.querySelectorAll('line[stroke="#faf8f3"]').forEach(l=>{
    const x1=parseFloat(l.getAttribute('x1')),y1=parseFloat(l.getAttribute('y1')),
          x2=parseFloat(l.getAttribute('x2')),y2=parseFloat(l.getAttribute('y2'));
    if([x1,y1,x2,y2].some(isNaN)) return;
    let a=-1,b=-1;
    if(Math.abs(x1-x2)<0.01){ // dikey kapı: sol/sağ hücreler
      const c=Math.round((x1-ox)/S/M), r=Math.floor(((y1+y2)/2-oy)/S/M);
      if(r<0||r>=rows2||c<=0||c>=cols2) return;
      a=regOf[r*cols2+c-1]; b=regOf[r*cols2+c];
    } else {
      const r=Math.round((y1-oy)/S/M), c=Math.floor(((x1+x2)/2-ox)/S/M);
      if(c<0||c>=cols2||r<=0||r>=rows2) return;
      a=regOf[(r-1)*cols2+c]; b=regOf[r*cols2+c];
    }
    if(a>=0&&b>=0&&a!==b) doorPairs.push([a,b]); });
  /* daireler: kapı grafiğinde (ortak alanlar hariç) bileşenler */
  const COMMON=new Set(['koridor','merdiven','asansor','teknik','yangin']);
  const adj2=new Map();
  doorPairs.forEach(([a,b])=>{
    if(COMMON.has(regs[a].type)||COMMON.has(regs[b].type)) return;
    (adj2.get(a)||adj2.set(a,[]).get(a)).push(b);
    (adj2.get(b)||adj2.set(b,[]).get(b)).push(a); });
  const unitOf=new Array(regs.length).fill(-1); let unitRaw=[];
  regs.forEach(g=>{
    if(COMMON.has(g.type)||unitOf[g.id]>=0) return;
    const k=unitRaw.length, rooms2=[], stk=[g.id]; unitOf[g.id]=k;
    while(stk.length){ const id2=stk.pop(); rooms2.push(regs[id2]);
      (adj2.get(id2)||[]).forEach(nb=>{ if(unitOf[nb]<0&&!COMMON.has(regs[nb].type)){ unitOf[nb]=k; stk.push(nb); } }); }
    unitRaw.push(rooms2); });
  /* kapısı çözülemeyen oda tek başına daire olamaz: antresi/salonu olmayan grup,
     en uzun ortak duvarlı komşu daireye katılır */
  for(let pass=0;pass<2;pass++) unitRaw.forEach((rooms2,k)=>{
    if(!rooms2.length) return;
    if(rooms2.some(r2=>r2.type==='antre'||r2.type==='salon')) return;
    const cnt2=new Map();
    rooms2.forEach(r2=>r2.cells.forEach(i=>{ const r=(i/cols2)|0,c=i%cols2;
      [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc3])=>{
        if(rr<0||cc3<0||rr>=rows2||cc3>=cols2) return;
        const rid=regOf[rr*cols2+cc3]; if(rid<0) return;
        const k2=unitOf[rid];
        if(k2>=0&&k2!==k&&unitRaw[k2].length) cnt2.set(k2,(cnt2.get(k2)||0)+1); }); }));
    let bk=-1,bn=0; cnt2.forEach((n,k2)=>{ if(n>bn){bn=n;bk=k2;} });
    if(bk>=0){ rooms2.forEach(r2=>{ unitOf[r2.id]=bk; unitRaw[bk].push(r2); }); unitRaw[k]=[]; } });
  unitRaw=unitRaw.filter(rooms2=>rooms2.length);
  const unitObjs2=unitRaw.map((rooms2,k)=>{
    rooms2.forEach(r2=>{ r2.unit=k; });
    const antre2=rooms2.find(r2=>r2.type==='antre'&&r2.name==='ANTRE')||rooms2.find(r2=>r2.type==='antre')||null;
    const beds2=rooms2.filter(r2=>r2.type==='yatak').length;
    const salons2=rooms2.filter(r2=>r2.type==='salon').length;
    const studio2=rooms2.some(r2=>r2.name==='STÜDYO');
    return {spec:{oda: studio2? Math.max(1,beds2+1) : Math.max(1,beds2),
      salon: studio2?0:Math.max(1,salons2),
      ensuite: rooms2.some(r2=>r2.name==='EB. BANYO'),
      acik: studio2||rooms2.some(r2=>r2.name&&r2.name.indexOf('SALON + MUTFAK')===0),
      adet:1}, rooms:rooms2, antre:antre2, comb:false}; });
  if(!unitObjs2.length) throw new Error('daire bulunamadı (kapı boşlukları çözülemedi)');
  /* plan kur */
  const cm2=new Int16Array(rows2*cols2); cm2.fill(-1);
  const inside2=new Uint8Array(rows2*cols2);
  regs.forEach(g=>g.cells.forEach(i=>{ cm2[i]=g.id; inside2[i]=1; }));
  let kR0=1e9,kR1=-1;
  regs.forEach(g=>{ if(g.type!=='koridor') return;
    g.cells.forEach(i=>{ const r=(i/cols2)|0; if(r<kR0)kR0=r; if(r>kR1)kR1=r; }); });
  const stairs2=regs.filter(g=>g.type==='merdiven').map(g=>{
    let r0=1e9,r1=-1,c0=1e9,c1=-1;
    g.cells.forEach(i=>{const r=(i/cols2)|0,c=i%cols2; if(r<r0)r0=r; if(r>r1)r1=r; if(c<c0)c0=c; if(c>c1)c1=c;});
    return {r0, c0, h:r1-r0+1, w:c1-c0+1}; });
  /* daire tipleri: özdeş spec'ler adetle birleşir */
  const specMap=new Map();
  unitObjs2.forEach(u=>{ const k2=JSON.stringify({...u.spec, adet:0});
    if(specMap.has(k2)) specMap.get(k2).adet++; else specMap.set(k2,{...u.spec}); });
  pts=poly; closed=true;
  parcelPts=[]; parcelClosed=false; parcelSetback=[]; parcelRot=0; parcelImar=null; psFrontEdge=-1; if(typeof imarRender==='function') imarRender(null); balconies=[];
  unitSpecs=[...specMap.values()]; renderUnits();
  customCutsZ=null; unitLayout={};
  doorOverrides={}; extraDoors=[]; doorHidden={}; editHistory=[];
  plan={regions:regs, cm:cm2, inside:inside2, rows:rows2, cols:cols2, minX:0, minY:0,
    corridorR0:kR0<=kR1?kR0:-1, corridorR1:kR0<=kR1?kR1:-1, stairs:stairs2,
    unitObjs:unitObjs2, villa:false,
    kat:parseInt(document.getElementById('katSayisi').value)||5,
    binaYuk:(parseInt(document.getElementById('katSayisi').value)||5)*(parseFloat(document.getElementById('katYuk').value)||2.9),
    perFloor:unitObjs2.length, nAsansor:regs.filter(g=>g.type==='asansor').length,
    asansorYeri:regs.some(g=>g.name==='ASANSÖR YERİ'),
    fireStairNeeded:regs.some(g=>g.type==='yangin'), teknikNeeded:regs.some(g=>g.type==='teknik'),
    zoneUI:[]};
  regs.forEach(g=>calcRegionMetrics(g, cols2, 0, 0));
  hoverWall=null; hoverRoomId=null; hoverDoor=null; hoverBalk=null; hoverP=null;
  plan.wallRuns=computeWallRuns();
  document.getElementById('genBtn').disabled=false;
  document.getElementById('svgBtn').disabled=false;
  document.getElementById('pngBtn').disabled=false;
  document.getElementById('aiOutputBtn').disabled=false;
  document.getElementById('unitTable').style.display='';
  /* durum çubuğu: çözümlenen sınırın alan/çevresi */
  document.getElementById('stArea').textContent=fmt(shoelace(pts))+' m²';
  document.getElementById('stPerim').textContent=fmt(perim(pts))+' m';
  runChecks(); buildUnitTable(); fitView(); render();
}
function importPlanText(txt, fname){
  txt=txt.replace(/^﻿/,'');
  try{
    if(/^\s*\{/.test(txt)){ restoreState(JSON.parse(txt)); return; }
    const m=txt.match(/<metadata[^>]*id="kpState"[^>]*>([\s\S]*?)<\/metadata>/);
    if(m){
      const json=m[1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
      restoreState(JSON.parse(json)); return;
    }
    importLegacySvg(txt);
  }catch(err){
    alert('İçe aktarılamadı ('+(fname||'dosya')+'): '+err.message);
  }
}
{
  const impInput=document.getElementById('impFile');
  document.getElementById('impBtn').onclick=()=>impInput.click();
  impInput.addEventListener('change',()=>{
    const f=impInput.files&&impInput.files[0]; if(!f) return;
    const rd=new FileReader();
    rd.onload=()=>importPlanText(String(rd.result), f.name);
    rd.readAsText(f); impInput.value='';
  });
  window.addEventListener('dragover',e=>{ e.preventDefault(); });
  window.addEventListener('drop',e=>{
    e.preventDefault();
    const f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]; if(!f) return;
    if(!/\.(svg|json)$/i.test(f.name)) return;
    const rd=new FileReader();
    rd.onload=()=>importPlanText(String(rd.result), f.name);
    rd.readAsText(f);
  });
}

