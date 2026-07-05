'use strict';
/* ================= PENCERELER — cephe penceresi ilk-sınıf nesne (kapının ikizi) =================
   Kapı sisteminin (doors.js) birebir ikizi. Otomatik cephe-pencere işaretleri
   (eskiden yalnız render.js FAZ3'te çizilen mavi çift-çizgi) artık EDİTLENEBİLİR
   nesneler:
     - Otomatik varsayılan set: bina sınır poligonu kenarları boyunca yaşam-odası
       (salon/yatak/mutfak) komşulu kesintisiz parçalara pencere (FAZ3 mantığı aynen).
     - windowOverrides[key]  : otomatik pencerenin ELLE taşınmış konumu (kenar boyu t)
                               + boyut geçersiz kılmaları (w/h/sill/full).
     - extraWindows[]        : çift-tıkla eklenen pencereler {ei, t, w?, h?, sill?, full?}.
     - windowHidden[key]     : çift-tıkla silinen otomatik pencere.
   generate() bunları SIFIRLAR (kapı sözleşmesiyle aynı — bölge kimlikleri yeniden doğar).
   stateSnapshot/restoreState kaydına girer (additive, geri-uyumlu).

   Her pencere kaydı (computeWindows çıktısı):
     {key, ei, e:{x,y,h,ax,ay,t}, w, height, sill, full, roomType, kind:'window', status}
   e.ax/e.ay = kenar başlangıç dünya-noktası, e.t = kenar boyu (metre) merkez konumu,
   e.h = yatay-duvar mı (yön çizim/hit için), e.x/e.y = pencere merkezinin dünya-noktası.

   NOT: checks.js DOGAL_ISIK cephe-komşuluğuna bakar (pencere NESNESİNE değil) — bu
   dosya onu ETKİLEMEZ; salt görsel/export katmanıdır. */

/* bina sınır kenarının iç normali (probe ile yön doğrulanır) + regAt yardımcısı */
function _winRegAt(x,y){
  const p=plan; if(!p) return null;
  const c=Math.floor((x-p.minX)/M), r=Math.floor((y-p.minY)/M);
  if(r<0||c<0||r>=p.rows||c>=p.cols) return null;
  const i=r*p.cols+c; if(!p.inside[i]) return null;
  const id2=p.cm[i]; return id2>=0?(p.regions[id2]||null):null;
}
/* bir sınır kenarının (A→B) geometrisi: birim vektör u, iç normal n, uzunluk len */
function winEdgeGeom(ei){
  if(!pts||!pts.length) return null;
  const A=pts[ei], B=pts[(ei+1)%pts.length];
  const dx=B.x-A.x, dy=B.y-A.y, len=Math.hypot(dx,dy); if(len<1e-6) return null;
  const ux=dx/len, uy=dy/len; let nx=-uy, ny=ux;
  if(!_winRegAt(A.x+dx*0.5+nx*0.35, A.y+dy*0.5+ny*0.35)){ nx=-nx; ny=-ny; }
  return {A,B,ux,uy,nx,ny,len};
}
/* pencere merkezinin dünya-noktası + yön (h) kenar-boyu t'den türetilir.
   h: kenar yataya mı yakın (|ux|>|uy|) → yatay duvar (h:1), değilse dikey (h:0). */
function winWorld(ei,t){
  const g=winEdgeGeom(ei); if(!g) return null;
  return {x:g.A.x+g.ux*t, y:g.A.y+g.uy*t, h:Math.abs(g.ux)>=Math.abs(g.uy)?1:0,
          ax:g.A.x, ay:g.A.y, t, ux:g.ux, uy:g.uy, nx:g.nx, ny:g.ny};
}
/* pencere boyut alanları — override/extra kaydından ya da REG.pencere varsayılanından.
   full=true → parapet 0 + yükseklik duvar yüksekliği (zemin-tavan cam). */
function winWidthM(rec){ const P=REG.pencere;
  let w=(rec&&rec.w!=null)?+rec.w:P.wDef; return Math.max(0.4, Math.min(3.0, w)); }
function winHeightM(rec){ const P=REG.pencere;
  if(rec&&rec.full) return 2.7;   // tam boy = 3B duvar yüksekliği (view3d WALL_H)
  return (rec&&rec.height!=null)?+rec.height:P.h; }
function winSillM(rec){ const P=REG.pencere;
  if(rec&&rec.full) return 0;
  return (rec&&rec.sill!=null)?+rec.sill:P.sill; }

