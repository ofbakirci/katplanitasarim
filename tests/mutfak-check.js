function run(label,bina,kat,poly,specs){
  for(const k of Object.keys(require.cache)) delete require.cache[k];
  function stubEl(tag){ return { tag, attrs:{}, children:[], style:{}, dataset:{}, _ih:'',
    set innerHTML(v){ this._ih=v; this.children=[]; }, get innerHTML(){ return this._ih; },
    appendChild(c){ this.children.push(c); return c; },
    addEventListener(){}, querySelectorAll(){ return []; },
    classList:{toggle(){},add(){},remove(){}},
    setAttribute(k,v){ this.attrs[k]=v; }, getAttribute(k){ return this.attrs[k]; },
    getBoundingClientRect(){ return {width:1200,height:800,left:0,top:0}; },
    textContent:'', value:'', disabled:false, onclick:null, click(){} };}
  const byId={}; const getEl=id=>byId[id]||(byId[id]=stubEl('div'));
  getEl('binaTipi').value=bina; getEl('katSayisi').value=String(kat); getEl('katYuk').value='2.9';
  global.document={getElementById:getEl,createElement:t=>stubEl(t),createElementNS:(n,t)=>stubEl(t)};
  global.window={addEventListener(){}};
  global.XMLSerializer=function(){this.serializeToString=()=>'';};
  global.Image=function(){};global.Blob=function(){};global.URL={createObjectURL:()=>''};
  eval(require('./support/app-js').readAppScript()+`
  ;unitSpecs=${JSON.stringify(specs)}; pts=${JSON.stringify(poly)}; closed=true; generate();
  const ms=[];
  plan.unitObjs.forEach(u=>u.rooms.forEach(g=>{ if(g.type==='mutfak'&&g.cells.length)
    ms.push(Math.min(g.bw,g.bh).toFixed(1)+'x'+Math.max(g.bw,g.bh).toFixed(1)); }));
  console.log('${label}:', ms.join('  ')||'(ayrı mutfak yok)');
  `);
}
run('32x16 6 daire','apartman',5,[{x:0,y:0},{x:32,y:0},{x:32,y:16},{x:0,y:16}],
  [{oda:2,salon:1,ensuite:false,acik:false,adet:4},{oda:1,salon:1,ensuite:false,acik:false,adet:2}]);
run('21x18 4x3+1','apartman',5,[{x:0,y:0},{x:21,y:0},{x:21,y:18},{x:0,y:18}],
  [{oda:3,salon:1,ensuite:true,acik:false,adet:4}]);
run('48x16 büyük daireler','apartman',6,[{x:0,y:0},{x:48,y:0},{x:48,y:16},{x:0,y:16}],
  [{oda:2,salon:1,ensuite:true,acik:false,adet:3},{oda:1,salon:1,ensuite:false,acik:false,adet:3}]);
run('40x28 dev daireler','apartman',6,[{x:0,y:0},{x:40,y:0},{x:40,y:28},{x:0,y:28}],
  [{oda:3,salon:1,ensuite:true,acik:false,adet:2},{oda:2,salon:1,ensuite:false,acik:false,adet:2}]);
