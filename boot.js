'use strict';
/* ================= başlat ================= */
mountIcons();
renderUnits(); updateKatAyriUI(); renderBlockTabs(); render();
if(typeof initParselSorgu==='function') initParselSorgu();
positionOnb();
window.addEventListener('resize',()=>{ render(); positionOnb(); });
