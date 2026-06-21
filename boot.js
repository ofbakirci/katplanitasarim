'use strict';
/* ================= başlat ================= */
mountIcons();
renderUnits(); updateKatAyriUI(); render();
positionOnb();
window.addEventListener('resize',()=>{ render(); positionOnb(); });
