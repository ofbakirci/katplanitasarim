'use strict';
/* ================= durum ================= */
let pxPerM = 16, panX = 80, panY = 70;
let mode = 'draw';            // draw | pan
let pts = [];                 // poligon köşeleri (m)
let closed = false;
let hoverP = null;
let plan = null;              // üretilen plan
let customCutsZ = null; // bölge başına ayırıcı konumları
let unitLayout = {};    // daire başına iç düzen tercihi: k → 'auto'|'flat'|'rail'
let dragging = null;          // {type:'pan'|'cut'|'wall', ...}
let hoverWall = null;         // imleç altındaki sürüklenebilir oda duvarı
let hoverRoomId = null;       // imleç altındaki oda (duvar ölçüsü vurgusu)
let hoverStruct = null;       // yapı modunda imleç altındaki yapı tutamağı {regId,handle}
let hoverBay = null;          // park modunda imleç altındaki park yeri index'i | null
let parkGhost = null;         // park modunda eklenecek boş park yeri önizlemesi {x,y,w,h,ang} | null
let editHistory = [];         // elle düzenleme geçmişi: {type:'wall',a,b,cellsA,cellsB} | {type:'cut',cuts} | {type:'balk',prev}
let parcelPts = [];           // parsel poligonu (opsiyonel; bahçe = parsel − bina)
let parcelClosed = false;
let balconies = [];           // {ei, t0, t1, depth}: pts[ei]→pts[ei+1] kenarında, dışa doğru
let hoverBalk = null;         // balkon modu önizleme {ei,t0,t1,depth} | tutamaç vurgusu
let courtyards = [];          // iç avlular: {poly:[{x,y}...]} (dünya koord). generate() bunları footprint'ten oyar
let avluGhost = null;         // avlu modunda sürüklenen yeni avlu önizlemesi {poly:[...]} | null
let doorOverrides = {};       // elle kapı yeri: key -> {h,x,y}; geçersizleşirse otomatiğe düşer
let extraDoors = [];          // çift tıkla eklenen kapılar: {h,x,y}
let doorHidden = {};          // çift tıkla silinen otomatik kapılar: key -> true
let hoverDoor = null;         // kapı modunda imleç altındaki kapı kaydı
let koridorYon = 'oto';       // apartman koridor yönü: 'oto'|'yatay'|'dikey' (manuel override)
let katKullanim = 'konut';    // AKTİF katın kullanım tipi (apartman + katları ayrı): 'konut'|'ticari'|'otopark'|'siginak'
let blocks = null;            // site "çoklu blok": blok başına TAM durum anlık görüntüsü (stateSnapshot biçimi, kendi katlarını içerir) | null
let activeBlock = 0;          // blocks aktifken düzenlenen blok indeksi (0 = Blok A)
let villaFloors = null;       // villa "katları ayrı planla": kat başına durum anlık görüntüsü (stateSnapshot biçimi) | null
let activeFloor = 0;          // villaFloors aktifken görüntülenen kat İNDEKSİ (0 = en alt bodrum; zemin = bodrumSayisi)
let bodrumSayisi = 0;         // bodrum (eksi) kat sayısı; toplam kat = bodrum + üst. villaFloors indeksi: 0=en alt bodrum, zeminIdx()=zemin
let villaOffset = 0;          // villaFloors dizisinin kurulduğu bodrum sayısı (sayaç değişiminde indeks kaymasını yönetmek için)
let lockedCore = null;        // bina iskeleti: kilitli çekirdek öğeleri [{type,name,x0,y0,x1,y1}] (dünya koord, katlar arası ortak) | null
let exportView = null;        // io.js dışa aktarımı sırasında render() için geçici görünüm

const svg = document.getElementById('svg');
const NS = 'http://www.w3.org/2000/svg';

/* ================= DOM / görünüm yardımcıları ================= */
const el = (t,a)=>{const e=document.createElementNS(NS,t); for(const k in a)e.setAttribute(k,a[k]); return e;};
const W2Sx = x => x*pxPerM + panX, W2Sy = y => y*pxPerM + panY;
const S2Wx = x => (x-panX)/pxPerM, S2Wy = y => (y-panY)/pxPerM;

