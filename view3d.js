/* ===== 3B Görünüm — canlı plandan three.js dollhouse mesh =====
   Toolbar "3B" butonu → tam-ekran overlay açar, buildFloorplanMap() (io.js) ile
   o anki planın oda poligonlarını alıp gerçek 3B mesh kurar. AI YOK — gerçek geometri.
   three.js CDN'den LAZY yüklenir (sadece ilk açılışta). mesh_prototip.html mantığının
   motora gömülü kardeşi; KPTA'da çalışır, npm run build ile Mesken prototip'e de iner.

   Bağımlılık: window.buildFloorplanMap (io.js) — runtime oda haritası. */
(function(){
  'use strict';
  const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  const WALL_H = 2.7, FLOOR_T = 0.08, DOOR_H = 2.1;   // DOOR_H = kapı boşluğu yüksekliği (lentö altı)
  const WALL_LOW = 0.5;   // varsayılan duvar oranı: YARI yükseklik (dollhouse + hacim okunur). roofOn=tam.
  let overlay, host, status, scene, cam, renderer, controls, raf, roofOn=false, lblOn=true;
  let threeLoading=null, built=false, zoomEl=null, zoomActive=false;
  // ── kamera-koyma modu (adım 4): raycaster ile zemine tıkla → kamera; çıktı plan-px uzayında ──
  let placeMode=false, camList=[], activeCamIdx=-1, pendingPos=null, camHeight='eye', camLens=24;
  let camGizmos=null, raycaster=null, pickerWired=false;
  const CAM_Y = { low:1.1, eye:1.6, high:2.2 };          // 3 kademe yükseklik (m) — prototip height ile birebir
  const LENS_FOV = { 16:100, 24:74, 35:54, 50:40 };       // objektif → yatay görüş açısı

  // oda tipi (TR motor tipi ya da EN) -> sıcak zemin rengi
  // ODA TİPİ = BELİRGİN AYRIK RENK → AI renkten tipi anlasın (karıştırmasın).
  // ANAHTARLAR fpRoomEnum() çıktısıyla BİREBİR (io.js): küçük harf, alt çizgili enum.
  const COL = {
    bathroom:0x4f9fd6, wc:0x4f9fd6,                 // banyo/wc = MAVİ
    bedroom:0x66b56a,                               // yatak (eb. dahil) = YEŞİL
    living:0xe0843a, living_kitchen:0xe0a93c,        // salon = TURUNCU · salon+mutfak = amber
    kitchen:0xe8c84a,                                // mutfak = SARI
    studio:0xd98f4e, study:0x8fc7b0,                 // stüdyo ~salon · çalışma = nane
    hall:0xe8dcc0,                                   // antre/koridor = AÇIK BEJ
    room:0xcbb896,                                   // genel oda = nötr bej
    stairs:0x6f6f76, elevator:0x5a5a62, shaft:0x7a7a82, fire_stairs:0x55555c,  // çekirdek = KOYU GRİ
    balcony:0x9fd08a, storage:0xb7a98c, parking:0x9a9a9a, shelter:0x8a8a90, shop:0xd9b36a,
    _def:0xcbb896
  };
  function colorFor(o){
    const t=(o.type||'').toString().toLowerCase();
    if(COL[t]!=null) return COL[t];
    // yedek: type_tr / name_en / name içinde anahtar geçiyor mu
    const alt=((o.type_tr||'')+' '+(o.name_en||'')+' '+(o.name||'')).toLowerCase();
    if(/banyo|bath/.test(alt)) return COL.bathroom;
    if(/wc/.test(alt)) return COL.wc;
    if(/mutfak|kitchen/.test(alt) && /salon|living/.test(alt)) return COL.living_kitchen;
    if(/mutfak|kitchen/.test(alt)) return COL.kitchen;
    if(/salon|living/.test(alt)) return COL.living;
    if(/yatak|bedroom|ebeveyn/.test(alt)) return COL.bedroom;
    if(/antre|koridor|hall|hol|entry|corridor/.test(alt)) return COL.hall;
    if(/merdiven|stair/.test(alt)) return COL.stairs;
    if(/asans|elevator/.test(alt)) return COL.elevator;
    if(/yangin|fire/.test(alt)) return COL.fire_stairs;
    if(/balkon|balcony/.test(alt)) return COL.balcony;
    return COL._def;
  }

  function ensureOverlay(){
    if(overlay) return;
    overlay=document.createElement('div');
    overlay.id='view3dOverlay';
    overlay.style.cssText='position:fixed;inset:0;z-index:9999;background:#15151a;display:none;';
    overlay.innerHTML =
      '<div id="v3dHost" style="position:absolute;inset:0"></div>'+
      '<div style="position:absolute;top:12px;left:12px;background:rgba(38,38,46,.92);color:#e8e6e0;'+
        'font:13px/1.4 system-ui,sans-serif;padding:12px 14px;border-radius:10px;max-width:280px;backdrop-filter:blur(6px)">'+
        '<b style="color:#c9a16b">3B Görünüm</b><br>'+
        '<span style="font-size:11.5px;opacity:.85">Gerçek geometriden — AI yok. Plandaki her oda zeminden çıkarıldı, '+
        'bitişik sınırlar = iç duvarlar (mutfak/salon dahil).</span>'+
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">'+
          '<button data-v3d="iso" class="v3db">İzometrik</button>'+
          '<button data-v3d="top" class="v3db">Üstten</button>'+
          '<button data-v3d="persp" class="v3db">Perspektif</button>'+
          '<button data-v3d="fit" class="v3db" style="background:#7bbf8a;color:#13201a">⤢ Sığdır</button>'+
        '</div>'+
        '<div style="display:flex;align-items:center;gap:8px;margin-top:10px">'+
          '<span style="font-size:13px;opacity:.85" title="Yakınlaştır">🔍</span>'+
          '<input type="range" id="v3dZoom" min="0" max="1000" value="600" '+
            'style="flex:1;accent-color:#c9a16b;cursor:pointer">'+
        '</div>'+
        '<label style="display:flex;align-items:center;gap:6px;font-size:11.5px;margin-top:8px;cursor:pointer">'+
          '<input type="checkbox" data-v3d="roof"> Duvarlar tam yükseklik</label>'+
        '<label style="display:flex;align-items:center;gap:6px;font-size:11.5px;cursor:pointer">'+
          '<input type="checkbox" data-v3d="lbl" checked> Oda etiketleri</label>'+
        '<div style="display:flex;gap:6px;margin-top:10px">'+
          '<button data-v3d="png" class="v3db" title="Etiketler İngilizce — AI 3D render için">PNG indir (EN)</button>'+
          '<button data-v3d="close" class="v3db" style="background:#3a3a44;color:#e8e6e0">Kapat ✕</button>'+
        '</div>'+
        '<div style="border-top:1px solid rgba(255,255,255,.15);margin-top:10px;padding-top:10px">'+
          '<button data-v3d="place" class="v3db" id="v3dPlaceBtn">📷 Kamera koy</button>'+
          '<span id="v3dCamCount" style="font-size:10.5px;opacity:.7;margin-left:6px"></span>'+
          '<div id="v3dCamCtl" style="display:none;margin-top:8px">'+
            '<div style="font-size:10.5px;opacity:.7;margin-bottom:4px">Yükseklik</div>'+
            '<div style="display:flex;gap:4px">'+
              '<button data-camh="low" class="v3db v3dh">Alçak</button>'+
              '<button data-camh="eye" class="v3db v3dh">Göz</button>'+
              '<button data-camh="high" class="v3db v3dh">Üst</button></div>'+
            '<div style="font-size:10.5px;opacity:.7;margin:6px 0 4px">Objektif</div>'+
            '<div style="display:flex;gap:4px">'+
              '<button data-caml="16" class="v3db v3dl">16</button>'+
              '<button data-caml="24" class="v3db v3dl">24</button>'+
              '<button data-caml="35" class="v3db v3dl">35</button></div>'+
            '<button data-v3d="camclear" class="v3db" style="margin-top:8px;background:#3a3a44;color:#e8e6e0">Temizle</button>'+
            '<div id="v3dCamHint" style="font-size:10px;opacity:.75;margin-top:6px;min-height:12px"></div>'+
          '</div>'+
        '</div>'+
        '<div id="v3dStatus" style="font-size:10.5px;opacity:.6;margin-top:8px"></div>'+
      '</div>';
    document.body.appendChild(overlay);
    // buton stilleri
    const st=document.createElement('style');
    st.textContent='.v3db{background:#c9a16b;color:#1a1a1f;border:0;padding:6px 10px;border-radius:7px;'+
      'font-weight:600;cursor:pointer;font-size:11.5px}.v3db:hover{filter:brightness(1.08)}';
    document.head.appendChild(st);
    host=overlay.querySelector('#v3dHost');
    status=overlay.querySelector('#v3dStatus');
    overlay.addEventListener('click',function(e){
      const t=e.target;
      const ch=t.getAttribute&&t.getAttribute('data-camh'); if(ch){ camHeight=ch; syncCamBtns(); return; }
      const cl=t.getAttribute&&t.getAttribute('data-caml'); if(cl){ camLens=+cl; syncCamBtns(); return; }
      const a=t.getAttribute&&t.getAttribute('data-v3d'); if(!a) return;
      if(a==='close') close();
      else if(a==='iso'||a==='top'||a==='persp') setView(a);
      else if(a==='fit') fitView();
      else if(a==='png') snap();
      else if(a==='place') togglePlaceMode();
      else if(a==='camclear') clearCams();
      else if(a==='roof'){ roofOn=t.checked; applyRoof(); }
      else if(a==='lbl'){ lblOn=t.checked; if(scene&&scene.__labels) scene.__labels.visible=lblOn; }
    });
    // zoom slider (sağ=yakın). input sırasında loop'un slider'ı ezmesini engelle.
    zoomEl=overlay.querySelector('#v3dZoom');
    zoomEl.addEventListener('input',function(){ zoomActive=true;
      if(controls) controls.setDistanceTarget(sliderToDist(+zoomEl.value)); });
    zoomEl.addEventListener('pointerdown',function(){ zoomActive=true; });
    window.addEventListener('pointerup',function(){ zoomActive=false; });
  }

  // slider 0..1000  ↔  kamera mesafesi (log ölçek; 1000=en yakın)
  function sliderToDist(v){ if(!controls) return 22;
    const lo=Math.log(controls.minDistance),hi=Math.log(controls.maxDistance);
    return Math.exp(hi-(hi-lo)*(v/1000)); }
  function distToSlider(dd){ if(!controls) return 600;
    const lo=Math.log(controls.minDistance),hi=Math.log(controls.maxDistance);
    const d=Math.max(controls.minDistance,Math.min(controls.maxDistance,dd));
    return Math.round(1000*(hi-Math.log(d))/(hi-lo)); }

  function loadThree(){
    if(window.THREE) return Promise.resolve();
    if(threeLoading) return threeLoading;
    threeLoading=new Promise(function(res,rej){
      const s=document.createElement('script'); s.src=THREE_URL;
      s.onload=res; s.onerror=function(){ rej(new Error('three.js yüklenemedi (internet?)')); };
      document.head.appendChild(s);
    });
    return threeLoading;
  }

  // ---- minimal OrbitControls (r128) — damped rotasyon + damped zoom (radiusTarget) ----
  function attachOrbit(o,d){
    const c={object:o,domElement:d,target:new THREE.Vector3(),
      enableDamping:true,dampingFactor:0.12,rotateSpeed:0.78,zoomDamp:0.16,
      minDistance:3,maxDistance:800,maxPolarAngle:Math.PI/2.02};
    let sph=new THREE.Spherical(),sphD=new THREE.Spherical(),panOff=new THREE.Vector3(),
      radiusTarget=null,rotS=new THREE.Vector2(),rotE=new THREE.Vector2(),panS=new THREE.Vector2(),state=-1;
    function clampD(r){ return Math.max(c.minDistance,Math.min(c.maxDistance,r)); }
    c.update=function(){
      const q2=new THREE.Quaternion().setFromUnitVectors(o.up,new THREE.Vector3(0,1,0));
      const qi=(q2.clone().invert?q2.clone().invert():q2.clone().inverse());
      const off=new THREE.Vector3().copy(o.position).sub(c.target).applyQuaternion(q2);
      sph.setFromVector3(off); sph.theta+=sphD.theta; sph.phi+=sphD.phi;
      sph.phi=Math.max(0.01,Math.min(c.maxPolarAngle,sph.phi)); sph.makeSafe();
      if(radiusTarget==null) radiusTarget=sph.radius; radiusTarget=clampD(radiusTarget);
      sph.radius+=(radiusTarget-sph.radius)*c.zoomDamp; sph.radius=clampD(sph.radius);  // damped zoom
      c.target.add(panOff); off.setFromSpherical(sph).applyQuaternion(qi);
      o.position.copy(c.target).add(off); o.lookAt(c.target);
      if(c.enableDamping){ sphD.theta*=(1-c.dampingFactor); sphD.phi*=(1-c.dampingFactor); panOff.multiplyScalar(1-c.dampingFactor); }
      else { sphD.set(0,0,0); panOff.set(0,0,0); }
    };
    c.getDistance=function(){ return o.position.distanceTo(c.target); };
    c.setDistanceTarget=function(r){ radiusTarget=clampD(r); };
    // konum dışarıdan set edildiyse (setView/fit) hedefi mevcut mesafeye sabitle + atalet sıfırla
    c.sync=function(){ radiusTarget=clampD(o.position.distanceTo(c.target)); sphD.set(0,0,0); panOff.set(0,0,0); };
    function pan(dx,dy){ const off=new THREE.Vector3().copy(o.position).sub(c.target),
      td=off.length()*Math.tan((o.fov/2)*Math.PI/180);
      const X=new THREE.Vector3().setFromMatrixColumn(o.matrix,0).multiplyScalar(-2*dx*td/d.clientHeight);
      const Y=new THREE.Vector3().setFromMatrixColumn(o.matrix,1).multiplyScalar(2*dy*td/d.clientHeight);
      panOff.add(X).add(Y); }
    function down(e){ if(e.button===0){state=0;rotS.set(e.clientX,e.clientY);}else{state=2;panS.set(e.clientX,e.clientY);}
      window.addEventListener('mousemove',move); window.addEventListener('mouseup',up); }
    function move(e){ if(state===0){ rotE.set(e.clientX,e.clientY);
        const k=2*Math.PI*c.rotateSpeed/d.clientHeight;
        sphD.theta-=k*(rotE.x-rotS.x); sphD.phi-=k*(rotE.y-rotS.y); rotS.copy(rotE); }
      else if(state===2){ pan(e.clientX-panS.x,e.clientY-panS.y); panS.set(e.clientX,e.clientY); } }
    function up(){ window.removeEventListener('mousemove',move); window.removeEventListener('mouseup',up); state=-1; }
    function wheel(e){ e.preventDefault();
      const base=(radiusTarget==null?c.getDistance():radiusTarget);
      c.setDistanceTarget(base*(e.deltaY<0?0.9:1.111)); }
    d.addEventListener('mousedown',down); d.addEventListener('wheel',wheel,{passive:false});
    d.addEventListener('contextmenu',function(e){e.preventDefault();});
    return c;
  }

  function px2m(map,x,y){
    const mpp=map.scale.metersPerPixel, o=map.scale.origin_px;
    return [ (x-o[0])*mpp, (y-o[1])*mpp ];
  }
  function shapeFrom(poly,map){
    const s=new THREE.Shape();
    poly.forEach(function(p,i){ const m=px2m(map,p[0],p[1]); i?s.lineTo(m[0],m[1]):s.moveTo(m[0],m[1]); });
    return s;
  }

  function buildScene(map){
    // sahneyi temizle
    while(scene.children.length) scene.remove(scene.children[0]);
    camGizmos=null; pendingPos=null;                        // eski gizmo grubu sahneyle gitti (camList korunur)
    scene.add(new THREE.AmbientLight(0xfff0e0,0.38));   // kısık ambient → gölgeler belirgin
    const key=new THREE.DirectionalLight(0xffe2b8,1.45); key.position.set(16,34,12); key.castShadow=true;
    key.shadow.mapSize.set(2048,2048); key.shadow.bias=-0.0004;
    // gölge kamerası bina ölçeğine göre (aşağıda minX.. hesaplanınca güncellenir)
    const sc=key.shadow.camera; sc.near=1; sc.far=160; sc.left=-40; sc.right=40; sc.top=40; sc.bottom=-40;
    scene.add(key);
    const fill=new THREE.DirectionalLight(0xbcd4ff,0.22); fill.position.set(-20,18,-16); scene.add(fill);
    scene.__key=key;

    const rooms=[];
    (map.units||[]).forEach(function(u){ (u.rooms||[]).forEach(function(r){
      if(r.polygon_px&&r.polygon_px.length>=3) rooms.push(r); }); });
    (map.common_areas||[]).forEach(function(c){ if(c.polygon_px&&c.polygon_px.length>=3) rooms.push(c); });

    // merkezle
    let minX=1e9,minZ=1e9,maxX=-1e9,maxZ=-1e9;
    rooms.forEach(function(o){ o.polygon_px.forEach(function(p){ const m=px2m(map,p[0],p[1]);
      minX=Math.min(minX,m[0]);maxX=Math.max(maxX,m[0]);minZ=Math.min(minZ,m[1]);maxZ=Math.max(maxZ,m[1]); }); });
    const cx=(minX+maxX)/2, cz=(minZ+maxZ)/2;
    // fit için: model merkezde (0,0,0); gerçek yarı-genişlikler (sıkı köşe-projeksiyonu fit'i)
    scene.__hx=(maxX-minX)/2; scene.__hz=(maxZ-minZ)/2;
    scene.__cx=cx; scene.__cz=cz; scene.__map=map;          // world↔px ters çevirim + kamera export için
    const G=new THREE.Group(); G.position.set(-cx,0,-cz); scene.add(G); scene.__floorGroup=G;
    const walls=new THREE.Group(); walls.position.set(-cx,0,-cz); scene.add(walls); scene.__walls=walls;
    const lintels=new THREE.Group(); lintels.position.set(-cx,0,-cz); lintels.visible=roofOn; scene.add(lintels); scene.__lintels=lintels;
    const labels=new THREE.Group(); labels.position.set(-cx,0,-cz); labels.visible=lblOn; scene.add(labels); scene.__labels=labels;

    // paylaşılan malzemeler (her duvar için yeni material üretme)
    const matWall=new THREE.MeshStandardMaterial({color:0xe9e3d6,roughness:0.92});
    const matDoor=new THREE.MeshStandardMaterial({color:0x8a6a48,roughness:0.7,metalness:0.05}); // kapı eşiği = ahşap kahve

    // kapı boşlukları (metre uzayı): map.doors px → px2m. Oda kenarlarıyla AYNI doğrultudadır.
    const doorSegs=(map.doors||[]).map(function(d){
      const a=px2m(map,d.p0_px[0],d.p0_px[1]), b=px2m(map,d.p1_px[0],d.p1_px[1]);
      return {ax:a[0],az:a[1],bx:b[0],bz:b[1]};
    });
    // bir oda kenarını (a→b) kur — üstünden geçen kapılarda BOŞLUK bırak, eşik + (tam-yükseklikte) lentö ekle
    function wallEdge(a,b){
      const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz); if(len<0.05) return;
      const ux=dx/len,uz=dz/len, ang=-Math.atan2(dz,dx);
      const gaps=[];
      doorSegs.forEach(function(d){
        const t0=(d.ax-a[0])*ux+(d.az-a[1])*uz, e0=Math.abs((d.ax-a[0])*(-uz)+(d.az-a[1])*ux);
        const t1=(d.bx-a[0])*ux+(d.bz-a[1])*uz, e1=Math.abs((d.bx-a[0])*(-uz)+(d.bz-a[1])*ux);
        if(e0>0.2||e1>0.2) return;                          // kapı bu duvar doğrultusunda değil (uzaklık toleransı)
        const g0=Math.max(0,Math.min(t0,t1)), g1=Math.min(len,Math.max(t0,t1));
        if(g1-g0>0.1) gaps.push([g0,g1]);                   // duvarla örtüşen kapı boşluğu
      });
      gaps.sort(function(p,q){return p[0]-q[0];});
      function seg(s0,s1){ if(s1-s0<0.04) return;
        const wm=new THREE.Mesh(new THREE.BoxGeometry(s1-s0,WALL_H,0.12),matWall);
        wm.position.set(a[0]+ux*(s0+s1)/2, roofOn?WALL_H/2:WALL_H*WALL_LOW/2, a[1]+uz*(s0+s1)/2);
        wm.rotation.y=ang; wm.scale.y=roofOn?1:WALL_LOW;
        wm.castShadow=true; wm.userData.isWall=true; walls.add(wm);
      }
      let s=0; gaps.forEach(function(g){ seg(s,g[0]); s=Math.max(s,g[1]); }); seg(s,len);
      gaps.forEach(function(g){
        const mx=a[0]+ux*(g[0]+g[1])/2, mz=a[1]+uz*(g[0]+g[1])/2, gw=g[1]-g[0];
        const th=new THREE.Mesh(new THREE.BoxGeometry(gw,0.04,0.2),matDoor);          // eşik: her açıdan "kapı burada"
        th.position.set(mx,0.02,mz); th.rotation.y=ang; th.receiveShadow=true; th.userData.isSill=true; walls.add(th);
        const ln=new THREE.Mesh(new THREE.BoxGeometry(gw,WALL_H-DOOR_H,0.12),matWall); // lentö: yalnız tam-yükseklikte görünür
        ln.position.set(mx,(DOOR_H+WALL_H)/2,mz); ln.rotation.y=ang; ln.castShadow=true; lintels.add(ln);
      });
    }

    rooms.forEach(function(o){
      const col=colorFor(o);
      const g=new THREE.ExtrudeGeometry(shapeFrom(o.polygon_px,map),{depth:FLOOR_T,bevelEnabled:false});
      g.rotateX(Math.PI/2);
      const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:col,roughness:0.78,metalness:0.03}));
      m.receiveShadow=true; m.castShadow=true; m.userData.isFloor=true; m.userData.roomRef=o; G.add(m);
      // duvarlar = oda kenarları (kapı boşlukları oyulmuş)
      const P=o.polygon_px;
      for(let i=0;i<P.length;i++) wallEdge(px2m(map,P[i][0],P[i][1]), px2m(map,P[(i+1)%P.length][0],P[(i+1)%P.length][1]));
      // etiket — pole-of-inaccessibility çapası (komşu odaya taşmaz); yoksa centroid'e düş
      let la=o.label_anchor_px||o.centroid_px;
      if(!la){ la=P.reduce(function(s,p){return [s[0]+p[0],s[1]+p[1]];},[0,0]).map(function(v){return v/P.length;}); }
      const lm=px2m(map,la[0],la[1]);
      const trName=o.name||o.name_en||'', enName=o.name_en||o.name||'';  // ekran TR; PNG export EN
      const spr=makeLabel(trName); spr.userData.tr=trName; spr.userData.en=enName;
      spr.position.set(lm[0],0.6,lm[1]); labels.add(spr);
    });

    status.textContent=rooms.length+' oda · '+(maxX-minX).toFixed(1)+'m × '+(maxZ-minZ).toFixed(1)+'m · gerçek geometri';
    setView('iso');
  }

  function labelTexture(txt){
    const c=document.createElement('canvas'); c.width=256; c.height=64; const x=c.getContext('2d');
    x.fillStyle='rgba(20,20,25,.55)'; x.fillRect(0,0,256,64);
    x.fillStyle='#f0e8d8'; x.font='600 24px system-ui'; x.textAlign='center'; x.textBaseline='middle';
    x.fillText((txt||'').slice(0,18),128,32);
    return new THREE.CanvasTexture(c);
  }
  function makeLabel(txt){
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:labelTexture(txt),transparent:true,depthTest:false}));
    s.scale.set(2.6,0.65,1); return s;
  }
  // etiket metnini değiştir (TR↔EN); eski texture'ı bırak (PNG export'unda kullanılır)
  function setLabelText(spr,txt){ if(spr.material.map) spr.material.map.dispose(); spr.material.map=labelTexture(txt); spr.material.needsUpdate=true; }

  function setView(v){
    if(!cam||!controls) return;
    const d=22; controls.target.set(0,0,0);
    if(v==='top'){ cam.up.set(0,0,-1); cam.position.set(0,d*4.2,0); cam.fov=16; }
    else { cam.up.set(0,1,0); cam.fov=42;
      if(v==='iso') cam.position.set(d,d*0.95,d); else cam.position.set(d*1.3,d*0.5,d*1.3); }
    cam.updateProjectionMatrix(); controls.sync(); controls.update();
    fitView();   // açıyı koru, modeli ekrana sığdır
  }
  // mevcut bakış açısını KORUYARAK modeli ekrana SIKICA sığdır.
  // Kuşatan küre değil: 8 köşeyi kamera eksenlerine projekte edip hepsinin
  // çerçeveye girdiği EN YAKIN mesafeyi bulur → gerçek silüete göre, az boşluk.
  function fitView(){
    if(!cam||!controls||!scene||scene.__hx==null) return;
    const hx=scene.__hx, hz=scene.__hz, topY=(roofOn?WALL_H:WALL_H*WALL_LOW), cy=topY/2;
    const target=new THREE.Vector3(0,cy,0);
    const dir=new THREE.Vector3().subVectors(cam.position,target);   // hedef→kamera yönü
    if(dir.lengthSq()<1e-6) dir.set(1,0.9,1); dir.normalize();
    const up=cam.up.clone().normalize();
    const right=new THREE.Vector3().crossVectors(up,dir).normalize();
    const upc=new THREE.Vector3().crossVectors(dir,right).normalize();
    const tanV=Math.tan(cam.fov*Math.PI/360), tanH=tanV*Math.max(cam.aspect,1e-3);
    const MARGIN=1.05;                                 // ufak kenar payı
    let d=0; const rc=new THREE.Vector3();
    for(let sx=-1;sx<=1;sx+=2) for(let sy=0;sy<=1;sy++) for(let sz=-1;sz<=1;sz+=2){
      rc.set(sx*hx, sy*topY-cy, sz*hz);               // köşe (hedefe göre)
      const along=rc.dot(dir);                         // kameraya doğru bileşen
      const x=Math.abs(rc.dot(right))*MARGIN, y=Math.abs(rc.dot(upc))*MARGIN;
      const need=along+Math.max(x/tanH, y/tanV);       // bu köşeyi içerecek min mesafe
      if(need>d) d=need;
    }
    controls.target.copy(target);
    cam.position.copy(target).addScaledVector(dir, d);
    cam.updateProjectionMatrix(); controls.sync(); controls.update();
  }
  function applyRoof(){ if(!scene||!scene.__walls) return;
    scene.__walls.children.forEach(function(w){ if(w.userData.isWall){ w.scale.y=roofOn?1:WALL_LOW;
      w.position.y=(roofOn?WALL_H:WALL_H*WALL_LOW)/2; } });
    if(scene.__lintels) scene.__lintels.visible=roofOn; }   // lentö = kapı başlığı, sadece tam yükseklikte
  // PNG'yi İNGİLİZCE etiketle ver (AI 3D-render İngilizce sever; pipeline'ın geri kalanı da EN).
  // Etiketleri EN'e çevir → render → indir → ekrandaki TR'yi geri koy.
  function snap(){ if(!renderer) return;
    const labs=(scene&&scene.__labels)?scene.__labels.children:[];
    labs.forEach(function(s){ if(s.userData&&s.userData.en) setLabelText(s,s.userData.en); });
    renderer.render(scene,cam);
    const a=document.createElement('a'); a.download='floor-plan-3d.png'; a.href=renderer.domElement.toDataURL('image/png'); a.click();
    labs.forEach(function(s){ if(s.userData&&s.userData.tr) setLabelText(s,s.userData.tr); });
    renderer.render(scene,cam); }

  // ── Mesken köprüsü: kilitli açıyı oku/uygula + o açıdan PNG dataURL (indirmeden) ──
  // snap() ile aynı kare: EN etiketle render et → dataURL döndür → ekran TR'sini geri koy.
  // Adım 2→3: kullanıcının son baktığı açı = nano'ya gönderilen render açısı.
  function snapDataURL(){
    if(!renderer||!scene||!cam) return null;
    const labs=(scene.__labels)?scene.__labels.children:[];
    labs.forEach(function(s){ if(s.userData&&s.userData.en) setLabelText(s,s.userData.en); });
    renderer.render(scene,cam);
    const url=renderer.domElement.toDataURL('image/png');
    labs.forEach(function(s){ if(s.userData&&s.userData.tr) setLabelText(s,s.userData.tr); });
    renderer.render(scene,cam);
    return url;
  }
  // o anki kamera açısı (dünya uzayı). Adım 2→3 açı kilidi + adım 4 yan-yana eşitleme.
  function getView(){
    if(!cam||!controls) return null;
    return { position:{x:cam.position.x,y:cam.position.y,z:cam.position.z},
             target:{x:controls.target.x,y:controls.target.y,z:controls.target.z},
             up:{x:cam.up.x,y:cam.up.y,z:cam.up.z}, fov:cam.fov };
  }
  // kilitli açıyı geri uygula (adım 4'te boyalı render ile AYNI açı / adım 2'ye dönüş).
  function restoreView(v){
    if(!cam||!controls||!v||!v.position||!v.target) return;
    if(v.up) cam.up.set(v.up.x,v.up.y,v.up.z);
    cam.position.set(v.position.x,v.position.y,v.position.z);
    controls.target.set(v.target.x,v.target.y,v.target.z);
    if(v.fov){ cam.fov=v.fov; cam.updateProjectionMatrix(); }
    controls.sync(); controls.update();
  }

  /* ====================== KAMERA-KOYMA MODU (adım 4) ======================
     Raycaster ile zemin mesh'ine tıkla → kamera dünya konumu. İKİ TIKLAMA:
     1) konum, 2) bakış noktası (target, zeminde). Yükseklik (y) ayrı 3-kademe seçici.
     exportCameras → plan-px uzayı (oda poligonlarıyla AYNI) + cameraViewInfo room_id.
     AI yok → açı kayması eşlemeyi bozamaz (brief B). */
  function m2px(map,mx,my){ const mpp=map.scale.metersPerPixel, o=map.scale.origin_px; return [mx/mpp+o[0], my/mpp+o[1]]; }
  // view3d dünya (G ofseti -cx,-cz) → metre → plan-px. px2m'in tam tersi + merkezleme geri eklenir.
  function worldToPx(map,wx,wz){ return m2px(map, wx+(scene.__cx||0), wz+(scene.__cz||0)); }
  function headingOf(c){                                   // 0=yukarı(-Z), saat yönü (io.js cameraViewInfo konvansiyonu)
    const dx=c.target.x-c.pos.x, dz=c.target.z-c.pos.z;
    const a=Math.atan2(dx,-dz)*180/Math.PI; return (a%360+360)%360;
  }
  function lensToFov(l){ return LENS_FOV[l]||74; }

  function ensureGizmoGroup(){ if(!camGizmos||!camGizmos.parent){ camGizmos=new THREE.Group(); scene.add(camGizmos); } return camGizmos; }
  function renderCamGizmos(){
    if(!scene) return;
    const g=ensureGizmoGroup();
    while(g.children.length) g.remove(g.children[0]);
    camList.forEach(function(c,i){
      const active=(i===activeCamIdx), col=active?0xe0843a:0x9a9aa2;
      const body=new THREE.Mesh(new THREE.SphereGeometry(0.24,16,16),
        new THREE.MeshStandardMaterial({color:col,roughness:0.5,metalness:0.1,emissive:active?0x4a2a10:0x000000}));
      body.position.set(c.pos.x,c.pos.y,c.pos.z); body.userData.camIdx=i; g.add(body);
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(c.pos.x,c.pos.y,c.pos.z), new THREE.Vector3(c.target.x,c.target.y,c.target.z)]),
        new THREE.LineBasicMaterial({color:col})));
    });
    if(pendingPos){
      const s=new THREE.Mesh(new THREE.SphereGeometry(0.2,14,14),
        new THREE.MeshStandardMaterial({color:0x7bbf8a,emissive:0x2a4a30}));
      s.position.set(pendingPos.x,CAM_Y[camHeight],pendingPos.z); g.add(s);
    }
  }

  function scenePick(ev){
    if(!placeMode||!renderer||!scene||!scene.__floorGroup) return;
    const rect=renderer.domElement.getBoundingClientRect();
    const nx=((ev.clientX-rect.left)/rect.width)*2-1, ny=-((ev.clientY-rect.top)/rect.height)*2+1;
    if(!raycaster) raycaster=new THREE.Raycaster();
    raycaster.setFromCamera({x:nx,y:ny}, cam);
    const hits=raycaster.intersectObjects(scene.__floorGroup.children,false);
    if(!hits.length) return;
    const p=hits[0].point;                                 // dünya (x,y,z), y≈zemin üstü
    if(!pendingPos){ pendingPos={x:p.x,z:p.z}; renderCamGizmos(); setHint('Şimdi kameranın BAKACAĞI noktaya tıkla'); }
    else {
      const c={ pos:{x:pendingPos.x,y:CAM_Y[camHeight],z:pendingPos.z}, target:{x:p.x,y:0.5,z:p.z}, lens:camLens, height:camHeight };
      camList.push(c); activeCamIdx=camList.length-1; pendingPos=null;
      renderCamGizmos(); updateCamPanel(); logRoom(c);
      setHint('Kamera '+camList.length+' kondu · konuma tıkla = yeni');
    }
  }
  function attachPicker(){
    if(pickerWired||!renderer) return; pickerWired=true;
    const el=renderer.domElement; let sx=0,sy=0,moved=false;
    el.addEventListener('pointerdown',function(e){ sx=e.clientX; sy=e.clientY; moved=false; });
    el.addEventListener('pointermove',function(e){ if(Math.abs(e.clientX-sx)+Math.abs(e.clientY-sy)>5) moved=true; });
    el.addEventListener('pointerup',function(e){ if(placeMode&&!moved&&e.button===0) scenePick(e); });
  }
  function logRoom(c){                                     // DOĞRULAMA: oda ortasına koyunca room_id o oda mı?
    const map=scene&&scene.__map; if(!map||typeof window.cameraViewInfo!=='function') return;
    const px=worldToPx(map,c.pos.x,c.pos.z), hd=Math.round(headingOf(c));
    const v=window.cameraViewInfo(map,{x_px:px[0],y_px:px[1],heading_deg:hd,lens_mm:c.lens});
    console.log('[view3d cam] pos_m',[+c.pos.x.toFixed(1),+c.pos.z.toFixed(1)],'→ px',[Math.round(px[0]),Math.round(px[1])],'heading',hd,'→ room_id',v&&v.room_id);
  }

  // ── dışa: kilitli kamera dizisi (prototip adım 4 + §3.3 şeması) ──
  function exportCameras(map){
    map=map||(scene&&scene.__map); if(!map) return [];
    const W=map.render.width, H=map.render.height, hasView=(typeof window.cameraViewInfo==='function');
    return camList.map(function(c,i){
      const px=worldToPx(map,c.pos.x,c.pos.z);
      const x=Math.round(px[0]*10)/10, y=Math.round(px[1]*10)/10;
      const xn=Math.round(x/W*1e5)/1e5, yn=Math.round(y/H*1e5)/1e5, heading=Math.round(headingOf(c));
      const out={ id:'cam'+(i+1), x_px:x, y_px:y, x_norm:xn, y_norm:yn, heading_deg:heading, lens_mm:c.lens,
        pos_m:{x:+c.pos.x.toFixed(3),y:+c.pos.y.toFixed(3),z:+c.pos.z.toFixed(3)},
        target_m:{x:+c.target.x.toFixed(3),y:+c.target.y.toFixed(3),z:+c.target.z.toFixed(3)},
        fov_deg:lensToFov(c.lens), height:c.height,
        room_id:null, room_weights:[], cone_spills:false, cone_polygon_px:null, cone_polygon_norm:null };
      if(hasView){
        const v=window.cameraViewInfo(map,{x_px:x,y_px:y,heading_deg:heading,lens_mm:c.lens});
        if(v){ out.room_id=v.room_id; out.room_weights=v.room_weights||[]; out.cone_spills=!!v.cone_spills;
               out.cone_polygon_px=v.cone_polygon_px||null; out.cone_polygon_norm=v.cone_polygon_norm||null; }
      }
      return out;
    });
  }
  function getCameras(){ return camList.map(function(c){ return {pos:Object.assign({},c.pos),target:Object.assign({},c.target),lens:c.lens,height:c.height}; }); }
  function setCameras(arr){                                // demo/türetilmiş kameraları yükle (Faz 4)
    camList=(arr||[]).map(function(c){ return {pos:{x:c.pos.x,y:(c.pos.y!=null?c.pos.y:CAM_Y[c.height||'eye']),z:c.pos.z},
      target:{x:c.target.x,y:(c.target.y!=null?c.target.y:0.5),z:c.target.z}, lens:c.lens||24, height:c.height||'eye'}; });
    activeCamIdx=camList.length?camList.length-1:-1; pendingPos=null; renderCamGizmos(); updateCamPanel(); return camList.length;
  }
  function clearCams(){ camList=[]; activeCamIdx=-1; pendingPos=null; renderCamGizmos(); updateCamPanel(); setHint(''); }

  // ── DEMO kameraları yerleşimden TÜRET (sabit koordinat YASAK; §3.4) ──
  // Daire başına 1-2 vitrin: salon (+ varsa ebeveyn yatak). Köşeden ~0.5m içeri, centroid'e bakar.
  function roomAreaPx(r){ const p=r.polygon_px; let a=0; for(let i=0,j=p.length-1;i<p.length;j=i++) a+=(p[j][0]+p[i][0])*(p[j][1]-p[i][1]); return Math.abs(a/2); }
  function roomCentroidPx(r){ if(r.centroid_px) return r.centroid_px; const s=[0,0]; r.polygon_px.forEach(function(p){s[0]+=p[0];s[1]+=p[1];}); return [s[0]/r.polygon_px.length,s[1]/r.polygon_px.length]; }
  function pxToWorld(map,px,py){ const mpp=map.scale.metersPerPixel,o=map.scale.origin_px; return {x:(px-o[0])*mpp-(scene.__cx||0), z:(py-o[1])*mpp-(scene.__cz||0)}; }
  function deriveShowcaseCameras(map){
    map=map||(scene&&scene.__map); if(!map) return 0;
    const cams=[], mpp=map.scale.metersPerPixel;
    (map.units||[]).forEach(function(u){
      const rs=(u.rooms||[]).filter(function(r){ return r.polygon_px&&r.polygon_px.length>=3; });
      if(!rs.length) return;
      const typeStr=function(r){ return ((r.type||'')+' '+(r.type_tr||'')+' '+(r.name||'')+' '+(r.name_en||'')).toLowerCase(); };
      const living=rs.filter(function(r){ return /living|salon|studio/.test(typeStr(r)); }).sort(function(a,b){ return roomAreaPx(b)-roomAreaPx(a); });
      const primary=living[0] || rs.slice().sort(function(a,b){ return roomAreaPx(b)-roomAreaPx(a); })[0];
      const picks=[primary];
      const beds=rs.filter(function(r){ return /bedroom|yatak/.test(typeStr(r)); }).sort(function(a,b){ return roomAreaPx(b)-roomAreaPx(a); });
      const master=beds.filter(function(r){ return /ebeveyn|master/.test(typeStr(r)); })[0] || beds[0];
      if(master && master!==primary) picks.push(master);
      picks.forEach(function(r){
        const cpx=roomCentroidPx(r);
        let corner=r.polygon_px[0], best=-1;                 // centroid'e en uzak köşe (en geniş açı)
        r.polygon_px.forEach(function(p){ const dd=Math.hypot(p[0]-cpx[0],p[1]-cpx[1]); if(dd>best){ best=dd; corner=p; } });
        const cw=pxToWorld(map,corner[0],corner[1]), tw=pxToWorld(map,cpx[0],cpx[1]);
        const dx=tw.x-cw.x, dz=tw.z-cw.z, L=Math.hypot(dx,dz)||1;
        const pos={x:cw.x+dx/L*0.5, z:cw.z+dz/L*0.5};        // köşeden 0.5m içeri
        const area_m2=roomAreaPx(r)*mpp*mpp, lens=area_m2<11?16:24;   // küçük oda=geniş açı
        cams.push({pos:pos, target:{x:tw.x,z:tw.z}, lens:lens, height:'eye'});
      });
    });
    setCameras(cams);
    return cams.length;
  }

  // ── kamera-modu UI yardımcıları (overlay paneli; standalone test). Prototip adım 4 setPlaceMode/exportCameras ile sürer ──
  function applyPlaceModeUI(){
    if(!overlay) return;
    const btn=overlay.querySelector('#v3dPlaceBtn'), ctl=overlay.querySelector('#v3dCamCtl');
    if(btn){ btn.style.background=placeMode?'#7bbf8a':'#c9a16b'; btn.style.color=placeMode?'#13201a':'#1a1a1f';
             btn.textContent=placeMode?'📷 Koyma açık — zemine tıkla':'📷 Kamera koy'; }
    if(ctl) ctl.style.display=placeMode?'block':'none';
    syncCamBtns();
  }
  function togglePlaceMode(){ placeMode=!placeMode; pendingPos=null; renderCamGizmos(); applyPlaceModeUI(); setHint(placeMode?'Kamera KONUMUNA tıkla':''); }
  function setPlaceMode(on){ placeMode=!!on; pendingPos=null; renderCamGizmos(); applyPlaceModeUI(); }
  function syncCamBtns(){
    if(!overlay) return;
    overlay.querySelectorAll('.v3dh').forEach(function(b){ b.style.outline=(b.getAttribute('data-camh')===camHeight)?'2px solid #7bbf8a':'none'; });
    overlay.querySelectorAll('.v3dl').forEach(function(b){ b.style.outline=(+b.getAttribute('data-caml')===camLens)?'2px solid #7bbf8a':'none'; });
    updateCamPanel();
  }
  function updateCamPanel(){ const c=overlay&&overlay.querySelector('#v3dCamCount'); if(c) c.textContent=camList.length?(camList.length+' kamera'):''; }
  function setHint(t){ const h=overlay&&overlay.querySelector('#v3dCamHint'); if(h) h.textContent=t||''; }

  function open(){
    ensureOverlay();
    const map = window.buildFloorplanMap && window.buildFloorplanMap();
    if(!map || !map.units || !map.units.length){
      alert('Önce bir yerleşim oluşturun (oda/daire). 3B görünüm planı kullanır.'); return;
    }
    overlay.style.display='block';
    status.textContent='three.js yükleniyor…';
    loadThree().then(function(){
      if(!renderer){
        renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
        renderer.setPixelRatio(Math.min(devicePixelRatio,2));
        renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
        host.appendChild(renderer.domElement);
        scene=new THREE.Scene(); scene.background=new THREE.Color(0x15151a);
        scene.fog=new THREE.Fog(0x15151a,60,150);
        cam=new THREE.PerspectiveCamera(42, host.clientWidth/host.clientHeight, 0.1, 600);
        controls=attachOrbit(cam,renderer.domElement);
        attachPicker();                                    // kamera-koyma raycaster (placeMode iken aktif)
        window.addEventListener('resize',resize);
        loop();
      }
      resize();
      buildScene(map); built=true;
    }).catch(function(e){ status.textContent='HATA: '+(e.message||e); });
  }
  function close(){ if(overlay) overlay.style.display='none'; }
  function resize(){ if(!renderer||overlay.style.display==='none') return;
    const w=host.clientWidth,h=host.clientHeight; renderer.setSize(w,h); if(cam){cam.aspect=w/h;cam.updateProjectionMatrix();} }
  function loop(){ raf=requestAnimationFrame(loop);
    if(overlay.style.display!=='none'&&controls){ controls.update(); renderer.render(scene,cam);
      if(zoomEl&&!zoomActive) zoomEl.value=distToSlider(controls.getDistance()); } }

  // dışa aç + buton bağla
  window.View3D = { open:open, close:close, snapDataURL:snapDataURL, getView:getView, restoreView:restoreView,
    setPlaceMode:setPlaceMode, getCameras:getCameras, setCameras:setCameras, exportCameras:exportCameras,
    clearCams:clearCams, deriveShowcaseCameras:deriveShowcaseCameras };
  function bind(){
    const btn=document.getElementById('t3d');
    if(btn) btn.addEventListener('click', open);
  }
  if(document.readyState!=='loading') bind(); else document.addEventListener('DOMContentLoaded', bind);
})();
