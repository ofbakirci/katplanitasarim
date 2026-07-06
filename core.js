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
  /* ── OTO-AVLU ÖNERİSİ (2026-07-06, avlu-rework) — additive; motor çıktısını DEĞİŞTİRMEZ ──
     Yalnız avlu MODUNDA + hiç avlu yokken nazik statusHint/öneri tetiklemek için ölçüler.
     "Karanlık" = bir iç hücrenin en yakın cepheye (dış kenar) manhattan mesafesi eşiği aşarsa.
     Öneri = otomatik dayatma DEĞİL: kullanıcı 'Öner' aksiyonuyla yerleştirir, sonra düzenler. */
  avluOneriDerinlik:7.0,   // en-derin iç hücrenin cepheye uzaklığı ≥ bu (m) → footprint karanlık merkezli
  avluOneriAlan:150,       // öneri yalnız ≥ bu taban alanında (m²; küçük tabanda avlu israf) anlamlı
  avluOneriKisa:3.0,       // önerilen aday avlunun kısa kenarı (m; avluMinKisa üstü, ışık-verimli)
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
    govdeOran:0.45,     // kulak algısı: gövde alanı < taban×0,45 → belirgin gövde yok, band düzeni
    kucukKatAlan:180    // K1: ≤2 daireli + taban ≤ bu (m²) → kompakt çekirdek+lobi (band koridor israfını kes); üstü/çok-daire eski band yolu
  },
  checks:{ /* ── checks.js panel-uyarı eşikleri (A7 konsolidasyon, 2026-07-03) ────────
       Mevzuat DEĞİL: denetim panelinin heuristik info/bad eşikleri (şişme, biçim
       doluluğu, ortalama-daire gerçekçiliği, villa merdiven hizası). checks.js'ten
       SAF TAŞIMA — değer birebir; tests/checks-metin.js korur. */
    sismeTaban:22, sismeSalon:13, sismeOda:23, sismeEnsuite:5, // daire "makul m²" hedefi (unitTag başına şişme sinyali)
    sismeFactor:1.4,          // daire alanı hedef×1.4'ü aşarsa "şişme" info
    salonPayTaban:45,         // salon-payı info alt eşiği (m²): Math.max(45, daire×oran)
    salonPayOran:0.5,         // salon dairenin bu oranını aşarsa "salona aktı" info
    bicimDoluluk:0.55,        // oda kapsayan dikdörtgeninin en az bu kadarını doldurmalı
    daireHedefTaban:30, daireHedefOda:15, daireHedefSalon:25, daireHedefEnsuite:6, // ortalama-daire gerçekçilik hedefi (targetOf)
    daireBuyukFactor:1.6,     // ortalama daire hedefin bu katını aşarsa "taban fazla" info
    merdivenHizaTol:0.26      // villa iç merdiven düşey hiza toleransı (m)
  },
  /* ── DUVAR KALINLIĞI (L1-A1, 2026-07-03) — tip bazlı, metre ───────────────────
     Ortogonal duvar GÖRSEL/EXPORT katmanı: duvar koşusu MERKEZ-çizgi kabul edilir,
     render ±t/2 dolu bant çizer. Hücre modeli / bölge alanları / layoutUnit / onarım
     zinciri DEĞİŞMEZ → tests/snapshot-regression.js birebir kalır (kalınlık yalnız
     çizim/export). Tip mevcut plandan türetilir (walls.js makeWallClassifier, doors.js
     doorWallType — computeWallRuns unit/FIXED/isExt konvansiyonuyla tek kaynak):
       dis        = bir yanı bina dışı (dış cephe)
       daireArasi = iki yanda farklı bağımsız bölüm ya da hol sınırı
       cekirdek   = bir yanı çekirdek (merdiven/asansör/yangın/teknik perde duvarı)
       icBolme    = aynı daire iç oda bölmesi
     Bu değerler MEVZUAT MİNİMUMU / VARSAYILAN — kullanıcı görsel duvar kalınlığını yalnız
     ARTIRABİLİR (bkz. wallThick + walls.js wallThickM: override min'in altına inemez). çekirdek
     UI'da açılmaz (yangın/yapı perde → hep min). Brüt alan (L1-A2) bu paylardan türetilecek. */
  duvar:{ dis:0.30, daireArasi:0.20, icBolme:0.10, cekirdek:0.25 },
  /* ── PENCERE (2026-07-04) — cephe penceresi ilk-sınıf nesne varsayılanları ─────
     Kapı sisteminin ikizi: cephe pencereleri otomatik üretilir (render.js FAZ3 =
     yaşam-odası komşulu dış kenar parçaları), windowOverrides/extraWindows/
     windowHidden ile taşı/sil/ekle. genişlik 2B'de görünür; H+parapet 3B'yi etkiler.
     tamBoy = parapet 0 + H = duvar (zemin-tavan cam). GÖRSEL/EXPORT katmanı: hücre
     modeli / bölge alanı / checks DOGAL_ISIK semantiği DEĞİŞMEZ. */
  pencere:{ wMin:1.0, wMax:1.8, wDef:1.4, h:1.4, sill:0.9, edgeMin:0.3 }
};
/* Kullanıcının duvar-kalınlığı override'ı (m) — tip başına. Boş/eksik ya da minimumun altı =
   REG.duvar minimumu kullanılır (walls.js wallThickM clamp'ler). Kayda girer (io.js stateSnapshot);
   eski kayıtta yoksa {} → hepsi minimum. UI: kat-plani-tasarim.html #wtSec (katlanır, non-intrusive). */
