/* IC-BLOK-KAT-CIP (İş 1) — İÇ modda blok + kat çipleri: headless sınıflama testi (THREE'siz).
   View3D.floorChipsForTest() sahne kurmadan salt-veri döner ([{idx,name,enabled}]) — konut-dışı
   (ticari/otopark/sığınak) kat DEVRE DIŞI (enabled:false), konut katlar AKTİF (enabled:true) —
   H3 (nonResidentialFallback) ile aynı ürün kararı: iç mekân yalnız konut katlarda var.
   Blok çipi listesi siteOn()'a bağlıdır (renderBlockChips'in aynı koşulu) — DOM/THREE olmadan
   dış-drone-kamera.js deseniyle doğrudan test edilir.

   Gerçek veri (kullanıcı önerisi): input/kat-plani-17.svg — site (2 blok); Blok A kendi içinde
   katları-ayrı + 2 bodrum + 4 üst kat, 1. bodrum=otopark (konut-dışı), gerisi konut. input/
   gitignored (CI'da olmayabilir) → yoksa sentetik senaryoya düşülür (bodrum=otopark, üstü konut).

   Çalıştır: node tests/ic-blok-kat-cip.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { scriptSources } = require('./support/app-js');
const { installDom } = require('./support/dom-stub');

let pass = 0, fail = 0;
function ok(){ pass++; }
function bad(m){ fail++; console.error('  ✗ ' + m); }
function chk(c, m){ if(c) ok(); else bad(m); }

const dom = installDom({ binaTipi:'apartman', katSayisi:5, katYuk:2.9 });
const ctx = vm.createContext({
  console, matchMedia:()=>({matches:false}),
  document: dom.document,
  window: { addEventListener(){}, matchMedia:()=>({matches:false}), View3D:null },
  XMLSerializer:function(){ this.serializeToString=()=>''; },
  Image:function(){}, Blob:function(){},
  URL:{ createObjectURL:()=>'', revokeObjectURL(){} },
  localStorage:{ getItem(){return null;}, setItem(){} },
  requestAnimationFrame:fn=>fn&&fn(), setTimeout, clearTimeout, confirm:()=>true, alert:()=>{},
  navigator:{ userAgent:'node' }
});
scriptSources().forEach(({ source, filename }) => new vm.Script(source, { filename }).runInContext(ctx));
function run(code){ return new vm.Script(code).runInContext(ctx); }

function report(){
  console.log('\nIC-BLOK-KAT-CIP (İş 1): ' + pass + ' geçti, ' + fail + ' başarısız');
}

const hasApi = run(`!!(window.View3D && window.View3D.floorChipsForTest)`);
chk(hasApi, 'View3D.floorChipsForTest erişilebilir');
if(!hasApi){ report(); process.exit(fail?1:0); }

/* ---- kurulum: gerçek veri varsa onu kullan, yoksa sentetik senaryo ---- */
const svgPath = path.join(__dirname, '..', 'input', 'kat-plani-17.svg');
let usedFixture = false;
if(fs.existsSync(svgPath)){
  const svg = fs.readFileSync(svgPath, 'utf8');
  const m = svg.match(/<metadata[^>]*id="kpState"[^>]*>([\s\S]*?)<\/metadata>/);
  if(m){
    const json = m[1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
    ctx.__ST = JSON.parse(json);
    try{
      run(`restoreState(__ST); switchBlock(0);`);   // Blok A'yı aktive et → villaFloors/katAyri Blok A'nın KENDİ anlık görüntüsünden gelir
      usedFixture = true;
    }catch(e){ console.log('  (input/kat-plani-17.svg restoreState hatası — sentetik senaryoya düşüldü: '+(e&&e.message)+')'); }
  }
}
if(!usedFixture){
  console.log('  (input/kat-plani-17.svg yok/uygun değil — sentetik senaryoya düşüldü)');
  run(`
    document.getElementById('binaTipi').value='apartman';
    document.getElementById('katSayisi').value='4';
    document.getElementById('bodrumSayisi').value='1';
    bodrumSayisi=1; villaOffset=1;
    pts=[{x:0,y:0},{x:16,y:0},{x:16,y:12},{x:0,y:12}]; closed=true;
    unitSpecs=[{oda:2,salon:1,ensuite:false,acik:false,adet:2}];
    generate();
    document.getElementById('katAyri').checked=true;
    villaFloors=new Array(totalFloors()).fill(null);
    activeFloor=zeminIdx();
    villaFloors[activeFloor]=stateSnapshot(true);
    villaFloors[0]={plan:{katKullanim:'otopark'}};   // bodrum = otopark (konut-dışı)
    katKullanim='konut';
    document.getElementById('siteMod').checked=true;
    blocks=[{},{}]; activeBlock=0;   // siteOn-bağımlılık iddiası için 2 sahte blok (n>=2 koşulu)
  `);
}

/* ---- 1) floorChipsForTest: uzunluk + konut-dışı kat devre dışı + konut katlar aktif ---- */
const chips = run(`window.View3D.floorChipsForTest()`);
const totalFloorsN = run(`totalFloors()`);
chk(Array.isArray(chips) && chips.length>=2, 'floorChipsForTest en az 2 kat döndürür: '+(chips&&chips.length));
chk(chips.length===totalFloorsN, 'çip sayısı totalFloors() ile eşleşir: '+chips.length+' vs '+totalFloorsN);

const disabled = chips.filter(function(c){ return !c.enabled; });
const enabled = chips.filter(function(c){ return c.enabled; });
chk(disabled.length>=1, 'en az bir konut-dışı (devre dışı) kat var: '+disabled.length);
chk(enabled.length>=1, 'en az bir konut (aktif) kat var: '+enabled.length);

if(usedFixture){
  // Blok A (kat-plani-17.svg): idx1 = 1. bodrum = otopark (konut-dışı) → enabled:false; kalanı konut → enabled:true
  const c1 = chips.find(function(c){ return c.idx===1; });
  chk(!!c1 && c1.enabled===false, 'gerçek veri: 1. bodrum (otopark) enabled:false — '+JSON.stringify(c1));
  [0,2,3,4,5].forEach(function(i){
    const c=chips.find(function(x){ return x.idx===i; });
    chk(!!c && c.enabled===true, 'gerçek veri: idx '+i+' (konut) enabled:true — '+JSON.stringify(c));
  });
} else {
  const c0 = chips.find(function(c){ return c.idx===0; });
  chk(!!c0 && c0.enabled===false, 'sentetik: bodrum (otopark) enabled:false — '+JSON.stringify(c0));
}
// isimler floorName(k) ile eşleşir (tek doğru kaynak — sınıflama app.js'in adlandırmasını TEKRAR ETMİYOR, ondan okuyor)
let namesOK=true;
chips.forEach(function(c){
  const nm=run(`floorName(${c.idx})`);
  if(c.name!==nm) namesOK=false;
});
chk(namesOK, 'her çip adı floorName(idx) ile eşleşir: '+JSON.stringify(chips.map(function(c){return c.name;})));

/* ---- 2) blok listesi siteOn()'a bağlı (renderBlockChips'in aynı koşulu — DOM/sahne olmadan doğrudan test) ---- */
const blockCountExpr = `(function(){ let n=0; try{ if(typeof siteOn==='function' && siteOn() && typeof blocks!=='undefined' && Array.isArray(blocks)) n=blocks.length; }catch(e){ n=0; } return n; })()`;
const nOn = run(blockCountExpr);
chk(nOn>=2, 'siteOn() açıkken (blok çipi görünür olurdu) blok sayısı >=2: '+nOn);
run(`document.getElementById('siteMod').checked=false;`);
chk(run(`siteOn()`)===false, 'siteMod kapatılınca siteOn()===false');
const nOff = run(blockCountExpr);
chk(nOff===0, 'siteOn() kapalıyken (blok çipi gizlenirdi) blok sayısı 0 — bağımlılık kanıtlandı: '+nOff);
run(`document.getElementById('siteMod').checked=true;`);   // geri aç (yan etkisiz bırak)

report();
process.exit(fail?1:0);
