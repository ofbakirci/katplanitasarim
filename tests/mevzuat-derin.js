// Derin taban (70×45) regresyonu: ince şerit daire yok, kaçış mesafesi ≤30 m,
// doğal ışık denetimi içerideki odaları yakalar, daire sayısı önerisi görünür.
// Hazırlık: README'deki script çekme adımı (/tmp/app.js); APP_JS ile farklı yol verilebilir.
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
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='5'; getEl('katYuk').value='2.9';
global.document={getElementById:getEl,createElement:t=>stubEl(t),createElementNS:(n,t)=>stubEl(t)};
global.window={addEventListener(){}};
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){};global.Blob=function(){};global.URL={createObjectURL:()=>''};
function run(label, poly, specs, extra){
eval(require('fs').readFileSync(process.env.APP_JS||'/tmp/app.js','utf-8') + `
;unitSpecs=${JSON.stringify(specs)};
pts=${JSON.stringify(poly)}; closed=true;
generate();
console.log('--- ${label} ---');
const msgs=byId['checks'].children.map(d=>({cls:d.className, txt:d._ih.replace(/<[^>]+>/g,' ').replace(/\\s+/g,' ').trim()}));
const bad=s=>msgs.filter(m=>m.cls.includes('bad')&&m.txt.includes(s)).length;
const info=s=>msgs.filter(m=>m.cls.includes('info')&&m.txt.includes(s)).length;
const t=(name,ok)=>console.log((ok?' ✓ ':' ✗ FAIL ')+name);
t('ince şerit oda yok (dar kenar ihlali 0)', bad('dar kenar')===0);
t('kaçış mesafesi ≤ 30 m', bad('kaçış mesafesi')===0);
t('kapısız oda yok', bad('kapı')===0 && bad('komşu değil')===0);
t('tüm daireler yerleşti', plan.unitObjs.length===${extra.units});
${extra.checks||''}
const fails=msgs.filter(m=>m.cls.includes('bad')&&!m.txt.includes('cepheye açılmıyor'));
console.log(' kalan (ışık dışı) ihlal:', fails.length);
fails.forEach(m=>console.log('   -', m.txt.slice(0,90)));
`);
}
/* 70×45: derin taban — kaçış + şerit daire + öneriler */
run('70×45, 8×2+1 + 8×1+1',
  [{x:0,y:0},{x:70,y:0},{x:70,y:45},{x:0,y:45}],
  [{oda:2,salon:1,ensuite:true,acik:false,adet:8},{oda:1,salon:1,ensuite:false,acik:true,adet:8}],
  {units:16, checks:`
t('doğal ışık denetimi iç odaları yakalıyor', bad('cepheye açılmıyor')>0);
t('salon oran uyarısı var', info('salona aktı')>0);
t('daire sayısı önerisi var', info('daha uygun olur')>0);`});
/* 30×30: dar-derin daireler — demiryolu planı (yatak bandı), sliver yatak yok */
run('30×30, 5×2+1 + 4×1+1 (demiryolu)',
  [{x:0,y:0},{x:30,y:0},{x:30,y:30},{x:0,y:30}],
  [{oda:2,salon:1,ensuite:true,acik:false,adet:5},{oda:1,salon:1,ensuite:false,acik:true,adet:4}],
  {units:9, checks:`
t('yatak odası boyut ihlali yok', bad('En az bir yatak odası')===0);
t('eksik oda yok (yerleştirilemedi 0)', bad('yerleştirilebildi')===0);
t('biçimsiz oda yok', bad('biçimsiz')===0);`});
