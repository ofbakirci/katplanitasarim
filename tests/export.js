// Dışa aktarma testi: exportTableGroup (gruplama + sütun sarma) + exportClone (sabit ölçek, font-family)
// Hazırlık: README'deki script çekme adımı (/tmp/app.js); APP_JS ortam değişkeniyle farklı yol verilebilir.
function stubEl(tag){ const e={
  tag, attrs:{}, children:[], style:{}, dataset:{}, _ih:'',
  set innerHTML(v){ this._ih=v; this.children=[]; }, get innerHTML(){ return this._ih; },
  appendChild(c){ this.children.push(c); return c; },
  insertBefore(c,ref){ const i=this.children.indexOf(ref); this.children.splice(i<0?0:i,0,c); return c; },
  get firstChild(){ return this.children[0]||null; },
  addEventListener(){}, querySelectorAll(){ return []; },
  classList:{toggle(){},add(){},remove(){}},
  setAttribute(k,v){ this.attrs[k]=v; }, getAttribute(k){ return this.attrs[k]; },
  getBoundingClientRect(){ return {width:1400,height:1000,left:0,top:0}; },
  cloneNode(deep){ const c=stubEl(this.tag); Object.assign(c.attrs,this.attrs);
    if(deep) this.children.forEach(ch=>c.children.push(ch.cloneNode?ch.cloneNode(true):ch)); return c; },
  textContent:'', value:'', disabled:false, onclick:null, click(){}
}; return e; }
const byId={}; const getEl=id=>byId[id]||(byId[id]=stubEl('div'));
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='5'; getEl('katYuk').value='2.9';
global.document={getElementById:getEl,createElement:t=>stubEl(t),createElementNS:(n,t)=>stubEl(t)};
global.window={addEventListener(){}};
global.XMLSerializer=function(){this.serializeToString=e=>JSON.stringify(e.attrs);};
global.Image=function(){this.onload=null;Object.defineProperty(this,'src',{set(){}});};
global.Blob=function(){};global.URL={createObjectURL:()=>''};
function check(label,run){
  eval(require('fs').readFileSync(process.env.APP_JS||'/tmp/app.js','utf-8') + `
;unitSpecs=${JSON.stringify(run.specs)};
pts=${JSON.stringify(run.pts)}; closed=true;
generate();
console.log('--- ${label} ---');
const t=exportTableGroup(100, ${run.maxH});
const texts=[]; (function walk(e2){ if(e2.tag==='text') texts.push(e2.textContent); (e2.children||[]).forEach(walk); })(t.g);
const heads=texts.filter(s=>s.startsWith('D')&&s.includes('·'));
const cols=t.g.children.filter(c=>c.tag==='rect').length;
console.log(' gruplar:', heads.length, '| sütun:', cols, '| panel:', t.w+'×'+t.h);
heads.forEach(h=>console.log('  ', h));
const {clone,W,H}=exportClone();
console.log(' font:', clone.attrs['font-family'].split(',')[0], '| dışa aktarım:', W+'×'+H, '| ölçek pxPerM≥22 etiketleri açar');
if(pxPerM!==16) console.log(' [FAIL] ekran ölçeği geri yüklenmedi:', pxPerM);
exportSVG(); exportPNG();
console.log(' exportSVG/exportPNG ok');
`);
}
check('32×16, 4 daire', {specs:[{oda:2,salon:1,ensuite:true,acik:false,adet:2},{oda:1,salon:1,ensuite:false,acik:true,adet:2}],
  pts:[{x:0,y:0},{x:32,y:0},{x:32,y:16},{x:0,y:16}], maxH:900});
check('70×40, çok daire (gruplama+sütun)', {specs:[{oda:2,salon:1,ensuite:true,acik:false,adet:16},{oda:1,salon:1,ensuite:false,acik:true,adet:12}],
  pts:[{x:0,y:0},{x:70,y:0},{x:70,y:40},{x:0,y:40}], maxH:1000});
