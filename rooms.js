'use strict';
/* ================= antre inceltme =================
   Üretim/onarım sonrası antre yalnız gerektiği kadar yer tutar. Fazla hücre
   şeritleri duvar adımlarıyla (moveWallStep) komşu odalara geri verilir —
   önce mevzuat açığı olan odaya, sonra emici salona. Korumalar: antre bağlantılı
   kalır, hiçbir odanın antre komşuluğu (kapı erişimi) kopmaz, antre ≥3,5 m² ve
   hiçbir yeri 1 m'den ince olmaz, koridor (giriş kapısı) teması korunur.
   Görseldeki hatayı çözer: kör uç kollar ve salona/odaya sokulan çıkıntılar erir. */
function antreAdjSet(u){
  const p=plan, aid=u.antre.id, s=new Set();
  u.rooms.forEach(g=>{ if(g===u.antre||!g.cells.length) return;
    const ok=g.cells.some(i=>{ const r=(i/p.cols)|0,c=i%p.cols;
      return (r>0&&p.cm[i-p.cols]===aid)||(r<p.rows-1&&p.cm[i+p.cols]===aid)
           ||(c>0&&p.cm[i-1]===aid)||(c<p.cols-1&&p.cm[i+1]===aid); });
    if(ok) s.add(g.id); });
  return s;
}
function thinCells(g){ /* 2×2 tam-blok içinde olmayan hücre sayısı (<1 m genişlik) */
  const p=plan, set=new Set(g.cells); let n=0;
  g.cells.forEach(i=>{ const r=(i/p.cols)|0,c=i%p.cols; let ok=false;
    for(let dr=-1;dr<=0&&!ok;dr++)for(let dc=-1;dc<=0&&!ok;dc++){
      const r0=r+dr,c0=c+dc;
      if(r0<0||c0<0||r0+1>=p.rows||c0+1>=p.cols) continue;
      if(set.has(r0*p.cols+c0)&&set.has(r0*p.cols+c0+1)&&set.has((r0+1)*p.cols+c0)&&set.has((r0+1)*p.cols+c0+1)) ok=true; }
    if(!ok) n++; });
  return n;
}
function slimUnitAntre(u){
  const p=plan, an=u.antre;
  if(!an||!an.cells.length) return false;
  const FLOOR=t=>t==='salon'?REG.salon:t==='yatak'?REG.yatak:t==='mutfak'?REG.mutfak:t==='banyo'?REG.banyo:t==='wc'?REG.wc:null;
  const recalc=()=>p.regions.forEach(g=>calcRegionMetrics(g,p.cols,p.minX,p.minY));
  const badCount=()=>runChecks().filter(o=>o.s==='bad').length; // KABUL KAPISI: yeni mevzuat/kapı/cephe ihlali doğmasın
  const mustAdj=antreAdjSet(u);
  recalc();
  let badRef=badCount();
  /* komb (omurga) dairede taban daha yüksek: omurga, orta odaların kapı hattıdır —
     3,5 m²'ye kemirilirse odalar köşe temasıyla 4+ m derinliğe şişer (v21 ince
     ayarında kullanıcı omurgayı ~%13-15'te tuttu) */
  const uArea=u.rooms.reduce((s,g)=>s+areaOfCells(g.cells),0);
  const slimFloor = u.comb? Math.max(6, uArea*0.12) : 3.5;
  let changed=false, guard=0;
  for(;;){
    if(areaOfCells(an.cells)<=slimFloor || guard++>REG.iter.slimAntre) break;
    const runs=computeWallRuns().filter(rn=>{
      const other = rn.a===an.id? rn.b : (rn.b===an.id? rn.a : -1);
      if(other<0) return false;
      const og=p.regions[other];
      return u.rooms.includes(og) && og!==an && og.type!=='antre' && og.name!=='EB. BANYO';
    });
    const rank=t=>t==='salon'?0:t==='yatak'?1:t==='oda'?2:t==='mutfak'?3:t==='banyo'?4:5;
    const sc=rn=>{ const og=p.regions[rn.a===an.id?rn.b:rn.a]; const f=FLOOR(og.type);
      const need=f&&(og.area<f.area||og.minSide<f.side);
      return (need?0:10)+rank(og.type); };
    runs.sort((x,y)=>sc(x)-sc(y));
    let did=false;
    for(const rn of runs){
      const dir = rn.a===an.id? -1 : 1;          // antre donör olacak yön
      const thin0=thinCells(an);
      const res=moveWallStep(rn,dir);
      if(res!==true) continue;                   // birleşme olamaz (canAbsorb antreyi korur)
      /* ucuz ön elemeler */
      const adjNow=antreAdjSet(u);
      let ok = areaOfCells(an.cells)>=slimFloor && thinCells(an)<=thin0;
      if(ok) for(const id2 of mustAdj){ const g2=p.regions[id2];
        if(g2&&g2.cells.length&&!adjNow.has(id2)){ ok=false; break; } }
      /* asıl kapı: runChecks ihlal sayısı artmamalı (kapı yeri, dış cephe,
         biçimsizlik, ince-uzun mutfak... hepsi bu sayede korunur) */
      if(ok){ recalc(); const b=badCount(); if(b>badRef) ok=false; else badRef=b; }
      if(!ok){ moveWallStep(rn,-dir); recalc(); continue; } // geri adım (şerit alıcıdan geri alınır)
      did=true; changed=true; break;
    }
    if(!did) break;
  }
  /* A3 (BRIEF konsolidasyon): guard limiti doldu = antre hedef kalınlığa inemedi (sessiz vazgeçme). */
  if(guard>REG.iter.slimAntre) console.warn(`[KPTA] slimUnitAntre iterasyon limiti (${REG.iter.slimAntre}) — antre ${areaOfCells(an.cells).toFixed(1)} m2 hala kalin`);
  recalc();
  return changed;
}
function slimAntres(){
  if(!plan) return;
  plan.unitObjs.forEach(u=>slimUnitAntre(u));
  plan.wallRuns=computeWallRuns();
}

/* ================= oda ekle / sil (sağ tık) =================
   Üretim sonrası tek dairede oda düzenleme. Silme: oda, aynı dairede en uzun ortak
   duvarlı komşusuna katılır (purgeSlivers mantığı). Ekleme: ev sahibi odadan, antreye
   komşu kenardan dikdörtgen oyulur (carveMissing mantığı); ince ayar duvar sürükleme
   ile yapılır. Her ikisi de editHistory'ye yazar (Geri Al) ve daire spec KOPYASINI
   günceller (runChecks oda programı raporu yanlış alarm vermesin). generate() bu
   girdileri de sıfırlar — duvar düzenlemeleriyle aynı bilinçli karar. */
const ROOM_ADD=[
  {name:'YATAK ODASI',  type:'yatak',  h:5, w:8},  // 2,5 × 4,0 m hedef
  {name:'EB. YATAK ODASI', type:'yatak', h:6, w:8}, // 3,0 × 4,0 m ebeveyn yatak odası (sonra EB. BANYO oyulabilir)
  {name:'EB. BANYO',    type:'banyo',  h:4, w:4, eb:true}, // 2,0 × 2,0 m; yalnız yatak odasından oyulur
  {name:'SALON',        type:'salon',  h:6, w:8},  // 3,0 × 4,0 m ana salon (etiket kurtarma)
  {name:'OTURMA ODASI', type:'salon',  h:6, w:8},  // 3,0 × 4,0 m ikincil oturma odası
  {name:'MUTFAK',       type:'mutfak', h:4, w:6},  // 2,0 × 3,0 m
  {name:'BANYO',        type:'banyo',  h:3, w:4},  // 1,5 × 2,0 m
  {name:'WC',           type:'wc',     h:2, w:3},  // 1,0 × 1,5 m
  {name:'KİLER',        type:'antre',  h:3, w:4}   // 1,5 × 2,0 m
];
function unitOfRoom(id){
  if(!plan) return -1;
  for(let k=0;k<plan.unitObjs.length;k++) if(plan.unitObjs[k].rooms.some(g=>g.id===id)) return k;
  return -1;
}
/* yeni yatak odası (ekle / tipe çevir) PROGRAM talebini büyütmeli mi? (Bug A)
   Üretici istenen yatak odalarını tam yerleştiremediyse (açık var) kullanıcının elle
   eklediği/çevirdiği oda bu AÇIĞI KAPATIR → talep artmaz, mevzuat uyarısı kaybolur.
   Açık yoksa oda gerçekten yenidir → talep büyür (etiket 3+1 → 4+1). checks.js'teki
   wantBeds ile aynı stüdyo (salon=0) düzeltmesini kullanır ki kıyas tutarlı olsun. */
function bedSurplus(u){
  const placed=u.rooms.filter(o=>o.type==='yatak'&&o.cells.length).length;
  const want=(u.spec.salon===0 && !(plan.villa&&floorsOn()))? Math.max(0,u.spec.oda-1) : u.spec.oda;
  return placed>=want;
}
function refreshAfterRoomEdit(){
  hoverWall=null; hoverRoomId=null;
  plan.wallRuns=computeWallRuns();
  runChecks(); buildUnitTable(); render();
}
/* daireyi tümüyle sil → hücreleri en çok sınır paylaşan komşu daireye kat
   (iki daireyi birleştirmenin temiz yolu; oda bazlı korumalarla uğraşmadan).
   Daire nesnesi boş bırakılır (yeniden indeksleme yok); boş daireler tabloda/
   denetimde atlanır. Geri al: bölge anlık görüntüsü odaları diriltir. */
