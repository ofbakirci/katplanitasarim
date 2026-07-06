/* AKIŞ-2 K3/K4/K5 — BAKIŞ-YÖNÜ KÜRESİ + kamera önizleme + canvas pointer-capture (headless, THREE'siz).
   K3 yön küresi MATEMATİĞİ: drone (extCams salt-veri) + iç kamera (camList salt-veri) için yaw(delta)+pitch(abs)
   uygulanınca heading/pitch doğru okunur (küre iğnesi bunu gösterir). K4 önizleme durum bayrağı. K5 canvas
   sürükleme teşhis kancasının varlığı (gerçek capture semantiği preview'da kanıtlanır — sentetik taşımaz).
   MOTOR MANTIĞINI DEĞİŞTİRMEZ; yalnız View3D API'sini çağırır.

   Kullanım: node tests/yon-kuresi.js */
'use strict';
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
  requestAnimationFrame:fn=>fn&&fn(), setTimeout, clearTimeout, confirm:()=>true,
  navigator:{ userAgent:'node' }
});
scriptSources().forEach(({ source, filename }) => new vm.Script(source, { filename }).runInContext(ctx));
function run(code){ return new vm.Script(code).runInContext(ctx); }

/* API erişilebilir mi */
const hasApi = run(`!!(window.View3D && window.View3D.dirSphereForTest && window.View3D.setCameras
  && window.View3D.setExteriorCameras && window.View3D.camPreviewForTest && window.View3D.canvasDragStateForTest)`);
chk(hasApi, 'K3/K4/K5 API (dirSphereForTest + setCameras + camPreviewForTest + canvasDragStateForTest) erişilebilir');
if(!hasApi){ report(); process.exit(fail?1:0); }

/* ═══ K3: DRONE YÖN KÜRESİ MATEMATİĞİ (THREE'siz — extCams salt-veri) ═══════════════════════════════ */
// güneydoğuda bir drone, kuzeybatıdaki merkeze bakar
run(`window.View3D.setExteriorCameras([{pos:{x:30,y:14,z:30}, target:{x:0,y:2,z:0}, lens:24}]); window.View3D.extSelectForTest(0);`);
const d0 = run(`window.View3D.dirSphereForTest('drone', null)`);
chk(typeof d0.yaw==='number' && typeof d0.pitch==='number', 'K3 drone: başlangıç yaw/pitch okunuyor: yaw='+d0.yaw+' pitch='+d0.pitch);
chk(d0.pitchMin===-89 && d0.pitchMax===30, 'K3 drone: pitch aralığı -89..30 (drone aşağı bakabilir): '+d0.pitchMin+'..'+d0.pitchMax);

// YAW: +30° uygula → heading ~30° artar (dairesel), hedef mesafesi (yatay) korunur
const beforeYaw = run(`window.View3D.getExteriorCameras()[0]`);
const dYaw = run(`window.View3D.dirSphereForTest('drone', {yaw:30})`);
const afterYaw = run(`window.View3D.getExteriorCameras()[0]`);
function hd(y0,y1){ let dd=((y1-y0)%360+360)%360; if(dd>180) dd-=360; return dd; }
chk(Math.abs(hd(d0.yaw, dYaw.yaw)-30)<2, 'K3 drone: yaw(+30) heading\'i ~+30° döndürdü: '+d0.yaw+'→'+dYaw.yaw);
const distB = Math.hypot(beforeYaw.target.x-beforeYaw.pos.x, beforeYaw.target.z-beforeYaw.pos.z);
const distA = Math.hypot(afterYaw.target.x-afterYaw.pos.x, afterYaw.target.z-afterYaw.pos.z);
chk(Math.abs(distB-distA)<0.02, 'K3 drone: yaw yatay hedef mesafesini korur (yalnız yön döner): '+distB.toFixed(2)+'→'+distA.toFixed(2));

