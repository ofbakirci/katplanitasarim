/* vaka-3 D3: antreyi salona erit, alttan sağ tıkla +ANTRE de — koridora komşu mu? */
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
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='5'; getEl('katYuk').value='2.9';
global.document={getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t)};
global.window={addEventListener(){}};
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){}; global.Blob=function(){}; global.URL={createObjectURL:()=>''};
const fs=require('fs');
const html=fs.readFileSync(''+__dirname+'/../kat-plani-tasarim.html','utf-8');
const src=html.slice(html.indexOf('<script>')+8, html.lastIndexOf('</script>'));
function loadState(f){const t=fs.readFileSync(f,'utf8');return JSON.parse(t.match(/<metadata id="kpState">([\s\S]*?)<\/metadata>/)[1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'));}
eval(src+`
;restoreState(loadState(''+__dirname+'/../vakalar/vaka-3-L-sekil.svg'));
const k=2, u=plan.unitObjs[k]; // D3
const salon=u.rooms.find(g=>g.type==='salon');
const antre=u.antre;
console.log('önce: ANTRE', antre.cells.length+' hücre');
/* antreyi salona erit */
antre.cells.forEach(i=>{ plan.cm[i]=salon.id; salon.cells.push(i); });
antre.cells=[]; u.rooms=u.rooms.filter(g=>g!==antre); u.antre=null;
calcRegionMetrics(salon, plan.cols, plan.minX, plan.minY);
/* salonun EN ALT (güney) hücresine sağ tık (kullanıcının şikayeti: alttan ekliyordu) */
let bot=salon.cells[0];
salon.cells.forEach(i=>{ if(((i/plan.cols)|0)>((bot/plan.cols)|0)) bot=i; });
const ok=addRoom(salon, {name:'ANTRE',type:'antre',h:3,w:6}, bot);
console.log('addRoom:', ok);
const na=u.antre;
if(na){
  const isCor=j=>j>=0&&plan.cm[j]>=0&&plan.regions[plan.cm[j]].type==='koridor';
  let corT=0, extT=0;
  na.cells.forEach(i=>{ const r=(i/plan.cols)|0,c=i%plan.cols;
    [[i-plan.cols,r>0],[i+plan.cols,r<plan.rows-1],[i-1,c>0],[i+1,c<plan.cols-1]].forEach(([j,g])=>{ if(g&&isCor(j)) corT++; });
    if(r===0||r===plan.rows-1||c===0||c===plan.cols-1||!plan.inside[i-plan.cols]||!plan.inside[i+plan.cols]||!plan.inside[i-1]||!plan.inside[i+1]) extT++;
  });
  calcRegionMetrics(na, plan.cols, plan.minX, plan.minY);
  console.log('yeni ANTRE: '+na.area.toFixed(1)+' m², koridor teması '+(corT*0.5)+' m, cephe hücresi '+extT);
  console.log(corT>0? '✓ koridora komşu (kapı verilebilir)' : '✗ koridora KOMŞU DEĞİL');
  console.log(extT===0? '✓ cepheye dokunmuyor (pencereler odalarda)' : '! cepheye dokunan hücre: '+extT);
}`);