/* ================= daire tipi arayüzü ================= */
let unitSpecs = [ {oda:2, salon:1, ensuite:true, acik:false, adet:2}, {oda:1, salon:1, ensuite:false, acik:true, adet:2} ];
function unitTag(u){
  const fx=[];
  if(u.salon===0) fx.push((document.getElementById('binaTipi').value==='villa'&&floorsOn())?'salonsuz kat':'stüdyo');
  if(u.acik && u.salon>0) fx.push('açık mutfak');
  if(u.ensuite) fx.push('ebeveyn banyolu');
  return u.oda+'+'+u.salon+(fx.length?' ('+fx.join(', ')+')':'');
}
function renderUnits(){
  const villa = document.getElementById('binaTipi').value==='villa';
  if(villa && unitSpecs.length>1) unitSpecs = [unitSpecs[0]];
  if(villa) unitSpecs[0].adet = 1;
  const box = document.getElementById('unitList'); box.innerHTML='';
  unitSpecs.forEach((u,i)=>{
    const d=document.createElement('div'); d.className='unitCard';
    d.innerHTML = `<div class="head"><span class="tag">${unitTag(u)}</span>${(!villa&&unitSpecs.length>1)?`<button class="del" data-i="${i}" title="Sil">×</button>`:''}</div>
      <div class="frow"><label>Oda</label><input type="number" min="${villa?0:1}" max="20" value="${u.oda}" data-i="${i}" data-k="oda"></div>
      <div class="frow"><label>Salon <small>(0 = stüdyo)</small></label><input type="number" min="0" max="2" value="${u.salon}" data-i="${i}" data-k="salon"></div>
      <div class="frow"><label>Ebeveyn banyosu</label><span class="switch"><input type="checkbox" ${u.ensuite?'checked':''} data-i="${i}" data-k="ensuite"><i></i></span></div>
      <div class="frow"><label>Açık mutfak</label><span class="switch"><input type="checkbox" ${u.acik?'checked':''} data-i="${i}" data-k="acik"><i></i></span></div>
      ${villa?'':`<div class="frow"><label>Adet</label><input type="number" min="1" max="99" value="${u.adet}" data-i="${i}" data-k="adet"></div>`}`;
    box.appendChild(d);
  });
  box.querySelectorAll('input[type=number]').forEach(makeStepper);
  box.querySelectorAll('input').forEach(inp=>inp.addEventListener('change',e=>{
    const i=+e.target.dataset.i, k=e.target.dataset.k;
    unitSpecs[i][k] = (k==='ensuite'||k==='acik') ? e.target.checked
      : (k==='salon'||(k==='oda'&&document.getElementById('binaTipi').value==='villa')) ? Math.max(0,+e.target.value||0)
      : Math.max(1,+e.target.value||1);
    /* DEĞER değişiminde TÜM kartları yeniden kurMA: stepper'a basılıyken (pointerdown→change)
       kartların innerHTML'i sıfırlanınca bastığın düğme DOM'dan koparılıyor ve bazı
       tarayıcılarda olay/pointer sistemi kilitleniyordu — sonradan "+ Daire tipi ekle" ve
       diğer tıklamalar yutuluyor, yalnız sayfa yenileme çözüyordu. Yapısal değişiklik yok;
       yalnız ilgili kartın başlığını tazele. */
    const card=e.target.closest('.unitCard'), tg=card&&card.querySelector('.tag');
    if(tg) tg.textContent=unitTag(unitSpecs[i]);
    resetCuts(); safeGen();
  }));
  box.querySelectorAll('.del').forEach(b=>b.addEventListener('click',e=>{
    unitSpecs.splice(+e.target.dataset.i,1); renderUnits(); resetCuts(); safeGen();
  }));
}
/* UI kaynaklı yeniden üretim güvenli sarmalayıcı: generate() içinde beklenmeyen bir hata
   olsa bile olay işleyicisi yarıda kalıp arayüzü bozmasın (konsola yaz, akış sürsün). */
function safeGen(){ try{ if(plan) generate(); }catch(err){ console.error('generate() hata:', err); } }
document.getElementById('addUnit').addEventListener('click',()=>{
  if(document.getElementById('binaTipi').value==='villa') return;
  unitSpecs.push({oda:3, salon:1, ensuite:true, acik:false, adet:1}); renderUnits(); resetCuts(); safeGen();
});
document.getElementById('binaTipi').addEventListener('change',()=>{ lockedCore=null; updateStructResetBtn(); renderUnits(); updateKatAyriUI(); resetCuts(); safeGen(); });
document.getElementById('koridorYon').addEventListener('change',e=>{ koridorYon=e.target.value; resetCuts(); safeGen(); });
['katSayisi','katYuk'].forEach(id=>document.getElementById(id).addEventListener('change',()=>{ onFloorCountChange(); safeGen(); }));
['katSayisi','katYuk'].forEach(id=>makeStepper(document.getElementById(id)));
document.getElementById('bodrumSayisi').addEventListener('change',()=>{
  const bi=document.getElementById('bodrumSayisi');
  bodrumSayisi=Math.max(0,Math.min(4,+bi.value||0)); bi.value=String(bodrumSayisi); // global ÖNCE güncellenir (reflow okur)
  onFloorCountChange(); safeGen();
});
makeStepper(document.getElementById('bodrumSayisi'));

/* ================= villa: katları ayrı planla =================
   Müstakil evde her kat kendi sınırı (oturumu), oda programı ve elle düzenlemeleriyle
   ayrı planlanır. Katlar arası tutarlılık kuralları:
   1. İç merdiven DÜŞEYDE SABİT: üst kat üretilirken merdiven, zemin kattaki konumuna
      hücre hücre sabitlenir (kat sınırı merdiveni keserse runChecks ihlal yazar).
   2. Oturum oranı: her katın alanı zemin katın en az %70'i olmalı (REG.katOturumOran).
   3. Çıkma sınırı: üst kat, bir alt kattan en çok 1,5 m taşabilir (REG.cikmaMax, PAİY).
   Kat durumları villaFloors[k]'da stateSnapshot biçiminde saklanır; sekme geçişinde
   aktif kat kaydedilip hedef kat aynen geri kurulur (elle düzenlemeler dâhil). */
