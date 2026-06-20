'use strict';
/* ---- kapılar: aday kenarlar + seçili kenar (elle ayar destekli) ----
   Her kapı kaydı: {key, e:{x,y,h}, edges, kind:'unit'|'inner', k}
   doorOverrides[key] mevcut aday kenarlardan biriyle eşleşiyorsa o kullanılır,
   yoksa otomatik seçime (en uzun temas şeridinin ortası) düşülür. */
function pickDoorEdge(list){
  const groups=new Map();
  list.forEach(e=>{ const k=e.h? 'h'+e.y : 'v'+e.x;
    if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(e); });
  let best=null;
  groups.forEach(arr=>{
    arr.sort((a,b)=>a.h? a.x-b.x : a.y-b.y);
    let s=0;
    for(let i=1;i<=arr.length;i++){
      const brk = i===arr.length || (arr[i].h? arr[i].x-arr[i-1].x : arr[i].y-arr[i-1].y) > M+1e-9;
      if(brk){ const run=arr.slice(s,i); if(!best||run.length>best.length) best=run; s=i; }
    }
  });
  return best? best[Math.floor(best.length/2)] : null;
}
function computeDoors(){
  const p=plan; if(!p) return [];
  const id=(r,c)=>(r<0||c<0||r>=p.rows||c>=p.cols)?-9:(p.inside[r*p.cols+c]?p.cm[r*p.cols+c]:-9);
  const out=[];
  const resolve=(key,edges)=>{
    const ov=doorOverrides[key];
    const m=ov && edges.find(g2=>g2.h===ov.h && Math.abs(g2.x-ov.x)<1e-6 && Math.abs(g2.y-ov.y)<1e-6);
    return m||pickDoorEdge(edges);
  };
  /* daire kapıları: antre → koridor */
  p.unitObjs.forEach((u,k)=>{
    if(!u.antre||!u.antre.cells.length) return;
    if(p.villa&&floorsOn()&&activeFloor>0) return; // üst katta sokak girişi yok; erişim iç merdivenden
    const isCor=v=>v>=0&&p.regions[v]&&p.regions[v].type==='koridor';
    const edges=[];
    u.antre.cells.forEach(i=>{ const r=(i/p.cols)|0,c=i%p.cols;
      if(isCor(id(r+1,c))||(p.villa&&id(r+1,c)===-9)) edges.push({x:p.minX+c*M, y:p.minY+(r+1)*M, h:1});
      if(isCor(id(r-1,c))) edges.push({x:p.minX+c*M, y:p.minY+r*M, h:1});
      if(isCor(id(r,c+1))) edges.push({x:p.minX+(c+1)*M, y:p.minY+r*M, h:0});
      if(isCor(id(r,c-1))) edges.push({x:p.minX+c*M, y:p.minY+r*M, h:0}); });
    const key='u'+k;
    if(!edges.length){ out.push({key, e:null, edges, kind:'unit', k, status:'none'}); return; }
    if(doorHidden[key]){ out.push({key, e:null, edges, kind:'unit', k, status:'hidden'}); return; }
    const e=resolve(key, edges);
    if(e) out.push({key, e, edges, kind:'unit', k, status:'ok'});
  });
  /* iç kapılar: hol → odalar, eb. yatak → eb. banyo */
  p.unitObjs.forEach((u,k)=>{
    if(!u.antre) return;
    const inner=(reg,fromId)=>{
      const edges=[];
      reg.cells.forEach(i=>{ const r=(i/p.cols)|0,c=i%p.cols;
        if(id(r-1,c)===fromId) edges.push({x:p.minX+c*M,y:p.minY+r*M,h:1});
        if(id(r+1,c)===fromId) edges.push({x:p.minX+c*M,y:p.minY+(r+1)*M,h:1});
        if(id(r,c-1)===fromId) edges.push({x:p.minX+c*M,y:p.minY+r*M,h:0});
        if(id(r,c+1)===fromId) edges.push({x:p.minX+(c+1)*M,y:p.minY+r*M,h:0}); });
      const key='r'+reg.id;
      if(!edges.length) return; // komşuluk denetimi ayrıca raporluyor
      if(edges.length<2){ out.push({key, e:null, edges, kind:'inner', k, reg, status:'none'}); return; }
      if(doorHidden[key]){ out.push({key, e:null, edges, kind:'inner', k, reg, status:'hidden'}); return; }
      const e=resolve(key, edges);
      if(e) out.push({key, e, edges, kind:'inner', k, reg, status:'ok'});
    };
    u.rooms.forEach(reg=>{
      if(reg===u.antre||!reg.cells.length) return;
      if(reg.name==='EB. BANYO'){ const eb=u.rooms.find(g2=>g2.name==='EB. YATAK ODASI'); if(eb) inner(reg,eb.id); return; }
      inner(reg,u.antre.id);
    });
  });
  /* çift tıkla eklenen kapılar (kenar hâlâ iki farklı bölgeyi ayırıyorsa) */
  extraDoors.forEach((d,i)=>{
    const r=Math.round((d.y-p.minY)/M), c=Math.round((d.x-p.minX)/M);
    const sides=d.h? [id(r-1,c),id(r,c)] : [id(r,c-1),id(r,c)];
    const ok=sides[0]>=0&&sides[1]>=0&&sides[0]!==sides[1];
    out.push({key:'x'+i, e:ok?{h:d.h,x:d.x,y:d.y}:null, edges:[], kind:'extra', i, status:ok?'ok':'stale'});
  });
  return out;
}
function doorSnapshot(){ return {ov:{...doorOverrides}, extra:extraDoors.map(d=>({...d})), hidden:{...doorHidden}}; }
function doorRestore(s){ doorOverrides={...s.ov}; extraDoors=s.extra.map(d=>({...d})); doorHidden={...s.hidden}; }
/* imlece en yakın iki-bölge iç duvar kenarı (çift tıkla kapı ekleme / ekstra kapı sürükleme) */
function edgeNear(wx,wy){
  const p=plan; if(!p) return null;
  const id=(r,c)=>(r<0||c<0||r>=p.rows||c>=p.cols)?-9:(p.inside[r*p.cols+c]?p.cm[r*p.cols+c]:-9);
  const r0=Math.floor((wy-p.minY)/M), c0=Math.floor((wx-p.minX)/M);
  let best=null, bd=Math.max(0.3, 8/pxPerM);
  for(let r=r0-1;r<=r0+2;r++)for(let c=c0-1;c<=c0+2;c++){
    const x=p.minX+c*M, y=p.minY+r*M;
    if(id(r-1,c)>=0&&id(r,c)>=0&&id(r-1,c)!==id(r,c)){      /* üst kenar */
      const d=distSeg(wx,wy,x,y,x+M,y);
      if(d<bd){ bd=d; best={h:1,x,y}; }
    }
    if(id(r,c-1)>=0&&id(r,c)>=0&&id(r,c-1)!==id(r,c)){      /* sol kenar */
      const d=distSeg(wx,wy,x,y,x,y+M);
      if(d<bd){ bd=d; best={h:0,x,y}; }
    }
  }
  return best;
}
function doorMid(e){ return e.h? {x:W2Sx(e.x+0.45), y:W2Sy(e.y)} : {x:W2Sx(e.x), y:W2Sy(e.y+0.45)}; }
function hitDoor(sx,sy){
  if(!plan) return null;
  let best=null, bd=170*HITSC*HITSC; // ~13 px yarıçap (dokunmatikte ~23 px)
  computeDoors().forEach(d=>{
    if(d.status!=='ok') return;
    const m=doorMid(d.e), dd=(m.x-sx)**2+(m.y-sy)**2;
    if(dd<bd){ bd=dd; best=d; }
  });
  return best;
}
