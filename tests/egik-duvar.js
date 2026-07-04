/* EĞİK DIŞ DUVAR — ara-dönem mitigasyonları (E1 + E3).
   90°'ye kilitli OLMAYAN (eğik) dış duvarlı planlarda üç kullanıcı-raporlu sorunun regresyonu.

   E1 SAHTE "koridor 1 m" UYARISI: kat-plani-54 = kat-52 ile AYNI eğik 4-köşe taban (sol dış
     duvar 0,4 m eğik). Koridorun UÇ sütunu (c0) eğik cephe basamağı bir hücreyi tıraşladığı
     için 2 hücreye (1 m) düşüyor ama işlevsel en tüm boyunca 1,5 m. corridorMinWidth'e
     `inside`,`rows` verilince ince ucu bina DIŞINA dayanan hizalar (cephe-tıraşı) minimum
     hesabından atlanır → gerçek 1,5 m ölçülür; `inside` YOKSA eski ham ölçüm (1 m) BİREBİR
     korunur (sentetik bant birim testleri değişmez). İÇ boğum (her iki uç iç bölge) AYNEN
     yakalanır.
   E3 HAYALET BALKON: balkon silme eskiden yalnız mode==='balkon' sağ-tık dalındaydı → mod
     değişince silinemeyen "hayalet balkon" kalıyordu. Artık BAŞKA moddayken de balkona sağ tık
     "Balkonu sil" menüsü verir (avlu deseni) + balkon modunda Del/Backspace emniyet ağı.
     Balkon geometrisi eğik kenarda DEJENERE DEĞİL (dörtgen sağlam) — burada onu doğrularız. */
'use strict';
const vm = require('vm');
const { scriptSources } = require('./support/app-js');
const { installDom } = require('./support/dom-stub');

let fails = 0;
const F = m => { fails++; console.log('  [FAIL]', m); };

function freshCtx(opts){
  const dom = installDom(Object.assign({ binaTipi:'apartman', katSayisi:5, katYuk:2.9 }, opts||{}));
  const ctx = vm.createContext({
    console, matchMedia:()=>({matches:false}), document:dom.document,
    window:{ addEventListener(){}, matchMedia:()=>({matches:false}) },
    XMLSerializer:function(){ this.serializeToString=()=>''; },
    Image:function(){}, Blob:function(){}, URL:{ createObjectURL:()=>'', revokeObjectURL(){} },
    localStorage:{ getItem(){return null;}, setItem(){} },
    requestAnimationFrame:fn=>fn&&fn(), setTimeout, clearTimeout, navigator:{ userAgent:'node' }
  });
  scriptSources().forEach(({ source, filename }) => { new vm.Script(source, { filename }).runInContext(ctx); });
  return ctx;
}

console.log('--- Eğik dış duvar mitigasyonları (E1 + E3) ---');

/* 1) corridorMinWidth GERİYE UYUM: inside verilmezse eski ham ölçüm BİREBİR (birim bant). */
{
  const ctx = freshCtx();
  ctx.__W = {};
  new vm.Script(`
    const cols=10;
    const band=[];   for(let r=0;r<3;r++)for(let c=0;c<10;c++) band.push(r*cols+c);
    const pinch=[];  for(let r=0;r<3;r++)for(let c=0;c<10;c++){ if(c===5&&r===2)continue; pinch.push(r*cols+c);}
    __W.band  = corridorMinWidth({cells:band},  cols);
    __W.pinch = corridorMinWidth({cells:pinch}, cols);   // inside YOK → 1,0 m (ham)
  `, { filename:'unit.js' }).runInContext(ctx);
  if (Math.abs(ctx.__W.band  - 1.5) > 1e-9) F('inside-siz temiz bant 1,5 m olmalı, oldu ' + ctx.__W.band);
  if (Math.abs(ctx.__W.pinch - 1.0) > 1e-9) F('inside-siz sentetik boğum 1,0 m olmalı (ham korunmalı), oldu ' + ctx.__W.pinch);
}

/* 2) corridorMinWidth EĞİK-FARKINDA: cephe-tıraşı ucu (dışa dayanan) ATLANIR; iç boğum SAYILIR. */
{
  const ctx = freshCtx();
  ctx.__W = {};
  new vm.Script(`
    const cols=12, rows=6;
    const inside=new Uint8Array(rows*cols).fill(1);
    // temiz 3-hücre (1,5 m) yatay bant rows 2-4, c1..c10; UÇ sütunu c1'de alt hücre (r4) DIŞ (cephe basamağı)
    const band=[]; for(let r=2;r<=4;r++)for(let c=1;c<=10;c++) band.push(r*cols+c);
    // c1'in alt ucunu (r4,c1) koridordan çıkar + o hücreyi DIŞ yap (eğik cephe tıraşı):
    const cut = 4*cols+1; const band2 = band.filter(i=>i!==cut); inside[cut]=0;
    __W.facadeRaw   = corridorMinWidth({cells:band2}, cols);                 // ham: 2 hücre → 1,0 m
    __W.facadeAware = corridorMinWidth({cells:band2}, cols, inside, rows);   // farkında: cephe ucu atlanır → 1,5 m

    // GERÇEK İÇ boğum: c5'te alt hücre (r4,c5) koridordan çıkar AMA o hücre İÇERİDE (başka oda) → boğum SAYILIR
    const inside2=new Uint8Array(rows*cols).fill(1);
    const band3 = band.filter(i=>i!==(4*cols+5));                            // r4,c5 koridor değil ama inside=1
    __W.interiorAware = corridorMinWidth({cells:band3}, cols, inside2, rows); // iç boğum → 1,0 m (yakalanır)
  `, { filename:'aware.js' }).runInContext(ctx);
  if (Math.abs(ctx.__W.facadeRaw   - 1.0) > 1e-9) F('cephe-tıraşı ham ölçüm 1,0 m olmalı, oldu ' + ctx.__W.facadeRaw);
  if (Math.abs(ctx.__W.facadeAware - 1.5) > 1e-9) F('cephe-tıraşı EĞİK-FARKINDA 1,5 m olmalı (sahte boğum atlanır), oldu ' + ctx.__W.facadeAware);
  if (Math.abs(ctx.__W.interiorAware - 1.0) > 1e-9) F('GERÇEK iç boğum farkındayken de yakalanmalı (1,0 m), oldu ' + ctx.__W.interiorAware);
}

