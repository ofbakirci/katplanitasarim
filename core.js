'use strict';
/* ================= sabitler / mevzuat ================= */
const M = 0.5; // ızgara (m)
/* dokunmatik ekranda tutamaç/kapı/duvar yakalama yarıçapı büyür (matchMedia testlerde yok → 1) */
const HITSC = (typeof matchMedia==='function' && matchMedia('(pointer: coarse)').matches) ? 1.8 : 1;
const REG = {
  salon:{area:12.0, side:3.0}, yatak:{area:9.0, side:2.5},
  mutfak:{area:3.3, side:1.5}, salonMutfak:{area:15.3, side:3.0},
  banyo:{area:3.0, side:1.5}, wc:{area:1.2, side:1.0},
  koridorMin:1.20, merdivenMin:1.20,
  asansorYeriKat:3, asansorKat:4, ikiAsansorKat:11,
  yanginYukseklik:21.5, kacisMesafe:30, siginakDaire:8, teknikOdaDaire:6,
  cikmaMax:1.5, balkonMinD:1.2, taksMax:0.4, yanBahce:3.0,
  katOturumOran:0.7, // katları ayrı planlanan villada her kat oturumu ≥ zeminin %70'i
  parkBayLen:5.0, parkBayWid:2.5, parkAisle:5.0, // dik (90°) park yeri 2,5×5 m + manevra yolu 5 m (Otopark Yön.)
  siginakMinM2:12.0, siginakKisiM2:1.0,
  /* Otopark Yönetmeliği (Ek-1, konut/mesken) — daire brüt alanına göre asgari otopark */
  otoparkBrutKats:1.25,       // şematik net daire alanı → brüt yaklaşığı
  otoparkKonut:[{max:80, oto:1/3}, {max:120, oto:1/2}, {max:180, oto:1}, {max:1e9, oto:2}]
};
const COLORS = {
  salon:'#ffe7c2', yatak:'#d8e8f7', mutfak:'#ffd9cc', banyo:'#d4eee5', wc:'#d4eee5',
  antre:'#f1ecdf', oda:'#e9e3f3', koridor:'#ece4d2', merdiven:'#fdf0b0', asansor:'#e6d9f6',
  teknik:'#dededa', yangin:'#f7cfc9',
  otopark:'#d9e2ea', siginak:'#f4d6a8', dukkan:'#ffd6e7', depo:'#e6e1d6'
};
const TYPE_TR = {salon:'Salon', yatak:'Yatak odası', mutfak:'Mutfak', banyo:'Banyo', wc:'WC',
  antre:'Antre', oda:'Oda (nötr)', koridor:'Ortak hol', merdiven:'Merdiven', asansor:'Asansör', teknik:'Teknik/Şaft', yangin:'Yangın merd.',
  otopark:'Otopark', siginak:'Sığınak', dukkan:'Dükkan (ticari)', depo:'Depo'};

/* ================= ortak yardımcılar ================= */
const fmt = v => (Math.round(v*100)/100).toLocaleString('tr-TR');
const escapeHtml = s => String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function snapG(v){ return Math.round(v/M)*M; }
function shoelace(p){ let a=0; for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length]; a+=p[i].x*q.y-q.x*p[i].y;} return Math.abs(a)/2; }
function perim(p){ let s=0; for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length]; s+=Math.hypot(q.x-p[i].x,q.y-p[i].y);} return s; }
function bboxOf(p){ let a={minX:1e9,minY:1e9,maxX:-1e9,maxY:-1e9}; p.forEach(q=>{a.minX=Math.min(a.minX,q.x);a.minY=Math.min(a.minY,q.y);a.maxX=Math.max(a.maxX,q.x);a.maxY=Math.max(a.maxY,q.y);}); return a; }
function pip(x,y,poly){ let c=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){ const a=poly[i],b=poly[j];
  if(((a.y>y)!=(b.y>y)) && (x < (b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)) c=!c; } return c; }
function centroidOf(p){ const bb=bboxOf(p); return {x:(bb.minX+bb.maxX)/2, y:(bb.minY+bb.maxY)/2}; }
