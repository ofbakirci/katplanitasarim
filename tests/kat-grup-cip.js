/* KAT-GRUP-CIP (İş 2) — 3B kat çipi grup birleştirme: headless sınıflama testi (THREE'siz).
   View3D.floorGroupsForTest() floorChipsForTest() çıktısını floorLayoutSig eşitliği üzerinden
   YALNIZ ARDIŞIK katlarda tek gruba indirger — "aynı düzenli kat" (tip kat) tek çipte, tık hâlâ
   grubun İLK katına (switchFloor) gider (renderFloorChips değişmedi, yalnız veri kaynağı değişti).
   Kapsam:
     (i)  iki ARDIŞIK katı (aynı imza) klonla eşitle → tek grupta birleşirler (idxs.length>=2)
     (ii) bir sonraki kat farklılaştırılır (farklı imza) → AYRI grup
     (iii) ziyaret edilmemiş kat (plan yok → sig=null) → hiçbir komşusuyla gruplanmaz (tek başına)

   Çalıştır: node tests/kat-grup-cip.js */
'use strict';
const vm = require('vm');
const { scriptSources } = require('./support/app-js');
const { installDom } = require('./support/dom-stub');

let pass = 0, fail = 0;
function ok(){ pass++; }
function bad(m){ fail++; console.error('  ✗ ' + m); }
function chk(c, m){ if(c) ok(); else bad(m); }

const dom = installDom({ binaTipi:'apartman', katSayisi:4, katYuk:2.9 });
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
  console.log('\nKAT-GRUP-CIP (İş 2): ' + pass + ' geçti, ' + fail + ' başarısız');
}

const hasApi = run(`!!(window.View3D && window.View3D.floorGroupsForTest)`);
chk(hasApi, 'View3D.floorGroupsForTest erişilebilir');
if(!hasApi){ report(); process.exit(fail?1:0); }
const hasSig = run(`typeof floorLayoutSig==='function'`);
chk(hasSig, 'floorLayoutSig(k) app.js\'te tanımlı');
if(!hasSig){ report(); process.exit(fail?1:0); }

/* ---- kurulum: 4 katlı apartman (bodrumsuz), katları ayrı planla açık, zemin canlı üretildi ---- */
run(`
  document.getElementById('binaTipi').value='apartman';
  document.getElementById('katSayisi').value='4';
  document.getElementById('bodrumSayisi').value='0';
  bodrumSayisi=0; villaOffset=0;
  pts=[{x:0,y:0},{x:16,y:0},{x:16,y:12},{x:0,y:12}]; closed=true;
  unitSpecs=[{oda:2,salon:1,ensuite:false,acik:false,adet:2}];
  generate();
  document.getElementById('katAyri').checked=true;
  katKullanim='konut';
  villaFloors=new Array(totalFloors()).fill(null);
  activeFloor=zeminIdx();
  villaFloors[activeFloor]=stateSnapshot(true);
`);

const totalFloorsN = run(`totalFloors()`);
chk(totalFloorsN===4, 'kurulum: totalFloors()===4 (bekleniyordu): '+totalFloorsN);

/* idx0 = zemin (canlı/aktif); idx1 = zeminin BİREBİR klonu (aynı imza) → 0 ile GRUPLANMALI
   idx2 = klon ama doors farklılaştırılmış (farklı imza) → AYRI grup
   idx3 = ziyaret edilmemiş (null) → sig=null, hiçbir komşusuyla gruplanmaz */
run(`
  villaFloors[1]=JSON.parse(JSON.stringify(villaFloors[0]));
  villaFloors[2]=JSON.parse(JSON.stringify(villaFloors[0]));
  villaFloors[2].doors={ ov:{ '__kat-grup-cip-test':{h:true,x:0,y:0} }, extra:[], hidden:{} };
  villaFloors[3]=null;
`);

/* imza doğrulaması: sig(0)===sig(1) !== sig(2); sig(3)===null */
const sigs = run(`[floorLayoutSig(0),floorLayoutSig(1),floorLayoutSig(2),floorLayoutSig(3)]`);
chk(sigs[0]!=null && sigs[1]!=null && sigs[2]!=null, 'kurulum: idx0/1/2 sig!=null: '+JSON.stringify(sigs.map(function(s){return s==null?null:'sig';})));
chk(sigs[0]===sigs[1], 'kurulum: sig(0)===sig(1) (klon, aynı düzen)');
chk(sigs[0]!==sigs[2], 'kurulum: sig(0)!==sig(2) (doors farklılaştırıldı)');
chk(sigs[3]===null, 'kurulum: sig(3)===null (ziyaret edilmemiş, plan yok)');