/* 3) MOTOR uçtan uca (kat-52/54 tabanı): runChecks koridor satırı artık "ok" (SAHTE bad gitti). */
{
  const ctx = freshCtx();
  ctx.__PTS=[{x:-8.048,y:4},{x:9.449,y:4},{x:9.049,y:-4},{x:-8.448,y:-4}];
  ctx.__SPECS=[{oda:1,salon:1,ensuite:false,acik:false,adet:2}];
  new vm.Script(`
    pts=__PTS; closed=true; unitSpecs=__SPECS.map(s=>({...s}));
    customCutsZ=null; unitLayout={}; balconies=[]; doorOverrides={}; extraDoors=[]; doorHidden=[]; editHistory=[];
    if(typeof villaFloors!=='undefined') villaFloors=null; if(typeof activeFloor!=='undefined') activeFloor=0;
    generate(true);
    const kor=plan.regions.find(g=>g.type==='koridor'&&g.cells.length);
    __M={ aware: corridorMinWidth(kor, plan.cols, plan.inside, plan.rows),
          raw:   corridorMinWidth(kor, plan.cols) };
    const chk=runChecks()||[];
    __M.corLine = chk.filter(c=>/en dar/.test(c.t)).map(c=>c.s)[0]||null;
    __M.corBad  = chk.some(c=>c.s==='bad' && /koridor daral/.test(c.t));
  `, { filename:'motor.js' }).runInContext(ctx);
  const M = ctx.__M;
  if (Math.abs(M.aware - 1.5) > 1e-9) F('motor koridor eğik-farkında en dar 1,5 m olmalı, oldu ' + M.aware);
  if (Math.abs(M.raw - 1.0) > 1e-9)   F('motor koridor HAM ölçüm hâlâ 1,0 m (cephe-tıraşı) olmalı, oldu ' + M.raw);
  if (M.corLine !== 'ok')             F("koridor denetim satırı 'ok' olmalı (SAHTE bad gitti), oldu " + M.corLine);
  if (M.corBad)                       F('koridor "daralmış" SAHTE bad hâlâ var — eğik-farkındalık checks.js\'e inmedi');
  console.log('  motor koridor: en dar (farkında)=' + M.aware + ' m, ham=' + M.raw + ' m, denetim=' + M.corLine);
}

/* 4) E3: eğik dış kenarda (ei=3, sol duvar) balkon geometrisi DEJENERE DEĞİL (dörtgen alanı > 0). */
{
  const ctx = freshCtx();
  ctx.__PTS=[{x:-8.048,y:4},{x:9.449,y:4},{x:9.049,y:-4},{x:-8.448,y:-4}];
  new vm.Script(`
    pts=__PTS; closed=true;
    // eğik sol kenar ei=3: (-8.448,-4)->(-8.048,4). ghostBalk ile balkon üret.
    const nb=ghostBalk(-8.6, 0);
    __B = nb ? { ei:nb.ei, area:(nb.t1-nb.t0)*nb.depth, span:(nb.t1-nb.t0), depth:nb.depth } : null;
    if(nb){ balconies=[nb]; __B.quadOk = (function(){ const q=balkQuad(nb);
      // dörtgen 4 farklı köşe + pozitif alan (shoelace)
      let a=0; for(let i=0;i<q.length;i++){ const j=(i+1)%q.length; a+=q[i].x*q[j].y-q[j].x*q[i].y; }
      return Math.abs(a/2); })(); }
  `, { filename:'balk.js' }).runInContext(ctx);
  const B = ctx.__B;
  if (!B)                       F('eğik sol kenara ghostBalk balkon ÜRETMEDİ (kenar teması bulunamadı)');
  else {
    if (B.ei !== 3)             F('balkon eğik sol kenara (ei=3) oturmalı, oldu ei=' + B.ei);
    if (!(B.area > 0.5))        F('eğik kenar balkonu dejenere (alan ' + B.area + ' m², >0,5 beklenir)');
    if (!(B.quadOk > 0.5))      F('balkon dörtgeni dejenere (shoelace alanı ' + B.quadOk + ')');
    console.log('  eğik-kenar balkon: ei=' + B.ei + ' span=' + B.span + ' m depth=' + B.depth + ' m alan=' + B.area + ' m² (dörtgen OK)');
  }
}

console.log(fails ? '' : '  ✓ TÜM DENETİMLER GEÇTİ');
if (fails) { console.log('FAIL: ' + fails); process.exit(1); }