function dissolveUnit(k){
  const p=plan, u=p.unitObjs[k]; if(!u) return false;
  const mine=new Set(); u.rooms.forEach(g=>g.cells.forEach(i=>mine.add(i)));
  if(!mine.size){ return false; }
  const FIX=t=>['merdiven','yangin','asansor','teknik'].includes(t);
  const unitOfReg=v=>{ for(let j=0;j<p.unitObjs.length;j++) if(p.unitObjs[j]!==u && p.unitObjs[j].rooms.some(g=>g.id===v)) return j; return -1; };
  // hedef: en çok sınır paylaşan komşu daire
  const border=new Map();
  mine.forEach(i=>{ const r=(i/p.cols)|0,c=i%p.cols;
    [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc])=>{ if(rr<0||cc<0||rr>=p.rows||cc>=p.cols)return; const j=rr*p.cols+cc;
      if(!p.inside[j]||p.cm[j]<0||mine.has(j))return; const kk=unitOfReg(p.cm[j]);
      if(kk>=0) border.set(kk,(border.get(kk)||0)+1); }); });
  let tgt=-1,bn=0; border.forEach((n,kk)=>{ if(n>bn){bn=n;tgt=kk;} });
  // hangi bölgelere katılabilir? (hedef daire odaları; hedef yoksa koridor)
  const okReg=v=>{ const reg=p.regions[v]; if(FIX(reg.type)) return false;
    return tgt>=0 ? p.unitObjs[tgt].rooms.some(g=>g.id===v) : reg.type==='koridor'; };
  const flood=test=>{ let changed=true,guard=0;
    while(mine.size && changed && guard++<20000){ changed=false; const todo=[];
      mine.forEach(i=>{ const r=(i/p.cols)|0,c=i%p.cols; const cnt=new Map();
        [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc])=>{ if(rr<0||cc<0||rr>=p.rows||cc>=p.cols)return; const j=rr*p.cols+cc;
          if(!p.inside[j]||p.cm[j]<0||mine.has(j))return; if(!test(p.cm[j]))return;
          cnt.set(p.cm[j],(cnt.get(p.cm[j])||0)+1); });
        if(cnt.size){ let best=-1,b2=0; cnt.forEach((n,v)=>{if(n>b2){b2=n;best=v;}}); todo.push([i,best]); } });
      todo.forEach(([i,v])=>{ p.cm[i]=v; p.regions[v].cells.push(i); mine.delete(i); changed=true; }); } };
  flood(okReg);
  if(mine.size) flood(v=>{ const reg=p.regions[v]; return !FIX(reg.type); }); // kalan: çekirdek dışı herhangi komşu (koridor dahil)
  if(mine.size){ const dp=newRegRuntime('ORTAK DEPO','teknik'); mine.forEach(i=>{ p.cm[i]=dp.id; dp.cells.push(i); }); } // izole kalıntı
  u.rooms.forEach(g=>{ g.cells=[]; }); u.antre=null;
  doorOverrides={}; doorHidden={}; windowOverrides={}; windowHidden={}; unitLayout={}; // daire indeks anahtarlı düzenlemeler bayatladı
  p.regions.forEach(g=>calcRegionMetrics(g,p.cols,p.minX,p.minY));
  refreshAfterRoomEdit();
  return true;
}
/* runtime'da yeni bölge (generate dışında; dissolve kalıntısı için) */
function newRegRuntime(name,type){ const g={id:plan.regions.length,name,type,unit:-1,cells:[]}; plan.regions.push(g); return g; }
/* ===== ORTAK / atıl alan düzenleme (Bug C) =====
   ORTAK DEPO (daire silme kalıntısı), sığınak/otopark artığı gibi daireye ait OLMAYAN
   alanlar çekirdekle apartman holü arasına sıkışıp erişimi kapatabiliyor. Bu alanlar artık
   sağ-tık menüsünden HOLÜNE KATILIR (çekirdek erişimi açılır) ya da komşulara dağıtılarak
   SİLİNİR. Çekirdek/koridor bu yoldan yönetilmez (kendi menüleri var). */
function isCommonOrphan(g){
  return !!(g && g.cells.length && (g.unit==null||g.unit<0) && g.type!=='koridor' && !isStructReg(g));
}
/* hücreleri apartman holüne (koridor) kat — hol çekirdeğe ulaşır */
function commonAreaToCorridor(g){
  const p=plan; if(!isCommonOrphan(g)) return false;
  const kor=p.regions.find(o=>o.type==='koridor'&&o.cells.length); if(!kor) return false;
  g.cells.slice().forEach(i=>{ p.cm[i]=kor.id; kor.cells.push(i); });
  g.cells=[];
  calcRegionMetrics(kor,p.cols,p.minX,p.minY); calcRegionMetrics(g,p.cols,p.minX,p.minY);
  return true;
}
/* hücreleri baskın komşu daire/oda/holе dağıtarak alanı sil (çekirdek hariç) */
function dissolveCommonArea(g){
  const p=plan; if(!isCommonOrphan(g)) return false;
  const old=g.cells.slice(); g.cells=[];
  assignCellsToNeighbor(old, g.id);   // structure.js: struct olmayan baskın komşuya devreder
  calcRegionMetrics(g,p.cols,p.minX,p.minY);
  return true;
}
/* odayı sil: hücreleri aynı dairedeki en uzun ortak duvarlı komşuya geçer */
function removeRoom(g){
  const p=plan, k=unitOfRoom(g.id); if(k<0) return false;
  const u=p.unitObjs[k];
  if(g===u.antre||g.type==='merdiven') return false;       // antre/merdiven silinmez
  if(g.type==='salon'&&salonProtected()&&!u.rooms.some(o=>o!==g&&o.type==='salon'&&o.cells.length))
    return false;                                          // TEK salon ölmez (katları ayrı planlanan villada serbest)
  const cnt=new Map();
  g.cells.forEach(i=>{ const r=(i/p.cols)|0,c=i%p.cols;
    [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc])=>{
      if(rr<0||cc<0||rr>=p.rows||cc>=p.cols) return;
      const j=rr*p.cols+cc, v=p.cm[j];
      if(p.inside[j]&&v>=0&&v!==g.id&&u.rooms.includes(p.regions[v])&&p.regions[v].type!=='merdiven')
        cnt.set(v,(cnt.get(v)||0)+1); }); });
  let best=-1,bn=0; cnt.forEach((n,v)=>{ if(n>bn){bn=n;best=v;} });
  if(best<0) return false;                                 // daire içi komşusu yok
  const tgt=p.regions[best];
  pushEdit({type:'room', op:'remove', unit:k, reg:g, tgt:best,
    cells:g.cells.slice(), roomsIdx:u.rooms.indexOf(g), spec:u.spec});
  g.cells.forEach(i=>{ p.cm[i]=best; tgt.cells.push(i); });
  g.cells=[];
  u.rooms=u.rooms.filter(o=>o!==g);
  /* spec kopyası: program raporu yeni duruma göre denetlesin */
  const s={...u.spec};
  if(g.type==='yatak') s.oda=Math.max(0,s.oda-1);
  else if(g.type==='salon') s.salon=Math.max(0,s.salon-1);
  else if(g.type==='mutfak') s.acik=true;                  // mutfak salona katıldı → açık mutfak
  else if(g.name==='EB. BANYO'){ if(!u.rooms.some(o=>o!==g&&o.name==='EB. BANYO'&&o.cells.length)) s.ensuite=false; } // başka EB. BANYO kalmadıysa söz düşer
  u.spec=s;
  calcRegionMetrics(tgt, p.cols, p.minX, p.minY);
  calcRegionMetrics(g, p.cols, p.minX, p.minY);
  refreshAfterRoomEdit();
  return true;
}
/* salonu açık mutfağa dönüştür: dairenin ayrı MUTFAK'ı salona katılır, salon
   'SALON + MUTFAK' olur, spec.acik=true (denetim ve kaydet/yükle tutarlı kalır —
   restoreState açık mutfağı bu addan tanır). Mutfak salona komşu değilse katma
   kopuk bölge yaratacağından reddedilir. Geri Al: removeRoom ile aynı 'room' yolu
   + tgtName ile salon adı da geri döner. */
