'use strict';
/* ============================================================
   TKGM Parsel Sorgu — koordinattan gerçek kadastro parselini al
   ------------------------------------------------------------
   Kullanıcı bir KOORDİNAT (enlem, boylam) ya da GOOGLE MAPS linki
   yapıştırır; TKGM CBS nokta-sorgu ucundan o noktadaki parselin
   ada/parsel no'su, mahallesi, alanı ve SINIR poligonu çekilir.
   Poligon WGS84 (lng,lat) → yerel düzlem metreye (kuzey yukarı)
   çevrilip `parcelPts`'e yazılır; bahçe / TAKS / çekme mesafeleri
   mevcut mevzuat makinesiyle otomatik hesaplanır.

   Uç: GET /megsiswebapi.v3.1/api/parsel/{enlem}/{boylam}
        → 200 {type:"Feature", geometry, properties:{adaNo,parselNo,
          mahalleAd,ilceAd,ilAd,alan,nitelik,...}} | 404 {Message}
   CORS: cbsapi.tkgm.gov.tr `*` verir → tarayıcıdan doğrudan çağrılır.
   ============================================================ */

const TKGM_API = 'https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api';
const TKGM_PARSEL_URL = (lat, lng) => TKGM_API + '/parsel/' + lat + '/' + lng;
const TKGM_URL = {
  ilce:    id => TKGM_API + '/idariYapi/ilceListe/' + id,
  mahalle: id => TKGM_API + '/idariYapi/mahalleListe/' + id,
  parsel:  (m,a,p) => TKGM_API + '/parsel/' + m + '/' + encodeURIComponent(a) + '/' + encodeURIComponent(p)
};
/* İl listesi statik gömülü: TKGM il ucu yalnız `app://parselsorgu` (Electron)
   origin'ine CORS verir; tarayıcıdan bloklu. {i:id, t:ad} × 81. */
const TKGM_ILLER = [{"i":23,"t":"Adana"},{"i":24,"t":"Adıyaman"},{"i":25,"t":"Afyonkarahisar"},{"i":26,"t":"Ağrı"},{"i":90,"t":"Aksaray"},{"i":27,"t":"Amasya"},{"i":28,"t":"Ankara"},{"i":29,"t":"Antalya"},{"i":97,"t":"Ardahan"},{"i":30,"t":"Artvin"},{"i":31,"t":"Aydın"},{"i":32,"t":"Balıkesir"},{"i":96,"t":"Bartın"},{"i":94,"t":"Batman"},{"i":91,"t":"Bayburt"},{"i":33,"t":"Bilecik"},{"i":34,"t":"Bingöl"},{"i":35,"t":"Bitlis"},{"i":36,"t":"Bolu"},{"i":37,"t":"Burdur"},{"i":38,"t":"Bursa"},{"i":39,"t":"Çanakkale"},{"i":40,"t":"Çankırı"},{"i":41,"t":"Çorum"},{"i":42,"t":"Denizli"},{"i":43,"t":"Diyarbakır"},{"i":103,"t":"Düzce"},{"i":44,"t":"Edirne"},{"i":45,"t":"Elazığ"},{"i":46,"t":"Erzincan"},{"i":47,"t":"Erzurum"},{"i":48,"t":"Eskişehir"},{"i":49,"t":"Gaziantep"},{"i":50,"t":"Giresun"},{"i":51,"t":"Gümüşhane"},{"i":52,"t":"Hakkari"},{"i":53,"t":"Hatay"},{"i":98,"t":"Iğdır"},{"i":54,"t":"Isparta"},{"i":56,"t":"İstanbul"},{"i":57,"t":"İzmir"},{"i":68,"t":"Kahramanmaraş"},{"i":100,"t":"Karabük"},{"i":92,"t":"Karaman"},{"i":58,"t":"Kars"},{"i":59,"t":"Kastamonu"},{"i":60,"t":"Kayseri"},{"i":93,"t":"Kırıkkale"},{"i":61,"t":"Kırklareli"},{"i":62,"t":"Kırşehir"},{"i":101,"t":"Kilis"},{"i":63,"t":"Kocaeli"},{"i":64,"t":"Konya"},{"i":65,"t":"Kütahya"},{"i":66,"t":"Malatya"},{"i":67,"t":"Manisa"},{"i":69,"t":"Mardin"},{"i":55,"t":"Mersin"},{"i":70,"t":"Muğla"},{"i":71,"t":"Muş"},{"i":72,"t":"Nevşehir"},{"i":73,"t":"Niğde"},{"i":74,"t":"Ordu"},{"i":102,"t":"Osmaniye"},{"i":75,"t":"Rize"},{"i":76,"t":"Sakarya"},{"i":77,"t":"Samsun"},{"i":78,"t":"Siirt"},{"i":79,"t":"Sinop"},{"i":80,"t":"Sivas"},{"i":85,"t":"Şanlıurfa"},{"i":95,"t":"Şırnak"},{"i":81,"t":"Tekirdağ"},{"i":82,"t":"Tokat"},{"i":83,"t":"Trabzon"},{"i":84,"t":"Tunceli"},{"i":86,"t":"Uşak"},{"i":87,"t":"Van"},{"i":99,"t":"Yalova"},{"i":88,"t":"Yozgat"},{"i":89,"t":"Zonguldak"}];

/* "41.0082, 28.9784" düz koordinatı ya da bir Google Maps URL'sinden
   {lat,lng} çıkar. Öncelik: yer (!3d!4d) > sorgu (q/ll) > kamera (@) > düz. */
function tkgmParseLatLng(raw){
  if(!raw) return null;
  const s = String(raw).trim();
  const mk = (a,b)=>{ const lat=parseFloat(a), lng=parseFloat(b);
    return (isFinite(lat)&&isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180) ? {lat,lng} : null; };
  let m;
  if((m = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)))             return mk(m[1],m[2]); // yer
  if((m = s.match(/[?&](?:q|query|ll|sll|center|daddr|destination)=(?:loc:)?(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/i))) return mk(m[1],m[2]); // sorgu
  if((m = s.match(/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/)))                         return mk(m[1],m[2]); // kamera
  if((m = s.match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/))) return mk(m[1],m[2]); // düz
  return null;
}

/* Çözümlenemeyen kısa Maps linkleri (tarayıcıdan redirect izlenemez). */
function tkgmIsShortMapsLink(s){ return /(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)/i.test(String(s||'')); }

/* TKGM alan string'i ("1.234,56" → 1234.56) → sayı | null. */
function tkgmParseAlan(s){
  if(s==null) return null;
  const n = parseFloat(String(s).replace(/\./g,'').replace(',','.'));
  return isFinite(n) ? n : null;
}

/* Yanıttan dış halkayı çıkar (Polygon / MultiPolygon / Feature sarmalı). */
function tkgmExtractRing(data){
  const geom = data && (data.geometry || (data.features && data.features[0] && data.features[0].geometry));
  if(!geom || !geom.coordinates) return null;
  let c = geom.coordinates;
  if(geom.type === 'MultiPolygon') c = c[0];          // ilk poligon
  const ring = Array.isArray(c) ? c[0] : null;         // dış halka
  return (Array.isArray(ring) && Array.isArray(ring[0])) ? ring : null;
}

let psProj = null;    // {lng0,lat0,mLng,mLat,dx,dy,ring} — geo↔dünya projeksiyonu (uydu için)
let psSatOn = false;  // uydu arka planı açık mı

/* WGS84 halkasını ([[lng,lat],...]) yerel metre düzlemine çevir:
   merkez orijinde, kuzey yukarı (enlem artarsa ekran y'si küçülür). Projeksiyonu psProj'e yazar. */
function tkgmGeoToWorld(ring){
  let r = ring.filter(c => Array.isArray(c) && c.length>=2 && isFinite(c[0]) && isFinite(c[1]));
  r = r.filter((c,i)=> i===0 || Math.abs(c[0]-r[i-1][0])>1e-12 || Math.abs(c[1]-r[i-1][1])>1e-12); // ardışık tekrarları ayıkla
  if(r.length>=2){ const a=r[0], b=r[r.length-1];
    if(Math.abs(a[0]-b[0])<1e-9 && Math.abs(a[1]-b[1])<1e-9) r = r.slice(0,-1); }               // kapanış noktasını at
  if(r.length < 3){ psProj=null; return null; }
  let lng0=0, lat0=0; r.forEach(c=>{ lng0+=c[0]; lat0+=c[1]; }); lng0/=r.length; lat0/=r.length;
  const phi = lat0*Math.PI/180;
  const mLat = 111132.954 - 559.822*Math.cos(2*phi) + 1.175*Math.cos(4*phi); // m / derece enlem
  const mLng = 111319.488*Math.cos(phi);                                     // m / derece boylam
  psProj = {lng0, lat0, mLng, mLat, dx:0, dy:0, rot:0, ring:r}; // dx/dy: bina hizalama kaydırması; rot: eksene döndürme (rad)
  return r.map(c => ({
    x: Math.round((c[0]-lng0)*mLng*1000)/1000,
    y: Math.round((lat0-c[1])*mLat*1000)/1000
  }));
}

/* ============================================================
   Parsel döndürme — eksene hizalama (rotation)
   ------------------------------------------------------------
   Parsel gerçek-dünya açısında gelir; plan motoru ekran eksenine
   hizalı çalıştığından eğik parselde bina garip oturur. Parseli
   (kendi merkezinde) döndürüp baskın kenarını yatay yaparız;
   bina ekran-hizalı çizilir ve parsele tam oturur. Çekme + uydu
   aynı dönüşle döner. parcelPts döndürülmüş haliyle saklanır;
   psProj.rot kuzey-yukarıdan toplam açıyı tutar (uydu için).
   ============================================================ */
