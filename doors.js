'use strict';
/* ---- kapılar: aday kenarlar + seçili kenar (elle ayar destekli) ----
   Her kapı kaydı: {key, e:{x,y,h}, edges, kind:'unit'|'inner', k}
   doorOverrides[key] mevcut aday kenarlardan biriyle eşleşiyorsa o kullanılır,
   yoksa otomatik seçime (en uzun temas şeridinin ortası) düşülür. */
function pickDoorEdge(list){
  const groups=new Map();
  list.forEach(e=>{ const k=e.h? 'h'+e.y : 'v'+e.x;
    if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(e); });
  let best=null;
  groups.forEach(arr=>{
    arr.sort((a,b)=>a.h? a.x-b.x : a.y-b.y);
    let s=0;
    for(let i=1;i<=arr.length;i++){
      const brk = i===arr.length || (arr[i].h? arr[i].x-arr[i-1].x : arr[i].y-arr[i-1].y) > M+1e-9;
      if(brk){ const run=arr.slice(s,i); if(!best||run.length>best.length) best=run; s=i; }
    }
  });
  if(!best) return null;
  /* kapıyı parçanın ORTASINA çapala: kapı orta-noktası (anchor e + 0.45) parça merkezine en yakın olan kenarı seç.
     Eski "orta indeks" 2-hücrelik (1 m) parçada 2. kenarı seçip kapıyı +0.8 m yönünde ~0.35 m komşuya kaydırıyordu. */
  const dpos=e=>e.h?e.x:e.y, cmid=dpos(best[0])+best.length*M/2-0.45;
  let pick=best[0], bd=Infinity;
  best.forEach(e=>{ const d=Math.abs(dpos(e)-cmid); if(d<bd){bd=d;pick=e;} });
  return pick;
}
/* kapı boşluğu (net genişlik, m) — yönetmelik (Planlı Alanlar İmar Yönetmeliği MADDE 39, net/temiz
   genişlik minimumları): bina giriş 1.5 / daire (bağımsız bölüm) girişi 1.0 / diğer mahal (oda) 0.9 /
   balkon+tuvalet 0.8'e düşürülebilir. Kapı orta-noktası her tipte e+0.45.
   R4-4: bu İSTENEN genişlik; segmente sığmıyorsa doorFitWidth() mevzuat minimumuna DARALTIR. */
function doorWidthM(dr){
  if(!dr) return 0.9;
  if(dr.kind==='unit') return 1.0;                                     // daire (bağımsız bölüm) girişi
  if(dr.kind==='stair'||dr.kind==='fire_stair') return 1.0;            // merdiven / yangın kaçış kapısı (kaçış std ~1,0 m)
  if(dr.kind==='elevator') return 0.9;                                 // asansör kapısı
  if(dr.kind==='ext')  return /^gh/.test(dr.key||'') ? 1.5 : 1.0;      // gh = bina ana girişi (150), gd = dükkân (100)
  if(dr.kind==='extra') return dr.ext ? 1.0 : 0.9;                     // elle eklenen: dış giriş 1.0 / iç kapı 0.9
  const t=dr.reg&&dr.reg.type;
  if(t==='banyo'||t==='wc'||t==='balkon') return 0.8;                  // ıslak hacim + balkon
  return 0.9;                                                          // oda ve iç mekan kapısı
}
/* R4-4 MEVZUAT MİNİMUMU (net genişlik, m) — segmente sığmayan kapı buraya kadar DARALTILABİLİR.
   Planlı Alanlar İmar Yönetmeliği MADDE 39: bina giriş net min 1.50, bağımsız bölüm (daire) girişi 1.00,
   diğer mahal (oda) 0.90, balkon+tuvalet 0.80'e düşürülebilir. Kaçış/asansör kaçış std → daraltma yok.
   Bu minimumun ALTINA inilmez (inilmesi gerekirse kapı O SEGMENTE konmaz). */
