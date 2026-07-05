/* FURN-CLEARANCE — oto-döşe sonrası kapı-önü + pencere-önü BOŞ mu (W2/W3).
   W2: her kapı span'ının iki tarafında geçiş koridoru (span × ~0.9m derinlik) mobilyasız.
   W3: YÜKSEK mobilya (h>1.10m: gardırop/kitaplık/buzdolabı) hiçbir pencere span'ı önünde değil;
       tam-boy cam önünde alçak da olmaz.
   MOTOR MANTIĞINI DEĞİŞTİRMEZ; yalnız buildFloorplanMap + View3D.furnishMapForTest çağırır. */
'use strict';
const vm = require('vm');
const { scriptSources } = require('./support/app-js');
const { installDom } = require('./support/dom-stub');

let pass = 0, fail = 0;
function ok(c, m){ if(c){ pass++; } else { fail++; console.error('  ✗ ' + m); } }

const dom = installDom();
const ctx = vm.createContext({
  console, matchMedia: () => ({ matches: false }),
  document: dom.document,
  window: { addEventListener() {}, matchMedia: () => ({ matches: false }) },
  XMLSerializer: function () { this.serializeToString = () => ''; },
  Image: function () {}, Blob: function () {},
  URL: { createObjectURL: () => '', revokeObjectURL() {} },
  localStorage: { getItem() { return null; }, setItem() {} },
  requestAnimationFrame: fn => fn && fn(), setTimeout, clearTimeout,
  navigator: { userAgent: 'node' }
});
scriptSources().forEach(({ source, filename }) => new vm.Script(source, { filename }).runInContext(ctx));
function run(code){ return new vm.Script(code).runInContext(ctx); }

/* standart 32×16 apartman (snapshot senaryosu) → cephe pencereleri + iç kapılar üretilir */
run(`
  document.getElementById('binaTipi').value='apartman';
  unitSpecs=[{oda:2,salon:1,ensuite:true,acik:false,adet:2},{oda:1,salon:1,ensuite:false,acik:true,adet:2}];
  pts=[{x:0,y:0},{x:32,y:0},{x:32,y:16},{x:0,y:16}]; closed=true;
  generate();
  __MAP = buildFloorplanMap();
  __ROWS = window.View3D.furnishMapForTest(__MAP);
`);

const nWin = run(`(__MAP.windows||[]).length`);
const nDoor = run(`(__MAP.doors||[]).length`);
const nFurn = run(`__ROWS.reduce(function(s,r){return s+r.furniture.length;},0)`);
ok(nWin > 0, 'senaryo pencere üretmeli (>0), üretilen: ' + nWin);
ok(nDoor > 0, 'senaryo kapı üretmeli (>0), üretilen: ' + nDoor);
ok(nFurn > 0, 'oto-döşe mobilya üretmeli (>0), üretilen: ' + nFurn);

/* --- clearance denetimi: her oda için edge analizi (doorSpans/winSpans) + yerleşen mobilya footprintleri --- */
// footprint'in bir kenardaki [t-aralığı, min-perp] izdüşümü
run(`
  __projFp = function(fp, e){
    var tMin=1e9,tMax=-1e9,perpMin=1e9;
    for(var k=0;k<fp.length;k++){ var dx=fp[k][0]-e.a[0], dz=fp[k][1]-e.a[1];
      var t=dx*e.dir[0]+dz*e.dir[1], perp=Math.abs(dx*(-e.dir[1])+dz*e.dir[0]);
      if(t<tMin)tMin=t; if(t>tMax)tMax=t; if(perp<perpMin)perpMin=perp; }
    return {tMin:tMin,tMax:tMax,perpMin:perpMin};
  };
`);

// W2/J2: kapı geçiş koridoru derinliği (furnDoorBlocked ile aynı eşikler; J2'de 0.90→1.20)
const DOOR_PASS_DEPTH = 1.20, DOOR_CLR = 0.35;
// W3: yüksek mobilya eşiği + pencere-önü derinliği (furnWindowBlocked ile aynı)
const WIN_TALL_H = 1.10, WIN_PERP = 0.45;

