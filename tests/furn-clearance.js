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

/* --- F6 (SUNUM-2A): ETİKETLİ HOL/ANTRE de koridor kuralına uymalı ---
   Kök neden: roomKind ANTRE/HOL/APARTMAN HOLÜ → 'entry' döner (koridor DEĞİL) → furnishEntry eskiden
   koridor-payını HİÇ uygulamıyordu → daracık hole konsol/dolap konup FPV geçişi kesiliyordu. Sentetik
   'KORİDOR' case bunu kaçırdı (o zaten 'corridor'). Artık GERÇEK etiketli dar HOL da BOŞ kalmalı. */
run(`
  __mkNamed = function(poly_m, type, name, mpp){
    mpp = mpp || 0.02; var origin=[0,0];
    var poly_px = poly_m.map(function(p){ return [p[0]/mpp+origin[0], p[1]/mpp+origin[1]]; });
    return { scale:{ metersPerPixel:mpp, origin_px:origin }, doors:[], windows:[],
      units:[], common_areas:[ { id:'C-x', type:type, name:name, polygon_px:poly_px } ] };
  };
`);
// dar HOL (1,10m) — 'entry' kind ama artık koridor-bilinçli → mobilya YOK
const narrowHolN = run(`(function(){
  var map=__mkNamed([[0,0],[6,0],[6,1.10],[0,1.10]], 'HOL', 'HOL');
  return window.View3D.furnishMapForTest(map)[0].furniture.length;
})()`);
ok(narrowHolN === 0, 'dar HOL (1,10m, entry kind): mobilya YOK beklenirdi (F6 kaçağı), üretilen: ' + narrowHolN);
// dar ANTRE (1,10m) — aynı
const narrowAntreN = run(`(function(){
  var map=__mkNamed([[0,0],[6,0],[6,1.10],[0,1.10]], 'ANTRE', 'ANTRE');
  return window.View3D.furnishMapForTest(map)[0].furniture.length;
})()`);
ok(narrowAntreN === 0, 'dar ANTRE (1,10m): mobilya YOK beklenirdi, üretilen: ' + narrowAntreN);
// geniş HOL (1,90m) — geçiş payı kalır → konsol/dolap yerleşebilir
const wideHolN = run(`(function(){
  var map=__mkNamed([[0,0],[6,0],[6,1.90],[0,1.90]], 'HOL', 'HOL');
  return window.View3D.furnishMapForTest(map)[0].furniture.length;
})()`);
ok(wideHolN > 0, 'geniş HOL (1,90m): en az 1 mobilya beklenirdi (kural geniş girişi kapatmaz), üretilen: ' + wideHolN);

/* --- F5 (SUNUM-2A): küçük/ebeveyn banyoda DUŞ regresyonu ---
   Kök neden: INCE-3'te DOOR_PASS_DEPTH 0.90→1.20 → dar banyoda kapı-önü yasak bölgesi büyüdü, AMA asıl
   darboğaz PAKETLEME SIRASI: klozet+lavabo iki uzun duvarı kapıdan-uzak z-bandında tutunca en HANTAL parça
   (0.90×0.90 duş) için serbest 0.90m duvar koşusu kalmıyordu → duş HİÇ konmuyordu ("artık duş koymuyorsun").
   Fix (view3d furnishBath): küvet yoksa DUŞU ÖNCE yerleştir → hantal parça en iyi duvarı alır, klozet/lavabo
   kalan boşluğa esner. Kapı-önü GEVŞETİLMEZ (W2 temiz kalır). Gerçekçi küçük banyo: 1.7×2.2, kapı köşede. */