function openKitchen(salon){
  const p=plan, k=unitOfRoom(salon.id); if(k<0||salon.type!=='salon') return false;
  const u=p.unitObjs[k];
  const mut=u.rooms.find(o=>o.type==='mutfak'&&o.cells.length);
  if(!mut) return 'nomut';
  const adj=mut.cells.some(i=>{ const r=(i/p.cols)|0, c=i%p.cols;
    return (r>0&&p.cm[i-p.cols]===salon.id)||(r<p.rows-1&&p.cm[i+p.cols]===salon.id)
         ||(c>0&&p.cm[i-1]===salon.id)||(c<p.cols-1&&p.cm[i+1]===salon.id); });
  if(!adj) return 'noadj';
  pushEdit({type:'room', op:'remove', unit:k, reg:mut, tgt:salon.id,
    cells:mut.cells.slice(), roomsIdx:u.rooms.indexOf(mut), spec:u.spec, tgtName:salon.name});
  mut.cells.forEach(i=>{ p.cm[i]=salon.id; salon.cells.push(i); });
  mut.cells=[];
  u.rooms=u.rooms.filter(o=>o!==mut);
  u.spec={...u.spec, acik:true};
  salon.name='SALON + MUTFAK';
  calcRegionMetrics(salon, p.cols, p.minX, p.minY);
  calcRegionMetrics(mut, p.cols, p.minX, p.minY);
  refreshAfterRoomEdit();
  return true;
}
/* oda ekle: ev sahibi odadan, antreye komşu tohum hücreden başlayan pencere oyulur */
function addRoom(host, def, hint){
  const p=plan, k=unitOfRoom(host.id); if(k<0) return false;
  const u=p.unitObjs[k];
  if(host.type==='merdiven') return false;
  if(def.eb&&host.type!=='yatak') return false;            // eb. banyo yalnız yatak odasından oyulur
  if(def.eb&&u.rooms.some(o=>o.name==='EB. BANYO'&&o.cells.length&&o.ebHost===host.id)) return false; // bir yatak odasında tek EB. BANYO (ebHost ile bağlı; FARKLI odalarda birden çok olabilir)
  /* tohum: antreye komşu host hücresi (kapı verilebilsin); eb. banyo köşeden oyulur.
     hint (sağ tık hücresi) verilirse adaylar içinden ona en yakını seçilir —
     kullanıcı odanın hangi kenara dayanacağını tık konumuyla belirler. */
  const aid=(u.antre&&host!==u.antre&&!def.eb)? u.antre.id : -99;
  const adjA=i=>{ const r=(i/p.cols)|0,c=i%p.cols;
    return (r>0&&p.cm[i-p.cols]===aid)||(r<p.rows-1&&p.cm[i+p.cols]===aid)
         ||(c>0&&p.cm[i-1]===aid)||(c<p.cols-1&&p.cm[i+1]===aid); };
  /* YENİ ANTRE: tohum koridora (apartman holü) komşu hücrelerden — giriş kapısı oradan
     gelir; alttan/cepheden eklenen antre pencereyi yiyordu (vaka-3 D3 dersi) */
  const newAntre = def.type==='antre' && (!u.antre || !u.antre.cells.length);
  const isCorAdj=i=>{ const r=(i/p.cols)|0,c=i%p.cols;
    const ok=j=>j>=0&&j<p.rows*p.cols&&p.cm[j]>=0&&p.regions[p.cm[j]].type==='koridor';
    return (r>0&&ok(i-p.cols))||(r<p.rows-1&&ok(i+p.cols))||(c>0&&ok(i-1))||(c<p.cols-1&&ok(i+1)); };
  const isExtC=i=>{ const r=(i/p.cols)|0,c=i%p.cols;
    return r===0||r===p.rows-1||c===0||c===p.cols-1
      ||!p.inside[i-p.cols]||!p.inside[i+p.cols]||!p.inside[i-1]||!p.inside[i+1]; };
  const seeds = newAntre? host.cells.filter(isCorAdj) : host.cells.filter(adjA);
  const pool=seeds.length?seeds:host.cells;
  let seed;
  if(hint!=null){
    const hr=(hint/p.cols)|0, hc=hint%p.cols; let bd=1e9; seed=pool[0];
    pool.forEach(i=>{ const r=(i/p.cols)|0,c=i%p.cols, d=Math.abs(r-hr)+Math.abs(c-hc);
      if(d<bd){ bd=d; seed=i; } });
  } else seed=pool.slice().sort((a,b)=>a-b)[0];
  let r0=1e9,r1=-1e9,c0=1e9,c1=-1e9;
  host.cells.forEach(i=>{const r=(i/p.cols)|0,c=i%p.cols;
    r0=Math.min(r0,r);r1=Math.max(r1,r);c0=Math.min(c0,c);c1=Math.max(c1,c);});
  const sr=(seed/p.cols)|0, sc=seed%p.cols;
  /* pencere tohumdan başlar, host bbox'ına kıstırılır; sığmazsa küçülür */
  let h=def.h, w=def.w, take=null, keep=null;
  const windowAt=(wr,wc,hh,ww)=>{ const tk=[],kp=[];
    host.cells.forEach(i=>{ const r=(i/p.cols)|0,c=i%p.cols;
      (r>=wr&&r<wr+hh&&c>=wc&&c<wc+ww? tk:kp).push(i); });
    return [tk,kp]; };
  for(let t=0;t<12;t++){
    if(hint!=null){
      /* tohumu içeren tüm pencere konumları denenir; en çok hücre kapsayan kazanır
         (eşitlikte tohum pencere ortasına yakın) — kenar/köşe tohumlarında sliver önler */
      let bs=-1;
      for(let dr=0;dr<h;dr++) for(let dc=0;dc<w;dc++){
        const wr=Math.max(r0,Math.min(sr-dr,r1-h+1)), wc=Math.max(c0,Math.min(sc-dc,c1-w+1));
        const [tk,kp]=windowAt(wr,wc,h,w);
        let score=tk.length*1000 - Math.abs(dr-(h-1)/2) - Math.abs(dc-(w-1)/2);
        /* yeni antre koridora yapışsın, cepheden uzak dursun (pencere odalara kalsın) */
        if(newAntre) tk.forEach(i=>{ if(isCorAdj(i)) score+=300; if(isExtC(i)) score-=120; });
        if(score>bs){ bs=score; take=tk; keep=kp; } }
    } else {
      const wr=Math.max(r0, Math.min(sr, r1-h+1)), wc=Math.max(c0, Math.min(sc, c1-w+1));
      [take,keep]=windowAt(wr,wc,h,w);
    }
    if(keep.length>=12||(h<=2&&w<=2)) break;               // ev sahibine ≥3 m² kalsın
    if(w>=h&&w>2) w--; else if(h>2) h--;
  }
  if(take.length<4||keep.length<12) return false;          // yeni oda ≥1 m² olmalı
  const oldCells=host.cells;
  host.cells=keep;
  if(!regConnected(host)){ host.cells=oldCells; return false; } // ev sahibi ikiye bölünemez
  const growBed = def.type==='yatak' && bedSurplus(u); // ng eklenmeden ÖNCE: açık varsa talep büyümez (Bug A)
  const ng={id:p.regions.length, name:def.name, type:def.type, unit:k, cells:take};
  p.regions.push(ng);
  take.forEach(i=>p.cm[i]=ng.id);
  u.rooms.splice(u.rooms.indexOf(host)+1, 0, ng);
  pushEdit({type:'room', op:'add', unit:k, reg:ng, host:host.id,
    cells:take.slice(), spec:u.spec, hostName:host.name});
  const s={...u.spec};
  if(def.type==='yatak'){ if(growBed) s.oda+=1; }
  else if(def.type==='salon') s.salon+=1;
  else if(def.type==='mutfak') s.acik=false;               // artık ayrı mutfak var
  else if(def.eb){ s.ensuite=true; host.name='EB. YATAK ODASI'; ng.ebHost=host.id; } // denetim/kapı eb. yatağa ID ile bağlanır
  if(def.type==='antre'&&def.name==='ANTRE'&&!u.antre) u.antre=ng; // antresiz daireye antre eklendi
  u.spec=s;
  calcRegionMetrics(host, p.cols, p.minX, p.minY);
  calcRegionMetrics(ng, p.cols, p.minX, p.minY);
  refreshAfterRoomEdit();
  return true;
}
/* ================= serbest oda çizimi (roomdraw modu) =================
   Kullanıcı kapalı bir poligon çizer; içindeki hücreler rasterize edilip yeni nötr
   "ODA" olur. Context-menü dikdörtgen-oyma kısıtlarını (≥3 m² host, tek dikdörtgen)
   BAYPAS eder — "alan yeterli değil" çıkmazına kaçış kapısı. KAPSAM (kullanıcı kararı:
   tek daire içi): yalnız poligonun en çok üstünde olduğu BASKIN dairenin odalarından +
   boş/artık iç hücrelerden alır; çekirdek (merdiven/asansör/şaft/yangın), apartman holü
   (koridor) ve DİĞER daireler korunur. Mecburi piyes (tek/korumalı salon, antre) tümüyle
   yutulamaz. Geri al: cut/structedit gibi TAM-durum anlık görüntüsüyle (çoklu-donör carve,
   tek-host undo varsayımını baypas eder). */