function doorMinWidthM(dr){
  if(!dr) return 0.9;
  if(dr.kind==='unit') return 1.0;                                     // daire girişi net min 1.0 (m.39) → daraltma yok
  if(dr.kind==='stair'||dr.kind==='fire_stair') return 1.0;            // kaçış → daraltma yok (std)
  if(dr.kind==='elevator') return 0.9;                                 // asansör → sabit
  if(dr.kind==='ext')  return /^gh/.test(dr.key||'') ? 1.5 : 1.0;      // bina ana giriş 1.5 (sabit), dükkân 1.0
  if(dr.kind==='extra') return dr.ext ? 1.0 : 0.8;                     // dış giriş 1.0, iç kapı en dar 0.8
  const t=dr.reg&&dr.reg.type;
  if(t==='banyo'||t==='wc'||t==='balkon') return 0.8;                  // tuvalet/balkon m.39 ile 0.8'e düşürülebilir
  return 0.8;                                                          // oda iç kapı: 0.9 istenir, dar segmentte 0.8'e kadar inilebilir
}
/* R4-4: kapı orta-noktasını içeren SÜREKLİ segment (colinear komşu aday kenarların şeridi) sınırları
   [lo,hi] (kenar-ekseni boyunca dünya-metre). e = seçili kenar, edges = o kapının aday kenar listesi.
   Kapı yatay (h=1) ise eksen = x, dikey (h=0) ise eksen = y. */
function doorRunBounds(e, edges){
  if(!e || !edges || !edges.length) return null;
  const ax = e.h ? 'x' : 'y', off = e.h ? 'y' : 'x';   // eksen = duvar doğrultusu, off = diğer koord (aynı hatta olmalı)
  const set = edges.filter(g=> g.h===e.h && Math.abs(g[off]-e[off])<1e-6).map(g=>g[ax]);
  if(!set.length) return null;
  const has = v => set.some(s=>Math.abs(s-v)<1e-6);
  let lo=e[ax], hi=e[ax]+M;                              // kenar [ax, ax+M] genişliğinde tek hücre (M)
  while(has(lo-M)) lo-=M;                                // e'yi içeren SÜREKLİ koşu: sola/sağa M adımlarla genişlet
  while(has(hi)) hi+=M;                                  // hi = son ardışık kenarın sağ ucu
  return { lo, hi };
}
/* R4-4: kapının bu segmentteki GERÇEK boşluk genişliği (doorFitSpan'dan türer). İstenen doorWidthM segmente
   sığmıyorsa mevzuat minimumuna kadar DARALTIR (+gerekirse segmente kaydırır); min bile sığmıyorsa 0. */
function doorFitWidth(dr){
  const sp=doorFitSpan(dr); return sp ? +(sp.c1-sp.c0).toFixed(3) : 0;
}
/* R4-4: kapının bu segmentteki OTURAN boşluğunu (kenar-ekseni offset'i olarak {c0,c1}, e'ye göre) döndürür.
   Adımlar: (1) istenen doorWidthM → e+0.45 ORTALI dene; segmente sığmıyorsa (2) segment İÇİNDE KAYDIR (aynı
   genişlik, run.lo..run.hi arası); hâlâ sığmıyorsa (3) mevzuat minimumuna DARALT + kaydır; min bile run'a
   sığmıyorsa null (→ kapı bu segmente konmaz). Kaydırma sayesinde tam-run kapı (ör. 1m koşuda 1m daire
   girişi) DÜŞMEZ — yalnız segmenti gerçekten aşan (run'dan geniş) kapı daralır, min bile aşarsa düşer. */