let wallThick = {};
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
/* Hücre dizisi alanı (m²) — TEK FORMÜL KAYNAĞI (A4 konsolidasyon, 2026-07-02).
   Izgara hücresi M×M = 0,5×0,5 = 0,25 m²; alan = hücre sayısı × M². Motorun ~40
   çağrı noktasında `cells.length*M*M` inline tekrarlıyordu; canlı bölge metriği
   (calcRegionMetrics → g.area) burada üretilir, keyfi/mutasyon-halindeki hücre
   dizileri de buradan geçer. Boş/tanımsız dizi → 0 (çağrı yerlerindeki eski
   `cells?cells.length:0` muhafızıyla birebir). SAF TAŞIMA: M sabit → değer değişmez. */
function areaOfCells(cells){ return (cells ? cells.length : 0) * M * M; }
/* ── A5: perf enstrümantasyon (opsiyonel, VARSAYILAN KAPALI) ─────────────────
   KPTA_PROFILE bayrağı açıkken generate() faz süreleri toplanır ve tek satırda
   basılır ([PERF] ...). KAPALIYKEN sıfır davranış/çıktı farkı garanti: PROF.wrap
   yalnız fn()'i döndürür, PROF.time/add erken çıkar → tests/snapshot-regression.js
   BİREBİR korunur. Ölçüm mantık yolunu değiştirmez, plan çıktısına dokunmaz.
   Kullanım (tarayıcı konsolu ya da test): KPTA_PROFILE=true; generate();
   performance globali headless Node'da olmayabilir → now() guard'lı (yoksa 0). */
let KPTA_PROFILE = false;
const PROF = {
  _t:{}, _order:[],
  now(){ return (typeof performance!=='undefined' && performance && performance.now) ? performance.now() : 0; },
  reset(){ this._t={}; this._order=[]; },
  add(label, ms){ if(!(label in this._t)){ this._t[label]=0; this._order.push(label); } this._t[label]+=ms; },
  /* fn() süresini label'a EKLER; bayrak kapalıysa doğrudan fn() (sıfır ek iş). */
  wrap(label, fn){ if(!KPTA_PROFILE) return fn(); const t=this.now(); const r=fn(); this.add(label, this.now()-t); return r; },
  report(tag){
    if(!KPTA_PROFILE) return;
    const parts=this._order.map(k=>`${k} ${this._t[k].toFixed(2)}ms`);
    const tot=this._order.reduce((a,k)=>a+this._t[k],0);
    console.log(`[PERF]${tag?' '+tag:''} toplam ${tot.toFixed(2)}ms | ${parts.join(' | ')}`);
  }
};
/* ── SELF-TRAINING VERİ MUSLUĞU (Paket D ön-adım, 2026-07-03) ─────────────────
   Karar (hafıza: self-training): motor render'a giden/indirilen planlardan kendini
   eğitebilir; KABUL = zayıf-pozitif tercih sinyali; DEBUG indirmesi HARİÇ. Amaç:
   ileride ML ranker için tercih verisi BUGÜNDEN birikmeye başlasın (ağ YOK, yerel).

   Kayıt biçimi: {t:<ISO>, ev:'accept', kind:'svg'|'png'|'dxf'|'render',
     edits:<editHistory özeti: {n, byType}>, spec:<unitSpecs kopyası>, state:<stateSnapshot()>}.
   Depo: localStorage 'kptaTrainLog' — RING BUFFER: en fazla MAX kayıt VE toplam
   ~SOFT_LIMIT bayt (yeni kayıt sığmıyorsa en eskiler düşer). Tek kayıt >BIG_ONE ise
   state'siz özet kaydedilir (dev plan durumu buffer'ı tek başına doldurmasın).
   localStorage YOKSA (headless/test) sessiz no-op — motor/testler etkilenmez.

   HANGİ İNDİRME "KABUL" SAYILIR (io.js kancaları):
     · SVG indir / PNG indir / DXF indir  → kullanıcı planı dışarı taşıdı = zayıf-pozitif
     · Mesken render köprüsü (mskExportRenderInputs) → plan 3B render'a gitti = zayıf-pozitif
   HANGİSİ DEBUG (KANCA YOK — karar):
     · AI-boyama / controlnet-edges / duvar-sınırı PNG (exportAIPaintPNG/EdgeMask/WallBoundary)
       = render HATTININ ARA ÇIKTILARI / tanı görselleri, nihai kullanıcı kabulü değil.
       AI Output düğmesi bu üçünü + haritayı toplu üretir → tek "render" kabulü zaten
       mesken köprüsünden gelir; ara PNG'leri loglamak sinyali kirletir (aynı plan defalarca). */