/* üst (zemin dahil) kat sayısı, bodrum sayısı, toplam, zemin indeksi, indeks→seviye */
function ustKat(){ return Math.max(1,+document.getElementById('katSayisi').value||1); }
function totalFloors(){ return bodrumSayisi + ustKat(); }
function zeminIdx(){ return bodrumSayisi; }              // villaFloors içinde zemin katın indeksi
function floorLevel(k){ return k - bodrumSayisi; }       // <0 bodrum, 0 zemin, >0 üst kat
function floorsOn(){
  const cb=document.getElementById('katAyri');
  return !!(villaFloors && cb && cb.checked && totalFloors()>=2);
}
function floorName(k){ const L=floorLevel(k); return L<0?(-L)+'. bodrum':(L===0?'Zemin kat':L+'. kat'); }
/* sayaç (kat/bodrum) değişiminde villaFloors'u SEVİYE koruyarak yeniden indeksle.
   villaOffset = dizinin eski bodrum sayısı; yeni indeks = seviye + bodrumSayisi. */
function reflowFloors(){
  if(!villaFloors){ villaOffset=bodrumSayisi; return; }
  const oldB=villaOffset, total=totalFloors(), old=villaFloors, next=new Array(total).fill(null);
  for(let i=0;i<old.length;i++){ if(!old[i]) continue;
    const ni=(i-oldB)+bodrumSayisi; if(ni>=0&&ni<total) next[ni]=old[i]; }
  let na=(activeFloor-oldB)+bodrumSayisi; if(na<0||na>=total) na=zeminIdx();
  villaFloors=next; activeFloor=na; villaOffset=bodrumSayisi;
}
/* ================= kat kullanım tipi (apartman + katları ayrı) =================
   Her kat ayrı bir kullanıma ayrılabilir: 🏠 Konut (varsayılan, daire yerleşimi),
   🏪 Ticari (zemin dükkânlar), 🅿️ Otopark (bodrum araç), 🛡️ Sığınak (bodrum sığınak).
   Aktif katın tipi global `katKullanim`'dadır; diğer katlarınki kendi anlık görüntüsünde
   (villaFloors[k].plan.katKullanim) saklanır. Yalnız apartmanda + katları ayrı açıkken. */
