'use strict';
/* ================= oda duvarı düzenleyici =================
   Aynı daireye ait iki oda arasındaki düz duvar parçaları sürüklenebilir:
   duvar 0,5 m'lik hücre şeritleri aktararak hareket eder; her adımda
   mevzuat denetimi (runChecks) ve daire tablosu canlı yenilenir. */
function calcRegionMetrics(g, cols, minX, minY){
  g.area=g.cells.length*M*M;
  let r0=1e9,r1=-1e9,c0=1e9,c1=-1e9,sr=0,sc=0;
  g.cells.forEach(i=>{const r=(i/cols)|0,c=i%cols; r0=Math.min(r0,r);r1=Math.max(r1,r);c0=Math.min(c0,c);c1=Math.max(c1,c);sr+=r;sc+=c;});
  g.bw=g.cells.length?(c1-c0+1)*M:0; g.bh=g.cells.length?(r1-r0+1)*M:0;
  g.minSide=g.cells.length?Math.min(g.bw,g.bh):0;
  g.labelR=g.minSide/2;   // çapada iç-teğet daire yarıçapı (m): dikdörtgen varsayılan; n>2'de mesafe-dönüşümüyle gerçeğe çekilir (etiket boyu sığdırma)
  g.cx=g.cells.length?minX+(sc/g.cells.length+0.5)*M:0;
  g.cy=g.cells.length?minY+(sr/g.cells.length+0.5)*M:0;
  /* etiket çapası (label anchor): odanın İÇİNDE, kenarlardan en uzak hücre — "pole of
     inaccessibility"nin ızgara karşılığı (grid distance-transform). L/U/girintili odalarda
     kütle merkezi (cx,cy) boşluğa/komşu odaya düşebilir; bu nokta her zaman kendi poligonunun
     içinde ve en geniş yerde kalır. Etiket yazımı (teknik plan + AI-boyama + overlay) bunu kullanır. */
  const n=g.cells.length;
  g.labelX=g.cx; g.labelY=g.cy;
  if(n>2){
    const set=new Set(g.cells), BW=c1-c0+3, idx=(r,c)=>(r-r0+1)*BW+(c-c0+1);
    const dist=new Int16Array(BW*(r1-r0+3)).fill(-1), q=[];
    for(let r=r0-1;r<=r1+1;r++)for(let c=c0-1;c<=c1+1;c++) if(!set.has(r*cols+c)){ dist[idx(r,c)]=0; q.push(r,c); }
    for(let h=0;h<q.length;h+=2){ const r=q[h],c=q[h+1],d=dist[idx(r,c)]+1, nb=[r-1,c,r+1,c,r,c-1,r,c+1];
      for(let k=0;k<8;k+=2){ const nr=nb[k],nc=nb[k+1];
        if(nr<r0-1||nr>r1+1||nc<c0-1||nc>c1+1) continue;
        if(set.has(nr*cols+nc)&&dist[idx(nr,nc)]<0){ dist[idx(nr,nc)]=d; q.push(nr,nc); } } }
    const mc=sc/n, mr=sr/n;                         // eşit-uzaklıkta kütle merkezine en yakını → kararlı/merkezi
    let bd=-1, bDot=Infinity, bR=mr|0, bC=mc|0;
    g.cells.forEach(i=>{ const r=(i/cols)|0,c=i%cols,d=dist[idx(r,c)], dot=(c-mc)*(c-mc)+(r-mr)*(r-mr);
      if(d>bd||(d===bd&&dot<bDot)){ bd=d; bDot=dot; bR=r; bC=c; } });
    g.labelX=minX+(bC+0.5)*M; g.labelY=minY+(bR+0.5)*M;
    g.labelR=Math.max(M*0.5, bd*M);   // gerçek iç-teğet yarıçap (çapa hücresinin kenara mesafe-dönüşümü)
  }
}
function computeWallRuns(){
  const p=plan; if(!p) return [];
  const unitOf=new Map();
  p.unitObjs.forEach((u,k)=>u.rooms.forEach(g=>unitOf.set(g.id,k)));
  const FIXED=t=>t==='merdiven'||t==='yangin'||t==='asansor'||t==='teknik'; // çekirdek/kaçış/şaft sabit
  const eligible=(a,b)=>{
    if(FIXED(p.regions[a].type)||FIXED(p.regions[b].type)) return false;
    const ka=unitOf.get(a), kb=unitOf.get(b);
    // aynı daire iç duvarı VEYA daire dış sınırı (komşu daire / ortak hol) — ikisi de sürüklenebilir
    return ka!==undefined || kb!==undefined; // en az bir taraf daire odası olmalı (hol-hol değil)
  };
  const isExt=(a,b)=>unitOf.get(a)!==unitOf.get(b); // farklı daire ya da hol sınırı = dış duvar
  const hMap=new Map(), vMap=new Map();
  for(let r=0;r<p.rows;r++)for(let c=0;c<p.cols;c++){
    const i=r*p.cols+c; if(!p.inside[i]||p.cm[i]<0) continue;
    const a=p.cm[i];
    if(c+1<p.cols){ const j=i+1;
      if(p.inside[j]&&p.cm[j]>=0&&p.cm[j]!==a&&eligible(a,p.cm[j])){
        const k=(c+1)+'_'+a+'_'+p.cm[j];
        (vMap.get(k)||vMap.set(k,{pos:c+1,a,b:p.cm[j],als:[]}).get(k)).als.push(r); } }
    if(r+1<p.rows){ const j=i+p.cols;
      if(p.inside[j]&&p.cm[j]>=0&&p.cm[j]!==a&&eligible(a,p.cm[j])){
        const k=(r+1)+'_'+a+'_'+p.cm[j];
        (hMap.get(k)||hMap.set(k,{pos:r+1,a,b:p.cm[j],als:[]}).get(k)).als.push(c); } }
  }
  const runs=[];
  const split=(e,horiz)=>{ e.als.sort((x,y)=>x-y);
    let s=e.als[0], prev=e.als[0];
    for(let j=1;j<=e.als.length;j++){
      if(j===e.als.length||e.als[j]!==prev+1){
        runs.push({horiz,pos:e.pos,lo:s,hi:prev+1,a:e.a,b:e.b,ext:isExt(e.a,e.b)});
        if(j<e.als.length){ s=e.als[j]; prev=e.als[j]; } }
      else prev=e.als[j]; } };
  hMap.forEach(e=>split(e,1)); vMap.forEach(e=>split(e,0));
  return runs.filter(rn=>rn.hi-rn.lo>=2); // en az 1 m'lik duvar parçası
}
function regConnected(g){
  if(g.cells.length<2) return g.cells.length>0;
  const p=plan, set=new Set(g.cells), st=[g.cells[0]], seen=new Set([g.cells[0]]);
  while(st.length){ const i=st.pop(), r=(i/p.cols)|0, c=i%p.cols;
    [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc])=>{
      if(rr<0||cc<0||rr>=p.rows||cc>=p.cols) return;
      const j=rr*p.cols+cc; if(set.has(j)&&!seen.has(j)){ seen.add(j); st.push(j); } }); }
  return seen.size===g.cells.length;
}
/* TEK salon koruması: katları ayrı planlanan villada kalkar — bir katta salon yeter,
   ev genelini runChecks denetler ("Evde hiç salon yok"). Diğer her durumda yasal
   zorunlu piyes olarak korunur. */
