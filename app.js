'use strict';
/* ================= durum ================= */
let pxPerM = 16, panX = 80, panY = 70;
let mode = 'draw';            // draw | pan
let measureStart = null;      // Ölçü aracı (M): birinci nokta (dünya koord) | null
let measureEnd = null;        // Ölçü aracı: ikinci nokta; ikisi de doluyken ölçüm ekranda kalır (yeni ilk tık eskisini siler)
let measureHover = null;      // Ölçü aracı: ikinci nokta sabitlenmeden imleci izleyen canlı önizleme ucu
let pts = [];                 // poligon köşeleri (m)
let roomPts = [];             // serbest oda çizimi (roomdraw modu): köşeler (m); kapanınca rasterize → yeni ODA
let closed = false;
let hoverP = null;
let blockDrawBad = null;      // S4a: site modunda çizilen blok sınırı aday hâli çakışırsa {reason,name} (kırmızı hayalet) | null
let plan = null;              // üretilen plan
let customCutsZ = null; // bölge başına ayırıcı konumları
let unitLayout = {};    // daire başına iç düzen tercihi: k → 'auto'|'flat'|'rail'
let dragging = null;          // {type:'pan'|'cut'|'wall', ...}
let hoverWall = null;         // imleç altındaki sürüklenebilir oda duvarı
let hoverRoomId = null;       // imleç altındaki oda (duvar ölçüsü vurgusu)
let hoverStruct = null;       // yapı modunda imleç altındaki yapı tutamağı {regId,handle}
let hoverCut = null;          // B4: imleç altındaki turuncu ayırıcı (cut) tutamağı {zi,idx} | null
let hoverStructH = null;      // B4: yapı modunda imleç altındaki tutamaç {kind:'core',regId,handle} | {kind:'bvert'|'bedge',idx}
let hoverBay = null;          // park modunda imleç altındaki park yeri index'i | null
let parkGhost = null;         // park modunda eklenecek boş park yeri önizlemesi {x,y,w,h,ang} | null
let parkGhostVert = null;     // U3: R ile çevrilen yerleştirme yönü override'ı (null=çubuk yönü) | true(dikey)/false(yatay)
let parkLastSx = null, parkLastSy = null; // son imleç (park modu) — R basınca önizleme aynı noktada anında dönsün
let amenities = [];           // S3: site imkanları (parsel-katmanı, dünya koord): {type, pts:[{x,y}...], x,y,w,h,ang}.
                              //   POLİGON MODELİ: pts = birincil şekil (yapı sınırı gibi köşe köşe çizilir); x/y/w/h = pts'ten TÜRETİLEN
                              //   eksen-hizalı bbox (3B dekor/etiket/hit kolaylığı için güncel tutulur — amenityBBoxSync). ang=0 (poligon dünya
                              //   yöneliminde; eski dikdörtgen kayıtları yüklemede ang'lı 4-köşeye çevrilir → io.js oku dalı). Bina footprint'i
                              //   DIŞINA konur; parsel-ORTAK (blok başına değil). 2D bahçede + 3B dış görünümde + drone prompt sinyalinde görünür.
let hoverAmenity = null;      // imkan modunda imleç altındaki imkan index'i | null
let hoverAmenityVert = null;  // imkan modunda imleç altındaki köşe tutamacı {i, vi} (tek-köşe sürükle) | null
let amenityGhost = null;      // (poligon modelinde kullanılmaz — geriye-uyum için tutulur)
let amenityType = 'green';    // aktif imkan tipi (çubuktan seçilir): green|playground|pool|ornament|seating
let amenityDrawPts = [];      // çizilmekte olan imkan poligonu (dünya koord köşeleri; yapı sınırı çizim deseni)
let amenityDrawHover = null;  // çizim önizlemesi: sonraki köşe adayı {x,y,closing?} | null
let amenityLastSx = null, amenityLastSy = null; // son imleç (imkan modu) — hover/önizleme aynı noktada tazelensin
/* ── POLİGON İMKAN geometri yardımcıları (io.js + interaction.js + view3d ORTAK; saf-veri, THREE'siz) ── */
function amenityClone(a){ const c=Object.assign({},a); if(a&&a.pts&&a.pts.map) c.pts=a.pts.map(p=>({x:p.x,y:p.y})); return c; }
/* eksen-hizalı bbox'ı pts'ten türet + x/y/w/h'yi güncelle (ang poligonda 0). pts yoksa dokunmaz. */
function amenityBBoxSync(a){
  if(a && a.pts && a.pts.length){ const bb=bboxOf(a.pts); a.x=bb.minX; a.y=bb.minY; a.w=bb.maxX-bb.minX; a.h=bb.maxY-bb.minY; }
  if(a && a.ang==null) a.ang=0;
  return a;
}
/* YÜKLEME KÖPRÜSÜ (TEK yer): eski dikdörtgen kayıt {x,y,w,h,ang} → 4-köşe pts (ang'lı döndürülmüş). */
function amenityRectToPts(a){
  const w=a.w||0, h=a.h||0, ang=(a.ang||0)*Math.PI/180, cx=a.x+w/2, cy=a.y+h/2, c=Math.cos(ang), s=Math.sin(ang);
  return [[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(d=>({x:cx+d[0]*c-d[1]*s, y:cy+d[0]*s+d[1]*c}));
}
/* deep-clone + pts garantisi + bbox eşitle (io oku dalı). */
function amenityLoad(a){ const c=amenityClone(a);
  if(!(c.pts && c.pts.length>=3)) c.pts=amenityRectToPts(c);
  amenityBBoxSync(c); return c; }
/* poligon alan-ağırlıklı centroid (etiket/dekor için); dejenere → bbox merkezi. */
function amenityCentroid(pts){
  if(!pts||pts.length<3) return pts&&pts.length? {x:pts[0].x,y:pts[0].y}:{x:0,y:0};
  let a=0,cx=0,cy=0; for(let i=0;i<pts.length;i++){ const p=pts[i],q=pts[(i+1)%pts.length]; const cr=p.x*q.y-q.x*p.y; a+=cr; cx+=(p.x+q.x)*cr; cy+=(p.y+q.y)*cr; }
  if(Math.abs(a)<1e-9){ const bb=bboxOf(pts); return {x:(bb.minX+bb.maxX)/2, y:(bb.minY+bb.maxY)/2}; }
  a*=0.5; return {x:cx/(6*a), y:cy/(6*a)};
}
let editHistory = [];         // elle düzenleme geçmişi (geri al): {type, ...} — pushEdit() ile yazılır
let redoHistory = [];         // ileri al yığını: undoEdit her geri almada o anki TAM durumu buraya iter; redoEdit geri yükler
const HIST_CAP = 100;         // geçmiş üst sınırı (en eski adım düşürülür)
let parcelPts = [];           // parsel poligonu (opsiyonel; bahçe = parsel − bina)
let parcelClosed = false;
let parcelSetback = [];       // imar çekme (yapı yaklaşma) sınırı: parselin içe-ofseti; şematik kılavuz
let parcelSat = null;         // uydu arka planı: {url, x, y, w, h, rot, cx, cy} (dünya koord.) | null
let parcelRot = 0;            // parsele uygulanan döndürme (rad, kuzey-yukarıya göre): eksene hizalama
let parcelImar = null;        // İBB e-Plan imar durumu: {fonksiyon,maksTaks,emsal,hmax,katAdedi,yogunluk,planAdi,planNotuId,ada,parsel,...} | null
let psFrontEdge = -1;         // FAZ 5: yola bakan parsel kenarı (parcelPts[i]→[i+1]); ön çekme bu kenara, arka karşı kenara, yan geri kalanlara | -1 = seçilmedi (hepsi yan)
let balconies = [];           // {ei, t0, t1, depth}: pts[ei]→pts[ei+1] kenarında, dışa doğru
let hoverBalk = null;         // balkon modu önizleme {ei,t0,t1,depth} | tutamaç vurgusu
let courtyards = [];          // iç avlular: {poly:[{x,y}...]} (dünya koord). generate() bunları footprint'ten oyar
let avluGhost = null;         // avlu modunda sürüklenen yeni/taşınan avlu önizlemesi {poly:[...], invalid?} | null
let avluDragIdx = -1;         // AV-2: taşınmakta/boyutlanmakta olan mevcut avlunun indeksi (render solid çizmez, ghost gösterir) | -1
let avluSuggestion = null;    // OTO-AVLU (avlu-rework): derin/karanlık footprint aday avlu önerisi {poly,darkDist,cx,cy} | null — avlu moduna girince hesaplanır, kullanıcı 'Öner' ile yerleştirir
let doorOverrides = {};       // elle kapı yeri: key -> {h,x,y}; geçersizleşirse otomatiğe düşer
let extraDoors = [];          // çift tıkla eklenen kapılar: {h,x,y}
let doorHidden = {};          // çift tıkla silinen otomatik kapılar: key -> true
let hoverDoor = null;         // kapı modunda imleç altındaki kapı kaydı
let windowOverrides = {};     // elle pencere ayarı: key -> {ei?,t?,w?,height?,sill?,full?} (kapının ikizi)
let extraWindows = [];        // çift tıkla eklenen cephe pencereleri: {ei,t,w?,height?,sill?,full?}
let windowHidden = {};        // çift tıkla silinen otomatik pencere: key -> true
let hoverWindow = null;       // pencere modunda imleç altındaki pencere kaydı
let selWindow = null;         // pencere modunda seçili pencere key'i (genişlik/yükseklik/parapet ayar paneli) | null
let koridorYon = 'oto';       // apartman koridor yönü: 'oto'|'yatay'|'dikey' (manuel override)
/* CEPHE-3: dış kabuk mimari tercihleri — SALT 3B görünüm/render'ı etkiler; plan üretimini (oda/duvar/
   çekirdek/mevzuat) DEĞİŞTİRMEZ. stateSnapshot.ui'ye eklenir → blok/kat başına taşınır (blocks[i].ui). */
let cikmaOn = false;          // çıkma: zemin-üstü katlar cephe hattından öne taşar (view3d dış kabuk)
let cikmaD = 0.7;             // çıkma derinliği (m) — REG.cikmaMax ile sınırlı
let roofType = 'teras';       // dış kabuk çatısı: 'teras' (düz, varsayılan/bugünkü) | 'kirma' (dört yüzlü kiremit)
let katKullanim = 'konut';    // AKTİF katın kullanım tipi (apartman + katları ayrı): 'konut'|'ticari'|'otopark'|'siginak'
let blocks = null;            // site "çoklu blok": blok başına TAM durum anlık görüntüsü (stateSnapshot biçimi, kendi katlarını içerir) | null
let activeBlock = 0;          // blocks aktifken düzenlenen blok indeksi (0 = Blok A)
let villaFloors = null;       // villa "katları ayrı planla": kat başına durum anlık görüntüsü (stateSnapshot biçimi) | null
let activeFloor = 0;          // villaFloors aktifken görüntülenen kat İNDEKSİ (0 = en alt bodrum; zemin = bodrumSayisi)
let planAutoRepaired = false; // içe aktarılan bozuk düzen otomatik yeniden üretildiyse true → runChecks bilgi notu gösterir (repairImportedPlan)
let bodrumSayisi = 0;         // bodrum (eksi) kat sayısı; toplam kat = bodrum + üst. villaFloors indeksi: 0=en alt bodrum, zeminIdx()=zemin
let villaOffset = 0;          // villaFloors dizisinin kurulduğu bodrum sayısı (sayaç değişiminde indeks kaymasını yönetmek için)
let floorClip = null;         // kat düzeni kopyala/uygula tamponu: {src, snap} | null
let lockedCore = null;        // bina iskeleti: kilitli çekirdek öğeleri [{type,name,x0,y0,x1,y1}] (dünya koord, katlar arası ortak) | null
let exportView = null;        // io.js dışa aktarımı sırasında render() için geçici görünüm

/* ================= geri al / ileri al geçmişi =================
   pushEdit: TÜM düzenleme girdileri buradan geçer → ileri-al yığınını sıfırlar (yeni iş
   geleceği siler), insan-okur etiket ekler (geçmiş paneli), yığını HIST_CAP'e sınırlar.
   İstisna: redoEdit'in __snap geri-itişi ham editHistory.push kullanır (redo'yu silmemeli). */
const EDIT_LABELS = {
  wallsnap:'Duvar taşındı', cut:'Daire sınırı', door:'Kapı', balk:'Balkon', avlu:'Avlu',
  park:'Otopark', retype:'Oda tipi', swap:'Oda yeri', unitswap:'Daire taşındı',
  corelock:'Çekirdek', bound:'Sınır taşındı', bounddraw:'Sınır köşesi', structedit:'Yapı elemanı',
  ulayout:'Daire düzeni', sitemove:'Blok taşındı', roomdraw:'Oda çizildi', amenity:'Site imkanı', __snap:'Adım'
};
function labelFor(e){
  if(!e) return 'Düzenleme';
  if(e.type==='room') return e.op==='add' ? 'Oda eklendi' : 'Oda silindi';
  return EDIT_LABELS[e.type] || 'Düzenleme';
}
function pushEdit(e){
  if(e && !e.label) e.label = labelFor(e);
  editHistory.push(e);
  redoHistory = [];                                 // yeni düzenleme → ileri-al geçersiz
  if(editHistory.length > HIST_CAP) editHistory.shift();
}

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
    resetCuts(); debSafeGen();   // B5: stepper basılı-tut → tek üretim (200 ms trailing)
  }));
  box.querySelectorAll('.del').forEach(b=>b.addEventListener('click',e=>{
    unitSpecs.splice(+e.target.dataset.i,1); renderUnits(); resetCuts(); safeGen();
  }));
}
/* UI kaynaklı yeniden üretim güvenli sarmalayıcı: generate() içinde beklenmeyen bir hata
   olsa bile olay işleyicisi yarıda kalıp arayüzü bozmasın (konsola yaz, akış sürsün). */