/* Bir noktayı (cx,cy) merkezli a radyan döndür (ekran y aşağı). */
function psRotPt(p, a, cx, cy){
  const c=Math.cos(a), s=Math.sin(a), dx=p.x-cx, dy=p.y-cy;
  return {x:cx+dx*c-dy*s, y:cy+dx*s+dy*c};
}
/* Poligonu en küçük çevreleyen-dikdörtgene oturtan döndürme (rad).
   Min-alan dikdörtgeni daima bir kenara paraleldir → her kenar açısını
   dene, bbox alanı en küçük olanı seç; sonra geniş boyutu yatay yap ve
   açıyı (-90°,90°] aralığına indir (en az döndürme). */
function psAutoAngle(poly){
  if(!poly || poly.length<3) return 0;
  let best=0, bestArea=Infinity, bw=0, bh=0;
  for(let i=0;i<poly.length;i++){
    const a=poly[i], b=poly[(i+1)%poly.length];
    const ang=Math.atan2(b.y-a.y, b.x-a.x);
    const c=Math.cos(-ang), s=Math.sin(-ang);
    let mnx=1e9,mxx=-1e9,mny=1e9,mxy=-1e9;
    for(let k=0;k<poly.length;k++){ const p=poly[k], x=p.x*c-p.y*s, y=p.x*s+p.y*c;
      if(x<mnx)mnx=x; if(x>mxx)mxx=x; if(y<mny)mny=y; if(y>mxy)mxy=y; }
    const w=mxx-mnx, h=mxy-mny, area=w*h;
    if(area<bestArea-1e-9){ bestArea=area; best=-ang; bw=w; bh=h; }
  }
  if(bh>bw) best+=Math.PI/2;                 // geniş kenar yatay
  while(best>  Math.PI/2 + 1e-9) best-=Math.PI;
  while(best<=-Math.PI/2 - 1e-9) best+=Math.PI;
  return best;
}
/* parcelPts'i geo halkasından güncel psProj.rot + dx/dy ile yeniden üret
   (parsel daima (dx,dy) ekseninde döner; uydu ile birebir hizalı kalır). */
function psReproject(){
  if(!psProj) return;
  const {lng0,lat0,mLng,mLat,dx,dy}=psProj, a=psProj.rot||0, c=Math.cos(a), s=Math.sin(a);
  parcelPts = psProj.ring.map(g=>{
    const x0=(g[0]-lng0)*mLng, y0=(lat0-g[1])*mLat;       // kuzey-yukarı, merkez orijinde
    return {x:Math.round((x0*c-y0*s+dx)*1000)/1000, y:Math.round((x0*s+y0*c+dy)*1000)/1000};
  });
}
/* psProj yokken (kayıttan yüklenen SVG): parcelPts'i kendi merkezi etrafında döndür. */
function psRotateInPlace(rad){
  if(parcelPts.length<3) return;
  const ctr=centroidOf(parcelPts);
  parcelPts=parcelPts.map(p=>{ const q=psRotPt(p,rad,ctr.x,ctr.y); return {x:Math.round(q.x*1000)/1000,y:Math.round(q.y*1000)/1000}; });
}
/* Parsel köşelerini 0,5 m ızgaraya oturt (eksene hizalı parselde dikdörtgeni bozmaz;
   köşeler grid çizgilerine biner → ona yapışan bina/plan da grid-temiz olur). */
function psSnapParcelGrid(){
  if(parcelPts.length<3) return;
  parcelPts=parcelPts.map(p=>({x:snapG(p.x), y:snapG(p.y)}));
}
/* Kayıttan/slider'dan gelen mutlak açıya (derece) döndür. snap=true ise köşeleri
   ızgaraya oturt (eksen-hizalı işlemlerde: otomatik hizala / kenara çevir / yükleme). */
function psRotateTo(deg, snap){
  if(parcelPts.length<3) return;
  let d=parseFloat(deg); if(!isFinite(d)) return;
  d=Math.max(-180, Math.min(180, d));
  const target=d*Math.PI/180, delta=target-(parcelRot||0);
  if(Math.abs(delta)<1e-6 && !snap){ psSyncRotUI(); return; }
  parcelRot=target;
  if(psProj){ psProj.rot=target; psReproject(); } else { psRotateInPlace(delta); }
  if(snap) psSnapParcelGrid();
  psComputeSetback(); psUpdateSatellite();
  if(typeof plan!=='undefined' && plan && typeof runChecks==='function') runChecks();
  render(); psSyncRotUI();
}
function psRotateBy(deg){ psRotateTo((parcelRot*180/Math.PI)+deg); }
/* En küçük çevreleyen dikdörtgene otomatik hizala (+ ızgaraya oturt). */
function psAutoAlign(){
  if(parcelPts.length<3) return;
  if(psProj){
    const {lng0,lat0,mLng,mLat}=psProj;
    const nu=psProj.ring.map(g=>({x:(g[0]-lng0)*mLng, y:(lat0-g[1])*mLat}));
    psRotateTo(psAutoAngle(nu)*180/Math.PI, true);
  } else {
    psRotateTo((parcelRot + psAutoAngle(parcelPts))*180/Math.PI, true);
  }
}
let psEdgeIdx=0;
/* Sıradaki parsel kenarını yatay yap (cepheyi seçmek için) + ızgaraya oturt. */
function psRotEdge(){
  if(parcelPts.length<3) return;
  const n=parcelPts.length, i=psEdgeIdx%n, a=parcelPts[i], b=parcelPts[(i+1)%n];
  const ang=Math.atan2(b.y-a.y, b.x-a.x);
  psEdgeIdx=(psEdgeIdx+1)%n;
  psRotateTo((parcelRot - ang)*180/Math.PI, true);
}
function psRotReset(){ psRotateTo(0); }
/* Slider + derece kutusunu güncel açıya eşitle. */
function psSyncRotUI(){
  const deg=Math.round((parcelRot*180/Math.PI)*10)/10;
  const r=document.getElementById('psRotRange'), n=document.getElementById('psRotNum');
  if(r && document.activeElement!==r) r.value=deg;
  if(n && document.activeElement!==n) n.value=deg;
}

/* ---- bina çizimini parsel/çekme köşe & kenarlarına yapıştır ("oturt") ---- */
function psProjSeg(px,py,a,b){
  const dx=b.x-a.x, dy=b.y-a.y, l2=dx*dx+dy*dy;
  let t=l2?((px-a.x)*dx+(py-a.y)*dy)/l2:0; t=Math.max(0,Math.min(1,t));
  const x=a.x+dx*t, y=a.y+dy*t; return {x,y,d:Math.hypot(px-x,py-y)};
}
/* (wx,wy) imlecine yakın parsel/çekme köşesi (öncelik) ya da kenar noktası | null.
   Çekme sınırı (yasal yapı çizgisi) önce denenir, sonra parsel sınırı. */
function psSnapTarget(wx,wy){
  if(!(parcelClosed && parcelPts.length>=3)) return null;
  const pm=(typeof pxPerM!=='undefined' && pxPerM>0)?pxPerM:16;
  const tolV=Math.max(0.35, 12/pm), tolE=Math.max(0.25, 8/pm);
  const rings=[];
  if(parcelSetback && parcelSetback.length>=3) rings.push(parcelSetback);
  rings.push(parcelPts);
  let bv=null;                                       // köşeler (yüksek öncelik)
  for(let ri=0;ri<rings.length;ri++){ const ring=rings[ri];
    for(let k=0;k<ring.length;k++){ const p=ring[k], d=Math.hypot(wx-p.x,wy-p.y);
      if(d<tolV && (!bv||d<bv.d)) bv={x:p.x,y:p.y,d}; } }
  if(bv) return {x:bv.x, y:bv.y};
  let be=null;                                       // sonra en yakın kenar noktası
  for(let ri=0;ri<rings.length;ri++){ const ring=rings[ri];
    for(let k=0;k<ring.length;k++){ const a=ring[k], b=ring[(k+1)%ring.length], pr=psProjSeg(wx,wy,a,b);
      if(pr.d<tolE && (!be||pr.d<be.d)) be=pr; } }
  return be?{x:be.x, y:be.y}:null;
}

/* Parseli araca yükle. Önce baskın kenarı yatay olacak şekilde EKSENE HİZALA
   (eğik parselde bina düzgün otursun); bina çizili ise parsel ortasını binaya
   hizala (bina parselin içinde kalsın); sonra çerçevele. */
function tkgmLoadParcel(world){
  const rot = psAutoAngle(world);                       // eksene hizalama açısı
  parcelRot = rot;
  if(psProj){
    psProj.rot = rot; psProj.dx = 0; psProj.dy = 0;
    psReproject();                                      // parcelPts: döndürülmüş, ~orijin merkezli
    if(typeof pts!=='undefined' && pts.length && closed){
      const bc = centroidOf(pts), pc = centroidOf(parcelPts);
      psProj.dx = bc.x-pc.x; psProj.dy = bc.y-pc.y;
      psReproject();                                    // binaya ortalanmış
    }
  } else {                                              // psProj yoksa (savunmacı): elle döndür + ötele
    const ctr = centroidOf(world);
    world = world.map(p=>psRotPt(p, rot, ctr.x, ctr.y));
    if(typeof pts!=='undefined' && pts.length && closed){
      const bc = centroidOf(pts), pc = centroidOf(world);
      world = world.map(q=>({x:q.x+(bc.x-pc.x), y:q.y+(bc.y-pc.y)}));
    }
    parcelPts = world.map(q=>({x:Math.round(q.x*1000)/1000, y:Math.round(q.y*1000)/1000}));
  }
  psSnapParcelGrid();                                   // köşeleri 0,5 m ızgaraya oturt
  parcelClosed = true;
  psComputeSetback();
  psUpdateSatellite();
  if(typeof plan!=='undefined' && plan && typeof runChecks==='function') runChecks();
  fitView();
  psSyncRotUI();
}

