/* Ground-truth replay: kullanıcının "-doğru" layoutlarını motora YENİDEN ürettirip
   karşılaştırır. KRİTİK: lockedCore SİLİNİR — yoksa import motoru baypas eder, test
   daima "geçer" (yanıltıcı yeşil). Motorun TAHMİNİ ile kullanıcının İDEALİ kıyaslanır.
   Çalıştır:  node tests/replay-kulak.js */
const fs=require('fs'), path=require('path');

function stubEl(tag){ return {
  tag, attrs:{}, children:[], style:{}, dataset:{}, _ih:'',
  set innerHTML(v){ this._ih=v; this.children=[]; }, get innerHTML(){ return this._ih; },
  appendChild(c){ this.children.push(c); return c; }, insertBefore(c){ this.children.unshift(c); return c; },
  addEventListener(){}, querySelectorAll(){ return []; }, querySelector(){ return null; },
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  setAttribute(k,v){ this.attrs[k]=v; }, getAttribute(k){ return this.attrs[k]; },
  getBoundingClientRect(){ return {width:1200,height:800,left:0,top:0}; },
  textContent:'', value:'', disabled:false, checked:false, onclick:null, click(){}, focus(){}, remove(){}
};}
const byId={}; const getEl=id=> byId[id]||(byId[id]=stubEl('div'));
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='5'; getEl('katYuk').value='2.9';
global.document={getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t), addEventListener(){}, querySelectorAll(){return [];}};
global.window={addEventListener(){}, matchMedia:()=>({matches:false})};
global.matchMedia=()=>({matches:false});
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){}; global.Blob=function(){}; global.URL={createObjectURL:()=>'',revokeObjectURL(){}};
global.localStorage={getItem(){return null;},setItem(){}};
global.requestAnimationFrame=fn=>fn&&fn();

eval(require('./support/app-js').readAppScript() + `
;globalThis.__replay=function(ptsArr, specs, katv){
  lockedCore=null; villaFloors=null; activeFloor=0;
  balconies=[]; parcelPts=[]; parcelClosed=false;
  customCutsZ=null; unitLayout={}; doorOverrides={}; extraDoors=[]; doorHidden={}; editHistory=[];
  document.getElementById('katSayisi').value=String(katv);
  unitSpecs=JSON.parse(JSON.stringify(specs));
  pts=ptsArr.map(p=>({x:p.x,y:p.y})); closed=true;
  generate();
  var cols=plan.cols;
  function bb(g){ var r0=1e9,r1=-1e9,c0=1e9,c1=-1e9;
    g.cells.forEach(function(i){var r=(i/cols)|0,c=i%cols; if(r<r0)r0=r;if(r>r1)r1=r;if(c<c0)c0=c;if(c>c1)c1=c;});
    return {r0,r1,c0,c1,n:g.cells.length}; }
  var out={cols:cols, rows:plan.rows, core:{}, hol:null, units:[]};
  plan.regions.forEach(function(g){
    if(!g.cells.length) return;
    if(g.type==='koridor'){ var b=bb(g); if(!out.hol||b.n>out.hol.n){ out.hol=b; } }
    else if(['merdiven','asansor','yangin','teknik'].includes(g.type)){ (out.core[g.type]=out.core[g.type]||[]).push(bb(g)); }
  });
  function touchesExt(g){ return g.cells.some(function(i){ var r=(i/cols)|0,c=i%cols;
    return (r===0||!plan.inside[i-cols])||(r===plan.rows-1||!plan.inside[i+cols])||(c===0||!plan.inside[i-1])||(c===cols-1||!plan.inside[i+1]); }); }
  out.units=plan.unitObjs.map(function(u){ return Math.round(u.rooms.reduce((s,g)=>s+g.cells.length*0.25,0)); });
  out.cephe=plan.unitObjs.map(function(u){
    var beds=0,bedsNoLight=0,antreExt=false,salonExt=true;
    u.rooms.forEach(function(g){ if(!g.cells.length) return; var ext=touchesExt(g);
      if(g.type==='yatak'){ beds++; if(!ext) bedsNoLight++; }
      if(g.type==='antre'&&g.name==='ANTRE'&&ext) antreExt=true;
      if(g.salon||(g.type==='salon')){ if(!ext) salonExt=false; } });
    return {beds:beds,bedsNoLight:bedsNoLight,antreExt:antreExt,salonExt:salonExt};
  });
  return out;
};
`);