function safeGen(){ try{ if(plan) generate(); }catch(err){ console.error('generate() hata:', err); } }
/* B5: spec input'ları (özellikle stepper basılı-tut) her tetikte generate() koşturuyordu →
   büyük planda UI donuyordu. Trailing debounce: son değişiklikten 200 ms sonra TEK safeGen.
   Değer mutasyonu ÇAĞIRANDA senkron kalır; yalnız üretim ertelenir. Test ortamında
   (setTimeout stub'ı) ms geçer; testler generate()'i doğrudan çağırdığından etkilenmez. */
let _debGenT=null;
function debSafeGen(delay){
  if(typeof setTimeout!=='function'){ safeGen(); return; }
  clearTimeout(_debGenT);
  _debGenT=setTimeout(()=>{ _debGenT=null; safeGen(); }, delay||200);
}
document.getElementById('addUnit').addEventListener('click',()=>{
  if(document.getElementById('binaTipi').value==='villa') return;
  unitSpecs.push({oda:3, salon:1, ensuite:true, acik:false, adet:1}); renderUnits(); resetCuts(); safeGen();
});
document.getElementById('binaTipi').addEventListener('change',()=>{ closeFloorPaste(); lockedCore=null; updateStructResetBtn(); renderUnits(); updateKatAyriUI(); resetCuts(); safeGen(); });
document.getElementById('koridorYon').addEventListener('change',e=>{ koridorYon=e.target.value; resetCuts(); safeGen(); });
/* CEPHE-3: çıkma / çatı tipi — dış kabuk (3B) tercihleri. generate() ÇAĞIRMAZLAR (plan üretimi
   değişmez); yalnız globalleri günceller + açık dış kabuğu tazeler (View3D.refreshExterior). */
function cikmaMaxD(){ return (typeof REG!=='undefined' && REG.cikmaMax) ? REG.cikmaMax : 1.5; }
function syncCephe3UI(){
  const on=document.getElementById('cikmaOn'), dRow=document.getElementById('cikmaDRow'),
        dIn=document.getElementById('cikmaD'), rt=document.getElementById('catiTipi');
  if(on) on.checked=!!cikmaOn;
  if(dRow) dRow.style.display = cikmaOn ? '' : 'none';
  if(dIn){ dIn.max=cikmaMaxD(); const v=Math.max(0.5,Math.min(cikmaMaxD(),+cikmaD||0.7)); cikmaD=v; dIn.value=v.toFixed(1); }
  if(rt) rt.value=roofType;
}
function refreshExteriorShell(){ try{ if(window.View3D && typeof View3D.refreshExterior==='function') View3D.refreshExterior(); }catch(e){} }
{ const on=document.getElementById('cikmaOn'); if(on) on.addEventListener('change',()=>{ cikmaOn=on.checked; syncCephe3UI(); refreshExteriorShell(); }); }
{ const dIn=document.getElementById('cikmaD'); if(dIn){ makeStepper(dIn);
  dIn.addEventListener('change',()=>{ let v=parseFloat(dIn.value); if(!isFinite(v)) v=0.7; v=Math.max(0.5,Math.min(cikmaMaxD(),v)); cikmaD=v; dIn.value=v.toFixed(1); refreshExteriorShell(); }); } }
{ const rt=document.getElementById('catiTipi'); if(rt) rt.addEventListener('change',()=>{ roofType=(rt.value==='kirma'?'kirma':'teras'); refreshExteriorShell(); }); }
syncCephe3UI();
['katSayisi','katYuk'].forEach(id=>document.getElementById(id).addEventListener('change',()=>{ onFloorCountChange(); debSafeGen(); }));
['katSayisi','katYuk'].forEach(id=>makeStepper(document.getElementById(id)));
/* Duvar kalınlığı UI (L1-A1): mevzuat minimumunda başlar, kullanıcı yalnız ARTIRABİLİR.
   Görsel-only (hücre/alan değişmez) → değişince yalnız render() (generate YOK, ucuz). */