/* kullanım ikonu icon() ile gelir (icons.js): icon('ticari'|'otopark'|'siginak'|'konut') */
const USAGE_TR   = {konut:'Konut', ticari:'Ticari', otopark:'Otopark', siginak:'Sığınak'};
const USAGE_HINT = {
  ticari:'Bu kat dükkân (ticari) olarak planlanır — daire tipleri uygulanmaz. Çekirdek (merdiven/asansör) düşeyde korunur.',
  otopark:'Bu kat otopark olarak planlanır — araç alanı + çekirdek. Daire tipleri uygulanmaz.',
  siginak:'Bu kat sığınak olarak planlanır — sığınak hacmi + kalan otopark. Daire tipleri uygulanmaz.'
};
function usageEnabled(){ return floorsOn() && document.getElementById('binaTipi').value!=='villa'; }
/* k. katın kullanım tipi: aktif kat global'den, diğerleri anlık görüntüden */
function usageOf(k){
  if(k===activeFloor) return katKullanim;
  const f=villaFloors&&villaFloors[k];
  return (f&&f.plan&&f.plan.katKullanim)||'konut';
}
/* binada (tüm katlarda) verilen kullanımda kat var mı? — sığınak/ticari zorunluluk denetimi */
function buildingHasUsage(u){
  if(!usageEnabled()) return katKullanim===u;
  const total=totalFloors();
  for(let k=0;k<total;k++) if(usageOf(k)===u) return true;
  return false;
}
/* ----- bina geneli otopark gereksinimi (Otopark Yönetmeliği Ek-1, konut) ----- */
/* k. katta verilen tipteki bölge toplam alanı (aktif kat canlı, diğerleri anlık görüntü) */
function floorRegionArea(k, type){
  if(k===activeFloor && plan)
    return plan.regions.filter(g=>g.type===type).reduce((s,g)=>s+(g.area||0),0);
  const f=villaFloors&&villaFloors[k];
  if(!f||!f.plan) return 0;
  return (f.plan.regions||[]).filter(g=>g.type===type)
    .reduce((s,g)=>s+(g.cells?g.cells.length:0),0)*M*M;
}
/* k. konut katındaki dairelerin (şematik) alan listesi */
function floorDwellingAreas(k){
  if(usageOf(k)!=='konut') return [];
  if(k===activeFloor && plan)
    return plan.unitObjs.filter(u=>u.rooms.some(g=>g.cells.length))
      .map(u=>u.rooms.reduce((s,g)=>s+g.area,0));
  const f=villaFloors&&villaFloors[k];
  if(!f||!f.plan) return [];
  const byId={}; (f.plan.regions||[]).forEach(g=>{ byId[g.id]=g.cells?g.cells.length:0; });
  return (f.plan.units||[]).map(u=>(u.rooms||[]).reduce((s,id)=>s+(byId[id]||0),0)*M*M).filter(a=>a>0);
}
/* bir daire (net alan) için Otopark Yön. asgari otopark katsayısı (brüt'e çevrilir) */
function parkingForArea(net){
  const brut=net*REG.otoparkBrutKats;
  for(const t of REG.otoparkKonut) if(brut<=t.max) return t.oto;
  return 2;
}
/* binada gereken toplam otopark (tüm konut katları) */
function requiredParking(){
  if(!usageEnabled()) return 0;
  const total=totalFloors();
  let sum=0;
  for(let k=0;k<total;k++) floorDwellingAreas(k).forEach(a=>{ sum+=parkingForArea(a); });
  return Math.ceil(sum-1e-9);
}
/* k. kattaki çizili park yeri (bay) sayısı — gerçek yerleşimden (yollar dahil) */
function floorParkingCount(k){
  if(k===activeFloor && plan) return (plan.parking&&plan.parking.bays)? plan.parking.bays.length : 0;
  const f=villaFloors&&villaFloors[k];
  if(!f||!f.plan) return 0;
  return parkingForPlan(f.plan).bays.length;
}
/* binadaki otopark/sığınak katlarının sağladığı toplam park yeri (çizili) */
function providedParking(){
  if(!usageEnabled()) return 0;
  const total=totalFloors();
  let cap=0;
  for(let k=0;k<total;k++){ const u=usageOf(k);
    if(u==='otopark'||u==='siginak') cap+=floorParkingCount(k); }
  return cap;
}
/* seçici + ipucu + daire editörünü aktif kata göre tazele */
function syncKatKullanimUI(){
  const row=document.getElementById('katKullanimRow');
  const sel=document.getElementById('katKullanim');
  const hint=document.getElementById('katKullanimHint');
  const apt=document.getElementById('binaTipi').value==='apartman';
  const kat=Math.max(1,+document.getElementById('katSayisi').value||1);
  const active=usageEnabled();          // «Katları ayrı planla» açık (floorsOn + apartman)
  const showRow=apt && kat>=2;          // çok katlı apartmanda HER ZAMAN görünür (keşfedilebilir); switch'e kadar pasif
  if(row) row.style.display=showRow?'':'none';
  if(sel){ sel.disabled=!active; sel.value=active?katKullanim:'konut'; }
  /* konut dışı katta daire tipi editörü gizlenir (uygulanmaz) */
  const nonKonut = active && katKullanim!=='konut';
  const list=document.getElementById('unitList'), add=document.getElementById('addUnit');
  if(list) list.style.display=nonKonut?'none':'';
  if(add) add.style.display=nonKonut?'none':'';
  if(hint){
    if(nonKonut){ hint.style.display=''; hint.textContent=USAGE_HINT[katKullanim]||''; }
    else if(showRow && !active){ hint.style.display=''; hint.textContent='“Katları ayrı planla” açılınca her kata ayrı kullanım (ticari / otopark / sığınak) verebilirsiniz.'; }
    else hint.style.display='none';
  }
  if(typeof updateParkBtn==='function') updateParkBtn();
}
document.getElementById('katKullanim').addEventListener('change',e=>{
  if(!usageEnabled()){ e.target.value='konut'; return; }
  katKullanim=e.target.value;
  syncKatKullanimUI();
  resetCuts(); unitLayout={}; doorOverrides={}; extraDoors=[]; doorHidden={}; editHistory=[];
  safeGen();
  if(floorsOn()&&plan) villaFloors[activeFloor]=stateSnapshot(true);
  renderFloorTabs();
});
/* k. katın {pts, plan} durumu: aktif kat canlı globallerden, diğerleri anlık görüntüden */
function floorState(k){
  if(!floorsOn()) return null;
  if(k===activeFloor) return (plan&&closed)? {pts, plan} : null;
  const f=villaFloors[k];
  return (f&&f.plan)? {pts:f.pts, plan:f.plan} : null;
}
/* plan (canlı ya da anlık görüntü) içindeki iç merdivenin dünya koordinatlı kapsayan kutusu */
function stairBoxOf(pl){
  if(!pl) return null;
  const g=(pl.regions||[]).find(g2=>g2.type==='merdiven'&&g2.cells&&g2.cells.length);
  if(!g) return null;
  let r0=1e9,r1=-1e9,c0=1e9,c1=-1e9;
  g.cells.forEach(i=>{const r=(i/pl.cols)|0,c=i%pl.cols;
    if(r<r0)r0=r; if(r>r1)r1=r; if(c<c0)c0=c; if(c>c1)c1=c;});
  return {x0:pl.minX+c0*M, y0:pl.minY+r0*M, x1:pl.minX+(c1+1)*M, y1:pl.minY+(r1+1)*M};
}
/* üst kat üretilirken merdivenin sabitleneceği dünya dikdörtgeni (zemin kattan) */
function villaForcedStair(){
  if(!floorsOn()||activeFloor===zeminIdx()) return null;
  const f0=floorState(zeminIdx());
  return f0? stairBoxOf(f0.plan) : null;
}
/* ================= yapı iskeleti (lockedCore) =================
   Çekirdek (merdiven/asansör/teknik/yangın) bina seviyesinde KİLİTLİ bir iskelettir:
   dünya koordinatlı dikdörtgenler katlar arası ortak tutulur → tüm çekirdek düşeyde
   süreklidir. generate() bu öğeleri ÖNCE sahiplenir, kendi çekirdeğini yerleştirmez;
   daireler iskeletin etrafına dizilir. "Yerleşimi Oluştur" iskeleti korur (lockedCore
   silinmez); yalnız "Yapı iskeletini sıfırla" temizler. */
