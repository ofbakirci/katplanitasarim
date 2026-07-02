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
  avluMinKisa:1.5, avluIsikOran:0.25, // iç avlu: hava bacası asgari kısa kenar (m); ışık için önerilen ≥ bina yük. × oran
  bloklarArasiMin:6.0, // site: iki blok arası şematik asgari mesafe (m; imar/yangın durumuna göre değişir)
  katOturumOran:0.7, // katları ayrı planlanan villada her kat oturumu ≥ zeminin %70'i
  parkBayLen:5.0, parkBayWid:2.5, parkAisle:5.0, // dik (90°) park yeri 2,5×5 m + manevra yolu 5 m (Otopark Yön.)
  siginakMinM2:12.0, siginakKisiM2:1.0,
  /* Otopark Yönetmeliği (Ek-1, konut/mesken) — daire brüt alanına göre asgari otopark */
  otoparkBrutKats:1.25,       // şematik net daire alanı → brüt yaklaşığı
  otoparkKonut:[{max:80, oto:1/3}, {max:120, oto:1/2}, {max:180, oto:1}, {max:1e9, oto:2}],
  /* ── LAYOUT / ONARIM iç eşikleri (A2 konsolidasyon, 2026-07-02) ─────────────
     Yukarıdaki mevzuat sabitlerinden AYRI bölüm: bunlar yönetmelik değil, motorun
     elle-ayarlı karar eşikleri (planner.js/rooms.js'ten SAF TAŞIMA, değer birebir).
     Değer değiştirmek motor çıktısını değiştirir → tests/snapshot-regression.js
     birebir korunmalı; bilinçli ayar sonrası baseline `--write` ile tazelenir. */
  iter:{ // onarım/düzeltme döngülerinin guard limitleri (dolunca A3 console.warn iz bırakır)
    repairUnits:30,        // planner.js repairUnits: yasal-asgari oda onarım turu
    rectifyCorridor:24,    // planner.js rectifyCorridor: koridor israfını dairelere aktarma geçişi
    rectifyUnitBalance:24, // planner.js rectifyUnitBalance: daire alan dengeleme geçişi (CV hedefi)
    corridorEndDrain:8,    // planner.js rectifyCorridorEnds: ölü uç sütununu kaskad boşaltma turu
    slimAntre:240          // rooms.js slimUnitAntre: kalın antre hücre-devri emniyet sayacı
  },
  cap:{ /* oda üst-sınırı: cap = max(taban, daireAlanı×oran) — büyük dairede ıslak
           hacim/yatak ölçekli büyür, artan alan salona akar (v22 dersi). layoutUnit
           ve layoutVillaSofa (iki paralel blok) aynı tabloyu kullanır. */
    mutfak:{oran:0.085, taban:13},
    banyo:{oran:0.04, taban:6.5},
    yatak:{oran:0.12, taban:20},
    ebYatak:{oran:0.15, taban:26},
    wc:{oran:0.018, taban:2.6}  // ikinci tuvalet (3+ yatakta, ensuite yoksa)
  },
  layout:{ // layoutUnit karar eşikleri (alan m², derinlik m)
    kucukDaire:45,      // ≤45: mutfak dar kenarı yasal 1,5 m'e iner; >45: ıslak-hacimli giriş şeridi min 2,0 m derinlik
    buyukDaire:120,     // >120: boyut sınıfı — mutfak dar kenarı 2,5 m, yatak 3,0 m
    sigMaxAlan:140,     // sığ tek-yüklü T-plan (shallowU) üst alan sınırı
    ebBanyoBuyuk:140,   // >140: köşe eb-banyosu 5 m² (değilse 4) — sigMaxAlan'dan BAĞIMSIZ eşik, ayrı ayarlanabilir
    kilerMin:110,       // kiler yalnız 110 m²+ dairede (v20→v21: kullanıcı kileri silip eb. banyo koydu)
    kilerMinEns:130,    // ensuite İSTENEN dairede kiler eşiği 130 — program (eb. banyo) dururken lüks çizilmez
    sigDerinlik:9,      // derinlik ≤9 → sığ daire (shallowU: antre kompakt, alan odalara)
    railDerinlik:10.5,  // derinlik ≥10,5 → demiryolu planı (yataklar derinlikte katmanlanır)
    girisMinD:{oda:2.5, islak:2.0, taban:1.5}, // giriş şeridi asgari derinliği: yatak/merdiven itildiyse / ıslak-hacimli >45 m² / diğer
    govdeOran:0.45      // kulak algısı: gövde alanı < taban×0,45 → belirgin gövde yok, band düzeni
  }
};
/* ── Yangın / merdiven / asansör — çekirdek ölçü eşikleri ─────────────────────
   TEK DOĞRU KAYNAK: mesken/referans-kat-planlari/yangin-merdiven-kurallari.json
   (+ gerekçe/madde: YANGIN-MERDIVEN-ASANSOR-KURALLARI.md). `mesken/` .gitignore'da
   olduğundan KPTA kabuğu/Pages o JSON'u YÜKLEYEMEZ → motorun ölçebileceği alt küme
   burada (tracked core.js) aynalanır; checks.js collectCoreDim/HeightChecks tüketir.
   JSON güncellenirse bu blok da elle senkronlanmalı. Birim: metre / m².
   Madde: BYKHY = Binaların Yangından Korunması Yön., PAİY = Planlı Alanlar İmar Yön. */
