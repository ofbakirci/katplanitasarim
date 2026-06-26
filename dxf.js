/* ================= DXF içe aktarma =================
   DXF (AutoCAD Drawing Exchange) → motor kpState.
   Saf-JS, bağımlılıksız. Çıkardığı geometriyi io.js'teki PAYLAŞILAN çekirdeğe
   (kpBuildPlanFromCells) besler — rasterize/bölge/daire/runChecks orada, tekrar yok.

   Beklenen DXF düzeni (kendi export'umuz + tipik mimari CAD):
   · Oda alanları   : kapalı LWPOLYLINE/POLYLINE, LAYER adı oda tipini verir
                      (A-AREA-SALON, A-AREA-YATAK, A-WALL, A-CORE-MERDIVEN ...).
   · Oda adları     : TEXT/MTEXT, poligon içine düşen etiket (tip ince ayarı / fallback).
   · Kapılar        : A-DOOR layer'ında LINE (boşluk) ya da INSERT (kapı bloğu).
   · Ölçek          : HEADER $INSUNITS (6=m, 4=mm, 5=cm, 2=ft, 1=inch); yoksa metre varsayılır.
   Izgara BİNADAN türetilir (parselden değil): origin = oda poligonlarının min köşesi. */

/* ---- 1) ham parser: group-code çiftleri → HEADER + ENTITIES ---- */
function parseDxf(txt){
  const raw=String(txt).replace(/^﻿/,'').split(/\r\n|\r|\n/);
  const pairs=[];
  for(let i=0;i+1<raw.length;i+=2){
    const code=parseInt(raw[i],10);
    if(isNaN(code)) continue;            // bozuk satır: çifti atla
    pairs.push([code, raw[i+1]!==undefined? raw[i+1].trim() : '']);
  }
  const header={}; const entities=[];
  let section=null, headerVar=null, ent=null;
  const newEnt=type=>({type, layer:'0', verts:[], text:'', x2:null, y2:null, flags:0, closed:false, blockName:''});
  const flush=()=>{ if(ent) entities.push(ent); ent=null; };
  const pushVert=()=>{ ent.verts.push({x:null,y:null}); };
  const setX=v=>{ if(!ent) return; const L=ent.verts[ent.verts.length-1];
    if(L&&L.x===null) L.x=v; else ent.verts.push({x:v,y:null}); };
  const setY=v=>{ if(!ent) return; const L=ent.verts[ent.verts.length-1]; if(L&&L.y===null) L.y=v; };
  for(let p=0;p<pairs.length;p++){
    const code=pairs[p][0], val=pairs[p][1];
    if(code===0){
      if(val==='SECTION'){ flush(); section='__pending__'; continue; }
      if(val==='ENDSEC'){ flush(); section=null; continue; }
      if(val==='EOF'){ flush(); break; }
      if(section==='ENTITIES'){
        if(val==='VERTEX' && ent && ent.type==='POLYLINE'){ pushVert(); continue; } // alt-köşe
        if(val==='SEQEND'){ continue; }                                            // POLYLINE bitişi
        flush(); ent=newEnt(val);
      }
      continue;
    }
    if(section==='__pending__'){ if(code===2){ section=val; } continue; }
    if(section==='HEADER'){
      if(code===9){ headerVar=val; }
      else if(headerVar!==null && (code===70||code===40||code===3||code===62)){ header[headerVar]=val; headerVar=null; }
      continue;
    }
    if(section==='ENTITIES' && ent){
      switch(code){
        case 8:  ent.layer=val; break;
        case 10: setX(parseFloat(val)); break;
        case 20: setY(parseFloat(val)); break;
        case 11: ent.x2=parseFloat(val); break;
        case 21: ent.y2=parseFloat(val); break;
        case 70: ent.flags=parseInt(val,10)||0; ent.closed=!!(ent.flags&1); break;
        case 1:  ent.text=(ent.text||'')+val; break;   // TEXT / MTEXT ana
        case 3:  ent.text=(ent.text||'')+val; break;   // MTEXT devam parçası
        case 2:  ent.blockName=val; break;             // INSERT blok adı
      }
    }
  }
  flush();
  return {header, entities};
}