/* ---- uydu arka planı (Esri World Imagery export, anahtarsız, CORS:*) ---- */
/* Parselin geo bbox'ı (+ kenar payı). */
function psGeoBbox(){
  if(!psProj) return null;
  let mnLng=1e9, mxLng=-1e9, mnLat=1e9, mxLat=-1e9;
  psProj.ring.forEach(c=>{ mnLng=Math.min(mnLng,c[0]); mxLng=Math.max(mxLng,c[0]); mnLat=Math.min(mnLat,c[1]); mxLat=Math.max(mxLat,c[1]); });
  const wM=(mxLng-mnLng)*psProj.mLng, hM=(mxLat-mnLat)*psProj.mLat, maxM=Math.max(wM,hM);
  /* Toplam görünüm ≥180 m: küçük bbox + ince çözünürlük Esri export'ta 500 verir
     (bölgenin max LOD'u). Büyük parselde 2.2×; parsel çevresiyle bağlam olarak görünür. */
  const view=Math.max(180, maxM*2.2), marM=(view-maxM)/2;
  const dLng=marM/psProj.mLng, dLat=marM/psProj.mLat;
  return {minLng:mnLng-dLng, maxLng:mxLng+dLng, minLat:mnLat-dLat, maxLat:mxLat+dLat};
}
/* Geo bbox → Esri export PNG → blob URL → dünya dikdörtgeni (parcelSat). render() çizer.
   NOT: SVG <image> dış cross-origin href'i (bu tarayıcıda) boyamıyor; görüntüyü crossOrigin
   ile çekip canvas→blob URL'e çeviriyoruz (Esri ACAO:* → taint yok, blob URL kısa → render ucuz). */
let psSatToken = 0, psSatReq = null;
function psSatClear(){ if(parcelSat && parcelSat._u) URL.revokeObjectURL(parcelSat._u); parcelSat=null; psSatReq=null; }
function psUpdateSatellite(){
  if(!psSatOn || !psProj){ psSatClear(); return; }
  const gb=psGeoBbox(); if(!gb){ psSatClear(); return; }
  const {lng0,lat0,mLng,mLat,dx,dy}=psProj;
  const x0=(gb.minLng-lng0)*mLng+dx, x1=(gb.maxLng-lng0)*mLng+dx;
  const y0=(lat0-gb.maxLat)*mLat+dy, y1=(lat0-gb.minLat)*mLat+dy;   // kuzey yukarı: maxLat → küçük y
  const w=x1-x0, h=y1-y0;
  if(!(w>0 && h>0)){ psSatClear(); return; }
  let sw=Math.round(w/0.30), sh=Math.round(h/0.30);                 // ~0,30 m/px (daha incede Esri 500)
  const mxd=Math.max(sw,sh); if(mxd>700){ const k=700/mxd; sw=Math.round(sw*k); sh=Math.round(sh*k); }
  sw=Math.max(64,sw); sh=Math.max(64,sh);
  const reqUrl='https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export'
    + '?bbox=' + gb.minLng + ',' + gb.minLat + ',' + gb.maxLng + ',' + gb.maxLat
    + '&bboxSR=4326&imageSR=4326&size=' + sw + ',' + sh + '&format=png&f=image';
  const rot=psProj.rot||0;
  // bbox/boyut aynı; yalnız döndürme/öteleme değişti → görüntüyü yeniden indirme, açıyı güncelle
  if(parcelSat && parcelSat.url && psSatReq===reqUrl){
    parcelSat.x=x0; parcelSat.y=y0; parcelSat.w=w; parcelSat.h=h; parcelSat.rot=rot; parcelSat.cx=dx; parcelSat.cy=dy;
    render(); return;
  }
  if(parcelSat && parcelSat._u) URL.revokeObjectURL(parcelSat._u);   // eski blob'u bırak
  psSatToken++; psSatReq=reqUrl;
  parcelSat = {url:null, x:x0, y:y0, w, h, _u:null, rot, cx:dx, cy:dy}; // dikdörtgen hemen; görüntü asenkron
  const token=psSatToken, img=new Image(); img.crossOrigin='anonymous';
  img.onload=function(){
    if(token!==psSatToken || !parcelSat) return;                   // eskimiş istek/iptal
    try{
      const cv=document.createElement('canvas'); cv.width=img.naturalWidth; cv.height=img.naturalHeight;
      cv.getContext('2d').drawImage(img,0,0);
      cv.toBlob(function(b){
        if(token!==psSatToken || !parcelSat || !b) return;
        parcelSat._u=URL.createObjectURL(b); parcelSat.url=parcelSat._u; render();
      },'image/png');
    }catch(e){ /* taint vs. — atla */ }
  };
  img.src=reqUrl;
}

/* ---- imar çekme (yapı yaklaşma sınırı) ---- */
/* Parseli her kenardan d metre içe ofsetle. KONVEKS parselde yarım-düzlem kesişimi KESİN;
   İÇBÜKEY parselde o yöntem çöker (boş döner) → miter (köşe açıortayı) ofsetine düş. */
function tkgmSetback(poly, d){
  const hp = tkgmSetbackHP(poly, d);
  if(hp.length>=3) return hp;
  return tkgmSetbackMiter(poly, d);
}
function tkgmSetbackHP(poly, d){
  if(!poly || poly.length<3 || !(d>0)) return [];
  let p = poly.map(q=>({x:q.x,y:q.y}));
  let a2=0; for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length]; a2+=p[i].x*q.y-q.x*p[i].y;}
  if(a2<0) p.reverse();                        // CCW → iç taraf kenarın solu
  let out=p; const N=p.length;
  for(let i=0;i<N;i++){
    const a=p[i], b=p[(i+1)%N];
    let ex=b.x-a.x, ey=b.y-a.y; const L=Math.hypot(ex,ey)||1; ex/=L; ey/=L;
    const nx=-ey, ny=ex;                        // sol (içe) normal
    out = tkgmClipHP(out, a.x+nx*d, a.y+ny*d, nx, ny);
    if(out.length<3) return [];
  }
  return out.map(q=>({x:Math.round(q.x*1000)/1000, y:Math.round(q.y*1000)/1000}));
}
/* miter iç-ofset: her köşeyi iki komşu kenarın iç-normallerinin açıortayı boyunca d içeri taşır.
   Konveks+içbükey köşelerde çalışır; sonuç ters dönerse / köşe parsel dışına çıkarsa boş döner. */
function tkgmSetbackMiter(poly, d){
  if(!poly || poly.length<3 || !(d>0)) return [];
  let p = poly.map(q=>({x:q.x,y:q.y}));
  let a2=0; for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length]; a2+=p[i].x*q.y-q.x*p[i].y;}
  if(a2<0) p.reverse();
  const N=p.length, out=[];
  for(let i=0;i<N;i++){
    const A=p[(i-1+N)%N], V=p[i], B=p[(i+1)%N];
    let d1x=V.x-A.x, d1y=V.y-A.y; let L1=Math.hypot(d1x,d1y)||1; d1x/=L1; d1y/=L1;
    let d2x=B.x-V.x, d2y=B.y-V.y; let L2=Math.hypot(d2x,d2y)||1; d2x/=L2; d2y/=L2;
    const n1x=-d1y, n1y=d1x, n2x=-d2y, n2y=d2x;      // sol (içe) normaller
    const denom = 1 + (n1x*n2x + n1y*n2y);
    let ox, oy;
    if(denom < 1e-3){ ox=n1x*d; oy=n1y*d; }          // sivri köşe → tek normal
    else { const f=d/denom; ox=(n1x+n2x)*f; oy=(n1y+n2y)*f; }
    out.push({x:V.x+ox, y:V.y+oy});
  }
  let oa=0; for(let i=0;i<N;i++){const q=out[(i+1)%N]; oa+=out[i].x*q.y-q.x*out[i].y;}
  if(oa<=1) return [];                                // çöktü/ters döndü
  for(let i=0;i<N;i++){ if(!pip(out[i].x, out[i].y, p)) return []; }   // köşe parsel dışına taştı → geçersiz
  return out.map(q=>({x:Math.round(q.x*1000)/1000, y:Math.round(q.y*1000)/1000}));
}
function tkgmClipHP(poly, px, py, nx, ny){     // yarım-düzlem: dot(q-(px,py), n) >= 0 tutulur
  const res=[], n=poly.length, side=q=>(q.x-px)*nx+(q.y-py)*ny;
  for(let i=0;i<n;i++){
    const c=poly[i], x=poly[(i+1)%n], sc=side(c), sx=side(x);
    if(sc>=0) res.push(c);
    if((sc>=0)!==(sx>=0)){ const t=sc/(sc-sx); res.push({x:c.x+t*(x.x-c.x), y:c.y+t*(x.y-c.y)}); }
  }
  return res;
}
function psComputeSetback(){
  const inp=document.getElementById('psCekme');
  const d=inp?parseFloat(inp.value):NaN;
  parcelSetback = (parcelPts.length>=3 && parcelClosed && isFinite(d) && d>0) ? tkgmSetback(parcelPts, d) : [];
}
/* parsel + bina varsa TAKS/bahçe/çekme-ihlali canlı oku (render her çağrıldığında). */
function psLiveUpdate(){
  const live=document.getElementById('psLive'); if(!live) return;
  if(!(parcelPts.length>=3 && parcelClosed)){ live.innerHTML=''; return; }
  const pa=shoelace(parcelPts);
  const ba=(typeof closed!=='undefined' && closed && pts.length>=3) ? shoelace(pts) : 0;
  let html='<b>Parsel:</b> '+fmt(pa)+' m²';
  if(parcelSetback.length>=3) html+=' · <b>Yapı alanı:</b> '+fmt(shoelace(parcelSetback))+' m²';
  if(ba>0){
    const taks=ba/pa;
    html+='<br><b>Bina tabanı:</b> '+fmt(ba)+' m² · <b>TAKS:</b> '+fmt(Math.round(taks*100)/100)
        +' <span class="ps-dim">(≈%'+Math.round(taks*100)+')</span> · <b>Bahçe:</b> '+fmt(Math.max(0,pa-ba))+' m²';
    if(parcelSetback.length>=3 && pts.some(q=>!pip(q.x,q.y,parcelSetback)))
      html+='<br><span class="ps-warn">⚠ Bina, imar çekme sınırını aşıyor.</span>';
  }
  live.innerHTML=html;
}