const FIRE = {
  /* yapı/bina yüksekliği eşikleri (m) — sınıf seçimi (JSON yukseklik_esikleri_m) */
  heights:{ yuksek:21.5, cokYuksek:30.5, yuksekBlok:51.5 },
  merdiven:{
    /* U-dönüşlü konut merdiven kovası min ayak izi [dar, uzun] (m) — 1,20 m kol +
       sahanlık + dönüşten türetilmiş (JSON merdiven.kova_ayak_izi_tipik_m.min;
       PAİY M.40 + BYKHY M.41). Dar kenar HARD; alan SOFT eşik. */
    kovaMin:[2.4, 3.6],
    daireIciMin:1.00,   // daire içi merdiven kolu min (PAİY M.40)
    yuksekBinaKol:1.20  // yüksek binada (>21,5 m) kaçış merdiveni KOLU genişliği (BYKHY M.33(2)); REZERVE — checks.js henüz tüketmiyor: motor basamak/kol geometrisi üretmediği için bbox'tan kol genişliği ölçülemez (kova dar kenarı 2,4 m HARD eşiği zaten 1,20'yi kapsar)
  },
  asansor:{
    kuyuMin:[1.5, 1.7],      // yolcu asansörü kuyu kovası min [dar, uzun] (JSON kuyu_kovasi_tipik_m.min)
    kabinErisim:[1.10, 1.40] // erişilebilir kabin (EN 81-70, JSON kabin_erisilebilir_m)
  },
  guvenlikHolu:{
    alan:[3, 6], minBoyut:1.80,            // normal yangın güvenlik holü (BYKHY M.34(3))
    asansorAlan:[6, 10], asansorBoyut:2.0  // acil durum asansörü önü holü (BYKHY M.34(4))
  },
  acilAsansor:{ kabinMin:1.8 } // acil durum asansörü kabini min m² (BYKHY M.63(4))
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
/* ── AI boyama export için İngilizce etiketler (TYPE_TR ile birebir aynı anahtarlar) ── */
const TYPE_EN = {
  salon:'Living Room', yatak:'Bedroom', mutfak:'Kitchen', banyo:'Bathroom', wc:'WC',
  antre:'Entry', oda:'Room', koridor:'Corridor', merdiven:'Staircase',
  asansor:'Elevator', teknik:'Shaft', yangin:'Fire Escape Stair',
  otopark:'Parking', siginak:'Shelter', dukkan:'Shop', depo:'Storage'
};
/* reg.name (özel Türkçe ad) → İngilizce. Anahtarlar planner.js / rooms.js / io.js'teki
   GERÇEK Türkçe `name` stringleridir; kod tarandı, mevcut tüm adlar kapsanır. */
const NAME_EN = {
  'SALON + MUTFAK':'Living + Kitchen',   // açık (Amerikan) mutfak — tek bölge
  'SALON':'Living Room',
  'MUTFAK':'Kitchen',
  'OTURMA ODASI':'Living Room',
  'STÜDYO':'Studio',
  'YATAK ODASI':'Bedroom',
  'EB. YATAK ODASI':'Master Bedroom',
  'BANYO':'Bathroom',
  'EB. BANYO':'En-suite Bath',
  'WC':'WC',
  'ANTRE':'Entry',
  'KİLER':'Pantry',
  'ÇALIŞMA ODASI':'Study',
  'APARTMAN HOLÜ':'Corridor',
  'MERDİVEN':'Staircase',
  'ASANSÖR':'Elevator',
  'ASANSÖR YERİ':'Elevator',
  'TEKNİK / ŞAFT':'Shaft',
  'ŞAFT':'Shaft',
  'YANGIN MERD.':'Fire Escape Stair',
  'ORTAK DEPO':'Common Storage',
  'DEPO':'Storage',
  'OTOPARK':'Parking',
  'SIĞINAK':'Shelter',
  'DÜKKAN':'Shop',
  'ODA':'Room'
};
/* Tek kaynak etiket çözümleyici: önce özel ada, yoksa type'a düşer; eşleşmezse
   orijinal ad döner (asla yanlış İngilizce etiket üretmez). DÜKKAN sondaki ekle
   gelebildiği için startsWith ile de denenir. */
function regLabelEN(reg){
  const nm=(reg.name||'').trim();
  if(NAME_EN[nm]) return NAME_EN[nm];
  for(const k in NAME_EN) if(nm.startsWith(k)) return NAME_EN[k];
  return TYPE_EN[reg.type] || (nm || 'Room');
}

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