/* OTOMATİK pencere adaylarını üret: her sınır kenarı boyunca yaşam-odası komşulu
   kesintisiz parçalar → parça başına bir pencere (FAZ3 ile aynı segmentleme).
   key = 'w'+ei+'_'+segIndex (kenar+parça sırası; generate'te bölge kimlikleri
   yeniden doğar → set yeniden hesaplanır, kapı 'r'+id / 'u'+k ile aynı ruh). */
/* SUNUM-4A B2 → SUNUM-5 S4 RAFİNE: bu kenardaki (ei) balkona bağlı PENCERE-DIŞLAMA span'leri.
   ESKİ (B2): balkonun TÜM cephe aralığı [t0,t1] pencereden dışlanıyordu → geniş balkonda kapı yanına
   pencere KOYULAMIYORDU (kullanıcı düzeltmesi).
   YENİ (S4): yalnız ODA→BALKON KAPI SPAN'İ dışlanır (io.js ile birebir: kapı = iç-kenar ortası tm ± 0.45,
   ± küçük PAD). Kenarın kalan kısmı (kapı yanı DAHİL) autoWindows'a AÇIK kalır — orada pencere-min genişlik
   (segment L≥1.6) sığıyorsa pencere ÜRETİLİR (geniş balkon), sığmazsa (dar balkon) segment kısa → zaten
   pencere doğmaz. Böylece "balkonun binaya bağlantı/dar bölümü pencere almaz, açık geniş bölümü alır" kuralı
   mevcut min-genişlik kapısıyla OTOMATİK sağlanır. balkBase parametrizasyonuyla AYNI (t0/t1 origin=pts[ei]).
   Balkonsuz plan: balconies boş → [] → pencere seti BİREBİR eski (frozen snapshot korunur). */
function _balkSpansOnEdge(ei){
  if(typeof balconies==='undefined' || !Array.isArray(balconies) || !balconies.length) return [];
  const PAD=0.30;         // kapı span'i ± pay: cam kapı ile pencere küçük dokunma da engellensin
  const DOOR_HALF=0.45;   // io.js balconyList door_span = tm ± 0.45 (ODA→BALKON cam kapı yarı-genişliği) ile birebir
  const out=[];
  for(const b of balconies){
    if(!b || b.ei!==ei || typeof b.t0!=='number' || typeof b.t1!=='number') continue;
    const tm=(b.t0+b.t1)/2;                                  // balkon iç-kenar ortası = kapı merkezi (io.js ile aynı)
    const lo=tm-DOOR_HALF-PAD, hi=tm+DOOR_HALF+PAD;          // YALNIZ kapı span'i (± pay) dışlanır — balkon geneli DEĞİL
    if(hi>lo) out.push([lo,hi]);
  }
  return out;
}
/* [s,e] aralığından balkon span'lerini çıkar → kalan alt-aralıklar dizisi (boş = tamamen balkon altında) */
function _subtractSpans(s,e,spans){
  let parts=[[s,e]];
  for(const sp of spans){ const bs=sp[0], be=sp[1];
    const next=[];
    for(const p of parts){ const ps=p[0], pe=p[1];
      if(be<=ps || bs>=pe){ next.push([ps,pe]); continue; }   // örtüşme yok
      if(bs>ps) next.push([ps,bs]);                            // sol kalıntı
      if(be<pe) next.push([be,pe]);                            // sağ kalıntı
    }
    parts=next;
  }
  return parts;
}
function autoWindows(){
  const out=[]; if(!plan||!pts||pts.length<3||!closed) return out;
  const P=REG.pencere, habit={salon:1,yatak:1,mutfak:1};
  for(let ei=0; ei<pts.length; ei++){
    const g=winEdgeGeom(ei); if(!g||g.len<1.6) continue;
    const balkSpans=_balkSpansOnEdge(ei);   // B2: bu kenardaki balkon aralıkları (pencere dışlanır)
    let segS=null, segR=null, segIdx=0;
    // ham yaşam-odası segmentini balkon span'lerine böl → her kalan parça için bir pencere.
    const push=(s,e)=>{
      const roomType=segR&&segR.type||null;
      const parts=balkSpans.length?_subtractSpans(s,e,balkSpans):[[s,e]];   // B2: balkonlu aralığı çıkar
      for(const pr of parts){ const ps=pr[0], pe=pr[1], L=pe-ps; if(L<1.6) continue;
        const w=Math.min(P.wMax,Math.max(P.wMin,L-0.6)), mid=(ps+pe)/2;
        out.push({ei, t:mid, segIdx:segIdx++, w, roomType, s:mid-w/2, e2:mid+w/2}); }
    };
    const step=0.25;
    for(let t=0;t<=g.len+1e-9;t+=step){
      const rg=_winRegAt(g.A.x+g.ux*t+g.nx*0.35, g.A.y+g.uy*t+g.ny*0.35);
      const ok=rg&&habit[rg.type];
      if(ok&&rg===segR) continue;
      if(segS!=null) push(segS,t); segS=ok?t:null; segR=ok?rg:null;
    }
    if(segS!=null) push(segS,g.len);
  }
  return out;
}
/* OTORİTE pencere listesi: auto set (hidden düşülmüş, override taşımalı) + extra.
   Her kayıt e{} + boyut alanlarıyla (w/height/sill/full) çözülür. */
