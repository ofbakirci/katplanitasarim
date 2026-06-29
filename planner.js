'use strict';
/* ================= plan üretimi ================= */
document.getElementById('genBtn').addEventListener('click',()=>{ resetCuts(); generate(); fitView(); });
document.getElementById('structReset').addEventListener('click',()=>{ resetLockedCore(); });

/* ================= otopark yerleşimi (gerçek park yerleri + sürüş yolları) =================
   Verilen otopark hücreleri (avail) modüllere bölünür: 5 m derin park sırası — 5 m manevra
   yolu — 5 m park sırası … (çift yüklü). Park yeri 2,5×5 m. Uzun kenar yön belirler.
   Dönüş: {bays:[{r0,c0,h,w}], aisles:[{r0,c0,h,w}], vertical} — hücre ızgarasında. */
function computeParkingLayout(avail, rows, cols, forceVertical){
  const empty={bays:[], aisles:[], vertical:false};
  if(!avail||!avail.size) return empty;
  const BAY=Math.round(REG.parkBayLen/M), WIDE=Math.round(REG.parkBayWid/M), AISLE=Math.round(REG.parkAisle/M);
  let r0=1e9,r1=-1e9,c0=1e9,c1=-1e9;
  avail.forEach(i=>{ const r=(i/cols)|0,c=i%cols; if(r<r0)r0=r;if(r>r1)r1=r;if(c<c0)c0=c;if(c>c1)c1=c; });
  const H=r1-r0+1, W=c1-c0+1;
  const fits=(rr,cc,h,w)=>{ for(let r=rr;r<rr+h;r++)for(let c=cc;c<cc+w;c++){
    if(r<0||c<0||r>=rows||c>=cols||!avail.has(r*cols+c)) return false; } return true; };
  /* tek bir bant dizilimi kur: yön (vertical), başlangıç kayması (start) ve ilk bandın
     yol-mu-park-mı (firstAisle) parametreleriyle. Bant deseni park–yol–park–yol… */
  const build=(vertical, start, firstAisle)=>{
    const bays=[], aisles=[];
    if(!vertical){
      let r=r0+start, band=firstAisle?1:0;
      while(r<=r1){ const isA=band%2===1, chunk=isA?AISLE:BAY;
        if(r+chunk-1>r1) break;
        if(isA) aisles.push({r0:r,c0,h:AISLE,w:W});
        else for(let c=c0;c+WIDE-1<=c1;c+=WIDE) if(fits(r,c,BAY,WIDE)) bays.push({r0:r,c0:c,h:BAY,w:WIDE});
        r+=chunk; band++; }
    } else {
      let c=c0+start, band=firstAisle?1:0;
      while(c<=c1){ const isA=band%2===1, chunk=isA?AISLE:BAY;
        if(c+chunk-1>c1) break;
        if(isA) aisles.push({r0,c0:c,h:H,w:AISLE});
        else for(let r=r0;r+WIDE-1<=r1;r+=WIDE) if(fits(r,c,WIDE,BAY)) bays.push({r0:r,c0:c,h:WIDE,w:BAY});
        c+=chunk; band++; }
    }
    /* gereksiz yolları buda: hiçbir park sırasına komşu olmayan manevra bandı çizilmesin */
    const near=(a)=>bays.some(b=> vertical
      ? (b.r0<a.r0+a.h && b.r0+b.h>a.r0) && (b.c0+b.w===a.c0 || a.c0+a.w===b.c0)
      : (b.c0<a.c0+a.w && b.c0+b.w>a.c0) && (b.r0+b.h===a.r0 || a.r0+a.h===b.r0));
    return {bays, aisles:aisles.filter(near), vertical};
  };
  /* iki yönelim × başlangıç kayması × ilk-bant tipi taranır → en çok park yeri çıkan seçilir
     (çekirdek tabanı ortadan kestiğinde faz kaydırma boşlukları daha iyi değerlendirir) */
  let best={bays:[], aisles:[], vertical:false};
  const orients = forceVertical===undefined ? [false,true] : [!!forceVertical];
  for(const v of orients)
    for(let s=0;s<=AISLE;s++)
      for(const fa of [false,true]){
        const L=build(v,s,fa);
        if(L.bays.length>best.bays.length) best=L;
      }
  return best;
}
/* bir plan nesnesindeki OTOPARK bölge(ler)inden park yerleşimi → DÜNYA koordinatlı,
   düzenlenebilir biçim: bays/aisles = {x,y,w,h,ang} (metre, ang derece). manual=false
   (otomatik). Elle düzenlenince manual=true olur ve otomatik yeniden hesap bunu ezmez. */
