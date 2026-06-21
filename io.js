'use strict';
/* ================= dışa aktarma ================= */
const EXPORT_FONT="'Helvetica Neue',Helvetica,Arial,sans-serif"; // sayfa CSS'i dışa aktarılan SVG'ye taşınmaz; font belirtilmezse tarayıcı varsayılan serif (Times) kullanır
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
  /* ekran yakınlığından bağımsız, etiketlerin okunaklı olduğu sabit ölçekte çiz */
  const bb=bboxOf(pts.concat(parcelPts));
  const bd=balconies.reduce((m,b)=>Math.max(m,b.depth||0),0);
  const marg=2.5+bd; // ölçü yazıları + balkon taşması (m)
  const w=bb.maxX-bb.minX+marg*2, h=bb.maxY-bb.minY+marg*2;
  const S=Math.max(22,Math.min(45,2200/w)); // ≥22 px/m: oda etiketleri ve duvar ölçüleri görünür
  const save={p:pxPerM,x:panX,y:panY};
  exportView={width:Math.round(w*S),height:Math.round(h*S),left:0,top:0};
  pxPerM=S; panX=(marg-bb.minX)*S; panY=(marg-bb.minY)*S;
  render();
  const clone=svg.cloneNode(true);
  const planW=exportView.width, planH=exportView.height;
  exportView=null; pxPerM=save.p; panX=save.x; panY=save.y; render(); // ekranı eski haline döndür
  clone.setAttribute('font-family',EXPORT_FONT);
  const tbl=exportTableGroup(planW+12, planH);
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
function stateSnapshot(bare){
  if(!plan) return null;
  const el2=id=>document.getElementById(id).value;
  const st={v:1, app:'kat-plani-tasarim',
    ui:{binaTipi:el2('binaTipi'), katSayisi:el2('katSayisi'), katYuk:el2('katYuk'), koridorYon:koridorYon},
    pts:pts.map(p=>({x:p.x,y:p.y})), parcelPts:parcelPts.map(p=>({x:p.x,y:p.y})),
    parcelClosed, balconies:balconies.map(b=>({...b})),
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
  katKullanim=(st.plan&&st.plan.katKullanim)||'konut'; // bu katın kullanım tipi (per-kat)
  pts=st.pts.map(p=>({x:p.x,y:p.y})); closed=true;
  parcelPts=(st.parcelPts||[]).map(p=>({x:p.x,y:p.y})); parcelClosed=!!st.parcelClosed;
  balconies=(st.balconies||[]).map(b=>({...b}));
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
  document.getElementById('unitTable').style.display='';
  /* durum çubuğu: içe aktarılan sınırın alan/çevresi (eski değer asılı kalmasın) */
  document.getElementById('stArea').textContent=fmt(shoelace(pts))+' m²';
  document.getElementById('stPerim').textContent=fmt(perim(pts))+' m';
  updateKatAyriUI(); updateStructResetBtn();
  runChecks(); buildUnitTable(); renderFloorTabs(); if(!opt||opt.fit!==false) fitView(); render();
}
function exportSVG(){
  const {clone}=exportClone();
  clone.setAttribute('style','background:#faf8f3');
  const st=stateSnapshot();
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
document.getElementById('svgBtn').onclick=exportSVG;
document.getElementById('pngBtn').onclick=exportPNG;

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
  parcelPts=[]; parcelClosed=false; balconies=[];
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