function doorFitSpan(dr){
  if(!dr || !dr.e) return { c0:-0.45, c1:0.45 };            // segmentsiz eski davranış (0.9 varsayılan çevresinde)
  const run=(dr.run)||doorRunBounds(dr.e, dr.edges);
  const ax = dr.e.h ? dr.e.x : dr.e.y;                      // kenar başlangıcı (ekseni)
  const want=doorWidthM(dr);
  if(!run) return { c0:0.45-want/2, c1:0.45+want/2 };       // segment bilinmiyorsa daraltma/kaydırma yok (davranış korunur)
  // Amaç: run'ı AŞAN (clipping) span'ı engellemek; run'a EŞİT/KÜÇÜK olan sığar. Kapı, run UÇLARINDAKİ dik
  //   duvarlar arasına oturur (o duvarlar kasa/söve görevi görür) → tam-run kapı (1m koşuda 1m giriş) DÜŞMEZ.
  const runLen=run.hi-run.lo;
  function place(w){                                        // w run'a sığıyorsa e+0.45 ortalı, taşarsa segmente KAYDIR
    if(w>runLen+1e-6) return null;                          // bu genişlik run'a hiç sığmaz (run'dan geniş)
    let c=ax+0.45;                                          // istenen orta (doorMid ile aynı)
    if(c-w/2 < run.lo) c=run.lo+w/2;                        // sol uçtan taşma → içeri kaydır
    if(c+w/2 > run.hi) c=run.hi-w/2;                        // sağ uçtan taşma → içeri kaydır
    return { c0:(c-w/2)-ax, c1:(c+w/2)-ax };                // e'ye göre offset
  }
  return place(want) || place(doorMinWidthM(dr)) || null;   // istenen → mevzuat min → yoksa null (düşür)
}
/* L1-A1: kapının oyduğu DUVARIN tipi (REG.duvar kalınlığı) — kapı boşluğu bandı bu
   kalınlıktan geniş çizilir ki kalınlaşan duvarı tam temizlesin. Kapı kind'ından türer
   (makeWallClassifier ile uyumlu): bina/dükkan girişi=dış cephe, daire girişi=daire arası. */