function parkingForPlan(pl, vertical){
  if(!pl||!pl.regions) return {bays:[], aisles:[], vertical:false, manual:false};
  const avail=new Set();
  pl.regions.forEach(g=>{ if(g.type==='otopark') (g.cells||[]).forEach(i=>avail.add(i)); });
  const L = computeParkingLayout(avail, pl.rows, pl.cols, vertical);
  const toW = b => ({x:pl.minX+b.c0*M, y:pl.minY+b.r0*M, w:b.w*M, h:b.h*M, ang:0});
  return {bays:L.bays.map(toW), aisles:L.aisles.map(toW), vertical:L.vertical, manual:false};
}
function generate(keepCuts){
  if(!closed) return;
  planAutoRepaired=false;   // kullanıcı üretimi/temiz üretim "otomatik onarıldı" değildir (repairImportedPlan sonradan işaretler)
  const villa = document.getElementById('binaTipi').value==='villa';
  const kat = Math.max(1,+document.getElementById('katSayisi').value||1);
  const katYuk = +document.getElementById('katYuk').value||2.9;
  const binaYuk = kat*katYuk;

  /* --- hücre ızgarası --- */
  const bb=bboxOf(pts);
  const minX=Math.floor(bb.minX/M)*M, minY=Math.floor(bb.minY/M)*M;
  const cols=Math.max(1,Math.round((Math.ceil(bb.maxX/M)*M-minX)/M));
  const rows=Math.max(1,Math.round((Math.ceil(bb.maxY/M)*M-minY)/M));
  const inside=new Uint8Array(rows*cols);
  /* iç avlular footprint'ten oyulur: merkezi avluda kalan hücre dışarı sayılır →
     motor avlunun etrafına sarar, avluya bakan oda kenarları cephe (komşu !inside) olur */
  const avlus=(typeof courtyards!=='undefined' && courtyards)? courtyards.filter(av=>av&&av.poly&&av.poly.length>=3) : [];
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const cx=minX+(c+.5)*M, cy=minY+(r+.5)*M;
    if(pip(cx,cy,pts) && !avlus.some(av=>pip(cx,cy,av.poly))) inside[r*cols+c]=1;
  }
  const cm=new Int16Array(rows*cols).fill(-1);
  const regions=[];
  const newReg=(name,type,unit)=>{const g={id:regions.length,name,type,unit:unit==null?-1:unit,cells:[]};regions.push(g);return g;};
  const claim=(g,r,c)=>{ if(r<0||c<0||r>=rows||c>=cols)return false; const i=r*cols+c;
    if(!inside[i]||cm[i]!==-1)return false; cm[i]=g.id; g.cells.push(i); return true; };
  const rectFree=(r0,c0,h,w)=>{ for(let r=r0;r<r0+h;r++)for(let c=c0;c<c0+w;c++){
    if(r<0||c<0||r>=rows||c>=cols) return false; const i=r*cols+c; if(!inside[i]||cm[i]!==-1) return false;} return true; };
  const claimRect=(g,r0,c0,h,w)=>{ for(let r=r0;r<r0+h;r++)for(let c=c0;c<c0+w;c++) claim(g,r,c); };

  const expanded=[]; unitSpecs.forEach(u=>{ for(let i=0;i<(villa?1:u.adet);i++) expanded.push(u); });
  const perFloor = expanded.length;

  /* --- asansör / yangın kuralları --- */
  let nAsansor=0, asansorYeri=false, fireStairNeeded=false, teknikNeeded=false;
  if(!villa){ // tek bağımsız bölümlü konut muaf
    if(kat>=REG.ikiAsansorKat) nAsansor=2;
    else if(kat>=REG.asansorKat) nAsansor=1;
    else if(kat===REG.asansorYeriKat){ nAsansor=1; asansorYeri=true; }
    /* 2. kaçış (yangın) merdiveni YALNIZ yapı > 21,5 m konutta zorunlu (BYKHY M.48(5b)).
       ≤21,5 m'de (≈7 kata kadar) tek korunumlu merdiven yeterli (M.48(5a)) → çekirdek küçük,
       azami oturum alanı. (kat≥4 → asansör; yukarıda AYRI kural — eskiden buraya da bağlıydı,
       gereksiz 2. merdiven üretiyordu.) Kullanıcı isterse Yapı katmanından 2. merdiveni ekler. */
    fireStairNeeded = binaYuk>REG.yanginYukseklik;
    teknikNeeded = perFloor>=REG.teknikOdaDaire;
  }

  let corridorR0=-1, corridorR1=-1, stairs=[], unitObjs=[];
  const zoneUI=[];
  if(!keepCuts){ customCutsZ=null; unitLayout={}; }

  /* --- yapı iskeleti: kata-ayrı apartmanda iskelet yoksa zemin kattan türet
         (tüm çekirdek düşeyde sürekli olsun); sonra kilitli çekirdeği ÖNCE sahiplen --- */
  if(!villa && floorsOn() && activeFloor!==zeminIdx() && !lockedCore){
    const f0=floorState(zeminIdx()); if(f0&&f0.plan) lockedCore=captureCoreFrom(f0.plan); // bodrum dahil her kat çekirdeği zeminden alır
  }
  /* --- otomatik kulak (çıkıntı) çekirdeği: footprint gövdesinden taşan dar çıkıntılar
         merdiven/asansör/yangın için idealdir. Saf detektör — inside maskesini okur,
         cm'yi DEĞİŞTİRMEZ; dünya-koordinatlı çekirdek dikdörtgenleri döndürür ve
         coreLockForGrid ile mevcut pre-claim yoluna beslenir. Elle iskelet (lockedCore)
         varken, villa/kata-ayrı/tek-dairede DEVRE DIŞI. --- */
  function detectEarCore(){
    /* 1) gövde = footprint'e tam sığan EN BÜYÜK dikdörtgen. (Kulaklar dik profili
          şişirdiği için doluluk-eşiği yöntemi gövdeyi yanlış bulur; maksimal-dikdörtgen
          — histogramda en büyük alan — sağlamdır: kulaklar dar appendaj olduğundan
          gövdeden büyük dikdörtgen oluşturamaz.) */
    let totalIn=0; for(let i=0;i<rows*cols;i++) if(inside[i]) totalIn++;
    if(totalIn<40) return null;
    const heights=new Array(cols).fill(0);
    let bA=0,bR0=-1,bR1=-1,bC0=-1,bC1=-1;
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++) heights[c]= inside[r*cols+c]? heights[c]+1 : 0;
      const stk=[];
      for(let c=0;c<=cols;c++){
        const h=c<cols?heights[c]:0; let start=c;
        while(stk.length && stk[stk.length-1].h>=h){
          const t=stk.pop(), area=t.h*(c-t.c);
          if(area>bA){ bA=area; bR0=r-t.h+1; bR1=r; bC0=t.c; bC1=c-1; }
          start=t.c;
        }
        stk.push({h,c:start});
      }
    }
    if(bR1<bR0||bC1<bC0) return null;
    if(bA < 0.45*totalIn) return null;        // belirgin gövde yok (L/U/egzotik) → band düzeni
    const inBody=(r,c)=>r>=bR0&&r<=bR1&&c>=bC0&&c<=bC1;
    /* 2) gövde dikdörtgeni dışındaki bağlı bileşenler = kulak adayları */
    const seen=new Uint8Array(rows*cols), ears=[];
    for(let i=0;i<rows*cols;i++){
      if(seen[i]) continue; seen[i]=1;
      const sr=(i/cols)|0,sc=i%cols; if(!inside[i]||inBody(sr,sc)) continue;
      const comp=[i], st=[i];
      while(st.length){ const j=st.pop(); const r=(j/cols)|0,c=j%cols;
        [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc])=>{ if(rr<0||cc<0||rr>=rows||cc>=cols)return;
          const k=rr*cols+cc; if(seen[k]||!inside[k]||inBody(rr,cc))return; seen[k]=1; comp.push(k); st.push(k); }); }
      let r0=1e9,r1=-1e9,c0=1e9,c1=-1e9;
      comp.forEach(j=>{const r=(j/cols)|0,c=j%cols; if(r<r0)r0=r;if(r>r1)r1=r;if(c<c0)c0=c;if(c>c1)c1=c;});
      const w=c1-c0+1,h=r1-r0+1;
      if(Math.min(w,h)>6 || comp.length<24) continue;        // dar (≤3 m) VE yeterli alan (≥6 m²)
      const dir = c1<bC0?'W' : c0>bC1?'E' : r1<bR0?'N' : r0>bR1?'S' : null; if(!dir) continue;
      ears.push({r0,r1,c0,c1,w,h,dir});
    }
    if(!ears.length) return null;
    /* 3) çekirdek elemanları (öncelik) — min ızgara boyutları (h×w hücre) */
    const want=[{type:'merdiven',name:'MERDİVEN',h:5,w:5}];          // 2,5×2,5 (kabul); kulakta büyür
    if(fireStairNeeded) want.push({type:'yangin',name:'YANGIN MERD.',h:5,w:5});
    for(let a=0;a<nAsansor;a++) want.push({type:'asansor',name:asansorYeri?'ASANSÖR YERİ':'ASANSÖR',h:6,w:4});
    if(teknikNeeded) want.push({type:'teknik',name:'TEKNİK / ŞAFT',h:5,w:3});
    const taken=new Uint8Array(rows*cols);
    const okRect=(r0,c0,h,w)=>{ if(r0<0||c0<0||r0+h>rows||c0+w>cols)return false;
      for(let r=r0;r<r0+h;r++)for(let c=c0;c<c0+w;c++){const k=r*cols+c; if(!inside[k]||cm[k]!==-1||taken[k])return false;} return true; };
    const take=(r0,c0,h,w)=>{ for(let r=r0;r<r0+h;r++)for(let c=c0;c<c0+w;c++) taken[r*cols+c]=1; };
    const placed=[]; let inEarCount=0;
    want.forEach(el=>{
      const dims=[{h:el.h,w:el.w},{h:el.w,w:el.h}];
      let best=null;
      /* ASANSÖR + TEK KULAK: merdiven/yangın kulakta kümelendi → asansör gövdenin KARŞI
         ucuna (iki daireye de adil erişim; A/D-doğru deseni). 2+ kulakta normal yol (E). */
      if(el.type==='asansor' && ears.length===1){
        const ed=ears[0].dir;
        dims.forEach(d=>{
          if(ed==='W'||ed==='E'){ const c0=ed==='W'?bC1-d.w+1:bC0;
            for(let r=bR0;r+d.h-1<=bR1;r++) if(okRect(r,c0,d.h,d.w)){ const cost=Math.abs(r-(bR0+bR1)/2); if(!best||cost<best.cost) best={r0:r,c0,h:d.h,w:d.w,cost,inEar:false}; } }
          else { const r0=ed==='N'?bR1-d.h+1:bR0;
            for(let c=bC0;c+d.w-1<=bC1;c++) if(okRect(r0,c,d.h,d.w)){ const cost=Math.abs(c-(bC0+bC1)/2); if(!best||cost<best.cost) best={r0,c0:c,h:d.h,w:d.w,cost,inEar:false}; } }
        });
      }
      if(!best) ears.forEach(ear=>dims.forEach(d=>{                  // önce kulak-İÇİ (en düşük cost)
        for(let r=ear.r0;r+d.h-1<=ear.r1;r++)for(let c=ear.c0;c+d.w-1<=ear.c1;c++)
          if(okRect(r,c,d.h,d.w)){ const cost=-(d.h*d.w); if(!best||cost<best.cost) best={r0:r,c0:c,h:d.h,w:d.w,cost,inEar:true}; }
      }));
      if(!best){                                                     // kulağa sığmaz → gövde-ağzı (case27)
        ears.forEach(ear=>dims.forEach(d=>{
          const scan=(r0,c0)=>{ if(okRect(r0,c0,d.h,d.w)){ const cost=1000+d.h*d.w; if(!best||cost<best.cost) best={r0,c0,h:d.h,w:d.w,cost,inEar:false}; } };
          if(ear.dir==='W'||ear.dir==='E'){ const c0=ear.dir==='W'?bC0:bC1-d.w+1;
            for(let r=Math.max(0,ear.r0-2);r+d.h-1<=Math.min(rows-1,ear.r1+2);r++) scan(r,c0); }
          else { const r0=ear.dir==='N'?bR0:bR1-d.h+1;
            for(let c=Math.max(0,ear.c0-2);c+d.w-1<=Math.min(cols-1,ear.c1+2);c++) scan(r0,c); }
        }));
      }
      if(best){ take(best.r0,best.c0,best.h,best.w); if(best.inEar) inEarCount++;
        placed.push({type:el.type,name:el.name,r0:best.r0,c0:best.c0,h:best.h,w:best.w}); }
      else placed.push(null);
    });
    if(placed.some(p=>!p)) return null;     // zorunlu eleman yerleşemedi → band düzenine düş
    if(inEarCount<1) return null;           // hiçbir öğe kulağa girmedi → band daha iyi
    /* 4) yalnız başına kulakta olan merdiven/yangını kulak boyunca büyüt (2,5×2,5 → 2,5×5) */
    const stripFree=cells=>cells.every(k=> inside[k]&&cm[k]===-1&&!taken[k]);
    placed.forEach(p=>{
      if(p.type!=='merdiven'&&p.type!=='yangin') return;
      const ear=ears.find(e=>p.r0>=e.r0&&p.c0>=e.c0&&(p.r0+p.h-1)<=e.r1&&(p.c0+p.w-1)<=e.c1);
      if(!ear) return;
      let changed=true,guard=0;
      while(changed&&guard++<60){ changed=false;
        if(p.r0+p.h-1<ear.r1){ const cells=[]; for(let c=p.c0;c<p.c0+p.w;c++) cells.push((p.r0+p.h)*cols+c);
          if(stripFree(cells)){ cells.forEach(k=>taken[k]=1); p.h++; changed=true; } }
        if(p.r0>ear.r0){ const cells=[]; for(let c=p.c0;c<p.c0+p.w;c++) cells.push((p.r0-1)*cols+c);
          if(stripFree(cells)){ cells.forEach(k=>taken[k]=1); p.r0--; p.h++; changed=true; } }
        if(p.c0+p.w-1<ear.c1){ const cells=[]; for(let r=p.r0;r<p.r0+p.h;r++) cells.push(r*cols+(p.c0+p.w));
          if(stripFree(cells)){ cells.forEach(k=>taken[k]=1); p.w++; changed=true; } }
        if(p.c0>ear.c0){ const cells=[]; for(let r=p.r0;r<p.r0+p.h;r++) cells.push(r*cols+(p.c0-1));
          if(stripFree(cells)){ cells.forEach(k=>taken[k]=1); p.c0--; p.w++; changed=true; } }
      }
    });
    /* 5) kaçış mesafesi: kulak-çekirdek BYKHY 30 m'yi aşsa BİLE tercih edilir (kullanıcı
          kararı: ear-core her zaman band'ın çirkin "dev depo + geniş hol" düzenine yeğdir).
          İhlal varsa runChecks (~2542) kırmızı uyarı yazar — kullanıcı görür, gerekirse
          Yapı katmanından 2. merdiven ekler. (Eski sert bail kaldırıldı.) */
    /* koridor ekseni: merdivenin oturduğu kulak ÜST/ALT (N/S) ise koridor DİKEY olmalı
       (daireler sol/sağ, B-doğru); YAN kulakta (W/E) yatay. */
    let coreAxis='H';
    { const mp=placed.find(p=>p.type==='merdiven');
      if(mp){ const e=ears.find(ea=>mp.r0>=ea.r0-1&&mp.r0<=ea.r1+1&&mp.c0>=ea.c0-1&&mp.c0<=ea.c1+1)||ears[0];
        if(e&&(e.dir==='N'||e.dir==='S')) coreAxis='V'; } }
    /* ızgara → dünya koordinatı (lockedCore/captureCoreFrom ile aynı biçim) */
    const out=placed.map(p=>({type:p.type,name:p.name,
      x0:minX+p.c0*M, y0:minY+p.r0*M, x1:minX+(p.c0+p.w)*M, y1:minY+(p.r0+p.h)*M}));
    out.coreAxis=coreAxis;
    return out;
  }
  let autoCore=null;
  if(!villa && !lockedCore && !floorsOn() && perFloor>=2){
    try{ autoCore=detectEarCore(); }catch(e){ console.error('kulak algılama:',e); autoCore=null; }
  }
  const coreLock = (!villa) ? coreLockForGrid(minX,minY,rows,cols,autoCore) : null;
  const coreLocked = !!(coreLock && coreLock.length);
  const earCoreLocked = coreLocked && !!(autoCore && autoCore.length);
  /* DİKEY koridor: üst/alt kulak çekirdeğinde (B-doğru) koridor dikey, daireler sol/sağ.
     Yatay band yoluna DOKUNMADAN ayrı dikey dal kullanılır (wantV kapısı).
     Manuel anahtar (koridorYon): 'oto'=mevcut otomatik (byte-aynı), 'yatay'=zorla yatay,
     'dikey'=çekirdek üst/alttaysa (auto VEYA elle iskelet) zorla dikey. */
  let coreAxis = (autoCore && autoCore.coreAxis) || null;
  if(!coreAxis && coreLock && coreLock.length){           // elle iskelet: çekirdek kutusundan eksen türet
    const merd = coreLock.find(e=>e.type==='merdiven') || coreLock[0];
    const dTB = Math.min(merd.r0, rows-1-(merd.r0+merd.h-1));
    const dLR = Math.min(merd.c0, cols-1-(merd.c0+merd.w-1));
    coreAxis = dTB <= dLR ? 'V' : 'H';
  }
  const wantV = (!villa && coreLocked) && (
    koridorYon==='yatay' ? false :
    koridorYon==='dikey' ? (coreAxis==='V') :
    (earCoreLocked && autoCore.coreAxis==='V'));
  if(coreLocked){
    coreLock.forEach(e=>{ const g=newReg(e.name,e.type); claimRect(g,e.r0,e.c0,e.h,e.w);
      if((e.type==='merdiven'||e.type==='yangin')&&g.cells.length) stairs.push({r0:e.r0,c0:e.c0,h:e.h,w:e.w}); });
  }

  /* ================= KAT KULLANIM TİPİ (konut dışı) =================
     Apartman + katları ayrı planlanırken bu kat ticari/otopark/sığınak olabilir.
     Çekirdek (merdiven/asansör/yangın/teknik) yukarıda zaten sahiplenildi (lockedCore var
     ya da zemin kattan türetildi); yoksa placeUsageCore çekirdeği KONUT katıyla aynı düzende
     (koridor bandı + banda komşu çekirdek + uca yangın) yerleştirir → katlar arası hol/çekirdek
     erişimi süreklidir. Kalan taban kullanıma göre doldurulur. KONUT yoluna HİÇ girilmez — kendi planını kurup
     erken döner; bu yüzden fixOrphans/repairUnits/purgeSlivers gibi konut sonrası-işlemleri
     usage katına dokunamaz. */
  if(!villa && floorsOn() && katKullanim!=='konut'){
    const freeCells=()=>{ const a=[]; for(let i=0;i<rows*cols;i++) if(inside[i]&&cm[i]===-1) a.push(i); return a; };
    /* lockedCore yoksa (ör. zemin katı doğrudan ticari) çekirdeği KONUT katıyla AYNI
       düzende koy: koridor bandı maliyetle seçilir, çekirdek (merdiven/asansör/teknik)
       banda komşu, yangın merdiveni bandın UCUNA konur. Bu kattan miras alınan çekirdek
       böylece üst konut katlarının koridor bandıyla AYNI dünya konumuna düşer → her katta
       APARTMAN HOLÜ ↔ merdiven/asansör/yangın erişimi korunur. (Eski kenar-yapışık kompakt
       çekirdek bandın dışında kalıp hol erişimini kesiyordu — "yapı elemanları yukarı attı".) */
    const corW=3;                                    // 1,5 m koridor bandı (konutla aynı)
    const placeUsageCore=()=>{
      /* 1) koridor bandı satırını seç — konut yatay-koridor maliyet fonksiyonuyla birebir */
      const colMin=new Array(cols).fill(1e9), colMax=new Array(cols).fill(-1e9);
      let sumR=0,n=0;
      for(let r=0;r<rows;r++)for(let c=0;c<cols;c++) if(inside[r*cols+c]){ sumR+=r;n++;
        if(r<colMin[c])colMin[c]=r; if(r>colMax[c])colMax[c]=r; }
      const nValidCols=colMin.filter(v=>v<1e8).length||1;
      let bestR=-1,bestCost=1e18;
      for(let r0=1;r0<=rows-corW-1;r0++){
        let cover=0,cost=0;
        for(let c=0;c<cols;c++){
          if(colMin[c]>1e8) continue;
          if(inside[r0*cols+c]&&inside[(r0+corW-1)*cols+c]) cover++;
          const dN=r0-colMin[c], dS=colMax[c]-(r0+corW-1);
          if(dN<0||dS<0){ cost+=40; continue; }
          const pen=d=>(d>0&&d<7)?(60+(7-d)*8):0;
          cost+=pen(dN)+pen(dS)+Math.abs(dN-dS)*0.4;
        }
        if(cover<nValidCols*0.35) continue;
        if(cost<bestCost){ bestCost=cost; bestR=r0; }
      }
      corridorR0 = bestR>=0? bestR : Math.max(1, Math.round(sumR/Math.max(1,n))-1);
      corridorR1 = corridorR0+corW-1;
      /* 2) bandı APARTMAN HOLÜ (koridor) yap — bina genişliği boyunca, boş+iç hücreler */
      const hol=newReg('APARTMAN HOLÜ','koridor');
      for(let r=corridorR0;r<=corridorR1;r++)for(let c=0;c<cols;c++) claim(hol,r,c);
      /* çekirdek zaten varsa (üst kattan/lockedCore miras) yalnız bandı kurduk → çık */
      if(regions.some(g=>g.type==='merdiven'&&g.cells.length)) return hol;
      /* 3) çekirdeği banda komşu yerleştir (konut place() deseni: önce K, sonra G) */
      let sumC=0,m2=0; hol.cells.forEach(i=>{sumC+=i%cols;m2++;});
      const cc=Math.round(sumC/Math.max(1,m2));
      const stH=6, stW=10;                           // merdiven 3,0 × 5,0 m
      const place=(g,h,w,prefC)=>{
        for(const r0 of [corridorR0-h, corridorR1+1]){
          for(let off=0;off<cols;off++){ for(const s of [1,-1]){
            const c0=prefC+s*off; if(rectFree(r0,c0,h,w)){ claimRect(g,r0,c0,h,w); return {r0,c0,h,w}; } } } }
        return null; };
      const merd=newReg('MERDİVEN','merdiven');
      const mPos=place(merd,stH,stW,cc-Math.floor(stW/2));
      if(mPos) stairs.push(mPos);
      let nextC = mPos? mPos.c0+stW : cc;
      for(let a=0;a<nAsansor;a++){
        const as=newReg(asansorYeri?'ASANSÖR YERİ':'ASANSÖR','asansor');
        const p=place(as,stH,4,nextC); if(p) nextC=p.c0+4;
      }
      if(teknikNeeded){ const tk=newReg('TEKNİK / ŞAFT','teknik'); place(tk,stH,3,nextC); }
      if(fireStairNeeded){                           // yangın merdiveni KORİDORUN UCUNA
        const yg=newReg('YANGIN MERD.','yangin');
        let west=cols, east=-1;
        for(let c=0;c<cols;c++){ for(let r=corridorR0;r<=corridorR1;r++) if(cm[r*cols+c]>=0){ west=Math.min(west,c); east=Math.max(east,c); break; } }
        const fH=7,fW=5; let p=null;
        const target=(cc-west>east-cc)?west:east-fW+1;
        for(let off=0;off<cols&&!p;off++){ for(const r0 of [corridorR0-fH, corridorR1+1]){
          for(const s of [1,-1]){ const c0=target+s*off;
            if(rectFree(r0,c0,fH,fW)){ claimRect(yg,r0,c0,fH,fW); p={r0,c0,h:fH,w:fW}; break; } } if(p)break; } }
        if(p) stairs.push(p);
      }
      /* kaçış mesafesi (BYKHY): holün her noktasına bir merdiven ≤ 30 m kalana dek
         uca ek yangın merdiveni — konut yoluyla birebir */
      if(kat>=2){
        const stD=(r,c)=>{ let best=1e9; stairs.forEach(s=>{
          best=Math.min(best,(Math.abs(s.c0+s.w/2-(c+0.5))+Math.abs(s.r0+s.h/2-(r+0.5)))*M); }); return best; };
        const fH=7,fW=5;
        for(let extra=0; extra<4; extra++){
          let worst=0,wr=-1,wc2=-1;
          hol.cells.forEach(i=>{ const r=(i/cols)|0,c=i%cols; const d=stD(r,c); if(d>worst){worst=d;wr=r;wc2=c;} });
          if(worst<=REG.kacisMesafe-3) break;
          let best=null,bd=1e9;
          for(let r0=0;r0<=rows-fH;r0++)for(let c0=0;c0<=cols-fW;c0++){
            if(!rectFree(r0,c0,fH,fW)) continue;
            let touch=false;
            for(let c=c0;c<c0+fW&&!touch;c++) touch=(r0>0&&cm[(r0-1)*cols+c]===hol.id)||(r0+fH<rows&&cm[(r0+fH)*cols+c]===hol.id);
            for(let r=r0;r<r0+fH&&!touch;r++) touch=(c0>0&&cm[r*cols+c0-1]===hol.id)||(c0+fW<cols&&cm[r*cols+c0+fW]===hol.id);
            if(!touch) continue;
            const d=Math.abs(r0+fH/2-wr)+Math.abs(c0+fW/2-wc2);
            if(d<bd){bd=d;best={r0,c0};}
          }
          if(!best) break;
          const yg=newReg('YANGIN MERD.','yangin'); claimRect(yg,best.r0,best.c0,fH,fW);
          stairs.push({r0:best.r0,c0:best.c0,h:fH,w:fW});
        }
      }
      return hol;
    };
    /* serbest hücreleri BAĞLI bileşenlere ayır; her bileşeni ~5 m'lik dükkânlara böl
       (çekirdek/lobi araya girdiğinde kopuk dükkân doğmasın). Küçük erişimsiz cepler
       (< ~9 m²) komşu apartman holüne ya da dükkâna katılır — sliver dükkân doğmaz. */
    const adjReg=(comp,type)=>{ const nb=new Map();
      comp.forEach(i=>{ const r=(i/cols)|0,c=i%cols;
        [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc])=>{ if(rr<0||cc<0||rr>=rows||cc>=cols) return;
          const id2=cm[rr*cols+cc]; if(id2>=0&&(!type||regions[id2].type===type)) nb.set(id2,(nb.get(id2)||0)+1); }); });
      let best=-1,bc=-1; nb.forEach((cnt,id2)=>{ if(cnt>bc){ bc=cnt; best=id2; } }); return best; };
    const fillShops=()=>{
      const fc=freeCells(); if(!fc.length) return;
      const fset=new Set(fc), seen=new Set(); let no=0;
      /* serbest hücreleri BAĞLI bileşenlere (dükkân kuşağı) ayır — index sırası kararlı */
      const comps=[];
      fc.forEach(start=>{ if(seen.has(start)) return;
        const comp=[], stk=[start]; seen.add(start);
        while(stk.length){ const i=stk.pop(); comp.push(i); const r=(i/cols)|0,c=i%cols;
          [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc])=>{ if(rr<0||cc<0||rr>=rows||cc>=cols) return;
            const j=rr*cols+cc; if(fset.has(j)&&!seen.has(j)){ seen.add(j); stk.push(j); } }); }
        comps.push(comp);
      });
      /* her kuşağı sütun ekseninde ~5 m vitrinlere böl; sınırlar splitZone + customCutsZ
         ile KONUT ayırıcıları gibi SÜRÜKLENEBİLİR (zoneUI tutamaçları). Küçük erişimsiz
         cepler (< ~9 m²) komşu hol/dükkâna katılır — sliver dükkân doğmaz. */
      if(!customCutsZ || customCutsZ.length!==comps.length) customCutsZ=comps.map(()=>null);
      comps.forEach((comp,zi)=>{
        if(comp.length*M*M < 9){               // küçük cep: lobiye, yoksa komşu dükkâna kat
          let t=adjReg(comp,'koridor'); if(t<0) t=adjReg(comp,'dukkan');
          if(t>=0){ const g=regions[t]; comp.forEach(i=>{ cm[i]=g.id; g.cells.push(i); }); }
          customCutsZ[zi]=[]; return;
        }
        let cMin=1e9,cMax=-1e9,rMin=1e9,rMax=-1e9;
        comp.forEach(i=>{ const r=(i/cols)|0,c=i%cols; if(c<cMin)cMin=c; if(c>cMax)cMax=c; if(r<rMin)rMin=r; if(r>rMax)rMax=r; });
        const span=cMax-cMin+1, N=Math.max(1,Math.min(6,Math.round(span*M/5)));  // ~5 m vitrin
        const sp=splitZone(comp, new Array(N).fill(1), customCutsZ[zi], i=>i%cols, minX, 3); // min 3 m vitrin
        customCutsZ[zi]=sp.cuts;
        const dk=[]; for(let k2=0;k2<N;k2++) dk.push(newReg('DÜKKAN '+(++no),'dukkan'));
        sp.parts.forEach((cells,k2)=>{ cells.forEach(i=>claim(dk[k2],(i/cols)|0,i%cols)); });
        /* ayırıcı tutamaçları (dikey çizgi; kuşağın düşey ortasında çizilir) */
        zoneUI.push({zi, horiz:true, perp:minY+((rMin+rMax)/2)*M, min:minX+(cMin+2)*M, max:minX+(cMax-1)*M});
      });
    };
    /* serbest hücrelerde hedefe yakın ~kare bir dikdörtgen bul → bölge yap */
    const placeBestRect=(name,type,target)=>{
      let best=null, maxH=Math.min(rows, Math.ceil(Math.sqrt(target))+8);
      for(let h=3;h<=maxH;h++){ const w=Math.max(3,Math.round(target/h));
        for(let r0=0;r0<=rows-h;r0++) for(let c0=0;c0<=cols-w;c0++)
          if(rectFree(r0,c0,h,w)){ const sc=Math.abs(h-w); if(!best||sc<best.sc) best={r0,c0,h,w,sc}; }
      }
      if(!best) return null;
      const g=newReg(name,type); claimRect(g,best.r0,best.c0,best.h,best.w); return g;
    };
    placeUsageCore();       // koridor bandı (APARTMAN HOLÜ) + banda komşu çekirdek + uca yangın
    if(katKullanim==='otopark'){
      const g=newReg('OTOPARK','otopark'); freeCells().forEach(i=>claim(g,(i/cols)|0,i%cols));
    } else if(katKullanim==='ticari'){
      fillShops();          // kalan taban: bağlı, ~5 m vitrinli dükkânlar (sürüklenebilir sınır)
    } else if(katKullanim==='siginak'){
      const fc=freeCells();
      if(fc.length){
        const target=Math.max(Math.round(REG.siginakMinM2/(M*M)), Math.round(fc.length*0.30));
        placeBestRect('SIĞINAK','siginak',target);
        const g=newReg('OTOPARK','otopark'); freeCells().forEach(i=>claim(g,(i/cols)|0,i%cols)); // kalan = bodrum otopark
      }
    }
    /* --- sonlandır: konut sonrası-işleme (fixOrphans/repair/purge...) ATLANIR --- */
    regions.forEach(g=>calcRegionMetrics(g, cols, minX, minY));
    plan={regions, cm, inside, rows, cols, minX, minY, corridorR0, corridorR1,
          stairs, unitObjs:[], villa:false, kat, binaYuk, perFloor, nAsansor, asansorYeri,
          fireStairNeeded, teknikNeeded, zoneUI, katKullanim};
    plan.parking=parkingForPlan(plan); // gerçek park yerleri + sürüş yolları (çizim + sayım)
    hoverWall=null; hoverRoomId=null; hoverDoor=null;
    doorOverrides={}; extraDoors=[]; doorHidden={};
    editHistory=editHistory.filter(e=>e.type==='cut'||e.type==='ulayout'||e.type==='corelock'||e.type==='bound'||e.type==='__snap');
    plan.wallRuns=computeWallRuns();
    runChecks(); buildUnitTable(); renderFloorTabs(); updateStructResetBtn();
    document.getElementById('svgBtn').disabled=false;
    document.getElementById('pngBtn').disabled=false;
    document.getElementById('aiOutputBtn').disabled=false;
    render();
    return;
  }

  /* --- tek daire/kat (apartman): bant koridor İSRAF olur (karşı kanat sahipsiz kalıp
         ORTAK DEPO'ya düşer). Bunun yerine kompakt çekirdek (merdiven+asansör+teknik
         +yangın tek sırada) cepheye yaslanır, önüne 1,5 m lobi konur; dairenin
         kalan TÜM taban alanı tek daireye verilir. Köşe bulunamazsa eski bant
         düzenine geri düşülür (egzotik tabanlarda sağlamlık). --- */
  const trySingleUnit=()=>{
    const elems=[{nm:'MERDİVEN',tp:'merdiven',w:10,stair:true}];      // 5,0 × 3,0 m
    for(let a=0;a<nAsansor;a++) elems.push({nm:asansorYeri?'ASANSÖR YERİ':'ASANSÖR',tp:'asansor',w:4});
    if(teknikNeeded) elems.push({nm:'TEKNİK / ŞAFT',tp:'teknik',w:3});
    if(fireStairNeeded) elems.push({nm:'YANGIN MERD.',tp:'yangin',w:5,stair:true});
    const stH=6, lobH=3, coreW=elems.reduce((s,e)=>s+e.w,0), totH=stH+lobH;
    let ins=0; inside.forEach(v=>ins+=v);
    if(ins-totH*coreW<100) return false;                  // daireye en az 25 m² kalmalı
    const claimAt=(r0,c0,north)=>{
      const coreR = north? r0 : r0+lobH;
      const lobR  = north? r0+stH : r0;
      let c=c0;
      elems.forEach(e=>{ const g=newReg(e.nm,e.tp);
        claimRect(g,coreR,c,stH,e.w);
        if(e.stair) stairs.push({r0:coreR,c0:c,h:stH,w:e.w});
        c+=e.w; });
      const hol=newReg('APARTMAN HOLÜ','koridor');
      claimRect(hol,lobR,c0,lobH,coreW);
      const rest=[]; for(let i=0;i<rows*cols;i++) if(inside[i]&&cm[i]===-1) rest.push(i);
      unitObjs.push(layoutUnit(rest, expanded[0], north?'S':'N')); // daire lobinin diğer yanında
      return true;
    };
    /* lobi daireye bakmalı: bloğun ilerisinde en az bir iç hücre olmalı (kapı verilebilsin) */
    const facing=(r,c0)=>{ if(r<0||r>=rows) return false;
      for(let c=c0;c<c0+coreW;c++) if(inside[r*cols+c]) return true; return false; };
    /* önce üst cepheden (çekirdek üstte, giriş güneyden), olmazsa alt cepheden ara */
    for(let r0=0;r0<=rows-totH;r0++) for(let c0=0;c0<=cols-coreW;c0++)
      if(rectFree(r0,c0,totH,coreW)&&facing(r0+totH,c0)) return claimAt(r0,c0,true);
    for(let r0=rows-totH;r0>=0;r0--) for(let c0=0;c0<=cols-coreW;c0++)
      if(rectFree(r0,c0,totH,coreW)&&facing(r0-1,c0)) return claimAt(r0,c0,false);
    return false;
  };

  /* tek daire + KİLİTLİ çekirdek (katlar arası ortak): çekirdek yukarıda zaten claim'li.
     Bant koridoru kullanma — karşı kanat sahipsiz kalıp ORTAK DEPO + dev hol doğuruyor
     (kat-plani-40: 57 m² depo + 38,5 m² hol = kat'ın ~%48'i ölü). Bunun yerine çekirdeğin
     iç-cepheye bakan kenarına 1,5 m lobi koy, kalan TÜM tabanı tek daireye ver
     (trySingleUnit'in kilitli-çekirdek ikizi). Lobi taban dışına düşerse / daireye <20 m²
     kalırsa false → eski bant yoluna güvenli geri-düşüş. */
  const trySingleUnitLockedCore=()=>{
    const coreTypes={merdiven:1,asansor:1,yangin:1,teknik:1};
    let cr0=rows,cr1=-1,cc0=cols,cc1=-1,nc=0;
    regions.forEach(g=>{ if(!coreTypes[g.type]) return;
      g.cells.forEach(i=>{ const r=(i/cols)|0,c=i%cols;
        if(r<cr0)cr0=r; if(r>cr1)cr1=r; if(c<cc0)cc0=c; if(c>cc1)cc1=c; nc++; }); });
    if(nc===0) return false;                              // çekirdek yok → bu yola girme
    /* çekirdek hangi kenara yaslı? en küçük boşluk = yaslı kenar; lobi+daire karşı tarafta */
    const gapN=cr0, gapS=rows-1-cr1, gapW=cc0, gapE=cols-1-cc1;
    const mn=Math.min(gapN,gapS,gapW,gapE), LOB=3;        // 1,5 m lobi
    let side,lr0,lc0,lh,lw;
    if(mn===gapN){      side='S'; lr0=cr1+1;   lc0=cc0;     lh=LOB;        lw=cc1-cc0+1; }
    else if(mn===gapS){ side='N'; lr0=cr0-LOB; lc0=cc0;     lh=LOB;        lw=cc1-cc0+1; }
    else if(mn===gapW){ side='E'; lr0=cr0;     lc0=cc1+1;   lh=cr1-cr0+1;  lw=LOB; }
    else {              side='W'; lr0=cr0;     lc0=cc0-LOB; lh=cr1-cr0+1;  lw=LOB; }
    const lob=[];                                         // lobinin iç+boş hücreleri
    for(let r=lr0;r<lr0+lh;r++)for(let c=lc0;c<lc0+lw;c++){
      if(r<0||c<0||r>=rows||c>=cols) continue;
      const i=r*cols+c; if(inside[i]&&cm[i]===-1) lob.push(i); }
    if(lob.length<LOB) return false;                      // lobi büyük ölçüde taban dışı
    let restN=0; for(let i=0;i<rows*cols;i++) if(inside[i]&&cm[i]===-1) restN++;
    if((restN-lob.length)*M*M<20) return false;           // daireye anlamlı alan kalmalı
    const hol=newReg('APARTMAN HOLÜ','koridor');           // ↑ tüm kontroller geçti → commit
    lob.forEach(i=>{ cm[i]=hol.id; hol.cells.push(i); });
    const rest=[]; for(let i=0;i<rows*cols;i++) if(inside[i]&&cm[i]===-1) rest.push(i);
    unitObjs.push(layoutUnit(rest, expanded[0], side));   // kalan taban tek daireye
    return true;
  };

  if(!villa && perFloor===1 && !coreLocked && trySingleUnit()){
    customCutsZ=[]; // ayırıcı yok; ince ayar duvar sürükleme + oda ekle/sil ile
  } else if(!villa && perFloor===1 && coreLocked && !wantV && trySingleUnitLockedCore()){
    customCutsZ=[]; // kilitli çekirdek + tek daire: lobi + tüm taban tek daireye
  } else if(!villa){
    /* --- ortak hol: ana bant --- */
    let sumR=0,n=0; const colMin=new Array(cols).fill(1e9), colMax=new Array(cols).fill(-1e9);
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++) if(inside[r*cols+c]){ sumR+=r;n++;
      if(r<colMin[c])colMin[c]=r; if(r>colMax[c])colMax[c]=r; }
    const corW=3; // 1,5 m
    const hol=newReg('APARTMAN HOLÜ','koridor');
    if(wantV){
      /* DİKEY KORİDOR (B-doğru): en iyi SÜTUN bandı — yatay seçimin satır↔sütun simetriği.
         Daireler sol/sağ; zone tespiti (isKorC) ve layoutUnit (E/W) bunu zaten destekler.
         addBranch + çekirdek-bloğu (if(!coreLocked)) wantV'de ATLANIR. */
      const rowMin=new Array(rows).fill(1e9), rowMax=new Array(rows).fill(-1e9);
      let sumC2=0,n2=0;
      for(let r=0;r<rows;r++)for(let c=0;c<cols;c++) if(inside[r*cols+c]){ sumC2+=c;n2++;
        if(c<rowMin[r])rowMin[r]=c; if(c>rowMax[r])rowMax[r]=c; }
      const nValidRows=rowMin.filter(v=>v<1e8).length||1;
      let bestC=-1,bestCost=1e18;
      for(let c0=1;c0<=cols-corW-1;c0++){
        let cover=0,cost=0;
        for(let r=0;r<rows;r++){
          if(rowMin[r]>1e8) continue;
          if(inside[r*cols+c0]&&inside[r*cols+c0+corW-1]) cover++;
          const dW=c0-rowMin[r], dE=rowMax[r]-(c0+corW-1);
          if(dW<0||dE<0){ cost+=40; continue; }
          const pen=d=>(d>0&&d<7)?(60+(7-d)*8):0;
          cost+=pen(dW)+pen(dE)+Math.abs(dW-dE)*0.4;
        }
        if(cover<nValidRows*0.35) continue;
        if(cost<bestCost){ bestCost=cost; bestC=c0; }
      }
      const corC0=bestC>=0? bestC : Math.max(1, Math.round(sumC2/n2)-1), corC1=corC0+corW-1;
      for(let c=corC0;c<=corC1;c++)for(let r=0;r<rows;r++) claim(hol,r,c);
      corridorR0=0; corridorR1=rows-1; // metadata: dikey koridor tüm satırları kapsar
    } else {
    /* hol satırını maliyetle seç: sığ işe yaramaz şeritler bırakmayan konum kazanır */
    const nValidCols=colMin.filter(v=>v<1e8).length||1;
    let bestR=-1, bestCost=1e18;
    for(let r0=1;r0<=rows-corW-1;r0++){
      let cover=0, cost=0;
      for(let c=0;c<cols;c++){
        if(colMin[c]>1e8) continue;
        if(inside[r0*cols+c]&&inside[(r0+corW-1)*cols+c]) cover++;
        const dN=r0-colMin[c], dS=colMax[c]-(r0+corW-1);
        if(dN<0||dS<0){ cost+=40; continue; }      // bant bu kolonu ıskalıyor
        const pen=d=>(d>0&&d<7)?(60+(7-d)*8):0;    // 0,5–3 m'lik kullanışsız şerit cezası
        cost+=pen(dN)+pen(dS)+Math.abs(dN-dS)*0.4; // hafif denge tercihi
      }
      if(cover<nValidCols*0.35) continue;
      if(cost<bestCost){ bestCost=cost; bestR=r0; }
    }
    corridorR0 = bestR>=0? bestR : Math.max(1, Math.round(sumR/n)-1);
    corridorR1 = corridorR0+corW-1;
    for(let r=corridorR0;r<=corridorR1;r++)for(let c=0;c<cols;c++) claim(hol,r,c);
    }

    if(!wantV){ /* kanat kolları + yan-kol temizliği yalnız YATAY koridorda; dikeyde atlanır */
    /* --- kanat kolları (çekirdekten ÖNCE): ana bant 8 m'den derin kanatlara L/T uzar --- */
    const addBranch=(north)=>{
      const depth=c=>{ if(colMin[c]>1e8) return 0;
        return north ? Math.max(0,corridorR0-colMin[c]) : Math.max(0,colMax[c]-corridorR1); };
      let c=0;
      while(c<cols){
        if(depth(c)>22){ let c2=c; while(c2<cols&&depth(c2)>22) c2++; // kol ancak 11 m'den derin kanatta (8-9 m derinlik normal daire)
          if((c2-c)*M>=6){
            /* geniş kanatlarda ~14 m arayla birden çok kol */
            const nB=Math.max(1, Math.round((c2-c)*M/14));
            for(let b=1;b<=nB;b++){
              const cc2=c+Math.round((c2-c)*b/(nB+1));
              const vals=[cc2-1,cc2,cc2+1].filter(x=>x>=0&&x<cols&&colMin[x]<1e8);
              if(!vals.length) continue;
              let r0b,r1b;
              /* kol cepheye kadar gider (pencerede biter) — ucunda daire saramaz */
              if(north){ const far=Math.min(...vals.map(x=>colMin[x])); r0b=far; r1b=corridorR0-1; }
              else { const far=Math.max(...vals.map(x=>colMax[x])); r0b=corridorR1+1; r1b=far; }
              if(r1b-r0b>=4){ for(let r=r0b;r<=r1b;r++) for(let c3=cc2-1;c3<=cc2+1;c3++) claim(hol,r,c3); }
            }
          }
          c=c2; } else c++;
      }
    };
    addBranch(true); addBranch(false);

    /* yan yana gereksiz kollar: 10 m'den yakın dikey kolların fazlasını sil */
    {
      const colHol=[]; // dikey kol merkez sütunları
      for(let c=1;c<cols-1;c++){
        let v=0; for(let r=0;r<rows;r++){ const j=r*cols+c;
          if(cm[j]===hol.id&&(r<corridorR0||r>corridorR1)) v++; }
        if(v>=4) colHol.push(c);
      }
      // bitişik grupları kollara ayır
      const groups=[]; let gAcc=[];
      colHol.forEach((c,i)=>{ if(i&&c>colHol[i-1]+1){ groups.push(gAcc); gAcc=[]; } gAcc.push(c); });
      if(gAcc.length) groups.push(gAcc);
      for(let i=1;i<groups.length;i++){
        const prev=groups[i-1], cur=groups[i];
        if((cur[0]-prev[prev.length-1])*M<10){ // çok yakın: küçüğü geri ver
          cur.forEach(c=>{ for(let r=0;r<rows;r++){ const j=r*cols+c;
            if(cm[j]===hol.id&&(r<corridorR0||r>corridorR1)){ cm[j]=-1; hol.cells=hol.cells.filter(x=>x!==j); } } });
          groups[i]=prev;
        }
      }
    }
    } /* if(!wantV) — kanat kolları sonu */

    /* --- çekirdek: merdiven + asansör + şaft (kilitli iskelet yoksa üretici yerleştirir) --- */
    if(!coreLocked){
    let sumC=0,m2=0; hol.cells.forEach(i=>{sumC+=i%cols;m2++;});
    const cc=Math.round(sumC/m2);
    const stH=6, stW=10; // 3,0 × 5,0 m
    const place=(g,h,w,prefC)=>{ // önce holün kuzeyi, sonra güneyi
      for(const r0 of [corridorR0-h, corridorR1+1]){
        for(let off=0;off<cols;off++){ for(const s of [1,-1]){
          const c0=prefC+s*off; if(rectFree(r0,c0,h,w)){ claimRect(g,r0,c0,h,w); return {r0,c0,h,w}; } } } }
      return null; };
    const coreRects=[];
    const merd=newReg('MERDİVEN','merdiven');
    const mPos=place(merd,stH,stW,cc-Math.floor(stW/2));
    if(mPos){ stairs.push(mPos); coreRects.push(mPos); }
    let nextC = mPos? mPos.c0+stW : cc;
    for(let a=0;a<nAsansor;a++){
      const as=newReg(asansorYeri?'ASANSÖR YERİ':'ASANSÖR','asansor');
      const p=place(as,stH,4,nextC); if(p){ nextC=p.c0+4; coreRects.push(p); } // kabin+arkasında kendi şaftı: çekirdek sırtı düz, ayrı ŞAFT parçası kalmaz
    }
    if(teknikNeeded){ const tk=newReg('TEKNİK / ŞAFT','teknik'); const p=place(tk,stH,3,nextC); if(p) coreRects.push(p); }
    if(fireStairNeeded){
      const yg=newReg('YANGIN MERD.','yangin');
      // en uzak uca koy: holün batı/doğu ucu
      let west=cols, east=-1;
      for(let c=0;c<cols;c++){ for(let r=corridorR0;r<=corridorR1;r++) if(cm[r*cols+c]>=0){ west=Math.min(west,c); east=Math.max(east,c); break; } }
      const fH=7,fW=5; // 3,5 × 2,5 m
      let p=null;
      const target=(cc-west>east-cc)?west:east-fW+1;
      for(let off=0;off<cols&&!p;off++){ for(const r0 of [corridorR0-fH, corridorR1+1]){
        for(const s of [1,-1]){ const c0=target+s*off;
          if(rectFree(r0,c0,fH,fW)){ claimRect(yg,r0,c0,fH,fW); p={r0,c0,h:fH,w:fW}; break; } } if(p)break; } }
      if(p){ stairs.push(p); coreRects.push(p); }
    }

    /* --- kaçış mesafesi (BYKHY): holün her noktasından bir merdivene ≤ 30 m kalana
           dek en uzak uca ek yangın merdiveni koy (uzun bloklarda tek çekirdek yetmez) --- */
    if(kat>=2){
      const stD=(r,c)=>{ let best=1e9; stairs.forEach(s=>{
        best=Math.min(best,(Math.abs(s.c0+s.w/2-(c+0.5))+Math.abs(s.r0+s.h/2-(r+0.5)))*M); }); return best; };
      const fH=7,fW=5;
      for(let extra=0; extra<4; extra++){
        let worst=0,wr=-1,wc2=-1;
        hol.cells.forEach(i=>{ const r=(i/cols)|0,c=i%cols; const d=stD(r,c);
          if(d>worst){worst=d;wr=r;wc2=c;} });
        if(worst<=REG.kacisMesafe-3) break; // antre derinliği payı
        /* hole komşu, en uzak noktaya en yakın boş dikdörtgen */
        let best=null,bd=1e9;
        for(let r0=0;r0<=rows-fH;r0++)for(let c0=0;c0<=cols-fW;c0++){
          if(!rectFree(r0,c0,fH,fW)) continue;
          let touch=false;
          for(let c=c0;c<c0+fW&&!touch;c++) touch=(r0>0&&cm[(r0-1)*cols+c]===hol.id)||(r0+fH<rows&&cm[(r0+fH)*cols+c]===hol.id);
          for(let r=r0;r<r0+fH&&!touch;r++) touch=(c0>0&&cm[r*cols+c0-1]===hol.id)||(c0+fW<cols&&cm[r*cols+c0+fW]===hol.id);
          if(!touch) continue;
          const d=Math.abs(r0+fH/2-wr)+Math.abs(c0+fW/2-wc2);
          if(d<bd){bd=d;best={r0,c0};}
        }
        if(!best) break;
        const yg=newReg('YANGIN MERD.','yangin');
        claimRect(yg,best.r0,best.c0,fH,fW);
        const p={r0:best.r0,c0:best.c0,h:fH,w:fW};
        stairs.push(p); coreRects.push(p);
      }
    }

    /* --- çekirdek sırtını düzleştir: sığ elemanların (asansör/teknik) arkasındaki
           ölü cepler tesisat şaftı olur; ulaşılamaz alan kalmaz --- */
    const saft=newReg('ŞAFT','teknik');
    coreRects.forEach(cr=>{
      if(cr.h>=stH) return;
      const north = cr.r0 < corridorR0;
      for(let c=cr.c0;c<cr.c0+cr.w;c++){
        if(north){ for(let r=corridorR0-stH;r<corridorR0-cr.h;r++) claim(saft,r,c); }
        else { for(let r=corridorR1+1+cr.h;r<=corridorR1+stH;r++) claim(saft,r,c); }
      }
    });
    /* ışıklık yok: çekirdek arkası komşu dairelerin odalarına (salon vb.) katılır;
       iç banyo/wc havalandırması şaftlarla çözülür (mevzuat notunda hatırlatılır) */
    } /* if(!coreLocked) */

    /* --- bölgeler: atanmamış bitişik bileşenler, hole baktıkları yöne göre --- */
    const comps=[]; { const seen=new Uint8Array(rows*cols);
      for(let i=0;i<rows*cols;i++){ if(seen[i]||!inside[i]||cm[i]!==-1) continue;
        const comp=[],st=[i]; seen[i]=1;
        while(st.length){ const j=st.pop(); comp.push(j); const r=(j/cols)|0,c3=j%cols;
          [[r-1,c3],[r+1,c3],[r,c3-1],[r,c3+1]].forEach(([rr,c4])=>{ if(rr<0||c4<0||rr>=rows||c4>=cols)return;
            const k=rr*cols+c4; if(!seen[k]&&inside[k]&&cm[k]===-1){seen[k]=1;st.push(k);} }); }
        comps.push(comp); } }
    const isKorC=(r,c)=>{ if(r<0||c<0||r>=rows||c>=cols) return false; const j=r*cols+c;
      return inside[j]&&cm[j]>=0&&regions[cm[j]].type==='koridor'; };
    const zones=[];
    comps.forEach(comp=>{
      if(comp.length*M*M<20){ const dp=newReg('ORTAK DEPO','teknik'); comp.forEach(i=>{cm[i]=dp.id;dp.cells.push(i);}); return; }
      const cnt={N:0,S:0,E:0,W:0};
      comp.forEach(i=>{ const r=(i/cols)|0,c3=i%cols;
        if(isKorC(r+1,c3))cnt.N++; if(isKorC(r-1,c3))cnt.S++; if(isKorC(r,c3+1))cnt.W++; if(isKorC(r,c3-1))cnt.E++; });
      const side=['N','S','E','W'].reduce((a,b)=>cnt[b]>cnt[a]?b:a,'N');
      zones.push({cells:comp, side, area:comp.length*M*M});
    });
    zones.sort((a,b)=>b.area-a.area);

    /* --- daireleri bölgelere alanla orantılı dağıt --- */
    const weight=u=>14 + u.salon*22 + u.oda*11 + (u.ensuite?3.2:0) + (u.oda>=2?8:4) + 4.5 + (u.oda>=3?1.8:0);
    /* hedef-alan (m²): daire programının ideal ayak izi. Dağıtım dengesini bölge alanına
       eşlemek + ŞİŞME/TIKIŞ ölçmek için. Türk daire normlarından kalibre (1+1≈58, 2+1≈86,
       3+1≈109). Detay: referans-kat-planlari/MOTOR-DAGITIM-KURALLARI.md */
    const targetM2=u=>22 + 13*u.salon + 23*u.oda + (u.ensuite?5:0);
    const order=[...expanded].sort((a,b)=>targetM2(b)-targetM2(a));
    const totZA=zones.reduce((s,z)=>s+z.area,0)||1;
    /* geometrik üst sınır: daire başına asgari cephe (salon 3 m + yatak 2,5 m yan yana
       sığmalı) — dar bölgeye daire tıkıştırılınca 1,5 m'lik "oda" şeritleri doğuyordu */
    const MIN_FRONT=5.5;
    zones.forEach(z=>{ const horiz=z.side==='N'||z.side==='S';
      const s=new Set(); z.cells.forEach(i=>s.add(horiz? i%cols : (i/cols)|0));
      z.maxU=Math.max(1, Math.floor(s.size*M/MIN_FRONT)); });
    /* FAZ 1 (#42): greedy + %125-fren yerine DENGELİ + TİP-GRUPLU bölütleme.
       Boyut-sıralı daire listesini (order, azalan) bölgelere (azalan alan, satır 732)
       BİTİŞİK segmentler hâlinde böler. Amaç fonksiyonu = daire başına ALAN SAPMASI²
       (şişme/tıkış): bir bölgede daireler hedef-alanına yakın alsın. Bitişik+sıralı
       olduğundan aynı tip daireler bir arada kalır (kat-42 → alt 2×2+1 / üst 3×1+1) ve
       büyük daireler büyük bölgeye düşer. Alan-eşleme TEK BAŞINA yetmez: eşit olmayan
       bölgelerde büyük yana fazladan daire yükleyip eski bug'ı tekrar üretirdi — sapma²
       şişmeyi (az daire → dev oda) doğrudan cezalandırdığı için tip-grup kazanır.
       maxU cephe sınırı korunur; kapasite dışı kuyruk rem'de kalır (aşağıda raporlanır).
       Detay: referans-kat-planlari/MOTOR-DAGITIM-KURALLARI.md */
    zones.forEach(z=>z.units=[]);
    let rem=[...order];
    if(zones.length && order.length){
      const Z=zones.length, cap=zones.reduce((s,z)=>s+z.maxU,0);
      const P=Math.min(order.length, cap);                 // kapasiteye sığan baş kısım (en büyük P daire)
      const tgt=order.map(targetM2), pre=[0], preSq=[0];    // prefix toplam + kare-toplam
      for(let i=0;i<P;i++){ pre.push(pre[i]+tgt[i]); preSq.push(preSq[i]+tgt[i]*tgt[i]); }
      const tkey=order.map(u=>u.oda+'/'+u.salon+'/'+(u.ensuite?1:0)+'/'+(u.acik?1:0)); // daire tipi imzası
      const INF=1e18, TYPEMIX=1e9;
      /* bir bölgeye order[u0..u1) atamanın maliyeti:
         BİRİNCİL — tip-homojenlik: segment KARIŞIK tip içeriyorsa TYPEMIX cezası. order
           azalan sıralı olduğu için aynı tip bitişiktir; ceza, kesimi tip sınırına iter
           (kat-42 → {2+1,2+1}|{1+1,1+1,1+1}). Aynı tipi birden çok bölgeye bölmek serbest
           (segment yine homojen). Bölge sayısı tip-grup sayısından fazlaysa kaçınılmaz
           karışım minimumda tutulur.
         İKİNCİL — alan dengesi (eşitlik bozucu): her daire ~ A·tgt_i/segT alır →
           maliyet = segSumSq·(A/segT−1)². Tip-homojen seçenekler arasında dengeliyi seçer;
           bölgeler+daireler birlikte azalan sıralı olduğu için büyük tip-grubu büyük bölgeye
           düşürür → küçük daire (1+1) DOĞRU boyda, fazlalık büyük daireye (rahat) gider.
         Boş bölge = alan israfı → A² (büyük boş bölge cezalı; FIX-01'i tamamlar). */
      const segCost=(u0,u1,A)=>{ if(u1===u0) return A*A;
        const segT=pre[u1]-pre[u0], segSq=preSq[u1]-preSq[u0], r=A/segT-1;
        let mix=0; for(let k=u0+1;k<u1;k++){ if(tkey[k]!==tkey[u0]){ mix=1; break; } }
        return TYPEMIX*mix + segSq*r*r; };
      // dp[zi][u] = ilk zi bölgeye ilk u daireyi yerleştirmenin min maliyeti
      const dp=Array.from({length:Z+1},()=>new Float64Array(P+1).fill(INF));
      const back=Array.from({length:Z+1},()=>new Int32Array(P+1).fill(-1));
      dp[0][0]=0;
      for(let zi=1;zi<=Z;zi++){ const mu=zones[zi-1].maxU, A=zones[zi-1].area;
        for(let u=0;u<=P;u++){
          for(let u0=Math.max(0,u-mu);u0<=u;u0++){ if(dp[zi-1][u0]>=INF) continue;
            const c=dp[zi-1][u0]+segCost(u0,u,A);
            if(c<dp[zi][u]){ dp[zi][u]=c; back[zi][u]=u0; } } } }
      let u=P;                                              // dp[Z][P] geri izle
      for(let zi=Z;zi>=1;zi--){ const u0=back[zi][u]>=0?back[zi][u]:u;
        for(let k=u0;k<u;k++) zones[zi-1].units.push(order[k]); u=u0; }
      rem=order.slice(P);                                   // kapasite dışı kuyruk
    }
    /* sığmayanlar: önce kapasitesi kalan bölgelere; yine kalan yerleştirilemez (denetimde raporlanır) */
    if(rem.length) zones.forEach(z=>{ while(rem.length && z.units.length<z.maxU) z.units.push(rem.shift()); });
    /* FAZ 1 (FIX-01 Seçenek A): daire almamış ama bir daire SIĞABİLECEK büyük bölge
       ORTAK DEPO'ya düşmesin — geniş uçtaki "dev depo" (kat-plani-39: 175 m²) semptom kesimi.
       Önce yerleşememiş daire (rem) varsa zorla ata; yoksa daire başına alanı en büyük (en
       seyrek) bölgeden EN HAFİF daireyi devral. YALNIZ "0 daireli + büyük" bölgede tetiklenir
       → her bölgesi zaten daire alan dikdörtgen/dengeli planlar hiç değişmez. (Geniş bölgeyi
       düzgün 2-3 daireye bölme FAZ 2'de.) */
    { const BIG_ZONE_M2=45; // bir 1+1 dairenin sığabileceği asgari alan
      zones.forEach(z=>{
        if(z.units.length>0 || z.area<BIG_ZONE_M2 || z.maxU<1) return;
        if(rem.length){ z.units.push(rem.shift()); return; }
        let donor=null, bestDens=0;
        zones.forEach(d=>{ if(d===z||d.units.length<=1) return;
          const dens=d.area/d.units.length; if(dens>bestDens){ bestDens=dens; donor=d; } });
        if(donor) z.units.push(donor.units.pop());
      }); }

    /* --- her bölgeyi hole paralel şeritlere böl --- */
    if(!customCutsZ||customCutsZ.length!==zones.length) customCutsZ=zones.map(()=>null);
    zones.forEach((z,zi)=>{
      const horiz = z.side==='N'||z.side==='S';
      const alOf = horiz ? (i=>i%cols) : (i=>(i/cols)|0);
      const base = horiz ? minX : minY;
      const sp=splitZone(z.cells, z.units.map(weight), customCutsZ[zi], alOf, base);
      customCutsZ[zi]=sp.cuts;
      sp.parts.forEach((cells,k)=>{ if(cells.length) unitObjs.push(layoutUnit(cells, z.units[k], z.side)); });
      /* tutamaç çapası: bölgenin hole bakan kenarı */
      let zAdj = (z.side==='N'||z.side==='W')? -1e9 : 1e9;
      let aMin=1e9,aMax=-1e9;
      z.cells.forEach(i=>{ const v=horiz?((i/cols)|0):(i%cols); const a=alOf(i);
        zAdj=(z.side==='N'||z.side==='W')?Math.max(zAdj,v):Math.min(zAdj,v);
        if(a<aMin)aMin=a; if(a>aMax)aMax=a; });
      const perpBase = horiz? minY : minX;
      const perp = (z.side==='N'||z.side==='W')? perpBase+(zAdj+1)*M-0.45 : perpBase+zAdj*M+0.45;
      zoneUI.push({zi, horiz, perp, min:base+(aMin+2)*M, max:base+(aMax-1)*M});
    });
  } else {
    /* --- villa: tek daire tüm taban --- */
    const all=[]; for(let i=0;i<rows*cols;i++) if(inside[i]) all.push(i);
    /* katları ayrı planla: üst katta iç merdiven zemin kattaki konumuna hücre hücre
       sabitlenir (düşey hiza). Kat sınırı merdiveni tamamen dışarıda bırakırsa kat
       kendi merdivenini alır; runChecks hiza ihlalini yazar. */
    let stairReg=null, wantStair=kat>1;
    const fsb=villaForcedStair();
    if(fsb){
      const idxs=[];
      const fr0=Math.max(0,Math.round((fsb.y0-minY)/M)), fr1=Math.min(rows,Math.round((fsb.y1-minY)/M));
      const fc0=Math.max(0,Math.round((fsb.x0-minX)/M)), fc1=Math.min(cols,Math.round((fsb.x1-minX)/M));
      for(let r=fr0;r<fr1;r++)for(let c=fc0;c<fc1;c++){
        const i=r*cols+c; if(inside[i]&&cm[i]===-1) idxs.push(i); }
      if(idxs.length){
        stairReg=newReg('MERDİVEN','merdiven',0);
        idxs.forEach(i=>{ cm[i]=stairReg.id; stairReg.cells.push(i); });
        wantStair=false;
      }
    }
    let free = stairReg? all.filter(i=>cm[i]===-1) : all;
    let stairA = stairReg? stairReg.cells.length*M*M : 0;
    let vu = layoutVillaSofa(free, unitSpecs[0], wantStair, stairA);
    if(!vu){
      /* BUG-FIX (çok katlı villada iç merdiven): L/T tabanda layoutVillaSofa
         doluluk<0.85 olunca bail edip layoutUnit fallback'ine düşüyor; orada merdiven
         sıradan bir hacim gibi ele alınıp yoğun programda sessizce düşebiliyordu.
         Çözüm: fallback'e düşmeden ÖNCE iç merdiveni birinci-sınıf rezerve et (taban
         şekli ne olursa olsun) → layoutUnit kalan alanda merdivensiz çalışsın. */
      if(wantStair && !stairReg){
        stairReg=reserveVillaStair(free);
        if(stairReg){ free=all.filter(i=>cm[i]===-1); stairA=stairReg.cells.length*M*M; wantStair=false; }
      }
      vu = layoutUnit(free, unitSpecs[0], 'N', wantStair);
    }
    if(stairReg) vu.rooms.push(stairReg);
    unitObjs.push(vu);
  }

  /* v22 villa: ORTA SOFA (çift yüklü) — tek yüklü T-plan derin villada (11 m) yatakları
     2,5 m'lik giriş şeridine itip yerleştiremiyordu ("7 yataktan 4 yerleşti" hatasının
     kökü). Vaka-5 dersi: kullanıcı planı orta hollü (sofa 7,5×6,5) plana çevirdi.
     Antre ortada 1,5 m yatay omurga + güney cepheye giriş kolu (villa kapısı antrenin
     dışa bakan kenarına çizilir); odalar kuzey/güney cephe bantlarına asılır — her oda
     hem pencere hem sofadan kapı alır. Sığmayan oda yine dürüstçe raporlanır. */
  /* BUG-FIX yardımcı: çok katlı villada iç merdivenin MUTLAKA yerleşmesini garanti eder.
     layoutVillaSofa yalnız ~dikdörtgen tabanda merdiveni birinci-sınıf rezerve eder;
     L/T tabanda bail edince layoutUnit fallback'i merdiveni sessizce düşürebiliyordu.
     Bu yardımcı kalan boş hücrelerden ≈2,5 m geniş × 3..5 m derin bir merdiven kovası
     keser (en büyük sığanı, taban köşesine yaslayarak) ve birinci-sınıf MERDİVEN bölgesi
     olarak sahiplenir. Hiç sığmazsa null döner (runChecks dürüstçe 'merdiven yok' yazar). */
  function reserveVillaStair(cells){
    const freeSet=new Set(cells.filter(i=>cm[i]===-1));
    if(!freeSet.size) return null;
    let r0=1e9,r1=-1e9,c0=1e9,c1=-1e9;
    freeSet.forEach(i=>{const r=(i/cols)|0,c=i%cols; if(r<r0)r0=r; if(r>r1)r1=r; if(c<c0)c0=c; if(c>c1)c1=c;});
    const fits=(rr,cc,h,w)=>{ for(let r=rr;r<rr+h;r++)for(let c=cc;c<cc+w;c++){ if(!freeSet.has(r*cols+c)) return false; } return true; };
    const corners=[[r0,c0],[r0,c1+1],[r1+1,c0],[r1+1,c1+1]];
    const W=5;                                  // 2,5 m net merdiven kovası genişliği
    for(const H of [10,9,8,7,6]){               // 5,0 → 3,0 m derinlik; en büyüğü tercih
      for(const [dh,dw] of [[H,W],[W,H]]){      // dikey ve yatay yön
        let best=null,bd=Infinity;
        for(let r=r0;r+dh<=r1+1;r++)for(let c=c0;c+dw<=c1+1;c++){
          if(!fits(r,c,dh,dw)) continue;
          /* kovayı bir taban köşesine yasla → kalan alan bütün (oda bandı bölünmesin) */
          const boxC=[[r,c],[r,c+dw],[r+dh,c],[r+dh,c+dw]];
          const d=Math.min(...corners.flatMap(([cr,cc])=>boxC.map(([br,bc])=>Math.abs(br-cr)+Math.abs(bc-cc))));
          if(d<bd){ bd=d; best=[r,c,dh,dw]; }
        }
        if(best){
          const g=newReg('MERDİVEN','merdiven',0);
          for(let r=best[0];r<best[0]+best[2];r++)for(let c=best[1];c<best[1]+best[3];c++){
            const i=r*cols+c; cm[i]=g.id; g.cells.push(i); }
          return g;
        }
      }
    }
    return null;
  }
  function layoutVillaSofa(cells, u, addStair, claimedArea){
    let r0=1e9,r1=-1e9,c0=1e9,c1=-1e9;
    cells.forEach(i=>{const r=(i/cols)|0,c=i%cols; if(r<r0)r0=r; if(r>r1)r1=r; if(c<c0)c0=c; if(c>c1)c1=c;});
    const depth2=(r1-r0+1)*M, width2=(c1-c0+1)*M;
    if(depth2<8||width2<8) return null; // sığ/dar villada tek yüklü T-plan daha doğru
    /* claimedArea: önceden sabitlenmiş merdiven (üst kat) — doluluk/kapasiteler tam alanla hesaplanır */
    const area=cells.length*M*M + (claimedArea||0);
    /* taban dikdörtgenden çok sapıyorsa (L-villa) eski yol: bant varsayımı bozulur */
    if(area/(depth2*width2)<0.85) return null;
    const unit={spec:u, rooms:[], antre:null};
    const sr0=r0+Math.round((r1-r0+1)/2)-1, sr1=sr0+2; // 1,5 m omurga (orta)
    const nBeds=Math.max(0,u.oda), hasEns=u.ensuite&&nBeds>0;
    const bedCap=Math.max(20,area*0.12);
    const S=[], N=[]; // güney (giriş cephesi): salon+mutfak+eb; kuzey: merdiven+banyo+yataklar
    /* YALNIZ "katları ayrı planla" açıkken salon=0 = SALONSUZ KAT (yatak katı): salon da
       mutfak da eklenmez — mutfak yaşam katına aittir; bir katta salon olması yeter
       (ev genelini runChecks denetler). Kapalıyken eski davranış: salon hep konur. */
    if(u.salon>0 || !floorsOn()){
      S.push({name:u.acik?'SALON + MUTFAK':'SALON',type:'salon',w:u.acik?26:20,ms:3.0});
      if(!u.acik) S.push({name:'MUTFAK',type:'mutfak',w:8,ms:2.0,cap:Math.max(13,area*0.085)});
    }
    if(addStair) N.push({name:'MERDİVEN',type:'merdiven',w:7,ms:2.5,cap:14});
    N.push({name:'BANYO',type:'banyo',w:4.5,ms:1.5,cap:Math.max(6.5,area*0.04)});
    if(hasEns) S.push({name:'EB. YATAK ODASI',type:'yatak',w:15.5,ms:2.5,eb:true,cap:Math.max(26,area*0.15)});
    /* düz yataklar: pratik genişlik payıyla (3,2 m) en boş banda — kapasite dolunca
       yine de eklenir, assignCols kuyruk odayı boş bırakır (dürüst rapor) */
    const capS=width2-1, capN=width2; // güneyden 1 m giriş kolu düşer
    /* tip bazlı pratik genişlik payı: salon ezilmesin, banyo/mutfak şişmesin */
    const wOf=r=> r.type==='salon'?4.5 : r.type==='mutfak'?2.0 : r.type==='banyo'?1.5
                : r.type==='merdiven'?2.5 : r.eb?3.5 : 3.2;
    let sW=S.reduce((s,r)=>s+wOf(r),0), nW=N.reduce((s,r)=>s+wOf(r),0);
    for(let b=0;b<nBeds-(hasEns?1:0);b++){
      const bd={name:'YATAK ODASI',type:'yatak',w:11,ms:2.5,cap:bedCap}, w=3.2;
      if(capN-nW>=w && (capN-nW)>=(capS-sW)){ N.push(bd); nW+=w; }
      else if(capS-sW>=w){ S.push(bd); sW+=w; }
      else if(capN-nW>=w){ N.push(bd); nW+=w; }
      else { (nW<=sW?N:S).push(bd); }
    }
    /* hücre bantları + giriş kolu (batı ucu, 1 m) */
    const nC=[], sC=[], spC=[], armCols=new Set([c0,c0+1]);
    cells.forEach(i=>{const r=(i/cols)|0;
      if(r<sr0)nC.push(i); else if(r<=sr1)spC.push(i);
      else (armCols.has(i%cols)? spC : sC).push(i); });
    const an=newReg('ANTRE','antre',unitObjs.length); unit.rooms.push(an); unit.antre=an;
    spC.forEach(i=>{ cm[i]=an.id; an.cells.push(i); });
    assignCols(sC, S, unit);
    assignCols(nC, N, unit);
    return unit;
  }

  function splitZone(zoneCells, weights, custom, alOf, base, minFront){
    const parts=weights.map(()=>[]); if(!weights.length) return {parts,cuts:[]};
    const colA=new Map(); zoneCells.forEach(i=>{const a=alOf(i); colA.set(a,(colA.get(a)||0)+1);});
    const als=[...colA.keys()].sort((a,b)=>a-b);
    const total=zoneCells.length;
    let bounds=[], usedCustom=false;
    if(custom && custom.length===weights.length-1){
      bounds=custom.map(x=>Math.round((x-base)/M)); usedCustom=true;
    } else {
      const tw=weights.reduce((s,w)=>s+w,0); let acc=0,wi=0;
      for(const a of als){ acc+=colA.get(a);
        while(wi<weights.length-1 && acc>=total*weights.slice(0,wi+1).reduce((s,w)=>s+w,0)/tw){ bounds.push(a+1); wi++; } }
      while(bounds.length<weights.length-1) bounds.push(als[als.length-1]+1);
      /* bölge boşlukla bölünüyorsa sınırı boşluğa zorla */
      const gaps=[];
      for(let i=0;i<als.length-1;i++) if(als[i+1]>als[i]+1) gaps.push(als[i]+1);
      gaps.forEach(gb=>{ if(!bounds.length) return;
        let bi=0,bd=1e9; bounds.forEach((b,j)=>{ const d=Math.abs(b-gb); if(d<bd){bd=d;bi=j;} });
        bounds[bi]=gb; });
      bounds.sort((a,b)=>a-b);
      /* her parça asgari cepheyi alsın — ince şerit kalmasın (iki yönlü garanti).
         Konut dairesi 5,5 m (varsayılan); ticari dükkân daha dar olabilir (minFront ile) */
      const minC=Math.round((minFront||5.5)/M);
      for(let j=0;j<bounds.length;j++){
        const lo=(j===0?als[0]:bounds[j-1])+minC;
        if(bounds[j]<lo) bounds[j]=lo; }
      for(let j=bounds.length-1;j>=0;j--){
        const hi=(j===bounds.length-1? als[als.length-1]+1 : bounds[j+1])-minC;
        if(bounds[j]>hi) bounds[j]=hi; }
    }
    zoneCells.forEach(i=>{ const a=alOf(i); let k=0; while(k<bounds.length&&a>=bounds[k])k++; parts[k].push(i); });
    return {parts, cuts: usedCustom? custom : bounds.map(b=>base+b*M)};
  }

  /* --- daire içi oda yerleşimi: T-plan, hole baktığı yöne duyarlı (N/S/E/W) --- */
  /* eb. banyo penceresi: oda içinde EN ÇOK hücre kapsayan cw×cw kare aranır (köşe
     tercihli). Köşe sabit kesim L-biçimli odalarda 0-10 hücrelik kırpık banyo üretip
     purgeSlivers'a yem oluyordu → daire sessizce ensuite'siz kalıyordu (v20→v21
     kullanıcı ince ayarı, ders #1). Banyo ≥3 m², oda bağlantılı ve ≥9 m² kalmalı. */
  function carveCornerBath(unit, ebReg, cw){
    if(!ebReg||ebReg.cells.length<=30) return false;
    let r0=1e9,r1=-1e9,c0=1e9,c1=-1e9;
    const set=new Set(ebReg.cells);
    ebReg.cells.forEach(i=>{const r=(i/cols)|0,c=i%cols; if(r<r0)r0=r; if(r>r1)r1=r; if(c<c0)c0=c; if(c>c1)c1=c;});
    /* skor: kapsanan hücre (asıl) + kalan odanın bbox'u KÜÇÜLSÜN (L-odada banyo
       ince kanattan/gölgeden oyulur, oda dikdörtgene yaklaşır — kullanıcının v21'de
       eb. banyoyu yangın merdiveni gölgesine oyması) */
    /* antre cephesi yenmez: pencere, odanın antreye değen hücrelerini kaplarsa
       kapı teması <1 m'ye düşebilir (L-şekil testinde yakalandı) — hücre başına ceza */
    const aid=unit.antre? unit.antre.id : -99;
    const adjAntre=i=>{ const r=(i/cols)|0,c=i%cols;
      return (r>0&&cm[i-cols]===aid)||(r<rows-1&&cm[i+cols]===aid)
           ||(c>0&&cm[i-1]===aid)||(c<cols-1&&cm[i+1]===aid); };
    let best=null,bs=-1e9;
    for(let wr=r0;wr<=Math.max(r0,r1-cw+1);wr++) for(let wc=c0;wc<=Math.max(c0,c1-cw+1);wc++){
      let n=0,door=0,wall=0;
      for(let r=wr;r<wr+cw;r++) for(let c=wc;c<wc+cw;c++){ const i=r*cols+c;
        if(set.has(i)){ n++; if(adjAntre(i)) door++;
          /* duvar teması: oda DIŞINA bakan kenar — köşe konumları kazanır,
             banyo oda ortasında ADA olarak kalmaz (kat-plani-22 dersi) */
          if(r===0||!set.has(i-cols)) wall++;
          if(r===rows-1||!set.has(i+cols)) wall++;
          if(c===0||!set.has(i-1)) wall++;
          if(c===cols-1||!set.has(i+1)) wall++; } }
      let kr0=1e9,kr1=-1e9,kc0=1e9,kc1=-1e9,nk=0;
      ebReg.cells.forEach(i=>{ const r=(i/cols)|0,c=i%cols;
        if(r>=wr&&r<wr+cw&&c>=wc&&c<wc+cw) return;
        nk++; if(r<kr0)kr0=r; if(r>kr1)kr1=r; if(c<kc0)kc0=c; if(c>kc1)kc1=c; });
      const kb=nk? (kr1-kr0+1)*(kc1-kc0+1) : 1e6;
      /* kılçık cezası: pencere ile oda bbox kenarı arasında 1 hücrelik (0,5 m)
         şerit bırakan konum — yaşanmaz artık üretir (banyo üstünde 0,5 m bant) */
      let sliver=0;
      [[wr-r0],[r1-(wr+cw-1)],[wc-c0],[c1-(wc+cw-1)]].forEach(([g])=>{ if(g===1) sliver++; });
      const score=n*1000-kb-door*60+wall*25-sliver*500;
      if(score>bs){ bs=score; best=[wr,wc]; } }
    if(!best) return false;
    const take=[],keep=[];
    ebReg.cells.forEach(i=>{ const r=(i/cols)|0,c=i%cols;
      (r>=best[0]&&r<best[0]+cw&&c>=best[1]&&c<best[1]+cw? take:keep).push(i); });
    /* dairede başka ≥9 m² yatak varsa eb. yatak 6 m²'ye inebilir (PAİY: tek piyes ≥9) */
    const keepMin = unit.rooms.some(g=>g!==ebReg&&g.type==='yatak'&&g.cells.length>=36)? 24 : 36;
    if(take.length<12||keep.length<keepMin) return false;
    const s2=new Set(keep), seen=new Set([keep[0]]), st=[keep[0]];
    while(st.length){ const i=st.pop(), r=(i/cols)|0, c=i%cols;
      [r>0?i-cols:-1, r<rows-1?i+cols:-1, c>0?i-1:-1, c<cols-1?i+1:-1].forEach(j=>{
        if(j>=0&&s2.has(j)&&!seen.has(j)){ seen.add(j); st.push(j); } }); }
    if(seen.size!==keep.length) return false;
    const bath=newReg('EB. BANYO','banyo',ebReg.unit);
    bath.ebHost=ebReg.id;                                  // çoklu ensuite için id bağı (ad-bazlı eşleşmeye düşmesin)
    unit.rooms.push(bath);
    take.forEach(i=>{ cm[i]=bath.id; bath.cells.push(i); });
    ebReg.cells=keep;
    return true;
  }
  function layoutUnit(cells, u, side, addStair, uIdx){
    const unit={spec:u, rooms:[], antre:null, side};            // side: daire takası/relayout için saklanır
    const ui = (uIdx==null? unitObjs.length : uIdx);            // daire indeksi (açık verilebilir → post-gen relayout)
    unit.uIdx = ui;                                             // assignCols + relayout region.unit etiketi için
    const layoutMode = unitLayout[ui] || 'auto'; // bu dairenin iç düzen tercihi
    const area=cells.length*M*M;
    const horiz = side==='N'||side==='S';
    const alOf = horiz ? (i=>i%cols) : (i=>(i/cols)|0);   // hole paralel eksen
    const dpRaw = horiz ? (i=>(i/cols)|0) : (i=>i%cols);  // derinlik ekseni
    const inv = side==='N'||side==='W';
    const isKorI=j=>j>=0&&j<rows*cols&&inside[j]&&cm[j]>=0&&regions[cm[j]].type==='koridor';
    const korNb=i=>{ const r=(i/cols)|0,c=i%cols;
      return side==='N'? isKorI((r+1)*cols+c) : side==='S'? isKorI((r-1)*cols+c)
           : side==='W'? (c+1<cols&&isKorI(r*cols+c+1)) : (c-1>=0&&isKorI(r*cols+c-1)); };
    let adj=-1;
    cells.forEach(i=>{ if(korNb(i)){ const v=dpRaw(i); adj = adj<0? v : (inv? Math.max(adj,v):Math.min(adj,v)); } });
    if(adj<0){ let mn=1e9,mx=-1e9; cells.forEach(i=>{const v=dpRaw(i); if(v<mn)mn=v; if(v>mx)mx=v;}); adj=inv?mx:mn; }
    const dOf = i => { const v=dpRaw(i); return inv? adj-v : v-adj; }; // 0 = giriş kenarı
    let dMaxV=0; cells.forEach(i=>{ const d=dOf(i); if(d>dMaxV)dMaxV=d; });
    const depthM=(dMaxV+1)*M;
    const bset=new Set(), aset=new Set(), kset=new Set();
    cells.forEach(i=>{ aset.add(alOf(i)); if(dOf(i)<=0) bset.add(alOf(i)); if(korNb(i)) kset.add(alOf(i)); });
    const widthM=(bset.size||aset.size)*M;
    const combined=!!u.acik;          // açık (Amerikan) mutfak
    const noSalon=villa&&floorsOn()&&u.salon===0; // villa "katları ayrı planla": salonsuz yatak katı (salon+mutfak yok)
    const studio=u.salon===0&&!noSalon;           // 1+0: tek yaşama/yatma mekânı
    const nBeds=Math.max(0, studio? u.oda-1 : u.oda);
    const hasEns=u.ensuite && nBeds>0;
    /* giriş sırası (ıslak hacimler) ve cephe sırası (yaşam alanları) */
    const entry=[], fac=[];
    /* büyük dairede ıslak hacimler ve mutfak da büyür — salon tek başına şişmez */
    /* mutfak dar kenarı: tezgah+insan+makine ≥2 m; yalnız gerçekten küçük dairede (≤45 m²) yasal 1,5 m */
    if(!combined&&!noSalon) entry.push({name:'MUTFAK',type:'mutfak',w:8,min:3.6,cap:Math.max(13,area*0.085),ms:area<=45?1.5:(area>120?2.5:2.0)});
    entry.push({name:'BANYO',type:'banyo',w:4.5,min:3.4,cap:Math.max(6.5,area*0.04),ms:1.5});
    /* SIĞ daire (≤9 m derin, tek yüklü T-plan — kullanıcının hedef görseli): antre kompakt
       tutulur, alan odalara akar. Derin/çok bantlı dairede eski davranış korunur (regresyon yok). */
    const shallowU = depthM<=9 && area<=140;
    const antreDef={name:'ANTRE',type:'antre',w:shallowU?3:4,min:2.2,cap:shallowU?5:7,ms:shallowU?1.4:1.5};
    entry.push(antreDef);
    if(addStair) entry.push({name:'MERDİVEN',type:'merdiven',w:7,min:6,cap:14,ms:2.5});
    /* 3+ yatakta ikinci tuvalet; ensuite VARSA o görevi eb. banyo görür — kullanıcı
       vaka-1'de iki dairede de kılçık WC'yi silip KİLER yaptı (v22 dersi) */
    if(nBeds>=3){
      if(hasEns) entry.push({name:'KİLER',type:'antre',w:1.8,min:1.5,cap:4,ms:1.0});
      else entry.push({name:'WC',type:'wc',w:1.8,min:1.5,cap:Math.max(2.6,area*0.018),ms:1.0});
    }
    if(studio) fac.push({name:'STÜDYO',type:'salon',w:24,ms:3.0});
    else if(!noSalon){
      fac.push({name:combined?'SALON + MUTFAK':'SALON',type:'salon',w:combined?26:20,ms:3.0,salon:true});
      for(let s=1;s<u.salon;s++) fac.push({name:'OTURMA ODASI',type:'salon',w:16,ms:3.0,cap:24});
    }
    /* yatak odası üst sınırı daire büyüklüğüyle ölçeklenir: artan alan salona akar */
    const bedCap=Math.max(20, area*0.12), ebCap=Math.max(26, area*0.15), bedMs=area>120?3.0:2.5;
    for(let b=0;b<nBeds-(hasEns?1:0);b++) fac.push({name:'YATAK ODASI',type:'yatak',w:11,ms:bedMs,cap:bedCap});
    let ebDef=null;
    if(hasEns){ ebDef={name:'EB. YATAK ODASI',type:'yatak',w:15.5,ms:bedMs,eb:true,cap:ebCap}; fac.push(ebDef); }
    /* MUTFAK CEPHEYE (v22, vaka 1-5 dersi): penceresiz mutfak doğalgaz alamaz
       (elektrikli ocak/havalandırma boşluğu TR'de tercih edilmez). Cephe genişliği
       yetiyorsa mutfak giriş sırasından cephe sırasına, salonun yanına alınır;
       yetmiyorsa eski davranış (iç mutfak) + runChecks bilgi notu. */
    let mutToFac=false;
    {
      const mi=entry.findIndex(r=>r.type==='mutfak');
      if(mi>=0 && !studio && widthM/(fac.length+1)>=3.2){
        const mut=entry.splice(mi,1)[0];
        const si=fac.findIndex(r=>r.salon);
        fac.splice(si+1,0,mut);
        mutToFac=true;
      }
    }
    /* genişlik taşması: cephe sırasına sığmayan yatak odaları —
       DERİN dairede (≥10,5 m) odalar derinlikte katmanlanır (demiryolu planı:
       giriş → yatak bandı + 1,5 m iç koridor → cephede salon); sliver oda doğmaz.
       Sığ dairede eski davranış: giriş sırasına itilir.
       Kullanıcı tercihi (unitLayout): 'flat' demiryolunu kapatır (odalar yan yana),
       'rail' eşikleri gevşeterek demiryolunu zorlar. */
    const midBeds=[];
    const wantRail = layoutMode==='flat' ? false
                   : layoutMode==='rail' ? (fac.length>1 && depthM>=8)
                   : (fac.length>1 && widthM/fac.length<3.2 && depthM>=10.5);
    if(wantRail){
      const maxFac=Math.max(1, Math.floor(widthM/3.2));
      while(fac.length>maxFac){
        let idx=fac.findIndex(r=>r.type==='yatak'&&!r.eb); // eb. yatak cephede kalsın (pencere önceliği)
        if(idx<0) idx=fac.findIndex(r=>r.type==='yatak');
        if(idx<0) break;
        midBeds.push(fac.splice(idx,1)[0]);
      }
    }
    while(fac.length>2 && widthM/fac.length<3.2){
      const idx=fac.findIndex(r=>r.type==='yatak'&&!r.eb);
      if(idx<0) break;
      entry.push(Object.assign(fac.splice(idx,1)[0],{min:8,cap:16}));
    }
    /* derinlik bantları: giriş + hol + cephe */
    const totalW=[...entry,...fac].reduce((s,r)=>s+r.w,0);
    const scale=area/totalW;
    entry.forEach(r=>{ r.t=Math.min(r.cap||1e9, Math.max(r.min||0, r.w*scale)); });
    const entryHasRoom=entry.some(r=>r.type==='yatak'||r.type==='merdiven');
    /* mutfak varsa şerit derinliği mutfağın İDEAL oranını hedefler (kare-ye yakın, ince-uzun değil) */
    const mutDef=entry.find(r=>r.type==='mutfak');
    /* mutfak cepheye taşındıysa (YALNIZ o zaman — açık mutfak eski yolda kalır) şerit
       derinliğini BANYO'nun ideal oranı belirler (v22: 1,5 m'lik kılçık banyo doğmasın) */
    const wetDef=mutDef||(mutToFac? entry.find(r=>r.type==='banyo') : null);
    const idealD = wetDef? Math.sqrt((wetDef.t||8)/1.35) : 0;
    /* giriş sırasına yatak itildiyse sıra ≥2,5 m olmalı (2 m yatak yasadışı) */
    const minD = entryHasRoom? 2.5 : ((wetDef&&area>45)? 2.0 : 1.5);
    let entryD=Math.min(entryHasRoom?3.5:3.0,
      Math.max(minD, snapG(Math.max(entry.reduce((s,r)=>s+r.t,0)/widthM, idealD))));
    let holD=1.0; // daire içi hol kolu (kompakt; alan oda programına kalsın)
    while(depthM-entryD-holD<2.8 && entryD>minD) entryD-=0.5; // cephe odalarına en az 2,8 m derinlik kalsın
    if(fac.length<2&&!midBeds.length) holD=0; // tek cephe odası (stüdyo): odaya antreden doğrudan geçilir, hol gereksiz
    /* KOMB PLAN (sığ bant, v20→v21 dersi #3): cepheye <2,5 m kalıyorsa giriş sırası
       İPTAL — antre koridor boyunca 1,5 m omurga olur, ıslak hacimler dâhil TÜM odalar
       omurgaya asılır: orta odalar ~depth-1,5 m derinlik, uç odalar (salon / eb. yatak)
       tam derinlik. 10×2,5 salon ve 7×2 mutfak şeritleri böyle ölür. */
    let combU=false;
    /* kulak-çekirdekte (earCoreLocked) sığ daireler de OMURGA (combU) kullanır: 3,5 m derin
       daire normal 2-bantta cepheye 1 satır bırakıp odaları içeri sıkıştırıyor (antre dış
       duvarı yutuyor — C-daire2 inversiyonu). combU spine odaları tam-derinlik cepheye
       oturtur. Kulaksız band'da eşik 4 m kalır → harness2 byte-aynı. */
    if(depthM-entryD-holD<2.5 && depthM>=(earCoreLocked?3:4) && fac.length>=1 && !addStair && !studio && !midBeds.length){
      combU=true;
      for(let j=entry.length-1;j>=0;j--){ const r=entry[j];
        if(r===antreDef) continue;
        entry.splice(j,1);
        r.t=Math.min(r.cap||1e9, Math.max(r.min||0, r.w*scale));
        r.w=r.t; r.cap=r.t;              // ıslak hacim cephede 'emici' olmasın
        if(r.ms&&r.ms>depthM-1.5) r.ms=Math.max(1.5, depthM-1.5);
        fac.push(r);
      }
      antreDef.t=Math.min(antreDef.t, shallowU?5:6);
      entryD=1.5; holD=0;
    }
    const eRows=Math.round(entryD/M), hRows=Math.round(holD/M);
    /* yatak bandı derinliği: yataklar TAM GENİŞLİK bantlar halinde derinlikte istiflenir
       (yanda 1,5–2 m iç koridor şeridi); oda ~12 m² hedefler, salona ≥3,5 m kalır */
    let mRows=0;
    if(midBeds.length){
      const bedW=Math.max(2.0, widthM-2.0);
      const per=Math.min(4.0, Math.max(2.5, 12/bedW));
      const avail=depthM-entryD-holD-3.5;
      while(midBeds.length && midBeds.length*per>avail) // sığmayan yatak girişe (eski yol)
        entry.push(Object.assign(midBeds.pop(),{min:8,cap:16}));
      if(midBeds.length) mRows=Math.round(snapG(midBeds.length*per)/M);
    }
    const sumT=entry.reduce((s,r)=>s+r.t,0);
    /* giriş şeridi yalnızca gerektiği kadar geniş; artık uçlar tam derinlikte cephe odalarına gider */
    let fullEntryArea=0; cells.forEach(i=>{ if(dOf(i)<eRows) fullEntryArea+=M*M; });
    let kilerT=0;
    /* kiler: yalnız 110 m²+ dairede; ensuite İSTENEN dairede eşik 130 m² —
       program (eb. banyo) dururken lüks (kiler) çizilmez (v20→v21 dersi: kullanıcı
       110 m² dairelerde kileri silip yerine eb. banyo koydu) */
    if(!combU && area>=(hasEns?130:110) && fullEntryArea-sumT>4
       && !entry.some(r=>r.name==='KİLER')) kilerT=Math.min(4, fullEntryArea-sumT);
    const minColsSum=entry.reduce((s,r)=>s+Math.max(2, Math.round((r.ms||1)/M)),0);
    const needAls=Math.max(6, minColsSum, Math.ceil((sumT+kilerT+0.5)/entryD/M)); // her oda asgari genişliğini bulsun
    /* şerit, KORİDORA GERÇEKTEN TEMAS EDEN sütunlarda kalır (kapı garantisi) —
       tek daire/kat lobisinde kritik: lobi tüm cepheyi değil yalnız çekirdek önünü kaplar */
    const alsAll=[...(kset.size?kset:(bset.size?bset:aset))].sort((a,b)=>a-b);
    /* bitişik segmentlere ayır; en uzununu kullan (şerit çekirdek boşluğuna yayılmasın) */
    const segs=[]; let seg=[alsAll[0]];
    for(let i=1;i<alsAll.length;i++){ if(alsAll[i]===alsAll[i-1]+1) seg.push(alsAll[i]); else { segs.push(seg); seg=[alsAll[i]]; } }
    segs.push(seg);
    const segBest=segs.reduce((a,b)=>b.length>a.length?b:a);
    let inStrip; const freeEdge=new Set(); // freeEdge: bina dış YAN kenar sütunları → cephe odası (antre değil)
    if(combU){
      /* OMURGA: uç odalar tam derinlik alır, antre omurgası aradaki sütunlarda kalır.
         Sıralama: salon bir uca, eb. yatak öbür uca; çekirdek gölgesi (antre bandı
         derinliğinde hücresi olmayan sütunlar — yangın merdiveni arkası gibi) varsa
         EB. YATAK o uca gider: kapısız yaşayabilen tek oda olan EB. BANYO gölgeye
         oyulur (kullanıcının v21'deki hamlesi), salon karşı uçta cephede kalır. */
      const reach0=new Set(); cells.forEach(i=>{ if(dOf(i)<eRows) reach0.add(alOf(i)); });
      const shAls=[...aset].filter(a=>!reach0.has(a));
      const sal0=fac.find(r=>r.salon)||fac[0];
      const eb0=fac.find(r=>r.eb);
      const allA=[...aset].sort((a,b)=>a-b), midA=(allA[0]+allA[allA.length-1])/2;
      fac.splice(fac.indexOf(sal0),1);
      if(eb0) fac.splice(fac.indexOf(eb0),1);
      if(shAls.length>=3 && eb0){
        const shMid=shAls.reduce((s,a)=>s+a,0)/shAls.length;
        if(shMid<midA){ fac.unshift(eb0); fac.push(sal0); }
        else { fac.unshift(sal0); fac.push(eb0); }
      } else { fac.unshift(sal0); if(eb0) fac.push(eb0); }
      /* omurga önce TAM genişlik atanır; cephe odaları yerleştikten sonra uç
         sütunlar (orta odaların gerçek aralığı dışında kalanlar) uç odalara geri
         verilir — kestirimle uç payı biçmek orta odayı omurga dışına taşırıp
         kapısız bırakıyordu (salon erimesi). Bkz. assignCols sonrası comb bloğu. */
      inStrip=new Set(segBest);
    } else {
      /* YAN-CEPHE güvencesi: şerit, bina dış YAN kenar sütununu (segBest ucu, dış
         komşu !inside) KAPSAMASIN — o sütunu köşe cephe odası TAM DERİNLİK kapsar
         (dikdörtgen kalır, biçimsiz doğmaz), antre içeri kayar. Önce kenar(lar)ı
         kullanılabilir aralıktan dışla (şerit ≥ needAls kaldığı sürece); şerit bu
         aralık içinde konumlanır → kenarı ister kaydırarak ister daraltarak boşaltır. */
      let loB=0, hiB=segBest.length;
      if(fac.length>=1 && segBest.length){
        const edgeOf=(a,hi)=>cells.some(i=>{ if(alOf(i)!==a) return false; const c=i%cols,r=(i/cols)|0;
          return horiz?(hi?(c+1>=cols||!inside[i+1]):(c-1<0||!inside[i-1]))
                     :(hi?(r+1>=rows||!inside[i+cols]):(r-1<0||!inside[i-cols])); });
        if(edgeOf(segBest[0],false) && hiB-1>=needAls){ loB=1; freeEdge.add(segBest[0]); }
        if(edgeOf(segBest[hiB-1],true) && (hiB-1)-loB>=needAls){ hiB-=1; freeEdge.add(segBest[hiB]); }
      }
      const availR=hiB-loB;
      /* küçük artık uç (≤2,5 m) salona ince kanat olarak gitmesin: şerit aralığı tamamını kapsar */
      const nA = (availR-needAls<=5) ? availR : Math.min(availR, needAls);
      /* büyük artık uç (≥4 m) varsa şerit salonun KARŞI ucuna (kenara komşu) yaslanır; küçükse ortala */
      let lo;
      if(availR-nA>=8) lo=loB+availR-nA;
      else lo=loB+Math.max(0, Math.floor(availR/2)-Math.floor(nA/2));
      lo=Math.max(loB, Math.min(hiB-nA, lo));
      inStrip=new Set(segBest.slice(lo, lo+nA));
    }
    const entryCells=[], holCells=[], midCells=[], facCells=[];
    cells.forEach(i=>{ const d=dOf(i), a=alOf(i);
      if(freeEdge.has(a)){ facCells.push(i); return; } // YAN kenar sütunu tümüyle cephe odasına (tam derinlik)
      if(d<eRows){ (inStrip.has(a)?entryCells:facCells).push(i); }
      else if(d<eRows+hRows) holCells.push(i);
      else if(d<eRows+hRows+mRows) midCells.push(i);
      else facCells.push(i); });
    if(kilerT>0) entry.splice(entry.indexOf(antreDef)+1,0,{name:'KİLER',type:'antre',t:kilerT,ms:1.0});
    /* giriş sırasına itilen yatak odası pencere alabilsin: şeridin cepheye dokunan ucuna taşı */
    {
      const pushedBeds=entry.filter(r=>r.type==='yatak');
      if(pushedBeds.length&&entryCells.length){
        let aMin=1e9,aMax=-1e9; entryCells.forEach(i=>{const a=alOf(i); if(a<aMin)aMin=a; if(a>aMax)aMax=a;});
        const extAt=(a,low)=>entryCells.some(i=>{ if(alOf(i)!==a) return false;
          const r=(i/cols)|0, c=i%cols;
          if(horiz) return low? (c===0||!inside[i-1]) : (c===cols-1||!inside[i+1]);
          return low? (r===0||!inside[i-cols]) : (r===rows-1||!inside[i+cols]); });
        if(extAt(aMin,true)&&!extAt(aMax,false))
          pushedBeds.forEach(r=>{ entry.splice(entry.indexOf(r),1); entry.unshift(r); });
      }
    }
    const stripArea=entryCells.length*M*M, sumT2=entry.reduce((s,r)=>s+(r.t||0),0);
    if(stripArea-sumT2>1){ // artık önce odalara (üst sınıra kadar), antreye en çok 9 m²
      let exc=stripArea-sumT2;
      entry.forEach(r=>{ if(exc<=0||r===antreDef||!r.cap) return;
        const give=Math.min(exc, r.cap-r.t); if(give>0){ r.t+=give; exc-=give; } });
      antreDef.t=Math.min(shallowU?6:9, antreDef.t+exc);
    }
    entry.forEach(r=>{ r.w=r.t||r.w; });
    /* cephe hedefleri: yatak odaları üst sınırlı, artan alan salona akar */
    const facArea=facCells.length*M*M;
    fac.forEach(r=>{ r.t=Math.min(r.cap||1e9, Math.max(r.ms*r.ms, r.w*scale)); });
    const facSum=fac.reduce((s,r)=>s+r.t,0);
    const salonDef=fac.find(r=>r.salon)||fac[0];
    if(facArea>facSum){
      /* cephe artığı önce ÜST SINIRLI odalara (yatak/mutfak, cap'e kadar), kalan salona —
         v22 vaka dersi: motor salonu 42-50 m²'ye şişirirken kullanıcı 5 vakada da
         salonu küçültüp yatakları büyüttü (42→31 salon, 14→20 yatak). */
      let exc=facArea-facSum;
      fac.forEach(r=>{ if(exc<=0||r===salonDef||!r.cap) return;
        const give=Math.min(exc, r.cap-r.t); if(give>0){ r.t+=give; exc-=give; } });
      if(salonDef) salonDef.t+=exc; // salonsuz katta cephe sırası boş olabilir (oda 0)
    }
    fac.forEach(r=>{ r.w=r.t; });
    /* çekirdek gölgesi düzeltmesi: antre/hol bandı derinliğinde hücresi olmayan sütunlara
       (merdiven/asansör arkası raf) hol kolu uzanamaz; oraya bütünüyle düşen oda antreye
       komşu olamaz ve meltNoAccess'te erir. Üst sınırsız 'emici' salon o uca yaslanır,
       yatak odaları erişilebilir sütunlarda kalır. */
    if(fac.length>1 && !combU){ // komb planda salon/eb yerleşimi omurga hesabında yapıldı
      const reach=new Set(); cells.forEach(i=>{ if(dOf(i)<eRows+hRows) reach.add(alOf(i)); });
      const facAls=[...new Set(facCells.map(alOf))].sort((a,b)=>a-b);
      const shadow=facAls.filter(a=>!reach.has(a));
      if(shadow.length>=4){ // ≥2 m gölge: oda yutabilir, önlem al
        const shMid=shadow.reduce((s,a)=>s+a,0)/shadow.length;
        const mid=(facAls[0]+facAls[facAls.length-1])/2;
        fac.splice(fac.indexOf(salonDef),1);
        if(shMid>mid) fac.push(salonDef); else fac.unshift(salonDef);
      }
    }
    const e0=unit.rooms.length;
    assignCols(entryCells, entry, unit, alOf);
    const entryRegs=unit.rooms.slice(e0);
    const f0=unit.rooms.length;
    assignCols(facCells, fac, unit, alOf);
    const facRegs0=unit.rooms.slice(f0);
    /* KOMB: omurganın uç sütunları uç odalara geri verilir → salon / eb. yatak
       TAM derinlik kazanır, orta odalar (≈depth−1,5 m) omurga üstünde kapılı kalır */
    if(combU && unit.antre && unit.antre.cells.length){
      const fr=facRegs0.filter(g=>g.cells.length);
      if(fr.length>=3){
        let m0=1e9, m1=-1e9;
        fr.slice(1,-1).forEach(g=>g.cells.forEach(i=>{ const a=alOf(i); if(a<m0)m0=a; if(a>m1)m1=a; }));
        const give=(g,pred)=>{ if(!g) return;
          unit.antre.cells=unit.antre.cells.filter(i=>{ const a=alOf(i);
            if(pred(a)){ cm[i]=g.id; g.cells.push(i); return false; } return true; }); };
        give(fr[0], a=>a<m0);
        give(fr[fr.length-1], a=>a>m1);
      }
    }
    /* yatak bandı (derin daire): iç koridor cephe odaları SINIRINA oturur ki
       hem salon hem yanındaki oda (eb. yatak) koridordan kapı alabilsin;
       yataklar zaten üstteki kola (antreye) değer */
    let midRegs=[];
    if(midCells.length&&midBeds.length){
      const facR=facRegs0.filter(g=>g.cells.length)
        .map(g=>{ let a0=1e9,a1=-1e9; g.cells.forEach(i=>{const a=alOf(i); if(a<a0)a0=a; if(a>a1)a1=a;}); return {g,a0,a1}; })
        .sort((x,y)=>x.a0-y.a0);
      let m0=1e9,m1=-1e9; midCells.forEach(i=>{const a=alOf(i); if(a<m0)m0=a; if(a>m1)m1=a;});
      /* koridor şeridi TAM DERİNLİKLİ sütunlarda olmalı: çekirdek gölgesinde kesilen
         şerit salona ulaşamaz ve salon kapısız kalıp erirdi */
      const cnt=new Map(); midCells.forEach(i=>{const a=alOf(i); cnt.set(a,(cnt.get(a)||0)+1);});
      const isFull=a=>(cnt.get(a)||0)>=mRows;
      const want = facR.length>=2? facR[1].a0 : m1-1; // hedef: cephe odaları sınırı / uç
      const len = facR.length>=2? 4:3;                // sınırı kapsarken 2+2 hücre
      let cLo=-1,cHi=-1,bestD=1e9;
      for(let s2=m0;s2<=m1-len+1;s2++){
        let ok=true; for(let a=s2;a<s2+len;a++) if(!isFull(a)){ok=false;break;}
        if(!ok) continue;
        const d2=Math.abs(s2-(want-(facR.length>=2?2:1)));
        if(d2<bestD){ bestD=d2; cLo=s2; cHi=s2+len-1; }
      }
      if(cLo<0){ // tam derinlikli sütun yok: en iyi çaba (sınıra otur)
        if(facR.length>=2){ cLo=Math.max(m0,want-2); cHi=Math.min(m1,want+1); }
        else { cLo=Math.max(m0,m1-2); cHi=m1; }
      }
      const corrCells=[], segL=[], segR=[];
      midCells.forEach(i=>{ const a=alOf(i);
        if(a>=cLo&&a<=cHi) corrCells.push(i);
        else if(a<cLo) segL.push(i); else segR.push(i); });
      /* yataklar BÜYÜK parçada tam genişlik bantlar halinde derinlikte istiflenir;
         küçük artık parça antreye (cep) */
      const bedSeg = segL.length>=segR.length? segL : segR;
      (bedSeg===segL? segR : segL).forEach(i=>corrCells.push(i));
      if(bedSeg.length){
        midBeds.forEach(b=>{ b.w=1; b.ms=2.5; });
        const r0=unit.rooms.length;
        assignCols(bedSeg, midBeds, unit, i=>dOf(i)); // eksen: DERİNLİK — odalar üst üste bant
        midRegs=unit.rooms.slice(r0);
      }
      /* koridor + artık cepler antreye */
      if(!unit.antre&&corrCells.length){ const an=newReg('ANTRE','antre',ui); unit.rooms.push(an); unit.antre=an; }
      if(unit.antre) corrCells.forEach(i=>{ cm[i]=unit.antre.id; unit.antre.cells.push(i); });
    }
    /* iç hol → antreye kat (T sirkülasyon); kol HER odaya (mutfak dâhil) erişecek kadar uzun,
       artan uçlar köşe odalara bağışlanır */
    if(unit.antre){
      const rngOf=g=>{ let a0=1e9,a1=-1e9; g.cells.forEach(i=>{const a=alOf(i); if(a<a0)a0=a; if(a>a1)a1=a;}); return {a0,a1}; };
      const facR=facRegs0.filter(g=>g.cells.length);
      let trimL=-1e9, trimR=1e9, lReg=null, rReg=null;
      if(facR.length>=2){
        const fr=facR.map(g=>({g,...rngOf(g)})).sort((a,b)=>a.a0-b.a0);
        lReg=fr[0].g; rReg=fr[fr.length-1].g;
        /* köşe odası (çoğu kez emici SALON) hol bandını geri alır: kol yalnız iç odalara
           erişecek kadar uzar, salon temiz dikdörtgen kalır, antre kompaktlaşır.
           SIĞ dairede (demiryolu yok) köşe oda hol bandına bitişiktir → tam genişlik geri
           alınır (overlap=-1). DERİN/demiryolu dairede köşe oda orta banttan ayrıdır →
           kola fazla yaklaşmak odayı koparır; eski güvenli pay (overlap=2) korunur. */
        const isSalon = g => g && typeof g.name==='string' && g.name.indexOf('SALON')===0;
        const ovOf = reg => (!shallowU || midRegs.length || !isSalon(reg)) ? 2 : -1; // yalnız SIĞ dairede köşedeki EMİCİ SALON tam genişlik geri alır
        trimL=fr[0].a1-ovOf(lReg); trimR=fr[fr.length-1].a0+ovOf(rReg);
        /* giriş sırası ve yatak bandı odaları da kola değmeli */
        entryRegs.concat(midRegs).forEach(g=>{ if(g===unit.antre||!g.cells.length) return;
          const r=rngOf(g); trimL=Math.min(trimL, r.a1-2); trimR=Math.max(trimR, r.a0+2); });
        /* kol, antrenin kendi giriş yuvasını da kapsamalı (kopukluk olmasın) */
        if(unit.antre.cells.length){ const ar=rngOf(unit.antre);
          trimL=Math.min(trimL, ar.a0); trimR=Math.max(trimR, ar.a1); }
      }
      /* v22: hol artığı MUTFAĞA bağışlanmaz — köşedeki mutfak L-biçimine düşüyordu */
      const lOK=lReg&&lReg.type!=='mutfak', rOK=rReg&&rReg.type!=='mutfak';
      holCells.forEach(i=>{ const a=alOf(i);
        if(a<trimL&&lOK){ cm[i]=lReg.id; lReg.cells.push(i); }
        else if(a>trimR&&rOK){ cm[i]=rReg.id; rReg.cells.push(i); }
        else { cm[i]=unit.antre.id; unit.antre.cells.push(i); } });
    }
    /* antre garantisi: hiç antre kalmadıysa giriş kenarı ortasından oy */
    if(!unit.antre||!unit.antre.cells.length){
      const als=[...(bset.size?bset:aset)].sort((x,y)=>x-y);
      if(als.length){
        const midA=als[Math.floor(als.length/2)];
        const want=new Set([midA-1,midA,midA+1]);
        const an=newReg('ANTRE','antre',ui);
        cells.forEach(i=>{ if(want.has(alOf(i)) && dOf(i)<eRows+hRows+1 && cm[i]>=0){
          const old=regions[cm[i]];
          if(old&&old.type!=='koridor'&&old.type!=='merdiven'){ old.cells=old.cells.filter(j=>j!==i); cm[i]=an.id; an.cells.push(i); } } });
        if(an.cells.length){ unit.rooms.push(an); unit.antre=an; }
      }
    }
    /* ebeveyn banyosu: odada en çok hücre kapsayan pencereden oyulur (kırpık önlenir) */
    if(ebDef){
      const ebReg=unit.rooms.find(g=>g.name==='EB. YATAK ODASI');
      carveCornerBath(unit, ebReg, area>140?5:4);
    }
    unit.rooms=unit.rooms.filter(g=>g.cells.length); // hücre alamayan oda (ör. sığmayan WC) plandan düşer
    if(unit.antre&&!unit.antre.cells.length) unit.antre=null;
    unit.comb=combU; // omurga planı işareti: slimAntres omurgayı kemirmesin
    return unit;
  }
  function assignCols(cellArr, roomDefs, unit, alOf){
    if(!cellArr.length||!roomDefs.length) return;
    alOf = alOf || (i=>i%cols);
    const colA=new Map(); cellArr.forEach(i=>{const a=alOf(i); colA.set(a,(colA.get(a)||0)+1);});
    const als=[...colA.keys()].sort((a,b)=>a-b);
    const total=cellArr.length, tw=roomDefs.reduce((s,r)=>s+r.w,0);
    const regs=roomDefs.map(d=>{ const g=newReg(d.name,d.type, unit.uIdx!=null?unit.uIdx:unitObjs.length); unit.rooms.push(g);
      if(d.name==='ANTRE') unit.antre=g; return g; });
    let acc=0, k=0; const bounds=[];
    for(const a of als){ acc+=colA.get(a);
      while(k<roomDefs.length-1 && acc>=total*roomDefs.slice(0,k+1).reduce((s,r)=>s+r.w,0)/tw){ bounds.push(a+1); k++; } }
    for(let j=0;j<bounds.length;j++){ // her oda kendi minimum genişliğini alsın
      const minC=Math.max(2, Math.round((roomDefs[j].ms||1)/M));
      const lo=(j===0?als[0]:bounds[j-1])+minC;
      if(bounds[j]<lo) bounds[j]=lo; }
    for(let j=bounds.length-1;j>=0;j--){ // SON oda da ezilmesin: geriye doğru aynı garanti
      const minC=Math.max(2, Math.round((roomDefs[j+1].ms||1)/M));
      const hi=(j===bounds.length-1? als[als.length-1]+1 : bounds[j+1])-minC;
      if(bounds[j]>hi) bounds[j]=hi; }
    for(let j=0;j<bounds.length;j++){ // toplam genişlik yetmiyorsa İLK odalar aç kalmasın (eski öncelik)
      const minC=Math.max(2, Math.round((roomDefs[j].ms||1)/M));
      const lo=(j===0?als[0]:bounds[j-1])+minC;
      if(bounds[j]<lo) bounds[j]=lo; }
    cellArr.forEach(i=>{ const a=alOf(i); let j=0; while(j<bounds.length&&a>=bounds[j])j++;
      cm[i]=regs[j].id; regs[j].cells.push(i); });
  }

  /* --- sahipsiz kalan hücreler ortak depo olur (boşluk kalmasın) --- */
  { const orphan=[]; for(let i=0;i<rows*cols;i++) if(inside[i]&&cm[i]===-1) orphan.push(i);
    if(orphan.length){ const dp=newReg('ORTAK DEPO','teknik');
      orphan.forEach(i=>{ cm[i]=dp.id; dp.cells.push(i); }); } }

  /* --- kopuk bölge parçaları: en büyük komşuya kat (ulaşılamaz cep kalmasın) --- */
  function fixOrphans(){
    for(let pass=0;pass<2;pass++){
      regions.forEach(g=>{
        if(g.cells.length<2||g.type==='isiklik'||g.type==='koridor') return;
        const set=new Set(g.cells), seen=new Set(), comps=[];
        g.cells.forEach(s=>{ if(seen.has(s)) return;
          const comp=[], st=[s]; seen.add(s);
          while(st.length){ const i=st.pop(); comp.push(i);
            const r=(i/cols)|0, c=i%cols;
            [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc2])=>{
              if(rr<0||cc2<0||rr>=rows||cc2>=cols) return;
              const j=rr*cols+cc2;
              if(set.has(j)&&!seen.has(j)){ seen.add(j); st.push(j); } }); }
          comps.push(comp); });
        if(comps.length<2) return;
        comps.sort((a,b)=>b.length-a.length);
        comps.slice(1).forEach(comp=>{
          const cnt=new Map();
          comp.forEach(i=>{ const r=(i/cols)|0, c=i%cols;
            [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc2])=>{
              if(rr<0||cc2<0||rr>=rows||cc2>=cols) return;
              const j=rr*cols+cc2;
              if(inside[j]&&cm[j]>=0&&cm[j]!==g.id) cnt.set(cm[j],(cnt.get(cm[j])||0)+1); }); });
          let best=-1,bn=0; cnt.forEach((n,id2)=>{ if(n>bn){bn=n;best=id2;} });
          if(best>=0){
            comp.forEach(i=>{ cm[i]=best; regions[best].cells.push(i); });
            const rm=new Set(comp); g.cells=g.cells.filter(i=>!rm.has(i));
          }
        });
      });
    }
  }
  /* --- mevzuata takılan odayı bol komşusundan genişlet --- */
  function repairUnits(){
    const floorOf=g=>{
      switch(g.type){
        case 'salon': return (g.name.includes('MUTFAK')||g.name==='STÜDYO')?{a:REG.salonMutfak.area,s:REG.salonMutfak.side}:{a:REG.salon.area,s:REG.salon.side};
        case 'yatak': return {a:REG.yatak.area,s:REG.yatak.side};
        case 'mutfak': return {a:REG.mutfak.area,s:REG.mutfak.side};
        case 'banyo': return {a:REG.banyo.area,s:REG.banyo.side};
        case 'wc': return {a:REG.wc.area,s:REG.wc.side};
        case 'antre': return g.name==='KİLER'?{a:0,s:0}:{a:3.5,s:1.2};
        default: return null; // merdiven vb. dokunma
      }
    };
    const bbox=g=>{ let r0=1e9,r1=-1e9,c0=1e9,c1=-1e9;
      g.cells.forEach(i=>{const r=(i/cols)|0,c=i%cols; if(r<r0)r0=r; if(r>r1)r1=r; if(c<c0)c0=c; if(c>c1)c1=c;});
      return {r0,r1,c0,c1,a:g.cells.length*M*M,w:(c1-c0+1)*M,h:(r1-r0+1)*M}; };
    unitObjs.forEach(u=>{
      const grow=room=>{
        if(!room||!room.cells.length) return;
        const req=floorOf(room); if(!req) return;
        for(let iter=0; iter<30; iter++){
          const b=bbox(room);
          const needS=Math.min(b.w,b.h)<req.s, needA=b.a<req.a;
          if(!needS&&!needA) return;
          /* dört yönde 0,5 m'lik şerit adayları */
          const stripCells=(fixed,isCol)=>{ const arr=[];
            if(isCol){ if(fixed<0||fixed>=cols) return arr;
              for(let r=b.r0;r<=b.r1;r++){ const j=r*cols+fixed; if(inside[j]&&cm[j]>=0&&cm[j]!==room.id) arr.push(j); } }
            else { if(fixed<0||fixed>=rows) return arr;
              for(let c=b.c0;c<=b.c1;c++){ const j=fixed*cols+c; if(inside[j]&&cm[j]>=0&&cm[j]!==room.id) arr.push(j); } }
            return arr; };
          const cand=[];
          [[b.c0-1,true],[b.c1+1,true],[b.r0-1,false],[b.r1+1,false]].forEach(([f,isCol])=>{
            let sc=stripCells(f,isCol); if(!sc.length) return;
            /* baskın donörün hücrelerini al (karma şeritlerde de büyüyebilsin) */
            const byReg=new Map();
            sc.forEach(i=>{ const a=byReg.get(cm[i])||[]; a.push(i); byReg.set(cm[i],a); });
            let bestArr=[]; byReg.forEach(arr=>{ if(arr.length>bestArr.length) bestArr=arr; });
            sc=bestArr; if(sc.length<2) return;
            const don=regions[cm[sc[0]]];
            if(don===room||!u.rooms.includes(don)||don.type==='merdiven') return;
            const df=floorOf(don)||{a:6,s:2};
            if(don.cells.length*M*M - sc.length*M*M < df.a+0.5) return; // donör kendi minimumunun altına düşmesin
            const widens = isCol===(b.w<=b.h); // dar kenarı büyütüyor mu
            if(needS && !widens) return; // dar kenar sorunluyken boyuna büyüme yasak (banyo koridoru olmasın)
            cand.push({sc,don,score:(don.cells.length*M*M-df.a)+(needS&&widens?1000:0)-(don===u.antre?500:0)});
          });
          if(!cand.length) return;
          cand.sort((a,b2)=>b2.score-a.score);
          /* sirkülasyon denetimi: antreden alınca hiçbir oda erişimini kaybetmemeli */
          const adjOK=()=>{ if(!u.antre||!u.antre.cells.length) return false;
            const aid=u.antre.id;
            /* antre tek parça kalmalı */
            { const set=new Set(u.antre.cells), st=[u.antre.cells[0]], seen=new Set([u.antre.cells[0]]);
              while(st.length){ const i=st.pop(); const r=(i/cols)|0,c=i%cols;
                [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc2])=>{ if(rr<0||cc2<0||rr>=rows||cc2>=cols)return;
                  const j=rr*cols+cc2; if(set.has(j)&&!seen.has(j)){ seen.add(j); st.push(j); } }); }
              if(seen.size!==u.antre.cells.length) return false; }
            return u.rooms.every(g=>{ if(g===u.antre||!g.cells.length||g.name==='EB. BANYO') return true;
              return g.cells.some(i=>{ const r=(i/cols)|0,c=i%cols;
                return (r>0&&cm[i-cols]===aid)||(r<rows-1&&cm[i+cols]===aid)||(c>0&&cm[i-1]===aid)||(c<cols-1&&cm[i+1]===aid); }); }); };
          let took=false;
          for(const pick of cand){
            pick.sc.forEach(i=>{ cm[i]=room.id; room.cells.push(i); });
            const rm=new Set(pick.sc); pick.don.cells=pick.don.cells.filter(i=>!rm.has(i));
            if(pick.don===u.antre && !adjOK()){ // geri al
              pick.sc.forEach(i=>{ cm[i]=pick.don.id; pick.don.cells.push(i); });
              room.cells=room.cells.filter(i=>!rm.has(i));
              continue;
            }
            took=true; break;
          }
          if(!took) return;
        }
      };
      const beds=u.rooms.filter(g=>g.type==='yatak'&&g.cells.length);
      grow(u.rooms.find(g=>g.type==='banyo'&&!g.name.startsWith('EB')));
      grow(u.rooms.find(g=>g.type==='wc'));
      grow(u.rooms.find(g=>g.type==='mutfak'));
      if(beds.length) grow(beds.reduce((a,b)=>b.cells.length>a.cells.length?b:a));
      grow(u.rooms.find(g=>g.type==='salon'));
    });
  }
  /* --- kılçık odaları erit: 1 m'lik "oda" oda değildir, komşusuna katılır --- */
  function purgeSlivers(){
    unitObjs.forEach(u=>{
      u.rooms.slice().forEach(g=>{
        if(!g.cells.length||g===u.antre||g.type==='merdiven') return;
        let r0=1e9,r1=-1e9,c0=1e9,c1=-1e9;
        g.cells.forEach(i=>{const r=(i/cols)|0,c=i%cols; if(r<r0)r0=r; if(r>r1)r1=r; if(c<c0)c0=c; if(c>c1)c1=c;});
        const side=Math.min((r1-r0+1)*M,(c1-c0+1)*M), a=g.cells.length*M*M;
        const sliver = g.type==='wc' ? (side<0.9||a<1.1)
                     : g.type==='banyo' ? (side<1.2||a<2.8)   // 2×1,5 m eb. banyo meşru (purge yemesin)
                     : (side<1.4||a<3.5);
        if(!sliver) return;
        const cnt=new Map();
        g.cells.forEach(i=>{ const r=(i/cols)|0,c=i%cols;
          [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc2])=>{
            if(rr<0||cc2<0||rr>=rows||cc2>=cols) return;
            const j=rr*cols+cc2;
            if(inside[j]&&cm[j]>=0&&cm[j]!==g.id&&u.rooms.includes(regions[cm[j]]))
              cnt.set(cm[j],(cnt.get(cm[j])||0)+1); }); });
        let best=-1,bn=0; cnt.forEach((n,id2)=>{ if(n>bn){bn=n;best=id2;} });
        if(best>=0){
          const tgt=regions[best];
          /* dairenin TEK salonu eriyorsa salon ölmez: emici oda salona dönüşür (yasal zorunlu piyes) */
          const onlySalon = g.type==='salon' && !u.rooms.some(o=>o!==g&&o.type==='salon'&&o.cells.length);
          g.cells.forEach(i=>{ cm[i]=best; tgt.cells.push(i); });
          if(onlySalon && tgt.type==='yatak'){ tgt.name=g.name; tgt.type='salon'; }
          g.cells=[];
        }
      });
      u.rooms=u.rooms.filter(g=>g.cells.length);
    });
  }
  /* --- antreye komşu olamayan oda çizim hatasıdır: komşusuna katılır, panel raporlar --- */
  function meltNoAccess(){
    unitObjs.forEach(u=>{
      if(!u.antre||!u.antre.cells.length) return;
      const aid=u.antre.id;
      u.rooms.slice().forEach(g=>{
        if(g===u.antre||!g.cells.length||g.name==='EB. BANYO'||g.type==='merdiven') return;
        let ok=false;
        g.cells.forEach(i=>{ const r=(i/cols)|0,c=i%cols;
          if((r>0&&cm[i-cols]===aid)||(r<rows-1&&cm[i+cols]===aid)||(c>0&&cm[i-1]===aid)||(c<cols-1&&cm[i+1]===aid)) ok=true; });
        if(ok) return;
        const cnt=new Map();
        g.cells.forEach(i=>{ const r=(i/cols)|0,c=i%cols;
          [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc2])=>{
            if(rr<0||cc2<0||rr>=rows||cc2>=cols) return;
            const j=rr*cols+cc2;
            if(inside[j]&&cm[j]>=0&&cm[j]!==g.id&&u.rooms.includes(regions[cm[j]])&&regions[cm[j]]!==u.antre)
              cnt.set(cm[j],(cnt.get(cm[j])||0)+1); }); });
        let best=-1,bn=0; cnt.forEach((n,id2)=>{ if(n>bn){bn=n;best=id2;} });
        if(best>=0){
          const tgt=regions[best];
          const onlySalon = g.type==='salon' && !u.rooms.some(o=>o!==g&&o.type==='salon'&&o.cells.length);
          g.cells.forEach(i=>{ cm[i]=best; tgt.cells.push(i); });
          if(onlySalon && tgt.type==='yatak'){ tgt.name=g.name; tgt.type='salon'; }
          g.cells=[];
        }
      });
      u.rooms=u.rooms.filter(g=>g.cells.length);
    });
  }
  /* --- zorunlu banyo eksikse: antreye komşu en büyük odadan oyulur --- */
  function carveMissing(){
    unitObjs.forEach(u=>{
      if(!u.antre||!u.antre.cells.length) return;
      if(u.rooms.some(g=>g.type==='banyo'&&g.cells.length)) return;
      const aid=u.antre.id;
      const adjA=i=>{ const r=(i/cols)|0,c=i%cols;
        return (r>0&&cm[i-cols]===aid)||(r<rows-1&&cm[i+cols]===aid)||(c>0&&cm[i-1]===aid)||(c<cols-1&&cm[i+1]===aid); };
      let host=null;
      u.rooms.forEach(g=>{ if(!g.cells.length||g===u.antre||g.type==='merdiven'||g.type==='wc') return;
        if(g.cells.some(adjA)&&(!host||g.cells.length>host.cells.length)) host=g; });
      if(!host||host.cells.length<60) return; // ev sahibi oda ≥15 m² kalmalı
      const seed=host.cells.filter(adjA).sort((a,b)=>a-b)[0];
      const sr=(seed/cols)|0, sc=seed%cols;
      const bath=newReg('BANYO','banyo', host.unit);
      u.rooms.push(bath);
      const keep=[];
      host.cells.forEach(i=>{ const r=(i/cols)|0,c=i%cols;
        if(Math.abs(r-sr)<=2&&Math.abs(c-sc)<=2){ cm[i]=bath.id; bath.cells.push(i); } else keep.push(i); });
      host.cells=keep;
    });
  }
  /* --- ensuite SÖZÜ tutulur: spec ebeveyn banyolu ama EB. BANYO kalmadıysa
         (kırpık banyo purge'a yenildi, pencere sığmadı...) önce yatağa komşu KİLER
         dönüştürülür, olmadı en büyük yataktan pencere oyulur (v20→v21 dersi #1) --- */
  function ensureEnsuite(){
    unitObjs.forEach(u=>{
      if(!u.spec||!u.spec.ensuite) return;
      if(u.rooms.some(g=>g.name==='EB. BANYO'&&g.cells.length)) return;
      const beds=u.rooms.filter(g=>g.type==='yatak'&&g.cells.length);
      if(!beds.length) return;
      const bedIds=new Set(beds.map(g=>g.id));
      const kil=u.rooms.find(g=>g.name==='KİLER'&&g.cells.length);
      if(kil){
        let host=null;
        kil.cells.forEach(i=>{ const r=(i/cols)|0,c=i%cols;
          [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc2])=>{
            if(rr<0||cc2<0||rr>=rows||cc2>=cols) return;
            const j=rr*cols+cc2;
            if(inside[j]&&cm[j]>=0&&bedIds.has(cm[j])) host=regions[cm[j]]; }); });
        if(host){ kil.name='EB. BANYO'; kil.type='banyo'; kil.ebHost=host.id; host.name='EB. YATAK ODASI'; return; }
      }
      const host=beds.find(g=>g.name==='EB. YATAK ODASI')||beds.reduce((a,b)=>b.cells.length>a.cells.length?b:a);
      const ar=u.rooms.reduce((s,g)=>s+g.cells.length,0)*M*M;
      if(carveCornerBath(u, host, ar>140?5:4)) host.name='EB. YATAK ODASI';
    });
  }
  fixOrphans();
  repairUnits();
  purgeSlivers();
  meltNoAccess();
  carveMissing();
  ensureEnsuite();
  fixOrphans();

  /* --- bölge metrikleri --- */
  regions.forEach(g=>calcRegionMetrics(g, cols, minX, minY));

  plan={regions, cm, inside, rows, cols, minX, minY, corridorR0, corridorR1,
        stairs, unitObjs, villa, kat, binaYuk, perFloor, nAsansor, asansorYeri,
        fireStairNeeded, teknikNeeded, zoneUI};
  /* DAİRE TAKASI / post-gen relayout (#41): verilen ayak izini (cellsIn) yeni spec ile
     YERİNDE yeniden döşer — tam generate YOK, diğer daireler bozulmaz. Eski odalar çağıran
     tarafça boşaltılır; hücreler serbest bırakılır, layoutUnit odaları uIdx etiketiyle üretir,
     tüketilmeyen artık hücreler en büyük odaya katılır (delik kalmaz). closure: layoutUnit/cm. */
  plan.relayoutFootprint=(cellsIn, spec, side, uIdx)=>{
    cellsIn.forEach(i=>{ cm[i]=-1; });
    const nu=layoutUnit(cellsIn, spec, side, false, uIdx);
    nu.side=side;
    const leftover=cellsIn.filter(i=>cm[i]===-1);
    if(leftover.length && nu.rooms.some(g=>g.cells.length)){
      const big=nu.rooms.reduce((a,b)=>(b.cells.length>a.cells.length?b:a));
      leftover.forEach(i=>{ cm[i]=big.id; big.cells.push(i); });
    }
    nu.rooms.forEach(g=>calcRegionMetrics(g, cols, minX, minY));
    return nu;
  };
  hoverWall=null; hoverRoomId=null; hoverDoor=null;
  doorOverrides={}; extraDoors=[]; doorHidden={}; // bölge kimlikleri yeniden doğdu: elle kapı ayarları bayat
  editHistory=editHistory.filter(e=>e.type==='cut'||e.type==='ulayout'||e.type==='corelock'||e.type==='bound'||e.type==='__snap'); // bölge kimlikleri yeniden doğdu: duvar/oda girdileri bayat (ulayout/corelock/bound tam durum taşır, hayatta kalır)
  plan.wallRuns=computeWallRuns();
  slimAntres(); // antre fazlalığı (kör uç kol, odaya sokulan çıkıntı, şişkin yuva) odalara geri verilir
  /* slim sonrası odalar büyüdü: ilk turda yer bulamayan eb. banyo şimdi sığabilir */
  ensureEnsuite();
  regions.forEach(g=>calcRegionMetrics(g, cols, minX, minY));
  plan.wallRuns=computeWallRuns();
  runChecks();
  buildUnitTable();
  renderFloorTabs();
  updateStructResetBtn();
  document.getElementById('svgBtn').disabled=false;
  document.getElementById('pngBtn').disabled=false;
  document.getElementById('aiOutputBtn').disabled=false;
  render();
}

