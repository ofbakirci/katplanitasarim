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
/* Parseli her kenardan d metre içe ofsetle (kenar yarım-düzlemlerinin kesişimi;
   dışbükey parselde tam, içbükeyde şematik/temkinli — sonuç her zaman parsel içinde). */
function tkgmSetback(poly, d){
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
    const r = await fetch(url, {headers:{'Accept':'application/json'}, referrerPolicy:'no-referrer'});
    if(!r.ok){
      let m = 'HTTP '+r.status;
      try{ const j = await r.json(); if(j && j.Message) m = j.Message; }catch(e){}
      const err = new Error(m); err.status = r.status; throw err;
    }
    return r.json();
  }

  // ortak: TKGM yanıtından parseli yükle + bilgi göster (koordinat ve ada/parsel akışı)
  function applyData(data, adaF, parF){
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
      applyData(data);
    }catch(e){
      setMsg(e.status===404
        ? 'Bu konumda kayıtlı parsel yok (yol / deniz / orman olabilir). Noktayı parselin içine alıp tekrar deneyin.'
        : 'Sorgu başarısız: '+escapeHtml(e.message||'ağ hatası')+'.', 'err');
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