/* Parsel + çekme (+ varsa imar TAKS'ı) → parsel içine önerilen YAPI SINIRINI bina olarak çiz.
   Taban = çekme (yapı yaklaşma) zarfı; TAKS biliniyorsa ve zarf alanı TAKS sınırını aşıyorsa
   merkez etrafında TAKS alanına küçültülür. Sonuç 'Yerleşimi Oluştur'a hazır kapalı bina. */
function psDrawBuilding(){
  if(!(parcelPts.length>=3 && parcelClosed)) return;
  psComputeSetback();
  const d=parseFloat((document.getElementById('psCekme')||{}).value)||0;
  let poly = (parcelSetback.length>=3) ? parcelSetback.map(p=>({x:p.x,y:p.y})) : null;
  if(!poly){
    // çekme zarfı hesaplanamadı (çok ince/karmaşık parsel) → merkez-ölçekli yaklaşık inset (GÖRÜNÜR bina garantisi)
    const pa=shoelace(parcelPts), s=Math.sqrt(pa)||1;
    const k=(d>0 && s>2*d) ? (s-2*d)/s : 0.9;
    const c=centroidOf(parcelPts);
    poly = parcelPts.map(p=>({x:c.x+(p.x-c.x)*k, y:c.y+(p.y-c.y)*k}));
  }
  const im = (typeof parcelImar!=='undefined') ? parcelImar : null;
  const taks = (im && im.maksTaks>0) ? im.maksTaks : 0;
  if(taks>0){
    const pa=shoelace(parcelPts), cap=pa*taks, cur=shoelace(poly);
    if(cur>cap && cap>0){                                   // taban TAKS'ı aşıyor → merkez etrafında TAKS alanına küçült
      const k=Math.sqrt(cap/cur), c=centroidOf(poly);
      poly = poly.map(p=>({x:c.x+(p.x-c.x)*k, y:c.y+(p.y-c.y)*k}));
    }
  }
  pts = poly.map(p=>({x:Math.round(p.x*1000)/1000, y:Math.round(p.y*1000)/1000}));
  closed=true; plan=null; balconies=[]; editHistory=[];
  if(typeof resetCuts==='function') resetCuts();
  const gb=document.getElementById('genBtn'); if(gb) gb.disabled=false;
  const ut=document.getElementById('unitTable'); if(ut) ut.style.display='none';
  const sa=document.getElementById('stArea'); if(sa) sa.textContent=fmt(shoelace(pts))+' m²';
  const sp=document.getElementById('stPerim'); if(sp) sp.textContent=fmt(perim(pts))+' m';
  render();
}

/* ============================================================
   İBB e-Plan — parselin imar durumu (fonksiyon / TAKS / KAKS / Hmax)
   ------------------------------------------------------------
   İBB'nin resmî e-Plan uygulamasının (eplan.ibb.istanbul) kamuya açık
   backend'i: token GEREKMEZ, CORS *. Akış: parsel iç-noktası (lng,lat)
   → EPSG:3857 → POST /getbypoint → OBJECTID → POST /getparsel →
   {parcel, functions, plans}. Yalnız İSTANBUL; başka ilde boş döner.
   Tarayıcıdan her fetch'te `referrerPolicy:'no-referrer'` ŞART
   (WAF localhost Referer'ı 403'ler — TKGM kuralının aynısı).
   ============================================================ */
const EPLAN_BASE = 'https://eplan.ibb.istanbul/uWxvrTpLQ/backend';
function psLL2Merc(lng, lat){          // WGS84 → EPSG:3857 (Web Mercator)
  const R = 6378137;
  return [R*lng*Math.PI/180, R*Math.log(Math.tan(Math.PI/4 + lat*Math.PI/360))];
}
function psMerc2LL(x, y){              // EPSG:3857 → WGS84 [lng,lat]
  const R = 6378137;
  return [ x/R*180/Math.PI, (2*Math.atan(Math.exp(y/R)) - Math.PI/2)*180/Math.PI ];
}
/* nokta [x,y] ring [[x,y]...] içinde mi (ray-cast). */
function psPipRing(px, py, ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=ring[i][0], yi=ring[i][1], xj=ring[j][0], yj=ring[j][1];
    if(((yi>py)!==(yj>py)) && (px < (xj-xi)*(py-yi)/((yj-yi)||1e-12)+xi)) inside=!inside;
  }
  return inside;
}
/* FALLBACK: TKGM API düştüğünde (İstanbul) e-Plan getbypoint ile parseli yükle.
   getbypoint çoklu feature döndürür → noktayı İÇEREN poligonu seç; 3857 ring → [lng,lat]
   → TKGM-uyumlu GeoJSON Feature kur (applyData aynen tüketir). */