const isCoreReg=g=>STRUCT_TYPES[g.type]&&g.cells&&g.cells.length&&g.name!=='ORTAK DEPO';
function captureCoreFrom(pl){
  if(!pl) return null;
  const cols=pl.cols, minX=pl.minX, minY=pl.minY, out=[];
  (pl.regions||[]).filter(isCoreReg).forEach(g=>{
    let r0=1e9,r1=-1e9,c0=1e9,c1=-1e9;
    g.cells.forEach(i=>{const r=(i/cols)|0,c=i%cols; r0=Math.min(r0,r);r1=Math.max(r1,r);c0=Math.min(c0,c);c1=Math.max(c1,c);});
    out.push({type:g.type, name:g.name, x0:minX+c0*M, y0:minY+r0*M, x1:minX+(c1+1)*M, y1:minY+(r1+1)*M});
  });
  return out.length? out : null;
}
function captureLockedCore(){ lockedCore = captureCoreFrom(plan); }
/* çekirdek iskeletini verilen ızgaraya çevir: [{type,name,r0,c0,h,w}] (ızgaraya kırpılır).
   Kaynak: elle lockedCore ÖNCELİKLİ; yoksa otomatik kulak-algılama (autoCore). */
function coreLockForGrid(minX,minY,rows,cols,autoCore){
  const src=(lockedCore&&lockedCore.length)? lockedCore : (autoCore&&autoCore.length? autoCore : null);
  if(!src) return null;
  const out=[];
  src.forEach(e=>{
    let c0=Math.round((e.x0-minX)/M), r0=Math.round((e.y0-minY)/M);
    let c1=Math.round((e.x1-minX)/M)-1, r1=Math.round((e.y1-minY)/M)-1;
    c0=Math.max(0,c0); r0=Math.max(0,r0); c1=Math.min(cols-1,c1); r1=Math.min(rows-1,r1);
    if(c1<c0||r1<r0) return;
    out.push({type:e.type, name:e.name, r0, c0, h:r1-r0+1, w:c1-c0+1});
  });
  return out.length? out : null;
}
/* iskeleti temizle → otomatik çekirdek yerleşimine dön */
function resetLockedCore(){
  lockedCore=null;
  if(plan&&closed){ try{ generate(floorsOn()?true:false); }catch(err){ console.error('iskelet sıfırlama:',err); } }
  updateStructResetBtn();
}
function updateStructResetBtn(){
  const b=document.getElementById('structReset'); if(!b) return;
  b.style.display = lockedCore? '' : 'none';
}
/* poligon kenarları boyunca ~0,5 m aralıklı örnek noktalar (taşma ölçümü) */
function polySamples(poly){
  const out=[];
  for(let i=0;i<poly.length;i++){ const a=poly[i],b=poly[(i+1)%poly.length];
    const L=Math.hypot(b.x-a.x,b.y-a.y), n=Math.max(1,Math.ceil(L/0.5));
    for(let t=0;t<n;t++) out.push({x:a.x+(b.x-a.x)*t/n, y:a.y+(b.y-a.y)*t/n}); }
  return out;
}
function distToPoly(q, poly){
  let d=1e9;
  for(let i=0;i<poly.length;i++){ const A=poly[i],B=poly[(i+1)%poly.length];
    d=Math.min(d, distSeg(q.x,q.y,A.x,A.y,B.x,B.y)); }
  return d;
}
/* anahtar satırının görünürlüğü + tip/kat değişiminde özelliğin kapanması */
function updateKatAyriUI(){
  const apt=document.getElementById('binaTipi').value==='apartman';
  /* bodrum yalnız apartmanda; villaya geçince sıfırlanır */
  const br=document.getElementById('bodrumRow');
  if(br) br.style.display=apt?'':'none';
  if(!apt && bodrumSayisi!==0){ bodrumSayisi=0; const bi=document.getElementById('bodrumSayisi'); if(bi) bi.value='0'; reflowFloors(); }
  const row=document.getElementById('katAyriRow');
  if(row) row.style.display=(totalFloors()>=2)?'':'none';   // apartman + villa: çok katlıysa (bodrum dahil) açılabilir
  const cb=document.getElementById('katAyri');
  if(totalFloors()<2&&cb&&cb.checked) floorsOff();
  renderFloorTabs();
}
/* özelliği kapat: zemin kata dönülür, kat anlık görüntüleri bırakılır */
function floorsOff(){
  const zi=zeminIdx();
  if(villaFloors && activeFloor!==zi && villaFloors[zi] && villaFloors[zi].plan){
    activeFloor=zi;
    try{ restoreState(villaFloors[zi], {fit:false, keepFloors:true}); }
    catch(err){ console.error('kat kapatma:', err); }
  }
  villaFloors=null; activeFloor=0; katKullanim='konut'; villaOffset=bodrumSayisi;
  const cb=document.getElementById('katAyri'); if(cb) cb.checked=false;
  renderFloorTabs();
}
/* kat/bodrum sayısı değişti: dizi SEVİYE koruyarak yeniden indekslenir, anlık görüntüler
   güncel kat/yükseklikle damgalanır, aktif katın canlı durumu hedefe getirilir */
