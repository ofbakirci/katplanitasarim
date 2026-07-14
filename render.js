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
  // L1-A2: net (piyes/mevzuat esas) + brüt (çevre duvar payı dahil, bilgi). Bir kez hesapla.
  const AT=(typeof computeAreaTable==='function')?computeAreaTable():new Map();
  const aOf=g=>AT.get(g.id)||{net:g.area,brut:g.area};
  plan.unitObjs.forEach((u,k)=>{
    if(!u.rooms.some(g=>g.cells.length)) return;   // silinmiş (komşuya katılmış) daire
    const live=u.rooms.filter(g=>g.cells.length);
    const totNet=live.reduce((s,g)=>s+aOf(g).net,0), totBrut=live.reduce((s,g)=>s+aOf(g).brut,0);
    const d=document.createElement('div'); d.className='utUnit';
    let rows=live.map(g=>{ const a=aOf(g);
      return `<tr data-reg="${g.id}"><td>${escapeHtml(g.name)}</td><td class="num">${fmt(g.bw)} × ${fmt(g.bh)}</td><td class="num">${fmt(a.net)} m²<span class="brut">brüt ${fmt(a.brut)}</span></td></tr>`; }).join('');
    const myBalks=balconies.filter(b=>balkUnit(b)===k);
    let balkTot=0;
    myBalks.forEach(b=>{ balkTot+=balkArea(b);
      rows+=`<tr><td>BALKON (açık)</td><td class="num">${fmt(b.t1-b.t0)} × ${fmt(b.depth)}</td><td class="num">${fmt(balkArea(b))} m²</td></tr>`; });
    d.innerHTML=`<h3 data-unit="${k}">D${k+1} · ${escapeHtml(unitTag(u.spec))} · ${fmt(totNet)} m²<span class="brut">brüt ${fmt(totBrut)} m²</span>${balkTot?` + ${fmt(balkTot)} m² balkon`:''}</h3><table class="utT">${rows}</table>`;
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
/* ================= değişiklik geçmişi paneli =================
   editHistory (yapılmış) + redoHistory (geri-alınmış, gelecek) listelenir. "şimdi" sınır işareti.
   Satıra tıkla → gotoHistory: o duruma kadar undoEdit/redoEdit döngüsü (mevcut primitifler). */
let histSig='';
function refreshHistoryUI(force){
  const eh=(typeof editHistory!=='undefined')?editHistory:[], rh=(typeof redoHistory!=='undefined')?redoHistory:[];
  const rb=document.getElementById('tRedo'); if(rb) rb.disabled = rh.length===0;   // ileri-al boşken soluk
  // ucuz dirty-check: uzunluklar + uçtaki etiketler aynıysa yeniden kurma (cut sürüklemesinde render çok çağrılır)
  const top=eh.length?(eh[eh.length-1].label||''):'', rtop=rh.length?(rh[rh.length-1].label||''):'';
  const sig=eh.length+'|'+rh.length+'|'+top+'|'+rtop;
  if(!force && sig===histSig) return;
  histSig=sig;
  const body=document.getElementById('hpBody'); if(!body) return;
  body.innerHTML='';
  if(!eh.length && !rh.length){
    const d=document.createElement('div'); d.className='histRow empty'; d.textContent='Henüz değişiklik yok';
    body.appendChild(d); return;
  }
  const addRow=(label, cls, jump, mark)=>{
    const d=document.createElement('div'); d.className='histRow'+(cls?' '+cls:'');
    const hi=document.createElement('span'); hi.className='hi'; hi.textContent=mark;
    const ht=document.createElement('span'); ht.className='ht'; ht.textContent=label;
    d.appendChild(hi); d.appendChild(ht);
    if(jump!=null){ d.dataset.jump=jump; d.onclick=()=>gotoHistory(+d.dataset.jump); }
    body.appendChild(d);
  };
  eh.forEach((e,i)=>addRow(e.label||labelFor(e), null, -(eh.length-i), String(i+1)));   // yapılmış: eski→yeni
  addRow('şimdi', 'now', null, '●');                                                     // sınır
  for(let j=rh.length-1, n=1; j>=0; j--, n++) addRow(rh[j].label||'Adım', 'future', n, '↷'); // gelecek: yakın→uzak
}
/* geçmişte gez: delta<0 → |delta| kez geri al, delta>0 → delta kez ileri al */
function gotoHistory(delta){
  if(!delta) return;
  if(delta<0){ for(let i=0;i<-delta && editHistory.length;i++) undoEdit(); }
  else { for(let i=0;i<delta && redoHistory.length;i++) redoEdit(); }
  render();
}
(function(){ /* geçmiş panelini daralt/genişlet */
  const tb=document.getElementById('hpToggle'); if(!tb) return;
  tb.addEventListener('click',()=>{
    const b=document.getElementById('hpBody');
    const off=b.style.display==='none';
    b.style.display=off?'block':'none';
    tb.textContent=off?'–':'+'; });
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
/* ================= ControlNet duvar-kenar maskesi =================
   Beyaz zemin + saf siyah SÜREKLİ duvarlar. cm komşuluk taraması TÜM oda/daire/çekirdek
   sınırlarını verir (computeWallRuns yalnız sürüklenebilir duvarları verirdi → çekirdek kaçardı).
   Kapı/açıklık çizilmez → duvarlar süreklidir (kapı boşluğu yok). Çekirdek (yangın/asansör/şaft/
   merdiven) sembolleri çizilmez → yalnız kutu sınırı. Dış kabuk pts ile en kalın. */
function drawWallEdgeMask(r){
  if(!(typeof wallBoundaryMode!=='undefined' && wallBoundaryMode)) svg.appendChild(el('rect',{x:0,y:0,width:r.width,height:r.height,fill:'#ffffff'})); // saf beyaz zemin (wallBoundaryMode'da ŞEFFAF → zemin çizilmez)
  const p=plan; if(!p) return;
  /* L1-A1: duvar tipine göre GERÇEK kalınlık bant (eski "iç=dış eşitle" dilate hack'inin
     kalıcı hali) — daireArasi/çekirdek kalın, iç bölme ince kalır; min 3px ControlNet görünürlüğü. */
  const wcls=makeWallClassifier();
  const wpx=type=>Math.max(3, wallThickM(type)*pxPerM);
  const g=el('g',{stroke:'#000','stroke-linecap':'square','shape-rendering':'crispEdges'}); svg.appendChild(g);
  const line=(x1,y1,x2,y2,w)=>g.appendChild(el('line',{x1,y1,x2,y2,'stroke-width':w}));
  const id=(rr,cc)=>(rr<0||cc<0||rr>=p.rows||cc>=p.cols||!p.inside[rr*p.cols+cc])?-9:p.cm[rr*p.cols+cc];
  /* eğik dış kenarda grid basamağı yerine pts çizgisi kullanılır (staircase gürültüsü olmasın) */
  const onEdge=(x,y)=>{ for(let i=0;i<pts.length;i++){ const A=pts[i],B=pts[(i+1)%pts.length];
    if(Math.abs((B.x-A.x)*(y-A.y)-(B.y-A.y)*(x-A.x))>1e-6) continue;
    const dot=(x-A.x)*(B.x-A.x)+(y-A.y)*(B.y-A.y), l2=(B.x-A.x)**2+(B.y-A.y)**2;
    if(dot>=-1e-9&&dot<=l2+1e-9) return true; } return false; };
  for(let rr=0;rr<p.rows;rr++)for(let cc=0;cc<p.cols;cc++){
    const a=id(rr,cc); if(a===-9) continue;
    const x=p.minX+cc*M, y=p.minY+rr*M;
    const seg=(b,x1,y1,x2,y2)=>{ if(a===b) return;                         // aynı bölge → duvar yok
      if(b===-9 && !(onEdge(x1,y1)&&onEdge(x2,y2))) return;                 // eğik dış kenar → pts kapsar
      line(W2Sx(x1),W2Sy(y1),W2Sx(x2),W2Sy(y2), wpx(b===-9?'dis':wcls(a,b))); };
    seg(id(rr,cc+1), x+M,y, x+M,y+M);                 // sağ komşu (iç duvar ya da dış kabuk)
    seg(id(rr+1,cc), x,y+M, x+M,y+M);                 // alt komşu
    if(cc===0||id(rr,cc-1)===-9) seg(-9, x,y, x,y+M); // sol dış kabuk (iç sol duvar komşunun sağ taramasında çizilir)
    if(rr===0||id(rr-1,cc)===-9) seg(-9, x,y, x+M,y); // üst dış kabuk
  }
  /* dış kabuk: bina sınır poligonu, dış cephe kalınlığı (eğik kenarlar dahil tüm sınırı tek sürekli çizgiyle kapatır) */
  if(pts.length) g.appendChild(el('path',{d:'M'+pts.map(q=>W2Sx(q.x)+','+W2Sy(q.y)).join('L')+(closed?'Z':''),
    fill:'none',stroke:'#000','stroke-width':Math.max(4,wallThickM('dis')*pxPerM),'stroke-linejoin':'miter','shape-rendering':'crispEdges'}));
}
/* S3: imkan tipine özgü ayırt edici doku — yeşil noktalar (çim/ağaç), su dalgası, oyun izi.
   Ucuz şematik işaretler (dolgu rengi zaten tipi belli eder; doku okunurluğu güçlendirir). */
function amenityTexture(g, a, def, cx, cy){
  const x0=W2Sx(a.x), y0=W2Sy(a.y), w=a.w*pxPerM, h=a.h*pxPerM;
  const clip=el('g',{}); if(a.ang) clip.setAttribute('transform',`rotate(${a.ang} ${cx} ${cy})`); g.appendChild(clip);
  const col=def.color;
  if(a.type==='green'||a.type==='seating'){
    const step=Math.max(14,pxPerM*0.9);
    for(let x=x0+step*0.6; x<x0+w-2; x+=step) for(let y=y0+step*0.6; y<y0+h-2; y+=step)
      clip.appendChild(el('circle',{cx:x,cy:y,r:Math.max(1.4,pxPerM*0.12),fill:col,'fill-opacity':0.5}));
  } else if(a.type==='pool'||a.type==='ornament'){
    const n=Math.max(2,Math.round(h/(pxPerM*1.0)));
    for(let k=1;k<n;k++){ const y=y0+h*k/n;
      let d='M'+(x0+3)+','+y; const amp=Math.max(2,pxPerM*0.18), seg=Math.max(8,pxPerM*0.7);
      for(let x=x0+3;x<x0+w-3;x+=seg){ d+=' q '+(seg/2)+' '+(-amp)+' '+seg+' 0'; }
      clip.appendChild(el('path',{d,fill:'none',stroke:col,'stroke-width':1.4,'stroke-opacity':0.55})); }
  } else if(a.type==='playground'){
    // basit oyun izi: A-çerçeve salıncak silüeti
    const mx=x0+w*0.5, top=y0+h*0.22, bot=y0+h*0.78;
    clip.appendChild(el('path',{d:`M${x0+w*0.28},${bot} L${mx},${top} L${x0+w*0.72},${bot}`,fill:'none',stroke:col,'stroke-width':1.6,'stroke-opacity':0.6}));
    clip.appendChild(el('line',{x1:mx,y1:top,x2:mx,y2:y0+h*0.6,stroke:col,'stroke-width':1.4,'stroke-opacity':0.6}));
    clip.appendChild(el('circle',{cx:mx,cy:y0+h*0.63,r:Math.max(2,pxPerM*0.14),fill:col,'fill-opacity':0.55}));
  }
}
function render(){
  svg.innerHTML='';
  const r=exportView||svg.getBoundingClientRect();
  if(typeof edgeMaskMode!=='undefined' && (edgeMaskMode||(typeof wallBoundaryMode!=='undefined'&&wallBoundaryMode))){ drawWallEdgeMask(r); return; } // ControlNet kenar maskesi / şeffaf duvar sınırı: yalnız siyah duvarlar (wallBoundaryMode'da zemin yok); başka HİÇBİR şey çizme
  const clean = typeof aiCleanMode!=='undefined' && aiCleanMode; // AI temiz mod: gürültü katmanlarını (grid/parsel/balkon/düğüm/m²/ölçü/seçim) atla
  /* S4a: site özeti canlı takip (yalnız ekran; dışa-aktarım/temiz modda değil) */
  if(!exportView && !clean && typeof updateSiteSummary==='function') updateSiteSummary();
  /* KAT-M2-BAYAT: #blockTabs m² etiketi de aynı korumalı desenle render döngüsüne bağlı — bvert
     (sınır köşe) düzenleme + undo(bound/bounddraw) + generate() zinciri noktasal çağırmıyordu.
     renderBlockTabs kendi içinde imza-memo'lu (app.js) → her render'da çağrılması ucuz; site
     kapalıyken de kendini gizliyor, guard'a gerek yok. */
  if(!exportView && !clean && typeof renderBlockTabs==='function') renderBlockTabs();
  /* ızgara (AI temiz modda çizilmez) */
  if(!clean){
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
  }

  /* site: diğer blokların sınırları (bağlamsal hayalet — düzenlenemez, yalnız konum bilgisi) */
  if(mode!=='site' && !clean && typeof otherBlockGhosts==='function'){
    const ghosts=otherBlockGhosts();
    if(ghosts.length){
      const g=el('g',{opacity:0.5}); svg.appendChild(g);
      ghosts.forEach(gh=>{
        if(!gh.pts||gh.pts.length<3) return;
        g.appendChild(el('path',{d:'M'+gh.pts.map(p=>W2Sx(p.x)+','+W2Sy(p.y)).join('L')+'Z',
          fill:'rgba(47,111,143,.05)',stroke:'#2f6f8f','stroke-width':1.5,'stroke-dasharray':'7 5','stroke-linejoin':'miter'}));
        const cen=centroidOf(gh.pts);
        const t=el('text',{x:W2Sx(cen.x),y:W2Sy(cen.y),'text-anchor':'middle','dominant-baseline':'middle',
          'font-size':Math.max(11,Math.min(20,pxPerM*1.1)),fill:'#2f6f8f','font-weight':'700',opacity:0.7});
        t.textContent='Blok '+gh.name; g.appendChild(t);
      });
    }
  }

  /* uydu arka planı — en altta, yalnız ekranda (dışa aktarımda gizli) */
  if(parcelSat && parcelSat.url && parcelPts.length>=3 && typeof exportView!=='undefined' && !exportView){
    const g=el('g',{}); svg.appendChild(g);
    if(parcelSat.rot){                                                       // parselle birlikte döndür (pivot: dx,dy)
      const cx=W2Sx(parcelSat.cx||0), cy=W2Sy(parcelSat.cy||0);
      g.setAttribute('transform','rotate('+(parcelSat.rot*180/Math.PI)+' '+cx+' '+cy+')'); }
    const im=el('image',{x:W2Sx(parcelSat.x), y:W2Sy(parcelSat.y),
      width:Math.max(0,parcelSat.w*pxPerM), height:Math.max(0,parcelSat.h*pxPerM),
      preserveAspectRatio:'none', opacity:0.95});
    im.setAttribute('href', parcelSat.url);                                  // SVG2
    im.setAttributeNS('http://www.w3.org/1999/xlink','href', parcelSat.url); // eski tarayıcı yedeği
    g.appendChild(im);
  }

  /* parsel (bahçe) + ölçüleri + "BAHÇE m²" etiketi — plan katmanlarının altında; AI temiz modda çizilmez (bina dışı, dış ölçü gürültüsü) */
  if(parcelPts.length && !clean){
    const g=el('g',{}); svg.appendChild(g);
    let d='M'+parcelPts.map(p=>W2Sx(p.x)+','+W2Sy(p.y)).join('L');
    if(parcelClosed) d+='Z';
    /* B6: kapanınca kontur kesikliden DÜZE döner (kapanış anı görsel olarak fark edilir) */
    g.appendChild(el('path',{d,fill:parcelClosed?'rgba(106,153,78,.13)':'none',stroke:'#4a7c4a','stroke-width':parcelClosed?2.4:2,'stroke-dasharray':parcelClosed?'none':'9 5','stroke-linejoin':'miter'}));
    /* FAZ 5: seçili yol cephesi (ön çekme bu kenara uygulanır) */
    if(parcelClosed && typeof psFrontEdge!=='undefined' && psFrontEdge>=0 && psFrontEdge<parcelPts.length){
      const a=parcelPts[psFrontEdge], b=parcelPts[(psFrontEdge+1)%parcelPts.length];
      g.appendChild(el('line',{x1:W2Sx(a.x),y1:W2Sy(a.y),x2:W2Sx(b.x),y2:W2Sy(b.y),stroke:'#c0392b','stroke-width':4,'stroke-linecap':'round'}));
      if(!clean){ const mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
        const t=el('text',{x:W2Sx(mx),y:W2Sy(my)-6,'text-anchor':'middle','font-size':Math.max(10,Math.min(14,pxPerM*0.9)),fill:'#c0392b','font-weight':'800'});
        t.textContent='YOL'; g.appendChild(t); }
    }
    if(!parcelClosed||mode==='parcel') parcelPts.forEach(p=>g.appendChild(el('circle',{cx:W2Sx(p.x),cy:W2Sy(p.y),r:4,fill:'#fff',stroke:'#4a7c4a','stroke-width':2})));
    polyDims(g, parcelPts, parcelClosed, '#4a7c4a');
    if(parcelClosed){
      const lbl=gardenLabelPos();
      if(lbl){ const t=el('text',{x:W2Sx(lbl.x),y:W2Sy(lbl.y),'text-anchor':'middle','font-size':Math.max(10,Math.min(14,pxPerM*0.9)),fill:'#4a7c4a','font-weight':'700'});
        t.textContent='BAHÇE · '+fmt(Math.max(0,shoelace(parcelPts)-(closed?shoelace(pts):0)))+' m²'; g.appendChild(t); }
    }
  }

  /* S3: SİTE İMKANLARI (yeşil alan / çocuk parkı / havuzlar / oturma) — parsel bahçesinde, plan
     katmanlarının altında; AI temiz modda çizilmez (bina dışı peyzaj, makine-okur layout'a gürültü).
     Normal PNG/SVG dışa aktarımında GÖRÜNÜR (drone sunum karesine iner). Aktif imkan modunda hayalet
     (yeşil geçerli / kırmızı geçersiz) + hover vurgusu. */
  if(!clean && ((typeof amenities!=='undefined' && amenities.length) || (mode==='amenity'))){
    const g=el('g',{}); svg.appendChild(g);
    const defs=(typeof REG!=='undefined'&&REG.amenities)||{};
    const drawAmenity=(a,i)=>{
      const def=defs[a.type]||{name:a.type,color:'#6a994e',fill:'rgba(106,153,78,.28)'};
      const hov = mode==='amenity' && hoverAmenity===i;
      const cx=W2Sx(a.x+a.w/2), cy=W2Sy(a.y+a.h/2);
      const r=el('rect',{x:W2Sx(a.x), y:W2Sy(a.y), width:a.w*pxPerM, height:a.h*pxPerM, rx:Math.min(8,pxPerM*0.3),
        fill:def.fill, stroke:def.color, 'stroke-width':hov?3:2, 'stroke-opacity':hov?1:0.9});
      if(a.ang) r.setAttribute('transform',`rotate(${a.ang} ${cx} ${cy})`);
      g.appendChild(r);
      amenityTexture(g, a, def, cx, cy);
      if(pxPerM*Math.min(a.w,a.h) > 26){   // etiket yalnız yeterince büyük çizildiğinde
        const t=el('text',{x:cx, y:cy, 'text-anchor':'middle','dominant-baseline':'middle',
          'font-size':Math.max(9,Math.min(13,pxPerM*0.8)), fill:def.color, 'font-weight':'700'});
        if(a.ang) t.setAttribute('transform',`rotate(${a.ang} ${cx} ${cy})`);
        t.textContent=def.name; g.appendChild(t);
      }
      /* H1b: hover'daki eksen-hizalı imkanda köşe/kenar BOYUT tutamaçları (avlu tutamaç dili). Döndürülmüşte yok. */
      if(hov && !a.ang){
        const x0=W2Sx(a.x), y0=W2Sy(a.y), x1=W2Sx(a.x+a.w), y1=W2Sy(a.y+a.h), mx=(x0+x1)/2, my=(y0+y1)/2;
        const hs=Math.max(4,Math.min(7,pxPerM*0.28));
        [[x0,y0],[x1,y0],[x1,y1],[x0,y1],[mx,y0],[mx,y1],[x0,my],[x1,my]].forEach(([hx,hy])=>{
          g.appendChild(el('rect',{x:hx-hs, y:hy-hs, width:hs*2, height:hs*2, rx:2,
            fill:'#fff', stroke:def.color, 'stroke-width':2}));
        });
      }
    };
    if(typeof amenities!=='undefined') amenities.forEach(drawAmenity);
    /* hayalet önizleme (yerleştirme) — park bay deseni: geçerli=yeşil kesikli, geçersiz=kırmızı */
    if(mode==='amenity' && typeof amenityGhost!=='undefined' && amenityGhost){
      const gh=amenityGhost, col=gh.invalid?'#c0392b':'#2e7d32', cx=W2Sx(gh.x+gh.w/2), cy=W2Sy(gh.y+gh.h/2);
      const r=el('rect',{x:W2Sx(gh.x), y:W2Sy(gh.y), width:gh.w*pxPerM, height:gh.h*pxPerM, rx:Math.min(8,pxPerM*0.3),
        fill:col, 'fill-opacity':gh.invalid?0.20:0.16, stroke:col, 'stroke-width':2, 'stroke-dasharray':(pxPerM*0.4)+' '+(pxPerM*0.3)});
      if(gh.ang) r.setAttribute('transform',`rotate(${gh.ang} ${cx} ${cy})`);
      g.appendChild(r);
    }
  }

  /* imar çekme (yapı yaklaşma) sınırı — parsel içi şematik kılavuz */
  if(parcelClosed && parcelPts.length>=3 && parcelSetback && parcelSetback.length>=3){
    const g=el('g',{}); svg.appendChild(g);
    const ds='M'+parcelSetback.map(p=>W2Sx(p.x)+','+W2Sy(p.y)).join('L')+'Z';
    g.appendChild(el('path',{d:ds,fill:'none',stroke:'#2563a8','stroke-width':1.6,'stroke-dasharray':'5 4','stroke-linejoin':'miter',opacity:.92}));
    if(!closed){ const c=centroidOf(parcelSetback);
      const t=el('text',{x:W2Sx(c.x),y:W2Sy(c.y),'text-anchor':'middle','font-size':Math.max(9,Math.min(12,pxPerM*0.75)),fill:'#2563a8','font-weight':'600'});
      t.textContent='Yapı alanı ≈ '+fmt(shoelace(parcelSetback))+' m²'; g.appendChild(t); }
  }

  if(plan && mode!=='site'){ renderPlan(); }
  /* SİTE GENEL GÖRÜNÜMÜ: tüm bloklar parselde aynı anda (hücre tint + sınır + etiket).
     Aktif blok belirgin (mavi sınır, tam opaklık), diğerleri soluk. tıkla=düzenle, sürükle=taşı. */
  if(mode==='site' && !clean && typeof siteBlocksData==='function'){
    const data=siteBlocksData(), g=el('g',{}), cs=M*pxPerM; svg.appendChild(g);
    data.forEach(bd=>{
      if(bd.regions && bd.regions.length && bd.cols && bd.minX!=null){
        bd.regions.forEach(rg=>{ const col=COLORS[rg.type]||'#ece4d2';
          (rg.cells||[]).forEach(i=>{ const r=(i/bd.cols)|0, c=i%bd.cols;
            g.appendChild(el('rect',{x:W2Sx(bd.minX+c*M), y:W2Sy(bd.minY+r*M), width:cs+0.5, height:cs+0.5,
              fill:col, opacity:bd.active?0.95:0.55})); }); });
      } else {
        g.appendChild(el('path',{d:'M'+bd.pts.map(p=>W2Sx(p.x)+','+W2Sy(p.y)).join('L')+'Z', fill:'rgba(47,111,143,.08)'}));
      }
      g.appendChild(el('path',{d:'M'+bd.pts.map(p=>W2Sx(p.x)+','+W2Sy(p.y)).join('L')+'Z', fill:'none',
        stroke:bd.active?'#2f6f8f':'#6b5e4d', 'stroke-width':bd.active?Math.max(3,pxPerM*0.2):2, 'stroke-linejoin':'miter'}));
      const cen=centroidOf(bd.pts), area=shoelace(bd.pts), fs=Math.max(11,Math.min(22,pxPerM*1.0));
      const t=el('text',{x:W2Sx(cen.x), y:W2Sy(cen.y)-fs*0.2, 'text-anchor':'middle','dominant-baseline':'middle',
        'font-size':fs, 'font-weight':'800', fill:bd.active?'#2f6f8f':'#3b332a'});
      t.textContent='Blok '+bd.name; g.appendChild(t);
      const t2=el('text',{x:W2Sx(cen.x), y:W2Sy(cen.y)+fs*0.9, 'text-anchor':'middle','dominant-baseline':'middle',
        'font-size':fs*0.7, fill:'#6b5e4d'});
      t2.textContent=fmt(area)+' m² · '+bd.kat+' kat'; g.appendChild(t2);
    });
  }
  /* bina poligonu (site genel görünümünde döşemeler sınırı çizer) */
  if(pts.length && mode!=='site'){
    const g=el('g',{}); svg.appendChild(g);
    let d='M'+pts.map(p=>W2Sx(p.x)+','+W2Sy(p.y)).join('L');
    if(closed) d+='Z';
    // L1-A1: bina dış cephe konturu = dış duvar kalınlığı bandı (pts merkez-çizgi, ±t/2; eğik cephede hücre basamağına değil pts'e hizalı kalır)
    g.appendChild(el('path',{d,fill:closed&&!plan?'rgba(179,90,46,.07)':'none',stroke:'#2b2620','stroke-width':plan?Math.max(3,wallThickM('dis')*pxPerM):2.5,'stroke-linejoin':'miter'}));
    if(!plan||!closed){
      // P3: kapalı bina + henüz yerleşim yok + draw modu → köşe tutamaçları SÜRÜKLENEBİLİR
      //     (data-bvert; yapı modundaki turuncu köşe ailesinin ikizi). Diğer durumda düz nokta.
      const edit = (closed && !plan && mode==='draw');
      const bHov=(i)=> edit && hoverStructH && hoverStructH.kind==='bvert' && hoverStructH.idx===i;
      if(edit && pts.length>=3){   // kenar ortası "+" = köşe ekle (yapı modu ailesinin ikizi)
        for(let i=0;i<pts.length;i++){ const a=pts[i], b=pts[(i+1)%pts.length];
          const mx=W2Sx((a.x+b.x)/2), my=W2Sy((a.y+b.y)/2), er=Math.max(4,pxPerM*0.22);
          const e=el('circle',{cx:mx,cy:my,r:er,fill:'#fff',stroke:'#b35a2e','stroke-width':1.5,'stroke-dasharray':'2 2',cursor:'copy','data-hx':mx,'data-hy':my});
          e.dataset.bedge=i; g.appendChild(e);
          const t=el('text',{x:mx,y:my+er*0.55,'text-anchor':'middle','font-size':er*1.4,fill:'#b35a2e','font-weight':'700','pointer-events':'none'}); t.textContent='+'; g.appendChild(t); }
      }
      pts.forEach((p,i)=>{ const cx=W2Sx(p.x), cy=W2Sy(p.y), on=bHov(i), r=(edit?Math.max(5,pxPerM*0.3):4)*(on?1.35:1);
        if(on) g.appendChild(el('circle',{cx,cy,r:r+4,fill:'#b35a2e',opacity:0.16,'pointer-events':'none'}));
        const c=el('circle',{cx,cy,r,fill:'#fff',stroke:'#b35a2e','stroke-width':2});
        if(edit){ c.setAttribute('cursor','move'); c.dataset.bvert=i; c.dataset.hx=cx; c.dataset.hy=cy; }
        g.appendChild(c); });
    }
    if(!clean) polyDims(g, pts, closed, '#6b5e4d'); // dış kenar ölçüleri ("32 m"/"16 m") AI temiz modda yok
    /* --- FAZ 3: pencereler — artık İLK-SINIF nesneler (windows.js computeWindows).
       Otomatik varsayılan set (yaşam-odası komşulu cephe parçaları) + elle
       taşınmış/eklenmiş/silinmiş pencereler tek listede. Sınır çizgisi üstünde,
       duvarın içinde (eğik cephede de) çizilir; genişlik pencere kaydından (winWidthM).
       Pencere modunda: seçili pencere vurgulu + orta tutamaç. AI temiz modda tutamaç
       yok (görsel export = cam çizgisi kalır). */
    if(plan && closed && typeof computeWindows==='function'){
      const wg=el('g',{}); g.appendChild(wg);
      const cutW=Math.max(3,pxPerM*0.22)+1.6, glassW=Math.max(1,pxPerM*0.055);
      const editMode=(mode==='window' && !clean);
      computeWindows().forEach(rec=>{
        if(rec.status!=='ok'||!rec.e) return;
        const e2=rec.e, w=(typeof winWidthM==='function')?winWidthM(rec):(rec.w||1.4);
        const ux=e2.ux, uy=e2.uy, nx=e2.nx, ny=e2.ny;
        const p0={x:e2.x-ux*w/2, y:e2.y-uy*w/2}, p1={x:e2.x+ux*w/2, y:e2.y+uy*w/2};
        const sel=(editMode && selWindow===rec.key);
        wg.appendChild(el('line',{x1:W2Sx(p0.x),y1:W2Sy(p0.y),x2:W2Sx(p1.x),y2:W2Sy(p1.y),stroke:'#faf8f3','stroke-width':cutW}));
        [0.0,0.13].forEach(o=>wg.appendChild(el('line',{x1:W2Sx(p0.x+nx*o),y1:W2Sy(p0.y+ny*o),
          x2:W2Sx(p1.x+nx*o),y2:W2Sy(p1.y+ny*o),stroke:sel?'#b35a2e':'#3f6a8c','stroke-width':glassW*(sel?1.7:1),'stroke-linecap':'butt'})));
        if(editMode){
          const mx=W2Sx(e2.x), my=W2Sy(e2.y), hv=(hoverWindow&&hoverWindow.key===rec.key);
          if(sel||hv) wg.appendChild(el('circle',{cx:mx,cy:my,r:(sel?6:4)+2,fill:'#b35a2e',opacity:sel?0.18:0.12,'pointer-events':'none'}));
          wg.appendChild(el('circle',{cx:mx,cy:my,r:sel?5:4,fill:'#fff',stroke:sel?'#b35a2e':'#3f6a8c','stroke-width':2}));
        }
      });
    }
  }

  /* iç avlular (footprint'ten oyulmuş açık boşluk) + avlu modunda sürükleme önizlemesi */
  if(closed && mode!=='site' && ((courtyards&&courtyards.length) || (mode==='avlu'&&avluGhost))){
    const g=el('g',{}); svg.appendChild(g);
    const drawA=(av,ghost)=>{
      const poly=av.poly; if(!poly||poly.length<3) return;
      const inval=ghost && av.invalid;   // AV-2: geçersiz (sınır dışı) taşıma/boyut → kırmızı önizleme
      const d='M'+poly.map(p=>W2Sx(p.x)+','+W2Sy(p.y)).join('L')+'Z';
      g.appendChild(el('path',{d,fill:inval?'rgba(179,90,46,.14)':(ghost?'rgba(47,111,143,.10)':'rgba(120,160,190,.16)'),
        stroke:inval?'#b35a2e':'#2f6f8f','stroke-width':ghost?1.4:1.8,'stroke-dasharray':ghost?'5 4':'4 3','stroke-linejoin':'miter'}));
      if(ghost) return;
      const bb=bboxOf(poly), cx=(bb.minX+bb.maxX)/2, cy=(bb.minY+bb.maxY)/2;
      if(pxPerM>6 && !clean){ /* AVLU etiketi + ölçüsü AI temiz modda yok (boşluk dolgusu kalır) */
        const fs=Math.max(8,Math.min(13,pxPerM*0.6));
        const t=el('text',{x:W2Sx(cx),y:W2Sy(cy)-fs*0.25,'text-anchor':'middle','dominant-baseline':'middle',
          'font-size':fs,fill:'#2f6f8f','font-weight':'700'});
        t.textContent='AVLU'; g.appendChild(t);
        const t2=el('text',{x:W2Sx(cx),y:W2Sy(cy)+fs*0.9,'text-anchor':'middle','dominant-baseline':'middle',
          'font-size':fs*0.82,fill:'#3f6f8f'});
        t2.textContent=fmt(bb.maxX-bb.minX)+' × '+fmt(bb.maxY-bb.minY)+' m'; g.appendChild(t2);
      }
      if(mode==='avlu' && !clean){ /* AV-2: köşe + kenar-ortası boyut tutamaçları (keşfedilebilirlik) */
        const hp=[[bb.minX,bb.minY],[bb.maxX,bb.minY],[bb.maxX,bb.maxY],[bb.minX,bb.maxY],
          [cx,bb.minY],[cx,bb.maxY],[bb.minX,cy],[bb.maxX,cy]];
        hp.forEach(([hx,hy])=>g.appendChild(el('circle',{cx:W2Sx(hx),cy:W2Sy(hy),r:4,
          fill:'#fff',stroke:'#2f6f8f','stroke-width':1.5})));
      }
    };
    if(courtyards) courtyards.forEach((av,idx)=>{ if(idx!==avluDragIdx) drawA(av,false); });   // sürüklenen avlu ghost olarak çizilir
    if(mode==='avlu'&&avluGhost) drawA(avluGhost,true);
  }
  /* OTO-AVLU (avlu-rework): önerilen aday avlu — kesikli mavi kutu + "tıkla" ipucu (avlu modunda,
     hiç avlu yokken, sürükleme yokken). Kabul edilirse normal avluya dönüşür (placeSuggestedCourtyard). */
  if(mode==='avlu' && closed && !clean && avluSuggestion && !avluGhost && (!courtyards||!courtyards.length)){
    const gs=el('g',{}); svg.appendChild(gs);
    const poly=avluSuggestion.poly, bb=bboxOf(poly);
    const d='M'+poly.map(p=>W2Sx(p.x)+','+W2Sy(p.y)).join('L')+'Z';
    gs.appendChild(el('path',{d,fill:'rgba(47,111,143,.08)',stroke:'#2f6f8f','stroke-width':1.4,'stroke-dasharray':'2 4','stroke-linecap':'round'}));
    if(pxPerM>5){ const fs=Math.max(8,Math.min(12,pxPerM*0.55));
      const t=el('text',{x:W2Sx((bb.minX+bb.maxX)/2),y:W2Sy((bb.minY+bb.maxY)/2),'text-anchor':'middle','dominant-baseline':'middle',
        'font-size':fs,fill:'#2f6f8f','font-weight':'700','opacity':0.85});
      t.textContent='avlu öner'; gs.appendChild(t); }
  }

  /* balkonlar */
  if(closed && mode!=='site' && !clean && (balconies.length || (mode==='balkon'&&hoverBalk&&hoverBalk.ghost))){ /* balkon AI temiz modda çizilmez → kadraj kenar-maskesiyle birebir */
    const g=el('g',{}); svg.appendChild(g);
    const wallW=plan?Math.max(3,wallThickM('dis')*pxPerM):2.5;   // L1-A1: balkon dış cepheye bağlanır → kapı boşluğu (wallW+1) dış duvar kalınlığından geniş kalsın
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
        t.textContent=((typeof aiPaintMode!=='undefined' && aiPaintMode)?'Balcony ':'BALKON ')+fmt(balkArea(b))+' m²'; g.appendChild(t);
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

  /* serbest oda çizimi: yarım poligon (köşeler + kenarlar) — mor */
  if(mode==='roomdraw' && roomPts.length && !clean){
    const rg=el('g',{}); svg.appendChild(rg);
    let rd='M'+roomPts.map(p=>W2Sx(p.x)+','+W2Sy(p.y)).join('L');
    rg.appendChild(el('path',{d:rd,fill:roomPts.length>2?'rgba(122,79,179,.10)':'none',stroke:'#7a4fb3','stroke-width':2,'stroke-dasharray':'6 4','stroke-linejoin':'round'}));
    roomPts.forEach(p=>rg.appendChild(el('circle',{cx:W2Sx(p.x),cy:W2Sy(p.y),r:4,fill:'#fff',stroke:'#7a4fb3','stroke-width':2})));
  }
  /* aktif poligon çizimi (bina veya parsel) */
  const act=activePoly();
  if(hoverP && !act.cl && !clean && (mode==='draw'||mode==='parcel'||mode==='roomdraw')){
    const g=el('g',{}); svg.appendChild(g);
    /* S4a: site modunda blok aday sınırı çakışıyorsa lastik-bant + kapatma işareti KIRMIZI
       (park/mobilya geçersiz-hayalet deseniyle tutarlı) → çakışma anında görünür. */
    const bad = mode==='draw' && typeof blockDrawBad!=='undefined' && blockDrawBad;
    const col=bad?'#c0392b':mode==='parcel'?'#4a7c4a':mode==='roomdraw'?'#7a4fb3':'#b35a2e';
    /* aday sınırın kapalı önizlemesi (≥2 köşe + imleç = 3. nokta): oda çizimindeki hayalet alanın ikizi.
       Site modunda ayrıca çakışmayı bölge olarak gösterir (bad → kırmızı). */
    if(mode==='draw' && act.arr.length>=2){
      const poly = hoverP.closing ? act.arr.slice() : act.arr.concat([{x:hoverP.x,y:hoverP.y}]);
      g.appendChild(el('path',{d:'M'+poly.map(p=>W2Sx(p.x)+','+W2Sy(p.y)).join('L')+'Z',
        fill:bad?'rgba(192,57,43,.10)':'rgba(179,90,46,.06)', stroke:'none'}));
    }
    const l=act.arr[act.arr.length-1];
    if(l){ g.appendChild(el('line',{x1:W2Sx(l.x),y1:W2Sy(l.y),x2:W2Sx(hoverP.x),y2:W2Sy(hoverP.y),stroke:col,'stroke-width':2,'stroke-dasharray':'6 4'}));
      const L=Math.hypot(hoverP.x-l.x,hoverP.y-l.y);
      const t=el('text',{x:W2Sx((l.x+hoverP.x)/2),y:W2Sy((l.y+hoverP.y)/2)-8,'text-anchor':'middle','font-size':12,fill:col,'font-weight':'700'});
      t.textContent=fmt(L)+' m'; g.appendChild(t); }
    g.appendChild(el('circle',{cx:W2Sx(hoverP.x),cy:W2Sy(hoverP.y),r:5,fill:bad?'#c0392b':hoverP.closing?'#2e7d4f':col,opacity:.8}));
    if(hoverP.snapPS) g.appendChild(el('circle',{cx:W2Sx(hoverP.x),cy:W2Sy(hoverP.y),r:9,fill:'none',stroke:'#2563a8','stroke-width':2})); // parsele yapıştı
  }
  /* gerçek kuzey oku — parsel döndürülünce gerçek kuzeyi gösterir (ekran-sabit:
     ekranda sol-alt [üstte araç çubuğu var], dışa aktarımda sol-üst).
     Temiz export'larda (AI-boyama / kenar-maskesi / duvar-sınırı) pusula GİRMEZ →
     PNG'de yabancı işaret kalmaz; ekran + normal PNG/SVG export'unda görünür. */
  if(parcelPts.length>=3
     && !(typeof aiCleanMode!=='undefined'&&aiCleanMode)
     && !(typeof edgeMaskMode!=='undefined'&&edgeMaskMode)
     && !(typeof wallBoundaryMode!=='undefined'&&wallBoundaryMode)){
    const VH=(r&&r.height)|| +svg.getAttribute('height')||600;
    const cx=46, cy=exportView?48:(VH-54), R=15, th=parcelRot||0;
    const nx=Math.sin(th), ny=-Math.cos(th);        // kuzey yön vektörü (ekran)
    const wx=-ny, wy=nx;                             // dik (kanatlar için)
    const g=el('g',{}); svg.appendChild(g);
    g.appendChild(el('circle',{cx,cy,r:24,fill:'rgba(255,255,255,.84)',stroke:'rgba(43,38,32,.18)','stroke-width':1}));
    g.appendChild(el('path',{d:'M'+(cx+nx*R)+' '+(cy+ny*R)+'L'+(cx+wx*5.5)+' '+(cy+wy*5.5)+'L'+(cx-wx*5.5)+' '+(cy-wy*5.5)+'Z',fill:'#b35a2e'}));   // kuzey
    g.appendChild(el('path',{d:'M'+(cx-nx*R)+' '+(cy-ny*R)+'L'+(cx+wx*5.5)+' '+(cy+wy*5.5)+'L'+(cx-wx*5.5)+' '+(cy-wy*5.5)+'Z',fill:'#c9bdab'}));  // güney
    const t=el('text',{x:cx+nx*(R+6.5),y:cy+ny*(R+6.5)+4,'text-anchor':'middle','font-size':12,fill:'#2b2620','font-weight':'800'}); t.textContent='N'; g.appendChild(t);
  }
  updateZoomUI();
  if(typeof psLiveUpdate==='function') psLiveUpdate();
  refreshHistoryUI();   // geçmiş paneli + ileri-al butonu (ucuz dirty-check; tüm reset noktalarını yakalar)
}

function renderPlan(){
  const p=plan, g=el('g',{}); svg.appendChild(g);
  const cs=M*pxPerM;
  const clean = typeof aiCleanMode!=='undefined' && aiCleanMode; // AI temiz mod: m²/ölçü/düğüm/D-rozet/seçim atla; dolgu+duvar+kapı boşluğu+EN etiket kalır
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
  /* otopark: gerçek park yerleri (2,5×5 m cepler, dünya koord, ang derece) + sürüş yolları.
     Park modunda: imleç altındaki yer kırmızı (sil), eklenecek boş yer kesik hayalet. */
  if(p.parking && p.parking.bays){
    const pg=el('g',{}); gc.appendChild(pg);
    const lw=Math.max(0.7,pxPerM*0.05);
    (p.parking.aisles||[]).forEach(a=>{
      const horiz=a.w>=a.h;
      const x1=horiz? a.x : a.x+a.w/2, y1=horiz? a.y+a.h/2 : a.y;
      const x2=horiz? a.x+a.w : x1,    y2=horiz? y1 : a.y+a.h;
      pg.appendChild(el('line',{x1:W2Sx(x1),y1:W2Sy(y1),x2:W2Sx(x2),y2:W2Sy(y2),
        stroke:'#aab6c2','stroke-width':Math.max(1,pxPerM*0.06),'stroke-dasharray':(pxPerM*0.45)+' '+(pxPerM*0.4)}));
    });
    p.parking.bays.forEach((b,bi)=>{
      const hov = mode==='park' && hoverBay===bi;
      const r=el('rect',{x:W2Sx(b.x),y:W2Sy(b.y),width:b.w*pxPerM,height:b.h*pxPerM,
        fill:hov?'#ffdada':'#ffffff','fill-opacity':hov?0.9:0.5,
        stroke:hov?'#c0392b':'#6f8499','stroke-width':hov?lw*1.8:lw});
      if(b.ang){ const cx=W2Sx(b.x+b.w/2), cy=W2Sy(b.y+b.h/2); r.setAttribute('transform',`rotate(${b.ang} ${cx} ${cy})`); }
      pg.appendChild(r);
    });
    if(mode==='park' && parkGhost){
      const b=parkGhost;
      // I4: geçersiz hayalet (mevcut park üstüne / alan-dışı) KIRMIZI — mobilya geçersiz-bırakma deseniyle tutarlı
      const col=b.invalid? '#c0392b' : '#2e7d32';
      const r=el('rect',{x:W2Sx(b.x),y:W2Sy(b.y),width:b.w*pxPerM,height:b.h*pxPerM,
        fill:col,'fill-opacity':b.invalid?0.22:0.18,stroke:col,'stroke-width':lw*1.6,'stroke-dasharray':(pxPerM*0.3)+' '+(pxPerM*0.25)});
      if(b.ang){ const cx=W2Sx(b.x+b.w/2), cy=W2Sy(b.y+b.h/2); r.setAttribute('transform',`rotate(${b.ang} ${cx} ${cy})`); }
      pg.appendChild(r);
    }
  }
  /* duvarlar */
  const id=(r,c)=>(r<0||c<0||r>=p.rows||c>=p.cols)?-9:(p.inside[r*p.cols+c]?p.cm[r*p.cols+c]:-9);
  /* nokta poligon kenarı üzerinde mi? (eğik kenarda ızgara dış duvarı çizilmez; sınır çizgisi duvardır) */
  const onEdge=(x,y)=>{ for(let i=0;i<pts.length;i++){ const A=pts[i],B=pts[(i+1)%pts.length];
    if(Math.abs((B.x-A.x)*(y-A.y)-(B.y-A.y)*(x-A.x))>1e-6) continue;
    const dot=(x-A.x)*(B.x-A.x)+(y-A.y)*(B.y-A.y), l2=(B.x-A.x)**2+(B.y-A.y)**2;
    if(dot>=-1e-9&&dot<=l2+1e-9) return true; } return false; };
  const walls=el('g',{stroke:'#2b2620','stroke-linecap':'square'}); gc.appendChild(walls);
  const wcls=makeWallClassifier();   // L1-A1: hücre-sınırı segmentini duvar tipine sınıfla (dış/daireArasi/çekirdek/icBölme)
  for(let r=0;r<p.rows;r++)for(let c=0;c<p.cols;c++){
    const a=id(r,c); if(a===-9) continue;
    const x=p.minX+c*M, y=p.minY+r*M;
    const draw=(b,x1,y1,x2,y2)=>{ if(a!==b){
      const outer=(b===-9);
      if(outer && !(onEdge(x1,y1)&&onEdge(x2,y2))) return;
      // L1-A1: duvar koşusu merkez-çizgi; stroke-width = gerçek kalınlık (±t/2 dolu bant, square linecap köşeleri doldurur).
      // clean (AI boyama) modunda da GERÇEK kalınlık — eski "iç=dış eşitle" dilate hack'i kaldırıldı (daireArasi 0.20 zaten belirgin sinyal).
      const t=wallThickM(outer?'dis':wcls(a,b))*pxPerM;
      walls.appendChild(el('line',{x1:W2Sx(x1),y1:W2Sy(y1),x2:W2Sx(x2),y2:W2Sy(y2),
        'stroke-width':Math.max((clean||outer)?2.5:1, t)})); } };
    draw(id(r,c+1), x+M,y, x+M,y+M);
    draw(id(r+1,c), x,y+M, x+M,y+M);
    if(c===0||id(r,c-1)===-9) draw(-9, x,y, x,y+M);
    if(r===0||id(r-1,c)===-9) draw(-9, x,y, x+M,y);
  }
  /* --- FAZ 4: kapı açılış yayı — kanat boş hacme (girilen odaya) açılır; daha boş çeyreği
     menteşe seçilir (çakışmada yön/menteşe kendiliğinden çevrilir). Salt çizim; plan değişmez. */
  const inAt=(r,c)=> r>=0&&c>=0&&r<p.rows&&c<p.cols&&!!p.inside[r*p.cols+c];
  const regAt=(r,c)=> inAt(r,c)? p.cm[r*p.cols+c] : -9;
  const drawSwing=(e,W,target)=>{
    let pvx,pvy,A,B;                                   // perp birim (oda yönü); A,B = iki söve
    if(e.h){
      const cMid=Math.floor((e.x+W/2-p.minX)/M), rB=Math.round((e.y-p.minY)/M);
      const down=regAt(rB,cMid), up=regAt(rB-1,cMid);
      const sgn=(target!=null&&(down===target||up===target))?(down===target?1:-1):(inAt(rB,cMid)?1:-1);
      pvx=0; pvy=sgn; A={x:e.x,y:e.y}; B={x:e.x+W,y:e.y};
    } else {
      const rMid=Math.floor((e.y+W/2-p.minY)/M), cR=Math.round((e.x-p.minX)/M);
      const right=regAt(rMid,cR), left=regAt(rMid,cR-1);
      const sgn=(target!=null&&(right===target||left===target))?(right===target?1:-1):(inAt(rMid,cR)?1:-1);
      pvx=sgn; pvy=0; A={x:e.x,y:e.y}; B={x:e.x,y:e.y+W};
    }
    const fit=(H,O)=>{ const ax=(O.x-H.x)/W, ay=(O.y-H.y)/W; let n=0;   // çeyrek-disk içi boş hücre
      for(let a=0.15;a<=1;a+=0.21)for(let rho=0.4;rho<=1;rho+=0.3){
        const ux=ax*(1-a)+pvx*a, uy=ay*(1-a)+pvy*a, L=Math.hypot(ux,uy)||1;
        if(inAt(Math.floor((H.y+uy/L*rho*W-p.minY)/M),Math.floor((H.x+ux/L*rho*W-p.minX)/M))) n++; }
      return n; };
    const H=fit(A,B)>=fit(B,A)?A:B, O=(H===A)?B:A;
    const th0=Math.atan2((O.y-H.y)/W,(O.x-H.x)/W), th1=Math.atan2(pvy,pvx);
    let dth=th1-th0; while(dth>Math.PI)dth-=2*Math.PI; while(dth<-Math.PI)dth+=2*Math.PI;
    let d='M'+W2Sx(O.x)+','+W2Sy(O.y);
    for(let i=1;i<=8;i++){ const th=th0+dth*i/8; d+='L'+W2Sx(H.x+Math.cos(th)*W)+','+W2Sy(H.y+Math.sin(th)*W); }
    g.appendChild(el('path',{d,fill:'none',stroke:'#9a8c78','stroke-width':Math.max(0.8,pxPerM*0.04)}));
    g.appendChild(el('line',{x1:W2Sx(H.x),y1:W2Sy(H.y),x2:W2Sx(H.x+pvx*W),y2:W2Sy(H.y+pvy*W),stroke:'#9a8c78','stroke-width':Math.max(1,pxPerM*0.05)}));
    return {pvx,pvy};   // girilen odaya (antreye) doğru birim normal — daire rozeti ters yöne (hole) kaydırmak için
  };
  /* kapılar (computeDoors: elle ayar destekli) + kapı modunda tutamaçlar */
  computeDoors().forEach(dr=>{
    if(dr.status!=='ok') return;
    const e=dr.e, hov=mode==='door' && hoverDoor && hoverDoor.key===dr.key;
    let sw=null;
    if(!clean){ const tgt = dr.kind==='unit' ? ((p.unitObjs[dr.k]&&p.unitObjs[dr.k].antre)?p.unitObjs[dr.k].antre.id:null)
                          : dr.kind==='inner' ? (dr.reg?dr.reg.id:null) : null;
      sw=drawSwing(e, Math.max(0.6,doorWidthM(dr)-0.1), tgt); }
    const sp=(typeof doorFitSpan==='function'?doorFitSpan(dr):{c0:0.45-doorWidthM(dr)/2,c1:0.45+doorWidthM(dr)/2});   // R4-4: segmente sığan boşluk (dar segmentte daralır/kayar)
    if(!sp) return;                                          // R4-4: mevzuat min bile segmente sığmadı → boşluğu çizme (clipping yerine boşluk yok)
    // boşluk çizgisi kalınlaşan duvardan GENİŞ olmalı (açıklık tam kapanmasın): L1-A1'de oyulan duvarın gerçek kalınlığına göre büyür.
    const gw=Math.max(clean?Math.max(3,pxPerM*0.3):(dr.kind==='unit'?Math.max(2,pxPerM*0.2):Math.max(1.5,pxPerM*0.12)), wallThickM(doorWallType(dr))*pxPerM+1.5);
    if(e.h) g.appendChild(el('line',{x1:W2Sx(e.x+sp.c0),y1:W2Sy(e.y),x2:W2Sx(e.x+sp.c1),y2:W2Sy(e.y),stroke:'#faf8f3','stroke-width':gw}));
    else    g.appendChild(el('line',{x1:W2Sx(e.x),y1:W2Sy(e.y+sp.c0),x2:W2Sx(e.x),y2:W2Sy(e.y+sp.c1),stroke:'#faf8f3','stroke-width':gw}));
    if(dr.kind==='unit'){
      if(!clean){ /* D1–D6 rozeti + tutamaç: AI temiz modda yok → kapı boşluğu açıkta kalır */
        let bx=e.h?W2Sx(e.x+0.45):W2Sx(e.x), by=e.h?W2Sy(e.y):W2Sy(e.y+0.45); const fs2=Math.max(8.5,Math.min(13,pxPerM*0.5));
        /* daire numarasını koridora doğru kaydır (sw=antreye birim normal, ters yön=hol) → duvar üstündeki
           ayırıcı/duvar tutamaçları numarayı ÖRTMEZ. Kapı modunda rozet=sürükleme tutamacı, hitDoor kapı
           ortasıyla hizalı kalmalı → kaydırma yok. Villada hol yok (rozet dış cephede) → kaydırma yok. */
        if(mode!=='door' && !p.villa && sw){ const off=fs2*1.05+3; bx-=sw.pvx*off; by-=sw.pvy*off; }
        g.appendChild(el('circle',{cx:bx,cy:by,r:fs2*1.05,fill:'#b35a2e',stroke:'#fff','stroke-width':1.5}));
        const tb=el('text',{x:bx,y:by+fs2*0.35,'text-anchor':'middle','font-size':fs2,fill:'#fff','font-weight':'700'});
        tb.textContent='D'+(dr.k+1); g.appendChild(tb);
        if(mode==='door') /* rozet etrafında halka tutamaç */
          g.appendChild(el('circle',{cx:bx,cy:by,r:fs2*1.05+3,fill:'none',stroke:'#b35a2e',
            'stroke-width':hov?2.5:1.5,'stroke-dasharray':hov?'none':'3 3'}));
      }
    } else if(mode==='door' && !clean){ /* iç kapı: kare tutamaç (AI temiz modda yok) */
      const m2=doorMid(e);
      g.appendChild(el('rect',{x:m2.x-4.5,y:m2.y-4.5,width:9,height:9,
        fill:hov?'#b35a2e':'#fff',stroke:'#b35a2e','stroke-width':2}));
    }
  });
  /* duvar uzunlukları: yakınlaşınca hepsi, imleç bir odanın üzerindeyken o oda her ölçekte.
     Aynı duvarı iki oda da etiketliyorsa teke iner ve duvarın ÜSTÜNE (haleyle) yazılır;
     hover'da yalnız o odanın ölçüleri belirgin kalır, diğerleri soluklaşır. */
  if(!clean && (pxPerM>=22 || hoverRoomId!=null)){ /* duvar uzunlukları (7,5 / 3 / 4,5…) AI temiz modda yok */
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
  // L1-A2: brüt etikette gösterilecekse alan haritasını render başına BİR kez hesapla (canlı; wallThick değişince tazelenir).
  const _brutAT=(typeof showBrutInLabel!=='undefined' && showBrutInLabel && typeof computeAreaTable==='function' && !clean)?computeAreaTable():null;
  p.regions.forEach(reg=>{
    if(!reg.cells.length||reg.area<2.0) return; // kırıntı bölgelere etiket yazma
    const lbl=(typeof aiPaintMode!=='undefined' && aiPaintMode)?regLabelEN(reg):reg.name;
    const lx=reg.labelX!=null?reg.labelX:reg.cx, ly=reg.labelY!=null?reg.labelY:reg.cy; // L/U odada komşuya taşmayan çapa
    let fs=Math.max(8,Math.min(13,pxPerM*0.62)), vertical=false, lines=[lbl];
    if(clean){ /* AI boyama: etiket DAHA BÜYÜK/baskın. Adaylar: 1-satır yatay, 1-satır dikey (90°), ve çok-kelimeli ise 2-satır yatay (her bölme). Her aday GERÇEK bölge ızgarasına göre 3×3 örnekle sığana kadar küçültülür (13cm pay → taşmaz/değmez); en büyük SKOR kazanır (1-satır+yatay hafif tercihli). */
      const EM=0.62, CAP=30, LH=1.05;
      const fw=(reg.freeW!=null?reg.freeW:reg.bw)*pxPerM, fh=(reg.freeH!=null?reg.freeH:reg.bh)*pxPerM;
      const inReg=(wx,wy)=>{ const c=Math.floor((wx-p.minX)/M), r=Math.floor((wy-p.minY)/M); return r>=0&&c>=0&&r<p.rows&&c<p.cols&&!!p.inside[r*p.cols+c]&&p.cm[r*p.cols+c]===reg.id; };
      const fitBlock=(lns,vert)=>{ const mc=Math.max(...lns.map(s=>s.length||1)), nL=lns.length, along=vert?fh:fw, across=vert?fw:fh;
        let f=Math.min(CAP, 0.86*along/(EM*mc), 0.72*across/(nL*LH));   // serbest açıklıkla cömert tahmin
        for(let it=0;it<12;it++){ const fm=f/pxPerM, hl=0.5*EM*fm*mc+0.13, ht=0.5*nL*LH*fm+0.13;   // blok yarı-uzunluk(en uzun satır) / yarı-kalınlık(satır sayısı) + 13cm pay
          const hw=vert?ht:hl, hh=vert?hl:ht; let ok=true;
          for(let a=-1;a<=1&&ok;a++)for(let b=-1;b<=1&&ok;b++) if(!inReg(lx+a*hw, ly+b*hh)) ok=false;
          if(ok) break; f*=0.87; }
        return f; };
      const words=(lbl||'').split(' ');
      const cands=[{lns:[lbl],vert:false},{lns:[lbl],vert:true}];        // 2-satır SADECE yatay (2-satır dikey = iki tuhaf paralel sütun → yok)
      for(let i=1;i<words.length;i++) cands.push({lns:[words.slice(0,i).join(' '),words.slice(i).join(' ')],vert:false});
      let best=null;
      cands.forEach(c=>{ const f=fitBlock(c.lns,c.vert), score=f*(c.vert?0.9:1)*(c.lns.length>1?0.9:1);  // 1-satır & yatay hafif tercihli
        if(!best||score>best.score) best={fs:f,lns:c.lns,vert:c.vert,score}; });
      fs=best.fs; vertical=best.vert; lines=best.lns;
    }
    const sx=W2Sx(lx), sy=W2Sy(ly);
    const t=el('text',{x:sx,'text-anchor':'middle','font-size':fs,'font-weight':'700',fill:'#2b2620'});
    if(clean && lines.length>1){ const n=lines.length, yb0=sy-(n-1)*1.05*fs/2+fs*0.34;   // çok-satır: blok çapada dikey ortalı
      lines.forEach((ln,i)=>{ const ts=el('tspan',{x:sx,y:yb0+i*1.05*fs}); ts.textContent=ln; t.appendChild(ts); }); }
    else { t.setAttribute('y', sy+(clean?fs*0.34:-fs*0.25)); t.textContent=lbl; }
    if(vertical) t.setAttribute('transform','rotate(-90 '+sx+' '+sy+')');   // dikey okuma: alttan yukarı (mimari konvansiyon)
    g.appendChild(t);
    if(reg.area>=2 && !clean){ /* m² değeri AI temiz modda yok; oda EN etiketi kalır */
      const t2=el('text',{x:W2Sx(lx),y:W2Sy(ly)+fs*0.95,'text-anchor':'middle','font-size':fs*0.9,fill:'#6b5e4d'});
      // L1-A2: net esas. showBrutInLabel açıksa brüt de yazılır (AYRI deneme; küçük odada sığma riski → kullanıcı onayı).
      let m2txt=fmt(reg.area)+' m²';
      if(_brutAT){ const at=_brutAT.get(reg.id); if(at) m2txt='net '+fmt(at.net)+' / brüt '+fmt(at.brut)+' m²'; }
      t2.textContent=m2txt; g.appendChild(t2); }
  });
  /* vurgulanan bölge (seçim göstergesi) — AI temiz modda yok */
  if(highlightId!=null && !clean && p.regions[highlightId] && p.regions[highlightId].cells.length){
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
  if(!clean && !p.villa && p.zoneUI && customCutsZ && mode!=='door' && mode!=='struct'){
    p.zoneUI.forEach(zu=>{
      (customCutsZ[zu.zi]||[]).forEach((v,idx)=>{
        const cx= zu.horiz? W2Sx(v) : W2Sx(zu.perp);
        const cy= zu.horiz? W2Sy(zu.perp) : W2Sy(v);
        const hov = hoverCut && hoverCut.zi===zu.zi && hoverCut.idx===idx;   // B4: hover'da büyür/parlar
        if(hov) g.appendChild(el('circle',{cx,cy,r:15,fill:'#b35a2e',opacity:0.18,'pointer-events':'none'}));  // hâle
        const c=el('circle',{cx,cy,r:hov?11.5:9,fill:'#b35a2e',stroke:'#fff','stroke-width':hov?3:2.5,cursor:zu.horiz?'ew-resize':'ns-resize'});
        c.dataset.cut=JSON.stringify({zi:zu.zi,idx,horiz:zu.horiz,min:zu.min,max:zu.max,perp:zu.perp});
        g.appendChild(c);
      });
    });
  }
  /* oda duvarı tutamaçları (kare/yuvarlak topçuklar) + vurgulanan duvar — AI temiz modda yok */
  if(p.wallRuns && !clean){
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
        const on=rn===act, col=rn.ext?EXTC:'#b35a2e';                 // B4: hover'da büyür/parlar
        const hs=(rn.ext?5.2:4.5)*(on?1.55:1);
        if(on) g.appendChild(el('circle',{cx:W2Sx(mx),cy:W2Sy(my),r:hs+4,fill:col,opacity:0.16,'pointer-events':'none'}));  // hâle
        g.appendChild(el(rn.ext?'circle':'rect', rn.ext
          ? {cx:W2Sx(mx),cy:W2Sy(my),r:hs,fill:on?col:'#fff',stroke:col,'stroke-width':on?2.4:1.8,cursor:rn.horiz?'ns-resize':'ew-resize'}
          : {x:W2Sx(mx)-hs,y:W2Sy(my)-hs,width:hs*2,height:hs*2,rx:1.5,fill:on?col:'#fff',stroke:col,'stroke-width':on?2.2:1.6,cursor:rn.horiz?'ns-resize':'ew-resize'}));
      });
    }
  }
  if(mode==='struct' && !clean) renderStructLayer();
}
function hitCutHandle(sx,sy){
  const hs=svg.querySelectorAll('circle[data-cut]');
  for(const h of hs){
    const dx=sx-+h.getAttribute('cx'), dy=sy-+h.getAttribute('cy');
    if(dx*dx+dy*dy<=225*HITSC*HITSC){
      const info=JSON.parse(h.dataset.cut);
      if(!customCutsZ||!customCutsZ[info.zi]) return null;
      return {type:'cut', zi:info.zi, arr:customCutsZ[info.zi], idx:info.idx, horiz:info.horiz, min:info.min, max:info.max, perp:info.perp};
    }
  }
  return null;
}
/* ================= B1: cut / duvar sürükleme hayalet önizleme =================
   Sürükleme SIRASINDA artık generate() KOŞMAZ (48x27 planda ~5 sn/frame). Yalnız hafif
   bir hayalet katman (#dragOverlay) güncellenir: kesikli ayırıcı çizgisi + canlı ölçü
   etiketi. Gerçek yeniden-yerleşim BIRAKINCA (finishDrag) tek sefer olur (bilinçli takas:
   canlı reflow -> drop'ta reflow, akıcılık için). */
function dragOverlay(){                          // tek seferlik üst katman; her çağrıda temizlenir + en üste taşınır
  let g=document.getElementById('dragOverlay');
  if(!g){ g=el('g',{id:'dragOverlay'}); }
  svg.appendChild(g);                            // render() svg'yi sıfırlasa da tekrar en üste eklenir
  g.innerHTML='';
  return g;
}
function clearDragOverlay(){ const g=document.getElementById('dragOverlay'); if(g&&g.parentNode) g.parentNode.removeChild(g); }
/* imleç yanında koyu ölçü rozeti (canvas dışına taşarsa yön çevirir) */
function dragMeasureLabel(g, px, py, text){
  const pad=5, fs=12, w=Math.round(text.length*6.6)+pad*2, h=fs+pad*2;
  const r=svg.getBoundingClientRect();
  let x=px+16, y=py-h-12;
  if(x+w>r.width) x=px-w-16; if(x<0) x=4;
  if(y<0) y=py+16; if(y+h>r.height) y=r.height-h-2;
  g.appendChild(el('rect',{x,y,width:w,height:h,rx:4,fill:'#2b2b2b',opacity:0.92}));
  const t=el('text',{x:x+w/2,y:y+h/2+1,'text-anchor':'middle','dominant-baseline':'middle',
    'font-size':fs,fill:'#fff','font-weight':'600','font-family':'system-ui,-apple-system,sans-serif'});
  t.textContent=text; g.appendChild(t);
}
/* ayırıcının içinde durduğu bandın DERİNLİK (hole-cephe) ekseni dünya-aralığı (hücre taraması, grab'de bir kez) */
function cutBandDepth(d){
  if(!plan) return null;
  const {minX,minY,rows,cols,inside,cm,regions}=plan;
  const isBand=j=> j>=0 && j<rows*cols && inside[j] && cm[j]>=0
     && regions[cm[j]].type!=='koridor' && !isStructReg(regions[cm[j]]);
  const v0=d.arr[d.idx];
  if(d.horiz){                                   // bölünme x ekseninde → derinlik y ekseni
    let c=Math.round((v0-minX)/M); c=Math.max(0,Math.min(cols-1,c));
    let rp=Math.round((d.perp-minY)/M); rp=Math.max(0,Math.min(rows-1,rp));
    if(!isBand(rp*cols+c)){ let f=-1; for(let dr=1;dr<rows;dr++){ if(isBand((rp-dr)*cols+c)){f=rp-dr;break;} if(isBand((rp+dr)*cols+c)){f=rp+dr;break;} } if(f<0) return null; rp=f; }
    let r0=rp,r1=rp; while(r0>0&&isBand((r0-1)*cols+c)) r0--; while(r1<rows-1&&isBand((r1+1)*cols+c)) r1++;
    return [minY+r0*M, minY+(r1+1)*M];
  } else {                                        // bölünme y ekseninde → derinlik x ekseni
    let r=Math.round((v0-minY)/M); r=Math.max(0,Math.min(rows-1,r));
    let cp=Math.round((d.perp-minX)/M); cp=Math.max(0,Math.min(cols-1,cp));
    if(!isBand(r*cols+cp)){ let f=-1; for(let dc=1;dc<cols;dc++){ if(isBand(r*cols+cp-dc)){f=cp-dc;break;} if(isBand(r*cols+cp+dc)){f=cp+dc;break;} } if(f<0) return null; cp=f; }
    let c0=cp,c1=cp; while(c0>0&&isBand(r*cols+c0-1)) c0--; while(c1<cols-1&&isBand(r*cols+c1+1)) c1++;
    return [minX+c0*M, minX+(c1+1)*M];
  }
}
function drawCutGhost(d,sx,sy){
  if(!plan) return;
  const g=dragOverlay();
  const v=d.arr[d.idx];
  if(d.bandDepth===undefined) d.bandDepth=cutBandDepth(d);
  const span=d.bandDepth||[d.perp-6, d.perp+6];   // tarama başarısız olursa görsel yedek
  let x1,y1,x2,y2, hx,hy;
  if(d.horiz){ x1=x2=W2Sx(v); y1=W2Sy(span[0]); y2=W2Sy(span[1]); hx=W2Sx(v); hy=W2Sy(d.perp); }
  else { y1=y2=W2Sy(v); x1=W2Sx(span[0]); x2=W2Sx(span[1]); hx=W2Sx(d.perp); hy=W2Sy(v); }
  g.appendChild(el('line',{x1,y1,x2,y2,stroke:'#b35a2e','stroke-width':2.5,'stroke-dasharray':'8 5','stroke-linecap':'round',opacity:0.95}));
  g.appendChild(el('circle',{cx:hx,cy:hy,r:9,fill:'#b35a2e',stroke:'#fff','stroke-width':2.5}));
  /* iki yandaki bant genişliği: konumsal komşu cut'lar, uçlarda bölge kenarı (zStart/zEnd).
     zoneUI min/max, planner.js'te bölge kenarından 2 hücre içeridedir (base+(aMin+2)*M) → +/-2*M ile gerçek kenar. */
  if(d.zStart===undefined){ d.zStart=d.min-2*M; d.zEnd=d.max+2*M; }
  const arr=d.arr, i=d.idx;
  const lo = i>0? arr[i-1] : d.zStart;
  const hi = i<arr.length-1? arr[i+1] : d.zEnd;
  dragMeasureLabel(g, sx, sy, fmt(Math.max(0,v-lo))+' m | '+fmt(Math.max(0,hi-v))+' m');
}
/* mavi duvar sürüklerken komşu iki bölgenin canlı W×H'i (moveWallStep sonucunu beklemeden) */
function drawWallMeasure(run){
  if(!plan||!run) return;
  const g=dragOverlay();
  const mx = run.horiz? plan.minX+((run.lo+run.hi)/2)*M : plan.minX+run.pos*M;
  const my = run.horiz? plan.minY+run.pos*M : plan.minY+((run.lo+run.hi)/2)*M;
  const parts=[];
  [run.a,run.b].forEach(id=>{ const gg=plan.regions[id];
    if(gg&&gg.cells&&gg.cells.length){ const b=regBox(gg); parts.push(fmt(b[2]-b[0])+'×'+fmt(b[3]-b[1])+' m'); } });
  if(parts.length) dragMeasureLabel(g, W2Sx(mx), W2Sy(my), parts.join('   '));
}