async function eplanParcelFallback(ll){
  const [x,y] = psLL2Merc(ll.lng, ll.lat);
  const bp = await eplanPost('/getbypoint', {x, y});
  const feats = bp.features||[];
  let f = feats.find(g=> g.geometry && g.geometry.rings && psPipRing(x, y, g.geometry.rings[0])) || feats[0];
  if(!f || !f.geometry || !f.geometry.rings || !f.geometry.rings[0]) return null;
  const ring = f.geometry.rings[0].map(p=>psMerc2LL(p[0], p[1]));
  const a = f.attributes||{};
  return { geometry:{type:'Polygon', coordinates:[ring]},
    properties:{ adaNo:a.ADA, parselNo:a.PARSEL, mahalleAd:a.TAPUMAHADI||null, ilceAd:'', ilAd:'İstanbul', alan:null, nitelik:'İBB e-Plan’dan yüklendi (TKGM CBS erişilemedi)' } };
}
async function eplanPost(path, body){
  const r = await fetch(EPLAN_BASE+path, {
    method:'POST', referrerPolicy:'no-referrer',
    headers:{'Content-Type':'application/json', 'Accept':'application/json'},
    body: JSON.stringify(body)
  });
  if(!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}
/* psProj.ring (geo [lng,lat]) → poligon ağırlık merkezi {lat,lng} (parsel içi nokta). */
function psRingCentroidLL(){
  if(!psProj || !psProj.ring || psProj.ring.length<3) return null;
  const r = psProj.ring; let A=0, cx=0, cy=0;
  for(let i=0;i<r.length;i++){ const a=r[i], b=r[(i+1)%r.length]; const f=a[0]*b[1]-b[0]*a[1]; A+=f; cx+=(a[0]+b[0])*f; cy+=(a[1]+b[1])*f; }
  if(Math.abs(A)<1e-12){ let sx=0, sy=0; r.forEach(c=>{ sx+=c[0]; sy+=c[1]; }); return {lng:sx/r.length, lat:sy/r.length}; }
  A*=0.5; return {lng:cx/(6*A), lat:cy/(6*A)};
}
function imarNum(v){ if(v==null||v==='') return null; const n=parseFloat(String(v).replace(',','.')); return isFinite(n)?n:null; }
/* Lejand/fonksiyon adına GÖMÜLÜ değerleri ayrıştır (ör. "...(TAKS:0.25 HMAX:12.50M)") — İBB'nin
   kendi etiketi; öznitelik boşken yüksek-güven kaynak (birçok ilçede değer yalnız burada). */
function imarLejandValues(lej){
  if(!lej) return {};
  const out={}; let m;
  if(m=/TAKS\s*[:=]\s*(\d?[.,]\d+)/i.exec(lej)) out.taks=imarNum(m[1]);
  if(m=/(?:KAKS|EMSAL|Emsal)\s*[:=]\s*(\d+(?:[.,]\d+)?)/i.exec(lej)) out.emsal=imarNum(m[1]);
  if(m=/(?:HMAX|H\s*MAX)\s*[:=]\s*(\d+(?:[.,]\d+)?)/i.exec(lej)) out.hmax=imarNum(m[1]);
  if(m=/(?:YENÇOK|YENCOK)\s*[:=]?\s*(\d{1,2})\s*kat/i.exec(lej)) out.kat=imarNum(m[1]);
  return out;
}
/* /getparsel yanıtı → düzenli imar nesnesi (parcelImar). */
function imarParse(gp){
  if(!gp) return null;
  const pc  = (((gp.parcel||[])[0])||{}).attributes || {};
  const fns = (gp.functions||[]).map(f=>f.attributes||{});
  // yapılaşma hakkı taşıyan fonksiyonu öne al (TAKS/EMSAL/KAKS/HMAX dolu), yoksa ilki
  const rights = fns.filter(a=> imarNum(a.MAKS_TAKS)!=null || imarNum(a.EMSAL)!=null || imarNum(a.KAKS)!=null || imarNum(a.HMAX)!=null);
  const pr = rights[0] || fns[0] || null;
  const plan0 = (((gp.plans||[])[0])||{}).attributes || {};
  // öznitelik değerleri
  const aTaks = pr ? imarNum(pr.MAKS_TAKS) : null;
  const aEmsal = pr ? (imarNum(pr.EMSAL)!=null ? imarNum(pr.EMSAL) : imarNum(pr.KAKS)) : null;
  const aHmax = pr ? imarNum(pr.HMAX) : null;
  const aKat  = pr ? imarNum(pr.KAT_ADEDI) : null;
  // lejand-gömülü değerler — öznitelik boşsa İBB'nin kendi etiketinden al
  const lv = imarLejandValues(pr ? pr.LEJAND_ADI : null);
  const maksTaks = aTaks!=null ? aTaks : (lv.taks!=null?lv.taks:null);
  const emsal    = aEmsal!=null ? aEmsal : (lv.emsal!=null?lv.emsal:null);
  const hmax     = aHmax!=null ? aHmax : (lv.hmax!=null?lv.hmax:null);
  const katAdedi = aKat!=null ? aKat : (lv.kat!=null?lv.kat:null);
  const yog = pr ? imarNum(pr.YOGUNLUK) : null;
  // yoğunluktan TÜRETİLMİŞ emsal tahmini (bağlayıcı değil): emsal ≈ yoğunluk × ~30 m²/kişi / 10000
  const emsalEstimate = (emsal==null && yog>0) ? Math.round(yog*30/10000*100)/100 : null;
  return {
    ada: pc.ADA||null, parsel: pc.PARSEL||null,
    mahalle: pc.MAHALLE_ADI||pc.TAPUMAHADI||null, ilce: pc.ILCE_TEXT||null,
    alan: imarNum(pc.TAPUALAN),
    fonksiyon: pr ? (pr.LEJAND_ADI||null) : null,
    yogunluk: yog,
    minTaks:  pr ? imarNum(pr.MIN_TAKS) : null,
    maksTaks: maksTaks, emsal: emsal, hmax: hmax, katAdedi: katAdedi,
    taksFromLejand: aTaks==null && lv.taks!=null,
    emsalFromLejand: aEmsal==null && lv.emsal!=null,
    hmaxFromLejand: aHmax==null && lv.hmax!=null,
    emsalEstimate: emsalEstimate,
    planAdi:  pr ? (pr.PLAN_ADI||null) : (plan0.PLAN_ADI||null),
    tasdik:   pr && pr.TASDIK_TARIHI ? pr.TASDIK_TARIHI : null,
    planNotuId: plan0.PLAN_ID!=null ? plan0.PLAN_ID : (pr && pr.PLAN_ID!=null ? pr.PLAN_ID : null),
    lejandlar: fns.map(a=>a.LEJAND_ADI).filter(Boolean),
    scan: null,                                            // plan notu taranınca {taks[],kaks[],yencok[]}
    deferred: false                                        // plan notu 1/1000'e ertelemiş mi
  };
}
function imarRow(label, val){ return (val==null||val==='') ? '' : '<div class="ps-imar-row"><span>'+label+'</span><b>'+escapeHtml(String(val))+'</b></div>'; }
function imarFmtDate(ms){ if(!ms) return null; const d=new Date(ms); return isNaN(d.getTime()) ? null : (d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')); }
/* plan notundan taranan değer satırı (tıklanabilir chip'ler; uygulanan=.on, fonksiyon-ilişkili=.sug ★). */
function imarChipRow(label, type, items, applied){
  if(!items || !items.length) return '';
  const chips = items.map(it=>{
    const on = (applied!=null && Math.abs(applied-it.n)<1e-6);
    const tip = it.snippet ? ' title="'+escapeHtml(it.snippet).replace(/"/g,'&quot;')+'"' : '';
    const mark = it.self ? ' ◆' : (it.km ? ' ★' : '');
    const cls = 'ps-chip'+(on?' on':'')+(it.self?' self':(it.km?' sug':''));
    return '<span class="'+cls+'" data-type="'+type+'" data-val="'+it.n+'"'+tip+'>'+fmt(it.n)+mark+'</span>';
  }).join('');
  return '<div class="ps-imar-chiprow"><span>'+label+'</span> '+chips+'</div>';
}
/* parcelImar → #psImarBilgi paneli. */
function imarRender(im){
  const box = document.getElementById('psImarBilgi'); if(!box) return;
  if(!im){ box.style.display='none'; box.innerHTML=''; return; }
  box.style.display='block';
  let h = '<div class="ps-imar-head">İmar Durumu <span class="ps-dim">(İBB e-Plan)</span></div>';
  if(im.fonksiyon) h += '<div class="ps-imar-fn">'+escapeHtml(im.fonksiyon)+'</div>';
  const taksSrc = im.taksSelf?' (plan notu · rumuz)':(im.taksFromPdf?' (plan notu)':(im.taksFromLejand?' (lejand)':''));
  const emsalSrc = im.emsalSelf?' (plan notu · rumuz)':(im.emsalFromPdf?' (plan notu)':(im.emsalFromLejand?' (lejand)':''));
  const rights = [
    imarRow('TAKS (maks)', im.maksTaks!=null?(fmt(im.maksTaks)+taksSrc):null),
    imarRow('KAKS / Emsal', im.emsal!=null?(fmt(im.emsal)+emsalSrc):null),
    imarRow('Hmax', im.hmax!=null?(fmt(im.hmax)+' m'+(im.hmaxFromLejand?' (lejand)':'')):null),
    imarRow('Kat adedi', im.katAdedi!=null?im.katAdedi:null),
    imarRow('Yoğunluk', im.yogunluk!=null?(fmt(im.yogunluk)+' kişi/ha'):null)
  ].filter(Boolean);
  if(rights.length) h += '<div class="ps-imar-grid">'+rights.join('')+'</div>';
  else h += '<div class="ps-imar-note">Bu planda sayısal TAKS/KAKS özniteliği yok (genelde 1/5000 Nazım); bağlayıcı değerler <b>plan notu</b>ndadır — aşağıdan tarayın.</div>';
  if(im.emsalEstimate!=null && im.emsal==null)
    h += '<div class="ps-imar-est">≈ KAKS <b>'+fmt(im.emsalEstimate)+'</b> <span class="ps-dim">(yoğunluktan TÜRETİLMİŞ tahmin · bağlayıcı değil · kesin değer 1/1000 planında)</span></div>';
  const loc = [im.ada?('Ada '+im.ada):'', im.parsel?('Parsel '+im.parsel):''].filter(Boolean).join(' · ');
  if(loc) h += '<div class="ps-imar-sub">'+escapeHtml(loc)+(im.alan!=null?(' · '+fmt(im.alan)+' m²'):'')+'</div>';
  if(im.mismatch) h += '<div class="ps-imar-warn">⚠ İBB e-Plan bu noktada <b>farklı parsel</b> gösteriyor (yukarıdaki TKGM parselinden); imar bilgisi İBB parseline aittir.</div>';
  if(im.planAdi){ const dt=imarFmtDate(im.tasdik); h += '<div class="ps-imar-plan">'+escapeHtml(im.planAdi)+(dt?(' <span class="ps-dim">('+dt+')</span>'):'')+'</div>'; }
  // plan notu metninden taranan yapılaşma değerleri (varsa) — tıklanan değer imar limitine uygulanır
  if(im.scan){
    const sc=im.scan, all=(sc.taks||[]).concat(sc.kaks||[]);
    const hasAny=(sc.taks.length||sc.kaks.length||sc.yencok.length);
    h += '<div class="ps-imar-scan"><div class="ps-imar-scan-h">Plan notundaki yapılaşma değerleri <span class="ps-dim">(◆ = parselin rumuz satırı · ★ = fonksiyonla ilgili; uygulamak için tıkla)</span></div>';
    h += imarChipRow('TAKS', 'taks', sc.taks, im.taksFromPdf?im.maksTaks:null);
    h += imarChipRow('KAKS/Emsal', 'kaks', sc.kaks, im.emsalFromPdf?im.emsal:null);
    if(sc.yencok && sc.yencok.length)
      h += '<div class="ps-imar-chiprow"><span>Yençok/Hmax</span> '+sc.yencok.map(v=>'<span class="ps-chip ps-chip-static">'+escapeHtml(v)+'</span>').join('')+'</div>';
    if(!hasAny)
      h += '<div class="ps-imar-scan-note ps-dim">'+(im.deferred
        ? 'Bu <b>1/5000 nazım</b> planı yapılaşma değerlerini <b>1/1000 uygulama imar planına</b> ertelemiş; nazımda yalnızca yoğunluk var. Kesin TAKS/KAKS için ilçe belediyesinin uygulama planına / imar durumu belgesine bakın.'
        : 'Plan notunda otomatik tanınan yapılaşma değeri çıkmadı (tablo/biçim); PDF’i açıp inceleyin.')+'</div>';
    else{
      if(all.length){
        h += '<button type="button" id="psScanCond" class="ps-cond-toggle">'+(im.showCond?'Koşul metinlerini gizle ▴':'Koşul metinlerini göster ▾')+'</button>';
        if(im.showCond){
          h += '<div class="ps-cond-list">';
          all.forEach(it=>{ h += '<div class="ps-cond-item'+(it.km?' km':'')+'"><b>'+fmt(it.n)+(it.km?' ★':'')+'</b> '+escapeHtml(it.snippet||'')+'</div>'; });
          h += '</div>';
        }
      }
      h += '<div class="ps-imar-scan-note ps-dim"><b>◆</b> parselin <b>rumuz satırından</b> (yüksek güven, tek değerse otomatik uygulandı) · <b>★</b> fonksiyonla ilişkili ipucu · işaretsiz = plandaki diğer değerler. Kesin değeri koşul metninden teyit edin.</div>';
    }
    h += '</div>';
  } else if(im.planNotuId!=null){
    h += '<button type="button" id="psPlanTara" class="ps-imar-btn2">Plan notundan değerleri tara</button>';
  }
  if(im.planNotuId!=null) h += '<button type="button" id="psPlanNotu" class="ps-imar-btn">Plan notu (PDF)</button>';
  h += '<div class="ps-imar-disc ps-dim">Bilgilendirme amaçlıdır; resmî <b>imar durumu belgesi</b> ile teyit edin.</div>';
  box.innerHTML = h;
  const pn = document.getElementById('psPlanNotu');
  if(pn) pn.addEventListener('click', ()=>imarPlanNotu(im.planNotuId));
  const pt = document.getElementById('psPlanTara');
  if(pt) pt.addEventListener('click', ()=>imarPlanNotuTara(im.planNotuId));
  const sct = document.getElementById('psScanCond');
  if(sct) sct.addEventListener('click', ()=>{ if(parcelImar){ parcelImar.showCond=!parcelImar.showCond; imarRender(parcelImar); } });
  box.querySelectorAll('.ps-chip[data-val]').forEach(c=>
    c.addEventListener('click', ()=>imarApplyVal(c.getAttribute('data-type'), parseFloat(c.getAttribute('data-val')))));
}
/* Plan notu PDF'ini indir (type "p" = plan notu metni). */
async function imarPlanNotu(planId){
  if(planId==null) return;
  const btn = document.getElementById('psPlanNotu'), label='Plan notu (PDF)';
  if(btn){ btn.disabled=true; btn.textContent='İndiriliyor…'; }
  try{
    const r = await fetch(EPLAN_BASE+'/getplannotu', {
      method:'POST', referrerPolicy:'no-referrer',
      headers:{'Content-Type':'application/json', 'Accept':'application/pdf'},
      body: JSON.stringify({planId:planId, type:'p'})
    });
    if(!r.ok) throw new Error('HTTP '+r.status);
    const b = await r.blob();
    if(b.size < 1000) throw new Error('boş');
    const u = URL.createObjectURL(b), a = document.createElement('a');
    a.href=u; a.download='plan_notu_'+planId+'.pdf'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(u), 5000);
    if(btn){ btn.disabled=false; btn.textContent=label; }
  }catch(e){
    if(btn){ btn.disabled=false; btn.textContent='Plan notu bulunamadı'; setTimeout(()=>{ const b2=document.getElementById('psPlanNotu'); if(b2) b2.textContent=label; }, 2600); }
  }
}
/* pdf.js'i CDN'den TEK SEFER lazy-yükle (yalnız plan notu taranınca; ~app zaten ağ-bağımlı). */
let pdfjsPromise = null;
function loadPdfjs(){
  if(pdfjsPromise) return pdfjsPromise;
  const V='4.7.76', cdn='https://cdn.jsdelivr.net/npm/pdfjs-dist@'+V+'/build/';
  pdfjsPromise = import(cdn+'pdf.min.mjs').then(m=>{ m.GlobalWorkerOptions.workerSrc=cdn+'pdf.worker.min.mjs'; return m; });
  return pdfjsPromise;
}
/* Plan notu PDF'ini indir → pdf.js ile {text, lines} üret.
   lines: item x/y koordinatlarından SATIR rekonstrüksiyonu (aynı y = aynı satır, x'e göre sıralı)
   → noktalı-liderli tablolar ('TK10.....1.25') tek satıra toplanır (rumuz+değer yan yana). */
async function eplanPlanNotuDoc(planId){
  const r = await fetch(EPLAN_BASE+'/getplannotu', {
    method:'POST', referrerPolicy:'no-referrer',
    headers:{'Content-Type':'application/json', 'Accept':'application/pdf'},
    body: JSON.stringify({planId:planId, type:'p'})
  });
  if(!r.ok) throw new Error('HTTP '+r.status);
  const buf = await r.arrayBuffer();
  if(buf.byteLength < 1000) throw new Error('boş');
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({data:buf}).promise;
  const lines=[]; let txt='';
  for(let i=1;i<=doc.numPages;i++){
    const pg=await doc.getPage(i); const tc=await pg.getTextContent();
    const rows=new Map();                                       // y(yuvarlanmış) → item[]
    tc.items.forEach(it=>{ if(!it.str || !it.transform) return; const y=Math.round(it.transform[5]);
      if(!rows.has(y)) rows.set(y, []); rows.get(y).push(it); });
    [...rows.keys()].sort((a,b)=>b-a).forEach(y=>{               // yukarıdan aşağı (PDF y yukarı artar)
      const line=rows.get(y).sort((a,b)=>a.transform[4]-b.transform[4]).map(it=>it.str).join(' ').replace(/\s+/g,' ').trim();
      if(line){ lines.push(line); txt+=line+'\n'; }
    });
  }
  return { text: txt.replace(/[ \t]+/g,' '), lines };
}
/* Parselin RUMUZUNU içeren satırlardan ETİKETLİ yapılaşma değerlerini çıkar (parselin KENDİ değeri,
   yüksek güven). Satır rekonstrüksiyonu sayesinde 'TK10= ... E=1.25' / 'TK10.....1.25' tek satırda. */
function imarRumuzRows(lines, keys){
  const found={taks:[], kaks:[], yencok:[]};
  if(!lines || !keys.rumuz.length) return found;
  const rumuzRe = keys.rumuz.map(r=> new RegExp('\\b'+r.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/-/g,'-?')+'\\b'));
  lines.forEach(line=>{
    const ln=imarTrNorm(line);
    if(!rumuzRe.some(re=>re.test(ln))) return;
    const snip=line.replace(/\.{3,}/g,' … ').replace(/\s+/g,' ').trim().slice(0,200);
    let m;
    const reT=/TAKS\s*[:=]?\s*(\d?[.,]\d+)/ig; while(m=reT.exec(line)) found.taks.push({n:parseFloat(m[1].replace(',','.')), snippet:snip});
    const reK=/(?:KAKS|EMSAL|Emsal|\bE)\s*[:=]\s*(\d+(?:[.,]\d+)?)/ig; while(m=reK.exec(line)) found.kaks.push({n:parseFloat(m[1].replace(',','.')), snippet:snip});
    const reH=/(?:Hmax|H\s*max)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/ig; while(m=reH.exec(line)) found.yencok.push(m[1].replace(',','.')+' m');
  });
  const dedup=arr=>{ const s=new Set(),o=[]; arr.forEach(v=>{ const k=v.n.toFixed(2); if(!s.has(k)){s.add(k);o.push(v);} }); return o; };
  return { taks:dedup(found.taks), kaks:dedup(found.kaks), yencok:[...new Set(found.yencok)] };
}
/* Türkçe normalize (eşleştirme için): küçük harf + aksan sadeleştir. */
function imarTrNorm(s){ return String(s||'').toLowerCase()
  .replace(/ı/g,'i').replace(/İ/g,'i').replace(/ş/g,'s').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ö/g,'o').replace(/ç/g,'c'); }
/* Değerin geçtiği yerin çevresinden koşul-metni (madde) penceresi (~koşul değerden önce gelir). */
function imarSnippet(text, start, end){
  let s=Math.max(0,start-175), e=Math.min(text.length,end+70);
  if(s>0){ const sp=text.indexOf(' ', s); if(sp>=0 && sp<start) s=sp+1; }
  if(e<text.length){ const sp2=text.lastIndexOf(' ', e); if(sp2>end) e=sp2; }
  return (s>0?'…':'')+text.slice(s,e).replace(/\s+/g,' ').trim()+(e<text.length?'…':'');
}
/* Parselin LEJAND_ADI'sinden eşleştirme anahtarları: rumuz (K-4, TICK-1, T3) + fonksiyon sözcükleri.
   rumuz = kısa kod → KELİME-SINIRIYLA eşleşir ('k3', 'tk3'i eşlemesin); word = uzun fonksiyon sözcüğü → alt-dize. */
function imarParcelKeywords(im){
  const rumuz=[], words=[]; if(!im || !im.fonksiyon) return {rumuz, words};
  let m, re=/\b([A-ZÇĞİÖŞÜ]{1,5}-?\d+[A-Za-z]?)\b/g;
  while(m=re.exec(im.fonksiyon)){ rumuz.push(imarTrNorm(m[1])); }
  const fn=imarTrNorm(im.fonksiyon);
  ['konut','ticaret','ticari','sanayi','turizm','saglik','egitim','sosyal','resmi','park','yesil','dini','otopark','depolama','mezarlik'].forEach(w=>{ if(fn.indexOf(w)>=0) words.push(w); });
  return { rumuz:rumuz.filter((v,i,a)=>a.indexOf(v)===i), words:words.filter((v,i,a)=>a.indexOf(v)===i) };
}
/* normalize edilmiş snippet, parselin anahtarlarından birini içeriyor mu (rumuz: kelime-sınırı, word: alt-dize). */
function imarKeyMatch(snipNorm, keys){
  for(let i=0;i<keys.words.length;i++){ if(snipNorm.indexOf(keys.words[i])>=0) return true; }
  for(let i=0;i<keys.rumuz.length;i++){
    const r=keys.rumuz[i]; if(!r) continue;
    const pat=r.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/-/g,'-?');   // tire opsiyonel (k-4 ≈ k4)
    if(new RegExp('\\b'+pat+'\\b').test(snipNorm)) return true;
  }
  return false;
}
/* Plan notu metninden yapılaşma değerlerini KOŞUL-METNİYLE çıkar.
   NOT: plan notu çok bölge/koşul içerir; tablolar düz metne taşınca dağılır → tek "doğru"yu
   GÜVENİLİR seçmek mümkün değil (10 ilçede doğrulandı: yanlış pozitifler). Bu yüzden TÜM
   benzersiz değerleri snippet'iyle döndürürüz; km = snippet parselin fonksiyon/rumuzunu içeriyor
   (yumuşak ipucu, ★). Kesin seçim + uygulama kullanıcıda. */