function onFloorCountChange(){
  if(villaFloors && plan) villaFloors[activeFloor]=stateSnapshot(true); // canlıyı kaydet (kaymadan önce)
  updateKatAyriUI();
  if(!villaFloors){ villaOffset=bodrumSayisi; return; }
  reflowFloors();
  const kat=ustKat();
  const katYuk=+document.getElementById('katYuk').value||2.9;
  villaFloors.forEach(f=>{ if(!f) return;
    f.ui.katSayisi=String(kat); f.ui.katYuk=String(katYuk); f.ui.bodrumSayisi=String(bodrumSayisi);
    if(f.plan){ f.plan.kat=kat; f.plan.binaYuk=kat*katYuk; } });
  /* aktif kat (kaymış olabilir) canlı globallere getirilir */
  const snap=villaFloors[activeFloor];
  if(snap&&snap.plan){ try{ restoreState(snap,{fit:false,keepFloors:true}); }catch(err){ console.error(err); } }
  renderFloorTabs();
}
function renderFloorTabs(){
  const box=document.getElementById('floorTabs');
  const title=document.getElementById('unitSecTitle');
  if(!box) return;
  const villa=document.getElementById('binaTipi').value==='villa';
  if(!floorsOn()){
    box.style.display='none';
    if(title) title.textContent=villa?'Daire Tipleri (kat başına)':'Daire Tipleri (kat başına)';
    syncKatKullanimUI();   // switch kapalıyken de kullanım satırını (pasif) tazele
    positionOnb();
    return;
  }
  const total=totalFloors();
  box.style.display='flex'; box.innerHTML='';
  for(let k=total-1;k>=0;k--){   // üstten alta: en üst kat solda, bodrumlar sağda (kat istifi gibi)
    const b=document.createElement('button');
    const st=floorState(k);
    const u=(!villa)?usageOf(k):'konut';
    const ico=(u&&u!=='konut')?icon(u,'inl'):'';
    b.innerHTML=ico+floorName(k)+(st?' · '+fmt(shoelace(st.pts))+' m²':'');
    if(k===activeFloor) b.className='active';
    else if(!st) b.className='empty';
    b.title=st?(u!=='konut'?USAGE_TR[u]+' katı':''):'Henüz planlanmadı — geçince komşu katın sınırıyla başlar';
    b.addEventListener('click',()=>switchFloor(k));
    box.appendChild(b);
  }
  if(title) title.textContent=(villa?'Oda Programı — ':'Daire Tipleri — ')+floorName(activeFloor);
  syncKatKullanimUI();
  positionOnb();
}
/* "Nasıl kullanılır?" kartını (onb) sol-üst yığına göre konumlandır: kat sekmeleri ve/veya
   park çubuğu görünürken kartı onların ALTINA kaydır — yoksa kart (ampul) en üst kat sekmesinin
   üstünü örter. Hiçbiri görünmüyorsa inline top'u temizle → CSS varsayılanı (masaüstü 60 / mobil 74). */
function positionOnb(){
  if(typeof getComputedStyle!=='function') return; // tarayıcı dışı (test) ortamı: atla
  const seen=e=>e && e.offsetParent!==null && getComputedStyle(e).display!=='none';
  /* sol yığın: blok sekmeleri → kat sekmeleri → park çubuğu, her biri bir öncekinin altına.
     Taban 56px (araç çubuğunun altı); görünür her şerit yığına eklenir. */
  let top=56, placed=false;
  ['blockTabs','floorTabs','parkBar'].forEach(id=>{
    const e=document.getElementById(id);
    if(e && e.style && seen(e)){ e.style.top=top+'px'; top+=e.offsetHeight+6; placed=true; }
  });
  const onb=document.getElementById('onb');
  if(onb&&onb.style) onb.style.top = placed? (top+2)+'px' : '';
}
function switchFloor(k){
  if(!floorsOn()) return;
  if(k<0||k>=totalFloors()||k===activeFloor) return;
  if(plan) villaFloors[activeFloor]=stateSnapshot(true);
  const prev=activeFloor; activeFloor=k;
  const snap=villaFloors[k];
  if(snap&&snap.plan){
    try{
      restoreState(snap, {fit:false, keepFloors:true});
      /* iskelet (çekirdek) bu kat kaydedildikten sonra değiştiyse: bayat → iskelete göre yeniden üret */
      if(!plan.villa && lockedCore){
        const cur=captureCoreFrom(plan);
        if(JSON.stringify(cur)!==JSON.stringify(lockedCore)){
          resetCuts(); unitLayout={}; doorOverrides={}; extraDoors=[]; doorHidden={}; editHistory=[];
          generate(); villaFloors[k]=stateSnapshot(true);
        }
      }
    }
    catch(err){ console.error('kat geçişi:', err); activeFloor=prev; }
  } else if(plan){
    /* ilk ziyaret: sınır, program ve balkonlar komşu kattan miras kalır; merdiven
       zemindeki konumuna sabitlenir. Bodrum katı otopark başlar (mimari varsayılan), üstü konut. */
    katKullanim = (floorLevel(k)<0 && document.getElementById('binaTipi').value==='apartman') ? 'otopark' : 'konut';
    resetCuts(); unitLayout={}; doorOverrides={}; extraDoors=[]; doorHidden={}; editHistory=[];
    try{ generate(); villaFloors[k]=stateSnapshot(true); }
    catch(err){ console.error('kat üretimi:', err); }
  }
  renderFloorTabs();
}
document.getElementById('katAyri').addEventListener('change',e=>{
  if(e.target.checked){
    katKullanim='konut'; // kata-ayrı öncesi tek plan = zemin (konut); bayat global sızmasın
    villaFloors=new Array(totalFloors()).fill(null); activeFloor=zeminIdx(); villaOffset=bodrumSayisi;
    if(plan){ villaFloors[zeminIdx()]=stateSnapshot(true); runChecks(); render(); } // mevcut plan = zemin kat
  } else {
    floorsOff();
    if(plan){ runChecks(); render(); }
  }
  renderFloorTabs();
});

