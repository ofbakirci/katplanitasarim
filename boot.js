'use strict';
/* ================= başlat ================= */
mountIcons();
renderUnits(); updateKatAyriUI(); renderBlockTabs(); render();
positionOnb();
window.addEventListener('resize',()=>{ render(); positionOnb(); });
