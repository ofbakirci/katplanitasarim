/* Site-değişmezi: kata-ayrı planlama + kat geçişi SİTE'yi (blocks) silmemeli.
   node tests/otopark-kat-site.js

   Kök hata (kullanıcı vakası "otopark katına inince site'yi siliyor"):
   Site modu açıkken (2+ blok) "Katları ayrı planla" açılıp bir kat seçilince
   siteMod anahtarı kendiliğinden kapanıyor + blocks dizisi siliniyordu.
   Neden: switchFloor → restoreState(...,{keepFloors:true}); per-kat snapshot'ta
   st.blocks YOKTU ve blok-yıkım dalı yalnız opt.keepBlocks'a bakıyordu →
   keepFloors geçişinde blocks=null + siteMod.checked=false (asimetri: villaFloors
   keepFloors ile korunuyordu, blocks korunmuyordu). Otopark katı bunun bir örneği.

   (a) kata-ayrı planlama açıkken kat geçişi site'yi (blocks + siteMod) KORUR;
   (b) otopark/bodrum katına geçiş de aynı değişmezi tutar;
   (c) blok geçişi (keepBlocks) hâlâ çalışır + kat-başına düzen bloğa aittir;
   (d) undo/tam-restore (opt'suz) davranışı bozulmaz (blocks kayıttan gelir/gitmez). */
function stubEl(tag){ return {
  tag, attrs:{}, children:[], style:{}, dataset:{}, _ih:'',
  set innerHTML(v){ this._ih=v; this.children=[]; }, get innerHTML(){ return this._ih; },
  appendChild(c){ this.children.push(c); return c; },
  addEventListener(){}, querySelectorAll(){ return []; }, querySelector(){ return null; },
  classList:{toggle(){},add(){},remove(){}},
  setAttribute(k,v){ this.attrs[k]=v; }, getAttribute(k){ return this.attrs[k]; },
  getBoundingClientRect(){ return {width:1200,height:800,left:0,top:0}; },
  textContent:'', value:'', disabled:false, checked:false, onclick:null, click(){}, parentElement:null, offsetHeight:0
};}
const byId={}; const getEl=id=>byId[id]||(byId[id]=stubEl('div'));
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='3'; getEl('katYuk').value='2.9';
getEl('bodrumSayisi').value='1';                 // 1 bodrum → index 0 = otopark katı
global.document={ getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t),
  querySelectorAll:sel=>[] };
global.window={addEventListener(){}};
global.matchMedia=()=>({matches:false});
global.alert=()=>{}; global.confirm=()=>true;
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){}; global.Blob=function(){}; global.URL={createObjectURL:()=>''};
const {extractAppScript}=require('./support/app-js');
const src=extractAppScript();

let pass=0, fail=0;
const T=(name,cond)=>{ if(cond){pass++;} else {fail++; console.log('  [FAIL]', name);} };