/* ================= site: çoklu blok (A B C D…) =================
   Bir parsele birden çok bina (blok) yerleştirildiğinde her blok KENDİ tam durumudur
   (sınır + program + katlar + çekirdek). blocks[i] = stateSnapshot(false) biçimi (kendi
   st.floors'unu içerir; st.blocks İÇERMEZ — özyineleme yok). Aktif blok canlı
   globallerdedir; blok geçişinde aktif blok kaydedilip hedef blok geri kurulur — tıpkı
   kat sekmeleri gibi, ama bir üst seviyede. Blok adları konuma göre OTOMATİK: 0→A, 1→B,
   … (Z sonrası AA, AB…). Parsel site-ortaktır: yeni blok mevcut parseli devralır. */
function siteOn(){ const cb=document.getElementById('siteMod'); return !!(blocks && cb && cb.checked); }
function blockName(i){
  let s=''; i=Math.max(0,i|0);
  do{ s=String.fromCharCode(65+(i%26))+s; i=Math.floor(i/26)-1; }while(i>=0);
  return s;
}
function courtyardsSnapshot(){ return courtyards.map(av=>({poly:av.poly.map(p=>({x:p.x,y:p.y}))})); }
/* aktif blok dışındaki blokların sınır poligonları — bağlamsal hayalet çizim için */
function otherBlockGhosts(){
  if(!siteOn()) return [];
  const out=[];
  blocks.forEach((b,i)=>{ if(i===activeBlock) return;
    if(b && b.pts && b.pts.length>=3) out.push({name:blockName(i), pts:b.pts}); });
  return out;
}
/* parseldeki tüm blokların toplam taban alanı (aktif blok canlı pts'ten) */
function siteFootprintTotal(){
  if(!siteOn()) return closed? shoelace(pts):0;
  let sum=0;
  blocks.forEach((b,i)=>{
    if(i===activeBlock){ if(closed) sum+=shoelace(pts); }
    else if(b && b.pts && b.pts.length>=3) sum+=shoelace(b.pts);
  });
  return sum;
}
/* tüm blokların Σ(taban × üst kat sayısı) — KAKS/emsal yaklaşığı (aktif blok canlı UI'den) */
function siteGrossTotal(){
  if(!siteOn()) return 0;
  let sum=0;
  blocks.forEach((b,i)=>{
    let fp=0, kat=1;
    if(i===activeBlock){ fp=closed?shoelace(pts):0; kat=ustKat(); }
    else if(b && b.pts && b.pts.length>=3){ fp=shoelace(b.pts); kat=Math.max(1,+((b.ui&&b.ui.katSayisi))||1); }
    sum+=fp*kat;
  });
  return sum;
}
/* aktif bloğu canlı globallerden anlık görüntüye yaz (plan varsa) */
function saveActiveBlock(){
  if(blocks && plan){ try{ blocks[activeBlock]=stateSnapshot(false); }catch(err){ console.error('blok kaydı:', err); } }
}
function renderBlockTabs(){
  const box=document.getElementById('blockTabs');
  if(!box) return;
  if(!siteOn()){ box.style.display='none'; positionOnb(); return; }
  box.style.display='flex'; box.innerHTML='';
  const lbl=document.createElement('span'); lbl.className='bl'; lbl.textContent='BLOK'; box.appendChild(lbl);
  blocks.forEach((b,k)=>{
    const btn=document.createElement('button');
    const area=(k===activeBlock)? (closed?shoelace(pts):0) : (b&&b.pts&&b.pts.length>=3?shoelace(b.pts):0);
    btn.innerHTML='Blok '+blockName(k)+(area>0?' · '+fmt(area)+' m²':'')
      +(blocks.length>1?'<span class="x" title="Bloğu sil" data-del="'+k+'">×</span>':'');
    if(k===activeBlock) btn.className='active';
    else if(!b||!b.plan) btn.className='empty';
    btn.title=(b&&b.plan)?('Blok '+blockName(k)):'Henüz planlanmadı — geçince boş tuvalde sınırını çizin';
    btn.addEventListener('click',ev=>{
      if(ev.target&&ev.target.dataset&&ev.target.dataset.del!==undefined){ ev.stopPropagation(); removeBlock(+ev.target.dataset.del); return; }
      switchBlock(k);
    });
    box.appendChild(btn);
  });
  const add=document.createElement('button'); add.className='add'; add.textContent='+ Blok';
  add.title='Yeni blok ekle (otomatik ad: Blok '+blockName(blocks.length)+')';
  add.addEventListener('click',addBlock);
  box.appendChild(add);
  positionOnb();
}
function switchBlock(k){
  if(!siteOn()||k<0||k>=blocks.length||k===activeBlock) return;
  saveActiveBlock();
  const prev=activeBlock; activeBlock=k;
  const snap=blocks[k];
  if(snap && snap.plan){
    try{ restoreState(snap, {keepBlocks:true}); }
    catch(err){ console.error('blok geçişi:', err); activeBlock=prev; renderBlockTabs(); return; }
  } else {
    clearCanvasForNewBlock();   // boş blok: tuvali çizime hazırla (bina ayarları + parsel korunur)
  }
  renderBlockTabs();
}
function addBlock(){
  if(!siteOn()) return;
  saveActiveBlock();
  blocks.push(null);
  activeBlock=blocks.length-1;
  clearCanvasForNewBlock();
  renderBlockTabs();
}
function removeBlock(k){
  if(!siteOn()||blocks.length<=1) return;
  if(typeof confirm==='function' && !confirm('Blok '+blockName(k)+' silinsin mi?')) return;
  if(k!==activeBlock) saveActiveBlock();
  blocks.splice(k,1);
  if(activeBlock>=blocks.length) activeBlock=blocks.length-1;
  else if(k<activeBlock) activeBlock--;
  const snap=blocks[activeBlock];
  if(snap && snap.plan){ try{ restoreState(snap,{keepBlocks:true}); }catch(err){ console.error(err); } }
  else clearCanvasForNewBlock();
  renderBlockTabs();
}
/* boş blok için tuvali temizle: yalnız geometri sıfırlanır; bina tipi/kat ayarları VE
   site parseli (site-ortak) korunur */
