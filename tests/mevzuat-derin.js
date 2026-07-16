// Derin taban (70×45) regresyonu: ince şerit daire yok, kaçış mesafesi ≤30 m,
// doğal ışık denetimi içerideki odaları yakalar, daire sayısı önerisi görünür.
// APP_JS ile farklı hazırlanmış app script yolu verilebilir.
// NOT (2026-07-16): mesajlar #checks'ten DEĞİL #cmBody'den okunur — SUNUM-1A (aab8624) denetim
// panelini kompakt özet (#checks: yalnız chkSummary) + popup gövdesi (#cmBody: cmSec/cmSecBody/chk
// satırları) olarak böldü. Eski #checks.children okuması yalnız özeti görüyordu → tüm sayaçlar 0,
// ===0 beklentileri SAHTE-yeşil, >0 kanaryaları sessiz FAIL. Ayrıca t() artık hata sayar ve dosya
// hatalı çıkış koduyla biter (runner res.status'u değerlendirir) — soft-log dönemi bilinçli değildi.
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
const {nodeText}=require('./support/dom-text');
global.__mdFail=0;
function run(label, poly, specs, extra){
eval(require('./support/app-js').readAppScript() + `
;unitSpecs=${JSON.stringify(specs)};
pts=${JSON.stringify(poly)}; closed=true;
generate();
console.log('--- ${label} ---');
// mesajlar popup gövdesinde: #cmBody > .cmSec > .cmSecBody > .chk (bkz. checks.js renderChecks/buildCheckSection)
const rows=[]; ((byId['cmBody']&&byId['cmBody'].children)||[]).forEach(sec=>(sec.children||[]).forEach(part=>{
  if((part.className||'').includes('cmSecBody')) (part.children||[]).forEach(r=>rows.push(r)); }));
const msgs=rows.map(d=>({cls:d.className, txt:nodeText(d)}));
const bad=s=>msgs.filter(m=>m.cls.includes('bad')&&m.txt.includes(s)).length;
const info=s=>msgs.filter(m=>m.cls.includes('info')&&m.txt.includes(s)).length;
const t=(name,ok)=>{ if(!ok) global.__mdFail++; console.log((ok?' ✓ ':' ✗ FAIL ')+name); };
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
// FAZ 2/#42 sonrası şişme denetimi tip-bilinçli: aşırı büyük dairede ÖNCE "odalara aktı (şişme)"
// ateşlenir (checks.js else-if zinciri), "salona aktı" yalnız yedek sinyal — ikisi de DAIRE_SISME.
t('daire şişme uyarısı var (salona/odalara aktı)', info('salona aktı')+info('odalara aktı')>0);
t('daire sayısı önerisi var', info('daha uygun olur')>0);`});
/* 30×30: dar-derin daireler — demiryolu planı (yatak bandı), sliver yatak yok */
run('30×30, 5×2+1 + 4×1+1 (demiryolu)',
  [{x:0,y:0},{x:30,y:0},{x:30,y:30},{x:0,y:30}],
  [{oda:2,salon:1,ensuite:true,acik:false,adet:5},{oda:1,salon:1,ensuite:false,acik:true,adet:4}],
  {units:9, checks:`
t('yatak odası boyut ihlali yok', bad('En az bir yatak odası')===0);
t('eksik oda yok (yerleştirilemedi 0)', bad('yerleştirilebildi')===0);
t('biçimsiz oda yok', bad('biçimsiz')===0);`});
console.log(global.__mdFail? ('MEVZUAT-DERIN: '+global.__mdFail+' kontrol BAŞARISIZ') : 'MEVZUAT-DERIN: tüm kontroller geçti');
process.exit(global.__mdFail?1:0);