function largestComponent(cells){
  const p=plan, set=new Set(cells), seen=new Set(); let best=[];
  for(const s of cells){ if(seen.has(s)) continue;
    const comp=[], stk=[s]; seen.add(s);
    while(stk.length){ const i=stk.pop(); comp.push(i); const r=(i/p.cols)|0,c=i%p.cols;
      [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc])=>{ if(rr<0||cc<0||rr>=p.rows||cc>=p.cols) return;
        const j=rr*p.cols+cc; if(set.has(j)&&!seen.has(j)){ seen.add(j); stk.push(j); } }); }
    if(comp.length>best.length) best=comp; }
  return best;
}
function addRoomFromPolygon(poly){
  if(!plan||!poly||poly.length<3) return {ok:false, reason:'small'};
  const p=plan, CORE=t=>t==='merdiven'||t==='yangin'||t==='asansor'||t==='teknik';
  /* 1) rasterize: footprint içi, merkezi poligonda olan hücreler */
  const cand=[];
  for(let r=0;r<p.rows;r++)for(let c=0;c<p.cols;c++){
    const i=r*p.cols+c; if(!p.inside[i]) continue;
    if(pip(p.minX+(c+0.5)*M, p.minY+(r+0.5)*M, poly)) cand.push(i); }
  if(cand.length<4) return {ok:false, reason:'small'};   // <1 m²
  /* 2) baskın daire: poligonun en çok hücresini kapsadığı daire */
  const tally=new Map();
  cand.forEach(i=>{ const v=p.cm[i]; if(v<0||CORE(p.regions[v].type)) return;
    const k=unitOfRoom(v); if(k>=0) tally.set(k,(tally.get(k)||0)+1); });
  let domK=-1, bestN=-1; tally.forEach((n,k)=>{ if(n>bestN){ bestN=n; domK=k; } });
  if(domK<0) return {ok:false, reason:'nounit'};         // yalnız hol/çekirdek/boş üstünde
  const u=p.unitObjs[domK], myRegs=new Set(u.rooms.map(g=>g.id));
  /* 3) kapsam: yalnız bu dairenin odaları + boş iç hücreler (çekirdek/hol/diğer daire hariç) */
  let take=cand.filter(i=>{ const v=p.cm[i];
    if(v<0) return true;                                 // boş iç hücre serbest
    if(CORE(p.regions[v].type)) return false;
    return myRegs.has(v); });
  if(take.length<4) return {ok:false, reason:'small'};
  /* 4) tek parça: poligon ince boyunluysa bile yeni oda 4-bağlı kalsın */
  take=largestComponent(take);
  if(take.length<4) return {ok:false, reason:'small'};
  /* 4b) mecburi piyes koruması: tek/korumalı salon ya da antre tümüyle yutulamaz (≥1 m² kalsın) */
  const takeSet=new Set(take), survives=g=> g && g.cells.filter(i=>!takeSet.has(i)).length>=4;
  const salon=u.rooms.find(o=>o.type==='salon'&&o.cells.length);
  if(salon && salonProtected() && !u.rooms.some(o=>o!==salon&&o.type==='salon'&&o.cells.length) && !survives(salon))
    return {ok:false, reason:'salon'};
  if(u.antre&&u.antre.cells.length&&!survives(u.antre)) return {ok:false, reason:'salon'};
  /* 5) geri-al için tam durum (mutasyondan ÖNCE) */
  const snap=stateSnapshot(false);
  /* 6) talep et: donörlerden çıkar, yeni ODA kur */
  const donors=new Set(); take.forEach(i=>{ const v=p.cm[i]; if(v>=0) donors.add(v); });
  const ng={id:p.regions.length, name:'ODA', type:'oda', unit:domK, cells:take.slice()};
  p.regions.push(ng);
  take.forEach(i=>p.cm[i]=ng.id);
  donors.forEach(v=>{ const g=p.regions[v]; g.cells=g.cells.filter(i=>!takeSet.has(i)); });
  u.rooms.push(ng);
  u.rooms=u.rooms.filter(g=> g===ng || g.cells.length);  // boşalan donörler düşer
  if(u.antre && !u.antre.cells.length) u.antre=null;
  /* 7) kopuk donör onar + tüm metrikler */
  healDisconnected();
  p.regions.forEach(g=>calcRegionMetrics(g, p.cols, p.minX, p.minY));
  /* 8) geçmiş (tam durum) + yenile */
  pushEdit({type:'roomdraw', state:snap});
  refreshAfterRoomEdit();
  return {ok:true};
}
/* ================= oda etiketi / takas / bölme / antre uzatma =================
   Etiket: oda tipi değiştirilebilir (spec kopyası güncellenir, denetim doğru kalır)
   ya da iki odanın etiketi takas edilir (program değişmez, yalnız adlar yer değiştirir).
   Bölme: oda ortadan nötr "ODA" tipiyle ikiye ayrılır; kullanıcı duvarı sürükleyip
   "Tipini değiştir" ile adlandırır — duvar birleşip kaybolduğunda geri getirme yolu.
   Uzatma: antre, hedef odaya Dijkstra ile en ucuz yoldan 1 m'lik korıdorla bağlanır. */
const RETYPE=[
  {name:'YATAK ODASI',  type:'yatak'},
  {name:'EB. YATAK ODASI', type:'yatak'},
  {name:'SALON',        type:'salon'},
  {name:'OTURMA ODASI', type:'salon'},
  {name:'MUTFAK',       type:'mutfak'},
  {name:'BANYO',        type:'banyo'},
  {name:'WC',           type:'wc'},
  {name:'ÇALIŞMA ODASI',type:'oda'},
  {name:'KİLER',        type:'antre'}
];
function retypeGuard(g,u){ /* tip değişimi/takas yasağı: antre, merdiven, EB ikilisi, tek salon */
  if(g===u.antre||g.type==='merdiven'||g.name==='EB. BANYO') return 'Bu odanın tipi değiştirilemez.';
  /* EB. BANYO'su olan yatak odası tipsizleşemez (banyo öksüz kalır) — id ile bağlı;
     eski kayıtlarda (ebHost yok) ada düşülür */
  if(u.rooms.some(o=>o.name==='EB. BANYO'&&o.cells.length&&(o.ebHost===g.id||(o.ebHost==null&&g.name==='EB. YATAK ODASI'))))
    return 'Önce bu odaya bağlı EB. BANYO silinmeli.';
  return null;
}
function retypeRoom(g, def){
  const p=plan, k=unitOfRoom(g.id); if(k<0) return false;
  const u=p.unitObjs[k];
  if(retypeGuard(g,u)) return false;
  if(g.type==='salon'&&def.type!=='salon'&&salonProtected()&&!u.rooms.some(o=>o!==g&&o.type==='salon'&&o.cells.length))
    return false;                                          // TEK salon tipsizleşemez (katları ayrı planlanan villada serbest)
  pushEdit({type:'retype', reg:g, name:g.name, rtype:g.type, unit:k, spec:u.spec});
  const s={...u.spec};
  const growBed = def.type==='yatak' && g.type!=='yatak' && bedSurplus(u); // başka tip → yatak: açık varsa talep büyümez (Bug A)
  if(g.type==='yatak') s.oda=Math.max(0,s.oda-1);
  else if(g.type==='salon') s.salon=Math.max(0,s.salon-1);
  else if(g.type==='mutfak') s.acik=true;
  if(def.type==='yatak'){ if(g.type==='yatak'||growBed) s.oda+=1; } // yatak→yatak (örn. EB. YATAK ODASI) net-0; başka→yatak açık yoksa büyümez
  else if(def.type==='salon') s.salon+=1;
  else if(def.type==='mutfak') s.acik=false;
  u.spec=s;
  g.name=def.name; g.type=def.type;
  refreshAfterRoomEdit();
  return true;
}
function swapRooms(g1,g2){
  const k=unitOfRoom(g1.id);
  if(k<0||k!==unitOfRoom(g2.id)) return false;             // yalnız aynı daire içinde
  const u=plan.unitObjs[k];
  if(retypeGuard(g1,u)||retypeGuard(g2,u)) return false;
  pushEdit({type:'swap', a:g1.id, b:g2.id});
  const n=g1.name,t=g1.type; g1.name=g2.name; g1.type=g2.type; g2.name=n; g2.type=t;
  refreshAfterRoomEdit();
  return true;
}
/* DAİRE TAKASI (#41): bir dairenin hole bakan tarafını (N/S/E/W) ayak izi merkezini
   koridor bölgesine göre kıyaslayarak bul — yatay/dikey koridorda da doğru, elle koridor
   düzenlemesinden sonra da güncel (depolanan side'a güvenmez). */
function unitSideOf(cells){
  const p=plan; if(!cells.length) return 'S';
  let sr=0,sc=0; cells.forEach(i=>{ sr+=(i/p.cols)|0; sc+=i%p.cols; });
  const mr=sr/cells.length, mc=sc/cells.length;
  const kor=p.regions.find(g=>g.type==='koridor'&&g.cells.length);
  if(kor){ let r0=1e9,r1=-1e9,c0=1e9,c1=-1e9,kr=0,kc=0;
    kor.cells.forEach(i=>{ const r=(i/p.cols)|0,c=i%p.cols; kr+=r;kc+=c;
      if(r<r0)r0=r;if(r>r1)r1=r;if(c<c0)c0=c;if(c>c1)c1=c; });
    kr/=kor.cells.length; kc/=kor.cells.length;
    if((c1-c0)<(r1-r0)) return mc<kc?'W':'E';   // dikey koridor → sol/sağ
    return mr<kr?'N':'S';                        // yatay koridor → üst/alt
  }
  return mr < (p.corridorR0||0) ? 'N' : 'S';
}
/* DAİRE TAKASI: iki dairenin programını (spec) yer değiştirir; her birinin MEVCUT ayak
   izini takaslanmış spec ile YERİNDE yeniden döşer (plan.relayoutFootprint — tam generate
   YOK → diğer daireler/koridor bozulmaz). Geri al: tam durum anlık görüntüsü (ulayout gibi). */
function swapUnits(kA,kB){
  const p=plan; if(!p||kA===kB||!p.relayoutFootprint) return false;
  const A=p.unitObjs[kA], B=p.unitObjs[kB];
  if(!A||!B||!A.rooms.some(g=>g.cells.length)||!B.rooms.some(g=>g.cells.length)) return false;
  const state=stateSnapshot();                          // DEĞİŞİKLİKTEN ÖNCE tam durum (geri al)
  const cellsA=[],cellsB=[];
  A.rooms.forEach(g=>g.cells.forEach(i=>cellsA.push(i)));
  B.rooms.forEach(g=>g.cells.forEach(i=>cellsB.push(i)));
  if(!cellsA.length||!cellsB.length) return false;
  const specA={...A.spec}, specB={...B.spec};
  const sideA=unitSideOf(cellsA), sideB=unitSideOf(cellsB);
  A.rooms.forEach(g=>g.cells=[]); B.rooms.forEach(g=>g.cells=[]); // eski odaları boşalt (relayout cm'yi tazeler)
  p.unitObjs[kA]=p.relayoutFootprint(cellsA, specB, sideA, kA);
  p.unitObjs[kB]=p.relayoutFootprint(cellsB, specA, sideB, kB);
  healDisconnected();   // relayout leftover-dökümü kopuk bölge bırakmasın (takas sonrası düzenlenebilir kalsın)
  pushEdit({type:'unitswap', state});
  hoverWall=null; hoverRoomId=null;
  p.wallRuns=computeWallRuns(); runChecks(); buildUnitTable(); render();
  return true;
}
/* ===== APARTMAN HOLÜ manuel düzenleme (#41) =====
   Holün band-bilgisi (bbox + yön). Genişlet/daralt zaten daire-koridor duvarı mavi
   tutamaçlarıyla yapılır; buradaki ekler UZATMA (uç boyunca) + çekirdeğe ulaştırmadır. */
