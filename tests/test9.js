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
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='6'; getEl('katYuk').value='2.9';
global.document={getElementById:getEl,createElement:t=>stubEl(t),createElementNS:(n,t)=>stubEl(t)};
global.window={addEventListener(){}};
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){};global.Blob=function(){};global.URL={createObjectURL:()=>''};
function ser(e){
  if(e.tag==='text') return `<text ${Object.entries(e.attrs).map(([k,v])=>`${k}="${v}"`).join(' ')}>${(e.textContent||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')}</text>`;
  const a=Object.entries(e.attrs).map(([k,v])=>`${k}="${v}"`).join(' ');
  if(!e.children.length) return `<${e.tag} ${a}/>`;
  return `<${e.tag} ${a}>${e.children.map(ser).join('')}</${e.tag}>`;
}
eval(require('./support/app-js').readAppScript() + `
;unitSpecs=[{oda:2,salon:1,ensuite:true,acik:false,adet:3},{oda:1,salon:1,ensuite:false,acik:true,adet:3}];
pts=[{x:0,y:0},{x:48,y:0},{x:48,y:16},{x:0,y:16}]; closed=true;
generate(); fitView();
plan.unitObjs.forEach((u,k)=>{
  const bb=g=>{let r0=1e9,r1=-1e9,c0=1e9,c1=-1e9; g.cells.forEach(i=>{const r=(i/plan.cols)|0,c=i%plan.cols;
    r0=Math.min(r0,r);r1=Math.max(r1,r);c0=Math.min(c0,c);c1=Math.max(c1,c);}); return {w:(c1-c0+1)*0.5,h:(r1-r0+1)*0.5};};
  const a=u.rooms.reduce((s,g)=>s+g.area,0);
  const an=u.antre? bb(u.antre):null;
  console.log('D'+(k+1), a.toFixed(0).padStart(3)+' m²', 'antre', u.antre?u.antre.area.toFixed(1)+' ('+an.w+'x'+an.h+')':'-', '|', u.rooms.filter(g=>g.cells.length).map(g=>g.name.split(' ')[0]+' '+g.area.toFixed(0)).join(', '));
});
const body=byId['svg'].children.map(ser).join('');
require('fs').writeFileSync('/tmp/plan9.svg','<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1000"><rect width="1400" height="1000" fill="#faf8f3"/>'+body+'</svg>');
`);