function clearCanvasForNewBlock(){
  pts=[]; closed=false; plan=null;
  balconies=[]; courtyards=[]; avluGhost=null; editHistory=[]; resetCuts();
  doorOverrides={}; extraDoors=[]; doorHidden={};
  villaFloors=null; activeFloor=0; lockedCore=null;
  const ka=document.getElementById('katAyri'); if(ka) ka.checked=false;
  document.getElementById('genBtn').disabled=true;
  document.getElementById('svgBtn').disabled=true; document.getElementById('pngBtn').disabled=true;
  document.getElementById('unitTable').style.display='none';
  document.getElementById('stArea').textContent='–'; document.getElementById('stPerim').textContent='–';
  updateKatAyriUI(); updateStructResetBtn(); render();
}
document.getElementById('siteMod').addEventListener('change',e=>{
  if(e.target.checked){
    blocks=[plan? stateSnapshot(false) : null]; activeBlock=0;   // mevcut bina = Blok A
  } else {
    blocks=null; activeBlock=0;                                   // aktif blok globallerde kalır
  }
  renderBlockTabs();
  if(plan) runChecks();
});

/* Custom +/- stepper: wraps a number input with large, easy-to-click buttons.
   Hold the button down to repeat. Dispatches 'change' so existing listeners fire. */
function makeStepper(inp){
  if(!inp || !inp.closest || !inp.parentNode || inp.closest('.stepper')) return;
  const wrap=document.createElement('span'); wrap.className='stepper';
  inp.parentNode.insertBefore(wrap, inp);
  const mk=t=>{const b=document.createElement('button'); b.type='button'; b.tabIndex=-1; b.textContent=t; return b;};
  const minus=mk('−'), plus=mk('+');
  wrap.appendChild(minus); wrap.appendChild(inp); wrap.appendChild(plus);
  const step=parseFloat(inp.step)||1;
  const bump=dir=>{
    const min=inp.min!==''?parseFloat(inp.min):-Infinity, max=inp.max!==''?parseFloat(inp.max):Infinity;
    let v=(parseFloat(inp.value)||0)+dir*step;
    v=Math.min(max, Math.max(min, Math.round(v*100)/100));
    if(v===parseFloat(inp.value)) return;
    inp.value=v;
    inp.dispatchEvent(new Event('change',{bubbles:true}));
  };
  [[minus,-1],[plus,1]].forEach(([btn,dir])=>{
    btn.addEventListener('pointerdown',e=>{
      e.preventDefault(); bump(dir);
      let rep=null;
      const stop=()=>{ clearTimeout(hold); clearInterval(rep);
        window.removeEventListener('pointerup',stop); window.removeEventListener('pointercancel',stop); window.removeEventListener('blur',stop); };
      const hold=setTimeout(()=>{ rep=setInterval(()=>{ if(!btn.isConnected){ stop(); return; } bump(dir); },120); },450);
      window.addEventListener('pointerup',stop); window.addEventListener('pointercancel',stop); window.addEventListener('blur',stop);
      btn.addEventListener('pointerleave',stop,{once:true});
    });
  });
}
function resetCuts(){ customCutsZ=null; editHistory=editHistory.filter(e=>e.type!=='cut'); }

/* ================= lejant ================= */
(function(){ const lg=document.getElementById('legend');
  for(const t in COLORS){ const s=document.createElement('span'); s.innerHTML=`<i style="background:${COLORS[t]}"></i>${TYPE_TR[t]}`; lg.appendChild(s);} })();