function imarScanValues(text, im, lines){
  const keys = imarParcelKeywords(im);
  const collect = (re)=>{
    const map=new Map(); let m;
    while(m=re.exec(text)){
      const raw=(m[1]!=null?m[1]:m[2]); if(raw==null) continue;
      const n=parseFloat(String(raw).replace(',', '.')); if(isNaN(n)) continue;
      const snip=imarSnippet(text, m.index, m.index+m[0].length);
      const km=(keys.rumuz.length||keys.words.length) ? imarKeyMatch(imarTrNorm(snip), keys) : false;
      const key=n.toFixed(2); const rec=map.get(key);
      if(!rec){ map.set(key,{n, snippet:snip, km}); }
      else if(km && !rec.km){ rec.km=true; rec.snippet=snip; }   // fonksiyon-eşleşen snippet'i tercih et
    }
    return [...map.values()].sort((a,b)=> (b.km-a.km) || (a.n-b.n));
  };
  const taks=collect(/TAKS\s*[:=]?\s*(\d?[.,]\d+)/ig);
  const kaks=collect(/(?:KAKS|EMSAL|Emsal)\s*[:=]?\s*(\d+(?:[.,]\d+)?)|\bE\s*[:=]\s*(\d+(?:[.,]\d+)?)/ig);
  const yset=new Set(); let m;
  const reKat=/(?:yençok|yencok)\s*[:=]?\s*(\d{1,2})\s*kat/ig; while(m=reKat.exec(text)) yset.add(m[1]+' kat');
  const reH=/(?:Hmax|H\s*max)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/ig; while(m=reH.exec(text)) yset.add(String(m[1]).replace(',', '.')+' m');
  const reIrt=/(\d+(?:[.,]\d+)?)\s*m?\s*irtifa/ig; while(m=reIrt.exec(text)) yset.add(String(m[1]).replace(',', '.')+' m');
  // RUMUZ-SATIRI: parselin kendi rumuz satırından çıkan etiketli değerler = yüksek güven (self ◆)
  const self = imarRumuzRows(lines, keys);
  const mergeSelf = (arr, sv)=>{
    sv.forEach(s=>{ const k=s.n.toFixed(2); const rec=arr.find(r=>r.n.toFixed(2)===k);
      if(rec){ rec.km=true; rec.self=true; if(s.snippet) rec.snippet=s.snippet; }
      else arr.push({n:s.n, snippet:s.snippet||'', km:true, self:true}); });
    arr.sort((a,b)=> ((b.self?1:0)-(a.self?1:0)) || (b.km-a.km) || (a.n-b.n));
  };
  mergeSelf(taks, self.taks); mergeSelf(kaks, self.kaks);
  self.yencok.forEach(v=>{ yset.delete(v); yset.add('◆ '+v); });   // rumuz-satırı Hmax → ◆ işaretle
  // deferral: 1/5000 nazım, değeri 1/1000 uygulama planına ertelemiş mi
  const deferred = /1\s*\/\s*1000[^.\n]{0,90}(belirlen|yapıl|göre|onan)|net\s+parsel\s+üzerinden|uygulama\s+imar\s+plan[a-zçğıöşü]*[^.\n]{0,70}belirlen|avan\s+proje/i.test(text);
  return { taks, kaks, yencok:[...yset], deferred:deferred,
    suggestedTaks: self.taks.length===1 ? self.taks[0].n : null,
    suggestedKaks: self.kaks.length===1 ? self.kaks[0].n : null };
}
/* "Plan notundan değerleri tara" → PDF indir + metne çevir + değerleri çıkar + panele bas. */
async function imarPlanNotuTara(planId){
  if(planId==null) return;
  const btn = document.getElementById('psPlanTara');
  if(btn){ btn.disabled=true; btn.textContent='Plan notu taranıyor…'; }
  try{
    const doc = await eplanPlanNotuDoc(planId);
    const scan = imarScanValues(doc.text, parcelImar, doc.lines);
    if(parcelImar){
      parcelImar.scan = scan;
      parcelImar.deferred = !!scan.deferred;
      // rumuz-satırı TEK değer = parselin kesin yapılaşma değeri → attribute boşsa OTOMATİK uygula (geri alınabilir)
      if(scan.suggestedTaks!=null && parcelImar.maksTaks==null){ parcelImar.maksTaks=scan.suggestedTaks; parcelImar.taksFromPdf=true; parcelImar.taksSelf=true; }
      if(scan.suggestedKaks!=null && parcelImar.emsal==null){ parcelImar.emsal=scan.suggestedKaks; parcelImar.emsalFromPdf=true; parcelImar.emsalSelf=true; }
      imarRender(parcelImar);
      if(typeof plan!=='undefined' && plan && typeof runChecks==='function') runChecks();
    }
  }catch(e){
    if(btn){ btn.disabled=false; btn.textContent='Tarama başarısız ('+(e.message||'ağ')+')';
      setTimeout(()=>{ const b=document.getElementById('psPlanTara'); if(b) b.textContent='Plan notundan değerleri tara'; }, 2800); }
  }
}
/* Taranan bir değeri imar limitine uygula (TAKS→maksTaks, KAKS→emsal); tekrar tıkla=geri al.
   checks.js bu değerleri okur → mevzuat denetimi gerçek limite göre çalışır. */