function corridorBandInfo(){
  const p=plan; if(!p) return null;
  const kor=p.regions.find(g=>g.type==='koridor'&&g.cells.length); if(!kor) return null;
  let r0=1e9,r1=-1e9,c0=1e9,c1=-1e9;
  kor.cells.forEach(i=>{const r=(i/p.cols)|0,c=i%p.cols; if(r<r0)r0=r;if(r>r1)r1=r;if(c<c0)c0=c;if(c>c1)c1=c;});
  return {kor,r0,r1,c0,c1,horiz:(c1-c0)>=(r1-r0)};
}
function corridorCoresUnreached(){
  const p=plan;
  return p.regions.filter(g=>(g.type==='merdiven'||g.type==='asansor'||g.type==='yangin')&&g.cells.length)
    .filter(g=>!g.cells.some(i=>{const r=(i/p.cols)|0,c=i%p.cols;
      return [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].some(([rr,cc])=>{ if(rr<0||cc<0||rr>=p.rows||cc>=p.cols)return false;
        const j=rr*p.cols+cc; return p.inside[j]&&p.cm[j]>=0&&p.regions[p.cm[j]].type==='koridor'; }); }));
}
/* holü bir ucundan band-yüksekliğince 1 hücre uzat (cell-transfer). Uçtaki sütun/satırda
   koridora KOMŞU + boş/daire-odası hücreler koridora aktarılır; donör oda kopar/biter ya
   da çekirdeğe (sabit) dayanırsa iptal (→ çekirdeğe bitişik kalınır). */
function corridorExtendStep(dir){
  const p=plan, b=corridorBandInfo(); if(!b) return false;
  const FIXED=t=>t==='merdiven'||t==='yangin'||t==='asansor'||t==='teknik';
  const isKor=j=>j>=0&&j<p.rows*p.cols&&p.inside[j]&&p.cm[j]===b.kor.id;
  const cand=[];
  if(b.horiz){ const c=dir>0?b.c1+1:b.c0-1; if(c<0||c>=p.cols) return false;
    for(let r=b.r0;r<=b.r1;r++) cand.push(r*p.cols+c); }
  else { const r=dir>0?b.r1+1:b.r0-1; if(r<0||r>=p.rows) return false;
    for(let c=b.c0;c<=b.c1;c++) cand.push(r*p.cols+c); }
  const strip=[];
  for(const i of cand){ if(!p.inside[i]||p.cm[i]===b.kor.id) continue;
    const cmi=p.cm[i]; if(cmi>=0&&FIXED(p.regions[cmi].type)) return false;   // çekirdeğe dayandı
    const r=(i/p.cols)|0,c=i%p.cols;
    const adj=[[r-1,c],[r+1,c],[r,c-1],[r,c+1]].some(([rr,cc])=>isKor(rr*p.cols+cc));
    if(adj) strip.push(i);
  }
  if(!strip.length) return false;
  const donors=new Map();
  strip.forEach(i=>{ const cmi=p.cm[i]; if(cmi<0||cmi===b.kor.id) return;
    if(!donors.has(cmi)) donors.set(cmi,[]); donors.get(cmi).push(i); });
  for(const [rid,cells] of donors){ const g=p.regions[rid];
    const rm=new Set(cells), rest=g.cells.filter(i=>!rm.has(i));
    if(rest.length<4) return false;                                          // donör tükenecek → iptal
    const set=new Set(rest), seen=new Set([rest[0]]), st=[rest[0]];
    while(st.length){ const i=st.pop(),r=(i/p.cols)|0,c=i%p.cols;
      [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc])=>{ if(rr<0||cc<0||rr>=p.rows||cc>=p.cols)return;
        const j=rr*p.cols+cc; if(set.has(j)&&!seen.has(j)){seen.add(j);st.push(j);} }); }
    if(seen.size!==rest.length) return false;                                // donör kopacak → iptal
  }
  donors.forEach((cells,rid)=>{ const g=p.regions[rid]; const rm=new Set(cells); g.cells=g.cells.filter(i=>!rm.has(i)); });
  strip.forEach(i=>{ p.cm[i]=b.kor.id; b.kor.cells.push(i); });
  return true;
}
/* tek hücreyi koridora al (donör koruması: donör boş/çekirdek değilse kalanı bağlantılı +
   ≥4 hücre olmalı; antre/tek-salon korunur). Başarısızsa false. */
function claimCellForCorridor(j, kor){
  const p=plan, FIXED=t=>t==='merdiven'||t==='yangin'||t==='asansor'||t==='teknik';
  if(!p.inside[j]||p.cm[j]===kor.id) return false;
  const cmi=p.cm[j];
  if(cmi<0){ p.cm[j]=kor.id; kor.cells.push(j); return true; }   // boş
  const g=p.regions[cmi]; if(FIXED(g.type)||g.type==='koridor') return false;
  if(!canAbsorb(g) && g.cells.length-1<4) return false;          // tek salon/antre + son hücreler
  const rest=g.cells.filter(i=>i!==j);
  if(rest.length<4) return false;
  const set=new Set(rest), seen=new Set([rest[0]]), st=[rest[0]];
  while(st.length){ const i=st.pop(),r=(i/p.cols)|0,c=i%p.cols;
    [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc])=>{ if(rr<0||cc<0||rr>=p.rows||cc>=p.cols)return;
      const k2=rr*p.cols+cc; if(set.has(k2)&&!seen.has(k2)){seen.add(k2);st.push(k2);} }); }
  if(seen.size!==rest.length) return false;                       // donör kopacak
  g.cells=rest; p.cm[j]=kor.id; kor.cells.push(j); return true;
}
/* Holü çekirdeğe uzat: ulaşılamayan her çekirdeğe doğru, koridor SINIRINDAN en yakın
   claim-edilebilir hücreyi adım adım koridora katarak bir KOL büyütür (hem band-ekseni
   hem dik/L durumda çalışır; donör daireler bağlantılı/≥min kalır). Tam durum geri-al. */
function extendCorridorToCores(){
  const p=plan; const kor=p.regions.find(g=>g.type==='koridor'&&g.cells.length); if(!kor) return false;
  const FIXED=t=>t==='merdiven'||t==='yangin'||t==='asansor'||t==='teknik';
  const state=stateSnapshot(); let moved=false, guard=0;
  while(guard++<1500){
    const un=corridorCoresUnreached(); if(!un.length) break;
    const core=un[0];
    let cc0=1e9,cc1=-1e9,cr0=1e9,cr1=-1e9;
    core.cells.forEach(i=>{const r=(i/p.cols)|0,c=i%p.cols; if(c<cc0)cc0=c;if(c>cc1)cc1=c;if(r<cr0)cr0=r;if(r>cr1)cr1=r;});
    // koridor sınırındaki aday hücreler, çekirdeğe Manhattan uzaklığına göre artan
    const seen=new Set(), cands=[];
    kor.cells.forEach(i=>{ const r=(i/p.cols)|0,c=i%p.cols;
      [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc])=>{ if(rr<0||cc<0||rr>=p.rows||cc>=p.cols)return;
        const k2=rr*p.cols+cc; if(seen.has(k2))return; seen.add(k2);
        if(!p.inside[k2]||p.cm[k2]===kor.id) return;
        const m=p.cm[k2]; if(m>=0&&FIXED(p.regions[m].type)) return;
        const d=Math.max(0,cr0-rr,rr-cr1)+Math.max(0,cc0-cc,cc-cc1);
        cands.push({k:k2,d}); }); });
    cands.sort((a,b)=>a.d-b.d);
    let did=false;
    for(const cand of cands){ if(claimCellForCorridor(cand.k, kor)){ did=true; moved=true; break; } }
    if(!did) break;                       // hiçbir frontier hücresi alınamadı → dur
  }
  if(moved){ pushEdit({type:'unitswap', state});
    p.regions.forEach(g=>calcRegionMetrics(g,p.cols,p.minX,p.minY));
    hoverWall=null; p.wallRuns=computeWallRuns(); runChecks(); buildUnitTable(); render(); }
  return moved;
}
/* odayı ortadan böl: horiz=true yatay duvar (satırlar ayrılır), false dikey duvar.
   Yeni parça nötr "ODA" doğar; ince ayar duvar sürükleme, adlandırma Tipini değiştir. */
function splitRoom(g, horiz){
  const p=plan, k=unitOfRoom(g.id); if(k<0) return false;
  const u=p.unitObjs[k];
  if(g.type==='merdiven'||g===u.antre) return false;
  let r0=1e9,r1=-1e9,c0=1e9,c1=-1e9;
  g.cells.forEach(i=>{const r=(i/p.cols)|0,c=i%p.cols; r0=Math.min(r0,r);r1=Math.max(r1,r);c0=Math.min(c0,c);c1=Math.max(c1,c);});
  const span=horiz? r1-r0+1 : c1-c0+1;
  if(span<4) return false;                                 // iki yarıya da ≥1 m kalmalı
  const mid=(horiz?r0:c0)+(span>>1);
  const take=[], keep=[];
  g.cells.forEach(i=>{ const v=horiz?(i/p.cols)|0:i%p.cols; (v>=mid?take:keep).push(i); });
  if(take.length<4||keep.length<4) return false;
  const old=g.cells;
  g.cells=keep;
  if(!regConnected(g)){ g.cells=old; return false; }
  const ng={id:p.regions.length, name:'ODA', type:'oda', unit:k, cells:take};
  p.regions.push(ng); take.forEach(i=>p.cm[i]=ng.id);
  if(!regConnected(ng)){ p.regions.pop(); take.forEach(i=>p.cm[i]=g.id); g.cells=old; return false; }
  u.rooms.splice(u.rooms.indexOf(g)+1, 0, ng);
  pushEdit({type:'room', op:'add', unit:k, reg:ng, host:g.id,
    cells:take.slice(), spec:u.spec, hostName:g.name});    // addRoom ile aynı geri alma yolu
  calcRegionMetrics(g, p.cols, p.minX, p.minY);
  calcRegionMetrics(ng, p.cols, p.minX, p.minY);
  refreshAfterRoomEdit();
  return true;
}
/* antreyi hedef odaya bağla: daire hücreleri üzerinde Dijkstra (ıslak hacimden
   geçiş pahalı), yol 1 m'ye genişletilir, hücreler antreye aktarılır.
   Donör odalar bağlantılı ve ≥1 m² kalmazsa işlem geri alınır. */
