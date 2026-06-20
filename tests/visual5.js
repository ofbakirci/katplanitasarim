function stubEl(tag){ return {
  tag, attrs:{}, children:[], style:{}, dataset:{}, _ih:'',
  set innerHTML(v){ this._ih=v; this.children=[]; }, get innerHTML(){ return this._ih; },
  appendChild(c){ this.children.push(c); return c; },
  addEventListener(){}, querySelectorAll(){ return []; },
  classList:{toggle(){},add(){},remove(){}},
  setAttribute(k,v){ this.attrs[k]=v; }, getAttribute(k){ return this.attrs[k]; },
  getBoundingClientRect(){ return {width:1400,height:1000,left:0,top:0}; },
  textContent:'', value:'', disabled:false, onclick:null, click(){}
};}
const byId={}; const getEl=id=>byId[id]||(byId[id]=stubEl('div'));
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='8'; getEl('katYuk').value='2.9';
global.document={getElementById:getEl,createElement:t=>stubEl(t),createElementNS:(n,t)=>stubEl(t)};
global.window={addEventListener(){}};
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){};global.Blob=function(){};global.URL={createObjectURL:()=>''};
const {nodeText}=require('./support/dom-text');
function ser(e){
  if(e.tag==='text') return `<text ${Object.entries(e.attrs).map(([k,v])=>`${k}="${v}"`).join(' ')}>${(e.textContent||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')}</text>`;
  const a=Object.entries(e.attrs).map(([k,v])=>`${k}="${v}"`).join(' ');
  if(!e.children.length) return `<${e.tag} ${a}/>`;
  return `<${e.tag} ${a}>${e.children.map(ser).join('')}</${e.tag}>`;
}
eval(require('./support/app-js').readAppScript() + `
;unitSpecs=[{oda:3,salon:1,ensuite:true,acik:false,adet:2},{oda:2,salon:1,ensuite:false,acik:true,adet:2},{oda:1,salon:1,ensuite:false,acik:true,adet:2}];
pts=[{x:8,y:0},{x:30,y:0},{x:30,y:8},{x:38,y:8},{x:38,y:20},{x:22,y:20},{x:22,y:26},{x:0,y:26},{x:0,y:8},{x:8,y:8}]; closed=true;
generate(); fitView();
plan.unitObjs.forEach((u,k)=>{
  const a=u.rooms.reduce((s,g)=>s+g.area,0);
  console.log('D'+(k+1), (u.spec.oda+'+'+u.spec.salon).padEnd(4), a.toFixed(0).padStart(4)+' m² |', u.rooms.filter(g=>g.cells.length).map(g=>g.name.split(' ')[0]+' '+g.area.toFixed(1)).join(', '));
});
const bads=byId['checks'].children.filter(d=>d.className.includes('bad'));
console.log('FAILs:', bads.length?bads.map(nodeText).join(' || '):'yok');
const body=byId['svg'].children.map(ser).join('');
require('fs').writeFileSync('/tmp/plan5.svg','<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1000"><rect width="1400" height="1000" fill="#faf8f3"/>'+body+'</svg>');
`);
