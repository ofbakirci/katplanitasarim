'use strict';
/* ================= ikon seti =================
   Hafif, bağımlılıksız inline SVG ikonlar (Lucide tabanlı, MIT). Emoji yerine
   kullanılır: tek renk (stroke=currentColor), 24×24 ızgara, buton metnine göre
   ölçeklenir (1em). İki yol:
   1) icon(name[, extra])  -> JS ile üretilen yerlerde SVG dizesi döndürür.
   2) data-ic="name"       -> statik HTML öğelerine mountIcons() ikonu enjekte eder.
   Renk/boyut CSS'ten (svg.ic) gelir; aktif/hover durumunda currentColor değişir. */
const ICON_PATHS = {
  /* araç çubuğu */
  menu:      '<line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/>',
  draw:      '<path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/><path d="m15 5 4 4"/>',
  parcel:    '<path d="M10.83 2.38a2 2 0 0 1 2.34 0l8 5.74a2 2 0 0 1 .73 2.25l-3.04 9.26a2 2 0 0 1-1.9 1.37H7.04a2 2 0 0 1-1.9-1.37L2.1 10.37a2 2 0 0 1 .73-2.25z"/>',
  balcony:   '<path d="M3 9h18"/><path d="M3 20h18"/><path d="M5 9v11"/><path d="M9 9v11"/><path d="M15 9v11"/><path d="M19 9v11"/>',
  door:      '<path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14"/><path d="M2 20h20"/><path d="M14 12v.01"/>',
  structure: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
  parking:   '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>',
  avlu:      '<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="9" y="9" width="6" height="6"/>',
  blok:      '<rect x="3" y="9" width="7" height="12" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/><path d="M6 13h1"/><path d="M6 17h1"/><path d="M17 7h1"/><path d="M17 11h1"/><path d="M17 15h1"/>',
  pan:       '<path d="M12 2v20"/><path d="m15 5-3-3-3 3"/><path d="m15 19-3 3-3-3"/><path d="M2 12h20"/><path d="m5 9-3 3 3 3"/><path d="m19 9 3 3-3 3"/>',
  undo:      '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11"/>',
  redo:      '<path d="M15 14 20 9l-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0-5.5 5.5 5.5 5.5 0 0 0 5.5 5.5H13"/>',
  history:   '<path d="M3 12a9 9 0 1 0 3-7.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  clear:     '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  fit:       '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  sample:    '<rect width="20" height="12" x="2" y="6" rx="2"/>',
  reset:     '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  copy:      '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  /* yardımcılar / durum */
  bulb:      '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  check:     '<path d="M20 6 9 17l-5-5"/>',
  cross:     '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  info:      '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  /* kat kullanım tipleri */
  konut:     '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  ticari:    '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M2 7h20"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/>',
  otopark:   '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>',
  siginak:   '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>'
};
/* SVG dizesi: extra = ek sınıf (ör. 'inl' satır içi metin ikonları için) */
function icon(name, extra){
  const p = ICON_PATHS[name];
  if(!p) return '';
  return '<svg class="ic'+(extra?' '+extra:'')+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
       + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>';
}
/* data-ic taşıyan statik öğelere ikonu (metnin önüne) bir kez enjekte et */
function mountIcons(root){
  const scope = root || (typeof document!=='undefined' ? document : null);
  if(!scope || typeof scope.querySelectorAll!=='function') return; // tarayıcı dışı (test) ortamı: atla
  scope.querySelectorAll('[data-ic]').forEach(function(elm){
    if(elm.dataset && elm.dataset.icMounted) return;
    const svg = icon(elm.dataset.ic);
    if(!svg) return;
    elm.insertAdjacentHTML('afterbegin', svg);
    elm.dataset.icMounted = '1';
  });
}
