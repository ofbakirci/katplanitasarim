/* villa orta sofa: 14x11, 2 kat, ensuite — yatak sayısı 4..8 monotonluk + ihlaller */
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
const byId={}; const getEl=id=>byId[id]||(byId[id]=stubEl('div'));
getEl('binaTipi').value='villa'; getEl('katSayisi').value='2'; getEl('katYuk').value='2.9';
global.document={getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t)};
global.window={addEventListener(){}};
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){}; global.Blob=function(){}; global.URL={createObjectURL:()=>''};
const fs=require('fs');
const html=fs.readFileSync(''+__dirname+'/../kat-plani-tasarim.html','utf-8');
const src=html.slice(html.indexOf('<script>')+8, html.lastIndexOf('</script>'));
eval(src+`
;global.RUNV=(nb)=>{
  pts=[{x:0,y:0},{x:14,y:0},{x:14,y:11},{x:0,y:11}]; closed=true;
  unitSpecs=[{oda:nb,salon:1,ensuite:true,acik:false,adet:1}];
  customCutsZ=null; unitLayout={}; balconies=[];
  doorOverrides={}; extraDoors=[]; doorHidden={}; editHistory=[];
  generate();
  const u=plan.unitObjs[0];
  const beds=u.rooms.filter(g=>g.type==='yatak'&&g.cells.length).length;
  const rooms=u.rooms.filter(g=>g.cells.length).map(g=>g.name+' '+g.area.toFixed(1)+'m² '+g.bw+'x'+g.bh).join(' | ');
  const checks=runChecks();
  const bads=checks.filter(x=>x.s==='bad').map(x=>x.t||'?');
  return {beds, rooms, bads};
};`);
for(const nb of [4,5,6,7,8]){
  const r=global.RUNV(nb);
  console.log(nb+' yatak istendi -> '+r.beds+' yerleşti  (bad: '+r.bads.length+')');
  console.log('   '+r.rooms);
  r.bads.forEach(b=>console.log('   !! '+b));
}