function salonProtected(){ return !(plan&&plan.villa&&floorsOn()); }
/* bir oda yutulabilir mi? (duvar birleşmesinde donör oda tümüyle alıcıya katılır) */
function canAbsorb(g){
  if(!g) return false;
  if(['merdiven','yangin','asansor','teknik','koridor'].includes(g.type)) return false; // çekirdek/hol sabit
  const k=unitOfRoom(g.id); if(k<0) return false;
  const u=plan.unitObjs[k];
  if(g===u.antre) return false;                                          // giriş kaybolmasın
  if(g.type==='salon' && salonProtected() && !u.rooms.some(o=>o!==g&&o.type==='salon'&&o.cells.length)) return false; // tek salon kalsın
  return true;
}
/* duvarı 1 hücre kaydır: dir=+1 → a büyür (b'den şerit alır), dir=-1 → b büyür.
   Donör oda yok olacak kadar sıkışırsa ("sonuna kadar itildi") → oda yutulur ve
   duvarlar BİRLEŞİR: tüm donör hücreleri alıcıya geçer, oda plandan düşer. */
function moveWallStep(run, dir){
  const p=plan;
  const donor = dir>0? p.regions[run.b] : p.regions[run.a];
  const recv  = dir>0? p.regions[run.a] : p.regions[run.b];
  if(!donor.cells.length) return false;
  const line  = dir>0? run.pos : run.pos-1;
  if(line<0 || (run.horiz? line>=p.rows : line>=p.cols)) return false;
  const strip=[];
  for(let al=run.lo; al<run.hi; al++){
    const i = run.horiz? line*p.cols+al : al*p.cols+line;
    if(!p.inside[i]||p.cm[i]!==donor.id) return false; // şeridin tamamı donöre ait olmalı (3. odaya taşmaz)
    strip.push(i);
  }
  if(donor.cells.length-strip.length<4){               // donör yok olacak: birleştir ya da dur
    if(!canAbsorb(donor)) return false;                // yutulamaz oda (tek salon/antre/çekirdek) → duvar durur
    donor.cells.slice().forEach(i=>{ p.cm[i]=recv.id; recv.cells.push(i); });
    donor.cells=[];
    const k=unitOfRoom(donor.id);
    if(k>=0){ const u=p.unitObjs[k]; u.rooms=u.rooms.filter(g=>g!==donor); if(u.antre===donor) u.antre=null; }
    return 'merged';
  }
  strip.forEach(i=>{ p.cm[i]=recv.id; recv.cells.push(i); });
  const rm=new Set(strip); donor.cells=donor.cells.filter(i=>!rm.has(i));
  if(!regConnected(donor)){ // donör ikiye bölünüyorsa geri al
    strip.forEach(i=>{ p.cm[i]=donor.id; donor.cells.push(i); });
    recv.cells=recv.cells.filter(i=>!rm.has(i));
    return false;
  }
  run.pos+=dir;
  return true;
}
function wallSeg(rn){ const p=plan;
  return rn.horiz
    ? {x1:p.minX+rn.lo*M, y1:p.minY+rn.pos*M, x2:p.minX+rn.hi*M, y2:p.minY+rn.pos*M}
    : {x1:p.minX+rn.pos*M, y1:p.minY+rn.lo*M, x2:p.minX+rn.pos*M, y2:p.minY+rn.hi*M};
}
function hitWallRun(sx,sy){
  if(!plan||!plan.wallRuns) return null;
  const tol=6*HITSC;
  for(const rn of plan.wallRuns){
    const s=wallSeg(rn);
    if(rn.horiz){ if(Math.abs(sy-W2Sy(s.y1))<=tol && sx>=W2Sx(s.x1)-tol && sx<=W2Sx(s.x2)+tol) return rn; }
    else { if(Math.abs(sx-W2Sx(s.x1))<=tol && sy>=W2Sy(s.y1)-tol && sy<=W2Sy(s.y2)+tol) return rn; }
  }
  return null;
}
/* tüm plan hücre durumunun anlık görüntüsü (grup/birleşme geri alma için) */
function snapshotRegions(){
  return plan.regions.map(g=>({id:g.id, cells:g.cells.slice()}));
}
function snapshotChanged(snap){
  for(const s of snap){ const g=plan.regions[s.id];
    if(!g || g.cells.length!==s.cells.length) return true; }
  return false;
}
function restoreRegions(snap){
  snap.forEach(s=>{ const g=plan.regions[s.id]; if(!g) return;
    g.cells=s.cells.slice(); g.cells.forEach(i=>plan.cm[i]=g.id);
    calcRegionMetrics(g, plan.cols, plan.minX, plan.minY); });
}
/* tüm bölgeleri hücre hücre kıyasla (yapı taşımada uzunluklar değişmeden konum
   değişebilir; snapshotChanged yalnız uzunluğa bakar, burada içeriğe bakılır) */
function regionsChanged(snap){
  for(const s of snap){ const g=plan.regions[s.id]; if(!g) return true;
    if(g.cells.length!==s.cells.length) return true;
    const a=g.cells.slice().sort((x,y)=>x-y), b=s.cells.slice().sort((x,y)=>x-y);
    for(let i=0;i<a.length;i++) if(a[i]!==b[i]) return true; }
  return false;
}
