function run(label, bina, kat, poly, specs){
  for(const k of Object.keys(require.cache)) delete require.cache[k];
  function stubEl(tag){ return {
    tag, attrs:{}, children:[], style:{}, dataset:{}, _ih:'',
    set innerHTML(v){ this._ih=v; this.children=[]; }, get innerHTML(){ return this._ih; },
    appendChild(c){ this.children.push(c); return c; },
    addEventListener(){}, querySelectorAll(){ return []; },
    classList:{toggle(){},add(){},remove(){}},
    setAttribute(k,v){ this.attrs[k]=v; }, getAttribute(k){ return this.attrs[k]; },
    getBoundingClientRect(){ return {width:1200,height:800,left:0,top:0}; },
    textContent:'', value:'', disabled:false, onclick:null, click(){}
  };}
  const byId = {};
  const getEl = id => byId[id] || (byId[id]=stubEl('div'));
  getEl('binaTipi').value=bina; getEl('katSayisi').value=String(kat); getEl('katYuk').value='2.9';
  global.document={getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t)};
  global.window={addEventListener(){}};
  global.XMLSerializer=function(){this.serializeToString=()=>'';};
  global.Image=function(){}; global.Blob=function(){}; global.URL={createObjectURL:()=>''};
  const src=require('./support/app-js').readAppScript();
  eval(src + `
  ;unitSpecs=${JSON.stringify(specs)};
  pts=${JSON.stringify(poly)}; closed=true;
  generate();
  const tot=plan.regions.reduce((s,g)=>s+g.cells.length,0);
  let ins=0; plan.inside.forEach(v=>ins+=v);
  console.log('--- ${label} ---');
  
  // erişim: her oda (eb banyo hariç) antreye bitişik mi?
  let noAccess=0;
  plan.unitObjs.forEach(u=>{ if(!u.antre) return;
    const aid=u.antre.id;
    u.rooms.forEach(g=>{ if(g===u.antre||!g.cells.length||g.name==='EB. BANYO') return;
      let ok=false;
      g.cells.forEach(i=>{ const r=(i/plan.cols)|0,c=i%plan.cols;
        [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc])=>{
          if(rr<0||cc<0||rr>=plan.rows||cc>=plan.cols)return;
          if(plan.cm[rr*plan.cols+cc]===aid) ok=true; }); });
      if(!ok){ noAccess++; console.log('  [NO-DOOR]', g.name, g.area.toFixed(1),'m²'); }
    }); });
  console.log(' units:',plan.unitObjs.length,'stairs:',plan.stairs.length,'asansor:',plan.nAsansor,'cells:',tot+'/'+ins,'antresiz:',plan.unitObjs.filter(u=>!u.antre).length);
  byId['checks'].children.forEach(d=>{
    const cls=d.className.replace('chk ','');
    const txt=nodeText(d);
    if(cls.includes('bad')) console.log('  [FAIL]', txt);
  });
  `);
}
const {nodeText}=require('./support/dom-text');
const rect=[{x:0,y:0},{x:32,y:0},{x:32,y:16},{x:0,y:16}];
const Lshape=[{x:0,y:0},{x:30,y:0},{x:30,y:10},{x:16,y:10},{x:16,y:16},{x:0,y:16}];
const small=[{x:0,y:0},{x:12,y:0},{x:12,y:10},{x:0,y:10}];
run('Apartman 12 kat', 'apartman', 12, rect, [{oda:2,salon:1,ensuite:true,acik:false,adet:2},{oda:1,salon:1,ensuite:false,acik:true,adet:2}]);
run('Apartman 3 kat', 'apartman', 3, rect, [{oda:3,salon:1,ensuite:true,acik:false,adet:2},{oda:2,salon:1,ensuite:false,acik:false,adet:2}]);
run('6 daire/kat', 'apartman', 5, rect, [{oda:2,salon:1,ensuite:false,acik:false,adet:4},{oda:1,salon:1,ensuite:false,acik:true,adet:2}]);
run('L-şekilli 8 kat', 'apartman', 8, Lshape, [{oda:3,salon:1,ensuite:true,acik:false,adet:2},{oda:1,salon:1,ensuite:false,acik:true,adet:2}]);
run('Villa 2 kat 4+1', 'villa', 2, small, [{oda:4,salon:1,ensuite:true,acik:false,adet:1}]);
run('Stüdyolar', 'apartman', 4, rect, [{oda:1,salon:0,ensuite:false,acik:true,adet:6}]);
