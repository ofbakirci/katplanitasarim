/* v22 motor doğrulaması: vaka girdileriyle üret, mutfak cephesi + salon/yatak dengesi ölç */
function stubEl(tag){ return {
  tag, attrs:{}, children:[], style:{}, dataset:{}, _ih:'',
  set innerHTML(v){ this._ih=v; this.children=[]; }, get innerHTML(){ return this._ih; },
  appendChild(c){ this.children.push(c); return c; },
  addEventListener(){}, querySelectorAll(){ return []; }, querySelector(){ return null; },
  classList:{toggle(){},add(){},remove(){}},
  setAttribute(k,v){ this.attrs[k]=v; }, getAttribute(k){ return this.attrs[k]; },
  getBoundingClientRect(){ return {width:1200,height:800,left:0,top:0}; },
  textContent:'', value:'', disabled:false, onclick:null, click(){}, parentElement:null, offsetHeight:0
};}
const byId={};
const getEl=id=>byId[id]||(byId[id]=stubEl('div'));
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='5'; getEl('katYuk').value='2.9';
global.document={getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t)};
global.window={addEventListener(){}};
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){}; global.Blob=function(){}; global.URL={createObjectURL:()=>''};
const fs=require('fs'), path=require('path');
const {extractAppScript}=require('./support/app-js');
const src=extractAppScript();
function loadState(f){const t=fs.readFileSync(f,'utf8');return JSON.parse(t.match(/<metadata id="kpState">([\s\S]*?)<\/metadata>/)[1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'));}
function resolveCase(v){
  const raw=v.endsWith('.svg')?v:v+'.svg';
  const candidates=[
    path.resolve(process.cwd(), raw),
    path.join(__dirname,'..','vakalar',raw),
    path.join(__dirname,'..','vakalar-2',raw)
  ];
  return candidates.find(fs.existsSync);
}
eval(src+`
;global.RUN=(st)=>{
  document.getElementById('binaTipi').value=st.ui.binaTipi||'apartman';
  document.getElementById('katSayisi').value=st.ui.katSayisi||'5';
  pts=st.pts.map(p=>({x:p.x,y:p.y})); closed=true;
  unitSpecs=st.specs.map(s=>({...s}));
  customCutsZ=st.cuts||null; unitLayout={}; balconies=[];
  doorOverrides={}; extraDoors=[]; doorHidden={}; editHistory=[];
  generate();
  const out=[];
  plan.unitObjs.forEach((u,k)=>{
    u.rooms.forEach(g=>{ if(!g.cells.length) return;
      if(g.type!=='mutfak'&&g.type!=='salon'&&g.type!=='yatak') return;
      let e=0; g.cells.forEach(i=>{const r=(i/plan.cols)|0,c=i%plan.cols;
        [[r,c-1],[r,c+1],[r-1,c],[r+1,c]].forEach(([rr,cc])=>{
          if(rr<0||cc<0||rr>=plan.rows||cc>=plan.cols||!plan.inside[rr*plan.cols+cc]) e++;});});
      out.push(\`D\${k+1} \${g.name} \${(g.area).toFixed(1)}m² dış:\${(e*0.5).toFixed(1)}m\`);
    });
  });
  const checks=runChecks();
  return {out, bads:checks.filter(x=>x.s==='bad').length,
    badList:checks.filter(x=>x.s==='bad').map(x=>x.t||x.msg||JSON.stringify(x)).slice(0,6)};
};`);
const args=process.argv.slice(2);
const cases=args.length?args:fs.existsSync(path.join(__dirname,'..','vakalar-2'))
  ? fs.readdirSync(path.join(__dirname,'..','vakalar-2')).filter(f=>f.endsWith('.svg')).map(f=>f.replace(/\.svg$/,''))
  : [];
if(!cases.length){ console.log('v22 fixture yok; test atlandi.'); process.exit(0); }
for(const v of cases){
  const file=resolveCase(v);
  if(!file){ console.log('=== '+v+' ATLANDI: fixture bulunamadi'); continue; }
  const st=loadState(file);
  try{ const r=global.RUN(st);
    console.log('=== '+v+'  (bad: '+r.bads+')');
    console.log('  '+r.out.join('\n  '));
    if(r.bads) console.log('  IHLAL: '+r.badList.join(' || '));
  }catch(e){ console.log('=== '+v+' HATA: '+e.message); }
}
