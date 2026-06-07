// kat-plani-10 senaryosu: uzun bar, üst sıra stüdyolar + alt sıra 2+1
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
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='7'; getEl('katYuk').value='2.9';
global.document={getElementById:getEl,createElement:t=>stubEl(t),createElementNS:(n,t)=>stubEl(t)};
global.window={addEventListener(){}};
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){};global.Blob=function(){};global.URL={createObjectURL:()=>''};
eval(require('fs').readFileSync('/tmp/app.js','utf-8') + `
;unitSpecs=[{oda:1,salon:0,ensuite:false,acik:true,adet:5},{oda:2,salon:1,ensuite:true,acik:false,adet:5}];
pts=[{x:0,y:0},{x:44,y:0},{x:44,y:15},{x:0,y:15}]; closed=true;
generate();
let banyosuz=0, saftlar=[];
plan.unitObjs.forEach((u,k)=>{
  if(!u.rooms.some(g=>g.type==='banyo'&&g.cells.length)){ banyosuz++; console.log('D'+(k+1),'BANYOSUZ!'); }
});
plan.regions.forEach(g=>{ if(g.cells.length&&(g.name==='ŞAFT'||g.name==='TEKNİK / ŞAFT')) saftlar.push(g.name+' '+g.area.toFixed(1)); });
console.log('banyosuz daire:', banyosuz, '| şaft bölgeleri:', saftlar.join(', ')||'-');
const bads=byId['checks'].children.filter(d=>d.className.includes('bad'));
console.log('FAILs:', bads.length? bads.map(d=>d._ih.replace(/<[^>]+>/g,' ').trim()).join(' || ') : 'yok');
`);