function doorWallType(dr){
  if(!dr) return 'icBolme';
  if(dr.kind==='ext')   return 'dis';                                  // bina ana girişi / dükkân (dış cephe)
  if(dr.kind==='extra') return dr.ext ? 'dis' : 'icBolme';            // elle: dış giriş / iç kapı
  if(dr.kind==='unit')  return 'daireArasi';                          // daire (bağımsız bölüm) girişi = hol sınırı
  if(dr.kind==='stair'||dr.kind==='fire_stair'||dr.kind==='elevator') return 'cekirdek'; // çekirdek perde duvarı
  return 'icBolme';                                                    // inner: daire içi oda kapısı
}
function computeDoors(){
  const p=plan; if(!p) return [];
  const id=(r,c)=>(r<0||c<0||r>=p.rows||c>=p.cols)?-9:(p.inside[r*p.cols+c]?p.cm[r*p.cols+c]:-9);
  const out=[];
  const resolve=(key,edges)=>{
    const ov=doorOverrides[key];
    const m=ov && edges.find(g2=>g2.h===ov.h && Math.abs(g2.x-ov.x)<1e-6 && Math.abs(g2.y-ov.y)<1e-6);
    return m||pickDoorEdge(edges);
  };
  /* daire kapıları: antre → koridor */
  p.unitObjs.forEach((u,k)=>{
    if(!u.antre||!u.antre.cells.length) return;
    if(p.villa&&floorsOn()&&activeFloor>0) return; // üst katta sokak girişi yok; erişim iç merdivenden
    const isCor=v=>v>=0&&p.regions[v]&&p.regions[v].type==='koridor';
    /* BUG-FIX (villa giriş kapısı): önceden villa ön kapısı YALNIZ antrenin GÜNEY
       komşusu dışarıdaysa (id(r+1,c)===-9) konuyordu; diğer 3 yön yalnız koridor test
       ediyordu. Villada koridor olmadığından, antresi batı/kuzey/doğu cepheye düşen L/T
       villada giriş kapısı HİÇ yerleşmiyordu. Artık antrenin dış cepheye (−9) değen
       HERHANGİ bir kenarı aday olur — ancak GÜNEY (ön cephe) önceliklidir: güney dış
       kenar varsa eski davranış aynen sürer (dikdörtgen villada kapı yana kaymaz),
       yoksa antrenin dokunduğu öbür cephe (extAlt) kullanılır. */
    const ext=v=>p.villa&&v===-9;
    const edges=[], extAlt=[];      // edges: koridor + güney-dış (öncelikli) · extAlt: villa yan/kuzey dış cepheleri
    u.antre.cells.forEach(i=>{ const r=(i/p.cols)|0,c=i%p.cols;
      if(isCor(id(r+1,c))||ext(id(r+1,c))) edges.push({x:p.minX+c*M, y:p.minY+(r+1)*M, h:1});           // güney: koridor ya da dış cephe
      if(isCor(id(r-1,c))) edges.push({x:p.minX+c*M, y:p.minY+r*M, h:1}); else if(ext(id(r-1,c))) extAlt.push({x:p.minX+c*M, y:p.minY+r*M, h:1});
      if(isCor(id(r,c+1))) edges.push({x:p.minX+(c+1)*M, y:p.minY+r*M, h:0}); else if(ext(id(r,c+1))) extAlt.push({x:p.minX+(c+1)*M, y:p.minY+r*M, h:0});
      if(isCor(id(r,c-1))) edges.push({x:p.minX+c*M, y:p.minY+r*M, h:0}); else if(ext(id(r,c-1))) extAlt.push({x:p.minX+c*M, y:p.minY+r*M, h:0}); });
    if(p.villa && !edges.length) edges.push(...extAlt);   // güney dış cephe yoksa antrenin dokunduğu öbür cepheye giriş
    const key='u'+k;
    if(!edges.length){ out.push({key, e:null, edges, kind:'unit', k, status:'none'}); return; }
    if(doorHidden[key]){ out.push({key, e:null, edges, kind:'unit', k, status:'hidden'}); return; }
    const e=resolve(key, edges);
    if(e) out.push({key, e, edges, kind:'unit', k, status:'ok'});
  });
  /* iç kapılar: hol → odalar, eb. yatak → eb. banyo */
  p.unitObjs.forEach((u,k)=>{
    if(!u.antre) return;
    const inner=(reg,fromId)=>{
      const edges=[];
      reg.cells.forEach(i=>{ const r=(i/p.cols)|0,c=i%p.cols;
        if(id(r-1,c)===fromId) edges.push({x:p.minX+c*M,y:p.minY+r*M,h:1});
        if(id(r+1,c)===fromId) edges.push({x:p.minX+c*M,y:p.minY+(r+1)*M,h:1});
        if(id(r,c-1)===fromId) edges.push({x:p.minX+c*M,y:p.minY+r*M,h:0});
        if(id(r,c+1)===fromId) edges.push({x:p.minX+(c+1)*M,y:p.minY+r*M,h:0}); });
      const key='r'+reg.id;
      if(!edges.length) return; // komşuluk denetimi ayrıca raporluyor
      if(edges.length<2){ out.push({key, e:null, edges, kind:'inner', k, reg, status:'none'}); return; }
      if(doorHidden[key]){ out.push({key, e:null, edges, kind:'inner', k, reg, status:'hidden'}); return; }
      const e=resolve(key, edges);
      if(e) out.push({key, e, edges, kind:'inner', k, reg, status:'ok'});
    };
    u.rooms.forEach(reg=>{
      if(reg===u.antre||!reg.cells.length) return;
      if(reg.name==='EB. BANYO'){ // kapı KENDİ ebeveyn yatak odasına (ebHost) bağlanır; eski kayıtta ada düşülür
        const eb=(reg.ebHost!=null&&u.rooms.find(g2=>g2.id===reg.ebHost&&g2.cells.length))||u.rooms.find(g2=>g2.name==='EB. YATAK ODASI'&&g2.cells.length);
        if(eb) inner(reg,eb.id); return; }
      inner(reg,u.antre.id);
    });
  });
  /* konut-dışı kat (ticari/otopark/sığınak): bina girişi (apartman holü → sokak) +
     dükkân girişleri. Bölgenin DIŞ duvara (−9) bakan kenarına sokak kapısı verilir. */
  if(p.katKullanim && p.katKullanim!=='konut' && !p.unitObjs.length){
    const extDoor=(reg,key)=>{
      const edges=[];
      reg.cells.forEach(i=>{ const r=(i/p.cols)|0,c=i%p.cols;
        if(id(r-1,c)===-9) edges.push({x:p.minX+c*M, y:p.minY+r*M, h:1});
        if(id(r+1,c)===-9) edges.push({x:p.minX+c*M, y:p.minY+(r+1)*M, h:1});
        if(id(r,c-1)===-9) edges.push({x:p.minX+c*M, y:p.minY+r*M, h:0});
        if(id(r,c+1)===-9) edges.push({x:p.minX+(c+1)*M, y:p.minY+r*M, h:0}); });
      if(!edges.length) return;
      if(doorHidden[key]){ out.push({key, e:null, edges, kind:'ext', status:'hidden'}); return; }
      const e=resolve(key, edges);
      if(e) out.push({key, e, edges, kind:'ext', status:'ok'});
    };
    p.regions.forEach(g=>{ if(!g.cells.length) return;
      if(g.type==='koridor')      extDoor(g,'gh'+g.id);   // BİNA GİRİŞİ (apartman holü)
      else if(g.type==='dukkan')  extDoor(g,'gd'+g.id);   // dükkân girişi (vitrin cephesi)
    });
  }
  /* ÇEKİRDEK KAPILARI (KAPI-3B) — merdiven / yangın merdiveni / asansör bölgesinden ortak
     dolaşıma (apartman holü/koridor, yoksa herhangi bir komşu iç bölge) 1 kapı. Kaçış merdiveni
     ~1,0 m (yangın kaçış standardı), asansör ~0,9 m (doorWidthM kind'a göre verir). Konum: ortak
     duvarın uygun segmentinin ORTASI (pickDoorEdge iskeleti). 3B'de bu kapılar KAPALI kanat +
     DOLU collider olarak sürülür (içeri girilemez); 2B'de mevcut kapı diliyle boşluk çizilir.
     doorHidden ile gizlenebilir. edges her zaman komşu koridor(lar); koridor yoksa çekirdek-dışı
     herhangi bir iç bölgeye (fixOrphans sonrası nadir) düşülür. */
  {
    const CORE_KIND={merdiven:'stair', yangin:'fire_stair', asansor:'elevator'};
    const isCoreType=t=>t==='merdiven'||t==='yangin'||t==='asansor';
    p.regions.forEach(g=>{
      if(!g.cells.length) return;
      const ck=CORE_KIND[g.type]; if(!ck) return;
      // aday kenarlar: bu çekirdeğin, KORİDOR komşusuna değen kenarları (öncelik);
      // koridor yoksa çekirdek-DIŞI herhangi bir iç bölgeye değen kenarlar.
      const corEdges=[], anyEdges=[];
      const pushEdge=(arr,x,y,h)=>arr.push({x,y,h});
      const nbType=v=>(v>=0&&p.regions[v])?p.regions[v].type:null;
      const nbOk=v=>v>=0 && v!==g.id && p.regions[v] && !isCoreType(p.regions[v].type); // çekirdek-dışı iç bölge
      g.cells.forEach(i=>{ const r=(i/p.cols)|0,c=i%p.cols;
        const N=[[id(r-1,c),p.minX+c*M,p.minY+r*M,1],
                 [id(r+1,c),p.minX+c*M,p.minY+(r+1)*M,1],
                 [id(r,c-1),p.minX+c*M,p.minY+r*M,0],
                 [id(r,c+1),p.minX+(c+1)*M,p.minY+r*M,0]];
        N.forEach(([v,x,y,h])=>{ if(nbType(v)==='koridor') pushEdge(corEdges,x,y,h);
                                 else if(nbOk(v)) pushEdge(anyEdges,x,y,h); });
      });
      const edges = corEdges.length? corEdges : anyEdges;
      const key='c'+g.id;
      if(!edges.length){ out.push({key, e:null, edges, kind:ck, reg:g, status:'none'}); return; }
      if(doorHidden[key]){ out.push({key, e:null, edges, kind:ck, reg:g, status:'hidden'}); return; }
      const e=resolve(key, edges);
      if(e) out.push({key, e, edges, kind:ck, reg:g, status:'ok'});
    });
  }
  /* çift tıkla eklenen kapılar — iç kapı: kenar iki farklı iç bölgeyi ayırıyorsa;
     dış giriş (d.ext): kenar bir iç bölge ile dışarıyı (−9) ayırıyorsa (yalnız zemin katta eklenir) */
  extraDoors.forEach((d,i)=>{
    const r=Math.round((d.y-p.minY)/M), c=Math.round((d.x-p.minX)/M);
    const sides=d.h? [id(r-1,c),id(r,c)] : [id(r,c-1),id(r,c)];
    const ok=d.ext ? ((sides[0]>=0)!==(sides[1]>=0) && (sides[0]===-9||sides[1]===-9))  // tam bir taraf iç + öbürü dışarı
                   : (sides[0]>=0&&sides[1]>=0&&sides[0]!==sides[1]);
    out.push({key:'x'+i, e:ok?{h:d.h,x:d.x,y:d.y}:null, edges:[], kind:'extra', ext:!!d.ext, i, status:ok?'ok':'stale'});
  });
  return out;
}
function doorSnapshot(){ return {ov:{...doorOverrides}, extra:extraDoors.map(d=>({...d})), hidden:{...doorHidden}}; }
function doorRestore(s){ doorOverrides={...s.ov}; extraDoors=s.extra.map(d=>({...d})); doorHidden={...s.hidden}; }
/* imlece en yakın iki-bölge iç duvar kenarı (çift tıkla kapı ekleme / ekstra kapı sürükleme) */
function edgeNear(wx,wy){
  const p=plan; if(!p) return null;
  const id=(r,c)=>(r<0||c<0||r>=p.rows||c>=p.cols)?-9:(p.inside[r*p.cols+c]?p.cm[r*p.cols+c]:-9);
  const r0=Math.floor((wy-p.minY)/M), c0=Math.floor((wx-p.minX)/M);
  let best=null, bd=Math.max(0.3, 8/pxPerM);
  for(let r=r0-1;r<=r0+2;r++)for(let c=c0-1;c<=c0+2;c++){
    const x=p.minX+c*M, y=p.minY+r*M;
    if(id(r-1,c)>=0&&id(r,c)>=0&&id(r-1,c)!==id(r,c)){      /* üst kenar */
      const d=distSeg(wx,wy,x,y,x+M,y);
      if(d<bd){ bd=d; best={h:1,x,y}; }
    }
    if(id(r,c-1)>=0&&id(r,c)>=0&&id(r,c-1)!==id(r,c)){      /* sol kenar */
      const d=distSeg(wx,wy,x,y,x,y+M);
      if(d<bd){ bd=d; best={h:0,x,y}; }
    }
  }
  return best;
}
/* imlece en yakın DIŞ duvar kenarı (zemin katta dış/giriş kapısı eklemek için):
   bir tarafı iç bölge (>=0), öbürü dışarı (−9). Dönüş ext:true bayraklı. */