eval(src+`
;(function(){
  /* --- kurulum: apartman + bodrum(otopark)+3 üst kat, Blok A planı --- */
  document.getElementById('bodrumSayisi').value='1';
  bodrumSayisi=1; villaOffset=1;                              // reflow'un okuduğu global
  pts=[{x:0,y:0},{x:16,y:0},{x:16,y:12},{x:0,y:12}]; closed=true;
  unitSpecs=[{oda:2,salon:1,ensuite:false,acik:false,adet:2}];
  generate();
  T('kurulum: Blok A planı üretildi', !!plan);

  /* --- SİTE modu aç: Blok A = mevcut bina --- */
  document.getElementById('siteMod').checked=true;
  blocks=[stateSnapshot(false)]; activeBlock=0;               // siteMod change handler ile birebir
  T('site açıldı (1 blok)', siteOn()===true && blocks.length===1);

  /* --- Blok B ekle, çiz + üret --- */
  saveActiveBlock();
  blocks.push(null); activeBlock=1;
  clearCanvasForNewBlock();                                   // (katAyri'yı kapatır — gerçek akış)
  pts=[{x:30,y:0},{x:46,y:0},{x:46,y:12},{x:30,y:12}]; closed=true;
  generate();
  T('Blok B üretildi', !!plan);
  T('2 blok var', blocks.length===2);

  /* --- Blok A'ya dön --- */
  switchBlock(0);
  T('Blok A geri geldi', activeBlock===0 && !!plan && siteOn()===true);

  /* === GERÇEK BUG AKIŞI: site açıkken KATLARI AYRI PLANLA aç === */
  document.getElementById('katAyri').checked=true;
  villaFloors=new Array(totalFloors()).fill(null);           // katAyri change handler ile birebir
  activeFloor=zeminIdx(); villaOffset=bodrumSayisi;
  villaFloors[zeminIdx()]=stateSnapshot(true);
  T('kata-ayrı açık + site hâlâ açık', floorsOn()===true && siteOn()===true && blocks.length===2);

  /* --- (a) herhangi bir kata geçiş → SİTE KORUNMALI (bug: kapanıyordu) --- */
  const up=zeminIdx()+1;                                      // ilk üst kat (ilk ziyaret)
  switchFloor(up);
  T('a: üst kata geçiş — siteOn korundu', siteOn()===true);
  T('a: üst kata geçiş — blocks silinmedi', Array.isArray(blocks) && blocks.length===2);
  T('a: üst kata geçiş — siteMod checkbox açık kaldı', document.getElementById('siteMod').checked===true);

  /* --- (b) OTOPARK/BODRUM katına geçiş (ilk ziyaret) → SİTE KORUNMALI --- */
  switchFloor(0);                                             // index 0 = bodrum (otopark varsayılan)
  T('b: bodrum kullanım tipi otopark', katKullanim==='otopark');
  T('b: otopark katına geçiş — siteOn korundu', siteOn()===true);
  T('b: otopark katına geçiş — blocks silinmedi', Array.isArray(blocks) && blocks.length===2);

  /* --- (a2) REVİZİT (snapshot'lı kat) geçişi de site'yi korumalı (restoreState yolu) --- */
  switchFloor(zeminIdx());                                    // zemin (ziyaret edilmiş → restoreState)
  T('a2: zemine (revizit) geçiş — siteOn korundu', siteOn()===true);
  T('a2: zemine (revizit) geçiş — blocks silinmedi', Array.isArray(blocks) && blocks.length===2);
  switchFloor(0);                                             // otoparka geri (revizit → restoreState)
  T('a2: otoparka revizit — siteOn korundu', siteOn()===true && blocks.length===2);
  switchFloor(up);
  T('a2: çoklu gezinme sonu — site sağlam', siteOn()===true && blocks.length===2 && document.getElementById('siteMod').checked===true);

  /* --- (c) blok geçişi hâlâ çalışır (keepBlocks yolu bozulmadı) --- */
  const okBlk = (function(){ try{ switchBlock(1); return activeBlock===1 && !!plan && siteOn()===true; }catch(e){ return false; } })();
  T('c: blok B geçişi çalışıyor', okBlk);
  switchBlock(0);
  T('c: blok A geri + kata-ayrı bloğa ait', activeBlock===0 && siteOn()===true);

  /* --- (d) undo/tam-restore (opt'suz) blocks'u kayıttan yönetir (regresyon yok) --- */
  const full=stateSnapshot(false, true);                     // st.blocks gömülü tam site durumu
  blocks=null; activeBlock=0; document.getElementById('siteMod').checked=false;   // canlıyı boz
  restoreState(full, {fit:false});                           // opt.keepBlocks/keepFloors YOK
  T('d: tam restore blocks\\'u geri kurdu', Array.isArray(blocks) && blocks.length===2 && document.getElementById('siteMod').checked===true);
})();
`);
console.log(pass+' geçti, '+fail+' kaldı');
process.exit(fail?1:0);
