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

const TKGM_PARSEL_URL = (lat, lng) =>
  'https://cbsapi.tkgm.gov.tr/megsiswebapi.v3.1/api/parsel/' + lat + '/' + lng;

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

/* WGS84 halkasını ([[lng,lat],...]) yerel metre düzlemine çevir:
   merkez orijinde, kuzey yukarı (enlem artarsa ekran y'si küçülür). */
function tkgmGeoToWorld(ring){
  let r = ring.filter(c => Array.isArray(c) && c.length>=2 && isFinite(c[0]) && isFinite(c[1]));
  r = r.filter((c,i)=> i===0 || Math.abs(c[0]-r[i-1][0])>1e-12 || Math.abs(c[1]-r[i-1][1])>1e-12); // ardışık tekrarları ayıkla
  if(r.length>=2){ const a=r[0], b=r[r.length-1];
    if(Math.abs(a[0]-b[0])<1e-9 && Math.abs(a[1]-b[1])<1e-9) r = r.slice(0,-1); }               // kapanış noktasını at
  if(r.length < 3) return null;
  let lng0=0, lat0=0; r.forEach(c=>{ lng0+=c[0]; lat0+=c[1]; }); lng0/=r.length; lat0/=r.length;
  const phi = lat0*Math.PI/180;
  const mLat = 111132.954 - 559.822*Math.cos(2*phi) + 1.175*Math.cos(4*phi); // m / derece enlem
  const mLng = 111319.488*Math.cos(phi);                                     // m / derece boylam
  return r.map(c => ({
    x: Math.round((c[0]-lng0)*mLng*1000)/1000,
    y: Math.round((lat0-c[1])*mLat*1000)/1000
  }));
}

/* Parseli araca yükle. Bina çizili ise parsel ortasını binaya hizala
   (bina parselin içinde kalsın), yoksa orijinde bırak; sonra çerçevele. */
function tkgmLoadParcel(world){
  if(typeof pts!=='undefined' && pts.length && closed){
    const bc = centroidOf(pts), pc = centroidOf(world);
    const dx = bc.x-pc.x, dy = bc.y-pc.y;
    world = world.map(q=>({ x:Math.round((q.x+dx)*1000)/1000, y:Math.round((q.y+dy)*1000)/1000 }));
  }
  parcelPts = world;
  parcelClosed = true;
  psComputeSetback();
  if(typeof plan!=='undefined' && plan && typeof runChecks==='function') runChecks();
  fitView();
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
      const ring = tkgmExtractRing(data);
      if(!ring){ setMsg('Bu konumda parsel sınırı bulunamadı.', 'err'); return; }
      const world = tkgmGeoToWorld(ring);
      if(!world || world.length < 3){ setMsg('Parsel geometrisi çözümlenemedi.', 'err'); return; }
      tkgmLoadParcel(world);
      var imar=document.getElementById('psImar'); if(imar) imar.style.display='block';

      const p = data.properties || {};
      const konum = [p.ilAd, p.ilceAd, p.mahalleAd].filter(Boolean).join(' / ');
      const ada = p.adaNo || '–', par = p.parselNo || '–';
      const alanR = tkgmParseAlan(p.alan);
      const alan = (alanR!=null) ? fmt(alanR)+' m² <span class="ps-dim">(TKGM)</span>'
                                 : '≈ '+fmt(shoelace(parcelPts))+' m²';
      setMsg('✓ Parsel yüklendi'
        + (konum ? '<br><b>'+escapeHtml(konum)+'</b>' : '')
        + '<br>Ada <b>'+escapeHtml(ada)+'</b> · Parsel <b>'+escapeHtml(par)+'</b>'
        + '<br>Alan '+alan
        + (p.nitelik ? '<br><span class="ps-dim">'+escapeHtml(p.nitelik)+'</span>' : ''),
        'ok');
    }catch(e){
      setMsg(e.status===404
        ? 'Bu konumda kayıtlı parsel yok (yol / deniz / orman olabilir). Noktayı parselin içine alıp tekrar deneyin.'
        : 'Sorgu başarısız: '+escapeHtml(e.message||'ağ hatası')+'.', 'err');
    }finally{
      updateBtn();
    }
  }

  inp.addEventListener('input', updateBtn);
  inp.addEventListener('keydown', e=>{ if(e.key==='Enter' && !btn.disabled) sorgula(); });
  btn.addEventListener('click', sorgula);
  var cek=document.getElementById('psCekme');
  if(cek) cek.addEventListener('input', function(){ psComputeSetback(); render(); });
  updateBtn();
}