run(`
  __mkBath = function(poly_m, door_m, mpp){
    mpp = mpp || 0.02; var origin=[0,0];
    var px = function(p){ return [p[0]/mpp+origin[0], p[1]/mpp+origin[1]]; };
    var poly_px = poly_m.map(px);
    var doors = door_m ? [{ p0_px:px(door_m[0]), p1_px:px(door_m[1]) }] : [];
    return { scale:{ metersPerPixel:mpp, origin_px:origin }, doors:doors, windows:[],
      units:[ { id:'D1', rooms:[ { id:'D1-bath', type:'BANYO', name:'BANYO', polygon_px:poly_px } ] } ], common_areas:[] };
  };
`);
// 1.7 (x) × 2.2 (z) küçük banyo; kapı alt köşede (z=0, x 0.1..0.8) → karşı bölge duşa açık
const bathFurn = run(`(function(){
  var map=__mkBath([[0,0],[1.7,0],[1.7,2.2],[0,2.2]], [[0.1,0],[0.8,0]]);
  var rows=window.View3D.furnishMapForTest(map);
  var types=rows[0].furniture.map(function(f){ return f.type; });
  return { types:types, hasShower: types.indexOf('shower_tray')>=0, hasToilet: types.indexOf('toilet')>=0, hasBasin: types.indexOf('washbasin')>=0 };
})()`);
ok(bathFurn.hasShower, 'küçük banyo (1,7×2,2): DUŞ KABİNİ olmalı (F5 regresyon), tipler: ' + JSON.stringify(bathFurn.types));
ok(bathFurn.hasToilet, 'küçük banyo: klozet korunmalı (F5 mevcut davranış bozulmasın)');
ok(bathFurn.hasBasin, 'küçük banyo: lavabo korunmalı');
// duş kapı geçişini KAPATMAMALI (W2 pragmatiği: duş önce gelse de kapı-önü 1.20 korunur)
const bathDoorOK = run(`(function(){
  var map=__mkBath([[0,0],[1.7,0],[1.7,2.2],[0,2.2]], [[0.1,0],[0.8,0]]);
  var rows=window.View3D.furnishMapForTest(map);
  var an=window.View3D.analyzeRoomForTest(rows[0].room, map), viol=0;
  rows[0].furniture.forEach(function(f){ if(f.__exempt||!f.__fp) return;
    an.edges.forEach(function(e){ var tMin=1e9,tMax=-1e9,perpMin=1e9;
      f.__fp.forEach(function(p){ var dx=p[0]-e.a[0],dz=p[1]-e.a[1]; var t=dx*e.dir[0]+dz*e.dir[1], pp=Math.abs(dx*(-e.dir[1])+dz*e.dir[0]);
        if(t<tMin)tMin=t; if(t>tMax)tMax=t; if(pp<perpMin)perpMin=pp; });
      (e.doorSpans||[]).forEach(function(ds){ if(perpMin<=1.20 && tMax>ds[0]-0.35 && tMin<ds[1]+0.35) viol++; }); }); });
  return viol;
})()`);
ok(bathDoorOK === 0, 'küçük banyo: duş dahil hiçbir parça kapı geçişini kapatmamalı (W2), ihlal: ' + bathDoorOK);

console.log('');
console.log('  F6 etiketli hol/antre: darHOL→' + narrowHolN + ' · darANTRE→' + narrowAntreN + ' · genişHOL→' + wideHolN);
console.log('  F5 küçük banyo (1,7×2,2): ' + JSON.stringify(bathFurn.types) + ' · kapı-ihlal ' + bathDoorOK);
console.log('  kapı-önü denetim: ' + audit.doorChk + ' · ihlal ' + audit.doorViol);
console.log('  pencere-önü denetim: ' + audit.winChk + ' · yüksek-mobilya ' + audit.tallSeen + ' · ihlal ' + audit.winViol);
console.log('  koridor kuralı: dar(1,10m)→' + narrowN + ' mobilya · geniş(1,70m)→' + wideN + ' mobilya');
console.log(pass + ' geçti, ' + fail + ' kaldı.');
if(fail){ process.exitCode = 1; }
else console.log('SONUÇ: ✓ FURN-CLEARANCE (W2 kapı-önü + W3 pencere-önü + koridor-genişlik) tüm testleri GEÇTİ');
