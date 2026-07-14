/* Kat düzeni kopyala akışı — node tests/kat-kopyala.js
   Yeni davranışlar (apartman + 1 bodrum): tampon KAT GEÇİŞİNDE yaşar; ziyaret edilmemiş bodrum
   satırı uygulanabilir ama VARSAYILAN işaretsiz; kullanıcının elle işaret/kaldır seçimi yeniden
   çizimde korunur; applyFloorLayout seçili hedef katı günceller, seçilmeyeni değiştirmez. */
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
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='3'; getEl('katYuk').value='2.9';
let fakeChecks=[];   // applyFloorLayout'un okuduğu #floorPasteList onay kutuları
global.document={ getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t),
  querySelectorAll:sel=> (sel&&sel.indexOf('floorPasteList')>=0)? fakeChecks : [] };
global.window={addEventListener(){}};
global.matchMedia=()=>({matches:false});
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){}; global.Blob=function(){}; global.URL={createObjectURL:()=>''};
const {extractAppScript}=require('./support/app-js');
const src=extractAppScript();

let pass=0, fail=0;
const T=(name,cond)=>{ if(cond){pass++;} else {fail++; console.log('  [FAIL]', name);} };

eval(src+`
;(function(){
  /* --- zemin: 16×12 apartman, 2 adet 2+1 --- */
  pts=[{x:0,y:0},{x:16,y:0},{x:16,y:12},{x:0,y:12}]; closed=true;
  unitSpecs=[{oda:2,salon:1,ensuite:false,acik:false,adet:2}];
  generate();
  T('zemin üretildi', !!plan && plan.unitObjs.length>=1);

  /* --- katları ayrı + 1 bodrum: index 0=bodrum, 1=zemin, 2=1.kat, 3=2.kat --- */
  bodrumSayisi=1;
  document.getElementById('katAyri').checked=true;
  villaFloors=new Array(totalFloors()).fill(null); activeFloor=zeminIdx(); villaOffset=bodrumSayisi;
  villaFloors[zeminIdx()]=stateSnapshot(true);
  T('kurulum: 4 kat, zemin=1, bodrum=0', totalFloors()===4 && zeminIdx()===1 && activeFloor===1 && floorLevel(0)<0);

  /* --- kopyala (kaynak = zemin) --- */
  copyActiveFloorLayout();
  T('kopyala: tampon doldu (src=zemin=1)', !!floorClip && floorClip.src===1);

  /* --- REQ 1: tampon KAT GEÇİŞİNDE yaşar --- */
  switchFloor(2);
  T('kat geçişi: aktif kat 2', activeFloor===2);
  T('kat geçişinde TAMPON YAŞADI (floorClip dolu)', !!floorClip && floorClip.src===1);

  /* --- uyumluluk sözleşmeleri (floorPasteOK değişmedi) --- */
  T('uyumluluk: kaynak kat kendine uygulanmaz', floorPasteOK(1)===false);
  T('uyumluluk: üst kat 3 (boş) uygun', floorPasteOK(3)===true);
  T('uyumluluk: bodrum 0 (boş, konut) uygun — işaretlenirse uygulanır', floorPasteOK(0)===true);

  /* --- REQ 3: bodrum VARSAYILAN işaretsiz + not; üst kat işaretli --- */
  const h=document.getElementById('floorPasteList').innerHTML;
  T('liste: bodrum satırı görünür (k=0)', /data-k="0"/.test(h));
  T('liste: bodrum VARSAYILAN işaretsiz', !/data-k="0" checked/.test(h));
  T('liste: bodrum notu "bodrum — istersen seç"', /bodrum — istersen seç/.test(h));
  T('liste: üst kat 3 varsayılan İŞARETLİ', /data-k="3" checked/.test(h));

  /* --- kullanıcı seçimi yeniden çizimde korunur (kat geçişi tampon tazeler) --- */
  const listEl=document.getElementById('floorPasteList');
  listEl.querySelectorAll=(sel)=> (sel&&sel.indexOf('checkbox')>=0)
    ? [ {dataset:{k:'3'},checked:false,disabled:false},   // kullanıcı üst kat 3'ü KALDIRDI
        {dataset:{k:'0'},checked:true, disabled:false} ]  // kullanıcı bodrumu İŞARETLEDİ
    : [];
  renderFloorPaste(false);
  const h2=listEl.innerHTML;
  T('koru: kaldırılan üst kat 3 işaretsiz kaldı', !/data-k="3" checked/.test(h2));
  T('koru: işaretlenen bodrum 0 işaretli kaldı', /data-k="0" checked/.test(h2));

  /* --- REQ 2 (uygula): yalnız üst kat 3 seçili → hedef güncellenir, bodrum dokunulmaz --- */
  fakeChecks=[ {checked:true,disabled:false,dataset:{k:'3'}} ];
  applyFloorLayout();
  T('uygula: üst kat 3 güncellendi', !!(villaFloors[3]&&villaFloors[3].plan));
  T('uygula: seçilmeyen bodrum 0 DEĞİŞMEDİ (boş kaldı)', !villaFloors[0]);
  T('uygula: kaynak zemin 1 korundu', !!(villaFloors[1]&&villaFloors[1].plan));

  /* --- bodrum ancak kullanıcı bilerek seçince uygulanır --- */
  fakeChecks=[ {checked:true,disabled:false,dataset:{k:'0'}} ];
  applyFloorLayout();
  T('uygula: kullanıcı işaretleyince bodrum 0 uygulandı', !!(villaFloors[0]&&villaFloors[0].plan));
})();
`);
console.log(pass+' geçti, '+fail+' kaldı');
process.exit(fail?1:0);
