/* KAT-M2-BAYAT — node tests/blok-m2-canli.js
   Bug: yapı sınırı köşe/kenar (bvert) düzenlemesi sonrası "Blok" floater'ındaki (#blockTabs)
   m² etiketi bayat kalıyordu.
   Kök hata: renderBlockTabs() (app.js) m²'yi CANLI hesaplıyordu (shoelace(pts)/b.pts), ama
   bvert commit (interaction.js: plan'lı/plan'sız), undo 'bound'/'bounddraw' dalları ve generate()
   zinciri onu hiç çağırmıyordu. Kardeş panel updateSiteSummary() render()'a bağlı olduğu için
   hiç bayatlamıyordu.
   Fix: render.js → render() her karede (exportView/aiCleanMode dışında) renderBlockTabs()'ı da
   çağırır; app.js → renderBlockTabs() ucuz bir imza-memo ile korunur (durum değişmediyse DOM'a
   dokunmaz), böylece her render'da çağrılması ucuzdur.
   (a) sınır büyütme + generate() (bvert-commit deseni) sonrası aktif blok m² etiketi YENİ alanı
       gösterir — noktasal renderBlockTabs() çağrısı OLMADAN;
   (b) aynı durumda ART ARDA render() DOM'u yeniden KURMAZ (memo: children dizisi referansı sabit
       kalır — stub innerHTML='' her rebuild'de children'ı YENİ bir diziyle değiştiriyor, bu yüzden
       referans testi memo'nun DOM'a dokunup dokunmadığının doğru vekilidir);
   (c) durum değiştiğinde memo YENİDEN kurar (children referansı değişir);
   (d) undo('bound') yolu da (interaction.js:901-905 deseni) canlı kalır — eski alana geri döner.

   NOT: renderBlockTabs() düğmeleri innerHTML STRING atamasıyla değil (box.innerHTML=html gibi),
   createElement+appendChild ile kurar; her düğmenin KENDİ innerHTML'i (btn.innerHTML='Blok ...')
   string atamasıdır ve stub'da yakalanır. Bu yüzden içerik doğrulaması box.innerHTML yerine
   box.children[].innerHTML üzerinden yapılır (tabsText() helper'ı). */
function stubEl(tag){ return {
  tag, attrs:{}, children:[], style:{}, dataset:{}, _ih:'',
  set innerHTML(v){ this._ih=v; this.children=[]; }, get innerHTML(){ return this._ih; },
  appendChild(c){ this.children.push(c); return c; },
  insertBefore(c){ this.children.unshift(c); return c; },
  addEventListener(){}, querySelectorAll(){ return []; }, querySelector(){ return null; },
  cloneNode(){ return stubEl(this.tag); },
  classList:{toggle(){},add(){},remove(){}},
  setAttribute(k,v){ this.attrs[k]=v; }, getAttribute(k){ return this.attrs[k]; },
  getBoundingClientRect(){ return {width:1200,height:800,left:0,top:0}; },
  textContent:'', value:'', disabled:false, checked:false, onclick:null, click(){}, parentElement:null, offsetHeight:0
};}
const byId={}; const getEl=id=>byId[id]||(byId[id]=stubEl('div'));
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='3'; getEl('katYuk').value='2.9';
global.document={getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t), querySelectorAll:sel=>[]};
global.window={addEventListener(){}};
global.getComputedStyle=()=>({display:'none'});
global.matchMedia=()=>({matches:false});
global.confirm=()=>true; global.alert=()=>{};
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){}; global.Blob=function(){}; global.URL={createObjectURL:()=>''};
const {extractAppScript}=require('./support/app-js');
const src=extractAppScript();

let pass=0, fail=0;
const T=(name,cond)=>{ if(cond){pass++;} else {fail++; console.log('  [FAIL]', name);} };

eval(src+`
;(function(){
  unitSpecs=[{oda:2,salon:1,ensuite:false,acik:false,adet:2}];
  const R=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
  const tabsText=()=>document.getElementById('blockTabs').children.map(c=>c.innerHTML||'').join(' | ');

  /* --- kurulum: site + Blok A (20x10=200 m²) + Blok B (12x8=96 m²) --- */
  pts=R(0,0,20,10); closed=true; generate();
  T('kurulum: Blok A planı üretildi', !!plan);
  document.getElementById('siteMod').checked=true;
  blocks=[stateSnapshot(false)]; activeBlock=0;
  T('site açıldı (1 blok)', siteOn()===true && blocks.length===1);

  saveActiveBlock();
  blocks.push(null); activeBlock=1;
  clearCanvasForNewBlock();
  pts=R(30,0,42,8); closed=true; generate();
  T('kurulum: Blok B planı üretildi', !!plan);
  blocks[1]=stateSnapshot(false);

  saveActiveBlock();
  activeBlock=0;
  restoreState(blocks[0], {keepBlocks:true});
  render();
  const box=document.getElementById('blockTabs');
  T('başlangıç: A alanı 200 m² gösteriliyor', /200/.test(tabsText()));
  T('başlangıç: B alanı 96 m² gösteriliyor (pasif bloktan)', /96/.test(tabsText()));
  const childrenBefore=box.children;

  /* --- (b) durum DEĞİŞMEDEN art arda render() → memo DOM'u yeniden kurmaz --- */
  render();
  T('memo: durum değişmedi -> children referansı SABİT (rebuild yok)', box.children===childrenBefore);

  /* --- (a) bvert-commit deseni (interaction.js:641): sınır büyür + generate() —
     NOKTASAL renderBlockTabs() çağrısı YOK, yalnız render() döngüsü --- */
  const prevPts=pts.map(p=>({...p}));            // bvert commit'in dragging.prevPts'i
  const prevCore=lockedCore;
  pts=R(0,0,24,10);                               // 20x10=200 -> 24x10=240 (köşe/kenar büyütme)
  generate();
  T('bvert-benzeri düzenleme sonrası YENİ m² (240) görünüyor', /240/.test(tabsText()));
  T('bayat m² (200) artık YOK', !/200/.test(tabsText()));
  T('memo: durum değiştiği için DOM yeniden kuruldu (children referansı değişti)', box.children!==childrenBefore);
  const childrenAfterEdit=box.children;

  /* --- (d) undo('bound') yolu (interaction.js:901-905 deseni) da canlı kalır --- */
  pts=prevPts.map(p=>({...p})); lockedCore=prevCore;
  if(closed){ generate(); }
  document.getElementById('stArea').textContent=fmt(shoelace(pts))+' m²';
  document.getElementById('stPerim').textContent=fmt(perim(pts))+' m';
  T('undo(bound) sonrası eski m² (200) geri geldi', /200/.test(tabsText()));
  T('undo(bound) sonrası yeni m² (240) artık YOK', !/240/.test(tabsText()));
  T('memo: undo sonrası durum tekrar değişti -> DOM yeniden kuruldu', box.children!==childrenAfterEdit);
})();
`);

console.log((fail? '  '+fail+' BAŞARISIZ, ':'✓ ')+'tüm blok-m2-canlı testleri '+(fail?'':'geçti ')+'('+pass+')');
process.exit(fail?1:0);