/* ---- floorGroupsForTest: yapı doğrulaması ---- */
const groups = run(`window.View3D.floorGroupsForTest()`);
chk(Array.isArray(groups), 'floorGroupsForTest() dizi döner');

const totalIdxCovered = groups.reduce(function(s,g){ return s+g.idxs.length; }, 0);
chk(totalIdxCovered===totalFloorsN, 'grupların idxs toplamı totalFloors() ile eşleşir (hiçbir kat kaybolmadı/çoğalmadı): '+totalIdxCovered+' vs '+totalFloorsN);

chk(groups.length===3, 'beklenen 3 grup ([0,1] · [2] · [3]) — bulunan: '+groups.length+' → '+JSON.stringify(groups.map(function(g){return g.idxs;})));

const g01 = groups.find(function(g){ return g.idxs.indexOf(0)>=0; });
chk(!!g01 && g01.idxs.length===2 && g01.idxs[0]===0 && g01.idxs[1]===1,
  '(i) idx0+idx1 (aynı imza, ARDIŞIK) TEK grupta birleşti: '+JSON.stringify(g01&&g01.idxs));
chk(!!g01 && g01.enabled===true, '(i) birleşen grup enabled:true (konut)');
chk(!!g01 && g01.label===run(`floorName(0)`)+' – '+run(`floorName(1)`),
  '(i) grup etiketi floorName(ilk)+" – "+floorName(son): '+(g01&&g01.label));

const g2 = groups.find(function(g){ return g.idxs.indexOf(2)>=0; });
chk(!!g2 && g2.idxs.length===1 && g2.idxs[0]===2,
  '(ii) idx2 (farklı imza) AYRI grupta (tek başına): '+JSON.stringify(g2&&g2.idxs));
chk(!!g2 && g2.label===run(`floorName(2)`), '(ii) tek-kat grup etiketi = floorName(idx): '+(g2&&g2.label));

const g3 = groups.find(function(g){ return g.idxs.indexOf(3)>=0; });
chk(!!g3 && g3.idxs.length===1 && g3.idxs[0]===3,
  '(iii) idx3 (ziyaret edilmemiş, sig=null) hiçbir komşusuyla gruplanmadı: '+JSON.stringify(g3&&g3.idxs));
chk(!!g3 && g3.sig===null, '(iii) grup sig alanı null (ziyaret edilmemiş kat şeffaf taşınıyor)');

/* idxs her grupta ARTAN + ARDIŞIK olmalı (sözleşme) */
let monotoneOK=true;
groups.forEach(function(g){
  for(let i=1;i<g.idxs.length;i++) if(g.idxs[i]!==g.idxs[i-1]+1) monotoneOK=false;
});
chk(monotoneOK, 'her grubun idxs\'i artan + ardışık (boşluksuz): '+JSON.stringify(groups.map(function(g){return g.idxs;})));

/* ---- renderFloorChips DOM: grup için TEK buton, data-floorchip = grubun İLK idx'i ---- */
run(`
  document.getElementById('binaTipi').value='apartman';
`);
const domCheck = run(`(function(){
  const ov=document.createElement('div');
  ov.innerHTML='<div id="v3dFloorChips"></div>';
  // renderFloorChips overlay.querySelector kullanıyor — View3D kapalı kapsamda; overlay referansını
  // doğrudan bulamayız (headless, sahne yok) → yalnız floorGroupsForTest'in DOM'a giden verisini
  // manuel olarak aynı mantıkla (renderFloorChips ile birebir) render edip doğrula.
  const groups=window.View3D.floorGroupsForTest();
  const cur=0;
  let html='';
  groups.forEach(function(g){
    const first=g.idxs[0], grouped=g.idxs.length>1, active=g.idxs.indexOf(cur)>=0;
    html+='<button data-floorchip="'+first+'" class="'+(g.enabled?(active?'on':''):'off')+'">'+g.label+'</button>';
  });
  return { html:html, buttonCount:(html.match(/<button/g)||[]).length, firstChip:groups[0].idxs[0] };
})()`);
chk(domCheck.buttonCount===3, 'DOM: 3 grup → 3 buton (idx1 idx0\'ın çipine gizlendi): '+domCheck.buttonCount);
chk(domCheck.html.indexOf('data-floorchip="0"')>=0, 'DOM: birleşen grubun data-floorchip\'i İLK kat indeksi (0)');
chk(domCheck.html.indexOf('data-floorchip="1"')<0, 'DOM: idx1 için AYRI buton YOK (0\'ın çipine gömülü)');
chk(domCheck.html.indexOf('data-floorchip="2"')>=0, 'DOM: idx2 kendi çipini korur');
chk(domCheck.html.indexOf('data-floorchip="3"')>=0, 'DOM: idx3 (ziyaret edilmemiş) kendi çipini korur');

report();
process.exit(fail?1:0);
