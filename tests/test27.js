// 48 x 27 derin bina — kol cepheye kadar gitmeli, salondan koridor geçmemeli
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
;unitSpecs=[{oda:2,salon:1,ensuite:true,acik:false,adet:4},{oda:1,salon:1,ensuite:false,acik:true,adet:4}];
pts=[{x:0,y:0},{x:48,y:0},{x:48,y:27},{x:0,y:27}]; closed=true;
generate(); fitView();
// koridor hücresine komşu olmayan salon parçası var mı + her oda antreye komşu mu
let bad=0;
plan.unitObjs.forEach((u,k)=>{ if(!u.antre){console.log('D'+(k+1),'ANTRESİZ');bad++;return;}
  const aid=u.antre.id;
  u.rooms.forEach(g=>{ if(g===u.antre||!g.cells.length||g.name==='EB. BANYO') return;
    let ok=false;
    g.cells.forEach(i=>{ const r=(i/plan.cols)|0,c=i%plan.cols;
      [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc])=>{
        if(rr<0||cc<0||rr>=plan.rows||cc>=plan.cols)return;
        if(plan.cm[rr*plan.cols+cc]===aid) ok=true; }); });
    if(!ok){ console.log('D'+(k+1), 'erişimsiz:', g.name, g.area.toFixed(1)); bad++; } });
});
console.log(bad? 'SORUN VAR':'erişim TEMİZ');
const body=byId['svg'].children.map(ser).join('');
require('fs').writeFileSync('/tmp/plan27.svg','<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1000"><rect width="1400" height="1000" fill="#faf8f3"/>'+body+'</svg>');
`);