/* -doğru dosyasından ground-truth çıkar */
function loadGT(f){
  const s=fs.readFileSync(f,'utf-8');
  const st=JSON.parse(s.match(/<metadata id="kpState">([\s\S]*?)<\/metadata>/)[1]);
  const pl=st.plan, cols=pl.cols;
  const bb=g=>{ let r0=1e9,r1=-1e9,c0=1e9,c1=-1e9;
    g.cells.forEach(i=>{const r=(i/cols)|0,c=i%cols; if(r<r0)r0=r;if(r>r1)r1=r;if(c<c0)c0=c;if(c>c1)c1=c;});
    return {r0,r1,c0,c1,n:g.cells.length}; };
  const gt={cols, rows:pl.rows, core:{}, hol:null};
  pl.regions.forEach(g=>{ if(!g.cells.length) return;
    if(g.type==='koridor'){ const b=bb(g); if(!gt.hol||b.n>gt.hol.n) gt.hol=b; }
    else if(['merdiven','asansor','yangin','teknik'].includes(g.type)){ (gt.core[g.type]=gt.core[g.type]||[]).push(bb(g)); } });
  const ext=g=>g.cells.some(i=>{const r=(i/cols)|0,c=i%cols;
    return (r===0||!pl.inside[i-cols])||(r===pl.rows-1||!pl.inside[i+cols])||(c===0||!pl.inside[i-1])||(c===cols-1||!pl.inside[i+1]);});
  gt.cephe=pl.units.map(u=>{ let beds=0,bedsNoLight=0,antreExt=false,salonExt=true;
    u.rooms.forEach(rid=>{ const g=pl.regions[rid]; if(!g||!g.cells.length) return; const e=ext(g);
      if(g.type==='yatak'){ beds++; if(!e) bedsNoLight++; }
      if(g.type==='antre'&&g.name==='ANTRE'&&e) antreExt=true;
      if(g.type==='salon'){ if(!e) salonExt=false; } });
    return {beds,bedsNoLight,antreExt,salonExt}; });
  return { pts:st.pts, specs:st.specs, kat:+st.ui.katSayisi, gt };
}
const ori=b=> b? ((b.c1-b.c0)>=(b.r1-b.r0)?'YATAY':'DİKEY') : '-';
const fmt=b=> b? ('r'+b.r0+'-'+b.r1+' c'+b.c0+'-'+b.c1+' ['+ori(b)+']') : 'YOK';
const near=(a,b,tol)=> a&&b && Math.abs(a.r0-b.r0)<=tol&&Math.abs(a.r1-b.r1)<=tol&&Math.abs(a.c0-b.c0)<=tol&&Math.abs(a.c1-b.c1)<=tol;

const TOL=2, dir=path.join(__dirname,'..','kulak-vakalari');
const cases=['A-tek-sol','B-ust-orta','C-asimetrik','D-uzun-tek-uc','E-genis-iki-kulak'];
let pass=0, fail=0, cephePass=0, cepheFail=0;
cases.forEach(n=>{
  const f=path.join(dir,'kulak-'+n+'-dogru.svg');
  if(!fs.existsSync(f)){ console.log('kulak-'+n+': -dogru YOK, atlandı'); return; }
  const {pts,specs,kat,gt}=loadGT(f);
  let R; try{ R=global.__replay(pts,specs,kat); }catch(e){ console.log('kulak-'+n+': MOTOR HATA '+e.message); fail++; return; }
  console.log('\n=== kulak-'+n+' ===');
  // koridor yön + konum
  const holOK = ori(R.hol)===ori(gt.hol);
  console.log('  HOL    motor '+fmt(R.hol)+'  | ideal '+fmt(gt.hol)+'  '+(holOK?'✓ yön':'✗ YÖN FARKLI'));
  if(holOK) pass++; else fail++;
  // çekirdek elemanları
  ['merdiven','yangin','asansor','teknik'].forEach(t=>{
    const mg=(R.core[t]||[]), gg=(gt.core[t]||[]);
    if(!gg.length && !mg.length) return;
    const ok = gg.every(gb=> mg.some(mb=> near(mb,gb,TOL)));
    console.log('  '+t.padEnd(8)+' motor '+(mg.map(fmt).join(' , ')||'YOK')+'  | ideal '+(gg.map(fmt).join(' , ')||'YOK')+'  '+(ok?'✓':'✗'));
    if(ok) pass++; else fail++;
  });
  // CEPHE-ODA: yatak ışığı + antre dış duvarda mı (inversiyon)
  (R.cephe||[]).forEach((mc,k)=>{
    const gc=(gt.cephe||[])[k]||{};
    const okBeds = mc.bedsNoLight<= (gc.bedsNoLight||0);
    const okAntre = !mc.antreExt || gc.antreExt;
    console.log('  daire'+(k+1)+' cephe: motor [ışıksız yatak '+mc.bedsNoLight+'/'+mc.beds+(mc.antreExt?', ANTRE DIŞ DUVARDA':'')+(mc.salonExt?'':', SALON içeride')+'] | ideal [ışıksız '+(gc.bedsNoLight||0)+'/'+(gc.beds||0)+(gc.antreExt?', antre dış':'')+']  '+((okBeds&&okAntre)?'✓':'✗'));
    if(okBeds&&okAntre) cephePass++; else cepheFail++;
  });
});
console.log('\n──────────  ÇEKİRDEK/HOL: '+pass+' ✓ '+fail+' ✗   |   CEPHE-ODA: '+cephePass+' ✓ '+cepheFail+' ✗   (tolerans ±'+TOL+' hücre)');