function computeWindows(){
  const out=[]; if(!plan||!closed) return out;
  autoWindows().forEach(a=>{
    const key='w'+a.ei+'_'+a.segIdx;
    if(windowHidden[key]) return;
    const ov=windowOverrides[key]||{};
    const ei=(ov.ei!=null)?ov.ei:a.ei;               // taşıma başka kenara geçebilir
    const t =(ov.t!=null)?ov.t:a.t;
    const w =(ov.w!=null)?ov.w:a.w;
    const rec={key, ei, kind:'window', w, height:ov.height, sill:ov.sill, full:!!ov.full, roomType:a.roomType, status:'ok'};
    const ww=winWorld(ei,t); if(!ww){ return; }
    rec.e={x:ww.x,y:ww.y,h:ww.h,ax:ww.ax,ay:ww.ay,t,ux:ww.ux,uy:ww.uy,nx:ww.nx,ny:ww.ny};
    out.push(rec);
  });
  extraWindows.forEach((d,i)=>{
    const key='xw'+i;
    const ww=winWorld(d.ei,d.t); if(!ww){ out.push({key, ei:d.ei, kind:'window', i, e:null, status:'stale'}); return; }
    const rec={key, ei:d.ei, kind:'window', i, w:d.w!=null?d.w:REG.pencere.wDef,
               height:d.height, sill:d.sill, full:!!d.full, roomType:null, status:'ok'};
    rec.e={x:ww.x,y:ww.y,h:ww.h,ax:ww.ax,ay:ww.ay,t:d.t,ux:ww.ux,uy:ww.uy,nx:ww.nx,ny:ww.ny};
    out.push(rec);
  });
  return out;
}
function windowSnapshot(){ return {ov:JSON.parse(JSON.stringify(windowOverrides)), extra:extraWindows.map(d=>({...d})), hidden:{...windowHidden}}; }
function windowRestore(s){ windowOverrides=s?JSON.parse(JSON.stringify(s.ov||{})):{}; extraWindows=(s&&s.extra||[]).map(d=>({...d})); windowHidden=(s&&s.hidden)?{...s.hidden}:{}; }
/* imlece en yakın bina-sınır kenarı üstündeki nokta (pencere ekleme için).
   Dönüş {ei, t, x, y} — kenar boyu projeksiyonu. Yalnız yaşam-odasına komşu kenar. */
function winEdgeNear(wx,wy){
  if(!plan||!pts||pts.length<3) return null;
  let best=null, bd=Math.max(0.5, 12/pxPerM);
  for(let ei=0; ei<pts.length; ei++){
    const g=winEdgeGeom(ei); if(!g||g.len<1.2) continue;
    let t=((wx-g.A.x)*g.ux+(wy-g.A.y)*g.uy);
    t=Math.max(0.3, Math.min(g.len-0.3, t));
    const px=g.A.x+g.ux*t, py=g.A.y+g.uy*t, d=Math.hypot(wx-px,wy-py);
    if(d<bd){ bd=d; best={ei, t, x:px, y:py}; }
  }
  return best;
}
/* pencere merkezinin ekran noktası (hit için) */
function winMid(e){ return {x:W2Sx(e.x), y:W2Sy(e.y)}; }
function hitWindow(sx,sy){
  if(!plan) return null;
  let best=null, bd=170*HITSC*HITSC;
  computeWindows().forEach(d=>{
    if(d.status!=='ok'||!d.e) return;
    const m=winMid(d.e), dd=(m.x-sx)**2+(m.y-sy)**2;
    if(dd<bd){ bd=dd; best=d; }
  });
  return best;
}
