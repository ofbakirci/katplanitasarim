/* ===== 3B Görünüm — canlı plandan three.js dollhouse mesh =====
   Toolbar "3B" butonu → tam-ekran overlay açar, buildFloorplanMap() (io.js) ile
   o anki planın oda poligonlarını alıp gerçek 3B mesh kurar. AI YOK — gerçek geometri.
   three.js CDN'den LAZY yüklenir (sadece ilk açılışta). mesh_prototip.html mantığının
   motora gömülü kardeşi; KPTA'da çalışır, npm run build ile Mesken prototip'e de iner.

   Bağımlılık: window.buildFloorplanMap (io.js) — runtime oda haritası. */
(function(){
  'use strict';
  const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  const WALL_H = 2.7, FLOOR_T = 0.08;
  const WALL_LOW = 0.5;   // varsayılan duvar oranı: YARI yükseklik (dollhouse + hacim okunur). roofOn=tam.
  let overlay, host, status, scene, cam, renderer, controls, raf, roofOn=false, lblOn=true;
  let threeLoading=null, built=false;

  // oda tipi (TR motor tipi ya da EN) -> sıcak zemin rengi
  // ODA TİPİ = BELİRGİN AYRIK RENK → AI renkten tipi anlasın (karıştırmasın).
  // Aynı işlev grubu aynı net renge: banyo=mavi, yatak=yeşil, salon=turuncu, mutfak=sarı,
  // antre/hol=açık bej, koridor=gri-bej, çekirdek(merdiven/asansör/yangın)=koyu gri, balkon=açık yeşil.
  const COL = {
    banyo:0x4f9fd6, wc:0x4f9fd6,
    yatak:0x66b56a, oda:0x66b56a, ebeveyn:0x3f8f5a,
    salon:0xe08a3c, 'salon+mutfak':0xe0a93c,
    mutfak:0xe8c84a,
    antre:0xe8dcc0, hol:0xe8dcc0, koridor:0xc7bda0,
    merdiven:0x6f6f76, asansor:0x5f5f66, yangin:0x55555c, teknik:0x7a7a82,
    balkon:0x9fd08a,
    Bathroom:0x4f9fd6, Bedroom:0x66b56a,'Master Bedroom':0x3f8f5a,
    'Living Room':0xe08a3c,'Living + Kitchen':0xe0a93c, Kitchen:0xe8c84a,
    Entry:0xe8dcc0, Corridor:0xc7bda0,
    Staircase:0x6f6f76, Elevator:0x5f5f66,'Fire Escape Stair':0x55555c,'Fire Escape':0x55555c,
    _def:0xddd0b4
  };
  function colorFor(o){
    const t=(o.type||o.name_en||o.name||'').toString();
    if(COL[t]!=null) return COL[t];
    const lt=t.toLowerCase();
    for(const k in COL){ if(typeof k==='string' && lt.indexOf(k)>=0) return COL[k]; }
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
        '</div>'+
        '<label style="display:flex;align-items:center;gap:6px;font-size:11.5px;margin-top:8px;cursor:pointer">'+
          '<input type="checkbox" data-v3d="roof"> Duvarlar tam yükseklik</label>'+
        '<label style="display:flex;align-items:center;gap:6px;font-size:11.5px;cursor:pointer">'+
          '<input type="checkbox" data-v3d="lbl" checked> Oda etiketleri</label>'+
        '<div style="display:flex;gap:6px;margin-top:10px">'+
          '<button data-v3d="png" class="v3db">PNG indir</button>'+
          '<button data-v3d="close" class="v3db" style="background:#3a3a44;color:#e8e6e0">Kapat ✕</button>'+
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
      const a=e.target.getAttribute&&e.target.getAttribute('data-v3d'); if(!a) return;
      if(a==='close') close();
      else if(a==='iso'||a==='top'||a==='persp') setView(a);
      else if(a==='png') snap();
      else if(a==='roof'){ roofOn=e.target.checked; applyRoof(); }
      else if(a==='lbl'){ lblOn=e.target.checked; if(scene&&scene.__labels) scene.__labels.visible=lblOn; }
    });
  }

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

  // ---- minimal OrbitControls (r128) ----
  function attachOrbit(o,d){
    const c={object:o,domElement:d,target:new THREE.Vector3(),enableDamping:true,dampingFactor:0.08,
      minDistance:3,maxDistance:400,maxPolarAngle:Math.PI/2.02};
    let sph=new THREE.Spherical(),sphD=new THREE.Spherical(),panOff=new THREE.Vector3(),scale=1,
      rotS=new THREE.Vector2(),rotE=new THREE.Vector2(),panS=new THREE.Vector2(),state=-1;
    const q=new THREE.Quaternion().setFromUnitVectors(o.up,new THREE.Vector3(0,1,0));
    let qi=(q.clone().invert?q.clone().invert():q.clone().inverse());
    c.update=function(){
      const q2=new THREE.Quaternion().setFromUnitVectors(o.up,new THREE.Vector3(0,1,0));
      qi=(q2.clone().invert?q2.clone().invert():q2.clone().inverse());
      const off=new THREE.Vector3().copy(o.position).sub(c.target).applyQuaternion(q2);
      sph.setFromVector3(off); sph.theta+=sphD.theta; sph.phi+=sphD.phi;
      sph.phi=Math.max(0.01,Math.min(c.maxPolarAngle,sph.phi)); sph.makeSafe();
      sph.radius*=scale; sph.radius=Math.max(c.minDistance,Math.min(c.maxDistance,sph.radius));
      c.target.add(panOff); off.setFromSpherical(sph).applyQuaternion(qi);
      o.position.copy(c.target).add(off); o.lookAt(c.target);
      if(c.enableDamping){ sphD.theta*=(1-c.dampingFactor); sphD.phi*=(1-c.dampingFactor); panOff.multiplyScalar(1-c.dampingFactor); }
      else { sphD.set(0,0,0); panOff.set(0,0,0); }
      scale=1;
    };
    function pan(dx,dy){ const off=new THREE.Vector3().copy(o.position).sub(c.target),
      td=off.length()*Math.tan((o.fov/2)*Math.PI/180);
      const X=new THREE.Vector3().setFromMatrixColumn(o.matrix,0).multiplyScalar(-2*dx*td/d.clientHeight);
      const Y=new THREE.Vector3().setFromMatrixColumn(o.matrix,1).multiplyScalar(2*dy*td/d.clientHeight);
      panOff.add(X).add(Y); }
    function down(e){ if(e.button===0){state=0;rotS.set(e.clientX,e.clientY);}else{state=2;panS.set(e.clientX,e.clientY);}
      window.addEventListener('mousemove',move); window.addEventListener('mouseup',up); }
    function move(e){ if(state===0){ rotE.set(e.clientX,e.clientY);
        sphD.theta-=2*Math.PI*(rotE.x-rotS.x)/d.clientHeight; sphD.phi-=2*Math.PI*(rotE.y-rotS.y)/d.clientHeight; rotS.copy(rotE); }
      else if(state===2){ pan(e.clientX-panS.x,e.clientY-panS.y); panS.set(e.clientX,e.clientY); } }
    function up(){ window.removeEventListener('mousemove',move); window.removeEventListener('mouseup',up); state=-1; }
    function wheel(e){ e.preventDefault(); scale*=e.deltaY<0?0.92:1.08; }
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
    const G=new THREE.Group(); G.position.set(-cx,0,-cz); scene.add(G);
    const walls=new THREE.Group(); walls.position.set(-cx,0,-cz); scene.add(walls); scene.__walls=walls;
    const labels=new THREE.Group(); labels.position.set(-cx,0,-cz); labels.visible=lblOn; scene.add(labels); scene.__labels=labels;

    rooms.forEach(function(o){
      const col=colorFor(o);
      const g=new THREE.ExtrudeGeometry(shapeFrom(o.polygon_px,map),{depth:FLOOR_T,bevelEnabled:false});
      g.rotateX(Math.PI/2);
      const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:col,roughness:0.78,metalness:0.03}));
      m.receiveShadow=true; m.castShadow=true; G.add(m);
      // duvarlar = oda kenarları
      const P=o.polygon_px;
      for(let i=0;i<P.length;i++){
        const a=px2m(map,P[i][0],P[i][1]), b=px2m(map,P[(i+1)%P.length][0],P[(i+1)%P.length][1]);
        const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz); if(len<0.05) continue;
        const wm=new THREE.Mesh(new THREE.BoxGeometry(len,WALL_H,0.12),
          new THREE.MeshStandardMaterial({color:0xe9e3d6,roughness:0.92}));
        wm.position.set((a[0]+b[0])/2, roofOn?WALL_H/2:WALL_H*WALL_LOW/2, (a[1]+b[1])/2);
        wm.rotation.y=-Math.atan2(dz,dx); wm.scale.y=roofOn?1:WALL_LOW;
        wm.castShadow=true; wm.userData.isWall=true; walls.add(wm);
      }
      // etiket
      const c=P.reduce(function(s,p){return [s[0]+p[0],s[1]+p[1]];},[0,0]).map(function(v){return v/P.length;});
      const lm=px2m(map,c[0],c[1]); const spr=makeLabel(o.name||o.name_en||'');
      spr.position.set(lm[0],0.6,lm[1]); labels.add(spr);
    });

    status.textContent=rooms.length+' oda · '+(maxX-minX).toFixed(1)+'m × '+(maxZ-minZ).toFixed(1)+'m · gerçek geometri';
    setView('iso');
  }

  function makeLabel(txt){
    const c=document.createElement('canvas'); c.width=256; c.height=64; const x=c.getContext('2d');
    x.fillStyle='rgba(20,20,25,.55)'; x.fillRect(0,0,256,64);
    x.fillStyle='#f0e8d8'; x.font='600 24px system-ui'; x.textAlign='center'; x.textBaseline='middle';
    x.fillText((txt||'').slice(0,18),128,32);
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthTest:false}));
    s.scale.set(2.6,0.65,1); return s;
  }

  function setView(v){
    if(!cam||!controls) return;
    const d=22; controls.target.set(0,0,0);
    if(v==='top'){ cam.up.set(0,0,-1); cam.position.set(0,d*4.2,0); cam.fov=16; }
    else { cam.up.set(0,1,0); cam.fov=42;
      if(v==='iso') cam.position.set(d,d*0.95,d); else cam.position.set(d*1.3,d*0.5,d*1.3); }
    cam.updateProjectionMatrix(); controls.update();
  }
  function applyRoof(){ if(!scene||!scene.__walls) return;
    scene.__walls.children.forEach(function(w){ if(w.userData.isWall){ w.scale.y=roofOn?1:WALL_LOW;
      w.position.y=(roofOn?WALL_H:WALL_H*WALL_LOW)/2; } }); }
  function snap(){ if(!renderer) return; renderer.render(scene,cam);
    const a=document.createElement('a'); a.download='kat-plani-3d.png'; a.href=renderer.domElement.toDataURL('image/png'); a.click(); }

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
  function loop(){ raf=requestAnimationFrame(loop); if(overlay.style.display!=='none'&&controls){ controls.update(); renderer.render(scene,cam); } }

  // dışa aç + buton bağla
  window.View3D = { open:open, close:close };
  function bind(){
    const btn=document.getElementById('t3d');
    if(btn) btn.addEventListener('click', open);
  }
  if(document.readyState!=='loading') bind(); else document.addEventListener('DOMContentLoaded', bind);
})();