function imarApplyVal(type, val){
  if(!parcelImar || isNaN(val)) return;
  const scan=parcelImar.scan;
  const isSelf = !!(scan && (scan[type]||[]).some(it=>it.self && Math.abs(it.n-val)<1e-6));
  if(type==='taks'){ const on = parcelImar.taksFromPdf && Math.abs((parcelImar.maksTaks!=null?parcelImar.maksTaks:NaN)-val)<1e-6; parcelImar.maksTaks = on?null:val; parcelImar.taksFromPdf = !on; parcelImar.taksSelf = on?false:isSelf; }
  else if(type==='kaks'){ const on = parcelImar.emsalFromPdf && Math.abs((parcelImar.emsal!=null?parcelImar.emsal:NaN)-val)<1e-6; parcelImar.emsal = on?null:val; parcelImar.emsalFromPdf = !on; parcelImar.emsalSelf = on?false:isSelf; }
  imarRender(parcelImar);
  if(typeof plan!=='undefined' && plan && typeof runChecks==='function') runChecks();
  if(typeof render==='function') render();                 // panel canlı TAKS karşılaştırmasını tazele
}

/* Parsel yüklendikten sonra imar durumunu çek (asenkron, fire-and-forget).
   ll verilirse (koordinat akışı, parsel içi kesin nokta) onu, yoksa parsel
   ağırlık merkezini kullan. Eski istekler imarReqId ile iptal edilir. */
/* getbypoint birden çok parsel döndürebilir (tolerans komşuyu kapar) → TKGM ada/parseline
   uyanı seç; yoksa ilki (mismatch render'da uyarılır). */
function imarPickFeature(features, ada, parsel){
  if(!features || !features.length) return null;
  if(ada!=null && parsel!=null){
    const hit = features.find(f=> f.attributes && String(f.attributes.ADA)===String(ada) && String(f.attributes.PARSEL)===String(parsel));
    if(hit) return hit;
  }
  return features[0];
}
let imarReqId = 0;
async function imarLoad(ll, tkgmAda, tkgmParsel){
  const box = document.getElementById('psImarBilgi');
  parcelImar = null;
  const pt = (ll && isFinite(ll.lat) && isFinite(ll.lng)) ? ll : psRingCentroidLL();
  if(!pt){ imarRender(null); return; }
  const myId = ++imarReqId;
  if(box){ box.style.display='block'; box.innerHTML='<div class="ps-imar-load">İmar durumu sorgulanıyor… <span class="ps-dim">(İBB e-Plan)</span></div>'; }
  try{
    const [x,y] = psLL2Merc(pt.lng, pt.lat);
    const bp = await eplanPost('/getbypoint', {x, y});
    if(myId !== imarReqId) return;                       // eskimiş istek
    const f = imarPickFeature(bp.features, tkgmAda, tkgmParsel);
    if(!f){ imarRender(null); if(box){ box.style.display='block'; box.innerHTML='<div class="ps-imar-empty">Bu parsel için İBB e-Plan’da sayısal imar verisi yok <span class="ps-dim">(yalnız İstanbul).</span></div>'; } return; }
    const gp = await eplanPost('/getparsel', {objectId: f.attributes.OBJECTID});
    if(myId !== imarReqId) return;
    parcelImar = imarParse(gp);
    if(tkgmAda!=null && tkgmParsel!=null && parcelImar.ada!=null && parcelImar.parsel!=null)
      parcelImar.mismatch = (String(tkgmAda)!==String(parcelImar.ada) || String(tkgmParsel)!==String(parcelImar.parsel));
    imarRender(parcelImar);
    if(typeof plan!=='undefined' && plan && typeof runChecks==='function') runChecks();
  }catch(e){
    if(myId !== imarReqId) return;
    parcelImar = null;
    if(box){ box.style.display='block'; box.innerHTML='<div class="ps-imar-empty">İmar durumu alınamadı <span class="ps-dim">('+escapeHtml(e.message||'ağ')+').</span></div>'; }
  }
}