function extendAntreTo(g){
  const p=plan, k=unitOfRoom(g.id); if(k<0) return false;
  const u=p.unitObjs[k], an=u.antre;
  if(!an||!an.cells.length||g===an) return false;
  const aid=an.id;
  const adj=g.cells.some(i=>{ const r=(i/p.cols)|0,c=i%p.cols;
    return (r>0&&p.cm[i-p.cols]===aid)||(r<p.rows-1&&p.cm[i+p.cols]===aid)
         ||(c>0&&p.cm[i-1]===aid)||(c<p.cols-1&&p.cm[i+1]===aid); });
  if(adj) return 'already';
  const inUnit=new Map();
  u.rooms.forEach(o=>{ if(o.type==='merdiven'||o.name==='EB. BANYO') return;
    o.cells.forEach(i=>inUnit.set(i,o)); });
  const costOf=o=> (o===an||o===g)?0 : (o.type==='salon'||o.type==='yatak'||o.type==='oda')?1 : 4;
  const dist=new Map(), prev=new Map(); let pq=[];
  an.cells.forEach(i=>{ dist.set(i,0); pq.push([0,i]); });
  let goal=-1, guard=0;
  while(pq.length&&guard++<20000){
    pq.sort((x,y)=>x[0]-y[0]); const [d,i]=pq.shift();
    if(d>(dist.has(i)?dist.get(i):1e9)) continue;
    if(inUnit.get(i)===g){ goal=i; break; }
    const r=(i/p.cols)|0,c=i%p.cols;
    [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc])=>{
      if(rr<0||cc<0||rr>=p.rows||cc>=p.cols) return;
      const j=rr*p.cols+cc, o=inUnit.get(j); if(!o) return;
      const nd=d+costOf(o);
      if(nd<(dist.has(j)?dist.get(j):1e9)){ dist.set(j,nd); prev.set(j,i); pq.push([nd,j]); } });
  }
  if(goal<0) return false;
  const path=[]; let cur=goal;
  while(cur!==undefined && inUnit.get(cur)!==an){
    if(inUnit.get(cur)!==g) path.push(cur);
    cur=prev.get(cur); }
  if(!path.length) return false;
  const takeSet=new Set(path);
  path.forEach(i=>{ const r=(i/p.cols)|0,c=i%p.cols;       // 0,5 m yol → 1 m koridor
    for(const [rr,cc] of [[r,c+1],[r+1,c],[r,c-1],[r-1,c]]){
      if(rr<0||cc<0||rr>=p.rows||cc>=p.cols) continue;
      const j=rr*p.cols+cc, o=inUnit.get(j);
      if(!o||o===an||o===g||takeSet.has(j)) continue;
      takeSet.add(j); break; } });
  const snap=snapshotRegions();
  const donors=new Set();
  takeSet.forEach(i=>{ const o=p.regions[p.cm[i]]; if(o===an) return; donors.add(o);
    o.cells=o.cells.filter(j=>j!==i); p.cm[i]=aid; an.cells.push(i); });
  let ok=regConnected(an);
  donors.forEach(o=>{ if(o.cells.length<4||!regConnected(o)) ok=false; });
  if(!ok){ restoreRegions(snap); return false; }
  pushEdit({type:'wallsnap', snap});
  p.regions.forEach(g2=>calcRegionMetrics(g2,p.cols,p.minX,p.minY));
  refreshAfterRoomEdit();
  return true;
}
/* --- menü --- */
const roomMenu=document.getElementById('roomMenu');
function hideRoomMenu(){ roomMenu.style.display='none'; }
svg.addEventListener('contextmenu',e=>{
  e.preventDefault(); hideRoomMenu();
  /* E3(a): HANGİ MODDA olursa olsun bir balkona sağ tık → silme. Balkon modunda doğrudan siler
     (eski davranış); DİĞER modlarda küçük "Balkonu sil" menüsü açar (avlu deseni). Kök neden:
     balkon silme eskiden yalnız mode==='balkon' dalındaydı → balkon oluşturulup mod değişince
     silinemeyen "hayalet balkon" kalıyordu (özellikle eğik kenarda kullanıcı balkonu bırakıp
     başka moda geçince — kat-55 vakası). hitBalk yalnız `balconies`+`pts`'e dayanır → plan
     gerekmez, bu yüzden mod-özel erken-return'lerden ÖNCE (door/avlu return'ü balkonu yutmasın). */
  if(closed && typeof balconies!=='undefined' && balconies.length){
    const rbB=svg.getBoundingClientRect();
    const hb=hitBalk(S2Wx(e.clientX-rbB.left), S2Wy(e.clientY-rbB.top));
    if(hb){
      if(mode==='balkon'){ pushEdit({type:'balk', prev:balkSnapshot()});
        balconies.splice(hb.i,1); hoverBalk=null; balkChecksRefresh(); render(); return; }
      const wrapB=roomMenu.parentElement.getBoundingClientRect();
      roomMenu.innerHTML='<div class="mh">BALKON</div><hr><div class="mi" data-balkdel>Balkonu sil</div>';
      roomMenu.style.display='block';
      roomMenu.style.left=Math.min(e.clientX-wrapB.left, wrapB.width-170)+'px';
      roomMenu.style.top =Math.min(e.clientY-wrapB.top,  wrapB.height-roomMenu.offsetHeight-10)+'px';
      const db=roomMenu.querySelector('.mi[data-balkdel]');
      if(db) db.onclick=()=>{ pushEdit({type:'balk', prev:balkSnapshot()});
        balconies.splice(hb.i,1); hoverBalk=null; hideRoomMenu(); balkChecksRefresh(); render(); };
      return;
    }
  }
  if(mode==='balkon'){
    const rb=svg.getBoundingClientRect();
    const h=hitBalk(S2Wx(e.clientX-rb.left), S2Wy(e.clientY-rb.top));
    if(h){ pushEdit({type:'balk', prev:balkSnapshot()});
      balconies.splice(h.i,1); hoverBalk=null; balkChecksRefresh(); render(); }
    return;
  }
  if(mode==='avlu'){
    const rb=svg.getBoundingClientRect();
    const h=hitAvlu(S2Wx(e.clientX-rb.left), S2Wy(e.clientY-rb.top));
    if(h){ pushEdit({type:'avlu', prev:courtyardsSnapshot()});
      courtyards.splice(h.i,1); avluGhost=null; avluChanged(); }
    return;
  }
  if(mode==='door'){ /* SAĞ TIK: kapıyı otomatik yerine döndür */
    if(!plan) return;
    const rb=svg.getBoundingClientRect();
    const h=hitDoor(e.clientX-rb.left, e.clientY-rb.top);
    if(h && h.kind!=='extra' && doorOverrides[h.key]){
      pushEdit({type:'door', prev:doorSnapshot()});
      delete doorOverrides[h.key]; hoverDoor=null; render();
    }
    return;
  }
  if(!plan) return;
  const rbA=svg.getBoundingClientRect();
  if(closed && typeof courtyards!=='undefined' && courtyards.length){   // AV-2: başka moddayken avluya sağ tık → küçük avlu menüsü (avlu hücresizdir → oda menüsü çıkmaz)
    const ha=hitAvlu(S2Wx(e.clientX-rbA.left), S2Wy(e.clientY-rbA.top));
    if(ha){
      const wrapA=roomMenu.parentElement.getBoundingClientRect();
      roomMenu.innerHTML='<div class="mh">AVLU</div><hr><div class="mi" data-avdel>Avluyu sil</div>';
      roomMenu.style.display='block';
      roomMenu.style.left=Math.min(e.clientX-wrapA.left, wrapA.width-170)+'px';
      roomMenu.style.top =Math.min(e.clientY-wrapA.top,  wrapA.height-roomMenu.offsetHeight-10)+'px';
      const db=roomMenu.querySelector('.mi[data-avdel]');
      if(db) db.onclick=()=>{ pushEdit({type:'avlu', prev:courtyardsSnapshot()});
        courtyards.splice(ha.i,1); avluGhost=null; hideRoomMenu(); avluChanged(); };
      return;
    }
  }
  const rb=svg.getBoundingClientRect(), sx=e.clientX-rb.left, sy=e.clientY-rb.top;
  const c=Math.floor((S2Wx(sx)-plan.minX)/M), r=Math.floor((S2Wy(sy)-plan.minY)/M);
  if(r<0||c<0||r>=plan.rows||c>=plan.cols) return;
  const j=r*plan.cols+c;
  if(!plan.inside[j]||plan.cm[j]<0) return;
  const g=plan.regions[plan.cm[j]];
  const k=unitOfRoom(g.id);
  if(g.type==='koridor'){                                  // APARTMAN HOLÜ menüsü (#41)
    const wrapC=roomMenu.parentElement.getBoundingClientRect();
    const placeC=()=>{ roomMenu.style.display='block';
      roomMenu.style.left=Math.min(e.clientX-wrapC.left, wrapC.width-220)+'px';
      roomMenu.style.top =Math.min(e.clientY-wrapC.top,  wrapC.height-roomMenu.offsetHeight-10)+'px'; };
    const failC=msg=>{ roomMenu.innerHTML=`<div class="note">${escapeHtml(msg)}</div>`; placeC(); setTimeout(hideRoomMenu,1800); };
    const doExt=(fn,errMsg)=>{ const st=stateSnapshot();
      if(fn()){ pushEdit({type:'unitswap',state:st});
        plan.regions.forEach(gg=>calcRegionMetrics(gg,plan.cols,plan.minX,plan.minY));
        hoverWall=null; plan.wallRuns=computeWallRuns(); runChecks(); buildUnitTable(); render(); hideRoomMenu(); }
      else failC(errMsg); };
    const un=corridorCoresUnreached();
    let html='<div class="mh">APARTMAN HOLÜ</div><hr>';
    html += un.length
      ? `<div class="mi" data-corecore="1">Holü çekirdeğe uzat (${un.length} ulaşılamayan)</div>`
      : `<div class="mi dis" title="Hol zaten çekirdeğe komşu">Hol çekirdeğe ulaşıyor</div>`;
    html += `<div class="mi" data-corext-r="1">▸ Holü sağa/aşağı uzat</div>`
          + `<div class="mi" data-corext-l="1">◂ Holü sola/yukarı uzat</div>`
          + `<div class="mh">Genişlet/daralt: holün kenar duvarındaki mavi tutamacı sürükleyin.</div>`;
    roomMenu.innerHTML=html; placeC();
    const cc=roomMenu.querySelector('.mi[data-corecore]');
    if(cc) cc.onclick=()=>{ const st=stateSnapshot();
      if(extendCorridorToCores()) hideRoomMenu();
      else failC('Uzatılamadı (komşu daire korunuyor ya da çekirdek hol ekseninde değil).'); };
    const cr=roomMenu.querySelector('.mi[data-corext-r]'); if(cr) cr.onclick=()=>doExt(()=>corridorExtendStep(1),'Sağa/aşağı uzatılamadı (sınır ya da komşu daire korunuyor).');
    const cl=roomMenu.querySelector('.mi[data-corext-l]'); if(cl) cl.onclick=()=>doExt(()=>corridorExtendStep(-1),'Sola/yukarı uzatılamadı (sınır ya da komşu daire korunuyor).');
    return;
  }
  if(isStructReg(g)){                                       // çekirdek öğesi (merdiven/asansör/yangın/şaft): SİL + EKLE
    const wrapS=roomMenu.parentElement.getBoundingClientRect();
    const placeS=()=>{ roomMenu.style.display='block';
      roomMenu.style.left=Math.min(e.clientX-wrapS.left, wrapS.width-210)+'px';
      roomMenu.style.top =Math.min(e.clientY-wrapS.top,  wrapS.height-roomMenu.offsetHeight-10)+'px'; };
    roomMenu.innerHTML=`<div class="mh">${escapeHtml(g.name)}</div><hr>`
      + `<div class="mi del" data-sdel="1">${escapeHtml(g.name)} sil</div>`
      + `<hr><div class="mh">Yapı elemanı ekle (tıkladığınız yere)</div>`
      + `<div class="mi" data-saddt="merdiven">+ Merdiven</div>`
      + `<div class="mi" data-saddt="asansor">+ Asansör</div>`
      + `<div class="mi" data-saddt="yangin">+ Yangın merdiveni</div>`
      + `<div class="mi" data-saddt="teknik">+ Teknik / şaft</div>`;
    placeS();
    const db=roomMenu.querySelector('.mi[data-sdel]');
    if(db) db.onclick=()=>{ doDeleteStruct(g.id); hideRoomMenu(); };
    roomMenu.querySelectorAll('.mi[data-saddt]').forEach(mi=>mi.onclick=()=>{
      if(doAddStruct(mi.dataset.saddt, sx, sy)) hideRoomMenu(); });
    return;
  }
  if(k<0){                                                 // daireye ait OLMAYAN alan
    if(isCommonOrphan(g)){                                  // ORTAK DEPO / sığınak·otopark artığı: düzenle (Bug C)
      const wrapO=roomMenu.parentElement.getBoundingClientRect();
      const placeO=()=>{ roomMenu.style.display='block';
        roomMenu.style.left=Math.min(e.clientX-wrapO.left, wrapO.width-230)+'px';
        roomMenu.style.top =Math.min(e.clientY-wrapO.top,  wrapO.height-roomMenu.offsetHeight-10)+'px'; };
      const failO=msg=>{ roomMenu.innerHTML=`<div class="note">${escapeHtml(msg)}</div>`; placeO(); setTimeout(hideRoomMenu,1800); };
      const doO=(fn,err)=>{ const snap=snapshotRegions();
        if(fn()){ pushEdit({type:'wallsnap', snap});
          plan.regions.forEach(gg=>calcRegionMetrics(gg,plan.cols,plan.minX,plan.minY));
          hoverWall=null; hoverRoomId=null; plan.wallRuns=computeWallRuns(); runChecks(); buildUnitTable(); render(); hideRoomMenu(); }
        else failO(err); };
      const hasKor=plan.regions.some(o=>o.type==='koridor'&&o.cells.length);
      let html=`<div class="mh">${escapeHtml(g.name)} · ${fmt(g.area)} m²</div><hr>`;
      if(hasKor) html+=`<div class="mi" data-otokor="1">Apartman holüne kat (çekirdek erişimi aç)</div>`;
      html+=`<div class="mi del" data-odis="1">Komşulara dağıtıp sil</div>`
          + `<hr><div class="mh">Yapı elemanı ekle (tıkladığınız yere)</div>`
          + `<div class="mi" data-saddt="merdiven">+ Merdiven</div>`
          + `<div class="mi" data-saddt="asansor">+ Asansör</div>`
          + `<div class="mi" data-saddt="yangin">+ Yangın merdiveni</div>`
          + `<div class="mi" data-saddt="teknik">+ Teknik / şaft</div>`;
      roomMenu.innerHTML=html; placeO();
      const ok=roomMenu.querySelector('.mi[data-otokor]'); if(ok) ok.onclick=()=>doO(()=>commonAreaToCorridor(g),'Apartman holü bulunamadı.');
      const od=roomMenu.querySelector('.mi[data-odis]'); if(od) od.onclick=()=>doO(()=>dissolveCommonArea(g),'Dağıtılacak komşu bulunamadı.');
      roomMenu.querySelectorAll('.mi[data-saddt]').forEach(mi=>mi.onclick=()=>{
        if(doAddStruct(mi.dataset.saddt, sx, sy)) hideRoomMenu();
        else failO('Eklenemedi (bina dışına düştü).'); });
    }
    return;                                                 // diğer ortak alana menü yok
  }
  const u=plan.unitObjs[k];
  const wrap=roomMenu.parentElement.getBoundingClientRect();
  const place=()=>{ roomMenu.style.display='block';
    roomMenu.style.left=Math.min(e.clientX-wrap.left, wrap.width-200)+'px';
    roomMenu.style.top =Math.min(e.clientY-wrap.top,  wrap.height-roomMenu.offsetHeight-10)+'px'; };
  const fail=msg=>{ roomMenu.innerHTML=`<div class="note">${escapeHtml(msg)}</div>`; place();
    setTimeout(hideRoomMenu,1600); };
  const isAntre = g===u.antre;
  const antreAdj = !isAntre && u.antre && u.antre.cells.length && g.cells.some(i=>{
    const r=(i/plan.cols)|0, c=i%plan.cols, aid=u.antre.id;
    return (r>0&&plan.cm[i-plan.cols]===aid)||(r<plan.rows-1&&plan.cm[i+plan.cols]===aid)
         ||(c>0&&plan.cm[i-1]===aid)||(c<plan.cols-1&&plan.cm[i+1]===aid); });
  const buildMain=()=>{
    let html=`<div class="mh">D${k+1} · ${escapeHtml(g.name)}</div><hr>`;
    html+=`<div class="mh">Bu odadan oyarak ekle (tıkladığınız yere yakın)</div>`;
    /* EB. BANYO yalnız tıklanan YATAK odasından oyulur; o odanın zaten bağlı banyosu varsa
       kapalı. FARKLI yatak odalarına ayrı ayrı eklenerek birden çok EB. BANYO olabilir (Bug B). */
    const thisHostHasEB=u.rooms.some(o=>o.name==='EB. BANYO'&&o.cells.length&&o.ebHost===g.id);
    ROOM_ADD.forEach((d,i)=>{
      if(d.eb&&g.type!=='yatak'){ html+=`<div class="mi dis" title="Ebeveyn banyosu yatak odasından oyulur">+ ${d.name} (yatak odasına sağ tıklayın)</div>`; return; }
      if(d.eb&&thisHostHasEB){ html+=`<div class="mi dis" title="Bu yatak odasında zaten EB. BANYO var (başka odaya ekleyebilirsiniz)">+ ${d.name} (bu odada zaten var)</div>`; return; }
      html+=`<div class="mi" data-add="${i}">+ ${d.name}</div>`; });
    if(!u.antre) html+=`<div class="mi" data-addantre="1">+ ANTRE (girişi yeniden oluştur)</div>`;
    if(isAntre){
      html+='<hr><div class="mh">Antre</div>'
        + `<div class="mi" data-slim="1">⇲ Antreyi kırp (fazlalık odalara)</div>`
        + `<div class="mi dis" title="Daire girişi her zaman korunur">Antre silinemez</div>`
        + `<div class="mh">Uzatmak için: duvarını sürükleyin ya da hedef odaya sağ tıklayın</div>`;
    } else {
      html+='<hr><div class="mh">Düzenle</div>'
        + `<div class="mi" data-retype-open="1">Tipini değiştir…</div>`
        + `<div class="mi" data-swap-open="1">⇄ Başka odayla takas et…</div>`
        + `<div class="mi" data-split="v">║ Odayı dikine böl</div>`
        + `<div class="mi" data-split="h">═ Odayı enine böl</div>`;
      if(g.type==='salon'&&u.rooms.some(o=>o.type==='mutfak'&&o.cells.length))
        html+=`<div class="mi" data-acik="1">⌐ Açık mutfağa dönüştür (mutfağı salona kat)</div>`;
      if(u.antre&&u.antre.cells.length&&!antreAdj)
        html+=`<div class="mi" data-extend="1">Antreyi bu odaya uzat (kapı erişimi)</div>`;
      const onlySalon=g.type==='salon'&&salonProtected()&&!u.rooms.some(o=>o!==g&&o.type==='salon'&&o.cells.length);
      html+='<hr>'+(onlySalon
        ? `<div class="mi dis" title="Yasal zorunlu piyes">Tek salon silinemez</div>`
        : `<div class="mi del" data-del="1">Odayı sil (komşuya katılır)</div>`);
    }
    if(!plan.villa){
      const cur=unitLayout[k]||'auto';
      const opt=(m,lbl)=>`<div class="mi${cur===m?' on':''}" data-lay="${m}">${cur===m?'● ':'○ '}${lbl}</div>`;
      html+='<hr><div class="mh">Daire iç düzeni</div>'
         + opt('auto','Otomatik')
         + opt('flat','Odalar yan yana')
         + opt('rail','Yatak odaları derinlemesine');
      const nbr=u.rooms.length && plan.unitObjs.filter((o,j)=>j!==k && o.rooms.some(x=>x.cells.length)).length;
      if(nbr) html+='<hr><div class="mi" data-swapunit-open="1">⇄ Daireyi başka daireyle takas et…</div>'
                  +'<div class="mi del" data-dissolve="1">Daireyi sil (komşuya kat)</div>';
    }
    html+='<hr><div class="mi" data-saddmenu="1">⊞ Yapı elemanı ekle…</div>';   // merdiven/asansör/yangın/şaft (tıklanan yere)
    roomMenu.innerHTML=html; place(); bindMain();
  };
  const showRetype=()=>{
    let html=`<div class="mh">D${k+1} · ${escapeHtml(g.name)} → yeni tip</div><hr>`;
    RETYPE.forEach((d,i)=>{ if(d.name===g.name) return;
      html+=`<div class="mi" data-retype="${i}">${escapeHtml(d.name)}</div>`; });
    html+=`<hr><div class="mi" data-back="1">‹ Geri</div>`;
    roomMenu.innerHTML=html; place();
    roomMenu.querySelectorAll('.mi[data-retype]').forEach(mi=>mi.onclick=()=>{
      if(retypeRoom(g, RETYPE[+mi.dataset.retype])) hideRoomMenu();
      else fail('Tip değiştirilemedi (tek salon / EB ikilisi korunur).'); });
    const back=roomMenu.querySelector('.mi[data-back]'); if(back) back.onclick=buildMain;
  };
  const showSwap=()=>{
    let html=`<div class="mh">${escapeHtml(g.name)} ↔ takas edilecek oda</div><hr>`;
    u.rooms.forEach(o=>{ if(o===g||!o.cells.length||o===u.antre||o.type==='merdiven'||o.name==='EB. BANYO') return;
      html+=`<div class="mi" data-swap="${o.id}">${escapeHtml(o.name)} (${fmt(o.area)} m²)</div>`; });
    html+=`<hr><div class="mi" data-back="1">‹ Geri</div>`;
    roomMenu.innerHTML=html; place();
    roomMenu.querySelectorAll('.mi[data-swap]').forEach(mi=>mi.onclick=()=>{
      if(swapRooms(g, plan.regions[+mi.dataset.swap])) hideRoomMenu();
      else fail('Takas yapılamadı (EB ikilisi / tek salon korunur).'); });
    const back=roomMenu.querySelector('.mi[data-back]'); if(back) back.onclick=buildMain;
  };
  const showSwapUnit=()=>{
    let html=`<div class="mh">D${k+1} · ${escapeHtml(unitTag(u.spec))} ↔ takas edilecek daire</div><hr>`;
    plan.unitObjs.forEach((o,j)=>{ if(j===k||!o.rooms.some(x=>x.cells.length)) return;
      const m2=o.rooms.reduce((s,g)=>s+g.area,0);
      html+=`<div class="mi" data-swapunit="${j}">D${j+1} · ${escapeHtml(unitTag(o.spec))} (${fmt(m2)} m²)</div>`; });
    html+=`<hr><div class="mi" data-back="1">‹ Geri</div>`;
    roomMenu.innerHTML=html; place();
    roomMenu.querySelectorAll('.mi[data-swapunit]').forEach(mi=>mi.onclick=()=>{
      if(swapUnits(k, +mi.dataset.swapunit)) hideRoomMenu();
      else fail('Daire takas edilemedi.'); });
    const back=roomMenu.querySelector('.mi[data-back]'); if(back) back.onclick=buildMain;
  };
  const showStructAdd=()=>{                                  // oda menüsünden drill-in: yapı elemanı ekle
    let html='<div class="mh">Yapı elemanı ekle (tıkladığınız yere)</div><hr>'
      + '<div class="mi" data-saddt="merdiven">+ Merdiven</div>'
      + '<div class="mi" data-saddt="asansor">+ Asansör</div>'
      + '<div class="mi" data-saddt="yangin">+ Yangın merdiveni</div>'
      + '<div class="mi" data-saddt="teknik">+ Teknik / şaft</div>'
      + '<hr><div class="mi" data-back="1">‹ Geri</div>';
    roomMenu.innerHTML=html; place();
    roomMenu.querySelectorAll('.mi[data-saddt]').forEach(mi=>mi.onclick=()=>{
      if(doAddStruct(mi.dataset.saddt, sx, sy)) hideRoomMenu();
      else fail('Eklenemedi (bina dışına düştü — bina içinde bir yere tıklayın).'); });
    const back=roomMenu.querySelector('.mi[data-back]'); if(back) back.onclick=buildMain;
  };
  function bindMain(){
    roomMenu.querySelectorAll('.mi[data-add]').forEach(mi=>mi.onclick=()=>{
      const ok=addRoom(g, ROOM_ADD[+mi.dataset.add], j);
      if(ok) hideRoomMenu();
      else fail('Yer yetersiz — duvarları sürükleyerek odayı büyütüp yeniden deneyin.');
    });
    const aa=roomMenu.querySelector('.mi[data-addantre]');
    if(aa) aa.onclick=()=>{ if(addRoom(g,{name:'ANTRE',type:'antre',h:3,w:6},j)) hideRoomMenu();
      else fail('Antre için yer bulunamadı.'); };
    const del=roomMenu.querySelector('.mi[data-del]');
    if(del) del.onclick=()=>{ if(removeRoom(g)) hideRoomMenu();
      else fail('Bu oda silinemedi (daire içi komşusu yok).'); };
    const slim=roomMenu.querySelector('.mi[data-slim]');
    if(slim) slim.onclick=()=>{ const snap=snapshotRegions();
      if(slimUnitAntre(u)){ pushEdit({type:'wallsnap', snap}); refreshAfterRoomEdit(); hideRoomMenu(); }
      else fail('Kırpılacak fazlalık yok (erişim ve bağlantı korunuyor).'); };
    const rt=roomMenu.querySelector('.mi[data-retype-open]'); if(rt) rt.onclick=showRetype;
    const sw=roomMenu.querySelector('.mi[data-swap-open]'); if(sw) sw.onclick=showSwap;
    const swu=roomMenu.querySelector('.mi[data-swapunit-open]'); if(swu) swu.onclick=showSwapUnit;
    const sad=roomMenu.querySelector('.mi[data-saddmenu]'); if(sad) sad.onclick=showStructAdd;
    roomMenu.querySelectorAll('.mi[data-split]').forEach(mi=>mi.onclick=()=>{
      if(splitRoom(g, mi.dataset.split==='h')) hideRoomMenu();
      else fail('Oda bölünemedi (çok küçük ya da parçalar kopuk kalırdı).'); });
    const ac=roomMenu.querySelector('.mi[data-acik]');
    if(ac) ac.onclick=()=>{ const r=openKitchen(g);
      if(r===true) hideRoomMenu();
      else if(r==='noadj') fail('Mutfak salona komşu değil — önce takasla ya da duvar sürükleyerek bitiştirin.');
      else fail('Bu dairede ayrı mutfak yok (zaten açık mutfak).'); };
    const ex=roomMenu.querySelector('.mi[data-extend]');
    if(ex) ex.onclick=()=>{ const r=extendAntreTo(g);
      if(r===true) hideRoomMenu();
      else if(r==='already') fail('Oda zaten antreye komşu.');
      else fail('Uygun yol bulunamadı (donör odalar bölünemez).'); };
    roomMenu.querySelectorAll('.mi[data-lay]').forEach(mi=>mi.onclick=()=>{
      applyUnitLayout(k, mi.dataset.lay); hideRoomMenu();
    });
    const dis=roomMenu.querySelector('.mi[data-dissolve]');
    if(dis) dis.onclick=()=>{
      const snap=snapshotRegions();
      if(dissolveUnit(k)){ pushEdit({type:'wallsnap', snap}); hideRoomMenu(); }
      else fail('Daire silinemedi (komşu daire bulunamadı).');
    };
  }
  buildMain();
});
/* daire iç düzen tercihini uygula: tüm planı aynı ayırıcılarla yeniden üretir
   (yalnız bu dairenin içi değişir; ayırıcı sürükleme gibi elle duvar/oda
   düzenlemelerini sıfırlar — bilinçli yeniden üretim). */
function applyUnitLayout(k, mode){
  const prev=Object.assign({}, unitLayout);
  const state=stateSnapshot(); // DEĞİŞİKLİKTEN ÖNCE tam durum: geri al elle düzenlemeleri de birebir getirir
  if(mode==='auto') delete unitLayout[k]; else unitLayout[k]=mode;
  if(JSON.stringify(prev)===JSON.stringify(unitLayout)) return;
  pushEdit({type:'ulayout', prev, state});
  generate(true);
}
svg.addEventListener('mousedown',hideRoomMenu);
window.addEventListener('keydown',e=>{ if(e.key==='Escape') hideRoomMenu(); });
svg.addEventListener('wheel',hideRoomMenu,{passive:true});
