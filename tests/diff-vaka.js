/* vaka-N.svg vs vaka-N_s.svg — kpState metadata'sından oda bazında diff */
const fs=require('fs');
const M=0.5;
function load(f){
  const t=fs.readFileSync(f,'utf8');
  const m=t.match(/<metadata id="kpState">([\s\S]*?)<\/metadata>/);
  if(!m) throw new Error('kpState yok: '+f);
  return JSON.parse(m[1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'));
}
function rooms(st){
  const sp=st.plan, cols=sp.cols;
  const out=[];
  sp.units.forEach((u,k)=>{
    u.rooms.forEach(id=>{
      const g=sp.regions.find(r=>r.id===id);
      if(!g||!g.cells.length) return;
      let x0=1e9,y0=1e9,x1=-1,y1=-1;
      g.cells.forEach(i=>{const x=i%cols,y=(i/cols)|0;
        if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y;});
      out.push({unit:k+1, name:g.name, type:g.type, area:+(g.cells.length*M*M).toFixed(1),
        bw:+((x1-x0+1)*M).toFixed(1), bh:+((y1-y0+1)*M).toFixed(1),
        cx:+((x0+x1+1)/2*M+sp.minX).toFixed(1), cy:+((y0+y1+1)/2*M+sp.minY).toFixed(1),
        fill:+(g.cells.length/((x1-x0+1)*(y1-y0+1))).toFixed(2)});
    });
  });
  // ortak alanlar (unit'siz bölgeler)
  sp.regions.forEach(g=>{
    if(!g.cells.length) return;
    if(sp.units.some(u=>u.rooms.includes(g.id))) return;
    let x0=1e9,y0=1e9,x1=-1,y1=-1;
    g.cells.forEach(i=>{const x=i%cols,y=(i/cols)|0;
      if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y;});
    out.push({unit:0, name:g.name, type:g.type, area:+(g.cells.length*M*M).toFixed(1),
      bw:+((x1-x0+1)*M).toFixed(1), bh:+((y1-y0+1)*M).toFixed(1),
      cx:+((x0+x1+1)/2*M+sp.minX).toFixed(1), cy:+((y0+y1+1)/2*M+sp.minY).toFixed(1),
      fill:+(g.cells.length/((x1-x0+1)*(y1-y0+1))).toFixed(2)});
  });
  return out;
}
const base=process.argv[2];
const A=load(base+'.svg'), B=load(base+'_s.svg');
const ra=rooms(A), rb=rooms(B);
// daire toplam alanları
const tot=r=>{const t={}; r.forEach(o=>{t[o.unit]=(t[o.unit]||0)+o.area;}); return t;};
const ta=tot(ra), tb=tot(rb);
console.log('=== '+base+' ===');
console.log('Daire toplamları (0=ortak):');
new Set([...Object.keys(ta),...Object.keys(tb)]).forEach(k=>{
  const d=((tb[k]||0)-(ta[k]||0)).toFixed(1);
  console.log(`  D${k}: ${ta[k]?.toFixed(1)||'-'} -> ${tb[k]?.toFixed(1)||'-'}  (Δ${d})${Math.abs(d)<0.05?'  [ayırıcı AYNI → fark daire İÇİ]':''}`);
});
console.log('\nOda eşleşmesi (unit+name ile):');
const key=o=>o.unit+'|'+o.name;
const mb=new Map(); rb.forEach(o=>{const k=key(o); if(!mb.has(k))mb.set(k,[]); mb.get(k).push(o);});
const used=new Set();
ra.forEach(a=>{
  const cands=(mb.get(key(a))||[]).filter(o=>!used.has(o));
  if(!cands.length){ console.log(`  - SİLİNMİŞ: D${a.unit} ${a.name} ${a.area}m² ${a.bw}x${a.bh} @(${a.cx},${a.cy})`); return; }
  // en yakın merkez
  cands.sort((p,q)=>(Math.hypot(p.cx-a.cx,p.cy-a.cy)-Math.hypot(q.cx-a.cx,q.cy-a.cy)));
  const b=cands[0]; used.add(b);
  const dA=(b.area-a.area).toFixed(1), mv=Math.hypot(b.cx-a.cx,b.cy-a.cy).toFixed(1);
  if(Math.abs(dA)>=0.5||mv>=1||Math.abs(b.bw-a.bw)>=0.5||Math.abs(b.bh-a.bh)>=0.5)
    console.log(`  ~ D${a.unit} ${a.name}: ${a.area}->${b.area}m² (Δ${dA})  bbox ${a.bw}x${a.bh}->${b.bw}x${b.bh}  taşıma ${mv}m  doluluk ${a.fill}->${b.fill}`);
});
rb.forEach(b=>{ if(!used.has(b)&&!ra.some(a=>key(a)===key(b)&&used.has(b))){
  const had=ra.some(a=>key(a)===key(b));
  if(!had) console.log(`  + YENİ: D${b.unit} ${b.name} ${b.area}m² ${b.bw}x${b.bh} @(${b.cx},${b.cy})`);
}});
// spec / layout farkları
console.log('\nunitLayout:', JSON.stringify(A.unitLayout||{}), '->', JSON.stringify(B.unitLayout||{}));
console.log('cuts farklı mı:', JSON.stringify(A.cuts)!==JSON.stringify(B.cuts));