/* ---- 2) layer adı → oda tipi (bulunamazsa null = belirsiz) ---- */
function dxfLayerToType(layer){
  const L=String(layer||'').toUpperCase();
  const rules=[
    [/MERDIVEN|MERDİVEN|STAIR/, 'merdiven'],
    [/ASANSOR|ASANSÖR|ELEVATOR|LIFT/, 'asansor'],
    [/YANGIN|FIRE/, 'yangin'],
    [/TEKNIK|TEKNİK|SAFT|ŞAFT|SHAFT|DUCT|MECH/, 'teknik'],
    [/KORIDOR|KORİDOR|CORRIDOR|HALLWAY|APARTMAN|LOBBY|HOL\b/, 'koridor'],
    [/SALON|LIVING|OTURMA|STUDYO|STÜDYO/, 'salon'],
    [/YATAK|BEDROOM|\bBED\b/, 'yatak'],
    [/MUTFAK|KITCHEN/, 'mutfak'],
    [/BANYO|BATH/, 'banyo'],
    [/\bWC\b|TUVALET|TOILET/, 'wc'],
    [/ANTRE|ENTRY|FOYER|KILER|KİLER/, 'antre'],
    [/OTOPARK|PARK|GARAGE/, 'otopark'],
    [/SIGINAK|SIĞINAK|SHELTER/, 'siginak'],
    [/DUKKAN|DÜKKAN|SHOP|RETAIL|TICARI|TİCARİ/, 'dukkan'],
    [/DEPO|STORAGE/, 'depo']
  ];
  for(let i=0;i<rules.length;i++) if(rules[i][0].test(L)) return rules[i][1];
  return null;
}
function dxfIsDoorLayer(layer){ return /DOOR|KAPI|A-DOOR/.test(String(layer||'').toUpperCase()); }
/* MTEXT biçim kodlarını ({\fArial;...}, \P satır sonu) ayıkla */
function dxfCleanText(t){
  return String(t||'').replace(/\\[A-Za-z][^;\\]*;/g,'').replace(/[{}]/g,'')
    .replace(/\\P/g,' ').replace(/\\~/g,' ').replace(/\s+/g,' ').trim();
}