const WT_UI=[['wtDis','dis'],['wtDaire','daireArasi'],['wtIc','icBolme']];
function syncWallThickUI(){
  const D=(typeof REG!=='undefined'&&REG.duvar)||{};
  WT_UI.forEach(([id,t])=>{ const el=document.getElementById(id); if(!el||typeof D[t]!=='number') return;
    el.min=D[t]; el.max=0.6; const ov=+wallThick[t];
    el.value=(isFinite(ov)&&ov>D[t]?ov:D[t]).toFixed(2); });
}
WT_UI.forEach(([id,t])=>{ const el=document.getElementById(id); if(!el) return;
  el.addEventListener('change',()=>{ const D=(typeof REG!=='undefined'&&REG.duvar)||{}, min=D[t]; let v=parseFloat(el.value);
    if(!isFinite(v)||v<=min){ delete wallThick[t]; el.value=min.toFixed(2); }   // min ya da altı → override kaldır (minimuma dön)
    else { v=Math.min(v,0.6); wallThick[t]=v; el.value=v.toFixed(2); }
    // görsel-only: render (duvar bandı) + buildUnitTable (brüt canlı büyür/küçülür); generate YOK, net sabit.
    if(typeof buildUnitTable==='function') buildUnitTable();
    if(typeof render==='function') render(); });
});
syncWallThickUI();
document.getElementById('bodrumSayisi').addEventListener('change',()=>{
  const bi=document.getElementById('bodrumSayisi');
  bodrumSayisi=Math.max(0,Math.min(4,+bi.value||0)); bi.value=String(bodrumSayisi); // global ÖNCE güncellenir (reflow okur)
  onFloorCountChange(); debSafeGen();
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
   Her kat ayrı bir kullanıma ayrılabilir: Konut (varsayılan, daire yerleşimi),
   Ticari (zemin dükkânlar), Otopark (bodrum araç), Sığınak (bodrum sığınak).
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
  resetCuts(); unitLayout={}; doorOverrides={}; extraDoors=[]; doorHidden={}; windowOverrides={}; extraWindows=[]; windowHidden={}; editHistory=[];
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
/* İş B1: floorState'in TAM-stateSnapshot ikizi — k. katın {pts,plan,balconies,courtyards,doors,windows,...}
   TAM anlık görüntüsünü döndürür (blockFloorplanMap'in beklediği bsnap biçimi). Aktif kat: canlı
   globallerden stateSnapshot(true) (bare=true → floors özyinelemesi YOK); diğerleri villaFloors[k]'nin
   kendi anlık görüntüsü. groundFloorSnapshot/upperFloorSnapshot (aşağıda) + view3d.js kat-başına dış
   cephe kurulumu (buildExterior) ORTAK kullanır. floorsOn() kapalıysa/kat yoksa null. */
function floorSnapshotAt(k){
  if(typeof floorsOn!=='function' || !floorsOn()) return null;
  if(k===activeFloor) return (typeof stateSnapshot==='function')?stateSnapshot(true):null;
  return (villaFloors&&villaFloors[k])||null;
}
if(typeof window!=='undefined'){ window.floorSnapshotAt=floorSnapshotAt; }
/* İş 1 + İş 3: kat düzeni "imzası" — aynı imzaya düşen ARDIŞIK katlar 3B kat çipinde TEK örnekte
   birleşir (İş 2, floorGroupsForTest) VE mobilya/malzeme deposunda AYNI bileşik anahtarı paylaşır
   (İş 3, "tip kat" doğal paylaşımı). g.id BİLİNÇLİ dışarıda (klonlanan katta bölge numarası kayabilir;
   önemli olan tip+hücre kümesi, sıra numarası değil). Mobilya/malzeme İMZAYA GİRMEZ — aksi hâlde
   döşemek/boyamak imzayı değiştirir, sonsuz "farklı kat" döngüsü oluşurdu.
   k===activeFloor ise CANLI globallerden (stateSnapshot bare — yan etkisiz, doğrulandı: bare=true
   villaFloors/blocks'a YAZMAZ), değilse villaFloors[k]'nin anlık görüntüsünden okur. Ziyaret edilmemiş
   kat (plan yok) → null: ne gruplanır ne bileşik anahtara girer (İş 3 legacy düz-anahtara düşer). */
/* İş K1a: floorLayoutSig'in SAF çekirdeği — verilen snapshot objesinden (stateSnapshot biçimi)
   imzayı hesaplar; kat indeksi/canlı global OKUMAZ. floorLayoutSig buna delege eder (davranış
   byte-aynı). view3d.js DİĞER-blok kat-başına dış cephe kurulumu (extBlockFloorPlans) blocks[i]
   .floors[k] girişleri için doğrudan kullanır (o katlar villaFloors'ta değil, blok snapshot'ında). */
function floorSigOfSnap(st){
  if(!st||!st.plan) return null;
  const p=st.plan;
  const regs=p.regions.map(g=>g.type+':'+g.cells.join(',')).sort().join('|');
  return [p.rows,p.cols,p.minX,p.minY,p.katKullanim,p.inside.join(''),regs,
          JSON.stringify(st.doors||{}),JSON.stringify(st.windows||{})].join('#');
}
if(typeof window!=='undefined'){ window.floorSigOfSnap=floorSigOfSnap; }
function floorLayoutSig(k){
  const st=(k===activeFloor)?stateSnapshot(true):(villaFloors&&villaFloors[k]);
  return floorSigOfSnap(st);
}
/* İş K1b: bir blok snapshot'ından ZEMİN kat indeksi — zeminIdx()'in snapshot-tabanlı saf ikizi.
   stateSnapshot ui.bodrumSayisi'ni String yazar (io.js); floors dizisi bodrum+üst katları birlikte
   indeksler (reflowFloors kuralı: zemin indeksi = bodrum sayısı). Eski/eksik kayıtta (ui yok /
   alan yok) 0'a düşer (bodrumsuz varsayım). view3d.js extBlockFloorPlans kullanır. */
function blockZeminIdxOf(snap){
  const b=(snap&&snap.ui)? parseInt(snap.ui.bodrumSayisi,10) : 0;
  return (isFinite(b)&&b>0)? b : 0;
}
if(typeof window!=='undefined'){ window.blockZeminIdxOf=blockZeminIdxOf; }
/* İş 3: mobilya/malzeme depo (window.__kptaFurniture / window.__kptaMaterials) OKUMA-çözümleyici.
   Depo anahtarı roomId (legacy) ya da roomId+'@@'+floorLayoutSig(o anki kat) olabilir; bu fonksiyon
   AKTİF kat/blok bağlamında her roomId için TEK bir girdiye çözer. Öncelik:
   (1) TAM imza eşleşmesi — düzen değişmedi, doğrudan uygula.
   (2) Aynı kat+blok'un (başka bir eski imzayla yazılmış) EN SON girişi — düzen (kapı/duvar) değişti ama
       mobilya/malzeme hâlâ BU katın; en yeni __t kazanır (furnPruneInvalid/furnRectInPoly sığmayanı
       zaten geometrik olarak ayıklar).
   (3) legacy DÜZ roomId anahtarı — bu bileşik-anahtar değişikliğinden ÖNCEKİ kayıtlar (geri-uyum).
   io.js (export furniture/materials okuma) + view3d.js (hydrateMaterials) ORTAK kullanır. */
function floorStoreResolve(store){
  if(!store) return {};
  const fl=(typeof activeFloor!=='undefined')?activeFloor:0, bl=(typeof activeBlock!=='undefined')?activeBlock:0;
  const sig=floorLayoutSig(fl);
  const byRoom={};
  Object.keys(store).forEach(k=>{
    const v=store[k]; if(!v) return;
    const i=k.indexOf('@@');
    if(i<0){ (byRoom[k]=byRoom[k]||{}).legacy=v; return; }
    const rid=k.slice(0,i), s=k.slice(i+2);
    const b=(byRoom[rid]=byRoom[rid]||{});
    if(sig!=null && s===sig) b.exact=v;
    if(v.__floor===fl && v.__block===bl){
      if(!b.sameFloor || (v.__t||0)>=(b.sameFloor.__t||0)) b.sameFloor=v;
    }
  });
  const out={};
  Object.keys(byRoom).forEach(rid=>{
    const b=byRoom[rid];
    out[rid]=b.exact||b.sameFloor||b.legacy||null;
  });
  return out;
}
/* İş 3: mobilya/malzeme depo YAZMA-yardımcısı — TEK bir oda için read-modify-write: aynı kat+blok'un
   ESKİ (bayat imzalı) girişlerini + legacy düz anahtarı temizler (store'un DİĞER katlara/bloklara ait
   girişlerine DOKUNMAZ — "tüm store'u ez" değil, hedefli temizlik), value doluysa GÜNCEL imzayla
   (+ __t/__floor/__block damgasıyla) yazar. value boş/null → yalnız temizlik (oda bu kat için boşaltıldı).
   view3d.js persistFurniture/setFurniture/persistMaterials ORTAK kullanır. */
function floorStoreWrite(store, roomId, value){
  delete store[roomId];   // tek seferlik legacy düz-anahtar temizliği
  const fl=(typeof activeFloor!=='undefined')?activeFloor:0, bl=(typeof activeBlock!=='undefined')?activeBlock:0;
  const prefix=roomId+'@@';
  Object.keys(store).forEach(k=>{
    if(k.indexOf(prefix)!==0) return;
    const v=store[k]; if(v && v.__floor===fl && v.__block===bl) delete store[k];
  });
  const empty=!value || (Array.isArray(value)? !value.length : !(value.floor||value.wall));
  if(empty) return;
  const sig=floorLayoutSig(fl);
  value.__t=Date.now(); value.__floor=fl; value.__block=bl;
  store[sig!=null?(prefix+sig):roomId]=value;
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
  if(typeof updateAmenityBtn==='function') updateAmenityBtn();   // S3: bina çizilince site imkanları butonu görünür
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
  closeFloorPaste();                                              // kat/bodrum sayısı değişti: reflow src indeksini kaydırır → tampon bayat kalır
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
  makeStripDraggable('floorTabs');   // "KAT" grip'inden sürüklenebilir
  const villa=document.getElementById('binaTipi').value==='villa';
  if(!floorsOn()){
    box.style.display='none';
    if(title) title.textContent=villa?'Daire Tipleri (kat başına)':'Daire Tipleri (kat başına)';
    const fcb0=document.getElementById('floorCopyBtn'); if(fcb0) fcb0.style.display='none';
    closeFloorPaste();
    syncKatKullanimUI();   // switch kapalıyken de kullanım satırını (pasif) tazele
    positionOnb();
    return;
  }
  const total=totalFloors();
  box.style.display='flex'; box.innerHTML='';
  { const g=document.createElement('span'); g.className='bl'; g.textContent='KAT'; g.title='Sürükle: kutuyu taşı'; box.appendChild(g); }
  for(let k=total-1;k>=0;k--){   // üstten alta: en üst kat solda, bodrumlar sağda (kat istifi gibi)
    const b=document.createElement('button');
    const st=floorState(k);
    const u=(!villa)?usageOf(k):'konut';
    const ico=(u&&u!=='konut')?icon(u,'inl'):'';
    b.innerHTML=ico+floorName(k)+(st?' · '+fmt(shoelace(st.pts))+' m²':'');
    if(k===activeFloor) b.className='active';
    else if(!st) b.className='empty';
    { const tip=st?(u!=='konut'?USAGE_TR[u]+' katı — tıkla: bu kata geç':'Tıkla: bu kata geç'):'Henüz planlanmadı — geçince komşu katın sınırıyla başlar';
      b.setAttribute('data-tip',tip); b.setAttribute('aria-label',floorName(k)); }
    b.addEventListener('click',()=>switchFloor(k));
    box.appendChild(b);
  }
  if(totalFloors()>=2){   // şeritte kopyala girişi — sol paneldeki #floorCopyBtn ile aynı iş (bağlam: kat sekmeleri); şerit her çizimde sıfırlanır → handler tazelenir
    const cp=document.createElement('button');
    cp.className='fcopy'; cp.innerHTML=icon('copy','inl');
    cp.setAttribute('data-tip','Bu kat düzenini kopyala → katlara uygula');
    cp.setAttribute('aria-label','Bu kat düzenini kopyala');
    cp.addEventListener('click',copyActiveFloorLayout);
    box.appendChild(cp);
  }
  if(title) title.textContent=(villa?'Oda Programı — ':'Daire Tipleri — ')+floorName(activeFloor);
  const fcb=document.getElementById('floorCopyBtn'); if(fcb) fcb.style.display = (totalFloors()>=2)?'':'none';
  renderFloorPaste(false);   // panel açıksa not/onay kutularını tazele (kapalıysa gizli kalır)
  syncKatKullanimUI();
  positionOnb();
}
/* Sol-üst yüzen şeritleri (blok/kat sekmeleri + park çubuğu) dikey araç rayının SAĞINDA üst üste yığ.
   Elle sürüklenen (dataset.moved) kutuya dokunma — kendi bıraktığı yerde kalır. */
function positionOnb(){
  if(typeof getComputedStyle!=='function') return; // tarayıcı dışı (test) ortamı: atla
  const seen=e=>e && e.offsetParent!==null && getComputedStyle(e).display!=='none';
  // masaüstü: dikey rayın SAĞINDA, üstten (10) · mobil (≤700): YATAY araç çubuğunun ALTINDA (64)
  let top=(typeof window!=='undefined' && window.innerWidth<=700) ? 64 : 10;
  // araç ipucu rozeti (#modeBadge) hep görünür ve aynı köşede → yığının İLK elemanı;
  // yoksa blok/kat şeritleri altında kalıyor (site switch şikayeti, 2026-07-06)
  const mb=document.getElementById('modeBadge');
  if(mb && seen(mb)){ mb.style.top=top+'px'; top+=mb.offsetHeight+6; }
  ['blockTabs','floorTabs','parkBar','amenityBar'].forEach(id=>{
    const e=document.getElementById(id);
    if(!(e && e.style && seen(e))) return;
    if(e.dataset && e.dataset.moved) return;         // kullanıcı sürükledi → otomatik yığından çıkar
    e.style.top=top+'px'; top+=e.offsetHeight+6;
  });
}
/* Yüzen şerit kutusunu (blok/kat sekmeleri) grip'ten (.bl etiketi) sürüklenebilir yap — unitTable deseni.
   Kutu innerHTML ile yeniden çizildiğinden dinleyici KUTUYA (kalıcı) bağlanır; grip her çizimde yenilenir. */
function makeStripDraggable(id){
  const box=document.getElementById(id); if(!box || box.__dragWired) return; box.__dragWired=true;
  let d=null;
  box.addEventListener('pointerdown',e=>{
    const h=e.target.closest && e.target.closest('.bl'); if(!h) return;   // yalnız grip'ten sürükle
    const r=box.getBoundingClientRect(), pr=box.parentElement.getBoundingClientRect();
    d={dx:e.clientX-r.left, dy:e.clientY-r.top, pr}; box.dataset.moved='1'; box.style.right='auto'; e.preventDefault();
  });
  window.addEventListener('pointermove',e=>{ if(!d) return;
    box.style.left=Math.max(0, e.clientX-d.pr.left-d.dx)+'px';
    box.style.top =Math.max(0, e.clientY-d.pr.top -d.dy)+'px'; });
  const end=()=>{ d=null; };
  window.addEventListener('pointerup',end); window.addEventListener('pointercancel',end);
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
          resetCuts(); unitLayout={}; doorOverrides={}; extraDoors=[]; doorHidden={}; windowOverrides={}; extraWindows=[]; windowHidden={}; editHistory=[];
          generate(); villaFloors[k]=stateSnapshot(true);
        }
      }
    }
    catch(err){ console.error('kat geçişi:', err); activeFloor=prev; }
  } else if(plan){
    /* ilk ziyaret: sınır, program ve balkonlar komşu kattan miras kalır; merdiven
       zemindeki konumuna sabitlenir. Bodrum katı otopark başlar (mimari varsayılan), üstü konut. */
    katKullanim = (floorLevel(k)<0 && document.getElementById('binaTipi').value==='apartman') ? 'otopark' : 'konut';
    resetCuts(); unitLayout={}; doorOverrides={}; extraDoors=[]; doorHidden={}; windowOverrides={}; extraWindows=[]; windowHidden={}; editHistory=[];
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

/* ================= kat düzeni kopyala → hedef katlara uygula =================
   Aktif katın TÜM düzeni (bölgeler + kapılar + elle düzenlemeler) tampona alınır; kullanıcı
   uyumlu hedef katları onay kutusuyla seçip uygular. Uyumlu = aynı kullanım tipi + (ziyaret
   edilmemiş ya da aynı taban ızgarası). Çekirdek katlar arası ortak (lockedCore) olduğundan
   kopyalanan düzenin çekirdeği hedefte zaten hizalıdır. Kat değişiminde tampon temizlenir.
   (floorClip yukarıda, diğer kat state'iyle birlikte bildirildi.) */
function floorPasteOK(k){
  if(!floorClip || k===floorClip.src) return false;
  if(usageOf(k)!==(floorClip.snap.plan.katKullanim||'konut')) return false;   // aynı kullanım tipi
  const f=villaFloors&&villaFloors[k];
  if(!f||!f.plan) return true;                                   // ziyaret edilmemiş kat: düzeni devralır
  const a=floorClip.snap.plan, b=f.plan;                         // ziyaret edilmiş: taban birebir aynı olmalı
  if(a.rows!==b.rows||a.cols!==b.cols||a.minX!==b.minX||a.minY!==b.minY) return false;
  if(!a.inside||!b.inside||a.inside.length!==b.inside.length) return false;
  for(let i=0;i<a.inside.length;i++) if(!!a.inside[i]!==!!b.inside[i]) return false;
  return true;
}
function copyActiveFloorLayout(){
  if(!floorsOn()||!plan) return;
  villaFloors[activeFloor]=stateSnapshot(true);                  // güncel (elle düzenlenmiş) düzeni yakala
  floorClip={ src:activeFloor, snap:JSON.parse(JSON.stringify(villaFloors[activeFloor])) };
  if(typeof showPanelTab==='function') showPanelTab('daireler'); // panel "daireler" sekmesinde → şeritten kopyalayınca görünür kıl
  renderFloorPaste(true);
  const p=document.getElementById('floorPastePanel');
  if(p&&p.scrollIntoView) p.scrollIntoView({block:'nearest'});
}
function renderFloorPaste(open){
  const panel=document.getElementById('floorPastePanel'),
        list=document.getElementById('floorPasteList'),
        head=document.getElementById('floorPasteHead');
  if(!panel||!list||!head) return;
  if(!floorClip || !floorsOn()){ panel.style.display='none'; return; }
  if(open) panel.style.display='';
  head.innerHTML='<b>'+floorName(floorClip.src)+'</b> düzeni kopyalandı — hangi katlara uygulansın?';
  /* tampon kat geçişinde yaşadığından liste yeniden çizilir → kullanıcının ELLE işaret/kaldır
     seçimlerini koru: hâlâ uygun (enabled) satırlarda önceki seçimi uygula, yeni/az önce
     devre dışı kalmış satırlar varsayılana döner */
  const prev={};
  list.querySelectorAll('input[type=checkbox][data-k]').forEach(cb=>{ prev[cb.dataset.k]={c:cb.checked,en:!cb.disabled}; });
  const total=totalFloors(), buUse=floorClip.snap.plan.katKullanim||'konut',
        apt=document.getElementById('binaTipi').value==='apartman';
  let html='', any=false;
  for(let k=total-1;k>=0;k--){
    if(k===floorClip.src) continue;
    const ok=floorPasteOK(k), visited=!!(villaFloors[k]&&villaFloors[k].plan);
    /* konut kaynak + ziyaret edilmemiş bodrum: uygulanabilir ama VARSAYILAN işaretsiz — istemeden
       bodrumu konut yapma tuzağını önler (kullanıcı bilerek işaretlerse uygulanır) */
    const bodrumOpt = ok && !visited && apt && buUse==='konut' && floorLevel(k)<0;
    let checked = ok && !bodrumOpt;
    const pv=prev[k];                                            // hâlâ uygun + önceden de uygunsa kullanıcı seçimini koru
    if(ok && pv && pv.en) checked=pv.c;
    const note = ok ? (visited?'üzerine yazılır':(bodrumOpt?'bodrum — istersen seç':'yeni'))
      : (usageOf(k)!==buUse ? (USAGE_TR[usageOf(k)]||'farklı kullanım') : 'farklı taban');
    if(ok) any=true;
    html += '<label style="display:flex;align-items:center;gap:7px;font-size:12px;padding:3px 0;'+(ok?'':'opacity:.45')+'">'
      + '<input type="checkbox" data-k="'+k+'" '+(ok?(checked?'checked':''):'disabled')+'>'
      + '<span>'+floorName(k)+'</span>'
      + '<small style="color:#9c8e76;margin-left:auto">'+note+'</small></label>';
  }
  list.innerHTML = any? html : '<div style="font-size:12px;color:#9c8e76">Uygulanacak uyumlu kat yok.</div>';
  const ap=document.getElementById('floorPasteApply'); if(ap) ap.disabled=!any;
}
function applyFloorLayout(){
  if(!floorClip) return;
  let n=0;
  document.querySelectorAll('#floorPasteList input[type=checkbox]').forEach(cb=>{
    if(!cb.checked||cb.disabled) return;
    const k=+cb.dataset.k;
    if(!floorPasteOK(k)) return;
    villaFloors[k]=JSON.parse(JSON.stringify(floorClip.snap));
    if(k===activeFloor){ try{ restoreState(villaFloors[k],{fit:false,keepFloors:true}); render(); }catch(err){ console.error('yapıştır:',err); } }
    n++;
  });
  if(n) renderFloorTabs();                                   // tablar + panel tazelenir (önce)
  const head=document.getElementById('floorPasteHead');      // sonucu EN SON yaz (tazeleme ezmesin)
  if(head) head.innerHTML = n? ('<b>'+n+' kat</b> bu düzene güncellendi') : 'Hiç kat seçilmedi.';
  if(n) setTimeout(closeFloorPaste, 1300);
}
function closeFloorPaste(){ floorClip=null;
  const p=document.getElementById('floorPastePanel'); if(p) p.style.display='none'; }
(function wireFloorClip(){
  const c=document.getElementById('floorCopyBtn'); if(c) c.addEventListener('click',copyActiveFloorLayout);
  const a=document.getElementById('floorPasteApply'); if(a) a.addEventListener('click',applyFloorLayout);
  const x=document.getElementById('floorPasteCancel'); if(x) x.addEventListener('click',closeFloorPaste);
})();

/* ================= site: çoklu blok (A B C D…) =================
   Bir parsele birden çok bina (blok) yerleştirildiğinde her blok KENDİ tam durumudur
   (sınır + program + katlar + çekirdek). blocks[i] = stateSnapshot(false) biçimi (kendi
   st.floors'unu içerir; st.blocks İÇERMEZ — özyineleme yok). Aktif blok canlı
   globallerdedir; blok geçişinde aktif blok kaydedilip hedef blok geri kurulur — tıpkı
   kat sekmeleri gibi, ama bir üst seviyede. Blok adları konuma göre OTOMATİK: 0→A, 1→B,
   … (Z sonrası AA, AB…). Parsel site-ortaktır: yeni blok mevcut parseli devralır. */
/* CEPHE-2 C1: bir blok haritasını YALITILMIŞ hesaplarken (blockFloorplanMap) fpFraming/fpFrameBBox
   site-modunu görmesin → kadraj o bloğun KENDİ pts'ine oturur (px2m dünya koordu doğru döner). */
let __fpBlockIsolate = false;
function siteOn(){ if(__fpBlockIsolate) return false; const cb=document.getElementById('siteMod'); return !!(blocks && cb && cb.checked); }
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
/* ================= S4a: blok çakışma geometrisi =================
   İki blok footprint'i AYNI parselde ALAN olarak üst üste binemez. YARATICI YORUM: yalnız
   kenar/köşe teması (bitişik nizam — ortak duvar) YASAK DEĞİL; TR'de yaygın ve fiziksel olarak
   geçerli. Bu yüzden overlap = "gerçek iç-alan örtüşmesi": (1) kenarların DÜZGÜN kesişimi
   (kolineer/uç-nokta teması hariç) ya da (2) bir poligonun bir iç noktası ötekinin STRICT içinde.
   Park/imkan SAT deseninin keyfi-poligon karşılığı; bloklar L/U taban olabilir → SAT değil. */
/* İnclusive segment kesişimi (kolineer/uç-nokta teması DAHİL) — parsel-sınır taşma testi için */
function segIntersects(p1,p2,p3,p4){
  const d=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const d1=d(p3,p4,p1), d2=d(p3,p4,p2), d3=d(p1,p2,p3), d4=d(p1,p2,p4);
  if(((d1>0&&d2<0)||(d1<0&&d2>0)) && ((d3>0&&d4<0)||(d3<0&&d4>0))) return true;
  const onSeg=(a,b,c)=> Math.min(a.x,b.x)-1e-9<=c.x && c.x<=Math.max(a.x,b.x)+1e-9
                      && Math.min(a.y,b.y)-1e-9<=c.y && c.y<=Math.max(a.y,b.y)+1e-9;
  if(Math.abs(d1)<1e-9 && onSeg(p3,p4,p1)) return true;
  if(Math.abs(d2)<1e-9 && onSeg(p3,p4,p2)) return true;
  if(Math.abs(d3)<1e-9 && onSeg(p1,p2,p3)) return true;
  if(Math.abs(d4)<1e-9 && onSeg(p1,p2,p4)) return true;
  return false;
}
/* DÜZGÜN (proper) kesişim: iki segment gerçekten BİRBİRİNİN İÇİNDEN geçer; salt uç-nokta/kolineer
   teması sayılmaz (bitişik duvarları örtüşme saymamak için). */
function properSegCross(p1,p2,p3,p4){
  const d=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const d1=d(p3,p4,p1), d2=d(p3,p4,p2), d3=d(p1,p2,p3), d4=d(p1,p2,p4);
  return ((d1>1e-9&&d2<-1e-9)||(d1<-1e-9&&d2>1e-9)) && ((d3>1e-9&&d4<-1e-9)||(d3<-1e-9&&d4>1e-9));
}
/* poligon içinde bir İÇ nokta (kenar teması sayılmasın diye ağırlık merkezine yakın örnek) */
function interiorSample(P){
  let sx=0, sy=0; P.forEach(p=>{ sx+=p.x; sy+=p.y; }); const cx=sx/P.length, cy=sy/P.length;
  if(pip(cx,cy,P)) return {x:cx,y:cy};
  // dışbükey olmayan poligonda centroid dışarı düşebilir → üçgen ağırlık merkezlerinden birini dene
  for(let i=1;i+1<P.length;i++){ const tx=(P[0].x+P[i].x+P[i+1].x)/3, ty=(P[0].y+P[i].y+P[i+1].y)/3;
    if(pip(tx,ty,P)) return {x:tx,y:ty}; }
  return {x:cx,y:cy};
}
/* A ve B kapalı poligonları ALAN olarak örtüşüyor mu (düzgün kesişim veya STRICT iç kapsama;
   yalnız kenar/köşe teması FALSE) */
function polysOverlap(A,B){
  if(!A||!B||A.length<3||B.length<3) return false;
  for(let i=0;i<A.length;i++){ const a1=A[i], a2=A[(i+1)%A.length];
    for(let j=0;j<B.length;j++){ const b1=B[j], b2=B[(j+1)%B.length];
      if(properSegCross(a1,a2,b1,b2)) return true; } }
  // düzgün kesişim yok → biri diğerini içeriyor olabilir; İÇ örnek noktayla test (kenar teması eler)
  const ia=interiorSample(A); if(pip(ia.x,ia.y,B)) return true;
  const ib=interiorSample(B); if(pip(ib.x,ib.y,A)) return true;
  return false;
}
/* Verilen aday sınır (candPts) site modunda başka bir blokla çakışıyor mu?
   ignoreIdx = kendi blok index'i (düzenlenirken kendini sayma; -1 = yeni/aday).
   Çakışan ilk bloğun adını döndürür (yoksa null). Site kapalıysa asla çakışmaz. */
function blockCollisionName(candPts, ignoreIdx){
  if(!siteOn() || !candPts || candPts.length<3) return null;
  for(let i=0;i<blocks.length;i++){
    if(i===ignoreIdx || i===activeBlock) continue;
    const b=blocks[i];
    if(b && b.pts && b.pts.length>=3 && polysOverlap(candPts, b.pts)) return blockName(i);
  }
  return null;
}
/* Aday sınır parsel DIŞINA taşıyor mu (parsel çizilmişse). Bir köşe parsel dışındaysa taşar. */
function blockOutsideParcel(candPts){
  if(!(parcelClosed && parcelPts.length>=3) || !candPts || candPts.length<3) return false;
  for(const p of candPts){ if(!pip(p.x,p.y,parcelPts)) return true; }
  // köşeler içeride ama bir kenar parsel sınırını kesiyorsa (parsel içbükeyse) yine taşar
  for(let i=0;i<candPts.length;i++){ const a=candPts[i], b=candPts[(i+1)%candPts.length];
    for(let j=0;j<parcelPts.length;j++){ const c=parcelPts[j], d=parcelPts[(j+1)%parcelPts.length];
      if(segIntersects(a,b,c,d)) return true; } }
  return false;
}
/* Aday çizilen (henüz kapanmamış) blok sınırının canlı geçerliliği — hayalet renk + statusHint için.
   {ok, reason:'block'|'parcel'|null, name} döndürür. Yalnız site modunda anlamlı. */
function blockDrawValidity(candPts){
  if(!siteOn() || !candPts || candPts.length<3) return {ok:true, reason:null, name:null};
  const nm=blockCollisionName(candPts, -1);
  if(nm) return {ok:false, reason:'block', name:nm};
  if(blockOutsideParcel(candPts)) return {ok:false, reason:'parcel', name:null};
  return {ok:true, reason:null, name:null};
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
/* ================= BLOK TASLAĞI (sınır çizili, yerleşim YOK) =================
   stateSnapshot(false) plan yoksa null döner → saveActiveBlock yalnız plan varken kaydediyordu;
   sınırı çizilmiş ama daha "Yerleşimi Oluştur" denmemiş bloktan çıkınca (blok geçişi / + Blok /
   blok silme) çizili pts SESSİZCE kayboluyordu. Oysa renderBlockTabs bu durumu ("sınır çizili,
   yerleşim bekliyor") zaten gösteriyor, siteBlocksData/siteFootprintTotal/view3d ise plansız
   blok snapshot'ını (b.pts + b.ui) zaten okuyabiliyor. TASLAK = stateSnapshot'ın plansız,
   alan-adları BİREBİR aynı küçük ikizi; blocks[] tüketicileri `b.plan &&` ile korunduğu için
   ek koşul gerektirmez (translateStateObj/site sürükleme dâhil).
   SINIR: yalnız KAPALI sınır (closed && pts>=3) taslağa yazılır — yarım çizim (closed=false)
   eskisi gibi atılır, çünkü siteBlocksData/shoelace inaktif bloğu KAPALI poligon varsayar. */
function blockDraftSnapshot(){
  if(plan || !closed || pts.length<3) return null;
  const el2=id=>{ const e=document.getElementById(id); return e?e.value:''; };
  return {v:1, app:'kat-plani-tasarim', draft:true,
    ui:{binaTipi:el2('binaTipi'), katSayisi:el2('katSayisi'), katYuk:el2('katYuk'), koridorYon:koridorYon, bodrumSayisi:String(bodrumSayisi),
        cikmaOn:(typeof cikmaOn!=='undefined'&&cikmaOn)?'1':'0', cikmaD:String((typeof cikmaD!=='undefined')?cikmaD:0.7),
        roofType:(typeof roofType!=='undefined')?roofType:'teras'},
    wallThick:(typeof wallThick!=='undefined'&&wallThick)?Object.assign({},wallThick):{},
    pts:pts.map(p=>({x:p.x,y:p.y})),
    courtyards:courtyardsSnapshot(),
    specs:unitSpecs.map(s=>({...s}))};
}
/* taslağı canlı globallere aç (restoreState'in plansız karşılığı; plan/ızgara YOK → validateState
   yolu ÇALIŞMAZ, bilinçli). clearCanvasForNewBlock ile başlar (parsel site-ortak → korunur),
   sonra taslağın sınır+program+bina ayarlarını basar. Çizim kapanışıyla (interaction.js) aynı
   UI durumunu kurar: genBtn açık + alan/çevre yazılı. */
function restoreBlockDraft(snap){
  clearCanvasForNewBlock();
  if(!snap || !snap.pts || snap.pts.length<3) return false;
  const u=snap.ui||{};
  const set=(id,v)=>{ const e=document.getElementById(id); if(e && v!==undefined && v!=='') e.value=v; };
  set('binaTipi', u.binaTipi); set('katSayisi', u.katSayisi); set('katYuk', u.katYuk);
  koridorYon=u.koridorYon||'oto'; set('koridorYon', koridorYon);
  if(u.bodrumSayisi!==undefined){ bodrumSayisi=Math.max(0,+u.bodrumSayisi||0); villaOffset=bodrumSayisi; set('bodrumSayisi', String(bodrumSayisi)); }
  if(typeof cikmaOn!=='undefined'){ cikmaOn=(u.cikmaOn==='1'||u.cikmaOn===true);
    const cd=parseFloat(u.cikmaD); cikmaD=(isFinite(cd)&&cd>0)?cd:0.7;
    roofType=(u.roofType==='kirma')?'kirma':'teras';
    if(typeof syncCephe3UI==='function') syncCephe3UI(); }
  wallThick=(snap.wallThick&&typeof snap.wallThick==='object')?Object.assign({},snap.wallThick):{};
  if(typeof syncWallThickUI==='function') syncWallThickUI();
  pts=snap.pts.map(p=>({x:p.x,y:p.y})); closed=true;
  courtyards=(snap.courtyards||[]).map(av=>({poly:(av.poly||[]).map(p=>({x:p.x,y:p.y}))}));
  if(snap.specs && snap.specs.length){ unitSpecs=snap.specs.map(s=>({...s})); if(typeof renderUnits==='function') renderUnits(); }
  document.getElementById('genBtn').disabled=false;
  document.getElementById('stArea').textContent=fmt(shoelace(pts))+' m²';
  document.getElementById('stPerim').textContent=fmt(perim(pts))+' m';
  if(typeof updateAmenityBtn==='function') updateAmenityBtn();
  updateKatAyriUI(); render();
  return true;
}
/* aktif bloğu canlı globallerden anlık görüntüye yaz (plan varsa TAM durum, yoksa çizili sınır taslağı) */
function saveActiveBlock(){
  if(!blocks) return;
  try{
    const snap = plan? stateSnapshot(false) : blockDraftSnapshot();
    if(snap) blocks[activeBlock]=snap;   // boş tuval (sınır yok) → mevcut kayıt korunur (eski davranış)
  }catch(err){ console.error('blok kaydı:', err); }
}
/* Site (genel görünüm) düğmesi yalnız site modunda görünür */
function updateSiteBtn(){
  const sb=document.getElementById('tSite'); if(!sb) return;
  const ok=siteOn();
  sb.style.display = ok? '' : 'none';
  if(!ok && mode==='site' && typeof setMode==='function') setMode('draw');
}
/* site genel görünümü için tüm blokların çizim verisi (aktif=canlı, diğerleri=anlık görüntü) */
function siteBlocksData(){
  const out=[];
  if(!siteOn()) return out;
  blocks.forEach((b,i)=>{
    if(i===activeBlock){
      if(closed) out.push({idx:i, name:blockName(i), pts, regions:(plan&&plan.regions)||[],
        minX:plan&&plan.minX, minY:plan&&plan.minY, cols:plan&&plan.cols, kat:ustKat(), active:true});
    } else if(b && b.pts && b.pts.length>=3){
      out.push({idx:i, name:blockName(i), pts:b.pts, regions:(b.plan&&b.plan.regions)||[],
        minX:b.plan&&b.plan.minX, minY:b.plan&&b.plan.minY, cols:b.plan&&b.plan.cols,
        kat:Math.max(1,+((b.ui&&b.ui.katSayisi))||1), active:false});
    }
  });
  return out;
}
/* ================= CEPHE-2 C1: BLOK HARİTASI (YALITILMIŞ, YAN-ETKİSİZ) =================
   Bir blok anlık görüntüsünden (stateSnapshot biçimi: pts + plan + courtyards + balconies +
   pencere/kapı override'ları) TAM buildFloorplanMap() üretir — DIŞ RENDER kabuğunda her bloğun
   pencereli/balkonlu cephesi için (view3d extOtherBlocks). Canlı 2B state'i BOZMAZ: ilgili tüm
   global'ler kaydedilir → blok verisi global'lere kurulur (restoreState plan-yeniden-kurma dalının
   DOM'suz/render'sız ikizi) → buildFloorplanMap() → global'ler GERİ konur. DOM/geçmiş/undo'ya iz
   bırakmaz. bsnap kendi pts/plan'ını taşımalı (aktif blok stateSnapshot(false) ile kaydedilmiş olur). */
function blockFloorplanMap(bsnap){
  if(!bsnap || !bsnap.plan || !bsnap.pts || bsnap.pts.length<3) return null;
  const sp=bsnap.plan;
  if(!sp.regions || !sp.units || !Array.isArray(sp.inside)) return null;
  // --- canlı global'leri sakla ---
  const SV={ plan, pts, closed, courtyards, balconies, unitSpecs, customCutsZ, unitLayout,
    doorOverrides, extraDoors, doorHidden, windowOverrides, extraWindows, windowHidden,
    parcelPts, parcelClosed, katKullanim, iso:__fpBlockIsolate };
  let map=null;
  try{
    __fpBlockIsolate=true;                                 // fpFraming bloğun KENDİ pts'ine kadrajlasın
    // --- blok girdilerini global'lere kur (restoreState girdileriyle aynı sıra) ---
    pts=bsnap.pts.map(p=>({x:p.x,y:p.y})); closed=true;
    courtyards=(bsnap.courtyards||[]).map(av=>({poly:(av.poly||[]).map(p=>({x:p.x,y:p.y}))}));
    balconies=(bsnap.balconies||[]).map(b=>({...b}));
    unitSpecs=(bsnap.specs||[]).map(s=>({...s}));
    customCutsZ=bsnap.cuts||null; unitLayout=bsnap.unitLayout||{};
    doorOverrides=(bsnap.doors&&bsnap.doors.ov)||{}; extraDoors=(bsnap.doors&&bsnap.doors.extra)||[]; doorHidden=(bsnap.doors&&bsnap.doors.hidden)||{};
    windowOverrides=(bsnap.windows&&bsnap.windows.ov)||{}; extraWindows=(bsnap.windows&&bsnap.windows.extra)||[]; windowHidden=(bsnap.windows&&bsnap.windows.hidden)||{};
    katKullanim=(sp.katKullanim)||'konut';
    // --- plan nesnesini yeniden kur (io.js restoreState 251-268 ile birebir; DOM/render YOK) ---
    const regions=sp.regions.map(g=>({id:g.id,name:g.name,type:g.type,unit:g.unit,cells:g.cells.slice(),ebHost:g.ebHost}));
    const cm=new Int16Array(sp.rows*sp.cols); cm.fill(-1);
    regions.forEach(g=>g.cells.forEach(i=>{ cm[i]=g.id; }));
    const inside=Uint8Array.from(sp.inside);
    const byId={}; regions.forEach(g=>{ byId[g.id]=g; });
    const unitObjs=sp.units.map(u=>({spec:{...u.spec}, comb:!!u.comb,
      antre:u.antre>=0?(byId[u.antre]||null):null, rooms:u.rooms.map(id=>byId[id]).filter(Boolean)}));
    plan={regions, cm, inside, rows:sp.rows, cols:sp.cols, minX:sp.minX, minY:sp.minY,
      corridorR0:sp.corridorR0, corridorR1:sp.corridorR1,
      stairs:(sp.stairs||[]).map(s=>({...s})), unitObjs,
      villa:!!sp.villa, kat:sp.kat, binaYuk:sp.binaYuk, perFloor:sp.perFloor,
      nAsansor:sp.nAsansor, asansorYeri:sp.asansorYeri,
      fireStairNeeded:sp.fireStairNeeded, teknikNeeded:sp.teknikNeeded,
      katKullanim:sp.katKullanim||'konut', zoneUI:sp.zoneUI||[]};
    if(typeof calcRegionMetrics==='function') regions.forEach(g=>calcRegionMetrics(g, plan.cols, plan.minX, plan.minY));
    if(sp.parking) plan.parking=JSON.parse(JSON.stringify(sp.parking));
    if(typeof computeWallRuns==='function') plan.wallRuns=computeWallRuns();
    map=(typeof buildFloorplanMap==='function')?buildFloorplanMap():null;
  }catch(err){ if(typeof console!=='undefined') console.error('blockFloorplanMap:', err); map=null; }
  finally{
    // --- canlı global'leri GERİ koy (2B state dokunulmadı) ---
    plan=SV.plan; pts=SV.pts; closed=SV.closed; courtyards=SV.courtyards; balconies=SV.balconies;
    unitSpecs=SV.unitSpecs; customCutsZ=SV.customCutsZ; unitLayout=SV.unitLayout;
    doorOverrides=SV.doorOverrides; extraDoors=SV.extraDoors; doorHidden=SV.doorHidden;
    windowOverrides=SV.windowOverrides; extraWindows=SV.extraWindows; windowHidden=SV.windowHidden;
    parcelPts=SV.parcelPts; parcelClosed=SV.parcelClosed; katKullanim=SV.katKullanim; __fpBlockIsolate=SV.iso;
  }
  return map;
}
if(typeof window!=='undefined'){ window.blockFloorplanMap=blockFloorplanMap; }
/* CEPHE-2 C2: ZEMİN TİCARİ AYRI CEPHE — katAyri açık apartmanda zemin katın KENDİ planından cephe
   üretmek için, zemin katın anlık görüntüsünü (stateSnapshot biçimi) döndürür. Zemin kat AKTİF ise
   canlı state'ten stateSnapshot(true) alınır (kat-içi, floors özyinelemesiz); değilse villaFloors[zeminIdx].
   Dönüş {snap, usage, isGround} — usage zemin kat kullanımı ('ticari' → ayrı vitrin cephesi kararı).
   Yalnız apartman + katAyri + ≥2 kat + zemin planı VAR iken anlamlı; aksi halde null. */
function groundFloorSnapshot(){
  try{
    if(typeof floorsOn!=='function' || !floorsOn()) return null;
    if(document.getElementById('binaTipi').value==='villa') return null;
    const gi=zeminIdx();
    const snap=floorSnapshotAt(gi);   // İş B1: floorState/stateSnapshot(true) veya villaFloors[gi] ikizi (davranış AYNI)
    if(!snap || !snap.plan || !snap.pts || snap.pts.length<3) return null;
    const usage=(snap.plan.katKullanim)||'konut';
    return { snap, usage, isGround:true };
  }catch(err){ if(typeof console!=='undefined') console.error('groundFloorSnapshot:', err); return null; }
}
if(typeof window!=='undefined'){ window.groundFloorSnapshot=groundFloorSnapshot; }
/* CEPHE-2 C2 (ek): ZEMİN katı AKTİF görüntülenirken (scene.__map = zemin/ticari) üst konut katları için
   temsili bir ÜST (zemin-harici, tercihen konut) kat snapshot'ı. view3d dış kabukta zemin ticariyken üst
   katları bunun cephesiyle kurar (aksi halde ticari vitrin TÜM katlara klonlanırdı). Bulunamazsa null →
   view3d aktif map'e düşer (eski davranış). */
function upperFloorSnapshot(){
  try{
    if(typeof floorsOn!=='function' || !floorsOn()) return null;
    if(document.getElementById('binaTipi').value==='villa') return null;
    const gi=zeminIdx(), total=totalFloors();
    // önce zemin-üstü KONUT kat, yoksa herhangi zemin-üstü kat
    let pick=-1, fallback=-1;
    for(let k=gi+1;k<total;k++){
      const snap=floorSnapshotAt(k);   // İş B1: floorState/stateSnapshot(true) veya villaFloors[k] ikizi (davranış AYNI)
      if(!snap||!snap.plan||!snap.pts||snap.pts.length<3) continue;
      if(fallback<0) fallback=k;
      if(((snap.plan.katKullanim)||'konut')==='konut'){ pick=k; break; }
    }
    const kk=(pick>=0)?pick:fallback; if(kk<0) return null;
    const snap=floorSnapshotAt(kk);
    if(!snap||!snap.plan||!snap.pts||snap.pts.length<3) return null;
    return { snap, usage:(snap.plan.katKullanim)||'konut', floorIdx:kk };
  }catch(err){ if(typeof console!=='undefined') console.error('upperFloorSnapshot:', err); return null; }
}
if(typeof window!=='undefined'){ window.upperFloorSnapshot=upperFloorSnapshot; }
/* imleç altındaki blok indeksi (site modunda taşı/seç) */
function hitBlock(wx,wy){
  const data=siteBlocksData();
  for(let i=0;i<data.length;i++) if(pip(wx,wy,data[i].pts)) return data[i].idx;
  return -1;
}
/* bir snapshot'ı (dx,dy) kadar çevir — yalnız dünya-koordinatlı alanlar; ızgara (hücre/merdiven)
   minX/minY ile taşınır; parsel site-ortak (çevrilmez); ayırıcılar sıfırlanır. Çok katlı blokta
   her kat anlık görüntüsü ve bina iskeleti (lockedCore, dünya koord) de çevrilir. */
function translateStateObj(st, dx, dy){
  const o=JSON.parse(JSON.stringify(st));
  const apply=s=>{
    if(!s) return;
    s.pts=(s.pts||[]).map(p=>({x:p.x+dx,y:p.y+dy}));
    if(s.courtyards) s.courtyards=s.courtyards.map(av=>({poly:av.poly.map(p=>({x:p.x+dx,y:p.y+dy}))}));
    if(s.plan){ s.plan.minX+=dx; s.plan.minY+=dy; }
    if(s.doors){
      if(s.doors.ov){ const ov={}; for(const k in s.doors.ov){ const d=s.doors.ov[k]; ov[k]={...d, x:d.x+dx, y:d.y+dy}; } s.doors.ov=ov; }
      if(s.doors.extra) s.doors.extra=s.doors.extra.map(d=>({...d, x:d.x+dx, y:d.y+dy}));
    }
    if(s.lockedCore) s.lockedCore=s.lockedCore.map(e=>({...e, x0:e.x0+dx, y0:e.y0+dy, x1:e.x1+dx, y1:e.y1+dy}));
    s.cuts=null;
  };
  apply(o);
  if(o.floors) o.floors=o.floors.map(f=>{ apply(f); return f; }); // villa/apartman katları (parsel hariç)
  return o;
}
/* aktif bloğu kopyala: footprint genişliği + 3 m sağa ötele, sıradaki harf otomatik */
function copyBlock(){
  if(!siteOn()) return;
  if(mode==='site'&&typeof setMode==='function') setMode('draw');
  saveActiveBlock();
  const src=blocks[activeBlock];
  if(!src || !src.plan || !src.pts || src.pts.length<3){
    if(typeof alert==='function') alert('Kopyalanacak planlı bir blok yok — önce aktif bloğu oluşturun.');
    return;
  }
  const bb=bboxOf(src.pts), dx=(bb.maxX-bb.minX)+3;
  const copy=translateStateObj(src, dx, 0);
  blocks.push(copy); activeBlock=blocks.length-1;
  try{ restoreState(copy, {keepBlocks:true}); }catch(err){ console.error('blok kopya:', err); }
  renderBlockTabs();
}
/* S4a: Pro panel (Parsel/İmar) kompakt site özeti — blok sayısı + Σ taban (TAKS oranı) +
   Σ inşaat (KAKS oranı). checks.js ile AYNI kaynağı (siteFootprintTotal/siteGrossTotal) okur ama
   ona DOKUNMAZ; salt bilgi satırı. Site kapalıysa gizlenir. render()'dan çağrılır. */
function updateSiteSummary(){
  const sec=document.getElementById('siteSummarySec'), box=document.getElementById('siteSummary');
  if(!sec||!box) return;
  if(!siteOn()){ sec.style.display='none'; return; }
  sec.style.display='';
  const n=blocks.length;
  const drawn=blocks.filter((b,i)=> i===activeBlock? closed : (b&&b.pts&&b.pts.length>=3)).length;
  const foot=siteFootprintTotal(), gross=siteGrossTotal();
  const pa=(parcelClosed&&parcelPts.length>=3)? shoelace(parcelPts) : 0;
  const imar=(typeof parcelImar!=='undefined')?parcelImar:null;
  const row=(label,val,extra)=>`<div class="ss-row"><span class="ss-l">${label}</span><span class="ss-v">${val}${extra?' <span class="ss-x">'+extra+'</span>':''}</span></div>`;
  let html=row('Blok', n+' adet', drawn<n?(drawn+' çizili · '+(n-drawn)+' boş'):'hepsi çizili');
  html+=row('Σ Taban', fmt(foot)+' m²', pa? 'TAKS ≈ '+fmt(foot/pa)+(imar&&imar.maksTaks>0?' / '+fmt(imar.maksTaks):'') : '');
  html+=row('Σ İnşaat', fmt(gross)+' m²', pa? 'KAKS ≈ '+fmt(gross/pa)+(imar&&imar.emsal>0?' / '+fmt(imar.emsal):'') : '');
  if(pa) html+=row('Parsel', fmt(pa)+' m²', 'bahçe ≈ '+fmt(Math.max(0,pa-foot))+' m²');
  else html+='<div class="ss-note">Parsel çizilmedi — TAKS/KAKS oranları için Parsel getirin ya da çizin.</div>';
  box.innerHTML=html;
}
/* KAT-M2-BAYAT fix: bvert (sınır köşe/kenar) düzenlemesi + undo(bound/bounddraw) + generate()
   zinciri renderBlockTabs()'ı hiç çağırmıyordu → #blockTabs m² etiketi bayat kalıyordu (kardeş
   panel updateSiteSummary render()'a bağlı olduğu için hiç bayatlamıyor). Noktasal çağrı eklemek
   yerine render() döngüsüne bağlandı (render.js) + ucuz imza-memo eklendi: her render'da
   çağrılması artık normal ama DOM'u yalnız durum GERÇEKTEN değiştiyse yeniden kurar. */
let __blockTabsSig=null;
function renderBlockTabs(){
  const box=document.getElementById('blockTabs');
  if(!box) return;
  makeStripDraggable('blockTabs');   // "BLOK" grip'inden sürüklenebilir
  updateSiteBtn();
  if(typeof updateSiteSummary==='function') updateSiteSummary();
  if(!siteOn()){
    if(box.style.display!=='none'){ box.style.display='none'; __blockTabsSig=null; }
    positionOnb();
    return;
  }
  // ucuz imza: blok sayısı + aktif blok + her bloğun alanı(yuvarlı)/planlı-mı — bvert/undo/generate
  // gibi noktasal çağırmayan yollarda da m²/durum canlı kalsın diye
  let sig=blocks.length+'|'+activeBlock;
  for(let k=0;k<blocks.length;k++){
    const b=blocks[k], isActive=k===activeBlock;
    const area=isActive? (closed?shoelace(pts):0) : (b&&b.pts&&b.pts.length>=3?shoelace(b.pts):0);
    const hasPlan=isActive? !!plan : !!(b&&b.plan);
    sig+='|'+Math.round(area*100)+':'+(hasPlan?1:0);
  }
  if(sig===__blockTabsSig){ box.style.display='flex'; positionOnb(); return; } // durum değişmedi → DOM'a dokunma
  __blockTabsSig=sig;
  box.style.display='flex'; box.innerHTML='';
  const lbl=document.createElement('span'); lbl.className='bl'; lbl.textContent='BLOK'; lbl.title='Sürükle: kutuyu taşı'; box.appendChild(lbl);
  blocks.forEach((b,k)=>{
    const btn=document.createElement('button');
    /* aktif blok canlı globallerden okunur; diğerleri anlık görüntüden. "boş" = sınır çizilmemiş
       (aktifse pts kapanmamış / diğerse pts yok). Boş blok belirgin işaretlenir (Item 1). */
    const isActive=k===activeBlock;
    const area=isActive? (closed?shoelace(pts):0) : (b&&b.pts&&b.pts.length>=3?shoelace(b.pts):0);
    const isEmpty = isActive? !closed : !(b&&b.pts&&b.pts.length>=3);
    btn.innerHTML='Blok '+blockName(k)
      +(area>0?' · '+fmt(area)+' m²':'')
      +(isEmpty?' <span class="tag">boş</span>':'')
      +(blocks.length>1?'<span class="x" title="Bloğu sil" data-del="'+k+'">×</span>':'');
    btn.className=(isActive?'active':'')+(isEmpty?' empty':'');
    btn.title = isEmpty
      ? (isActive?'Boş tuval — Blok '+blockName(k)+' sınırını çizin':'Henüz planlanmadı — geçince boş tuvalde sınırını çizin')
      : 'Blok '+blockName(k)+(b&&b.plan?' (planlı)':' (sınır çizili, yerleşim bekliyor)');
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
  const cp=document.createElement('button'); cp.className='add'; cp.textContent='⧉ Kopyala';
  cp.title='Aktif bloğu kopyala (Blok '+blockName(activeBlock)+' → Blok '+blockName(blocks.length)+', sağa ötelenir)';
  cp.addEventListener('click',copyBlock);
  box.appendChild(cp);
  positionOnb();
}
function switchBlock(k){
  if(!siteOn()||k<0||k>=blocks.length||k===activeBlock) return;
  closeFloorPaste();                                              // blok değişti: floorClip app-globali → hedef bloğun katlarında bayat kalır
  if(mode==='site'&&typeof setMode==='function') setMode('draw');
  saveActiveBlock();
  const prev=activeBlock; activeBlock=k;
  const snap=blocks[k];
  if(snap && snap.plan){
    try{ restoreState(snap, {keepBlocks:true}); }
    catch(err){ console.error('blok geçişi:', err); activeBlock=prev; renderBlockTabs(); return; }
  } else {
    // taslak (sınır çizili, yerleşim yok) → sınırı geri aç; snap yoksa boş tuval (bina ayarları + parsel korunur)
    restoreBlockDraft(snap);
  }
  renderBlockTabs();
}
function addBlock(){
  if(!siteOn()) return;
  saveActiveBlock();
  blocks.push(null);
  activeBlock=blocks.length-1;
  if(typeof setMode==='function') setMode('draw');   // yeni blok = boş tuval, otomatik ÇİZ moduna düş
  clearCanvasForNewBlock();
  renderBlockTabs();
  /* S4a: keşfedilebilir çizim yönlendirmesi — yeni blok mevcut parseli devralır, hemen çizime hazır */
  if(typeof setStatusHint==='function')
    setStatusHint('Blok '+blockName(activeBlock)+' sınırını çizin — diğer bloklar soluk görünür. İlk köşeye tıklayarak kapatın.','#2f6f8f');
}
function removeBlock(k){
  if(!siteOn()) return;
  /* Son blok silinemez — site "en az bir blok" değişmezidir. Siteyi kapatmak için
     "Site (çoklu blok)" düğmesini kapatın (o zaman aktif blok tek bina olarak kalır). */
  if(blocks.length<=1){
    if(typeof setStatusHint==='function')
      setStatusHint('Son blok silinemez. Siteyi bitirmek için "Site (çoklu blok)" düğmesini kapatın — bu blok tek bina olarak kalır.','#b35a2e');
    return;
  }
  if(typeof confirm==='function' && !confirm('Blok '+blockName(k)+' silinsin mi? (Bu işlem geri alınamaz.)')) return;
  if(k!==activeBlock) saveActiveBlock();
  blocks.splice(k,1);
  if(activeBlock>=blocks.length) activeBlock=blocks.length-1;
  else if(k<activeBlock) activeBlock--;
  const snap=blocks[activeBlock];
  if(snap && snap.plan){ try{ restoreState(snap,{keepBlocks:true}); }catch(err){ console.error(err); } }
  else restoreBlockDraft(snap);   // taslak bloksa çizili sınır korunur
  renderBlockTabs();
}
/* boş blok için tuvali temizle: yalnız geometri sıfırlanır; bina tipi/kat ayarları VE
   site parseli (site-ortak) korunur */
function clearCanvasForNewBlock(){
  pts=[]; roomPts=[]; closed=false; plan=null; blockDrawBad=null;
  balconies=[]; courtyards=[]; avluGhost=null; avluDragIdx=-1; editHistory=[]; resetCuts();
  doorOverrides={}; extraDoors=[]; doorHidden={}; windowOverrides={}; extraWindows=[]; windowHidden={};
  villaFloors=null; activeFloor=0; lockedCore=null;
  const ka=document.getElementById('katAyri'); if(ka) ka.checked=false;
  document.getElementById('genBtn').disabled=true;
  document.getElementById('svgBtn').disabled=true; document.getElementById('pngBtn').disabled=true; document.getElementById('dxfBtn').disabled=true;
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

/* ================= sol panel sekmeleri (SUNUM-4B) =================
   Bina · Parsel/İmar · Daireler. Sekme değişimi SADECE display — form state'e
   dokunmaz. Aktif sekme oturum içinde bellekte tutulur (sayfa yenilemede Bina'ya
   düşer, bilinçli). Basit modda Parsel/İmar sekmesi .pro-only ile gizli; aktif
   sekme gizli kalırsa Bina'ya düşülür. showPanelTab(name) global olarak açılır ki
   bir kontrolü odağa alan akışlar (ör. TKGM) önce hedef sekmeyi gösterebilsin. */
(function(){
  if(typeof document==='undefined' || typeof document.getElementById!=='function'
     || typeof document.querySelectorAll!=='function') return;   // test/Node stub (DOM yok) → atla
  const strip=document.getElementById('panelTabs');
  if(!strip || typeof strip.querySelectorAll!=='function') return;
  const tabs=Array.prototype.slice.call(strip.querySelectorAll('.ptab'));
  const panes=Array.prototype.slice.call(document.querySelectorAll('.tabPane'));
  let active='bina';
  function paneOf(name){ return panes.find(p=>p.getAttribute('data-pane')===name); }
  function tabOf(name){ return tabs.find(t=>t.getAttribute('data-tab')===name); }
  function tabHidden(t){ // Basit modda .pro-only sekme gizli sayılır
    return !t || (t.offsetParent===null && getComputedStyle(t).display==='none');
  }
  function show(name){
    let t=tabOf(name);
    if(tabHidden(t)) name='bina';               // gizli sekme → Bina'ya düş
    active=name;
    tabs.forEach(tb=>{ const on=tb.getAttribute('data-tab')===name;
      tb.classList.toggle('active', on); tb.setAttribute('aria-selected', on?'true':'false'); });
    panes.forEach(p=>p.classList.toggle('active', p.getAttribute('data-pane')===name));
  }
  tabs.forEach(t=>t.addEventListener('click',()=>show(t.getAttribute('data-tab'))));
  // Mod değişiminde (Basit↔Pro) aktif sekmeyi koru; gizli kaldıysa Bina'ya düş.
  // boot.js body.mode-* sınıfını değiştirir → gözlemle.
  if(typeof MutationObserver==='function'){
    let raf=null;
    const mo=new MutationObserver(()=>{ if(raf) return;
      raf=(window.requestAnimationFrame||setTimeout)(()=>{ raf=null; show(active); },0); });
    mo.observe(document.body,{attributes:true, attributeFilter:['class']});
  }
  // Emniyet: mod düğmelerine de bağlan (MutationObserver yoksa/ertelenirse).
  ['modeBasic','modePro'].forEach(id=>{ const b=document.getElementById(id);
    if(b) b.addEventListener('click',()=>{ setTimeout(()=>show(active),0); }); });
  window.showPanelTab=show;
  show('bina');
})();