/* ---- panel ---- */
function initParselSorgu(){
  const $ = id => document.getElementById(id);
  const inp = $('psInput'), btn = $('psFetch'), msg = $('psMsg');
  if(!inp || !btn) return;

  function setMsg(html, kind){
    if(!html){ msg.style.display='none'; msg.textContent=''; return; }
    msg.style.display='block'; msg.className='ps-msg ps-'+(kind||'info'); msg.innerHTML=html;
  }
  function updateBtn(){ btn.disabled = !inp.value.trim(); }

  async function getJson(url){
    // Referer GÖNDERME: TKGM WAF'ı tanımadığı Referer'lı (ör. localhost / kendi
    // domainin) isteği 403'le reddediyor; Referer'sız istek 200 döner.
    // Timeout: TKGM API host'u (cbsapi) bazen TCP'yi kabul edip HTTP yanıtı VERMEZ
    // (askıda) → timeout'suz fetch ~dk'larca asılıp "Load failed" der. 12sn'de kes.
    const ctl = new AbortController();
    const to = setTimeout(()=>ctl.abort(), 12000);
    let r;
    try{
      r = await fetch(url, {headers:{'Accept':'application/json'}, referrerPolicy:'no-referrer', signal:ctl.signal});
    }catch(e){
      const err = new Error(ctl.signal.aborted ? 'TKGM sunucusu yanıt vermedi (zaman aşımı)' : 'TKGM sunucusuna ulaşılamadı');
      err.network = true; throw err;
    }finally{ clearTimeout(to); }
    if(!r.ok){
      let m = 'HTTP '+r.status;
      try{ const j = await r.json(); if(j && j.Message) m = j.Message; }catch(e){}
      const err = new Error(m); err.status = r.status; throw err;
    }
    return r.json();
  }

  // ortak: TKGM yanıtından parseli yükle + bilgi göster (koordinat ve ada/parsel akışı)
  function applyData(data, adaF, parF, ll){
    const ring = tkgmExtractRing(data);
    if(!ring){ setMsg('Parsel sınır geometrisi bulunamadı.', 'err'); return false; }
    const world = tkgmGeoToWorld(ring);
    if(!world || world.length < 3){ setMsg('Parsel geometrisi çözümlenemedi.', 'err'); return false; }
    tkgmLoadParcel(world);
    const imar = document.getElementById('psImar'); if(imar) imar.style.display = 'block';
    const p = data.properties || {};
    const konum = [p.ilAd, p.ilceAd, p.mahalleAd].filter(Boolean).join(' / ');
    const ada = p.adaNo || adaF || '–', par = p.parselNo || parF || '–';
    const alanR = tkgmParseAlan(p.alan);
    const alan = (alanR!=null) ? fmt(alanR)+' m² <span class="ps-dim">(TKGM)</span>'
                               : '≈ '+fmt(shoelace(parcelPts))+' m²';
    setMsg('✓ Parsel yüklendi'
      + (konum ? '<br><b>'+escapeHtml(konum)+'</b>' : '')
      + '<br>Ada <b>'+escapeHtml(ada)+'</b> · Parsel <b>'+escapeHtml(par)+'</b>'
      + '<br>Alan '+alan
      + (p.nitelik ? '<br><span class="ps-dim">'+escapeHtml(p.nitelik)+'</span>' : ''),
      'ok');
    imarLoad(ll||null, p.adaNo||adaF||null, p.parselNo||parF||null);   // İBB e-Plan imar durumunu çek (asenkron); TKGM ada/parsel ile eşleştir
    return true;
  }

  async function sorgula(){
    const raw = inp.value;
    const ll = tkgmParseLatLng(raw);
    if(!ll){
      setMsg(tkgmIsShortMapsLink(raw)
        ? 'Kısa Maps linki çözümlenemiyor. Linki tarayıcıda açıp adres çubuğundaki <b>tam URL</b>’yi ya da <b>sağ tık → koordinat</b> değerini yapıştırın.'
        : 'Koordinat bulunamadı. Örnek: <code>41.0082, 28.9784</code> veya tam bir Google Maps bağlantısı.', 'err');
      return;
    }
    btn.disabled = true;
    setMsg('Parsel sorgulanıyor… <span class="ps-dim">('+ll.lat.toFixed(5)+', '+ll.lng.toFixed(5)+')</span>', 'load');
    try{
      const data = await getJson(TKGM_PARSEL_URL(ll.lat, ll.lng));
      applyData(data, null, null, ll);                    // ll: parsel içi kesin nokta (imar sorgusu için)
    }catch(e){
      if(e.network){
        // TKGM API host'u düştü → İstanbul ise e-Plan getbypoint'ten parseli dene
        setMsg('TKGM yanıt vermedi; <b>İBB e-Plan</b>’dan deneniyor… <span class="ps-dim">(İstanbul)</span>', 'load');
        try{
          const ep = await eplanParcelFallback(ll);
          if(ep){ applyData(ep, null, null, ll); return; }
          setMsg('TKGM CBS erişilemiyor ve bu nokta İstanbul (İBB e-Plan) dışında görünüyor — birkaç dakika sonra tekrar deneyin.', 'err');
        }catch(e2){
          setMsg('<b>'+escapeHtml(e.message)+'.</b> TKGM CBS geçici erişilemiyor; İBB e-Plan da yanıt vermedi — birkaç dakika sonra tekrar deneyin.', 'err');
        }
      } else {
        setMsg(e.status===404
          ? 'Bu konumda kayıtlı parsel yok (yol / deniz / orman olabilir). Noktayı parselin içine alıp tekrar deneyin.'
          : 'Sorgu başarısız: '+escapeHtml(e.message||'ağ hatası')+'.', 'err');
      }
    }finally{
      updateBtn();
    }
  }

  /* ---- alternatif giriş: il/ilçe/mahalle + ada/parsel ---- */
  const ilSel=$('psIl'), ilceSel=$('psIlce'), mahSel=$('psMah'),
        adaIn=$('psAda'), parIn=$('psParsel'), btn2=$('psFetch2'),
        altToggle=$('psAltToggle'), altBox=$('psAltBox');

  function resetSel(sel, ph){ if(sel){ sel.innerHTML='<option value="">'+ph+'</option>'; sel.disabled=true; } }
  function fillSel(sel, items){
    if(!items.length){ sel.innerHTML='<option value="">(kayıt yok)</option>'; sel.disabled=true; return; }
    sel.innerHTML='<option value="">Seçiniz…</option>';
    items.forEach(it=>{ const o=document.createElement('option'); o.value=it.properties.id; o.textContent=it.properties.text; sel.appendChild(o); });
    sel.disabled=false;
  }
  function updateBtn2(){ if(btn2) btn2.disabled = !(mahSel && mahSel.value && adaIn.value.trim() && parIn.value.trim()); }

  async function sorgulaAP(){
    const m=mahSel.value, a=adaIn.value.trim(), p=parIn.value.trim();
    if(!m||!a||!p) return;
    btn2.disabled=true;
    setMsg('Parsel sorgulanıyor… <span class="ps-dim">'+escapeHtml(mahSel.options[mahSel.selectedIndex].text)+' '+escapeHtml(a)+'/'+escapeHtml(p)+'</span>', 'load');
    try{ applyData(await getJson(TKGM_URL.parsel(m,a,p)), a, p); }
    catch(e){ setMsg(e.status===404 ? 'Bu ada/parsel bulunamadı (numaraları kontrol edin).'
                     : e.network ? '<b>'+escapeHtml(e.message)+'.</b> TKGM CBS geçici olarak erişilemiyor olabilir — birkaç dakika sonra tekrar deneyin.'
                                     : 'Sorgu başarısız: '+escapeHtml(e.message||'ağ hatası')+'.', 'err'); }
    finally{ updateBtn2(); }
  }

  if(ilSel){
    ilSel.innerHTML='<option value="">Seçiniz…</option>';
    TKGM_ILLER.forEach(il=>{ const o=document.createElement('option'); o.value=il.i; o.textContent=il.t; ilSel.appendChild(o); });
    resetSel(ilceSel,'Önce il seçin'); resetSel(mahSel,'Önce ilçe seçin');

    altToggle.addEventListener('click', ()=>{
      const open = altBox.style.display==='none';
      altBox.style.display = open ? 'block' : 'none';
      altToggle.classList.toggle('open', open);
    });
    ilSel.addEventListener('change', async ()=>{
      resetSel(ilceSel,'Yükleniyor…'); resetSel(mahSel,'Önce ilçe seçin'); updateBtn2();
      if(!ilSel.value){ resetSel(ilceSel,'Önce il seçin'); return; }
      try{ const d=await getJson(TKGM_URL.ilce(ilSel.value)); fillSel(ilceSel, d.features||[]); }
      catch(e){ resetSel(ilceSel,'Hata'); setMsg('İlçeler alınamadı: '+escapeHtml(e.message),'err'); }
    });
    ilceSel.addEventListener('change', async ()=>{
      resetSel(mahSel,'Yükleniyor…'); updateBtn2();
      if(!ilceSel.value){ resetSel(mahSel,'Önce ilçe seçin'); return; }
      try{ const d=await getJson(TKGM_URL.mahalle(ilceSel.value)); fillSel(mahSel, d.features||[]); }
      catch(e){ resetSel(mahSel,'Hata'); setMsg('Mahalleler alınamadı: '+escapeHtml(e.message),'err'); }
    });
    mahSel.addEventListener('change', updateBtn2);
    adaIn.addEventListener('input', updateBtn2);
    parIn.addEventListener('input', updateBtn2);
    parIn.addEventListener('keydown', e=>{ if(e.key==='Enter' && !btn2.disabled) sorgulaAP(); });
    btn2.addEventListener('click', sorgulaAP);
  }

  inp.addEventListener('input', updateBtn);
  inp.addEventListener('keydown', e=>{ if(e.key==='Enter' && !btn.disabled) sorgula(); });
  btn.addEventListener('click', sorgula);
  var cek=document.getElementById('psCekme');
  if(cek) cek.addEventListener('input', function(){ psComputeSetback(); render(); });
  var dbld=document.getElementById('psDrawBld');
  if(dbld) dbld.addEventListener('click', psDrawBuilding);
  var sat=document.getElementById('psSat');
  if(sat) sat.addEventListener('change', function(){ psSatOn=sat.checked; psUpdateSatellite(); render(); });
  // ---- döndürme (eksene hizalama) ----
  var rotR=$('psRotRange'), rotN=$('psRotNum');
  if(rotR) rotR.addEventListener('input', function(){ psRotateTo(rotR.value); });
  if(rotN) rotN.addEventListener('input', function(){ psRotateTo(rotN.value); });
  var bL=$('psRotL'), bR=$('psRotR'), bA=$('psRotAuto'), bE=$('psRotEdge'), bRe=$('psRotReset');
  if(bL)  bL.addEventListener('click', function(){ psRotateBy(-1); });
  if(bR)  bR.addEventListener('click', function(){ psRotateBy(1); });
  if(bA)  bA.addEventListener('click', psAutoAlign);
  if(bE)  bE.addEventListener('click', psRotEdge);
  if(bRe) bRe.addEventListener('click', psRotReset);
  updateBtn();
}