const audit = run(`(function(){
  var doorViol=0, winViol=0, doorChk=0, winChk=0, tallSeen=0;
  __ROWS.forEach(function(row){
    var an = window.View3D.analyzeRoomForTest(row.room, __MAP);
    if(!an) return;
    row.furniture.forEach(function(f){
      if(f.__exempt) return;                 // halı/TV muaf
      var dim = window.View3D.furnDimForTest(f.type)||{h:0};
      var fp = f.__fp; if(!fp) return;
      var tall = dim.h > ${WIN_TALL_H};
      if(tall) tallSeen++;
      an.edges.forEach(function(e){
        var pr = __projFp(fp, e);
        // W2: kapı span'ı önü
        (e.doorSpans||[]).forEach(function(ds){
          doorChk++;
          if(pr.perpMin <= ${DOOR_PASS_DEPTH} && pr.tMax > ds[0]-${DOOR_CLR} && pr.tMin < ds[1]+${DOOR_CLR}) doorViol++;
        });
        // W3: pencere span'ı önü — yüksek mobilya HER pencerede, alçak yalnız tam-boy camda
        (e.winSpans||[]).forEach(function(ws){
          winChk++;
          var blockedKind = tall || ws[2];    // ws[2]=full
          if(blockedKind && pr.perpMin <= ${WIN_PERP} && pr.tMax > ws[0] && pr.tMin < ws[1]) winViol++;
        });
      });
    });
  });
  return { doorViol:doorViol, winViol:winViol, doorChk:doorChk, winChk:winChk, tallSeen:tallSeen };
})()`);

ok(audit.doorChk > 0, 'en az bir kapı-önü denetimi çalışmalı (doorChk>0)');
ok(audit.doorViol === 0, 'W2: hiçbir mobilya kapı geçiş koridorunu kapatmamalı (ihlal: ' + audit.doorViol + ')');
ok(audit.winChk > 0, 'en az bir pencere-önü denetimi çalışmalı (winChk>0)');
ok(audit.tallSeen > 0, 'senaryoda yüksek mobilya (gardırop/kitaplık) bulunmalı (tallSeen>0)');
ok(audit.winViol === 0, 'W3: yüksek mobilya (veya tam-boy önü alçak) pencere önünde olmamalı (ihlal: ' + audit.winViol + ')');

/* --- KORİDOR kuralı: "daracık koridora bir şey koyma; geniş yeri varsa koyarsın" ---
   Motor kaynağı burada devreye SOKULMAZ (senaryo bağımsız) — doğrudan sentetik oda poligonlarıyla
   furnishMapForTest'in kullandığı furnPlaceRoom dispatch'ini çağırırız (View3D.furnishMapForTest map alır). */
run(`
  __mkMap = function(poly_m, mpp){
    mpp = mpp || 0.02;
    var origin=[0,0];
    var poly_px = poly_m.map(function(p){ return [p[0]/mpp+origin[0], p[1]/mpp+origin[1]]; });
    return { scale:{ metersPerPixel:mpp, origin_px:origin }, doors:[], windows:[],
      units:[], common_areas:[ { id:'C-corridor', type:'KORİDOR', name:'KORİDOR', polygon_px:poly_px } ] };
  };
`);
// dar koridor: 1.10m genişlik × 6m uzunluk → console(d=0.37) sonrası kalan geçiş 0.73m < 0.90m eşiği → HİÇ mobilya olmamalı
const narrowN = run(`(function(){
  var map=__mkMap([[0,0],[6,0],[6,1.10],[0,1.10]]);
  var rows=window.View3D.furnishMapForTest(map);
  return rows[0].furniture.length;
})()`);
ok(narrowN === 0, 'dar koridor (1,10m): mobilya YOK beklenirdi (kalan geçiş<0,90m), üretilen: ' + narrowN);

// geniş koridor: 1.70m genişlik × 6m uzunluk → console sonrası kalan geçiş 1.33m ≥ 0.90m eşiği → yerleşmeli
const wideN = run(`(function(){
  var map=__mkMap([[0,0],[6,0],[6,1.70],[0,1.70]]);
  var rows=window.View3D.furnishMapForTest(map);
  return rows[0].furniture.length;
})()`);
ok(wideN > 0, 'geniş koridor (1,70m): en az 1 mobilya (konsol/bank) beklenirdi, üretilen: ' + wideN);

console.log('');
console.log('  kapı-önü denetim: ' + audit.doorChk + ' · ihlal ' + audit.doorViol);
console.log('  pencere-önü denetim: ' + audit.winChk + ' · yüksek-mobilya ' + audit.tallSeen + ' · ihlal ' + audit.winViol);
console.log('  koridor kuralı: dar(1,10m)→' + narrowN + ' mobilya · geniş(1,70m)→' + wideN + ' mobilya');
console.log(pass + ' geçti, ' + fail + ' kaldı.');
if(fail){ process.exitCode = 1; }
else console.log('SONUÇ: ✓ FURN-CLEARANCE (W2 kapı-önü + W3 pencere-önü + koridor-genişlik) tüm testleri GEÇTİ');