function extEdgeNear(wx,wy){
  const p=plan; if(!p) return null;
  const id=(r,c)=>(r<0||c<0||r>=p.rows||c>=p.cols)?-9:(p.inside[r*p.cols+c]?p.cm[r*p.cols+c]:-9);
  const r0=Math.floor((wy-p.minY)/M), c0=Math.floor((wx-p.minX)/M);
  let best=null, bd=Math.max(0.4, 10/pxPerM);
  for(let r=r0-1;r<=r0+2;r++)for(let c=c0-1;c<=c0+2;c++){
    const x=p.minX+c*M, y=p.minY+r*M, me=id(r,c);
    const up=id(r-1,c);
    if(((up>=0)!==(me>=0))&&(up===-9||me===-9)){          /* üst (yatay) dış kenar */
      const d=distSeg(wx,wy,x,y,x+M,y); if(d<bd){ bd=d; best={h:1,x,y,ext:true}; }
    }
    const lf=id(r,c-1);
    if(((lf>=0)!==(me>=0))&&(lf===-9||me===-9)){          /* sol (dikey) dış kenar */
      const d=distSeg(wx,wy,x,y,x,y+M); if(d<bd){ bd=d; best={h:0,x,y,ext:true}; }
    }
  }
  return best;
}
function doorMid(e){ return e.h? {x:W2Sx(e.x+0.45), y:W2Sy(e.y)} : {x:W2Sx(e.x), y:W2Sy(e.y+0.45)}; }
function hitDoor(sx,sy){
  if(!plan) return null;
  let best=null, bd=170*HITSC*HITSC; // ~13 px yarıçap (dokunmatikte ~23 px)
  computeDoors().forEach(d=>{
    if(d.status!=='ok') return;
    const m=doorMid(d.e), dd=(m.x-sx)**2+(m.y-sy)**2;
    if(dd<bd){ bd=dd; best=d; }
  });
  return best;
}
