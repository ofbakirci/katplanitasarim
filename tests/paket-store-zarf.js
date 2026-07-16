/* PAKET-STORE-ZARF (İş A3) — .mskpkg paket mobilya/malzeme depo ZARFLAMA sözleşmesi (headless).
   Mesken şablonundaki pkgWrapFurnitureStore/pkgUnwrapFurnitureStore (mesken/02_PROTOTIP/prototip.template.html)
   BURADA BİREBİR yeniden üretilir — template.html tarayıcı-only iframe/DOM akışı taşır, node vm'e
   yüklenmez; bu test SÖZLEŞMEYİ (format) doğrular, motor kodunu (app.js) DEĞİŞTİRMEZ.

   Kapsam:
   (a) SERİLEŞTİRME TUZAĞI KANITI: floorStoreWrite ile yazılmış bir depo (dizi + __t/__floor/__block
       dizi-ÜSTÜ meta) → plan DEĞİŞİR (floorLayoutSig farklılaşır, "exact" eşleşme artık YOK) → ZARFSIZ
       çıplak JSON round-trip → floorStoreResolve KAYDI KAYBEDER (meta yok → "sameFloor" düşüşü de
       çalışmaz). AYNI senaryo ZARFLI round-trip ile → floorStoreResolve kaydı BULUR (__t/__floor/__block
       korunmuş → "sameFloor" düşüşü çalışır).
   (b) kpState round-trip sig kararlılığı: floorLayoutSig(k) → stateSnapshot(false,true) → JSON →
       restoreState → floorLayoutSig(k) DEĞİŞMEDİ (paket importu plan/doors/windows'u birebir taşır →
       floorStoreResolve'un export-anındaki "exact" eşleşmesi import sonrası da geçerli kalır).

   Çalıştır: node tests/paket-store-zarf.js */
'use strict';
const { extractAppScript } = require('./support/app-js');
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; } else { fail++; console.log('  [FAIL]', msg); } };

function stubEl(tag) {
  return {
    tag, attrs: {}, children: [], style: {}, dataset: {}, _ih: '',
    set innerHTML(v) { this._ih = v; this.children = []; }, get innerHTML() { return this._ih; },
    appendChild(c) { this.children.push(c); return c; },
    insertBefore(c) { this.children.unshift(c); return c; },
    addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; },
    cloneNode() { return stubEl(this.tag); },
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
    getBoundingClientRect() { return { width: 1200, height: 800, left: 0, top: 0 }; },
    textContent: '', value: '', disabled: false, onclick: null, click() {}, parentElement: null, offsetHeight: 0
  };
}
const byId = {}; const getEl = id => byId[id] || (byId[id] = stubEl('div'));
getEl('binaTipi').value = 'apartman'; getEl('katSayisi').value = '3'; getEl('katYuk').value = '2.9';
global.document = { getElementById: getEl, createElement: t => stubEl(t), createElementNS: (n, t) => stubEl(t), querySelectorAll: () => [] };
global.window = { addEventListener() {} };
global.matchMedia = () => ({ matches: false });
global.alert = () => {};
global.XMLSerializer = function () { this.serializeToString = () => ''; };
global.Image = function () {}; global.Blob = function () {}; global.URL = { createObjectURL: () => '' };
const src = extractAppScript();