/* ===== İÇE AKTARILAN BOZUK DÜZEN OTOMATİK ONARIMI (yalnız dosya yükleme yolu) =====
   Düzenleme (cut sürükleme / oda silme / daire takası) bazen bağımsız bölüm hücrelerini
   APARTMAN HOLÜ'ne (koridor) döküp odaları HÜCRESİZ bırakabiliyor. Böyle bir durum
   kaydedilip yeniden açıldığında: hol kat alanının büyük kısmını yutmuş, daireler
   piyeslerini kaybetmiş, çok sayıda hücresiz "hayalet" oda kalmış olur. Sonuç: kuzeye/hole
   doğru duvar sürüklenemez (koridor parçalı → moveWallStep'in regConnected'ı reddeder) ve
   hol "doldurulamaz". healDisconnected/fixOrphans koridoru ATLADIĞI için bu durumu onaramaz.
   Çözüm: yüklemede bozukluğu sez → spec + ayırıcılardan generate(true) ile YENİDEN ÜRET
   (cut bölünmesi korunur). YALNIZ importPlanText'ten çağrılır; undo/redo/kat-geçiş
   restoreState'i ETKİLENMEZ. İdempotent: sağlıklı planda NO-OP. */
function planLooksBroken(){
  const p=plan;
  if(!p||!p.regions||!p.unitObjs||!p.inside||!p.cm) return false;
  if(p.villa) return false;                                          // villa: ayrı yerleşim mantığı
  if((p.katKullanim||'konut')!=='konut') return false;               // ticari/otopark/sığınak: hol/çekirdek doğal büyük
  if(p.unitObjs.length<2) return false;                              // tek daire: koridor doğal büyük
  if(typeof villaFloors!=='undefined' && villaFloors) return false;  // kat-ayrı: çok-kat durum, otomatik regen sürpriz olur
  if(typeof blocks!=='undefined' && blocks) return false;            // site: çok-blok durum
  let inside=0; for(let i=0;i<p.inside.length;i++) if(p.inside[i]) inside++;
  if(inside<40) return false;
  const CORE={merdiven:1,yangin:1,asansor:1,teknik:1};
  let corr=0, ghosts=0;
  p.regions.forEach(g=>{
    if(!g) return;
    const n=g.cells?g.cells.length:0;
    if(g.type==='koridor') corr+=n;
    else if(n===0 && g.type!=='isiklik' && !CORE[g.type]) ghosts++;  // hücresiz hayalet oda (piyes yutulmuş)
  });
  /* hol kat alanının >%25'i + 5+ hücresiz oda = piyesler hole yutulmuş (sağlıklı: hol ≤%15, hayalet ≤3) */
  return corr/inside>0.25 && ghosts>=5;
}
function repairImportedPlan(){
  try{
    if(!planLooksBroken()) return false;
    console.warn('[KPTA] İçe aktarılan düzen bozuk görünüyor (hol bağımsız bölüm alanını yutmuş + hücresiz odalar); spec ve ayırıcılardan yeniden üretiliyor.');
    generate(true);          // cut bölünmesini koru, oda dağılımını specten yeniden kur (generate kendi runChecks/render'ını yapar)
    planAutoRepaired=true;   // generate flag'i sıfırladı; onarımdan SONRA işaretle
    runChecks();             // bilgi notunu göstermek için checks'i yeniden topla/render et
    return true;
  }catch(err){ console.error('[KPTA] otomatik onarım başarısız:', err); return false; }
}
