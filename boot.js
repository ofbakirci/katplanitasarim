'use strict';
/* ================= başlat ================= */
mountIcons();
renderUnits(); updateKatAyriUI(); renderBlockTabs(); render();
if(typeof initParselSorgu==='function') initParselSorgu();
positionOnb();
window.addEventListener('resize',()=>{ render(); positionOnb(); });

/* ===== Görünüm modu: Basit (sade çizim+daire) / Profesyonel (parsel+imar dahil) =====
   .pro-only öğeleri Basit'te gizlenir (CSS). Seçim localStorage'da hatırlanır; varsayılan Basit. */
(function(){
  if(typeof document==='undefined' || !document.body) return;   // test/Node ortamı (DOM yok) → atla
  const KEY='ui.mode';
  let stored=null; try{ stored=localStorage.getItem(KEY); }catch(e){}
  let mode=(stored==='pro'||stored==='basic')?stored:'basic';
  function apply(m){
    mode=(m==='pro')?'pro':'basic';
    document.body.classList.toggle('mode-basic', mode==='basic');
    document.body.classList.toggle('mode-pro', mode==='pro');
    const b=document.getElementById('modeBasic'), p=document.getElementById('modePro');
    if(b) b.classList.toggle('active', mode==='basic');
    if(p) p.classList.toggle('active', mode==='pro');
    try{ localStorage.setItem(KEY, mode); }catch(e){}
  }
  const b=document.getElementById('modeBasic'), p=document.getElementById('modePro');
  if(b) b.addEventListener('click', ()=>apply('basic'));
  if(p) p.addEventListener('click', ()=>apply('pro'));
  apply(mode);
})();