// PITCH: -60° (aşağı bak) uygula → pitch ~-60, target.y pos.y'nin ALTINA iner
const dPitch = run(`window.View3D.dirSphereForTest('drone', {pitch:-60})`);
chk(Math.abs(dPitch.pitch-(-60))<2, 'K3 drone: pitch(-60) uygulandı: '+dPitch.pitch);
const camDown = run(`window.View3D.getExteriorCameras()[0]`);
chk(camDown.target.y < camDown.pos.y, 'K3 drone: aşağı pitch → hedef y konum y\'sinin altında (aşağı bakış): '+camDown.target.y.toFixed(2)+'<'+camDown.pos.y.toFixed(2));
// pitch clamp: -200 istenirse -89'a clamp
const dClamp = run(`window.View3D.dirSphereForTest('drone', {pitch:-200})`);
chk(dClamp.pitch >= -89.5, 'K3 drone: aşırı pitch aralığa clamp (-200→-89): '+dClamp.pitch);
run(`window.View3D.clearExteriorCameras()`);

/* ═══ K3: İÇ KAMERA YÖN KÜRESİ MATEMATİĞİ (camList salt-veri; yawCam/setCamTilt) ════════════════════ */
run(`window.View3D.setCameras([{pos:{x:2,y:1.6,z:2}, target:{x:6,y:0.5,z:2}, lens:24, height:'eye'}]);`);
const c0 = run(`window.View3D.dirSphereForTest('cam', null)`);
chk(typeof c0.yaw==='number' && typeof c0.pitch==='number', 'K3 iç kamera: başlangıç yaw/pitch okunuyor: yaw='+c0.yaw+' pitch='+c0.pitch);
chk(c0.pitchMin===-85 && c0.pitchMax===85, 'K3 iç kamera: pitch aralığı -85..85: '+c0.pitchMin+'..'+c0.pitchMax);
const cYaw = run(`window.View3D.dirSphereForTest('cam', {yaw:45})`);
chk(Math.abs(hd(c0.yaw, cYaw.yaw)-45)<2, 'K3 iç kamera: yaw(+45) heading ~+45°: '+c0.yaw+'→'+cYaw.yaw);
const cPitch = run(`window.View3D.dirSphereForTest('cam', {pitch:20})`);
chk(Math.abs(cPitch.pitch-20)<2, 'K3 iç kamera: pitch(+20, yukarı) uygulandı: '+cPitch.pitch);
const camUp = run(`window.View3D.getCameras()[0]`);
chk(camUp.target.y > camUp.pos.y, 'K3 iç kamera: yukarı pitch → hedef y konum y\'sinin üstünde: '+camUp.target.y.toFixed(2)+'>'+camUp.pos.y.toFixed(2));
run(`window.View3D.clearCams()`);

/* ═══ K4: ADIM-2 KAMERA/DRONE ÖNİZLEME BAYRAĞI ═════════════════════════════════════════════════════ */
const p0 = run(`window.View3D.camPreviewForTest(false)`);
chk(p0.preview===false, 'K4: önizleme başlangıçta kapalı');
const p1 = run(`window.View3D.camPreviewForTest(true)`);
chk(p1.preview===true, 'K4: önizleme açılabilir (camPreviewMode=true)');
chk(p1.camUI===false, 'K4: önizleme camUIEnabled\'dan bağımsız (kamera adımı kapalıyken de görünür)');
run(`window.View3D.camPreviewForTest(false)`);

/* ═══ K5: CANVAS SÜRÜKLEME/CAPTURE TEŞHİS KANCASI ══════════════════════════════════════════════════ */
//   Gerçek pointer-capture semantiği (setPointerCapture/lostpointercapture) GERÇEK tarayıcı sürüklemesiyle
//   kanıtlanır (preview) — sentetik dispatchEvent capture taşımaz. Headless yalnız teşhis kancasının VARLIĞINI
//   + başlangıç durumunun TEMİZ (asılı drag/kilit yok) olduğunu assert eder.
const drag0 = run(`window.View3D.canvasDragStateForTest()`);
// attachPicker yalnız renderer kurulunca (open/preview) çalışır → headless'ta null olabilir; null=henüz kurulmadı (kabul)
chk(drag0===null || (drag0 && !drag0.extDrag && !drag0.camDrag && !drag0.furnDrag),
  'K5: canvas sürükleme durumu temiz (asılı drag yok) ya da henüz kurulmadı (headless): '+JSON.stringify(drag0));

function report(){
  console.log('\nYON-KURESI (K3+K4+K5): '+pass+' geçti, '+fail+' başarısız');
}
report();
process.exit(fail?1:0);