eval(src + `
;(function(){
  /* ---- pkgWrapFurnitureStore/pkgUnwrapFurnitureStore — mesken template ile BİREBİR (İş A1 ikizi) ---- */
  function pkgWrapFurnitureStore(storeRaw){
    var out={};
    Object.keys(storeRaw||{}).forEach(function(k){
      var v=storeRaw[k]; if(!v || !Array.isArray(v)) return;
      out[k]={ items:v.map(function(it){ return JSON.parse(JSON.stringify(it)); }), __t:v.__t, __floor:v.__floor, __block:v.__block };
    });
    return out;
  }
  function pkgUnwrapFurnitureStore(wrapped){
    var out={};
    Object.keys(wrapped||{}).forEach(function(k){
      var w=wrapped[k]; if(!w || !Array.isArray(w.items)) return;
      var items=w.items.map(function(it){ return JSON.parse(JSON.stringify(it)); });
      items.__t=w.__t; items.__floor=w.__floor; items.__block=w.__block;
      out[k]=items;
    });
    return out;
  }

  pts=[{x:0,y:0},{x:16,y:0},{x:16,y:12},{x:0,y:12}]; closed=true;
  unitSpecs=[{oda:2,salon:1,ensuite:false,acik:false,adet:2}];
  balconies=[]; doorOverrides={}; extraDoors=[]; doorHidden={}; editHistory=[];
  generate();
  activeFloor=0; activeBlock=0;

  /* ---- (a) SERİLEŞTİRME TUZAĞI: floorStoreWrite ile yaz, sonra plan DEĞİŞTİR (sig farklılaşsın) ---- */
  ok(typeof floorStoreWrite==='function', 'a: floorStoreWrite app.js\\'te tanımlı');
  ok(typeof floorStoreResolve==='function', 'a: floorStoreResolve app.js\\'te tanımlı');
  const store={};
  const itemsA=[{id:'f1',type:'sofa_2',room_id:'ROOM1',pos:{x:1,y:0,z:1},rot_deg:0}];
  floorStoreWrite(store, 'ROOM1', itemsA);
  const keys0=Object.keys(store);
  ok(keys0.length===1 && keys0[0].indexOf('ROOM1@@')===0, 'a: floorStoreWrite bileşik anahtar yazdı: '+JSON.stringify(keys0));
  const sigA=floorLayoutSig(0);
  ok(keys0[0]===('ROOM1@@'+sigA), 'a: anahtarın sig kısmı floorLayoutSig(0) ile eşleşiyor');
  const stampedT=itemsA.__t, stampedFloor=itemsA.__floor, stampedBlock=itemsA.__block;
  ok(stampedFloor===0 && stampedBlock===0 && typeof stampedT==='number', 'a: floorStoreWrite dizi-üstü __t/__floor/__block damgaladı: '+JSON.stringify({t:stampedT,floor:stampedFloor,block:stampedBlock}));

  // planı değiştir (kapı override) → floorLayoutSig(0) farklılaşır → "exact" eşleşme artık YOK,
  // yalnız "sameFloor" (meta-bağımlı) düşüşü kaydı bulabilir.
  doorOverrides={ '__paket-store-zarf-test__': { h:true, x:0, y:0 } };
  const sigB=floorLayoutSig(0);
  ok(sigA!==sigB, 'a: plan değişince floorLayoutSig(0) farklılaştı (exact eşleşme artık geçersiz)');

  // ---- ZARFSIZ çıplak JSON round-trip: meta KAYBOLUR → floorStoreResolve kaydı BULAMAZ ----
  const naiveRoundTrip=JSON.parse(JSON.stringify(store));
  const naiveArr=naiveRoundTrip[keys0[0]];
  ok(Array.isArray(naiveArr) && naiveArr.__floor===undefined, 'a: ZARFSIZ round-trip dizi-üstü meta\\'yı KAYBETTİ (kanıt): __floor='+naiveArr.__floor);
  const naiveResolved=floorStoreResolve(naiveRoundTrip);
  ok(!naiveResolved.ROOM1, 'a: ZARFSIZ round-trip sonrası floorStoreResolve ROOM1 kaydını KAYBETTİ (bug kanıtlandı): '+JSON.stringify(naiveResolved.ROOM1));

  // ---- ZARFLI round-trip: meta KORUNUR → floorStoreResolve "sameFloor" düşüşüyle kaydı BULUR ----
  const wrapped=pkgWrapFurnitureStore(store);
  const wrappedJson=JSON.stringify(wrapped);
  const wrappedParsed=JSON.parse(wrappedJson);
  const opened=pkgUnwrapFurnitureStore(wrappedParsed);
  const openedArr=opened[keys0[0]];
  ok(Array.isArray(openedArr), 'a: ZARF açıldıktan sonra değer yine bir dizi');
  ok(openedArr.__t===stampedT && openedArr.__floor===stampedFloor && openedArr.__block===stampedBlock,
    'a: ZARF round-trip __t/__floor/__block\\'u KORUDU: '+JSON.stringify({t:openedArr.__t,floor:openedArr.__floor,block:openedArr.__block}));
  const resolved=floorStoreResolve(opened);
  ok(!!resolved.ROOM1, 'a: ZARFLI round-trip sonrası floorStoreResolve ROOM1 kaydını BULDU (fix kanıtlandı)');
  ok(resolved.ROOM1 && resolved.ROOM1.length===1 && resolved.ROOM1[0].id==='f1', 'a: bulunan kayıt orijinal öğeyle eşleşiyor: '+JSON.stringify(resolved.ROOM1));

  /* ---- (b) kpState round-trip sig kararlılığı ---- */
  doorOverrides={}; // (a)'nın yapay override'ını temizle — (b) kendi başına anlamlı bir plan üzerinde çalışsın
  const sigBefore=floorLayoutSig(activeFloor);
  ok(sigBefore!=null, 'b: floorLayoutSig(activeFloor) round-trip öncesi null değil');
  const st=stateSnapshot(false, true);
  ok(!!st, 'b: stateSnapshot(false,true) üretildi');
  const stJson=JSON.parse(JSON.stringify(st));
  restoreState(stJson, {fit:false});
  const sigAfter=floorLayoutSig(activeFloor);
  ok(sigBefore===sigAfter, 'b: kpState round-trip (stateSnapshot→JSON→restoreState) sonrası floorLayoutSig(activeFloor) DEĞİŞMEDİ: '+sigBefore+' === '+sigAfter);
})();
`);
console.log('\nPAKET-STORE-ZARF (İş A3): ' + pass + ' geçti, ' + fail + ' başarısız');
process.exit(fail ? 1 : 0);