/* ---- 3) normalize: DXF → geom → paylaşılan çekirdek ---- */
function importDxf(txt){
  const parsed=parseDxf(txt);
  const entities=parsed.entities;
  /* ölçek → metre */
  const UNIT_M={1:0.0254,2:0.3048,4:0.001,5:0.01,6:1,8:0.0000254,10:0.9144,13:1e-9,14:0.1,15:1,16:1000};
  let toM=UNIT_M[parseInt(parsed.header['$INSUNITS'],10)]; if(!(toM>0)) toM=1; // yoksa metre

  /* poligonlar (oda alanları), etiketler, kapılar */
  const rooms=[]; const labels=[]; const doorEnts=[];
  entities.forEach(e=>{
    const layer=e.layer||'';
    if(e.type==='LWPOLYLINE'||e.type==='POLYLINE'){
      const pts=e.verts.filter(v=>v&&v.x!=null&&v.y!=null&&!isNaN(v.x)&&!isNaN(v.y))
        .map(v=>({x:v.x*toM, y:v.y*toM}));
      if(pts.length<3) return;
      if(dxfIsDoorLayer(layer)) return;          // kapı poligonu oda değil
      rooms.push({type:dxfLayerToType(layer), pts});
    } else if(e.type==='TEXT'||e.type==='MTEXT'){
      const v=e.verts[0]; const nm=dxfCleanText(e.text);
      if(!v||v.x==null||isNaN(v.x)||!nm) return;
      if(nm.length>30||/^[\d,.\s×x]+$/.test(nm)) return;   // ölçü yazısı ele
      labels.push({x:v.x*toM, y:v.y*toM, name:nm});
    } else if(e.type==='LINE'){
      if(!dxfIsDoorLayer(layer)) return;
      const v=e.verts[0]; if(!v||v.x==null||e.x2==null) return;
      doorEnts.push({x1:v.x*toM, y1:v.y*toM, x2:e.x2*toM, y2:e.y2*toM});
    } else if(e.type==='INSERT'){
      const bn=String(e.blockName||'').toUpperCase();
      if(!dxfIsDoorLayer(layer) && bn.indexOf('DOOR')<0 && bn.indexOf('KAPI')<0) return;
      const v=e.verts[0]; if(!v||v.x==null) return;
      doorEnts.push({x1:v.x*toM, y1:v.y*toM, x2:v.x*toM, y2:v.y*toM}); // nokta kapı
    }
  });
  if(!rooms.length) throw new Error('DXF: oda poligonu yok (kapalı LWPOLYLINE bekleniyor)');

  /* ızgara BİNADAN: origin = oda poligonlarının min köşesi (parsel değil) */
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  rooms.forEach(rm=>rm.pts.forEach(p=>{ if(p.x<minX)minX=p.x; if(p.y<minY)minY=p.y; if(p.x>maxX)maxX=p.x; if(p.y>maxY)maxY=p.y; }));
  const ox=minX, oy=minY;
  const cols=Math.max(1,Math.round((maxX-ox)/M)), rows=Math.max(1,Math.round((maxY-oy)/M));
  if(cols*rows>4e6) throw new Error('DXF: ızgara çok büyük ('+cols+'×'+rows+') — ölçek ($INSUNITS) hatalı olabilir');
  const pip=(poly,x,y)=>{ let inn=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){ const a=poly[i],b=poly[j];
      if((a.y>y)!==(b.y>y) && x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x) inn=!inn; }
    return inn; };

  /* her oda: yerel poligonu hesapla + içine düşen etiket var mı (belirsizlik için) */
  rooms.forEach(rm=>{
    rm.local=rm.pts.map(p=>({x:p.x-ox, y:p.y-oy}));
    rm.hasLabel=labels.some(l=>pip(rm.local, l.x-ox, l.y-oy));
    rm.ambiguous=(rm.type===null && !rm.hasLabel);
    rm.fillType=rm.type||'oda';            // rasterize tipi (çekirdek etiketten yeniden tiplendirebilir)
  });

  /* rasterize: hücre merkezi poligon içindeyse o odanın tipiyle boya (ilk gelen kazanır) */
  const cellType=new Array(rows*cols).fill(null);
  const cellPoly=new Array(rows*cols).fill(-1);
  rooms.forEach((rm,ri)=>{
    let rx0=Infinity,ry0=Infinity,rx1=-Infinity,ry1=-Infinity;
    rm.local.forEach(p=>{ if(p.x<rx0)rx0=p.x; if(p.y<ry0)ry0=p.y; if(p.x>rx1)rx1=p.x; if(p.y>ry1)ry1=p.y; });
    const c0=Math.max(0,Math.floor(rx0/M)), c1=Math.min(cols-1,Math.ceil(rx1/M));
    const r0=Math.max(0,Math.floor(ry0/M)), r1=Math.min(rows-1,Math.ceil(ry1/M));
    for(let r=r0;r<=r1;r++) for(let c=c0;c<=c1;c++){
      if(!pip(rm.local,(c+0.5)*M,(r+0.5)*M)) continue;
      const idx=r*cols+c; if(cellType[idx]===null){ cellType[idx]=rm.fillType; cellPoly[idx]=ri; }
    }
  });
  if(!cellType.some(Boolean)) throw new Error('DXF: oda poligonları ızgaraya düşmedi (ölçek?)');

  /* iç duvarlar: farklı kaynak-poligona ait komşu hücreler arası kenar */
  const vWall=new Set(), hWall=new Set();
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
    const idx=r*cols+c, pi=cellPoly[idx]; if(pi<0) continue;
    if(c+1<cols){ const ni=idx+1; if(cellPoly[ni]>=0 && cellPoly[ni]!==pi) vWall.add(r+','+(c+1)); }
    if(r+1<rows){ const ni=idx+cols; if(cellPoly[ni]>=0 && cellPoly[ni]!==pi) hWall.add((r+1)+','+c); }
  }

  /* çekirdek formatına çevir */
  const coreLabels=labels.map(l=>({mx:l.x-ox, my:l.y-oy, name:l.name}));
  const coreDoors=doorEnts.map(d=>{
    const mx=(d.x1+d.x2)/2-ox, my=(d.y1+d.y2)/2-oy;
    const dx=Math.abs(d.x2-d.x1), dy=Math.abs(d.y2-d.y1);
    return dy>=dx ? {orient:'v', c:Math.round(mx/M), r:Math.floor(my/M)}
                  : {orient:'h', r:Math.round(my/M), c:Math.floor(mx/M)};
  });
  const allCells=[]; for(let i=0;i<rows*cols;i++) if(cellType[i]!==null) allCells.push(i);
  const poly=fpCellOutline(allCells, cols).map(p=>({x:p[0]*M, y:p[1]*M}));

  kpBuildPlanFromCells({poly, rows, cols, cellType, vWall, hWall, labels:coreLabels, doors:coreDoors});

  /* belirsiz bölgeleri işaretle: kaynağı tipsiz+etiketsiz olan, çekirdekte de nötr kalan oda */
  let amb=0;
  if(plan&&plan.regions) plan.regions.forEach(g=>{
    if(!g.cells.length||g.type!=='oda') return;
    const cnt={}; g.cells.forEach(i=>{ const pi=cellPoly[i]; if(pi>=0) cnt[pi]=(cnt[pi]||0)+1; });
    const dom=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])[0];
    if(dom!=null && rooms[+dom] && rooms[+dom].ambiguous){ g.ambiguous=true; g.name='?'; amb++; }
  });
  if(typeof dxfShowAmbiguous==='function') dxfShowAmbiguous(amb);
  if(amb && typeof render==='function'){ if(typeof buildUnitTable==='function') buildUnitTable(); render(); }
  return {ambiguous:amb, rooms:rooms.length, cols, rows};
}

/* belirsiz oda sayısını durum çubuğunda göster (varsa) — kullanıcı sağ tıkla tip atar */
function dxfShowAmbiguous(n){
  if(typeof document==='undefined') return;
  const el=document.getElementById('stDxf'); if(!el) return;
  el.textContent = n>0 ? ('⚠ '+n+' oda tipi belirsiz — sağ tıklayıp "Tipini değiştir" ile atayın') : '';
}