const trainLog = (function(){
  const KEY='kptaTrainLog', MAX=20, SOFT_LIMIT=2.5*1024*1024, BIG_ONE=1024*1024;
  function ls(){ try{ return (typeof localStorage!=='undefined') ? localStorage : null; }catch(e){ return null; } }
  function load(){ const s=ls(); if(!s) return []; try{ const a=JSON.parse(s.getItem(KEY)||'[]'); return Array.isArray(a)?a:[]; }catch(e){ return []; } }
  function save(arr){ const s=ls(); if(!s) return false; try{ s.setItem(KEY, JSON.stringify(arr)); return true; }catch(e){ return false; } }
  function editsSummary(){
    try{
      if(typeof editHistory==='undefined' || !Array.isArray(editHistory)) return {n:0, byType:{}};
      const byType={}; editHistory.forEach(e=>{ const t=(e&&e.type)||'?'; byType[t]=(byType[t]||0)+1; });
      return {n:editHistory.length, byType};
    }catch(e){ return {n:0, byType:{}}; }
  }
  function bytes(arr){ try{ return JSON.stringify(arr).length; }catch(e){ return Infinity; } }
  /* ring-buffer sığdır: MAX kayıt VE ~SOFT_LIMIT bayt üstüne çıkma → en eskiyi düşür. */
  function fit(arr){
    while(arr.length>MAX) arr.shift();
    while(arr.length>1 && bytes(arr)>SOFT_LIMIT) arr.shift();
    return arr;
  }
  return {
    /* kind: 'svg'|'png'|'dxf'|'render'. localStorage yoksa sessiz no-op (false döner). */
    record(kind){
      const s=ls(); if(!s) return false;
      let spec=[]; try{ if(typeof unitSpecs!=='undefined' && Array.isArray(unitSpecs)) spec=unitSpecs.map(u=>({...u})); }catch(e){}
      const rec={ t:new Date().toISOString(), ev:'accept', kind:String(kind||'?'),
        edits:editsSummary(), spec };
      let st=null; try{ if(typeof stateSnapshot==='function') st=stateSnapshot(false, true); }catch(e){ st=null; }
      /* tek kayıt >BIG_ONE (dev plan durumu) → state'siz özet kaydet, buffer'ı doldurma. */
      if(st){ const withState={...rec, state:st};
        if(bytes([withState])<=BIG_ONE){ rec.state=st; } else { rec.stateOmitted=true; } }
      const arr=fit(load().concat([rec]));
      return save(arr);
    },
    count(){ return load().length; },
    all(){ return load(); },
    clear(){ const s=ls(); if(!s) return false; try{ s.removeItem(KEY); return true; }catch(e){ return false; } },
    /* JSONL: satır başına bir geçerli JSON kaydı (ML pipeline dostu). */
    toJSONL(){ return load().map(r=>JSON.stringify(r)).join('\n'); }
  };
})();
if(typeof window!=='undefined') window.trainLog=trainLog;
const fmt = v => (Math.round(v*100)/100).toLocaleString('tr-TR');
const escapeHtml = s => String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function snapG(v){ return Math.round(v/M)*M; }
function shoelace(p){ let a=0; for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length]; a+=p[i].x*q.y-q.x*p[i].y;} return Math.abs(a)/2; }
function perim(p){ let s=0; for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length]; s+=Math.hypot(q.x-p[i].x,q.y-p[i].y);} return s; }
function bboxOf(p){ let a={minX:1e9,minY:1e9,maxX:-1e9,maxY:-1e9}; p.forEach(q=>{a.minX=Math.min(a.minX,q.x);a.minY=Math.min(a.minY,q.y);a.maxX=Math.max(a.maxX,q.x);a.maxY=Math.max(a.maxY,q.y);}); return a; }
function pip(x,y,poly){ let c=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){ const a=poly[i],b=poly[j];
  if(((a.y>y)!=(b.y>y)) && (x < (b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)) c=!c; } return c; }
function centroidOf(p){ const bb=bboxOf(p); return {x:(bb.minX+bb.maxX)/2, y:(bb.minY+bb.maxY)/2}; }
