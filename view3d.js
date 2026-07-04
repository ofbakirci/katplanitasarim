/* ===== 3B Görünüm — canlı plandan three.js dollhouse mesh =====
   Toolbar "3B" butonu → tam-ekran overlay açar, buildFloorplanMap() (io.js) ile
   o anki planın oda poligonlarını alıp gerçek 3B mesh kurar. AI YOK — gerçek geometri.
   three.js CDN'den LAZY yüklenir (sadece ilk açılışta). mesh_prototip.html mantığının
   motora gömülü kardeşi; KPTA'da çalışır, npm run build ile Mesken prototip'e de iner.

   Bağımlılık: window.buildFloorplanMap (io.js) — runtime oda haritası. */
(function(){
  'use strict';
  const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  const WALL_H = 2.7, FLOOR_T = 0.08, DOOR_H = 2.1;   // DOOR_H = kapı boşluğu yüksekliği (lentö altı)
  const WALL_LOW = 0.5;   // varsayılan duvar oranı: YARI yükseklik (dollhouse + hacim okunur). roofOn=tam.
  // L1-A1: duvar mesh kalınlığı REG.duvar'dan (eski sabit 0.12). 3B duvarlar oda kenarı başına
  // kurulur, paylaşılan iç duvarlar çakışır → tek temsili değer (daireArasi). Kapı boşluğu oyma
  // + lentö + eşik aynen çalışır (yalnız kutu derinliği değişir). REG yoksa güvenli varsayılan.
  const WALL_T = ((typeof REG!=='undefined' && REG.duvar && REG.duvar.daireArasi) || 0.20);
  // MESH-K/Q1: duvara yaslanan mobilyanın ARKA yüzü, duvar kutusunun İÇ yüzünü geçmeli. Oda poligon
  //   kenarı = duvar MERKEZ hattı; duvar kutusu her yöne WALL_T/2 taşar → iç yüz merkez hattından WALL_T/2
  //   içeride. Eski varsayılan gap 0.05 < WALL_T/2 (0.10) → mobilya arka paneli DUVARIN İÇİNE gömülüyordu
  //   (açık kitaplıkta rafların arasından duvar görünür = "sırt yok" algısı + z-fight). Yeni varsayılan
  //   gap = duvar-iç-yüzü + 2 cm nefes → arka panel net serbest, duvar sızmaz.
  const WALL_CLR = WALL_T/2 + 0.02;
  let overlay, host, status, scene, cam, renderer, controls, raf, roofOn=false, lblOn=true;
  let threeLoading=null, built=false, zoomEl=null, zoomActive=false;
  // ── kamera-koyma modu (adım 4): raycaster ile zemine tıkla → kamera; çıktı plan-px uzayında ──
  // camUIEnabled: kamera bölümü YALNIZ adım 4'te (openCompare) görünür — adım 2 (salt 3B izleme) ASLA göstermez.
  // placeAction: zemine tıklayınca ne olacak — 'add' (yeni kamera, 2 tık) · 'aim' (seçili kamerayı yeni noktaya çevir) · 'move' (seçili kamerayı taşı)
  let placeMode=false, camUIEnabled=false, placeAction='aim', camList=[], activeCamIdx=-1, pendingPos=null, camHeight='eye', camLens=24, camPlanSig=null;
  let camRenderMethod='snapshot';   // C7 (2026-07-03): B (kendi-açı/snapshot, sadık) VARSAYILAN — 1× maliyet. 'prompt' (A) ve 'both' (A/B, 2×) istek-üzerine seçilir. exportCameras'a girer.
  // B1-4: GÜN SAATİ — global varsayılan (tüm iso/kamera render'larına ışık/atmosfer talimatı). Kamera-başına override camList[i].timeOfDay.
  //   Değerler render-server'daki TIME_OF_DAY anahtarlarıyla birebir: sunrise/midday/golden/night. midday = mevcut davranış (soft daylight).
  let timeOfDay='midday';
  let camGizmos=null, raycaster=null, pickerWired=false;
  // ── B1-R (R2): CANLI PiP kamera önizlemesi ──
  //   pipCam: PiP'e özel PerspectiveCamera (ana cam'e DOKUNMADAN kamera perspektifini çizer).
  //   pipClosed: kullanıcı × ile kapattı → seçili kamera olsa da gösterme (yeniden seçince/aç ile geri gelir).
  //   pipBig: 2.4× büyütülmüş mü. _snapBusy: snapshot pass'i çalışıyor → PiP scissor pass'i ATLA (renderer setSize çatışması).
  const PIP_W=232, PIP_BIG=1.9;                            // kapalı PiP genişliği (px) + büyütme çarpanı
  const MINI_W=170, MINI_H=130;                            // R8: WASD minimap çerçeve boyutu (sol-alt kuşbakışı)
  let miniCam=null;                                        // R8: minimap ortho tepe kamera (lazy)
  let pipCam=null, pipClosed=false, pipBig=false, _snapBusy=false;
  // ── W1: WASD FIRST-PERSON GEZİNTİ (kat içinde POV gezmek) ──
  //   walkOn: gezinti aktif (pointer-lock + WASD + fare-bak). walkSavedView: girişten ÖNCEKİ görüş (çıkışta BİREBİR geri).
  //   walkKeys: basılı tuşlar. walkYaw/walkPitch: fare-bakış açıları (rad). walkRoofSav/walkGizSav/walkLblSav/walkCeilSav:
  //   giriş anındaki chrome durumları (çıkışta geri). walkClock: dt için son kare zamanı.
  let walkOn=false, walkSavedView=null, walkYaw=0, walkPitch=0, walkClock=0, walkCamMsgT=null;   // R9: walkCamMsgT = onay ipucu zamanlayıcı
  const walkKeys={ w:false, a:false, s:false, d:false, shift:false };
  let walkRoofSav=false, walkGizSav=true, walkLblSav=true, walkCeilSav=false, walkFogSav=null;
  let walkRay=null;                                          // gezinti çarpışması için ayrılmış Raycaster (picker'dan bağımsız)
  let walkLamp=null, walkAmbient=null;                        // W3: gezinti-özel iç aydınlatma (kafa lambası + fill); kapalı iç mekan karanlık kalmasın
  const WALK_EYE=1.6, WALK_SPEED=2.5, WALK_RUN=4.0, WALK_BUFFER=0.25, WALK_PITCH_MAX=85*Math.PI/180;
  // J1: ZIPLAMA — göz-hizası (WALK_EYE) taban, üstüne balistik dikey ofset. Basit yerçekimi: v0/g öyle seçilir ki
  //   tepe ~0.5m (h=v0²/2g ⇒ v0=√(2·g·0.5)). İniş TABAN'a (floorY=WALK_EYE) ya da üstüne çıkılabilecek ALÇAK
  //   mobilya tepesine. walkY = göz konumu (dünya y). walkVelY = dikey hız. walkGrounded = yerde/mobilya üstünde.
  const WALK_GRAV=14.0, WALK_JUMP_H=0.5, WALK_JUMP_V0=Math.sqrt(2*WALK_GRAV*WALK_JUMP_H);
  const WALK_STAND_MAX=0.55;                                 // J1: üstüne çıkılabilir "alçak mobilya" tavanı (m) — sehpa/puf/koltuk oturağı; yüksek dolap/masa değil
  let walkY=WALK_EYE, walkVelY=0, walkGrounded=true;         // J1: dikey durum
  // U2: GEZİNTİ AYDINLATMA — tek ayar nesnesi (NAV deseni). Kafa feneri "patlak ışık" (blown-out) idi:
  //   önceki lampInt 0.35 + range 16 + fillInt 0.85 birlikte yüzeyleri yakıyordu. Değerler kısıldı +
  //   fener menzili daraltılıp decay artırıldı (yakın mesafe okunur, uzak yumuşak düşer). Sahne ambient
  //   (0.38) + hemisphere fill zaten odayı taşıyor → fener yalnız önü hafif vurgular.
  const WALK_LIGHT={ lampColor:0xfff2e0, lampInt:0.16, lampRange:7, lampDecay:2.2, fillSky:0xfff6ea, fillGround:0xb8b0a4, fillInt:0.5 };
  // ── katlanabilir panel: sağ kenarda ikon-rail + açılır çekmece (mesh'i örtmez) ──
  let activeGroup=null, lockedViewRef=null, onReRenderCb=null, angleDrift=false, lastHint='';
  // A4: KUŞBAKIŞI KİLİDİ — kamera/mobilya grubunda varsayılan ÜST açı + döndürme kapalı (pan+zoom serbest).
  //   topLocked: kilit açık mı · freeSavedView: kilit öncesi serbest açı (gruptan çıkınca / kilit açılınca geri gelir).
  let topLocked=false, freeSavedView=null;
  // embedded = MESKEN akışı içinde açıldı (adım 2/4) → Kapat (X) YOK (3B kapatılan modal değil, bir adım).
  // standalone KPTA toolbar "3B" → embedded=false → Kapat X kalır (2B'ye dönüş için).
  let embedded=false;
  // ── MOBİLYA (kamera-koyma aracının cam→furn ikizi) ──
  // furnList: tüm dairelerin mobilyası TEK düz liste (her item room_id taşır). pos = MUTLAK metre
  // (px2m uzayı; __furnitureGroup -cx,-cz ofseti onu zemin geometrisiyle aynı yere oturtur).
  // furnMode/furnAction/pendingFurnType = Faz 2 (manuel düzenleyici). spacePan = Space basılı tut → sol-sürükle kaydırır (2B editördeki gibi).
  let furnList=[], activeFurnIdx=-1, furnMode=false, furnAction='move', pendingFurnType='sofa_3', spacePan=false;
  let furnUIEnabled=false, lastFurnHint='';   // furnUIEnabled = "Mobilya" rail grubu görünür (open/openCompare açar)
  // ── B2 (3B-UX-B2): mobilya PALETİ alt dock (kamera dock ikizi) + HAYALET yerleştirme ──
  // furnDockCat: paletin açık kategori sekmesi (FURN_PALETTE indexi). furnGhost: kuşbakışı-kilitli
  //   yerleştirme hayaleti {type, mesh, pos, rot, valid} — imleci izler, tık=bırak, Esc/sağ-tık=vazgeç.
  let furnDockCat=0, furnGhost=null;
  // ── MALZEME (M-serisi): oda-başına zemin/duvar malzemesi (mobilya sözleşmesinin ikizi) ──
  //   matUIEnabled = "Malzeme" rail grubu görünür. matSelRoom = seçili oda (room_id) — swatch'lar ona uygulanır.
  //   materialOverrides: {room_id -> {floor:presetKey|null, wall:presetKey|null}} — RUNTIME düzenleme durumu.
  //   Kalıcılık: window.__kptaMaterials (persistMaterials yazar, io.js buildFloorplanMap okur; furniture ikizi).
  //   SEÇİLMEMİŞ oda (kayıt yok / null preset) → ESKİ renk-kodlu görünüm (M4: varsayılan sıfır değişim).
  let matUIEnabled=false, matSelRoom=null, materialOverrides={}, lastMatHint='';
  // katalog + TR karşılıkları (UI tip seçici + prompt cümlesi)
  const FURN_TR = {
    sofa_2:'İkili Kanepe', sofa_3:'Üçlü Kanepe', sectional_l:'Köşe Kanepe', armchair:'Koltuk', pouf:'Puf',
    coffee_table:'Orta Sehpa', side_table:'Yan Sehpa', tv_unit:'TV Ünitesi', tv:'Televizyon', bookcase:'Kitaplık', console:'Konsol', rug:'Halı',
    dining_table_4:'Yemek Masası (4)', dining_table_6:'Yemek Masası (6)', dining_chair:'Sandalye', sideboard:'Büfe',
    bed_single:'Tek Yatak', bed_double:'Çift Yatak', bed_queen:'Yatak (Queen)', bed_king:'Yatak (King)',
    nightstand:'Komodin', wardrobe_2:'Gardırop', wardrobe_3:'Gardırop (3K)', wardrobe_4:'Gardırop (4K)',
    dresser:'Şifonyer', vanity:'Makyaj Masası', bench:'Bank',
    counter:'Tezgah', island:'Ada', fridge:'Buzdolabı', oven_hob:'Ocak/Fırın', dishwasher:'Bulaşık Mak.', sink:'Evye',
    toilet:'Klozet', washbasin:'Lavabo', bathtub:'Küvet', shower_tray:'Duş', washer:'Çamaşır Mak.',
    shoe_cabinet:'Ayakkabılık', coat_rack:'Vestiyer', desk:'Çalışma Masası', office_chair:'Ofis Sandalyesi',
    plant:'Saksı', bistro_table:'Bistro Masa', bistro_chair:'Bistro Sandalye'
  };
  // UI paleti: kategori başlıklı (groupHTML render eder). Motor TÜM tipleri destekler; bu sadece manuel ekleme seçeneği.
  const FURN_PALETTE = [
    { g:'Oturma', items:['sofa_3','sofa_2','sectional_l','armchair','pouf','coffee_table','side_table','tv_unit','tv','bookcase','console','rug'] },
    { g:'Yemek', items:['dining_table_4','dining_table_6','dining_chair','sideboard'] },
    { g:'Yatak', items:['bed_double','bed_queen','bed_single','nightstand','wardrobe_3','wardrobe_2','dresser','vanity','bench'] },
    { g:'Mutfak', items:['counter','island','fridge','oven_hob','dishwasher','sink'] },
    { g:'Banyo', items:['toilet','washbasin','bathtub','shower_tray','washer'] },
    { g:'Giriş/Çalışma', items:['shoe_cabinet','coat_rack','console','desk','office_chair','plant'] }
  ];
  const FURN_CATALOG = FURN_PALETTE.reduce(function(a,c){ return a.concat(c.items); }, []);
  const CAM_Y = { low:1.1, eye:1.6, high:2.2 };          // 3 kademe yükseklik (m) — prototip height ile birebir
  const CAM_Y_MAX = WALL_H - 0.15;                       // Q2: kamera TAVANI AŞAMAZ (duvar üstünden 15 cm altı); slider+preset+yüklenen kameralar buna clamp'lenir
  const CAM_Y_MIN = 0.3;
  const LENS_FOV = { 16:100, 24:74, 35:54, 50:40 };       // objektif → yatay görüş açısı

  // oda tipi (TR motor tipi ya da EN) -> sıcak zemin rengi
  // ODA TİPİ = BELİRGİN AYRIK RENK → AI renkten tipi anlasın (karıştırmasın).
  // ANAHTARLAR fpRoomEnum() çıktısıyla BİREBİR (io.js): küçük harf, alt çizgili enum.
  const COL = {
    bathroom:0x4f9fd6, wc:0x4f9fd6,                 // banyo/wc = MAVİ
    bedroom:0x66b56a,                               // yatak (eb. dahil) = YEŞİL
    living:0xe0843a, living_kitchen:0xe0a93c,        // salon = TURUNCU · salon+mutfak = amber
    kitchen:0xe8c84a,                                // mutfak = SARI
    studio:0xd98f4e, study:0x8fc7b0,                 // stüdyo ~salon · çalışma = nane
    hall:0xe8dcc0,                                   // antre/koridor = AÇIK BEJ
    room:0xcbb896,                                   // genel oda = nötr bej
    stairs:0x6f6f76, elevator:0x5a5a62, shaft:0x7a7a82, fire_stairs:0x55555c,  // çekirdek = KOYU GRİ
    balcony:0x9fd08a, storage:0xb7a98c, parking:0x9a9a9a, shelter:0x8a8a90, shop:0xd9b36a,
    _def:0xcbb896
  };
  function colorFor(o){
    const t=(o.type||'').toString().toLowerCase();
    if(COL[t]!=null) return COL[t];
    // yedek: type_tr / name_en / name içinde anahtar geçiyor mu
    const alt=((o.type_tr||'')+' '+(o.name_en||'')+' '+(o.name||'')).toLowerCase();
    if(/banyo|bath/.test(alt)) return COL.bathroom;
    if(/wc/.test(alt)) return COL.wc;
    if(/mutfak|kitchen/.test(alt) && /salon|living/.test(alt)) return COL.living_kitchen;
    if(/mutfak|kitchen/.test(alt)) return COL.kitchen;
    if(/salon|living/.test(alt)) return COL.living;
    if(/yatak|bedroom|ebeveyn/.test(alt)) return COL.bedroom;
    if(/antre|koridor|hall|hol|entry|corridor/.test(alt)) return COL.hall;
    if(/merdiven|stair/.test(alt)) return COL.stairs;
    if(/asans|elevator/.test(alt)) return COL.elevator;
    if(/yangin|fire/.test(alt)) return COL.fire_stairs;
    if(/balkon|balcony/.test(alt)) return COL.balcony;
    return COL._def;
  }

  // ── SVG ikonlar (Lucide tarzı, stroke=currentColor) — EMOJİ YOK ──
  const ICONS={
    view:'<path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>',
    layers:'<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    camera:'<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
    download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    close:'<path d="M18 6 6 18M6 6l12 12"/>',
    fit:'<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    zoom:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
    move:'<path d="M5 9 2 12l3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    minus:'<path d="M5 12h14"/>',
    lock:'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',           // kilitli (kuşbakışı)
    lockopen:'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',        // kilit açık (serbest orbit)
    trash:'<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    bolt:'<path d="M13 2 3 14h7l-1 8 10-12h-7z"/>',
    rotccw:'<path d="M3 2v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L3 8"/>',          // saat yönü TERSİ döndür
    rotcw:'<path d="M21 2v6h-6"/><path d="M21 12A9 9 0 1 1 18.36 5.64L21 8"/>',          // saat yönü döndür
    copy:'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',   // çoğalt
    sofa:'<path d="M5 11V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4"/><path d="M3 13a2 2 0 0 1 4 0v3h10v-3a2 2 0 0 1 4 0v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',  // mobilya rail ikonu
    swatch:'<path d="M2 13a2 2 0 0 0 2 2h1M2 13V4a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v9M2 13a9 9 0 0 0 9 9 9 9 0 0 0 9-9M11 13h9a1 1 0 0 1 1 1v0a2 2 0 0 1-2 2h-1"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>',  // malzeme rail ikonu (renk paleti/swatch)
    walk:'<circle cx="13" cy="4" r="2"/><path d="M13 6l-2.5 4 3 2 1 6M10.5 10 7 13M13.5 12l3.5 2M6 22l3-6M15 16l1.5 6"/>'  // gezinti rail ikonu (yürüyen kişi)
  };
  // inline style'da width/height ZORUNLU: motor styles.css'inde global "svg{width:100%}" var → öznitelik ezilir
  function ic(name,size){ const s=(size||16)+'px';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:'+s+';height:'+s+';display:inline-block;flex:none;vertical-align:-2px;cursor:inherit">'+(ICONS[name]||'')+'</svg>'; }
  // 3B-UX-C2: mobilya PALET küçük-resmi — üstten görünüş (kuşbakışı) TANINABİLİR şematik glif.
  //   Sözleşme (KORUNUR): w/d ORANI FURN_DIM'den gelir (parametrik, gliften bağımsız), ön-yön çizgisi
  //   (+Z/alt kenar) kalır, box 28×28, tek tema rengi (#c9a16b + turuncu ön-yön vurgusu), EMOJİ YOK,
  //   ince stroke/yuvarlak köşe, 3-6 çizgi (ikon, illüstrasyon değil). Bilinmeyen tip → düz kutu+ön-yön (fallback, DEĞİŞMEDİ).
  const FURN_THUMB_STROKE='#c9a16b', FURN_THUMB_FILL='rgba(201,161,107,.28)', FURN_THUMB_ACCENT='#e0843a';
  // ortak gövde+ön-yön çizgisi (her glif bunun üstüne ince detay ekler)
  function ftBody(x,y,bw,bd,rx){
    return '<rect x="'+x+'" y="'+y+'" width="'+bw+'" height="'+bd+'" rx="'+(rx==null?1.5:rx)+'" fill="'+FURN_THUMB_FILL+'" stroke="'+FURN_THUMB_STROKE+'" stroke-width="1.2"/>';
  }
  function ftFront(x,y,bw,bd){
    return '<line x1="'+x+'" y1="'+(y+bd)+'" x2="'+(x+bw)+'" y2="'+(y+bd)+'" stroke="'+FURN_THUMB_ACCENT+'" stroke-width="1.6"/>';
  }
  function ftLine(x1,y1,x2,y2,w){
    return '<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+FURN_THUMB_STROKE+'" stroke-width="'+(w||1.1)+'" stroke-linecap="round"/>';
  }
  function ftRect(x,y,w,h,rx,fill){
    return '<rect x="'+x+'" y="'+y+'" width="'+Math.max(0.5,w)+'" height="'+Math.max(0.5,h)+'" rx="'+(rx==null?1:rx)+'" fill="'+(fill||'none')+'" stroke="'+FURN_THUMB_STROKE+'" stroke-width="1.1"/>';
  }
  function ftCircle(cx,cy,r,fill){
    return '<circle cx="'+cx+'" cy="'+cy+'" r="'+Math.max(0.4,r)+'" fill="'+(fill||'none')+'" stroke="'+FURN_THUMB_STROKE+'" stroke-width="1.1"/>';
  }
  // tip-aile → glif ekstra-içerik üretir (yerel x,y,bw,bd = gövde kutusu koordinatları). Ortak gövde+ön-yön
  // furnThumb tarafından HER ZAMAN çizilir; buradaki fonksiyonlar yalnız AYIRT EDİCİ 2-5 iç çizgi ekler.
  const FURN_GLYPH = {
    // ── oturma: gövde zaten çizili, sırt şeridi (üst kenar) + kol şeritleri (yan kenarlar) ──
    _seat: function(x,y,bw,bd,arms){
      let s=ftLine(x+1,y+bd*0.28,x+bw-1,y+bd*0.28,1.1);           // sırt çizgisi (arkaya yakın)
      if(arms){ s+=ftLine(x+bw*0.16,y+1,x+bw*0.16,y+bd-1,1.1)+ftLine(x+bw*0.84,y+1,x+bw*0.84,y+bd-1,1.1); } // kol çizgileri
      return s;
    },
    // ── yatak: şilte zaten gövde; 1-2 yastık (üst kenar) + battaniye katlama çizgisi (alt üçte-bir) ──
    _bed: function(x,y,bw,bd,pillows){
      let s='';
      const pw=bw/(pillows+ (pillows-1)*0.18 +0.36), gap=pw*0.18, py=y+bd*0.10, ph=bd*0.16;
      for(let i=0;i<pillows;i++){ const px=x+bw*0.18+i*(pw+gap); s+=ftRect(px,py,pw,ph,1.4,'rgba(201,161,107,.18)'); }
      s+=ftLine(x+2,y+bd*0.62,x+bw-2,y+bd*0.62,1);                // battaniye katlama çizgisi
      return s;
    }
  };
  const FURN_GLYPH_MAP = {
    // oturma grubu
    sofa_2: function(x,y,bw,bd){ return FURN_GLYPH._seat(x,y,bw,bd,true); },
    sofa_3: function(x,y,bw,bd){ return FURN_GLYPH._seat(x,y,bw,bd,true); },
    sectional_l: function(x,y,bw,bd){
      // L: ana kol + kısa kanat (sağ yarı derinlik artışı okunur bbox oranından); sırt + iki kol
      return FURN_GLYPH._seat(x,y,bw,bd,true)+ftLine(x+bw*0.62,y+1,x+bw*0.62,y+bd-1,1.1);
    },
    armchair: function(x,y,bw,bd){ return FURN_GLYPH._seat(x,y,bw,bd,true); },
    pouf: function(x,y,bw,bd){ return ftCircle(x+bw/2,y+bd/2,Math.min(bw,bd)*0.22); },
    coffee_table: function(x,y,bw,bd){ return ftRect(x+bw*0.16,y+bd*0.16,bw*0.68,bd*0.68,1); },
    side_table: function(x,y,bw,bd){ return ftCircle(x+bw/2,y+bd/2,Math.min(bw,bd)*0.32); },
    tv_unit: function(x,y,bw,bd){ return ftLine(x+bw*0.34,y+1,x+bw*0.34,y+bd-1,1)+ftLine(x+bw*0.67,y+1,x+bw*0.67,y+bd-1,1); },
    tv: function(x,y,bw,bd){ return ftRect(x+bw*0.08,y+bd*0.15,bw*0.84,bd*0.55,1)+ftLine(x+bw/2,y+bd*0.70,x+bw/2,y+bd*0.92,1.3); },
    bookcase: function(x,y,bw,bd){ let s=''; for(let i=1;i<4;i++){ const yy=y+bd*i/4; s+=ftLine(x+1,yy,x+bw-1,yy,1); } return s; },
    console: function(x,y,bw,bd){ return ftLine(x+bw*0.5,y+1,x+bw*0.5,y+bd-1,1); },
    rug: function(x,y,bw,bd){ return ftRect(x+bw*0.13,y+bd*0.13,bw*0.74,bd*0.74,2)+ftRect(x+bw*0.26,y+bd*0.26,bw*0.48,bd*0.48,1.5); },
    // yemek
    dining_table_4: function(x,y,bw,bd){ return ftLine(x+2,y+2,x+bw-2,y+2,1)+ftLine(x+2,y+bd-2,x+bw-2,y+bd-2,1); },
    dining_table_6: function(x,y,bw,bd){ return ftLine(x+2,y+2,x+bw-2,y+2,1)+ftLine(x+2,y+bd-2,x+bw-2,y+bd-2,1)+ftLine(x+bw/2,y+2,x+bw/2,y+bd-2,0.9); },
    dining_chair: function(x,y,bw,bd){ return FURN_GLYPH._seat(x,y,bw,bd,false); },
    bistro_chair: function(x,y,bw,bd){ return FURN_GLYPH._seat(x,y,bw,bd,false); },
    bistro_table: function(x,y,bw,bd){ return ftCircle(x+bw/2,y+bd/2,Math.min(bw,bd)*0.34); },
    sideboard: function(x,y,bw,bd){ return ftLine(x+bw*0.33,y+1,x+bw*0.33,y+bd-1,1)+ftLine(x+bw*0.66,y+1,x+bw*0.66,y+bd-1,1); },
    // yatak odası
    bed_single: function(x,y,bw,bd){ return FURN_GLYPH._bed(x,y,bw,bd,1); },
    bed_double: function(x,y,bw,bd){ return FURN_GLYPH._bed(x,y,bw,bd,2); },
    bed_queen: function(x,y,bw,bd){ return FURN_GLYPH._bed(x,y,bw,bd,2); },
    bed_king: function(x,y,bw,bd){ return FURN_GLYPH._bed(x,y,bw,bd,2); },
    nightstand: function(x,y,bw,bd){ return ftLine(x+1,y+bd*0.5,x+bw-1,y+bd*0.5,1); },
    wardrobe_2: function(x,y,bw,bd){ return ftLine(x+bw*0.5,y+1,x+bw*0.5,y+bd-1,1.1); },
    wardrobe_3: function(x,y,bw,bd){ return ftLine(x+bw/3,y+1,x+bw/3,y+bd-1,1.1)+ftLine(x+2*bw/3,y+1,x+2*bw/3,y+bd-1,1.1); },
    wardrobe_4: function(x,y,bw,bd){ let s=''; for(let i=1;i<4;i++){ const xx=x+bw*i/4; s+=ftLine(xx,y+1,xx,y+bd-1,1.1); } return s; },
    dresser: function(x,y,bw,bd){ let s=''; for(let i=1;i<3;i++){ const yy=y+bd*i/3; s+=ftLine(x+1,yy,x+bw-1,yy,1); } return s; },
    vanity: function(x,y,bw,bd){ return ftCircle(x+bw*0.78,y+bd*0.5,Math.min(bw,bd)*0.22); },
    bench: function(x,y,bw,bd){ return ftLine(x+bw*0.15,y+2,x+bw*0.15,y+bd-2,1)+ftLine(x+bw*0.85,y+2,x+bw*0.85,y+bd-2,1); },
    // mutfak
    counter: function(x,y,bw,bd){ return ftLine(x+2,y+bd*0.3,x+bw-2,y+bd*0.3,1); },
    island: function(x,y,bw,bd){ return ftRect(x+bw*0.2,y+bd*0.25,bw*0.6,bd*0.5,1); },
    fridge: function(x,y,bw,bd){ return ftLine(x+bw*0.5,y+1,x+bw*0.5,y+bd-1,1.2)+ftLine(x+bw*0.2,y+bd*0.3,x+bw*0.2,y+2,1); },
    oven_hob: function(x,y,bw,bd){ return ftCircle(x+bw*0.32,y+bd*0.4,Math.min(bw,bd)*0.16)+ftCircle(x+bw*0.68,y+bd*0.4,Math.min(bw,bd)*0.16); },
    // M4: bulaşık = DÜZ ön panel (dikdörtgen çerçeve) + YATAY kol çizgisi üstte — çamaşırın YUVARLAK kapağıyla karışmaz.
    dishwasher: function(x,y,bw,bd){ return ftRect(x+bw*0.16,y+bd*0.16,bw*0.68,bd*0.68,1)+ftLine(x+bw*0.22,y+bd*0.28,x+bw*0.78,y+bd*0.28,1.3); },
    sink: function(x,y,bw,bd){ return ftRect(x+bw*0.22,y+bd*0.2,bw*0.56,bd*0.42,1.3)+ftLine(x+bw*0.5,y+bd*0.2,x+bw*0.5,y+2,1); },
    // M4: çamaşır = YUVARLAK lombar kapak (daire) — dişwasher'ın düz panelinden ayrışır.
    washer: function(x,y,bw,bd){ return ftCircle(x+bw/2,y+bd/2,Math.min(bw,bd)*0.3); },
    // banyo
    toilet: function(x,y,bw,bd){ return ftRect(x+bw*0.15,y+1,bw*0.7,bd*0.22,1)+ftCircle(x+bw/2,y+bd*0.62,Math.min(bw,bd*0.7)*0.42); },
    washbasin: function(x,y,bw,bd){ return ftCircle(x+bw/2,y+bd*0.55,Math.min(bw,bd)*0.32)+ftLine(x+bw*0.5,y+bd*0.2,x+bw*0.5,y+bd*0.28,1); },
    bathtub: function(x,y,bw,bd){ return ftRect(x+bw*0.1,y+bd*0.14,bw*0.8,bd*0.72,3); },
    shower_tray: function(x,y,bw,bd){ return ftLine(x+2,y+2,x+bw*0.42,y+bd*0.42,1)+ftCircle(x+bw*0.42,y+bd*0.42,1.1,FURN_THUMB_STROKE); },
    // giriş / çalışma
    shoe_cabinet: function(x,y,bw,bd){ let s=''; for(let i=1;i<3;i++){ const yy=y+bd*i/3; s+=ftLine(x+1,yy,x+bw-1,yy,1); } return s; },
    coat_rack: function(x,y,bw,bd){ const r=Math.min(bw,bd)*0.4; return ftCircle(x+bw/2,y+bd/2,r*0.28,FURN_THUMB_STROKE)+ftLine(x+bw/2,y+bd/2,x+bw/2,y+2,1)+ftLine(x+bw/2,y+bd/2,x+2,y+bd*0.35,1)+ftLine(x+bw/2,y+bd/2,x+bw-2,y+bd*0.35,1); },
    desk: function(x,y,bw,bd){ return ftRect(x+bw*0.58,y+bd*0.12,bw*0.34,bd*0.76,1); },
    office_chair: function(x,y,bw,bd){ return ftCircle(x+bw/2,y+bd/2,Math.min(bw,bd)*0.3)+ftLine(x+bw*0.5,y+bd*0.2,x+bw*0.5,y+1,1); },
    plant: function(x,y,bw,bd){ const cx=x+bw/2, cy=y+bd*0.62, r=Math.min(bw,bd)*0.24;
      return ftCircle(cx,cy,r)+ftLine(cx,cy-r,cx,y+1,1)+ftLine(cx,y+bd*0.2,cx-bw*0.22,y+1,1)+ftLine(cx,y+bd*0.2,cx+bw*0.22,y+1,1); }
  };
  // B2-1: mobilya PALET küçük-resmi — üstten görünüş (kuşbakışı) TANINABİLİR şematik SVG. FURN_DIM
  //   w/d oranıyla dikdörtgen çerçeve (+ön-yön çizgisi, KORUNUR) üstüne tip-özel 2-5 iç çizgi eklenir
  //   (FURN_GLYPH_MAP). Tanınmayan tip → düz kutu+ön-yön (fallback, DEĞİŞMEDİ). box 28×28, EMOJİ YOK.
  function furnThumb(type){
    const d=(typeof FURN_DIM!=='undefined'&&FURN_DIM[type])||{w:0.6,d:0.6};
    const w=d.w||0.6, dp=d.d||0.6, mx=Math.max(w,dp)||1;
    const bw=Math.max(6,Math.round(20*w/mx)), bd=Math.max(6,Math.round(20*dp/mx));
    const x=Math.round((28-bw)/2), y=Math.round((28-bd)/2);
    // ön yön = +Z (alt kenar) → küçük çizgi item'ın "önünü" işaretler (yataklarda baş ucu okunur)
    const glyphFn=FURN_GLYPH_MAP[type];
    const inner=glyphFn?glyphFn(x,y,bw,bd):'';
    return '<svg viewBox="0 0 28 28" style="width:28px;height:28px;display:block;pointer-events:none">'+
      ftBody(x,y,bw,bd,1.5)+inner+ftFront(x,y,bw,bd)+
    '</svg>';
  }

  // çekmece içeriği — grup başına kontroller (data-* öznitelikleri var olan delege handler'a gider)
  function groupHTML(g){
    if(g==='view') return '<div class="v3dgh">Görünüm</div>'+
      '<div style="display:flex;gap:6px;flex-wrap:wrap">'+
        '<button data-v3d="iso" class="v3db">İzometrik</button>'+
        '<button data-v3d="top" class="v3db">Üstten</button>'+
        '<button data-v3d="persp" class="v3db">Perspektif</button>'+
        '<button data-v3d="fit" class="v3db v3dgreen">'+ic('fit',13)+'Sığdır</button>'+
      '</div>';   // A2: zoom slider çekmeceden ÇIKARILDI → sağ-altta HEP görünen dikey overlay (#v3dZoomBar)
    if(g==='layers') return '<div class="v3dgh">Katman</div>'+
      '<label class="v3dchk"><input type="checkbox" data-v3d="roof"'+(roofOn?' checked':'')+'> Duvarlar tam yükseklik</label>'+
      '<label class="v3dchk"><input type="checkbox" data-v3d="lbl"'+(lblOn?' checked':'')+'> Oda etiketleri</label>';
    if(g==='export') return '<div class="v3dgh">İndir</div>'+
      '<button data-v3d="png" class="v3db" style="width:100%">'+ic('download',13)+'PNG indir (EN)</button>'+
      '<div class="v3dnote">Etiketler İngilizce — AI 3D render için.</div>';
    // B1-R: Kamera/Mobilya araçları alt DOCK'ta (#v3dCamDock / #v3dFurnDock). Rail ikonu grup kilidini + dock'u
    //   DOĞRUDAN açar; çekmecede ARTIK yönlendirme notu YOK (emekli). Drawer bu gruplarda boş → renderDrawer gizler.
    if(g==='camera'||g==='furniture'||g==='material') return '';   // araçlar alt DOCK'ta → çekmece boş
    return '';
  }
  function railGroups(){
    const gs=[{k:'view',i:'view',t:'Görünüm'},{k:'layers',i:'layers',t:'Katman'}];
    if(camUIEnabled) gs.push({k:'camera',i:'camera',t:'Kamera'});
    if(furnUIEnabled) gs.push({k:'furniture',i:'sofa',t:'Mobilya'});
    if(matUIEnabled) gs.push({k:'material',i:'swatch',t:'Malzeme'});
    gs.push({k:'walk',i:'walk',t:'Gezinti (masaüstü)'});   // W1: WASD first-person POV — pointer-lock, göz hizası 1.6m
    gs.push({k:'export',i:'download',t:'İndir'});
    return gs;
  }
  function renderRail(){
    const rail=overlay&&overlay.querySelector('#v3dRail'); if(!rail) return;
    let h='';
    railGroups().forEach(function(g){ const on=(g.k==='walk')?walkOn:(activeGroup===g.k); h+='<button data-grp="'+g.k+'" class="v3drailb'+(on?' on':'')+'" title="'+g.t+'">'+ic(g.i,19)+'</button>'; });
    // Kapat (X) YALNIZ standalone'da (toolbar 3B). Akış içinde (embedded) yok — adımlar arası gezilir, kapatılmaz.
    if(!embedded) h+='<div class="v3draild"></div><button data-v3d="close" class="v3drailb v3drailx" title="Kapat">'+ic('close',19)+'</button>';
    rail.innerHTML=h;
  }
  function renderDrawer(){
    const d=overlay&&overlay.querySelector('#v3dDrawer'); if(!d) return;
    // B1-R: kamera/mobilya/malzeme grubunda çekmece BOŞ (araçlar alt dock'ta) → çekmeceyi gizle, dock'u aç.
    if(!activeGroup || activeGroup==='camera' || activeGroup==='furniture' || activeGroup==='material'){ d.style.display='none'; d.innerHTML=''; }
    else { d.style.display='block'; d.innerHTML=groupHTML(activeGroup); }
    if(activeGroup==='camera'){ renderCamDock(); }
    // B2-1: mobilya dock yalnız mobilya grubunda görünür (kamera dock deseni); başka grupta gizle.
    if(activeGroup==='furniture'){
      renderFurnDock();
      const cd=overlay.querySelector('#v3dCamDock'); if(cd) cd.style.display='none';   // iki dock aynı anda görünmesin (adım 4: kamera+mobilya ikisi de etkin)
    } else { const fd=overlay.querySelector('#v3dFurnDock'); if(fd){ fd.style.display='none'; fd.innerHTML=''; } }
    // M2: malzeme dock yalnız malzeme grubunda görünür (mobilya dock deseni).
    if(activeGroup==='material'){
      renderMatDock();
      const cd=overlay.querySelector('#v3dCamDock'); if(cd) cd.style.display='none';
      const fd=overlay.querySelector('#v3dFurnDock'); if(fd) fd.style.display='none';
    } else { const md=overlay.querySelector('#v3dMatDock'); if(md){ md.style.display='none'; md.innerHTML=''; } }
  }
  function setGroup(g){
    const prev=activeGroup;
    activeGroup=(activeGroup===g?null:g);
    // A4: kamera/mobilya grubuna GİRİŞ → varsayılan kuşbakışı kilidi (yumuşak). ÇIKIŞ → serbest açı geri.
    const inLockGroup=(activeGroup==='camera'||activeGroup==='furniture');
    const wasLockGroup=(prev==='camera'||prev==='furniture');
    if(inLockGroup && !wasLockGroup) enterTopLock(true);       // serbest görünümden kilit grubuna → kilitle (serbest açıyı sakla)
    else if(!inLockGroup && wasLockGroup) releaseTopLockToFree(); // kilit grubundan çıkış → serbest açı geri
    // C3-6: KAMERA grubuna (yeniden) giriş → PiP kullanıcı-X bayrağını sıfırla (seçili kamera varsa canlı önizleme geri gelsin).
    //   Deterministik kural: PiP görünür ⇔ kamera grubu + seçili kamera + kullanıcı X ile kapatmadı; grup girişi X'i temizler.
    if(activeGroup==='camera' && prev!=='camera'){ pipClosed=false; applyPipSize(); }
    // B2-4: MOBİLYA grubundan BAŞKA gruba geçiş → düzenleme + seçim + yarım hayalet otomatik temizlenir
    if(prev==='camera' && activeGroup!=='camera' && placeMode) setPlaceMode(false);   // kamera grubundan çıkış → yerleştirme açık kalmasın
    syncFurnModeToGroup();                                                            // grup 'furniture' değilse furnMode kapanır (ghost+seçim temizler)
    renderRail(); renderDrawer(); updateLockBtn();
  }
  // ── B1-1: YÖN KÜRESİ (viewcube) ─────────────────────────────────────────────────
  // Zoom barının üstünde kalıcı küçük yön küresi. Üstünde sürükle → görüş orbit eder (NAV hassasiyeti).
  //   İç nokta = mevcut azimut (theta) göstergesi. Etrafında hazır görüş chip'leri: Üst / İzo / K-G-D-B.
  //   Kilitliyken İzo/yön chip'i seçmek kilidi AÇAR (kullanıcı "dikine kaldım" derdinin çözümü).
  // DOM/SVG → theta/phi eşleme (three.js sahne-içi küp DEĞİL — maliyet/karmaşıklık gereksiz).
  const ORB_R=27;                                   // küre yarıçapı (px, viewBox 0..64)
  function orbWidgetHTML(){
    // dış kompas chip'leri (K yukarı, D sağ, G aşağı, B sol) + merkez sürükle alanı + Üst/İzo mini butonlar
    return '<div id="v3dOrb" title="Sürükle: görüşü çevir · nokta: hazır açı" '+
      'style="position:relative;width:78px;background:rgba(34,34,40,.94);border-radius:14px;padding:9px 8px 8px;backdrop-filter:blur(7px);display:flex;flex-direction:column;align-items:center;gap:6px">'+
      '<svg id="v3dOrbSvg" viewBox="0 0 64 64" style="width:62px;height:62px;display:block;cursor:grab;touch-action:none">'+
        // küre gövdesi (radyal gradyan hissi) + boylam/enlem yayları
        '<defs><radialGradient id="v3dOrbG" cx="38%" cy="34%" r="70%">'+
          '<stop offset="0%" stop-color="#4a4a55"/><stop offset="62%" stop-color="#33333c"/><stop offset="100%" stop-color="#24242b"/>'+
        '</radialGradient></defs>'+
        '<circle cx="32" cy="32" r="'+ORB_R+'" fill="url(#v3dOrbG)" stroke="rgba(255,255,255,.16)" stroke-width="1"/>'+
        '<ellipse cx="32" cy="32" rx="'+ORB_R+'" ry="10" fill="none" stroke="rgba(255,255,255,.13)" stroke-width="1"/>'+
        '<line x1="32" y1="'+(32-ORB_R)+'" x2="32" y2="'+(32+ORB_R)+'" stroke="rgba(255,255,255,.10)" stroke-width="1"/>'+
        '<line x1="'+(32-ORB_R)+'" y1="32" x2="'+(32+ORB_R)+'" y2="32" stroke="rgba(255,255,255,.10)" stroke-width="1"/>'+
        // yön harfleri (kompas): K üst, D sağ, G alt, B sol — EMOJİ YOK, düz metin
        '<text data-orbpreset="N" x="32" y="9"  text-anchor="middle" font-size="7.5" font-weight="700" fill="#c9b79a" style="cursor:pointer">K</text>'+
        '<text data-orbpreset="E" x="60" y="35" text-anchor="middle" font-size="7.5" font-weight="700" fill="#c9b79a" style="cursor:pointer">D</text>'+
        '<text data-orbpreset="S" x="32" y="61" text-anchor="middle" font-size="7.5" font-weight="700" fill="#c9b79a" style="cursor:pointer">G</text>'+
        '<text data-orbpreset="W" x="4"  y="35" text-anchor="middle" font-size="7.5" font-weight="700" fill="#c9b79a" style="cursor:pointer">B</text>'+
        // mevcut açı göstergesi (yön çizgisi + uç nokta) — updateOrb ile döner
        '<line id="v3dOrbNeedle" x1="32" y1="32" x2="32" y2="12" stroke="#c9a16b" stroke-width="2" stroke-linecap="round"/>'+
        '<circle id="v3dOrbDot" cx="32" cy="12" r="3.4" fill="#e0843a" stroke="#1a1a1f" stroke-width="1"/>'+
      '</svg>'+
      '<div style="display:flex;gap:4px;width:100%">'+
        '<button data-orbpreset="top" class="v3dorbb" title="Üstten (kuşbakışı)">Üst</button>'+
        '<button data-orbpreset="iso" class="v3dorbb" title="İzometrik">İzo</button>'+
      '</div>'+
    '</div>';
  }
  // küre iğnesini mevcut azimuta (heading) döndür. theta OrbitControls açısı; ekranda K=yukarı.
  function updateOrb(){
    if(!overlay||!controls||!controls.getSph) return;
    const svg=overlay.querySelector('#v3dOrbSvg'); if(!svg) return;
    const nd=svg.querySelector('#v3dOrbNeedle'), dt=svg.querySelector('#v3dOrbDot'); if(!nd||!dt) return;
    // heading: kameranın YÖNÜ (yukarı=-Z=K). theta OrbitControls'ta atan2 tabanlı; iğne kameranın baktığı ekseni gösterir.
    const s=controls.getSph();
    // orbit theta → ekran açısı: theta=0 iken kamera +Z'de (güneyden bakar) → hedef -Z(K) yukarı görünür.
    const ang=s.theta;                                // radyan; ekranda saat yönü
    const L=ORB_R-5, cx=32, cy=32;
    const ex=cx+Math.sin(ang)*L, ey=cy-Math.cos(ang)*L;   // K(yukarı)=−cos, D(sağ)=+sin
    nd.setAttribute('x2',ex.toFixed(1)); nd.setAttribute('y2',ey.toFixed(1));
    dt.setAttribute('cx',ex.toFixed(1)); dt.setAttribute('cy',ey.toFixed(1));
    // kilitliyken (kuşbakışı) iğne soluk — yatay yön anlamsız
    const dim=topLocked?0.4:1; nd.style.opacity=dim; dt.style.opacity=dim;
  }
  // hazır görüş chip'i: kısa tween'le o açıya. Kilitliyken İzo/yön seçmek kilidi AÇAR.
  function orbPreset(k){
    if(!controls) return;
    if(k==='top'){ if(!topLocked) enterTopLock(true); else controls.tweenToAngle(TOP_PHI, topAzimuth(), NAV.tweenMs); updateOrb(); return; }   // C3-3: preset azimut (en uzun kenar alta paralel)
    // İzo/yön → serbest açı gerekir: kilitliyse önce aç (snap yok, tween ile), sonra açıya git
    if(topLocked) exitTopLock();
    const ISO_PHI=Math.PI*0.30;                       // ~54° eğim = izometrik his
    const SIDE_PHI=Math.PI*0.40;                      // ~72° = daha yatay (yandan bakış)
    let phi=ISO_PHI, theta=Math.PI*0.25;              // izo varsayılan azimut
    if(k==='iso'){ phi=ISO_PHI; theta=Math.PI*0.25; }
    else if(k==='N'){ phi=SIDE_PHI; theta=Math.PI; }        // K'den (kuzeyden) bakış → hedef güney
    else if(k==='S'){ phi=SIDE_PHI; theta=0; }
    else if(k==='E'){ phi=SIDE_PHI; theta=-Math.PI/2; }
    else if(k==='W'){ phi=SIDE_PHI; theta=Math.PI/2; }
    controls.tweenToAngle(phi, theta, NAV.tweenMs);
    updateOrb();
  }
  function wireOrb(){
    const svg=overlay&&overlay.querySelector('#v3dOrbSvg'); if(!svg) return;
    // preset chip'leri (svg text + alt butonlar)
    overlay.querySelectorAll('[data-orbpreset]').forEach(function(el){
      el.addEventListener('click',function(e){ e.stopPropagation(); orbPreset(el.getAttribute('data-orbpreset')); }); });
    // sürükle = orbit (NAV hassasiyeti). Kilitliyken küreden döndürme yapılırsa kilidi aç (serbest orbit'e geç).
    let drag=null;
    svg.addEventListener('pointerdown',function(e){
      if(e.target.getAttribute&&e.target.getAttribute('data-orbpreset')) return;   // preset tıklaması sürükleme değil
      if(!controls) return;
      if(topLocked) exitTopLock();                    // küreden orbit → serbest (dik kalma çözümü)
      drag={x:e.clientX,y:e.clientY}; svg.style.cursor='grabbing';
      try{ svg.setPointerCapture(e.pointerId); }catch(_){}
      e.preventDefault(); e.stopPropagation();
    });
    svg.addEventListener('pointermove',function(e){
      if(!drag||!controls||!controls.orbitBy) return;
      const k=2*Math.PI*NAV.rotateSpeed/220;          // küre ölçeği: attachOrbit ile aynı his (clientHeight yerine sabit)
      controls.orbitBy(-k*(e.clientX-drag.x), -k*(e.clientY-drag.y));
      drag.x=e.clientX; drag.y=e.clientY; updateOrb();
    });
    const end=function(e){ if(!drag) return; drag=null; svg.style.cursor='grab';
      try{ svg.releasePointerCapture(e.pointerId); }catch(_){} };
    svg.addEventListener('pointerup',end); svg.addEventListener('pointercancel',end);
  }

  // A2: persistent zoom bar (sağ-alt). overlay kurulunca BİR KEZ bağlanır; her render'da yeniden değil.
  function wireZoom(){
    const el=overlay&&overlay.querySelector('#v3dZoom'); if(!el) return; zoomEl=el;
    el.value=distToSlider(controls?controls.getDistance():22);
    el.addEventListener('input',function(){ zoomActive=true; if(controls) controls.setDistanceTarget(sliderToDist(+el.value)); });
    el.addEventListener('pointerdown',function(){ zoomActive=true; });
    // ＋ / − düğmeleri: tekerlekle aynı adım (0.9 / 1.111) — kilitliyken de çalışır (pan+zoom serbest)
    const step=function(inn){ if(!controls) return; zoomActive=true;
      const base=controls.getDistanceTarget?controls.getDistanceTarget():controls.getDistance();
      controls.setDistanceTarget(base*(inn?0.83:1.205));
      setTimeout(function(){ zoomActive=false; },80); };
    overlay.querySelectorAll('#v3dZoomBar [data-zoom]').forEach(function(b){
      b.addEventListener('click',function(){ step(b.getAttribute('data-zoom')==='in'); }); });
  }

  function ensureOverlay(){
    if(overlay) return;
    overlay=document.createElement('div');
    overlay.id='view3dOverlay';
    overlay.style.cssText='position:fixed;inset:0;z-index:9999;background:#15151a;display:none;';
    overlay.innerHTML =
      '<div id="v3dHost" style="position:absolute;inset:0"></div>'+
      '<div id="v3dDock" style="position:absolute;top:12px;right:12px;display:flex;align-items:flex-start;gap:8px;z-index:3">'+
        '<div id="v3dDrawer" style="background:rgba(34,34,40,.94);color:#e8e6e0;font:13px/1.45 system-ui,sans-serif;padding:13px 15px;border-radius:12px;width:250px;max-height:calc(100vh - 24px);overflow:auto;backdrop-filter:blur(7px);display:none"></div>'+
        '<div id="v3dRail" style="background:rgba(34,34,40,.94);border-radius:12px;padding:6px;display:flex;flex-direction:column;gap:5px;backdrop-filter:blur(7px)"></div>'+
      '</div>'+
      '<div id="v3dStatus" style="position:absolute;left:12px;bottom:12px;color:#e8e6e0;opacity:.6;font:10.5px system-ui;background:rgba(34,34,40,.6);padding:4px 9px;border-radius:7px"></div>'+
      // A2: HER görünümde görünen dikey zoom overlay (2B editör sağ-alt kontrolünün 3B ikizi). ＋ / dikey slider / −
      // A4: üstünde kuşbakışı KİLİT düğmesi (kamera/mobilya grubunda görünür). EMOJİ YOK — inline SVG.
      // R7: ORBIT KÜRESİ zoom slider'ın HEMEN SOLUNA, bitişik, aynı küme. Kolon yerine YATAY satır:
      //   sol = küre widget'ı (sphere+Üst/İzo), sağ = zoom kümesi (kilit + zoom bar). İkisi alt hizalı.
      '<div id="v3dViewCtl" style="position:absolute;right:14px;bottom:14px;z-index:4;display:flex;flex-direction:row;align-items:flex-end;gap:8px">'+
        // B1-1: YÖN KÜRESİ (viewcube) — üstünde sürükle=orbit (NAV hassasiyeti), hazır görüş noktaları (Üst/İzo/K-G-D-B).
        //   Kilitliyken İzo/yön seçmek kilidi açar ("dikine kaldım" çözümü). DOM/SVG — three.js sahne-içi küp DEĞİL.
        orbWidgetHTML()+
        '<div style="display:flex;flex-direction:column;align-items:center;gap:8px">'+
          '<button id="v3dLockBtn" title="Kuşbakışı kilidi" style="display:none;width:38px;height:38px;border:0;border-radius:10px;background:rgba(34,34,40,.94);color:#c9b79a;cursor:pointer;align-items:center;justify-content:center;backdrop-filter:blur(7px)"></button>'+
          '<div id="v3dZoomBar" style="display:flex;flex-direction:column;align-items:center;gap:6px;background:rgba(34,34,40,.94);padding:8px 6px;border-radius:12px;backdrop-filter:blur(7px)">'+
            '<button data-zoom="in" title="Yakınlaştır" style="width:28px;height:28px;border:0;border-radius:8px;background:rgba(255,255,255,.08);color:#f0e6d6;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0">'+ic('plus',15)+'</button>'+
            '<input type="range" id="v3dZoom" min="0" max="1000" value="600" title="Yakınlaştırma" style="writing-mode:vertical-lr;direction:rtl;-webkit-appearance:slider-vertical;width:22px;height:130px;accent-color:#c9a16b;cursor:pointer">'+
            '<button data-zoom="out" title="Uzaklaştır" style="width:28px;height:28px;border:0;border-radius:8px;background:rgba(255,255,255,.08);color:#f0e6d6;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0">'+ic('minus',15)+'</button>'+
          '</div>'+
        '</div>'+
      '</div>'+
      // B1-2: KAMERA DOCK — kamera moduna girince alt kenara yaslanır (setCamUI gösterir/gizler). İçeriği renderCamDock kurar.
      '<div id="v3dCamDock" style="position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:5;display:none;max-width:calc(100vw - 28px)"></div>'+
      // B2-1: MOBİLYA DOCK — mobilya grubuna girince alt kenara yaslanır (renderFurnDock kurar). Kamera dock ikizi.
      '<div id="v3dFurnDock" style="position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:5;display:none;max-width:calc(100vw - 28px)"></div>'+
      // M2: MALZEME DOCK — malzeme grubuna girince alt kenara yaslanır (renderMatDock kurar). Mobilya dock ikizi.
      '<div id="v3dMatDock" style="position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:5;display:none;max-width:calc(100vw - 28px)"></div>'+
      // B2-3: seçili mobilyanın yanında YÜZEN mini araç çubuğu (döndür/çoğalt/odakla/sil). loop'ta konumlanır.
      '<div id="v3dFurnBar" style="position:absolute;z-index:6;display:none;gap:4px;background:rgba(28,28,34,.96);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:5px;box-shadow:0 8px 26px rgba(0,0,0,.5);backdrop-filter:blur(8px)">'+
        '<button data-furnrot="-90" class="v3dfb" title="Sola 90°">'+ic('rotccw',15)+'</button>'+
        '<button data-furnrot="90" class="v3dfb" title="Sağa 90°">'+ic('rotcw',15)+'</button>'+
        '<button data-v3d="furndup" class="v3dfb" title="Çoğalt (Ctrl+D)">'+ic('copy',15)+'</button>'+
        '<button data-v3d="furnfocus" class="v3dfb" title="Odakla (F)">'+ic('target',15)+'</button>'+
        '<button data-v3d="furndel" class="v3dfb v3dfbdanger" title="Sil (Del)">'+ic('trash',15)+'</button>'+
      '</div>'+
      // B1-R (R2): CANLI PiP KAMERA ÖNİZLEMESİ — kamera SEÇİLİYKEN köşede 16:9 pencere.
      //   İçindeki görüntü loop()'ta scissor'lı İKİNCİ render pass ile çizilir (DOM canvas değil — aynı renderer).
      //   Başlıkta "Kx görüşü" + büyüt/kapat. Bu görüntü = B/img2img yolunda render'a giden referansın TA KENDİSİ.
      // container background ŞEFFAF (interior = canvas'ın göründüğü delik); yalnız header opak. border/gölge çerçeveyi çizer.
      '<div id="v3dPip" style="position:absolute;left:14px;bottom:60px;z-index:5;display:none;width:'+PIP_W+'px;background:transparent;border:1px solid rgba(255,255,255,.16);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.55);overflow:hidden;font:11px/1.3 system-ui,sans-serif;color:#e8e6e0">'+
        '<div id="v3dPipHead" style="display:flex;align-items:center;justify-content:space-between;gap:6px;padding:5px 6px 5px 9px;background:rgba(20,20,26,.94);backdrop-filter:blur(6px)">'+
          '<span id="v3dPipTitle" style="font-weight:700;font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Kamera görüşü</span>'+
          '<span style="display:flex;gap:3px;flex:none">'+
            '<button data-v3d="pipbig" id="v3dPipBig" title="Büyüt / küçült" style="width:22px;height:22px;border:0;border-radius:6px;background:rgba(255,255,255,.10);color:#f0e6d6;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0">'+ic('fit',13)+'</button>'+
            '<button data-v3d="pipclose" title="Önizlemeyi kapat" style="width:22px;height:22px;border:0;border-radius:6px;background:rgba(255,255,255,.10);color:#f0d8d8;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0">'+ic('close',13)+'</button>'+
          '</span>'+
        '</div>'+
        // gövde: ŞEFFAF pencere (16:9) — arkasındaki WebGL canvas'a scissor pass ile o kamera görüntüsü çizilir.
        //   Bu div OPAK OLMAMALI yoksa canvas render'ını örter (siyah kalır). pointer-events:none = tıklama alta geçer.
        '<div id="v3dPipBody" style="width:100%;height:'+Math.round(PIP_W*9/16)+'px;background:transparent;pointer-events:none"></div>'+
      '</div>'+
      // R8: WASD MİNİMAP — gezinti sırasında sol-altta kuşbakışı (ortho tepe kamera, sabit çerçeve, plan tamamı) +
      //   oyuncu konum/yön OKU (SVG overlay). Gövde ŞEFFAF (PiP deseni) → loop scissor-pass o bölgeye ortho-top çizer.
      //   Yalnız gezintide görünür (enter/exit toggle). pointer-events:none = tıklama alta geçer.
      '<div id="v3dMiniMap" style="position:absolute;left:14px;bottom:14px;z-index:8;display:none;width:'+MINI_W+'px;height:'+MINI_H+'px;background:rgba(20,20,26,.55);border:1px solid rgba(255,255,255,.18);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.5);overflow:hidden;pointer-events:none">'+
        '<div id="v3dMiniBody" style="position:absolute;inset:0;background:transparent"></div>'+
        '<svg id="v3dMiniMarker" viewBox="0 0 '+MINI_W+' '+MINI_H+'" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"></svg>'+
      '</div>';
    document.body.appendChild(overlay);
    // buton stilleri
    const st=document.createElement('style');
    st.textContent=
      '.v3db{display:inline-flex;align-items:center;justify-content:center;gap:5px;background:#c9a16b;color:#1a1a1f;border:0;padding:6px 10px;border-radius:7px;font-weight:600;cursor:pointer;font-size:11.5px;font-family:inherit}'+
      '.v3db:hover{filter:brightness(1.08)}'+
      '.v3dgreen{background:#7bbf8a;color:#13201a}.v3dgray{background:#3a3a44;color:#e8e6e0}.v3ddanger{background:#5a3a3a;color:#f0d8d8;flex:none;padding:6px 8px}'+
      '.v3dgh{font-size:12px;font-weight:700;letter-spacing:.04em;color:#c9a16b;text-transform:uppercase;margin-bottom:10px}'+
      '.v3dlbl{font-size:10.5px;opacity:.7;margin:8px 0 4px}.v3dnote{font-size:10px;opacity:.78;line-height:1.4}'+
      '.v3dchk{display:flex;align-items:center;gap:6px;font-size:11.5px;margin-top:8px;cursor:pointer}'+
      '.v3drailb{display:flex;align-items:center;justify-content:center;width:38px;height:38px;border:0;border-radius:9px;background:transparent;color:#c9b79a;cursor:pointer}'+
      '.v3drailb:hover{background:rgba(255,255,255,.08);color:#f0e6d6}.v3drailb.on{background:#c9a16b;color:#1a1a1f}'+
      '.v3drailx{color:#cf9b9b}.v3drailx:hover{background:rgba(200,90,90,.22);color:#f0d8d8}'+
      '.v3draild{height:1px;background:rgba(255,255,255,.15);margin:3px 4px}'+
      '.v3dorbb{flex:1;background:rgba(255,255,255,.08);color:#f0e6d6;border:0;border-radius:7px;padding:4px 0;font-size:10px;font-weight:700;cursor:pointer;font-family:inherit}'+
      '.v3dorbb:hover{background:#c9a16b;color:#1a1a1f}'+
      // B1-R kamera dock — KOMPAKT: kapalıyken tek yatay bar (~56px), özet çipe tıkla → detay katmanı açılır (~+100px)
      '#v3dCamDock .dk{background:rgba(28,28,34,.95);color:#e8e6e0;border:1px solid rgba(255,255,255,.09);border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.5);backdrop-filter:blur(9px);padding:7px 10px;display:flex;flex-direction:column;gap:0;font:12px/1.4 system-ui,sans-serif}'+
      '#v3dCamDock .bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;max-width:min(92vw,860px)}'+
      '#v3dCamDock .sep{width:1px;background:rgba(255,255,255,.10);align-self:stretch;margin:1px 1px}'+
      '#v3dCamDock .lbl{font-size:9px;letter-spacing:.05em;text-transform:uppercase;opacity:.6;font-weight:700;margin-bottom:2px}'+
      '#v3dCamDock .row{display:flex;gap:5px;align-items:center;flex-wrap:wrap}'+
      '#v3dCamDock .strip{display:flex;gap:5px;flex-wrap:wrap;max-width:340px}'+
      '#v3dCamDock .seg button{background:#33333c;color:#e8e6e0;border:0;border-radius:7px;padding:5px 9px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit}'+
      '#v3dCamDock .seg button:hover{filter:brightness(1.12)}'+
      '#v3dCamDock .seg button.on{background:#c9a16b;color:#1a1a1f}'+
      '#v3dCamDock .seg button.green.on{background:#7bbf8a;color:#13201a}'+
      // ikon eylem düğmeleri (Yön/Taşı/Odakla/Sil) — kompakt kare
      '#v3dCamDock .ib{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;background:#33333c;color:#e8e6e0;border:0;border-radius:8px;cursor:pointer;font-family:inherit;padding:0}'+
      '#v3dCamDock .ib:hover{filter:brightness(1.15)}#v3dCamDock .ib.on{background:#e0843a;color:#1a1a1f}#v3dCamDock .ib.danger{background:#5a3a3a;color:#f0d8d8}'+
      // seçili kamera ÖZET çipi — tıkla → detay aç/kapa
      '#v3dCamDock .sum{display:inline-flex;align-items:center;gap:6px;background:#2c2c33;border:1px solid rgba(255,255,255,.12);color:#e8e6e0;border-radius:9px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap}'+
      '#v3dCamDock .sum:hover{border-color:rgba(201,161,107,.6)}#v3dCamDock .dk.detopen .sum{background:#c9a16b;color:#1a1a1f;border-color:#c9a16b}'+
      '#v3dCamDock .sum .caret{opacity:.7;font-size:9px}'+
      '#v3dCamDock input[type=range]{accent-color:#c9a16b;cursor:pointer;height:18px}'+
      '#v3dCamDock .val{font-size:10.5px;opacity:.8;min-width:44px;text-align:right;font-variant-numeric:tabular-nums}'+
      '#v3dCamDock .more{background:none;border:0;color:#c9a16b;font-size:10.5px;font-weight:700;cursor:pointer;padding:2px 0;font-family:inherit;text-align:left}'+
      // detay katmanı — kapalı varsayılan; özet çipe tıkla → açılır. Kompakt satırlar (yatay grup).
      '#v3dCamDock .det{display:none;gap:14px;align-items:flex-start;flex-wrap:wrap;border-top:1px solid rgba(255,255,255,.09);margin-top:8px;padding-top:9px}'+
      '#v3dCamDock .dk.detopen .det{display:flex}'+
      '#v3dCamDock .dcol{display:flex;flex-direction:column;gap:5px;min-width:0}'+
      '#v3dCamDock .adv{display:none;flex-direction:column;gap:6px}'+
      '#v3dCamDock .dk.advopen .adv{display:flex}'+
      '#v3dCamDock textarea{width:230px;max-width:40vw;box-sizing:border-box;background:#26262c;color:#e8e6e0;border:1px solid #3a3a44;border-radius:6px;font:11px/1.45 system-ui;padding:6px;resize:vertical}'+
      '#v3dCamDock img.snap{width:180px;max-width:34vw;display:block;border-radius:6px;border:1px solid #3a3a44;background:#111;cursor:pointer}'+
      // B2-1 mobilya dock (kamera dock görsel dilini paylaşır)
      // U4: .dk KATLANMAZ (nowrap) → dock TEK satır kolon = SABİT yükseklik; taşarsa yatay kaydırır (dikey büyümez)
      '#v3dFurnDock .dk{background:rgba(28,28,34,.95);color:#e8e6e0;border:1px solid rgba(255,255,255,.09);border-radius:16px;box-shadow:0 14px 40px rgba(0,0,0,.5);backdrop-filter:blur(9px);padding:12px 14px;display:flex;gap:14px;align-items:stretch;flex-wrap:nowrap;max-width:calc(100vw - 28px);overflow-x:auto;font:12px/1.4 system-ui,sans-serif}'+
      '#v3dFurnDock .col{display:flex;flex-direction:column;gap:7px;min-width:0}'+
      '#v3dFurnDock .sep{width:1px;background:rgba(255,255,255,.10);align-self:stretch}'+
      '#v3dFurnDock .lbl{font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;opacity:.62;font-weight:700;margin-bottom:1px}'+
      '#v3dFurnDock .row{display:flex;gap:5px;align-items:center;flex-wrap:wrap}'+
      '#v3dFurnDock .seg button{background:#33333c;color:#e8e6e0;border:0;border-radius:7px;padding:5px 9px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit}'+
      '#v3dFurnDock .seg button:hover{filter:brightness(1.12)}'+
      '#v3dFurnDock .seg button.on{background:#c9a16b;color:#1a1a1f}'+
      // R4: KATEGORİ = ÇİP SARMASI (hepsi görünür, SCROLL YOK) → yatay kaydırma kaldırıldı.
      '#v3dFurnDock .cats{display:flex;gap:4px;flex-wrap:wrap;max-width:118px}'+
      '#v3dFurnDock .cat{background:#33333c;color:#c9b79a;border:0;border-radius:7px;padding:5px 8px;font-size:10.5px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;flex:0 0 auto}'+
      '#v3dFurnDock .cat:hover{filter:brightness(1.15)}#v3dFurnDock .cat.on{background:#c9a16b;color:#1a1a1f}'+
      // R4: PARÇA ızgarası SABİT 2 SATIR × 6 SÜTUN, SCROLL YOK. Thumb küçültüldü → en kalabalık kategori (12 parça)
      //   iki satıra sığar; dock yüksekliği HİÇBİR durumda değişmez (2-satır alanı sabit rezerve).
      '#v3dFurnDock .palwrap{position:relative;flex:none;width:302px}'+
      '#v3dFurnDock .palgrid{display:grid;grid-template-columns:repeat(6,46px);grid-template-rows:repeat(2,auto);grid-auto-flow:row;gap:4px;padding:0 2px;overflow:visible}'+
      '#v3dFurnDock .pit{display:flex;flex-direction:column;align-items:center;gap:1px;background:#2c2c33;border:1px solid transparent;border-radius:8px;padding:3px 2px;cursor:pointer;font-family:inherit;width:46px}'+
      '#v3dFurnDock .pit:hover{background:#3a3a44;border-color:rgba(201,161,107,.5)}'+
      '#v3dFurnDock .pit.on{border-color:#7bbf8a;background:#33403a}'+
      '#v3dFurnDock .pit svg{width:22px;height:22px}'+
      '#v3dFurnDock .pit .pn{font-size:8px;line-height:1.1;color:#d8d2c6;text-align:center;max-width:44px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
      // R5: KONTRAST FIX — global label{background:#fbfaf7} sızıntısı 'Render\'a mobilya ekle' metnini görünmez yapıyordu
      //   (bg ~beyaz + color ~beyaz). Dock arka planında açık metin + saydam arka planı zorla.
      '#v3dFurnDock .chk{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:600;cursor:pointer;background:transparent;color:#e8e6e0;border:0;padding:0;box-shadow:none}'+
      '#v3dFurnDock .chk input{width:15px;height:15px;accent-color:#7bbf8a;cursor:pointer}'+
      // R3: MALZEME DOCK — kamera dock kadar mütevazı: TEK yatay satır, SABİT yükseklik, sarma YOK (görünümü kapatmaz).
      '#v3dMatDock .dk{background:rgba(28,28,34,.95);color:#e8e6e0;border:1px solid rgba(255,255,255,.09);border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.5);backdrop-filter:blur(9px);padding:7px 10px;display:flex;gap:10px;align-items:center;flex-wrap:nowrap;max-width:min(94vw,880px);font:12px/1.4 system-ui,sans-serif}'+
      '#v3dMatDock .grp{display:flex;align-items:center;gap:6px;flex-wrap:nowrap;min-width:0}'+
      '#v3dMatDock .sep{width:1px;height:26px;background:rgba(255,255,255,.1);flex:none}'+
      '#v3dMatDock .lbl{font-size:9px;letter-spacing:.05em;text-transform:uppercase;opacity:.6;font-weight:700;flex:none}'+
      '#v3dMatDock .sws{display:flex;gap:4px;flex-wrap:nowrap}'+
      '#v3dMatDock .sw{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;background:#2c2c33;border:1px solid transparent;border-radius:7px;padding:0;cursor:pointer;font-family:inherit;flex:none}'+
      '#v3dMatDock .sw:hover{border-color:rgba(201,161,107,.6)}'+
      '#v3dMatDock .sw.on{border-color:#7bbf8a}'+
      '#v3dMatDock .sw .chip{width:20px;height:20px;border-radius:4px;border:1px solid rgba(0,0,0,.25)}'+
      '#v3dMatDock .roomtag{background:#c9a16b;color:#1a1a1f;border-radius:7px;padding:3px 8px;font-weight:700;font-size:11px;white-space:nowrap;flex:none}'+
      '#v3dMatDock .wet{opacity:.7;font-size:9.5px;flex:none}'+
      '#v3dMatDock .reset{background:#33333c;color:#e8e6e0;border:0;border-radius:7px;padding:5px 9px;font-size:10.5px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;flex:none}'+
      '#v3dMatDock .reset:hover{filter:brightness(1.15)}'+
      '#v3dMatDock .hint{font-size:10.5px;opacity:.72;white-space:nowrap;flex:none}'+
      // B2-3 yüzen mini araç çubuğu
      '.v3dfb{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:0;border-radius:8px;background:#33333c;color:#e8e6e0;cursor:pointer;padding:0}'+
      '.v3dfb:hover{background:#c9a16b;color:#1a1a1f}.v3dfbdanger{background:#5a3a3a;color:#f0d8d8}.v3dfbdanger:hover{background:#7a3a3a;color:#fff}'+
      // boyalı plan = sol-üstte küçük lightbox küçük-resmi (tıkla→büyüt); slider/split KALDIRILDI (mesh tam genişlik)
      '#v3dCompareThumb{position:absolute;left:14px;top:14px;z-index:6;width:190px;max-width:38%;background:rgba(24,22,28,.94);border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:8px;box-shadow:0 12px 32px rgba(0,0,0,.5);cursor:zoom-in;transition:transform .12s,box-shadow .12s}'+
      '#v3dCompareThumb:hover{transform:translateY(-1px);box-shadow:0 16px 40px rgba(0,0,0,.62)}'+
      '#v3dCompareThumb #v3dRefImg{display:block;width:100%;border-radius:8px;background:#0e0c0a}'+
      '#v3dCompareThumb .v3dcap{display:flex;align-items:center;justify-content:space-between;gap:6px;color:#e8e6e0;font:11px/1.3 system-ui;margin:6px 2px 1px}'+
      '#v3dCompareThumb .v3dcap .exp{display:inline-flex;align-items:center;gap:3px;opacity:.72}'+
      '#v3dCompareLB{position:absolute;inset:0;z-index:40;background:rgba(8,7,10,.9);display:none;align-items:center;justify-content:center;cursor:zoom-out;padding:30px}'+
      '#v3dCompareLB img{max-width:94%;max-height:94%;object-fit:contain;border-radius:10px;box-shadow:0 24px 70px rgba(0,0,0,.6)}'+
      '#v3dAngleWarn{margin-top:8px;background:rgba(192,73,43,.96);color:#fff;border-radius:8px;padding:8px 9px;font:11px/1.35 system-ui;display:none}'+
      '#v3dAngleWarn button{margin-top:7px;background:#fff;color:#7a2c18;border:0;border-radius:6px;padding:6px 9px;font-weight:700;font-size:11px;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:5px}';
    document.head.appendChild(st);
    host=overlay.querySelector('#v3dHost');
    status=overlay.querySelector('#v3dStatus');
    overlay.addEventListener('click',function(e){
      // B1-R (R3): ölü delege dalları temizlendi — hiçbir öğe artık şunları YAYMIYOR:
      //   data-furntype/furnsel/furndel/furndesel/furnact (B2 mobilya paleti hayalet-akışına geçti),
      //   data-camdel (silme yalnız data-v3d="camdel" ikonundan). Selektörden + handler'dan kaldırıldı.
      const t=e.target.closest&&e.target.closest('[data-grp],[data-camh],[data-caml],[data-cammethod],[data-camtime],[data-camact],[data-camsel],[data-camdesel],[data-furnrot],[data-furncat],[data-furnpick],[data-matslot],[data-v3d]')||e.target;
      const gp=t.getAttribute&&t.getAttribute('data-grp'); if(gp){ if(gp==='walk'){ toggleWalk(); return; } setGroup(gp); return; }
      const ch=t.getAttribute&&t.getAttribute('data-camh'); if(ch){ setCamHeight(ch); return; }
      const cl=t.getAttribute&&t.getAttribute('data-caml'); if(cl){ setCamLens(+cl); return; }
      const cm=t.getAttribute&&t.getAttribute('data-cammethod'); if(cm){ setCamRenderMethod(cm); return; }
      const ctm=t.getAttribute&&t.getAttribute('data-camtime'); if(ctm){ setTimeOfDay(ctm, activeCamIdx>=0); return; }   // B1-4: kamera seçiliyse override, değilse global
      const ca=t.getAttribute&&t.getAttribute('data-camact'); if(ca){ setPlaceAction(ca); return; }
      const cs=t.getAttribute&&t.getAttribute('data-camsel'); if(cs!=null&&cs!==''){ selectCam(+cs); return; }
      const cdz=t.getAttribute&&t.getAttribute('data-camdesel'); if(cdz){ deselectCam(); return; }   // çip × = seçimi bırak (silmez)
      const fca=t.getAttribute&&t.getAttribute('data-furncat'); if(fca!=null&&fca!==''){ furnDockCat=+fca; renderFurnDock(); return; }   // B2-1: kategori sekmesi
      const fpk=t.getAttribute&&t.getAttribute('data-furnpick'); if(fpk){ startFurnGhost(fpk); return; }   // B2-1: palet parçası → hayalet yerleştirme
      const mslot=t.getAttribute&&t.getAttribute('data-matslot'); if(mslot){ applyMaterial(mslot, t.getAttribute('data-matkey')); return; }   // M2: swatch → oda malzemesi
      const fr=t.getAttribute&&t.getAttribute('data-furnrot'); if(fr){ rotateFurn(+fr); return; }
      const a=t.getAttribute&&t.getAttribute('data-v3d'); if(!a) return;
      if(a==='close') close();
      else if(a==='iso'||a==='top'||a==='persp') setView(a);
      else if(a==='fit') fitView();
      else if(a==='png') snap();
      else if(a==='place') togglePlaceMode();
      else if(a==='camclear') clearCams();
      else if(a==='camprompreset'){ if(activeCamIdx>=0){ camList[activeCamIdx].promptEdited=false; updateCamRender(); } }   // prompt'u otomatiğe döndür
      else if(a==='camdel'){ if(activeCamIdx>=0) removeCam(activeCamIdx); }
      else if(a==='furnfocus'){ if(activeFurnIdx>=0) focusFurn(activeFurnIdx); }   // A3: seçili mobilyaya odakla
      else if(a==='furndup'){ if(activeFurnIdx>=0) duplicateFurn(activeFurnIdx); }   // B2-3: mini çubuk çoğalt
      else if(a==='camfocus'){ if(activeCamIdx>=0) focusCam(activeCamIdx); }        // A3: seçili kameraya odakla
      else if(a==='furndel'){ if(activeFurnIdx>=0) removeFurn(activeFurnIdx); }
      else if(a==='furnclear') clearFurn();
      else if(a==='matreset') resetRoomMaterial();   // M2: seçili oda malzemesini renk-koda döndür
      else if(a==='matauto') applyMaterialsByType();  // R2: tüm odalara tür-bazlı malzeme
      else if(a==='matresetall') resetAllMaterials(); // R2: tüm odaları renk-koda döndür
      else if(a==='furnauto') autoFurnishAll();
      else if(a==='furnrender'){ if(t.checked) autoFurnishAll(); else clearFurn(); }   // render on/off: döşe ↔ boşalt (snap mobilyalı/boş gider)
      else if(a==='rerender') doReRender();
      else if(a==='pipbig') togglePipBig();                  // B1-R (R2): PiP büyüt/küçült
      else if(a==='pipclose') closePip();                    // B1-R (R2): PiP kapat (yeni kamera seçince geri gelir)
      else if(a==='roof'){ roofOn=t.checked; applyRoof(); }
      else if(a==='lbl'){ lblOn=t.checked; if(scene&&scene.__labels) scene.__labels.visible=lblOn; }
    });
    // A2: persistent zoom bar bir kez bağlanır (çekmeceden bağımsız, HER görünümde açık)
    window.addEventListener('pointerup',function(){ zoomActive=false; });
    wireZoom(); wireOrb();
    const lb=overlay.querySelector('#v3dLockBtn'); if(lb) lb.addEventListener('click',toggleTopLock);
    renderRail(); renderDrawer();
  }

  // slider 0..1000  ↔  kamera mesafesi (log ölçek; 1000=en yakın)
  function sliderToDist(v){ if(!controls) return 22;
    const lo=Math.log(controls.minDistance),hi=Math.log(controls.maxDistance);
    return Math.exp(hi-(hi-lo)*(v/1000)); }
  function distToSlider(dd){ if(!controls) return 600;
    const lo=Math.log(controls.minDistance),hi=Math.log(controls.maxDistance);
    const d=Math.max(controls.minDistance,Math.min(controls.maxDistance,dd));
    return Math.round(1000*(hi-Math.log(d))/(hi-lo)); }

  function loadThree(){
    if(window.THREE) return Promise.resolve();
    if(threeLoading) return threeLoading;
    threeLoading=new Promise(function(res,rej){
      const s=document.createElement('script'); s.src=THREE_URL;
      s.onload=res; s.onerror=function(){ rej(new Error('three.js yüklenemedi (internet?)')); };
      document.head.appendChild(s);
    });
    return threeLoading;
  }

  // ── 3B-UX-A1: GEZİNME AYARLARI — tek yer (motor değil, view3d yerel). Kullanıcı geri bildirimi:
  //   "döndürme hassasiyeti de kaydırma da kötü" → hassasiyet DÜŞÜK + kısa/taşmayan sönümleme.
  // rotateSpeed: eski 0.78 çok tepkiliydi → 0.5 (daha sakin çevirme).
  // rotDamp:    dönme ataleti sönümü (yüksek = daha çabuk durur, taşma az). eski dampingFactor 0.12 → 0.2.
  // panSpeed:   kaydırma çarpanı (1 = piksel-tam). 0.85 → biraz daha kontrollü.
  // panDamp:    kaydırma ataleti sönümü (rotDamp ikizi). eskiden pan aynı dampingFactor'ü kullanıyordu.
  // zoomDamp:   damped-zoom yaklaşım oranı (yüksek = daha çabuk oturur). 0.16 korundu (his iyiydi).
  // tweenMs:    seçili-objeye/kilide yumuşak hedef geçişi süresi (A3/A4). kısa, snap değil.
  const NAV = { rotateSpeed:0.5, rotDamp:0.2, panSpeed:0.85, panDamp:0.2, zoomDamp:0.16, tweenMs:280 };
  // ---- minimal OrbitControls (r128) — damped rotasyon + damped zoom (radiusTarget) ----
  function attachOrbit(o,d){
    const c={object:o,domElement:d,target:new THREE.Vector3(),enabled:true,
      enableDamping:true,dampingFactor:NAV.rotDamp,rotateSpeed:NAV.rotateSpeed,zoomDamp:NAV.zoomDamp,
      panDamp:NAV.panDamp,noRotate:false,
      minDistance:3,maxDistance:800,maxPolarAngle:Math.PI/2.02};
    let sph=new THREE.Spherical(),sphD=new THREE.Spherical(),panOff=new THREE.Vector3(),
      radiusTarget=null,rotS=new THREE.Vector2(),rotE=new THREE.Vector2(),panS=new THREE.Vector2(),state=-1;
    function clampD(r){ return Math.max(c.minDistance,Math.min(c.maxDistance,r)); }
    c.update=function(){
      if(!c.enabled){ sphD.set(0,0,0); panOff.set(0,0,0); }   // kilitliyken döndür/kaydır ataletini sıfırla (zoom slider'ı çalışır kalır)
      const q2=new THREE.Quaternion().setFromUnitVectors(o.up,new THREE.Vector3(0,1,0));
      const qi=(q2.clone().invert?q2.clone().invert():q2.clone().inverse());
      const off=new THREE.Vector3().copy(o.position).sub(c.target).applyQuaternion(q2);
      sph.setFromVector3(off); sph.theta+=sphD.theta; sph.phi+=sphD.phi;
      sph.phi=Math.max(0.01,Math.min(c.maxPolarAngle,sph.phi)); sph.makeSafe();
      if(radiusTarget==null) radiusTarget=sph.radius; radiusTarget=clampD(radiusTarget);
      sph.radius+=(radiusTarget-sph.radius)*c.zoomDamp; sph.radius=clampD(sph.radius);  // damped zoom
      applyTargetTween();                                     // A3/A4: hedef yumuşak geçişi (aktifse target'ı çeker)
      c.target.add(panOff);
      if(vtActive){ applyViewTween(); }                       // A4: açı tween'i aktifse KAMERA konumunu o sürer (pan yine target'a uygulandı)
      else { off.setFromSpherical(sph).applyQuaternion(qi); o.position.copy(c.target).add(off); o.lookAt(c.target); }
      if(c.enableDamping){ sphD.theta*=(1-c.dampingFactor); sphD.phi*=(1-c.dampingFactor); panOff.multiplyScalar(1-c.panDamp); }
      else { sphD.set(0,0,0); panOff.set(0,0,0); }
    };
    // A3/A4: controls.target'ı hedef noktaya kısa tween ile taşı (zoom mesafesi DEĞİŞMEZ — sadece bakış noktası)
    let twFrom=null, twTo=null, twT0=0, twMs=NAV.tweenMs;
    c.tweenTarget=function(pt,ms){ if(!pt) return; twFrom=c.target.clone(); twTo=new THREE.Vector3(pt.x,(pt.y!=null?pt.y:c.target.y),pt.z); twT0=(typeof performance!=='undefined'?performance.now():Date.now()); twMs=(ms!=null?ms:NAV.tweenMs); };
    c.cancelTween=function(){ twFrom=twTo=null; };
    function applyTargetTween(){ if(!twTo) return;
      const now=(typeof performance!=='undefined'?performance.now():Date.now()), k=twMs>0?Math.min(1,(now-twT0)/twMs):1;
      const e=k<0.5?2*k*k:1-Math.pow(-2*k+2,2)/2;             // easeInOutQuad (kısa, taşmayan)
      c.target.lerpVectors(twFrom,twTo,e);
      if(k>=1){ twFrom=twTo=null; } }
    c.getDistance=function(){ return o.position.distanceTo(c.target); };
    c.getDistanceTarget=function(){ return radiusTarget==null?c.getDistance():radiusTarget; };
    c.setDistanceTarget=function(r){ radiusTarget=clampD(r); };
    // A4: kamera açısını YUMUŞAK tween'le kuşbakışına (ya da kaydedilmiş açıya) taşı. Mesafe KORUNUR.
    // phiEnd: hedef polar açı (kuşbakışı ~0.02 rad = neredeyse tepeden). thetaEnd: azimut (verilirse).
    let vtActive=false, vtT0=0, vtMs=NAV.tweenMs, vtPhi0=0, vtPhi1=0, vtHasTheta=false, vtTheta0=0, vtTheta1=0;
    function currentSph(){ const q2=new THREE.Quaternion().setFromUnitVectors(o.up,new THREE.Vector3(0,1,0));
      const off=new THREE.Vector3().copy(o.position).sub(c.target).applyQuaternion(q2); const s=new THREE.Spherical().setFromVector3(off); return s; }
    c.tweenToAngle=function(phiEnd, thetaEnd, ms){ const s=currentSph();
      vtPhi0=s.phi; vtPhi1=Math.max(0.01,Math.min(c.maxPolarAngle,phiEnd));
      vtHasTheta=(thetaEnd!=null); vtTheta0=s.theta; vtTheta1=(thetaEnd!=null?thetaEnd:s.theta);
      vtMs=(ms!=null?ms:NAV.tweenMs); vtT0=(typeof performance!=='undefined'?performance.now():Date.now()); vtActive=true; sphD.set(0,0,0); };
    c.cancelViewTween=function(){ vtActive=false; };
    c.isViewTweening=function(){ return vtActive; };
    // B1-1: yön küresi (viewcube) için — mevcut açıyı OKU (theta azimut, phi polar) + doğrudan NUDGE et.
    // Küre sürüklemesi bunu NAV hassasiyetiyle besler; tween'i keser (kullanıcı tutunca serbest orbit).
    c.getSph=function(){ const s=currentSph(); return { theta:s.theta, phi:s.phi, radius:s.radius }; };
    c.orbitBy=function(dTheta,dPhi){ vtActive=false; sphD.theta+=dTheta; sphD.phi+=dPhi; };
    function applyViewTween(){ if(!vtActive) return;
      const now=(typeof performance!=='undefined'?performance.now():Date.now()), k=vtMs>0?Math.min(1,(now-vtT0)/vtMs):1;
      const e=k<0.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
      const s=currentSph();                                   // mevcut radius/theta'yı koru, phi'yi (ve gerekiyorsa theta'yı) sür
      s.phi=vtPhi0+(vtPhi1-vtPhi0)*e; if(vtHasTheta) s.theta=vtTheta0+(vtTheta1-vtTheta0)*e; s.makeSafe();
      const q2=new THREE.Quaternion().setFromUnitVectors(o.up,new THREE.Vector3(0,1,0));
      const qi=(q2.clone().invert?q2.clone().invert():q2.clone().inverse());
      const off=new THREE.Vector3().setFromSpherical(s).applyQuaternion(qi);
      o.position.copy(c.target).add(off); o.lookAt(c.target);
      if(k>=1) vtActive=false;
    }
    // konum dışarıdan set edildiyse (setView/fit) hedefi mevcut mesafeye sabitle + atalet sıfırla
    c.sync=function(){ radiusTarget=clampD(o.position.distanceTo(c.target)); sphD.set(0,0,0); panOff.set(0,0,0); c.cancelTween(); };
    function pan(dx,dy){ const off=new THREE.Vector3().copy(o.position).sub(c.target),
      td=off.length()*Math.tan((o.fov/2)*Math.PI/180), ps=NAV.panSpeed;
      const X=new THREE.Vector3().setFromMatrixColumn(o.matrix,0).multiplyScalar(-2*dx*ps*td/d.clientHeight);
      const Y=new THREE.Vector3().setFromMatrixColumn(o.matrix,1).multiplyScalar(2*dy*ps*td/d.clientHeight);
      panOff.add(X).add(Y); }
    // A4: noRotate (kuşbakışı kilidi) → sol-sürükle döndürMEZ, KAYDIRIR (pan+zoom serbest kalır)
    function down(e){ if(!c.enabled) return;   // kamera yerleştirme açıkken mesh kilitli (döndür/kaydır kapalı)
      c.cancelTween();                                                         // kullanıcı tutunca tween'i bırak
      if(e.button===0 && !spacePan && !c.noRotate){ state=0; rotS.set(e.clientX,e.clientY); }    // sol = döndür
      else { state=2; panS.set(e.clientX,e.clientY); d.style.cursor='grabbing'; }  // sağ/orta VEYA Space+sol VEYA kilit = kaydır
      window.addEventListener('mousemove',move); window.addEventListener('mouseup',up); }
    function move(e){ if(!c.enabled) return;   // kilit sürüş ortasında devreye girerse hareketi kes
      if(state===0){ rotE.set(e.clientX,e.clientY);
        const k=2*Math.PI*c.rotateSpeed/d.clientHeight;
        sphD.theta-=k*(rotE.x-rotS.x); sphD.phi-=k*(rotE.y-rotS.y); rotS.copy(rotE); }
      else if(state===2){ pan(e.clientX-panS.x,e.clientY-panS.y); panS.set(e.clientX,e.clientY); } }
    function up(){ window.removeEventListener('mousemove',move); window.removeEventListener('mouseup',up); state=-1; d.style.cursor=spacePan?'grab':''; }
    function wheel(e){ e.preventDefault(); if(!c.enabled) return;   // kilitliyken tekerlek-zoom da kapalı (panel zoom slider'ı açık kalır)
      if(furnMode && activeFurnIdx>=0) return;                      // mobilya seçili → tekerlek onu döndürür (attachPicker), zoom yapma
      const base=(radiusTarget==null?c.getDistance():radiusTarget);
      c.setDistanceTarget(base*(e.deltaY<0?0.9:1.111)); }         // zoom mesafesi ayrı — hedef-tween'e dokunmaz (target sabit kalır)
    // Space basılı tut → sol-sürükle KAYDIRIR (2B editör konvansiyonu); bırakınca döndürmeye döner
    function isTyping(t){ return t&&(t.isContentEditable||t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'); }
    function keyDown(e){ if(e.code!=='Space'&&e.key!==' ') return; if(!c.enabled||isTyping(e.target)) return;
      if(overlay&&overlay.style.display==='none') return;          // 3B kapalıyken karışma (2B editörün kendi spacePan'i var)
      if(!spacePan){ spacePan=true; if(state!==2) d.style.cursor='grab'; } e.preventDefault(); }
    function keyUp(e){ if(e.code!=='Space'&&e.key!==' ') return; if(spacePan){ spacePan=false; if(state!==2) d.style.cursor=''; } }
    d.addEventListener('mousedown',down); d.addEventListener('wheel',wheel,{passive:false});
    d.addEventListener('contextmenu',function(e){e.preventDefault();});
    window.addEventListener('keydown',keyDown); window.addEventListener('keyup',keyUp);
    window.addEventListener('blur',function(){ if(spacePan){ spacePan=false; d.style.cursor=''; } });   // odak kaybında takılı kalmasın
    return c;
  }

  function px2m(map,x,y){
    const mpp=map.scale.metersPerPixel, o=map.scale.origin_px;
    return [ (x-o[0])*mpp, (y-o[1])*mpp ];
  }
  function shapeFrom(poly,map){
    const s=new THREE.Shape();
    poly.forEach(function(p,i){ const m=px2m(map,p[0],p[1]); i?s.lineTo(m[0],m[1]):s.moveTo(m[0],m[1]); });
    return s;
  }

  function buildScene(map){
    // sahneyi temizle
    while(scene.children.length) scene.remove(scene.children[0]);
    camGizmos=null; pendingPos=null;                        // eski gizmo grubu sahneyle gitti (camList korunur)
    scene.add(new THREE.AmbientLight(0xfff0e0,0.38));   // kısık ambient → gölgeler belirgin
    const key=new THREE.DirectionalLight(0xffe2b8,1.45); key.position.set(16,34,12); key.castShadow=true;
    key.shadow.mapSize.set(2048,2048); key.shadow.bias=-0.0004; key.shadow.normalBias=0.05;   // Q1/Q6: normalBias → ince mobilya panelleri + duvar-zemin ekinde gölge-akne (moiré şerit) biter; sırt paneli net okunur
    // gölge kamerası bina ölçeğine göre (aşağıda minX.. hesaplanınca güncellenir)
    const sc=key.shadow.camera; sc.near=1; sc.far=160; sc.left=-40; sc.right=40; sc.top=40; sc.bottom=-40;
    scene.add(key);
    const fill=new THREE.DirectionalLight(0xbcd4ff,0.22); fill.position.set(-20,18,-16); scene.add(fill);
    scene.__key=key;

    const rooms=[];
    (map.units||[]).forEach(function(u){ (u.rooms||[]).forEach(function(r){
      if(r.polygon_px&&r.polygon_px.length>=3) rooms.push(r); }); });
    (map.common_areas||[]).forEach(function(c){ if(c.polygon_px&&c.polygon_px.length>=3) rooms.push(c); });

    // merkezle
    let minX=1e9,minZ=1e9,maxX=-1e9,maxZ=-1e9;
    rooms.forEach(function(o){ o.polygon_px.forEach(function(p){ const m=px2m(map,p[0],p[1]);
      minX=Math.min(minX,m[0]);maxX=Math.max(maxX,m[0]);minZ=Math.min(minZ,m[1]);maxZ=Math.max(maxZ,m[1]); }); });
    const cx=(minX+maxX)/2, cz=(minZ+maxZ)/2;
    // fit için: model merkezde (0,0,0); gerçek yarı-genişlikler (sıkı köşe-projeksiyonu fit'i)
    scene.__hx=(maxX-minX)/2; scene.__hz=(maxZ-minZ)/2;
    scene.__cx=cx; scene.__cz=cz; scene.__map=map;          // world↔px ters çevirim + kamera export için
    scene.__span=Math.hypot(maxX-minX, maxZ-minZ);          // sahne çapı (C6 depth-map far aralığı)
    const G=new THREE.Group(); G.position.set(-cx,0,-cz); scene.add(G); scene.__floorGroup=G;
    const walls=new THREE.Group(); walls.position.set(-cx,0,-cz); scene.add(walls); scene.__walls=walls;
    const lintels=new THREE.Group(); lintels.position.set(-cx,0,-cz); lintels.visible=roofOn; scene.add(lintels); scene.__lintels=lintels;
    const labels=new THREE.Group(); labels.position.set(-cx,0,-cz); labels.visible=lblOn; scene.add(labels); scene.__labels=labels;
    // mobilya grubu — zemin/duvar gibi -cx,-cz ofsetli (pos MUTLAK metre). __floorGroup'a KOYMA:
    // o grup kamera-yerleştirme raycast'i; mobilya oraya girerse kullanıcı "kanepenin üstüne kamera" koyar.
    const furn=new THREE.Group(); furn.position.set(-cx,0,-cz); scene.add(furn); scene.__furnitureGroup=furn;
    // C3-4: TAVAN grubu — oda poligonlarını duvar üstü yüksekliğinde örten mat açık düzlem. VARSAYILAN GİZLİ;
    //   yalnız kamera bakış pass'lerinde (snapCameraDataURL + PiP) açılır → iso/ana dollhouse AÇIK ÇATI kalır.
    const ceil=new THREE.Group(); ceil.position.set(-cx,0,-cz); ceil.visible=false; scene.add(ceil); scene.__ceiling=ceil;
    // W5: GÖRÜNMEZ ÇARPIŞMA seti — WASD gezinti ray'i GÖRSELDEN AYRI bu tam-kalınlık kutulara atar.
    //   U1 duvar boyaması duvarları oda-başına yarım-kalınlık görsel kutulara böldü → ray yarımlar
    //   arasından/boştan kaçabiliyordu ("duvarların içinden geçebiliyoruz"). Bu set duvar koşusu başına
    //   tam-WALL_T kutu (kapı boşlukları oyuk, pencere parapetli); render'a girmez (visible=false).
    const collide=new THREE.Group(); collide.position.set(-cx,0,-cz); collide.visible=false; scene.add(collide); scene.__colliders=collide;
    const matCollide=new THREE.MeshBasicMaterial({visible:false});   // W5: hiç çizilmez, yalnız raycast hedefi
    function addCollider(mx,mz,segLen,thick,ang){
      if(segLen<0.04) return;
      const cm=new THREE.Mesh(new THREE.BoxGeometry(segLen,WALL_H,thick),matCollide);
      cm.position.set(mx,WALL_H/2,mz); cm.rotation.y=ang; cm.userData.isCollider=true; collide.add(cm);
    }

    // paylaşılan malzemeler (her duvar için yeni material üretme)
    // J4: TÜM duvar yüzeyleri aynı polygonOffset ile bir tık ÖNE — birbirleriyle DÖVÜŞMEZ (hepsi aynı ofset) ama
    //   duvara EŞ-DÜZLEM yabancı yüzeyleri (TV/mobilya arka paneli, boyalı-yarım vs nötr matWall sınırı, zemin-eki)
    //   derinlik testinde deterministik geride bırakır → "TV arkası desenli duvarda yamalı z-fight" biter (W6 EPS
    //   opak bindirmesi komşu-çifti çözer ama duvar-yüzü ile mobilya/zemin eş-düzleminde yamalı fight kalıyordu).
    const matWall=new THREE.MeshStandardMaterial({color:0xe9e3d6,roughness:0.92, polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-1});
    const matDoor=new THREE.MeshStandardMaterial({color:0x8a6a48,roughness:0.7,metalness:0.05}); // kapı eşiği = ahşap kahve
    // C1-3 / C3-5: KAPALI kanat malzemeleri — KAPILAR mobilya dolaplarından BARİZ ayrışsın diye KOYU tonda +
    //   belirgin (koyu, kalın) kasa çerçevesi. Dolaplar açık ahşap (FMAT.wood/panel) → kapı koyu = render'da
    //   nano girdisinde ikisi net farklı okunur. iç kapı = koyu ceviz, bina girişi (ext) = daha da koyu.
    const matLeaf=new THREE.MeshStandardMaterial({color:0x5a3d26,roughness:0.55,metalness:0.06});   // iç kanat: koyu ceviz (C3-5)
    const matLeafExt=new THREE.MeshStandardMaterial({color:0x3d2817,roughness:0.5,metalness:0.10});  // bina girişi: en koyu
    const matJamb=new THREE.MeshStandardMaterial({color:0x2e2016,roughness:0.6,metalness:0.05});      // çerçeve/kasa: KOYU vurgu (C3-5)
    const matHandle=new THREE.MeshStandardMaterial({color:0xc8c8cc,roughness:0.3,metalness:0.7});     // kol: parlak metal (kontrast)
    const matCeil=new THREE.MeshStandardMaterial({color:0xf3efe6,roughness:0.96,metalness:0,side:THREE.DoubleSide}); // C3-4: tavan = mat açık ton

    // kapı boşlukları (metre uzayı): map.doors px → px2m. Oda kenarlarıyla AYNI doğrultudadır.
    // kind: 'ext'=bina girişi, 'unit'=daire girişi, 'inner'/'extra'=iç kapı (kanat tonu için taşınır).
    const doorSegs=(map.doors||[]).map(function(d){
      const a=px2m(map,d.p0_px[0],d.p0_px[1]), b=px2m(map,d.p1_px[0],d.p1_px[1]);
      return {ax:a[0],az:a[1],bx:b[0],bz:b[1],kind:d.kind};
    });
    // pencere açıklıkları (metre uzayı): map.windows px → px2m. Kapı boşluğu oymanın ikizi;
    // parapet altı + lento üstü duvar korunur, boşlukta saydam cam + ince kasa.
    const winSegs=(map.windows||[]).map(function(d){
      const a=px2m(map,d.p0_px[0],d.p0_px[1]), b=px2m(map,d.p1_px[0],d.p1_px[1]);
      return {ax:a[0],az:a[1],bx:b[0],bz:b[1],height:d.height_m||1.4,sill:d.full?0:(d.sill_m!=null?d.sill_m:0.9),full:!!d.full};
    });
    const matGlass=new THREE.MeshStandardMaterial({color:0xbcd6e8,roughness:0.08,metalness:0.15,transparent:true,opacity:0.34,side:THREE.DoubleSide});
    // W4: klasik TR PVC pencere = BEYAZ çerçeve + orta dikme(ler) + ince kanat profilleri + dışa denizlik.
    const matFrame=new THREE.MeshStandardMaterial({color:0xf4f4f2,roughness:0.55,metalness:0.02}); // beyaz PVC çerçeve/kanat
    const matSill =new THREE.MeshStandardMaterial({color:0xe0ded7,roughness:0.75,metalness:0.03}); // denizlik (dış eşik, hafif gri)
    // pencere boşluğuna cam paneli + BEYAZ PVC kasa/kanat + orta dikme + (tam-boy değilse) dış denizlik kur.
    //   mx,mz=boşluk ortası, gw=genişlik, ang=duvar açısı, nInLocal=odanın iç normali (denizlik DIŞ tarafa) — GÖRSEL-YALNIZ.
    function addWindowGlass(mx,mz,gw,ang,sill,wh,parent,nInLocal){
      if(gw<0.2) return;
      var top=Math.min(WALL_H, sill+wh);                 // cam üst kotu (duvarı aşmasın)
      var gh=Math.max(0.1, top-sill), full=(sill<0.04);
      var fr=0.06;                                        // ince PVC profil kalınlığı (kanat/kasa)
      var ft=Math.max(0.14,WALL_T+0.02);                 // profil derinliği (WALL_T'yi sarar → her açıdan okunur)
      var grp=new THREE.Group(); grp.position.set(mx,0,mz); grp.rotation.y=ang;
      // orta dikme sayısı: genişse çift dikme (3 kanat), normalde tek dikme (çift kanat) — TR PVC klasiği
      var mull=(gw>=2.4?2:(gw>=0.9?1:0));
      var glassW=Math.max(0.1,gw-2*fr), glassCells=mull+1;
      var cellW=(glassW-mull*fr)/glassCells;
      for(var ci=0;ci<glassCells;ci++){                  // her kanat için ayrı cam paneli (dikmeler arası)
        var gx=-glassW/2+fr/2+ci*(cellW+fr)+cellW/2;     // hücre merkezi (yan profil içinden)
        var gl=new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.05,cellW),Math.max(0.1,gh-2*fr),0.03),matGlass);
        gl.position.set(gx,sill+gh/2,0); grp.add(gl);
      }
      // J3: KASA OYUĞU TAM DOLDURSUN — kasa profilleri artık oyuğun İÇİNE oturur (merkez sill/top DEĞİL) + epsilon
      //   bindirmeyle parapet/lento duvarlarıyla buluşur. Eskiden alt/üst kayıt sill/top'a MERKEZLİYDİ → yarısı
      //   (fr/2=0.03m) oyuk dışında kalıyor, cam ise sill+fr'den başlıyordu → aradaki fr/2 bant NE cam NE kasa NE
      //   duvar = SİYAH BOŞLUK. Fix: alt kayıt tabanı sill'e (üst kayıt tepesi top'a) hizalı, we kadar duvara taşar.
      //   Hepsi AYNI sill/top/gw kaynağından türer (oyukla birebir): parapet 0..sill, lento top..WALL_H, cam sill+fr..top-fr.
      var we=0.02;                                        // epsilon bindirme (kasa ↔ parapet/lento buluşma payı)
      var botRail=new THREE.Mesh(new THREE.BoxGeometry(gw,fr+we,ft),matFrame); botRail.position.set(0,sill+fr/2-we/2,0); grp.add(botRail);   // alt kayıt: taban sill'e (we kadar parapete gömülü)
      var topRail=new THREE.Mesh(new THREE.BoxGeometry(gw,fr+we,ft),matFrame); topRail.position.set(0,top-fr/2+we/2,0); grp.add(topRail);   // üst kayıt: tepe top'a (we kadar lentoya gömülü)
      [-1,1].forEach(function(sgn){ var m=new THREE.Mesh(new THREE.BoxGeometry(fr,gh,ft),matFrame); m.position.set(sgn*(gw/2-fr/2),sill+gh/2,0); grp.add(m); });   // iki yan kasa (oyuk boyunca)
      // orta dikme(ler): dikey ince profil(ler) — çift/üçlü kanat görünümü (tam-boyda da devam)
      for(var mi=1;mi<=mull;mi++){ var mxp=-gw/2+mi*(gw/(mull+1));
        var dm=new THREE.Mesh(new THREE.BoxGeometry(fr,gh,ft),matFrame); dm.position.set(mxp,sill+gh/2,0); grp.add(dm); }
      // dış denizlik (çıkıntı) — yalnız normal pencerede (tam-boy camda yok); DIŞ tarafa (nIn tersi) taşar.
      //   grup local +Z dünya karşılığı = (sin(ang),cos(ang)); dış normal = -nIn. İşaret = dot ile bulunur.
      if(!full && nInLocal){
        var lzx=Math.sin(ang), lzz=Math.cos(ang);                 // local +Z → dünya
        var exX=-nInLocal[0], exZ=-nInLocal[1];                   // dış cephe yönü (dünya)
        var outLocalZ=(lzx*exX+lzz*exZ)>=0?1:-1;                  // dış hangi local-Z tarafında
        var sd=new THREE.Mesh(new THREE.BoxGeometry(gw+0.10,0.04,ft+0.14),matSill);
        sd.position.set(0,sill-0.02,outLocalZ*(ft/2+0.03)); grp.add(sd);
      }
      grp.userData.isWin=true; grp.scale.y=roofOn?1:WALL_LOW; parent.add(grp);
    }
    // C1-3: kapı boşluğuna KAPALI kanat kur (mesh grubu). mx,mz=boşluk ortası, gw=genişlik, ang=duvar açısı,
    //   kind=kapı türü (ext=bina girişi koyu ton). abartısız: kanat paneli + iki dikey kasa + kol nub'ı.
    //   Kanat boşluktan hafif dar (kasa payı) + duvar ekseninde ince → kapı "kapalı" okunur, gerçek geometri.
    function addDoorLeaf(mx,mz,gw,ang,kind,parent){
      if(gw<0.3) return;                                   // çok dar → kanat koyma (ıslak dolap-kapısı gibi)
      const grp=new THREE.Group(); grp.position.set(mx,0,mz); grp.rotation.y=ang;
      const isExt=(kind==='ext');
      const leafMat=isExt?matLeafExt:matLeaf;
      const jw=0.08;                                       // C3-5: kasa (jamb) genişliği — daha belirgin çerçeve
      const lw=Math.max(0.2,gw-2*jw);                      // kanat net genişliği (kasa payı düşülür)
      const lt=0.045;                                      // kanat kalınlığı (ince panel)
      const jt=Math.max(0.24,WALL_T+0.04);                 // kasa derinliği — duvarı sarar
      const leaf=new THREE.Mesh(new THREE.BoxGeometry(lw,DOOR_H*0.98,lt),leafMat);
      leaf.position.set(0,DOOR_H*0.98/2,0); leaf.castShadow=true; grp.add(leaf);
      // C3-5: kapı panelinde iki yatay kayıt (lambri) çizgisi — kanat "kapı" okunur (dolap raflarından farklı yön)
      for(const fy of [DOOR_H*0.34, DOOR_H*0.66]){
        const rail=new THREE.Mesh(new THREE.BoxGeometry(lw*0.9,0.04,lt+0.012),matJamb);
        rail.position.set(0,fy,0); grp.add(rail);
      }
      // iki dikey kasa (kapı çerçevesi) — duvar kalınlığını kapsar, kanattan belirgin kalın/koyu
      for(const sgn of [-1,1]){
        const jm=new THREE.Mesh(new THREE.BoxGeometry(jw,DOOR_H,jt),matJamb);
        jm.position.set(sgn*(lw/2+jw/2),DOOR_H/2,0); jm.castShadow=true; grp.add(jm);
      }
      // C3-5: üst kasa (lento çerçevesi) — kapı tam bir dikdörtgen çerçeve olarak okunur
      const head=new THREE.Mesh(new THREE.BoxGeometry(gw,jw,jt),matJamb);
      head.position.set(0,DOOR_H+jw/2-0.01,0); head.castShadow=true; grp.add(head);
      // kol imasi — kanadın bir yüzünde küçük çıkıntı (menteşe karşı-kenarına yakın), göz hizasında
      const hnd=new THREE.Mesh(new THREE.BoxGeometry(0.035,0.12,0.05),matHandle);
      hnd.position.set(lw*0.36,1.05,lt/2+0.025); hnd.castShadow=true; grp.add(hnd);
      grp.userData.isLeaf=true;                            // applyRoof: duvarlarla aynı oranda kısalt/geri-al
      grp.scale.y=roofOn?1:WALL_LOW;                       // build anındaki çatı durumuna uy (duvar segseti gibi)
      parent.add(grp);
    }
    // bir oda kenarını (a→b) kur — üstünden geçen kapılarda BOŞLUK bırak, eşik + (tam-yükseklikte) lentö ekle
    // U1: BOYA ÇAKIŞMASI FIX — paylaşılan iç duvar iki odanın kenarı olarak İKİ KEZ kurulur (üst üste iki kutu).
    //   İkisi de farklı malzeme boyanınca eş-düzlem z-fight/clipping. ÇÖZÜM: her odanın BOYALI duvar kabuğunu
    //   KENDİ tarafına (iç normal yönünde) yarım-kalınlık çeker → her oda YALNIZ kendi yüzünün yarısını doldurur,
    //   iki yarı sırt-sırta oturur, eş-düzlem yok. nIn = odanın iç birim normali (metre uzayı; verilmezse eski
    //   tam-kalınlık merkezli davranış = sözleşme/geriye-uyum korunur). Kapı/pencere BOŞLUK hizaları t-ekseninde
    //   hesaplandığından (nIn yalnız kalınlık-ekseni ofseti) span'lar DEĞİŞMEZ.
    function wallEdge(a,b,wallMat,nIn){
      wallMat=wallMat||matWall;   // M4: oda-başına boya; verilmezse paylaşılan nötr duvar (sözleşme korunur)
      const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz); if(len<0.05) return;
      const ux=dx/len,uz=dz/len, ang=-Math.atan2(dz,dx);
      // U1: boyalı kutular için kalınlık + iç-yön ofseti. nIn yoksa eski (tam WALL_T, ofsetsiz).
      // W6: iki komşu odanın yarım-duvarı merkez hatta SIRT SIRTA oturunca arka yüzler EŞ-DÜZLEM → z-fight/clipping
      //   ("arka duvarla clipping devam ediyor"). ÇÖZÜM: her yarıyı EPS kadar kalınlaştır + merkezi öyle kaydır ki
      //   İÇ yüz aynı kalsın (WALL_T/2) ama arka yüz merkez hattı EPS AŞSIN → iki yarı bir tık iç içe geçer
      //   (opak, aynı-derinlik değil → z-fight biter). nIn'siz eski yol tam WALL_T, ofsetsiz (sözleşme korunur).
      const WALL_EPS=0.012;
      const halfT=nIn?(WALL_T/2+WALL_EPS):WALL_T;      // her oda kendi yarısını doldurur (nIn varsa) + EPS bindirme
      const ctrOff=nIn?(WALL_T/4-WALL_EPS/2):0;        // iç yüz WALL_T/2'de sabit; arka yüz merkezi EPS aşar
      const ofx=nIn?nIn[0]*ctrOff:0, ofz=nIn?nIn[1]*ctrOff:0;   // merkezi iç tarafa kaydır (bindirmeli)
      const gaps=[], winGaps=[];
      doorSegs.forEach(function(d){
        const t0=(d.ax-a[0])*ux+(d.az-a[1])*uz, e0=Math.abs((d.ax-a[0])*(-uz)+(d.az-a[1])*ux);
        const t1=(d.bx-a[0])*ux+(d.bz-a[1])*uz, e1=Math.abs((d.bx-a[0])*(-uz)+(d.bz-a[1])*ux);
        if(e0>0.2||e1>0.2) return;                          // kapı bu duvar doğrultusunda değil (uzaklık toleransı)
        const g0=Math.max(0,Math.min(t0,t1)), g1=Math.min(len,Math.max(t0,t1));
        if(g1-g0>0.1) gaps.push([g0,g1,d.kind]);            // duvarla örtüşen kapı boşluğu (+kind = kanat tonu)
      });
      winSegs.forEach(function(d){
        const t0=(d.ax-a[0])*ux+(d.az-a[1])*uz, e0=Math.abs((d.ax-a[0])*(-uz)+(d.az-a[1])*ux);
        const t1=(d.bx-a[0])*ux+(d.bz-a[1])*uz, e1=Math.abs((d.bx-a[0])*(-uz)+(d.bz-a[1])*ux);
        if(e0>0.3||e1>0.3) return;                          // pencere bu duvar doğrultusunda değil
        const g0=Math.max(0,Math.min(t0,t1)), g1=Math.min(len,Math.max(t0,t1));
        if(g1-g0>0.1){ gaps.push([g0,g1,null]); winGaps.push([g0,g1,d.sill,d.height,d.full]); }  // tam-yükseklik duvarı oy → parapet/lento refill
      });
      gaps.sort(function(p,q){return p[0]-q[0];});
      function seg(s0,s1){ if(s1-s0<0.04) return;
        const wm=new THREE.Mesh(new THREE.BoxGeometry(s1-s0,WALL_H,halfT),wallMat);   // U1: kendi yarısı
        // Q6: duvar tabanını zemine 2 cm GÖM (alt=y=-0.02) → duvar-zemin ekinde ışık sızıntısı/gölge-boşluğu biter (üst ihmal edilir kayar)
        wm.position.set(a[0]+ux*(s0+s1)/2+ofx, (roofOn?WALL_H/2:WALL_H*WALL_LOW/2)-0.02, a[1]+uz*(s0+s1)/2+ofz);
        wm.rotation.y=ang; wm.scale.y=roofOn?1:WALL_LOW;
        wm.castShadow=true; wm.userData.isWall=true; walls.add(wm);
        addCollider(a[0]+ux*(s0+s1)/2, a[1]+uz*(s0+s1)/2, s1-s0, WALL_T, ang);   // W5: tam-kalınlık görünmez çarpışma kutusu (merkez hatta)
      }
      let s=0; gaps.forEach(function(g){ seg(s,g[0]); s=Math.max(s,g[1]); }); seg(s,len);
      // pencere boşlukları: parapet altı (0..sill) + lento üstü (top..WALL_H) duvar + boşlukta cam
      winGaps.forEach(function(g){
        const mx=a[0]+ux*(g[0]+g[1])/2, mz=a[1]+uz*(g[0]+g[1])/2, gw=g[1]-g[0];
        const sill=g[2], wh=g[3], top=Math.min(WALL_H, sill+wh);
        if(!g[4] && sill>0.04){ const pw=new THREE.Mesh(new THREE.BoxGeometry(gw,sill,halfT),wallMat);  // parapet (tam boyda yok) — U1: kendi yarısı
          pw.position.set(mx+ofx,(roofOn?sill/2:sill/2*WALL_LOW)-0.02,mz+ofz); pw.rotation.y=ang; pw.scale.y=roofOn?1:WALL_LOW; pw.castShadow=true; pw.userData.isWin=true; walls.add(pw); }
        if(WALL_H-top>0.04){ const lh=WALL_H-top, lw=new THREE.Mesh(new THREE.BoxGeometry(gw,lh,halfT),wallMat); // lento üstü — U1: kendi yarısı
          lw.position.set(mx+ofx,top+lh/2,mz+ofz); lw.rotation.y=ang; lw.castShadow=true; lw.userData.isLeaf=true; lw.scale.y=roofOn?1:WALL_LOW; lintels.add(lw); }
        addWindowGlass(mx,mz,gw,ang,sill,wh,walls,nIn);   // W4: nIn → denizlik DIŞ tarafa taşar
        addCollider(mx,mz,gw,WALL_T,ang);                 // W5: pencerelerden yürüyerek geçilemez → tam-yükseklik çarpışma kutusu
      });
      gaps.forEach(function(g){
        if(g[2]==null) return;   // pencere boşluğu → kapı kanadı/eşiği/lentosu ÇİZME (winGaps hallediyor)
        const mx=a[0]+ux*(g[0]+g[1])/2, mz=a[1]+uz*(g[0]+g[1])/2, gw=g[1]-g[0];
        const th=new THREE.Mesh(new THREE.BoxGeometry(gw,0.04,Math.max(0.2,WALL_T)),matDoor);  // eşik: her açıdan "kapı burada" (duvar kalınlığını kapsasın)
        th.position.set(mx,0.02,mz); th.rotation.y=ang; th.receiveShadow=true; th.userData.isSill=true; walls.add(th);
        const ln=new THREE.Mesh(new THREE.BoxGeometry(gw,WALL_H-DOOR_H,halfT),wallMat); // lentö: yalnız tam-yükseklikte görünür — U1: kendi yarısı
        ln.position.set(mx+ofx,(DOOR_H+WALL_H)/2,mz+ofz); ln.rotation.y=ang; ln.castShadow=true; lintels.add(ln);
        // C1-3: KAPALI KANAT — kapısız ev "sakil" + nano tek-kapılı dolabı kapı sanabiliyor. Boşluğa
        //   ince panel + kasa (jamb) + kol imasi ekle. Sahne mesh'i → iso snapshot + kamera B yoluna
        //   OTOMATİK girer. SPAN mantığına DOKUNMAZ (mx/mz/gw/ang yalnız OKUNUR). Kanat DOOR_H yüksekliğinde;
        //   dollhouse (roof-off) modunda duvarlarla aynı oranda kısalsın diye isLeaf tag'i (applyRoof ölçekler).
        addDoorLeaf(mx,mz,gw,ang,g[2],walls);
      });
    }

    rooms.forEach(function(o){
      // M4: SEÇİLİ zemin malzemesi varsa GERÇEK dokuyu göster; yoksa renk-kodlu (tip sinyali) — varsayılan sıfır değişim.
      const fKey=roomMatKey(o.id,'floor'), fMat=fKey&&matMaterial(fKey);
      const col=colorFor(o);
      const g=new THREE.ExtrudeGeometry(shapeFrom(o.polygon_px,map),{depth:FLOOR_T,bevelEnabled:false});
      g.rotateX(Math.PI/2);
      const m=new THREE.Mesh(g, fMat || new THREE.MeshStandardMaterial({color:col,roughness:0.78,metalness:0.03}));
      m.receiveShadow=true; m.castShadow=true; m.userData.isFloor=true; m.userData.roomRef=o; G.add(m);
      // M4: SEÇİLİ duvar boyası varsa o odanın kenarları boyalı; yoksa paylaşılan matWall (renk-kodsuz nötr duvar korunur).
      const wKey=roomMatKey(o.id,'wall'), oWallMat=(wKey&&matMaterial(wKey))||matWall;
      // C3-4: aynı poligondan TAVAN dilimi (duvar üstü yüksekliğinde, mat açık ton) → __ceiling grubuna (gizli).
      const cg=new THREE.ExtrudeGeometry(shapeFrom(o.polygon_px,map),{depth:FLOOR_T,bevelEnabled:false});
      cg.rotateX(Math.PI/2);
      const cm=new THREE.Mesh(cg,matCeil); cm.position.y=WALL_H; cm.receiveShadow=true; cm.userData.isCeiling=true; ceil.add(cm);
      // duvarlar = oda kenarları (kapı boşlukları oyulmuş) — M4: o odanın boya malzemesiyle
      const P=o.polygon_px;
      // U1: oda poligonunu metreye çevir + kütle-merkezi (iç normal referansı) — her kenarın odaya BAKAN yönü
      const Pm=P.map(function(p){ return px2m(map,p[0],p[1]); });
      let ccx=0,ccz=0; Pm.forEach(function(p){ ccx+=p[0]; ccz+=p[1]; }); ccx/=Pm.length; ccz/=Pm.length;
      for(let i=0;i<Pm.length;i++){
        const A2=Pm[i], B2=Pm[(i+1)%Pm.length];
        const edx=B2[0]-A2[0], edz=B2[1]-A2[1], el=Math.hypot(edx,edz)||1;
        // kenar normali (iki aday) → oda merkezine bakan işaret = iç normal (paylaşılan duvarda her oda kendi yarısına çeker)
        let nx=-edz/el, nz=edx/el; const mx2=(A2[0]+B2[0])/2, mz2=(A2[1]+B2[1])/2;
        if((ccx-mx2)*nx+(ccz-mz2)*nz<0){ nx=-nx; nz=-nz; }
        wallEdge(A2, B2, oWallMat, [nx,nz]);
      }
      // etiket — pole-of-inaccessibility çapası (komşu odaya taşmaz); yoksa centroid'e düş
      let la=o.label_anchor_px||o.centroid_px;
      if(!la){ la=P.reduce(function(s,p){return [s[0]+p[0],s[1]+p[1]];},[0,0]).map(function(v){return v/P.length;}); }
      const lm=px2m(map,la[0],la[1]);
      const trName=o.name||o.name_en||'', enName=o.name_en||o.name||'';  // ekran TR; PNG export EN
      const spr=makeLabel(trName); spr.userData.tr=trName; spr.userData.en=enName;
      spr.position.set(lm[0],0.6,lm[1]); labels.add(spr);
    });

    // mobilya: geçersizleri ele (A8) → düz furnList'e topla → px damgala → çiz
    furnPruneInvalid(map); collectFurnList(); syncFurniturePx(map); renderFurniture();

    status.textContent=rooms.length+' oda · '+(maxX-minX).toFixed(1)+'m × '+(maxZ-minZ).toFixed(1)+'m · gerçek geometri';
    setView('iso');
  }

  function labelTexture(txt){
    const c=document.createElement('canvas'); c.width=256; c.height=64; const x=c.getContext('2d');
    x.fillStyle='rgba(20,20,25,.55)'; x.fillRect(0,0,256,64);
    x.fillStyle='#f0e8d8'; x.font='600 24px system-ui'; x.textAlign='center'; x.textBaseline='middle';
    x.fillText((txt||'').slice(0,18),128,32);
    return new THREE.CanvasTexture(c);
  }
  function makeLabel(txt){
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:labelTexture(txt),transparent:true,depthTest:false}));
    s.scale.set(2.6,0.65,1); return s;
  }
  // etiket metnini değiştir (TR↔EN); eski texture'ı bırak (PNG export'unda kullanılır)
  function setLabelText(spr,txt){ if(spr.material.map) spr.material.map.dispose(); spr.material.map=labelTexture(txt); spr.material.needsUpdate=true; }

  function setView(v){
    if(!cam||!controls) return;
    const d=22; controls.target.set(0,0,0);
    if(v==='top'){
      // C3-3: en uzun kenar ekran altına paralel — dominant eksen X ise up=-Z (X yatay kalır), Z ise up=+X (Z yatay olur)
      const upZ=(scene && scene.__hz!=null && scene.__hx!=null && scene.__hx<scene.__hz);
      if(upZ) cam.up.set(1,0,0); else cam.up.set(0,0,-1);
      cam.position.set(0,d*4.2,0); cam.fov=16;
    }
    else { cam.up.set(0,1,0); cam.fov=42;
      if(v==='iso') cam.position.set(d,d*0.95,d); else cam.position.set(d*1.3,d*0.5,d*1.3); }
    cam.updateProjectionMatrix(); controls.sync(); controls.update();
    fitView();   // açıyı koru, modeli ekrana sığdır
  }
  // mevcut bakış açısını KORUYARAK modeli ekrana SIKICA sığdır.
  // Kuşatan küre değil: 8 köşeyi kamera eksenlerine projekte edip hepsinin
  // çerçeveye girdiği EN YAKIN mesafeyi bulur → gerçek silüete göre, az boşluk.
  function fitView(){
    if(!cam||!controls||!scene||scene.__hx==null) return;
    const hx=scene.__hx, hz=scene.__hz, topY=(roofOn?WALL_H:WALL_H*WALL_LOW), cy=topY/2;
    const target=new THREE.Vector3(0,cy,0);
    const dir=new THREE.Vector3().subVectors(cam.position,target);   // hedef→kamera yönü
    if(dir.lengthSq()<1e-6) dir.set(1,0.9,1); dir.normalize();
    const up=cam.up.clone().normalize();
    const right=new THREE.Vector3().crossVectors(up,dir).normalize();
    const upc=new THREE.Vector3().crossVectors(dir,right).normalize();
    const tanV=Math.tan(cam.fov*Math.PI/360), tanH=tanV*Math.max(cam.aspect,1e-3);
    const MARGIN=1.05;                                 // ufak kenar payı
    let d=0; const rc=new THREE.Vector3();
    for(let sx=-1;sx<=1;sx+=2) for(let sy=0;sy<=1;sy++) for(let sz=-1;sz<=1;sz+=2){
      rc.set(sx*hx, sy*topY-cy, sz*hz);               // köşe (hedefe göre)
      const along=rc.dot(dir);                         // kameraya doğru bileşen
      const x=Math.abs(rc.dot(right))*MARGIN, y=Math.abs(rc.dot(upc))*MARGIN;
      const need=along+Math.max(x/tanH, y/tanV);       // bu köşeyi içerecek min mesafe
      if(need>d) d=need;
    }
    // U6: SOFT-BORDER — mesh alt dock + sağ rail ARKASINA girmesin. Çalışma alanı = viewport − UI inset'leri
    //   (aktif dock yüksekliği + rail genişliği). (a) Kullanılabilir görüş oranı kadar mesafeyi büyüt (model
    //   daha küçük görünsün ki daralan kutuya sığsın), (b) hedefi kaydır ki model GÖRÜNÜR bölgenin ortasına otursun.
    //   SERT değil: kullanıcı sonra elle zoom/pan ile taşabilir. Export/snapshot yolu kendi kamerasını kurar → DOKUNULMAZ.
    const ins=uiInsetPx(), vw=(renderer&&renderer.domElement.clientWidth)||overlay&&overlay.clientWidth||1440,
          vh=(renderer&&renderer.domElement.clientHeight)||overlay&&overlay.clientHeight||810;
    const visW=Math.max(60, vw-ins.right), visH=Math.max(60, vh-ins.bottom);
    d *= Math.max(vw/visW, vh/visH);                    // daralan görünür kutuya sığacak kadar geri çek
    controls.target.copy(target);
    cam.position.copy(target).addScaledVector(dir, d);
    // hedef kaydırma: görünür bölge merkezi viewport merkezinden (sağ rail → sola, alt dock → yukarı) ötelenir.
    //   ekranda modeli o kadar kaydırmak için target'ı ters yönde (dünya) öteler.
    if((ins.right>0||ins.bottom>0)){
      const worldPerPxV=2*d*Math.tan((cam.fov/2)*Math.PI/180)/vh;   // dikey px→dünya (hedef düzleminde)
      const shiftUpPx=ins.bottom/2, shiftRightPx=ins.right/2;       // görünür merkez bu kadar yukarı+sola
      const upW=new THREE.Vector3().crossVectors(dir,right).normalize();   // ekran-yukarı ekseni (dünya)
      const rgW=right.clone().normalize();                                  // ekran-sağ ekseni (dünya)
      // model ekranda YUKARI+SOLA → target AŞAĞI+SAĞA (ters)
      const du=shiftUpPx*worldPerPxV, dr=shiftRightPx*worldPerPxV;
      controls.target.addScaledVector(upW,-du).addScaledVector(rgW, dr);
      cam.position.addScaledVector(upW,-du).addScaledVector(rgW, dr);
    }
    cam.updateProjectionMatrix(); controls.sync(); controls.update();
  }
  // U6: aktif UI inset'leri (px) — alt dock yüksekliği + sağ rail genişliği. fit/odak temiz bölgeye otursun diye.
  function uiInsetPx(){
    if(!overlay) return {right:0,bottom:0};
    let bottom=0; ['v3dCamDock','v3dFurnDock','v3dMatDock'].forEach(function(id){ const el=overlay.querySelector('#'+id);
      if(el && el.style.display!=='none' && el.offsetHeight>0) bottom=Math.max(bottom, el.offsetHeight+18); });
    let right=0; const dock=overlay.querySelector('#v3dDock');   // sağ-üst rail (+ açıksa çekmece)
    if(dock && dock.offsetWidth>0) right=dock.offsetWidth+18;
    const ctl=overlay.querySelector('#v3dViewCtl');              // sağ-alt zoom/küre kolonu da sağ kenarda
    if(ctl && ctl.offsetWidth>0) right=Math.max(right, ctl.offsetWidth+18);
    return {right:right, bottom:bottom};
  }
  // ── A3: SEÇİLİYE ODAKLAN — controls hedefini seçilen objenin dünya konumuna kısa/yumuşak tween'le kaydır.
  //   Zoom mesafesi DEĞİŞMEZ (yalnız bakış noktası). Kilit sürerken de çalışır (pan serbest).
  //   Mobilya: furnList[i].pos MUTLAK metre → dünya = pos-(cx,cz). Kamera: camList[i].pos zaten dünya.
  // C1-2: odak hedefi alt DOCK'un ARKASINA gelmesin — odaklanan obje görünür bölgenin (viewport − dock)
  // ortasına otursun. Ekranda objeyi Δpx YUKARI itmek için controls.target'ı kameranın ekran-yukarı
  // ekseninde dünya-uzayında AŞAĞI kaydırırız (target aşağı → sahne yukarı). export/snapshot yolu
  // DOKUNULMAZ (bu yalnız interaktif controls.target tween'i; snapCameraDataURL kendi kamerasını kurar).
  function activeDockPx(){
    if(!overlay) return 0;
    const ids=['v3dCamDock','v3dFurnDock']; let h=0;
    for(const id of ids){ const el=overlay.querySelector('#'+id);
      if(el && el.style.display!=='none' && el.offsetHeight>0){ h=Math.max(h, el.offsetHeight+18); } }  // +bottom:14 + nefes
    return h;
  }
  function focusOnWorld(wx,wy,wz){ if(!controls||!cam) return;
    const tgt={x:wx,y:(wy!=null?wy:0.6),z:wz};
    const dockH=activeDockPx();
    if(dockH>0 && renderer){
      // görünür bölge (üstten dock'a kadar) merkezini viewport merkezine getir → shiftPx = dock/2
      const ch=(renderer.domElement.clientHeight||overlay.clientHeight||1);
      const dist=cam.position.distanceTo(new THREE.Vector3(tgt.x,tgt.y,tgt.z));
      const worldPerPx=2*dist*Math.tan((cam.fov/2)*Math.PI/180)/ch;   // hedef düzleminde px→dünya
      const shiftPx=dockH/2;                                          // objeyi bu kadar YUKARI it
      const upW=new THREE.Vector3().setFromMatrixColumn(cam.matrix,1).normalize();  // kameranın ekran-yukarı ekseni
      const d=shiftPx*worldPerPx;
      tgt.x-=upW.x*d; tgt.y-=upW.y*d; tgt.z-=upW.z*d;                 // target aşağı → obje ekranda yukarı
    }
    controls.tweenTarget(tgt);
  }
  function focusFurn(i){ if(i<0||i>=furnList.length) return; const f=furnList[i];
    focusOnWorld(f.pos.x-(scene.__cx||0), 0.5, f.pos.z-(scene.__cz||0)); }
  function focusCam(i){ if(i<0||i>=camList.length) return; const c=camList[i];
    const t=c.target||c.pos; focusOnWorld(t.x, (c.pos&&c.pos.y!=null?c.pos.y:0.6), t.z); }   // kameranın BAKTIĞI noktaya odaklan (yoksa konumuna)
  // klavye F / panel düğmesi: hangi grup aktifse onun seçilisine odakla
  function focusSelected(){
    if(furnMode && activeFurnIdx>=0){ focusFurn(activeFurnIdx); setFurnHint('Seçiliye odaklanıldı (F)'); return true; }
    if(camUIEnabled && activeCamIdx>=0){ focusCam(activeCamIdx); setHint('Seçili kameraya odaklanıldı (F)'); return true; }
    return false;
  }
  // ── A4: KUŞBAKIŞI KİLİDİ mekanizması ──────────────────────────────────────────────
  // TOP_PHI: kilit polar açısı. Tam 0 (dik tepeden) yerine ~89° (0.02 rad değil, hafif 88-89°)
  //   istendi → hafif eğik değil, "neredeyse tepeden" ama kesin dik-değil ki derinlik ipucu kalsın.
  const TOP_PHI=0.055;   // ~3.15° eğim (neredeyse tepeden; kullanıcı "üst açıya kitlense" + "89°")
  // C3-3: kuşbakışı azimut — bina EN UZUN kenarı ekranın ALT kenarına paralel olsun (randımanlı çerçeve).
  // Plan bbox eksen-hizalı (dünya XZ) → baskın eksen: X mi Z mi daha uzun. Ekran-yukarı ground yönü = (-sinθ,-cosθ);
  // en uzun kenar ekran-yatay olması için o kenar ⟂ ekran-yukarı → θ=atan2(-dz,dx). Dominant X=(1,0)→θ=0; Z=(0,1)→θ=-π/2.
  // YALNIZ preset/kilit girişinde uygulanır (kullanıcı sonra elle döndürürse karışmaz — top-lock zaten noRotate).
  function topAzimuth(){
    if(!scene || scene.__hx==null || scene.__hz==null) return undefined;
    const dx = (scene.__hx>=scene.__hz) ? 1 : 0, dz = (scene.__hx>=scene.__hz) ? 0 : 1;
    return Math.atan2(-dz, dx);
  }
  function lockBtnEl(){ return overlay&&overlay.querySelector('#v3dLockBtn'); }
  // kilit düğmesi yalnız kamera/mobilya grubunda görünür; ikon/başlık kilit durumuna göre.
  function updateLockBtn(){
    const b=lockBtnEl(); if(!b) return;
    const inGroup=(activeGroup==='camera'||activeGroup==='furniture');
    b.style.display=inGroup?'flex':'none';
    if(!inGroup) return;
    b.innerHTML=ic(topLocked?'lock':'lockopen',18);
    b.title=topLocked?'Kuşbakışı kilitli — aç (serbest döndür)':'Serbest — kuşbakışına kilitle';
    b.style.background=topLocked?'#c9a16b':'rgba(34,34,40,.94)';
    b.style.color=topLocked?'#1a1a1f':'#c9b79a';
  }
  // kuşbakışına kilitle: mevcut serbest açıyı sakla → üst açıya yumuşak tween + döndürme kapat (pan+zoom serbest).
  function enterTopLock(saveFree){
    if(!controls||!cam) return;
    if(saveFree && !topLocked) freeSavedView=getView();     // kilit ÖNCESİ serbest açı (yalnız serbestten girişte sakla)
    topLocked=true; controls.noRotate=true;
    cam.up.set(0,1,0);                                       // top-lock'ta dünya-yukarı sabit (setView('top') -Z up kullanır; orbit ile karışmasın)
    controls.tweenToAngle(TOP_PHI, topAzimuth(), NAV.tweenMs);  // C3-3: tepeye eğ + azimut en uzun kenar alta paralel (giriş anında)
    updateLockBtn();
  }
  // kilidi aç: döndürme serbest; KALDIĞIN açıdan devam (snap YOK — tween'i durdur, mevcut poz kalsın).
  function exitTopLock(){
    if(!controls) return; topLocked=false; controls.noRotate=false;
    if(controls.cancelViewTween) controls.cancelViewTween();
    if(controls.sync) controls.sync();                      // mevcut pozu hedef-mesafeye sabitle (atalet sıfır)
    updateLockBtn();
  }
  // düğme: kilitliyse aç · değilse kuşbakışına dön + kilitle (kullanıcı kararı: gruba her girişte varsayılan kilitli)
  function toggleTopLock(){ if(topLocked) exitTopLock(); else enterTopLock(true); }
  // gruptan çıkınca (view/izleme): kilit KALKAR, önceki serbest açı geri gelir.
  function releaseTopLockToFree(){
    if(!topLocked && !freeSavedView) { updateLockBtn(); return; }
    topLocked=false; if(controls){ controls.noRotate=false; if(controls.cancelViewTween) controls.cancelViewTween(); }
    if(freeSavedView){ restoreView(freeSavedView); if(controls) fitView(); freeSavedView=null; }   // serbest açıyı geri yükle, kadrajı koru
    updateLockBtn();
  }
  function applyRoof(){ if(!scene||!scene.__walls) return;
    scene.__walls.children.forEach(function(w){ if(w.userData.isWall){ w.scale.y=roofOn?1:WALL_LOW;
      w.position.y=(roofOn?WALL_H:WALL_H*WALL_LOW)/2-0.02; }   // Q6: taban zemine gömülü kalsın (çatı toggle'ında da)
      else if(w.userData.isLeaf||w.userData.isWin){ w.scale.y=roofOn?1:WALL_LOW; } });   // C1-3: kanat + pencere parapet/cam da duvarla aynı oranda kısalır (dollhouse)
    if(scene.__lintels) scene.__lintels.visible=roofOn; }   // lentö = kapı başlığı + pencere üstü, sadece tam yükseklikte
  // PNG'yi İNGİLİZCE etiketle ver (AI 3D-render İngilizce sever; pipeline'ın geri kalanı da EN).
  // Etiketleri EN'e çevir → render → indir → ekrandaki TR'yi geri koy.
  function snap(){ if(!renderer) return;
    const labs=(scene&&scene.__labels)?scene.__labels.children:[];
    labs.forEach(function(s){ if(s.userData&&s.userData.en) setLabelText(s,s.userData.en); });
    renderer.render(scene,cam);
    const a=document.createElement('a'); a.download='floor-plan-3d.png'; a.href=renderer.domElement.toDataURL('image/png'); a.click();
    labs.forEach(function(s){ if(s.userData&&s.userData.tr) setLabelText(s,s.userData.tr); });
    renderer.render(scene,cam); }

  // ── Mesken köprüsü: kilitli açıyı oku/uygula + o açıdan PNG dataURL (indirmeden) ──
  // snap() ile aynı kare: EN etiketle render et → dataURL döndür → ekran TR'sini geri koy.
  // Adım 2→3: kullanıcının son baktığı açı = nano'ya gönderilen render açısı.
  // opts.furnished (opsiyonel): adım 2→3 "Plana Yüksek Sadakat / Yaratıcı Plan Boyama" seçimi.
  //   true  = MOBİLYALI mesh gönder (Yüksek Sadakat) — hiç mobilya yoksa otomatik döşe.
  //   false = MOBİLYASIZ mesh gönder (Yaratıcı) — mobilya grubunu GEÇİCİ gizle (kullanıcının mobilyasını SİLMEZ).
  //   undefined = sahne neyse o. Mobilya sekmesindeki checkbox'tan BAĞIMSIZ (bilinçli kullanıcı kararı).
  function snapDataURL(opts){
    if(!renderer||!scene||!cam) return null;
    opts=opts||{};
    let fg=scene.__furnitureGroup, prevVis=null;
    if(opts.furnished===true){
      if((!furnList||!furnList.length) && typeof autoFurnishAll==='function'){ try{ autoFurnishAll(); }catch(e){} }
      fg=scene.__furnitureGroup;                             // autoFurnish yeni grup kurmuş olabilir → yeniden al
      if(fg){ prevVis=fg.visible; fg.visible=true; }
    } else if(opts.furnished===false){
      if(fg){ prevVis=fg.visible; fg.visible=false; }
    }
    const labs=(scene.__labels)?scene.__labels.children:[];
    labs.forEach(function(s){ if(s.userData&&s.userData.en) setLabelText(s,s.userData.en); });
    renderer.render(scene,cam);
    const url=renderer.domElement.toDataURL('image/png');
    labs.forEach(function(s){ if(s.userData&&s.userData.tr) setLabelText(s,s.userData.tr); });
    if(fg && prevVis!==null) fg.visible=prevVis;             // görünürlüğü geri yükle (non-destructive)
    renderer.render(scene,cam);
    return url;
  }

  // ── Opsiyon 2: kameranın KENDİ göz-hizası açısından mesh render'ı → PNG dataURL ──
  // snapDataURL kardeşi; fark: orbit açısı değil camList kamerasının pozu; kamera gizmoları +
  // 3B etiketler GİZLİ (temiz kontrol görseli); duvarlar tam-yükseklik (iç mekan kapansın).
  // nano'ya img2img "realistic + estetik yap, geometriyi koru" olarak gider (adım 2-3 mesh-snap
  // reçetesinin göz-hizası, kamera-başı versiyonu). Her şey render sonrası GERİ yüklenir.
  // C2: SABİT çözünürlük kilidi — snapshot çıktısı viewport'tan/ekrandan BAĞIMSIZ 1440×810 PNG.
  // Neden: eskiden domElement viewport boyutunda render alıyordu → aynı kamera farklı ekranda
  // farklı boyutta img2img girdisi üretiyordu (nano tutarsız). pixelRatio de kilitlenir yoksa
  // retina'da 2× buffer (2880×1620) çıkardı. Boyut/aspect/pixelRatio try/finally ile BİREBİR geri
  // yüklenir → ana render döngüsü ve kamera-yerleştirme worldToPx px_delta=0 değişmezi korunur.
  function snapCameraDataURL(which){
    if(!renderer||!scene||!cam) return null;
    const c=(typeof which==='number')?camList[which]:which;
    if(!c||!c.pos||!c.target) return null;
    const savedSize=renderer.getSize(new THREE.Vector2());
    if(savedSize.x<1||savedSize.y<1) return null;              // viewport 0×0 (ekran-arası/gizli) → render çöker, reddet
    const savedView=getView();                                 // orbit açısı + fov (geri koymak için)
    const savAspect=cam.aspect, savPR=renderer.getPixelRatio();// aspect+pixelRatio getView kapsamaz → ayrı sakla
    const savRoof=roofOn, savGiz=camGizmos?camGizmos.visible:true;
    const labels=scene.__labels, savLbl=labels?labels.visible:true;
    const ceilG=scene.__ceiling, savCeil=ceilG?ceilG.visible:false;    // C3-4
    let url=null;
    _snapBusy=true;                                            // R2: bu sırada loop PiP scissor pass'i ATLA
    try{
      if(camGizmos) camGizmos.visible=false;                   // kamera modelleri/koni kadrajda olmasın
      if(labels) labels.visible=false;                         // 3B etiketler görünmesin
      if(!roofOn){ roofOn=true; applyRoof(); }                 // iç mekan: duvarlar tam-yükseklik → oda kapanır
      if(ceilG) ceilG.visible=true;                            // C3-4: iç mekan bakışı → tavan görünür
      renderer.setPixelRatio(1); renderer.setSize(1440,810,false);  // sabit 16:9; updateStyle=false ŞART (canvas CSS bozulmasın)
      cam.up.set(0,1,0);
      cam.position.set(c.pos.x,c.pos.y,c.pos.z);
      cam.lookAt(c.target.x,(c.target.y!=null?c.target.y:0.5),c.target.z);
      cam.fov=lensToFov(c.lens); cam.aspect=16/9; cam.updateProjectionMatrix();
      renderer.render(scene,cam);
      url=renderer.domElement.toDataURL('image/png');
    } finally {
      renderer.setPixelRatio(savPR); renderer.setSize(savedSize.x,savedSize.y,false);  // BİREBİR geri (hata olsa bile)
      cam.aspect=savAspect;
      if(labels) labels.visible=savLbl;
      if(camGizmos) camGizmos.visible=savGiz;
      if(ceilG) ceilG.visible=savCeil;                         // C3-4: tavan görünürlüğü BİREBİR geri
      if(roofOn!==savRoof){ roofOn=savRoof; applyRoof(); }      // çatı durumunu geri al
      if(savedView) restoreView(savedView);                    // orbit açısı + fov geri (updateProjectionMatrix içeride)
      else cam.updateProjectionMatrix();                       // savedView yoksa aspect restore'unu yansıt
      renderer.render(scene,cam);
      _snapBusy=false;
    }
    return url;
  }

  // ── B1-R (R2): CANLI PiP — köşe penceresine seçili kameranın perspektifini SCISSOR pass ile çiz ──
  // Ana render döngüsünde İKİNCİ pass (loop() ana pass'ten SONRA çağırır). renderer.setViewport/setScissor
  //   + setScissorTest ile #v3dPipBody dikdörtgenine YALNIZ o bölgeyi çizer. snapCameraDataURL disiplini:
  //   gizmo/etiket gizle + çatıyı kapat (iç mekan) — GEÇİCİ, pass sonunda GERİ. Sonunda scissorTest=false +
  //   viewport TAM canvas'a geri (ana pass'i etkilemesin). Ayrı pipCam kullanır → ana cam DOKUNULMAZ.
  //   TUZAK: snapCameraDataURL kendi setSize(1440×810)/restore'unu yapar → _snapBusy iken PiP ATLA (loop guard).
  function shouldShowPip(){
    return camUIEnabled && activeGroup==='camera' && !pipClosed
        && activeCamIdx>=0 && activeCamIdx<camList.length
        && !!(camList[activeCamIdx]&&camList[activeCamIdx].pos&&camList[activeCamIdx].target);
  }
  function renderPip(){
    if(_snapBusy || !renderer || !scene || !cam) return;
    const pipEl=overlay&&overlay.querySelector('#v3dPip');
    const body=overlay&&overlay.querySelector('#v3dPipBody');
    if(!pipEl||!body) return;
    if(!shouldShowPip()){ if(pipEl.style.display!=='none') pipEl.style.display='none'; return; }
    pipEl.style.display='block';
    updatePipTitle();
    const c=camList[activeCamIdx];
    // DOM body dikdörtgeni → renderer viewport/scissor koordinatı. TUZAK (C1-5): three.js
    //   setViewport/setScissor LOJİK (CSS) piksel alır ve pixelRatio ile İÇERİDE çarpar; ana döngü de
    //   setSize(clientW,clientH) = CSS piksel veriyor (getViewport→1280×664). Burada *pr ile device-piksele
    //   çevirmek İKİNCİ kez çarpılmaya yol açıyordu → PiP 2× büyük + kayık (üst şeritte + kutudan taşıyor).
    //   Çözüm: CSS piksel ver (pr YOK). WebGL viewport origin SOL-ALT → Y alttan ölçülür (flip korunur).
    const canvas=renderer.domElement;
    const cr=canvas.getBoundingClientRect(), br=body.getBoundingClientRect();
    const w=Math.max(2,Math.round(br.width)), h=Math.max(2,Math.round(br.height));
    const x=Math.round(br.left-cr.left);
    const y=Math.round(cr.bottom-br.bottom);                 // alttan ölç (Y flip), CSS piksel
    if(w<2||h<2) return;
    if(!pipCam) pipCam=new THREE.PerspectiveCamera(50,16/9,0.1,600);
    const savGiz=camGizmos?camGizmos.visible:true;
    const labels=scene.__labels, savLbl=labels?labels.visible:true;
    const savRoof=roofOn;
    const ceilG=scene.__ceiling, savCeil=ceilG?ceilG.visible:false;    // C3-4
    const savVp=renderer.getViewport(new THREE.Vector4());
    const savSc=renderer.getScissor(new THREE.Vector4());
    const savScTest=renderer.getScissorTest();
    try{
      if(camGizmos) camGizmos.visible=false;                 // koni/kamera modeli PiP'te görünmesin
      if(labels) labels.visible=false;                       // 3B etiketler PiP'te görünmesin
      if(!roofOn){ roofOn=true; applyRoof(); }               // iç mekan: duvarlar tam-yükseklik
      if(ceilG) ceilG.visible=true;                          // C3-4: PiP iç mekan → tavan görünür
      pipCam.up.set(0,1,0);
      pipCam.position.set(c.pos.x,c.pos.y,c.pos.z);
      pipCam.lookAt(c.target.x,(c.target.y!=null?c.target.y:0.5),c.target.z);
      pipCam.fov=lensToFov(c.lens); pipCam.aspect=w/h; pipCam.updateProjectionMatrix();
      renderer.setViewport(x,y,w,h); renderer.setScissor(x,y,w,h); renderer.setScissorTest(true);
      renderer.render(scene,pipCam);
    } finally {
      // BİREBİR geri: scissor kapat + viewport/scissor eski haline (ana pass etkilenmesin)
      renderer.setScissorTest(savScTest);
      renderer.setViewport(savVp.x,savVp.y,savVp.z,savVp.w);
      renderer.setScissor(savSc.x,savSc.y,savSc.z,savSc.w);
      if(labels) labels.visible=savLbl;
      if(camGizmos) camGizmos.visible=savGiz;
      if(ceilG) ceilG.visible=savCeil;                        // C3-4: tavan görünürlüğü BİREBİR geri
      if(roofOn!==savRoof){ roofOn=savRoof; applyRoof(); }
    }
  }
  function updatePipTitle(){ const t=overlay&&overlay.querySelector('#v3dPipTitle');
    if(t) t.textContent=(activeCamIdx>=0?('K'+(activeCamIdx+1)+' görüşü'):'Kamera görüşü'); }

  // R8: WASD MİNİMAP — gezinti sırasında sol-alt kuşbakışı. PiP scissor-pass DESENİNİ yeniden kullanır:
  //   ortho TEPE kamera (plan tamamını sabit çerçeveye sığdırır), scissor'lı ikinci render pass minimap
  //   dikdörtgenine çizer; çatı KAPALI (kuşbakışı → içi görünsün), etiket/gizmo gizli. Sonra SVG marker'ı
  //   oyuncu konum/yön (üçgen) ile günceller. _snapBusy iken ATLA (PiP ile aynı guard). Yalnız walkOn'da.
  function renderMiniMap(){
    if(_snapBusy || !renderer || !scene || !cam) return;
    const mini=overlay&&overlay.querySelector('#v3dMiniMap');
    const body=overlay&&overlay.querySelector('#v3dMiniBody');
    if(!mini||!body) return;
    const hx=(scene.__hx!=null?scene.__hx:12), hz=(scene.__hz!=null?scene.__hz:12);
    const canvas=renderer.domElement;
    const cr=canvas.getBoundingClientRect(), br=body.getBoundingClientRect();
    const w=Math.max(2,Math.round(br.width)), h=Math.max(2,Math.round(br.height));
    const x=Math.round(br.left-cr.left);
    const y=Math.round(cr.bottom-br.bottom);                 // alttan ölç (Y flip), CSS piksel (PiP ile aynı)
    if(w<2||h<2) return;
    // ortho frustum: plan bbox'ını (2hx × 2hz) minimap aspect'ine sığdır (contain — hepsi görünür), %8 pay.
    const margin=1.08, viewAspect=w/h, planAspect=(2*hx)/(2*hz);
    let halfX, halfZ;
    if(planAspect>viewAspect){ halfX=hx*margin; halfZ=halfX/viewAspect; }
    else { halfZ=hz*margin; halfX=halfZ*viewAspect; }
    if(!miniCam) miniCam=new THREE.OrthographicCamera(-1,1,1,-1,0.1,400);
    miniCam.left=-halfX; miniCam.right=halfX; miniCam.top=halfZ; miniCam.bottom=-halfZ; miniCam.updateProjectionMatrix();
    miniCam.position.set(0,200,0); miniCam.up.set(0,0,-1); miniCam.lookAt(0,0,0);   // tepeden düz aşağı, kuzey=-Z yukarı
    const savGiz=camGizmos?camGizmos.visible:true;
    const labels=scene.__labels, savLbl=labels?labels.visible:true;
    const savRoof=roofOn;
    const ceilG=scene.__ceiling, savCeil=ceilG?ceilG.visible:false;
    const savVp=renderer.getViewport(new THREE.Vector4());
    const savSc=renderer.getScissor(new THREE.Vector4());
    const savScTest=renderer.getScissorTest();
    try{
      if(camGizmos) camGizmos.visible=false;
      if(labels) labels.visible=false;
      if(roofOn){ roofOn=false; applyRoof(); }               // kuşbakışı: çatı/duvar-üstü KALK (içi görünsün)
      if(ceilG) ceilG.visible=false;                         // tavan kapalı (yoksa üstten tavan görürüz)
      renderer.setViewport(x,y,w,h); renderer.setScissor(x,y,w,h); renderer.setScissorTest(true);
      renderer.render(scene,miniCam);
    } finally {
      renderer.setScissorTest(savScTest);
      renderer.setViewport(savVp.x,savVp.y,savVp.z,savVp.w);
      renderer.setScissor(savSc.x,savSc.y,savSc.z,savSc.w);
      if(labels) labels.visible=savLbl;
      if(camGizmos) camGizmos.visible=savGiz;
      if(ceilG) ceilG.visible=savCeil;
      if(roofOn!==savRoof){ roofOn=savRoof; applyRoof(); }
    }
    // SVG marker: oyuncu (cam.position dünya) → minimap px. Ortho: worldX∈[-halfX,halfX]→[0,MINI_W], worldZ benzer.
    const svg=overlay.querySelector('#v3dMiniMarker'); if(!svg) return;
    const mx=(cam.position.x+halfX)/(2*halfX)*MINI_W;
    const mz=(cam.position.z+halfZ)/(2*halfZ)*MINI_H;         // +Z aşağı (up=-Z → -Z ekranda yukarı)
    // yön oku: walkYaw (0=-Z=yukarı, +X saat yönü). SVG'de yukarı=-Y. Üçgeni yaw kadar döndür.
    const deg=walkYaw*180/Math.PI;
    svg.innerHTML='<g transform="translate('+mx.toFixed(1)+','+mz.toFixed(1)+') rotate('+deg.toFixed(1)+')">'+
      '<circle r="7" fill="rgba(224,132,58,.25)"/>'+
      '<path d="M0,-7 L4.5,5 L0,2.5 L-4.5,5 Z" fill="#e0843a" stroke="#1a1a1f" stroke-width="0.6"/></g>';
  }
  // PiP boyutu (kapalı/büyük). body yüksekliği 16:9 sabit.
  function applyPipSize(){ const pipEl=overlay&&overlay.querySelector('#v3dPip'), body=overlay&&overlay.querySelector('#v3dPipBody');
    if(!pipEl||!body) return;
    const w=Math.round(PIP_W*(pipBig?PIP_BIG:1));
    pipEl.style.width=w+'px'; body.style.height=Math.round(w*9/16)+'px';
    const bb=pipEl.querySelector('#v3dPipBig'); if(bb) bb.classList.toggle('on',pipBig);
  }
  function togglePipBig(){ pipBig=!pipBig; applyPipSize(); }
  function closePip(){ pipClosed=true; const pipEl=overlay&&overlay.querySelector('#v3dPip'); if(pipEl) pipEl.style.display='none'; }
  // kamera seçilince PiP kapalı işaretini KALDIR (yeni seçim = önizlemeyi geri getir)
  function openPipForSelection(){ pipClosed=false; applyPipSize(); }

  // ── C6 (kaçış yolu): kameranın KENDİ açısından DEPTH haritası → PNG dataURL ──
  // snapCameraDataURL ikizi; fark: scene.overrideMaterial=MeshDepthMaterial → renkli mesh yerine
  // derinlik (yakın=beyaz, uzak=siyah; BasicDepthPacking). C2 disiplini AYNEN: sabit 1440×810,
  // pixelRatio=1, aspect=16/9, try/finally ile BİREBİR geri. Amaç: nano-banana deprecate olursa
  // ControlNet-Depth (Flux vb.) kaçış yolu — ŞU AN pipeline'a BAĞLI DEĞİL, yalnız üretilebilir.
  // Depth aralığı iyi olsun diye kameranın near/far'ı geçici sahne çapına göre daraltılır (restore'lu).
  let _depthMat=null;
  function snapCameraDepthMap(which){
    if(!renderer||!scene||!cam) return null;
    const c=(typeof which==='number')?camList[which]:which;
    if(!c||!c.pos||!c.target) return null;
    const savedSize=renderer.getSize(new THREE.Vector2());
    if(savedSize.x<1||savedSize.y<1) return null;              // viewport 0×0 → render çöker, reddet
    const savedView=getView();
    const savAspect=cam.aspect, savPR=renderer.getPixelRatio(), savNear=cam.near, savFar=cam.far;
    const savRoof=roofOn, savGiz=camGizmos?camGizmos.visible:true;
    const labels=scene.__labels, savLbl=labels?labels.visible:true;
    const savOverride=scene.overrideMaterial, savBg=scene.background;
    let url=null;
    _snapBusy=true;
    try{
      if(!_depthMat) _depthMat=new THREE.MeshDepthMaterial({ depthPacking:THREE.BasicDepthPacking });
      if(camGizmos) camGizmos.visible=false;
      if(labels) labels.visible=false;
      if(!roofOn){ roofOn=true; applyRoof(); }                 // iç mekan tam-yükseklik → depth dolu
      renderer.setPixelRatio(1); renderer.setSize(1440,810,false);
      cam.up.set(0,1,0);
      cam.position.set(c.pos.x,c.pos.y,c.pos.z);
      cam.lookAt(c.target.x,(c.target.y!=null?c.target.y:0.5),c.target.z);
      cam.fov=lensToFov(c.lens); cam.aspect=16/9;
      cam.near=0.1; cam.far=Math.max(6, 2.2*(scene.__span||24));// depth aralığını sahneye sığdır
      cam.updateProjectionMatrix();
      scene.overrideMaterial=_depthMat; scene.background=null;
      renderer.render(scene,cam);
      url=renderer.domElement.toDataURL('image/png');
    } finally {
      scene.overrideMaterial=savOverride; scene.background=savBg;
      renderer.setPixelRatio(savPR); renderer.setSize(savedSize.x,savedSize.y,false);
      cam.aspect=savAspect; cam.near=savNear; cam.far=savFar;
      if(labels) labels.visible=savLbl;
      if(camGizmos) camGizmos.visible=savGiz;
      if(roofOn!==savRoof){ roofOn=savRoof; applyRoof(); }
      if(savedView) restoreView(savedView); else cam.updateProjectionMatrix();
      renderer.render(scene,cam);
      _snapBusy=false;
    }
    return url;
  }
  // tüm kameraları dolaş → {id, snapshot} dizisi (adım 4'ten çıkışta captureCameras ile).
  function captureCameraSnapshots(){
    return camList.map(function(c,i){ return { id:'cam'+(i+1), snapshot:snapCameraDataURL(c) }; });
  }
  // o anki kamera açısı (dünya uzayı). Adım 2→3 açı kilidi + adım 4 yan-yana eşitleme.
  function getView(){
    if(!cam||!controls) return null;
    return { position:{x:cam.position.x,y:cam.position.y,z:cam.position.z},
             target:{x:controls.target.x,y:controls.target.y,z:controls.target.z},
             up:{x:cam.up.x,y:cam.up.y,z:cam.up.z}, fov:cam.fov };
  }
  // kilitli açıyı geri uygula (adım 4'te boyalı render ile AYNI açı / adım 2'ye dönüş).
  function restoreView(v){
    if(!cam||!controls||!v||!v.position||!v.target) return;
    if(v.up) cam.up.set(v.up.x,v.up.y,v.up.z);
    cam.position.set(v.position.x,v.position.y,v.position.z);
    controls.target.set(v.target.x,v.target.y,v.target.z);
    if(v.fov){ cam.fov=v.fov; cam.updateProjectionMatrix(); }
    controls.sync(); controls.update();
  }

  /* ====================== W1-W3: WASD FIRST-PERSON GEZİNTİ ======================
     Kat'ın İÇİNDE göz-hizası (1.6m) POV gezinti. Kamera-YERLEŞTİRME sistemine (camList) DOKUNMAZ —
     kendi kamera durumunu yönetir, çıkışta restoreView ile önceki görüşe BİREBİR döner.
     Giriş: Pointer Lock + WASD yürü + fare bak (yaw/pitch). Çarpışma: RAYCAST (duvar+pencere-cam bloklar,
     kapı kanadı GEÇİLİR) + mobilya ayak-izi bloğu. Tavan AÇIK, etiket/gizmo/dock gizli (C3-4 deseni). */
  function walkHintHTML(){
    return 'WASD yürü · Fare bak · Shift koş · Space: zıpla · <b style="color:#e0843a">C: bu açıda kamera</b> · Esc çık';   // R9: C ipucu · J1: Space
  }
  function ensureWalkHint(){
    if(!overlay) return null;
    let el=overlay.querySelector('#v3dWalkHint');
    if(!el){
      el=document.createElement('div'); el.id='v3dWalkHint';
      el.style.cssText='position:absolute;left:50%;bottom:18px;transform:translateX(-50%);z-index:8;display:none;'+
        'background:rgba(20,20,26,.82);color:#e8e6e0;font:12px/1.3 system-ui,sans-serif;padding:7px 14px;'+
        'border-radius:9px;backdrop-filter:blur(6px);pointer-events:none;white-space:nowrap';
      overlay.appendChild(el);
    }
    el.innerHTML=walkHintHTML();
    return el;
  }
  // R9: görünür KÜÇÜK buton (klavye 'C' yanında ikinci yol). pointer-events:auto → tıklanabilir (pointer-lock'u
  //   bozar ama kamerayı ekler; birincil yol yine C tuşu). Gezintide göster / çıkışta gizle.
  function ensureWalkCamBtn(){
    if(!overlay) return null;
    let b=overlay.querySelector('#v3dWalkCamBtn');
    if(!b){
      b=document.createElement('button'); b.id='v3dWalkCamBtn'; b.type='button';
      b.title='Bu açıda kamera yerleştir (C)';
      b.style.cssText='position:absolute;left:50%;bottom:52px;transform:translateX(-50%);z-index:9;display:none;'+
        'background:#e0843a;color:#1a1a1f;font:12px/1 system-ui,sans-serif;font-weight:700;padding:8px 14px;border:0;'+
        'border-radius:9px;box-shadow:0 8px 22px rgba(0,0,0,.45);cursor:pointer;pointer-events:auto;white-space:nowrap';
      b.textContent='Bu açıda kamera (C)';
      b.addEventListener('click', function(ev){ ev.preventDefault(); addWalkCamera(); });
      overlay.appendChild(b);
    }
    return b;
  }
  // gezinti-modu ⇒ mesh dışındaki tüm dock/panel/çip gizlensin (temiz POV). Çıkışta restore etmeye gerek yok
  //   (mevcut activeGroup renderDrawer ile geri gelir); burada sadece anlık gizleriz.
  function hideChromeForWalk(hide){
    if(!overlay) return;
    ['#v3dDock','#v3dCamDock','#v3dFurnDock','#v3dMatDock','#v3dFurnBar','#v3dPip','#v3dCompareThumb','#v3dLockBtn','#v3dZoomBar','#v3dStatus','#v3dOrb']
      .forEach(function(sel){ const e=overlay.querySelector(sel); if(e) e.style.visibility=hide?'hidden':''; });
  }
  function walkIsCoarse(){
    return (typeof matchMedia==='function' && matchMedia('(pointer: coarse)').matches)
        || (typeof navigator!=='undefined' && navigator.maxTouchPoints>0 && !(typeof matchMedia==='function' && matchMedia('(pointer: fine)').matches));
  }
  // W1: gezinti başlangıç noktası — bina İÇİNDE mantıklı bir yer (yoksa orbit kamerası dışarıda/yukarıda
  //   kalır → siyah kadraj). Tercih: apartman holü / antre / en büyük ortak alan / merkeze en yakın oda.
  //   Dönüş: {x,z} DÜNYA uzayında (grup -cx,-cz ofsetli → oda px2m'den -cx,-cz çıkarılır). Yoksa null.
  function walkSpawnPoint(){
    const map=scene&&scene.__map; if(!map) return null;
    const cx=scene.__cx||0, cz=scene.__cz||0;
    const cands=[];
    (map.common_areas||[]).forEach(function(r){ cands.push(r); });
    (map.units||[]).forEach(function(u){ (u.rooms||[]).forEach(function(r){ cands.push(r); }); });
    // en GENİŞ oda = en açık görüş hattı (dar antrede duvara bakıp siyah kalmaz). alanı poligon-px ile ölç.
    function polyAreaPx(P){ let a=0; for(let i=0,j=P.length-1;i<P.length;j=i++) a+=(P[j][0]+P[i][0])*(P[j][1]-P[i][1]); return Math.abs(a/2); }
    let best=null, bestArea=-1;
    cands.forEach(function(r){ if(!r.polygon_px||r.polygon_px.length<3) return;
      if(/MERDİVEN|MERDIVEN|ASANSÖR|ASANSOR|ŞAFT|SAFT|DEPO/i.test(r.name||'')) return;   // çekirdek/depo iç mekan gezintiye uygun değil
      const ar=polyAreaPx(r.polygon_px); if(ar>bestArea){ bestArea=ar; best=r; } });
    if(!best) return null;
    const la=best.label_anchor_px||best.centroid_px; if(!la) return null;
    const m=px2m(map,la[0],la[1]);
    const wx=m[0]-cx, wz=m[1]-cz;
    // bakış yönü: odanın kendi merkezinden UZAK köşesine değil, oda içinde en uzun eksene bak (açık hat).
    //   basit: poligon merkezinden en uzak köşeye doğru (o yönde en çok mesafe var → duvara yapışmaz).
    let far=null,fd=-1;
    best.polygon_px.forEach(function(p){ const pm=px2m(map,p[0],p[1]); const dx=pm[0]-cx-wx, dz=pm[1]-cz-wz; const d=dx*dx+dz*dz; if(d>fd){ fd=d; far=[dx,dz]; } });
    let aimYaw=null;
    if(far){ const L=Math.hypot(far[0],far[1])||1; aimYaw=Math.atan2(far[0]/L, -far[1]/L); }
    return {x:wx,z:wz,room:best,yaw:aimYaw};
  }
  function toggleWalk(){
    if(walkOn){ exitWalk(); return; }
    // W3 (dokunmatik): coarse-pointer'da pointer-lock + fare-bak yok → giriş yerine ipucu (mobil joystick SONRA)
    if(walkIsCoarse() || typeof (renderer&&renderer.domElement.requestPointerLock)!=='function'){
      if(status) status.textContent='Gezinti masaüstünde kullanılabilir (klavye + fare).';
      const st=overlay&&overlay.querySelector('#v3dStatus'); if(st){ st.textContent='Gezinti masaüstünde kullanılabilir (klavye + fare)'; st.style.display='block'; }
      return;
    }
    enterWalk();
  }
  function enterWalk(){
    if(walkOn || !cam || !controls || !renderer) return;
    if(compareMode){ /* akış içi: yine izin ver, ama açı-uyarısı gezinti sırasında saçmalar → gizle */ }
    walkSavedView=getView();
    // giriş açısından yaw türet (mevcut bakış yönünü koru), pitch'i yatay al (iç mekan doğal başlangıç)
    const dir=new THREE.Vector3().subVectors(controls.target, cam.position);
    if(dir.lengthSq()<1e-6) dir.set(0,0,-1);
    dir.normalize();
    walkYaw=Math.atan2(dir.x, -dir.z);                       // 0 = -Z'ye bakış
    walkPitch=0;                                             // göz hizası → düz karşıya bak (yukarı/aşağı fareyle)
    // bina İÇİNE ışınlan: orbit kamerası dışarıda/yukarıda → göz hizasına düşünce siyah kalırdı
    const sp=walkSpawnPoint();
    if(sp){ cam.position.set(sp.x, WALK_EYE, sp.z); if(sp.yaw!=null) walkYaw=sp.yaw; }   // en geniş odaya, açık görüş hattına bak
    else { cam.position.y=WALK_EYE; }
    // chrome: tavan+çatı aç (iç mekan), etiket/gizmo/dock/koni gizle (snapCameraDataURL deseni)
    walkRoofSav=roofOn; walkGizSav=camGizmos?camGizmos.visible:true;
    const labels=scene&&scene.__labels; walkLblSav=labels?labels.visible:true;
    const ceilG=scene&&scene.__ceiling; walkCeilSav=ceilG?ceilG.visible:false;
    if(!roofOn){ roofOn=true; applyRoof(); }
    if(ceilG) ceilG.visible=true;
    if(labels) labels.visible=false;
    if(camGizmos) camGizmos.visible=false;
    walkFogSav=scene?scene.fog:null; if(scene) scene.fog=null;   // iç mekanda uzak-sis kadrajı boğar → kapat
    // W3: iç aydınlatma — kapalı çatı/tavan key ışığı gölgeler → iç mekan KARANLIK. Gezinti-özel
    //   kafa lambası (kameraya bağlı point) + yumuşak fill ambient ekle (yalnız gezinti; çıkışta kaldır).
    if(scene){
      // U2: değerler WALK_LIGHT'tan (patlak-ışık düzeltmesi: kısık fener + kısa menzil/hızlı düşüş + ölçülü fill)
      if(!walkLamp){ walkLamp=new THREE.PointLight(WALK_LIGHT.lampColor, WALK_LIGHT.lampInt, WALK_LIGHT.lampRange, WALK_LIGHT.lampDecay); }    // kafa lambası: yakın hacmi yumuşak vurgular (patlatmaz)
      else { walkLamp.intensity=WALK_LIGHT.lampInt; walkLamp.distance=WALK_LIGHT.lampRange; walkLamp.decay=WALK_LIGHT.lampDecay; }             // tekrar girişte güncel ayar
      if(!walkAmbient){ walkAmbient=new THREE.HemisphereLight(WALK_LIGHT.fillSky, WALK_LIGHT.fillGround, WALK_LIGHT.fillInt); }  // iç mekan gündüz fill: oda okunur ama yakmaz
      else { walkAmbient.intensity=WALK_LIGHT.fillInt; }
      scene.add(walkLamp); scene.add(walkAmbient);             // lamba dünya-uzayında; konumu her karede kameraya izler (walkStep)
      walkLamp.position.set(cam.position.x, cam.position.y+0.2, cam.position.z);
    }
    walkOn=true;
    walkY=WALK_EYE; walkVelY=0; walkGrounded=true;           // J1: dikey durumu sıfırla (girişte yerde)
    Object.keys(walkKeys).forEach(function(k){ walkKeys[k]=false; });
    walkClock=(typeof performance!=='undefined'?performance.now():Date.now());
    cam.fov=72; cam.up.set(0,1,0); applyWalkLook();           // geniş-açı iç mekan hissi
    hideChromeForWalk(true);
    const hint=ensureWalkHint(); if(hint) hint.style.display='block';
    const camBtn=ensureWalkCamBtn(); if(camBtn) camBtn.style.display='block';   // R9: 'bu açıda kamera' butonu
    const mini=overlay&&overlay.querySelector('#v3dMiniMap'); if(mini) mini.style.display='block';   // R8: minimap göster
    renderRail();
    // pointer lock iste (kullanıcı hareketiyle tetiklendi → tarayıcı izin verir)
    const el=renderer.domElement;
    window.addEventListener('keydown', walkKeyDown, true);
    window.addEventListener('keyup', walkKeyUp, true);
    document.addEventListener('pointerlockchange', walkLockChange);
    document.addEventListener('mousemove', walkMouseMove);
    if(el.requestPointerLock) try{ el.requestPointerLock(); }catch(e){}
  }
  function exitWalk(){
    if(!walkOn) return;
    walkOn=false;
    window.removeEventListener('keydown', walkKeyDown, true);
    window.removeEventListener('keyup', walkKeyUp, true);
    document.removeEventListener('pointerlockchange', walkLockChange);
    document.removeEventListener('mousemove', walkMouseMove);
    if(document.pointerLockElement) try{ document.exitPointerLock(); }catch(e){}
    // chrome geri: giriş anındaki durumlar
    const ceilG=scene&&scene.__ceiling; if(ceilG) ceilG.visible=walkCeilSav;
    const labels=scene&&scene.__labels; if(labels) labels.visible=walkLblSav;
    if(camGizmos) camGizmos.visible=walkGizSav;
    if(roofOn!==walkRoofSav){ roofOn=walkRoofSav; applyRoof(); }
    if(scene) scene.fog=walkFogSav;
    // W3: gezinti aydınlatmasını kaldır (ana render/iso/snapshot ışıkları BİREBİR eski kalsın)
    if(walkLamp&&walkLamp.parent) walkLamp.parent.remove(walkLamp);
    if(walkAmbient&&walkAmbient.parent) walkAmbient.parent.remove(walkAmbient);
    hideChromeForWalk(false);
    const hint=overlay&&overlay.querySelector('#v3dWalkHint'); if(hint) hint.style.display='none';
    const camBtn=overlay&&overlay.querySelector('#v3dWalkCamBtn'); if(camBtn) camBtn.style.display='none';   // R9: butonu gizle
    const mini=overlay&&overlay.querySelector('#v3dMiniMap'); if(mini) mini.style.display='none';   // R8: minimap gizle (çıkışta kaybolur)
    if(walkSavedView) restoreView(walkSavedView);            // önceki görüşe BİREBİR dön
    walkSavedView=null;
    renderRail();
  }
  function walkLockChange(){
    // kullanıcı Esc'e bastı → tarayıcı kilidi bıraktı → gezintiden çık (durum tutarlı)
    if(walkOn && !document.pointerLockElement) exitWalk();
  }
  function walkKeyDown(e){
    if(!walkOn) return;
    const k=e.key.toLowerCase();
    if(k==='w'||k==='arrowup'){ walkKeys.w=true; e.preventDefault(); }
    else if(k==='s'||k==='arrowdown'){ walkKeys.s=true; e.preventDefault(); }
    else if(k==='a'||k==='arrowleft'){ walkKeys.a=true; e.preventDefault(); }
    else if(k==='d'||k==='arrowright'){ walkKeys.d=true; e.preventDefault(); }
    else if(e.key==='Shift'){ walkKeys.shift=true; }
    else if(k==='c'){ addWalkCamera(); e.preventDefault(); }   // R9: bu açıda kamera yerleştir (pointer-lock aktifken KLAVYE birincil yol)
    else if(k===' '||k==='spacebar'){ if(walkGrounded){ walkVelY=WALK_JUMP_V0; walkGrounded=false; } e.preventDefault(); }   // J1: zıpla (yalnız yerdeyken → çift-zıplama yok)
    // Esc: tarayıcı pointer-lock'u KENDİ bırakır → walkLockChange çıkışı yapar (ayrıca burada yakala)
    else if(e.key==='Escape'){ exitWalk(); }
  }
  function walkKeyUp(e){
    if(!walkOn) return;
    const k=e.key.toLowerCase();
    if(k==='w'||k==='arrowup') walkKeys.w=false;
    else if(k==='s'||k==='arrowdown') walkKeys.s=false;
    else if(k==='a'||k==='arrowleft') walkKeys.a=false;
    else if(k==='d'||k==='arrowright') walkKeys.d=false;
    else if(e.key==='Shift') walkKeys.shift=false;
  }
  function walkMouseMove(e){
    if(!walkOn || !document.pointerLockElement) return;
    const sens=0.0022;
    walkYaw   -= (e.movementX||0)*sens;
    walkPitch -= (e.movementY||0)*sens;
    walkPitch = Math.max(-WALK_PITCH_MAX, Math.min(WALK_PITCH_MAX, walkPitch));
    applyWalkLook();
  }
  // yaw/pitch → kamera lookAt hedefi (kamera pozisyonu step'te güncellenir; burada yön)
  function applyWalkLook(){
    if(!cam) return;
    const cp=Math.cos(walkPitch);
    const fx=Math.sin(walkYaw)*cp, fy=Math.sin(walkPitch), fz=-Math.cos(walkYaw)*cp;
    cam.up.set(0,1,0);
    cam.lookAt(cam.position.x+fx, cam.position.y+fy, cam.position.z+fz);
    if(controls) controls.target.set(cam.position.x+fx, cam.position.y+fy, cam.position.z+fz);
  }
  // W2: bir eksende (dünya birim vektörü) belirli mesafe serbest mi? RAYCAST duvar+pencere-cam'e;
  //   kapı kanadı (isLeaf)/eşik(isSill)/tavan(isCeiling) çarpışma DIŞI → kapı boşluğundan geçilir.
  //   +mobilya ayak-izi bloğu (ucuz nokta-poligon, buffer'lı). dist = adım + tampon.
  function walkAxisClear(px,pz, dirx,dirz, dist){
    // W5: ÇARPIŞMA GÖRSELDEN AYRIŞTI → ray, görünmez tam-kalınlık collider setine atılır (duvar koşusu başına
    //   bir kutu; kapı boşlukları oyuk, pencereler dolu). Görsel yarım-duvarlar arasından/boştan kaçış biter.
    const cg=(scene&&scene.__colliders);
    if(!cg){ if(!scene||!scene.__walls) return true; } // geriye-uyum: collider yoksa eski davranışa düşme
    if(!walkRay) walkRay=new THREE.Raycaster();
    // grup ofsetli (-cx,-cz) → ray origin DÜNYA uzayında (cam.position da dünya). intersect dünya-uzayı sonuç verir.
    walkRay.set(new THREE.Vector3(px, WALK_EYE, pz), new THREE.Vector3(dirx,0,dirz).normalize());
    walkRay.far=dist;
    const target=cg?cg.children:scene.__walls.children;
    const hits=walkRay.intersectObjects(target, false);
    for(let i=0;i<hits.length;i++){
      const u=hits[i].object.userData||{};
      if(u.isCollider) return false;                         // W5: görünmez tam-kalınlık duvar/pencere kutusu → engel
      if(u.isLeaf||u.isSill||u.isCeiling) continue;          // (eski yol) kapı kanadı/eşik → geçilir
      if(u.isWall||u.isWin) return false;                    // (eski yol) duvar + parapet + cam panel → engel
    }
    // mobilya: hedef nokta bir ayak-izi (buffer'la şişmiş) içine giriyorsa engel
    // U3 FIX (koordinat uzayı): cam.position (px,pz) DÜNYA uzayında (walkSpawnPoint = m-cx,-cz).
    //   f.__fp / f.pos ise MUTLAK metre (model uzayı, ofsetsiz). Eski kod dünya tx/tz'yi doğrudan
    //   model footprint'e sokuyordu → cx/cz kadar kayık, çakışma HİÇ tutmuyordu (mobilyadan geçiliyordu).
    //   worldToPx ile aynı dönüşüm: model = dünya + (cx,cz).
    const cxo=(scene&&scene.__cx)||0, czo=(scene&&scene.__cz)||0;
    const tx=px+dirx*dist+cxo, tz=pz+dirz*dist+czo;
    for(let i=0;i<furnList.length;i++){
      const f=furnList[i]; if(!f||!f.pos) continue;
      if(COLLISION_EXEMPT[f.type]) continue;                  // halı/kilim gibi geçilebilir mobilya
      // U3: kalıcı store'dan gelen mobilyada __fp olmayabilir (yalnız pos/rot/__w/__d taşınır) → taze hesapla.
      let fp=f.__fp;
      if(!fp){ const dm=FURN_DIM[f.type]||{w:0.5,d:0.5}, fw=(f.__w!=null?f.__w:dm.w), fd=(f.__d!=null?f.__d:dm.d);
        fp=furnFootprintM(f.pos.x,f.pos.z,f.rot_deg||0,fw,fd); }
      if(pointNearPoly(tx,tz,fp,WALK_BUFFER)) return false;
    }
    return true;
  }
  // W5 TEST/DIAGNOSTIK: her GÖRSEL duvar segmentinin (isWall) ortasından her iki dik yöne göz-hizası ray at →
  //   çarpışma seti onu ENGEL sayıyor mu. Engel saymayan segment = "delik" (içinden geçilir). 0 hedeflenir.
  //   Read-only: sahneyi değiştirmez. Kapı/pencere boşlukları görsel duvar segmenti DEĞİL → sayıma girmez.
  function collisionHoleScan(){
    if(!scene||!scene.__walls||!scene.__colliders) return { segs:0, holes:0, holeList:[] };
    const cxo=(scene.__cx)||0, czo=(scene.__cz)||0;   // grup ofseti (mesh local → dünya için -cx,-cz uygulanır)
    let segs=0, holes=0; const holeList=[];
    scene.__colliders.updateMatrixWorld(true); scene.__walls.updateMatrixWorld(true);   // raycast dünya matrisleri taze olsun
    scene.__walls.children.forEach(function(w){
      if(!w.userData||!w.userData.isWall) return; segs++;
      // segment dünya konumu + yönü: mesh local X ekseni duvar boyu; dik = local Z. mesh pozisyonu grup-local.
      const wx=w.position.x-cxo, wz=w.position.z-czo;   // dünya XZ (grup -cx,-cz ofsetli)
      const ang=w.rotation.y;                            // ang=-atan2(dz,dx); local +Z dünya=(sin,cos)
      const nx=Math.sin(ang), nz=Math.cos(ang);         // duvar dik yönü (dünya)
      // her iki taraftan içeri doğru kısa ray → collider yakalamalı
      const D=Math.max(0.6, WALL_T*3);
      const a=walkAxisClear(wx-nx*D*0.5, wz-nz*D*0.5,  nx, nz, D);   // -taraftan +yöne
      const b=walkAxisClear(wx+nx*D*0.5, wz+nz*D*0.5, -nx,-nz, D);   // +taraftan -yöne
      if(a && b){ holes++; holeList.push({x:+wx.toFixed(2), z:+wz.toFixed(2)}); }   // iki yönden de engel yok → delik
    });
    return { segs:segs, holes:holes, colliders:scene.__colliders.children.length, holeList:holeList.slice(0,10) };
  }
  // nokta poligona buffer kadar yakın mı (içinde ya da herhangi bir kenara < buffer)
  function pointNearPoly(x,z,poly,buf){
    if(pointInPolyM(x,z,poly)) return true;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const a=poly[i],b=poly[j], dx=b[0]-a[0],dz=b[1]-a[1], L2=dx*dx+dz*dz;
      let t=L2>0?((x-a[0])*dx+(z-a[1])*dz)/L2:0; t=Math.max(0,Math.min(1,t));
      const cxp=a[0]+t*dx, czp=a[1]+t*dz, ddx=x-cxp, ddz=z-czp;
      if(ddx*ddx+ddz*ddz < buf*buf) return true;
    }
    return false;
  }
  // J1: (x,z) altındaki GÖZ-hizası zemin yüksekliği. Taban = WALK_EYE. Ayak noktası ALÇAK bir mobilyanın (tepe
  //   ≤ WALK_STAND_MAX) ayak-izi içindeyse üstüne çıkılabilir → WALK_EYE + tepe. Yüksek/geçilmez mobilya (dolap,
  //   masa) üstüne çıkılmaz (taban döner → o mobilyayı zaten yatay çarpışma engeller). Koordinat: (x,z) DÜNYA;
  //   footprint MUTLAK metre → worldToPx ile aynı (+cx,+cz) dönüşümü.
  function walkFloorAt(x,z){
    let floor=WALK_EYE;
    const cxo=(scene&&scene.__cx)||0, czo=(scene&&scene.__cz)||0;
    const mx=x+cxo, mz=z+czo;
    for(let i=0;i<furnList.length;i++){
      const f=furnList[i]; if(!f||!f.pos) continue;
      const h=furnHeightOf(f.type); if(h==null||h>WALK_STAND_MAX) continue;   // yalnız alçak mobilya üstü basılabilir
      let fp=f.__fp;
      if(!fp){ const dm=FURN_DIM[f.type]||{w:0.5,d:0.5}, fw=(f.__w!=null?f.__w:dm.w), fd=(f.__d!=null?f.__d:dm.d);
        fp=furnFootprintM(f.pos.x,f.pos.z,f.rot_deg||0,fw,fd); }
      if(pointInPolyM(mx,mz,fp)){ const top=WALK_EYE+h; if(top>floor) floor=top; }
    }
    return floor;
  }
  // her karede (loop) çağrılır: dt hesapla, WASD yönünü kur, eksen-ayrık çarpışma (duvar boyunca kayar), uygula.
  function walkStep(){
    if(!walkOn||!cam) return;
    const now=(typeof performance!=='undefined'?performance.now():Date.now());
    let dt=(now-walkClock)/1000; walkClock=now;
    if(dt>0.1) dt=0.1;                                        // sekme arka-plandan dönünce sıçramayı önle
    let mf=0, ms=0;                                          // ileri / yan giriş
    if(walkKeys.w) mf+=1; if(walkKeys.s) mf-=1;
    if(walkKeys.d) ms+=1; if(walkKeys.a) ms-=1;
    if(mf!==0||ms!==0){
      // yatay düzlemde ileri/yan yön (pitch'ten bağımsız → merdiven yok, düz yürü)
      const fx=Math.sin(walkYaw), fz=-Math.cos(walkYaw);       // ileri (yatay)
      const rx=Math.cos(walkYaw), rz=Math.sin(walkYaw);        // sağ (yatay)
      let vx=fx*mf+rx*ms, vz=fz*mf+rz*ms;
      const vl=Math.hypot(vx,vz)||1; vx/=vl; vz/=vl;
      const speed=(walkKeys.shift?WALK_RUN:WALK_SPEED)*dt;
      const px=cam.position.x, pz=cam.position.z;
      // eksen-ayrık: X ve Z ayrı test → bir duvara çarpınca diğer eksende kayar (J1: havadayken de AYNI yatay çarpışma)
      if(vx!==0 && walkAxisClear(px,pz, vx,0, Math.abs(vx*speed)+WALK_BUFFER)) cam.position.x=px+vx*speed;
      if(vz!==0 && walkAxisClear(cam.position.x,pz, 0,vz, Math.abs(vz*speed)+WALK_BUFFER)) cam.position.z=pz+vz*speed;
      // güvenlik ağı: bina dış bbox'ı DIŞINA çıkma (cephedeki kapı boşluğundan boşluğa yürüyüp kadraj-dışı
      //   siyaha düşmeyi önler; iç kapı geçişleri bbox İÇİNDE olduğundan etkilenmez). hx/hz merkez-hizalı yarı-en.
      const hx=(scene&&scene.__hx)||1e9, hz=(scene&&scene.__hz)||1e9, mrg=WALK_BUFFER;
      cam.position.x=Math.max(-hx+mrg, Math.min(hx-mrg, cam.position.x));
      cam.position.z=Math.max(-hz+mrg, Math.min(hz-mrg, cam.position.z));
    }
    // J1: DİKEY BALİSTİK — her karede yerçekimi entegre et, zemine (taban ya da alçak mobilya tepesi) in.
    const floorY=walkFloorAt(cam.position.x, cam.position.z);
    if(!walkGrounded || walkY>floorY+1e-4){
      walkVelY-=WALK_GRAV*dt; walkY+=walkVelY*dt;
      if(walkY<=floorY){ walkY=floorY; walkVelY=0; walkGrounded=true; }   // iniş
      else walkGrounded=false;
    } else { walkY=floorY; walkVelY=0; walkGrounded=true; }               // yerde kalırken zemine yapış (mobilya üstü/taban)
    cam.position.y=walkY;                                     // göz hizası = taban/mobilya-üstü + zıplama ofseti
    applyWalkLook(); walkSyncLamp();
  }
  function walkSyncLamp(){ if(walkLamp&&cam) walkLamp.position.set(cam.position.x, cam.position.y+0.2, cam.position.z); }
  // R9: FPV gezinti sırasında 'C' / overlay butonu → o anki yürüyüş görüşünü camList'e YENİ render kamerası ekle.
  //   pos = göz konumu (y=WALK_EYE=1.6 → customY özel yükseklik). target = pos + bakış vektörü (walkYaw+walkPitch
  //   → PITCH DAHİL, kullanıcının gördüğü kare neyse o). lens = varsayılan 24. Kamera-ekleme MEVCUT yoldan
  //   (camList sözleşmesi, aynı item şekli) → exportCameras şeması DEĞİŞMEZ. Gezinti KESİLMEZ (yürümeye devam).
  function addWalkCamera(){
    if(!walkOn||!cam) return;
    const cp=Math.cos(walkPitch);
    const fx=Math.sin(walkYaw)*cp, fy=Math.sin(walkPitch), fz=-Math.cos(walkYaw)*cp;   // applyWalkLook ile aynı bakış vektörü
    const AIM=3.0;                                          // hedef mesafesi (m) — makul bakış noktası (pitch korunur)
    const pos={ x:cam.position.x, y:WALK_EYE, z:cam.position.z };
    const c={ pos:pos, target:{ x:pos.x+fx*AIM, y:pos.y+fy*AIM, z:pos.z+fz*AIM }, lens:24, height:'eye', customY:WALK_EYE };
    camList.push(c); activeCamIdx=camList.length-1;         // yeni kamera seçili → çıkışta şeritte+PiP'te hazır
    logRoom(c);                                             // doğrulama log (room_id export'ta camViewObj ile hesaplanır)
    renderCamGizmos();                                      // gizmo grubu tazele (gezintide gizli; çıkışta görünür)
    // overlay onayı (gezinti kesilmez): kısa "Kx eklendi · toplam N"
    const hint=overlay&&overlay.querySelector('#v3dWalkHint');
    if(hint){ const base=walkHintHTML(); hint.innerHTML='<b style="color:#e0843a">K'+camList.length+' eklendi · toplam '+camList.length+'</b> &nbsp; '+base;
      if(walkCamMsgT) clearTimeout(walkCamMsgT); walkCamMsgT=setTimeout(function(){ const h=overlay&&overlay.querySelector('#v3dWalkHint'); if(h&&walkOn) h.innerHTML=walkHintHTML(); }, 2200); }
  }

  /* ====================== KAMERA-KOYMA MODU (adım 4) ======================
     Raycaster ile zemin mesh'ine tıkla → kamera dünya konumu. İKİ TIKLAMA:
     1) konum, 2) bakış noktası (target, zeminde). Yükseklik (y) ayrı 3-kademe seçici.
     exportCameras → plan-px uzayı (oda poligonlarıyla AYNI) + cameraViewInfo room_id.
     AI yok → açı kayması eşlemeyi bozamaz (brief B). */
  function m2px(map,mx,my){ const mpp=map.scale.metersPerPixel, o=map.scale.origin_px; return [mx/mpp+o[0], my/mpp+o[1]]; }
  // view3d dünya (G ofseti -cx,-cz) → metre → plan-px. px2m'in tam tersi + merkezleme geri eklenir.
  function worldToPx(map,wx,wz){ return m2px(map, wx+(scene.__cx||0), wz+(scene.__cz||0)); }
  function headingOf(c){                                   // 0=yukarı(-Z), saat yönü (io.js cameraViewInfo konvansiyonu)
    const dx=c.target.x-c.pos.x, dz=c.target.z-c.pos.z;
    const a=Math.atan2(dx,-dz)*180/Math.PI; return (a%360+360)%360;
  }
  function lensToFov(l){ return LENS_FOV[l]||74; }

  function ensureGizmoGroup(){ if(!camGizmos||!camGizmos.parent){ camGizmos=new THREE.Group(); scene.add(camGizmos); } return camGizmos; }

  // küçük 3B KAMERA modeli (gövde + objektif + vizör). Lokal +Z = objektif/bakış yönü.
  // userData.camIdx tüm parçalara işlenir → raycaster seçimde hangi kamera olduğunu bilir.
  function makeCameraMesh(c,active,idx){
    const grp=new THREE.Group();
    const bodyCol=active?0xe0843a:0x6f7077, accent=active?0x3a1e0c:0x232327;
    const matBody=new THREE.MeshStandardMaterial({color:bodyCol,roughness:0.45,metalness:0.35,emissive:active?0x401f08:0x000000});
    const matLens=new THREE.MeshStandardMaterial({color:0x1b1b20,roughness:0.3,metalness:0.6});
    const matDark=new THREE.MeshStandardMaterial({color:accent,roughness:0.5,metalness:0.3});
    const body=new THREE.Mesh(new THREE.BoxGeometry(0.34,0.24,0.22),matBody);           // gövde
    const lens=new THREE.Mesh(new THREE.CylinderGeometry(0.085,0.105,0.16,18),matLens);  // objektif
    lens.rotation.x=Math.PI/2; lens.position.set(0,0,0.17);                              // +Z'ye doğru (bakış)
    const hood=new THREE.Mesh(new THREE.CylinderGeometry(0.115,0.115,0.04,18),matDark);
    hood.rotation.x=Math.PI/2; hood.position.set(0,0,0.255);
    const vf=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.07,0.1),matDark);               // vizör/üst kabarcık
    vf.position.set(-0.04,0.155,-0.02);
    grp.add(body,lens,hood,vf);
    // yön: lokal +Z'yi (target-pos) yönüne döndür
    const d=new THREE.Vector3(c.target.x-c.pos.x,(c.target.y||0.5)-c.pos.y,c.target.z-c.pos.z);
    if(d.lengthSq()<1e-6) d.set(0,0,1); d.normalize();
    grp.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),d);
    grp.position.set(c.pos.x,c.pos.y,c.pos.z);
    grp.traverse(function(o){ o.userData.camIdx=idx; if(o.isMesh) o.castShadow=true; });
    return grp;
  }
  // GÖRÜŞ KONİSİ — apeks kamerada, objektif yönünde açılır. Yarı-açı = yatay görüş açısının yarısı.
  // Çubuk yerine koni → kameranın NEREYE baktığı tek bakışta okunur (kullanıcı isteği #5).
  function makeViewCone(c,active){
    const dir=new THREE.Vector3(c.target.x-c.pos.x,(c.target.y||0.5)-c.pos.y,c.target.z-c.pos.z);
    let L=dir.length(); if(!(L>1e-4)){ L=2.4; dir.set(0,0,1); }   // pos==target → güvenli varsayılan yön
    L=Math.max(1.6,Math.min(L*0.95,9)); dir.normalize();           // koni bakış noktasına KADAR uzansın (büyük odada kısalmasın)
    const fov=lensToFov(c.lens)*Math.PI/180, R=Math.tan(fov/2)*L;
    const geo=new THREE.ConeGeometry(R,L,30,1,true);   // açık uçlu (içi boş ışın huzmesi)
    geo.translate(0,-L/2,0);                            // apeks lokal orijine (y=0), taban -y'de
    const col=active?0xffa53a:0x8fa6c0;                        // seçili = parlak turuncu; pasif daha soluk → kontrast artar
    const fill=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:col,transparent:true,
      opacity:active?0.32:0.07,side:THREE.DoubleSide,depthWrite:false}));
    const edge=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:col,wireframe:true,transparent:true,
      opacity:active?0.85:0.16,depthWrite:false}));
    const cone=new THREE.Group(); cone.add(fill,edge);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),dir);   // -y(apeks→taban) → bakış yönü
    cone.position.set(c.pos.x,c.pos.y,c.pos.z);
    return cone;
  }
  // eski gizmo geometri/material'lerini GPU'dan bırak (her etkileşimde yeniden kurulur → sızıntı olmasın)
  function disposeGizmo(o){ if(o.traverse) o.traverse(function(n){
      if(n.geometry) n.geometry.dispose();
      if(n.material){ (Array.isArray(n.material)?n.material:[n.material]).forEach(function(m){ if(m&&m.dispose) m.dispose(); }); }
    }); }
  // SEÇİLİ kamerayı belirginleştir (#6 "seçileni göremiyorum"): zemine parlak turuncu halka + diske + kameraya ince dikey iğne.
  function makeActiveMarker(c){
    const grp=new THREE.Group(), COL=0xffa53a;
    const ring=new THREE.Mesh(new THREE.RingGeometry(0.44,0.62,44),
      new THREE.MeshBasicMaterial({color:COL,transparent:true,opacity:0.92,side:THREE.DoubleSide,depthWrite:false}));
    ring.rotation.x=-Math.PI/2; ring.position.set(c.pos.x,0.03,c.pos.z);
    const disc=new THREE.Mesh(new THREE.CircleGeometry(0.44,44),
      new THREE.MeshBasicMaterial({color:COL,transparent:true,opacity:0.16,side:THREE.DoubleSide,depthWrite:false}));
    disc.rotation.x=-Math.PI/2; disc.position.set(c.pos.x,0.025,c.pos.z);
    const H=Math.max(0.4,c.pos.y||1.6);
    const pin=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,H,8),
      new THREE.MeshBasicMaterial({color:COL,transparent:true,opacity:0.5,depthWrite:false}));
    pin.position.set(c.pos.x,H/2,c.pos.z);
    grp.add(ring,disc,pin);
    return grp;
  }
  function renderCamGizmos(){
    if(!scene) return;
    const g=ensureGizmoGroup();
    while(g.children.length){ const ch=g.children[0]; disposeGizmo(ch); g.remove(ch); }
    if(!camUIEnabled) return;                                       // gizmolar yalnız kamera adımında
    camList.forEach(function(c,i){
      const active=(i===activeCamIdx);
      if(active) g.add(makeActiveMarker(c));                        // seçili işaretçi ÖNCE → kamera mesh'i üstte kalsın
      g.add(makeViewCone(c,active));
      g.add(makeCameraMesh(c,active,i));
    });
    if(pendingPos){                                                 // 'add' 1. tık: yer işareti
      const s=new THREE.Mesh(new THREE.SphereGeometry(0.16,14,14),
        new THREE.MeshStandardMaterial({color:0x7bbf8a,emissive:0x2a4a30}));
      s.position.set(pendingPos.x,CAM_Y[camHeight],pendingPos.z); g.add(s);
    }
  }

  // tıklanan nesneden (ya da atasından) kamera indexini bul
  function camIdxFromObj(o){ while(o){ if(o.userData&&o.userData.camIdx!=null) return o.userData.camIdx; o=o.parent; } return -1; }
  // zemine tıklanan p → bakış hedefi = tıklanan ZEMİN noktası (aşağı bakış SERBEST — kullanıcı geri bildirimi B1-3:
  //   "önceden yakına tıklayınca yere bakıyordu, o daha doğruydu"). Eski yatay-zorlama (y=camPos.y) kaldırıldı.
  //   İnce ayar (tilt/pitch) B1-2 slider'ıyla yapılır: tıkla kabaca, slider'la incelt.
  //   Guard: kameraya ÇOK yakın/aynı noktaya tıkta degenerate lookAt olmasın (yatay+dikey birlikte min mesafe).
  function aimTargetFrom(camPos,p){
    let dx=p.x-camPos.x, dz=p.z-camPos.z, dy=(p.y!=null?p.y:0)-camPos.y;
    let d=Math.hypot(dx,dy,dz);
    const MIN=0.5;                                   // 3B min bakış uzaklığı (dejenere lookAt engeli)
    if(d<1e-3){ dx=0; dy=0; dz=-1; }                 // tam üstüne tıklandı → varsayılan ileri (-Z)
    else if(d<MIN){ const k=MIN/d; dx*=k; dy*=k; dz*=k; }
    return { x:camPos.x+dx, y:camPos.y+dy, z:camPos.z+dz };   // hedef = tıklanan zemin (y dahil) → aşağı bakış serbest
  }
  function scenePick(ev){
    if(!renderer||!scene) return;
    const matMode=(activeGroup==='material' && matUIEnabled);
    if(!camUIEnabled && !furnMode && !matMode) return;
    const rect=renderer.domElement.getBoundingClientRect();
    const nx=((ev.clientX-rect.left)/rect.width)*2-1, ny=-((ev.clientY-rect.top)/rect.height)*2+1;
    if(!raycaster) raycaster=new THREE.Raycaster();
    raycaster.setFromCamera({x:nx,y:ny}, cam);
    // ── MALZEME modu (M2): zemin mesh'ine tıkla → o odayı seç (userData.roomRef). Kamera/mobilya modundan bağımsız. ──
    if(matMode){
      if(scene.__floorGroup){
        const rh=raycaster.intersectObjects(scene.__floorGroup.children,false);
        if(rh.length){ const o=rh[0].object.userData&&rh[0].object.userData.roomRef; if(o&&o.id){ selectMatRoom(o.id); return; } }
      }
      selectMatRoom(null); return;   // boş → seçimi bırak
    }
    // ── MOBİLYA modu (B2): mobilya hit → SEÇ; boş zemin tık → seçimi bırak. EKLEME palet-hayaleti üzerinden (startFurnGhost). ──
    if(furnMode){
      if(scene.__furnitureGroup){
        const fh=raycaster.intersectObjects(scene.__furnitureGroup.children,true);
        for(let i=0;i<fh.length;i++){ const idx=furnIdxFromObj(fh[i].object); if(idx>=0){ selectFurn(idx); return; } }
      }
      if(activeFurnIdx>=0) selectFurn(-1);   // boş zemine tıkla = seçimi bırak
      return;
    }
    // 1) önce kamera gizmosuna tıklandı mı? (SEÇ) — yerleştirme açık ya da kapalı, her zaman
    if(camGizmos){
      const gh=raycaster.intersectObjects(camGizmos.children,true);
      for(let i=0;i<gh.length;i++){ const idx=camIdxFromObj(gh[i].object); if(idx>=0){ selectCam(idx); return; } }
    }
    // 2) zemine tıklama = yalnız yerleştirme açıkken (mesh kilitli) etkili
    if(!placeMode||!scene.__floorGroup) return;
    const hits=raycaster.intersectObjects(scene.__floorGroup.children,false);
    if(!hits.length) return;
    const p=hits[0].point;                                 // dünya (x,y,z), y≈zemin üstü
    if(placeAction==='aim' && activeCamIdx>=0){             // seçili kamerayı yeni noktaya çevir (#4 açı düzenleme)
      const cc=camList[activeCamIdx]; cc.target=aimTargetFrom(cc.pos,p);
      renderCamGizmos(); updateCamPanel(); updateCamRender(); logRoom(cc);   // açı değişti → prompt/görsel tazele
      setHint('Yön güncellendi · başka noktaya tıkla = tekrar çevir');
    } else if(placeAction==='move' && activeCamIdx>=0){     // seçili kamerayı taşı — 'Taşı' AÇIK kalır (art arda taşınır); yön için 'Yön'
      const c=camList[activeCamIdx]; const tilt=camTiltDeg(c);
      c.pos={x:p.x,y:(c.customY!=null?c.customY:CAM_Y[c.height||'eye']),z:p.z};   // ince metre yükseklik korunur
      applyCamAim(c,tilt);                                 // taşıyınca pitch'i koru (target yeni konuma göre yeniden)
      renderCamGizmos(); syncCamBtns(); logRoom(c);
      setHint('Kamera taşındı · tekrar tıkla = yine taşı · yön için "Yön"');
    } else {                                               // 'add' (ya da seçili yokken): 2 tık = yeni kamera
      if(!pendingPos){ pendingPos={x:p.x,z:p.z}; renderCamGizmos(); setHint('Şimdi kameranın BAKACAĞI noktaya tıkla'); }
      else {
        const pos={x:pendingPos.x,y:CAM_Y[camHeight],z:pendingPos.z};
        const c={ pos:pos, target:aimTargetFrom(pos,p), lens:camLens, height:camHeight };
        camList.push(c); activeCamIdx=camList.length-1; pendingPos=null; placeAction='aim';
        renderCamGizmos(); syncCamBtns(); logRoom(c);   // yeni kamera + action 'aim' → buton vurgusunu tazele
        setHint('Kamera '+camList.length+' kondu · zemine tıkla = yön çevir');
      }
    }
  }
  /* ── MOBİLYA modsuz sürükle-bırak (spec UX P0-P2): mobilyaya bas-sürükle-bırak; geçersizde kırmızı+geri al;
     tekerlek/R döndür (15° snap); duvara snap; Del sil; Ctrl+D çoğalt. Kamera yalnız sürükle sırasında kilitlenir. */
  let furnDrag=null, furnGroundPlane=null, furnPersistT=null, furnUndo=[];
  // mobilya geri-al: yıkıcı/taşıma işleminden ÖNCE tüm odaların furniture'ını anlık kopyala
  function furnSnapshot(){ const map=scene&&scene.__map; if(!map) return; const snap={};
    furnAllRooms(map).forEach(function(r){ snap[r.id]=(r.furniture||[]).map(function(f){ return JSON.parse(JSON.stringify(f)); }); });
    furnUndo.push(snap); if(furnUndo.length>25) furnUndo.shift(); }
  function furnUndoPop(){ const map=scene&&scene.__map; if(!map||!furnUndo.length){ setFurnHint('Geri alınacak işlem yok'); return; }
    const snap=furnUndo.pop(); furnAllRooms(map).forEach(function(r){ if(snap[r.id]) r.furniture=snap[r.id].map(function(f){ return f; }); else r.furniture=[]; });
    collectFurnList(); activeFurnIdx=-1; renderFurniture(); updateFurnPanel(); persistFurniture(); setFurnHint('Geri alındı (Ctrl+Z)'); }
  const WALL_AFFINITY={ sofa_2:1,sofa_3:1,sectional_l:1,bed_single:1,bed_double:1,bed_queen:1,bed_king:1,wardrobe_2:1,wardrobe_3:1,wardrobe_4:1,
    counter:1,tv_unit:1,tv:1,bookcase:1,console:1,sideboard:1,dresser:1,desk:1,fridge:1,toilet:1,washbasin:1,bathtub:1,shower_tray:1,washer:1,oven_hob:1,
    nightstand:1,vanity:1,shoe_cabinet:1,coat_rack:1,sink:1,dishwasher:1,bench:1 };   // B7: sink/dishwasher/bench eklendi (island bilinçli serbest)
  function schedulePersist(){ if(furnPersistT) clearTimeout(furnPersistT); furnPersistT=setTimeout(function(){ furnPersistT=null; persistFurniture(); }, 250); }
  function furnPickIdx(ev){ if(!scene||!scene.__furnitureGroup) return -1;
    const rect=renderer.domElement.getBoundingClientRect();
    const nx=((ev.clientX-rect.left)/rect.width)*2-1, ny=-((ev.clientY-rect.top)/rect.height)*2+1;
    if(!raycaster) raycaster=new THREE.Raycaster(); raycaster.setFromCamera({x:nx,y:ny}, cam);
    const fh=raycaster.intersectObjects(scene.__furnitureGroup.children,true);
    for(let i=0;i<fh.length;i++){ const idx=furnIdxFromObj(fh[i].object); if(idx>=0) return idx; } return -1; }
  function furnGroundHitAbs(ev){   // pointer → zemin düzlemi (y=0) → MUTLAK metre
    const rect=renderer.domElement.getBoundingClientRect();
    const nx=((ev.clientX-rect.left)/rect.width)*2-1, ny=-((ev.clientY-rect.top)/rect.height)*2+1;
    if(!raycaster) raycaster=new THREE.Raycaster(); raycaster.setFromCamera({x:nx,y:ny}, cam);
    if(!furnGroundPlane) furnGroundPlane=new THREE.Plane(new THREE.Vector3(0,1,0), 0);
    const hit=new THREE.Vector3(); if(!raycaster.ray.intersectPlane(furnGroundPlane, hit)) return null;
    return { x:hit.x+(scene.__cx||0), z:hit.z+(scene.__cz||0) };
  }
  function furnMeshByIdx(idx){ const G=scene&&scene.__furnitureGroup; if(!G) return null;
    for(let i=0;i<G.children.length;i++){ if(G.children[i].userData && G.children[i].userData.furnIdx===idx) return G.children[i]; } return null; }
  function tintFurnMesh(mesh, bad){ if(!mesh) return; mesh.traverse(function(n){ if(n.isMesh && n.material){
    if(!n.material.__dragClone){ n.material=n.material.clone(); n.material.__dragClone=true; } n.material.emissive=new THREE.Color(bad?0x661111:0x402a08); } }); }
  function dragRoomAn(absX, absZ){ const rid=roomIdAtPoint({x:absX-(scene.__cx||0), z:absZ-(scene.__cz||0)});
    if(!rid) return null; const room=furnRoomById(rid); if(!room) return null; const an=furnAnalyzeRoom(room, scene.__map); return an?{rid:rid,an:an}:null; }
  function furnDragValid(f, x, z, rot, ra){
    ra=ra||dragRoomAn(x,z); if(!ra) return false; const an=ra.an;
    const dim=FURN_DIM[f.type]||{w:0.6,d:0.6}, w=(f.__w!=null?f.__w:dim.w), d=(f.__d!=null?f.__d:dim.d);
    const fp=furnFootprintM(x,z,rot,w,d); if(!furnRectInPoly(fp, an.poly)) return false;
    if(COLLISION_EXEMPT[f.type]) return true;
    if(furnDoorBlocked(fp, an)) return false;                          // A1/W2: kapı geçiş koridorunu kapatma
    if(furnWindowBlocked(fp, an, furnHeightOf(f.type))) return false;  // W3: yüksek mobilya pencere önüne konamaz (drag kırmızı)
    for(let i=0;i<furnList.length;i++){ const o=furnList[i]; if(o===f||o.room_id!==ra.rid||COLLISION_EXEMPT[o.type]) continue;
      const od=FURN_DIM[o.type]||{w:0.6,d:0.6}, ow=(o.__w!=null?o.__w:od.w), odd=(o.__d!=null?o.__d:od.d);
      if(furnRectsOverlap(fp, furnFootprintM(o.pos.x,o.pos.z,o.rot_deg,ow,odd))) return false; }
    return true;
  }
  // wall-affinity: arka yüzü yakın duvara yapıştır + duvar gerçek açısına dön (kapı aralığına snap'leme)
  function furnWallSnap(f, x, z, ra){
    if(!WALL_AFFINITY[f.type]) return null; ra=ra||dragRoomAn(x,z); if(!ra) return null;
    const dim=FURN_DIM[f.type]||{w:0.6,d:0.6}, d=(f.__d!=null?f.__d:dim.d);
    let best=null, bd=d/2+0.45; ra.an.edges.forEach(function(e){ const t=(x-e.a[0])*e.dir[0]+(z-e.a[1])*e.dir[1]; if(t<0.05||t>e.len-0.05) return;
      for(let j=0;j<e.doorSpans.length;j++){ if(t>e.doorSpans[j][0]-DOOR_CLR && t<e.doorSpans[j][1]+DOOR_CLR) return; }   // A1: kapı önüne snap'leme
      const dist=Math.abs((x-e.a[0])*(-e.dir[1])+(z-e.a[1])*e.dir[0]); if(dist<bd){ bd=dist; best={e:e,t:t}; } });
    if(!best) return null; const e=best.e, inset=d/2+WALL_CLR;   // MESH-K/Q1: duvar iç yüzünü geç (eski 0.05 gömüyordu)
    return { x:e.a[0]+e.dir[0]*best.t+e.nIn[0]*inset, z:e.a[1]+e.dir[1]*best.t+e.nIn[1]*inset, rot:wallRotDeg(e) };
  }
  function beginFurnDrag(ev, idx){
    selectFurn(idx); const f=furnList[idx]; const hit=furnGroundHitAbs(ev); if(!hit) return;
    furnDrag={ idx:idx, f:f, off:{x:f.pos.x-hit.x, z:f.pos.z-hit.z}, start:{x:f.pos.x,z:f.pos.z,rot:f.rot_deg}, valid:true, moved:false, mesh:furnMeshByIdx(idx) };
    if(controls) controls.enabled=false; if(renderer) renderer.domElement.style.cursor='grabbing';
  }
  function moveFurnDrag(ev){
    if(!furnDrag) return; const hit=furnGroundHitAbs(ev); if(!hit) return; const f=furnDrag.f;
    let x=hit.x+furnDrag.off.x, z=hit.z+furnDrag.off.z;
    const ra=dragRoomAn(x,z);                                          // odayı kare başına 1× çöz (snap + valid paylaşır)
    const snap=ev.shiftKey?null:furnWallSnap(f,x,z,ra); if(snap){ x=snap.x; z=snap.z; f.rot_deg=snap.rot; }   // Shift = serbest (snap atla)
    f.pos={x:x,z:z}; furnDrag.moved=furnDrag.moved || (Math.abs(x-furnDrag.start.x)+Math.abs(z-furnDrag.start.z))>0.02;
    const mesh=furnDrag.mesh; if(mesh){ mesh.position.set(x,0,z); mesh.rotation.y=(f.rot_deg||0)*Math.PI/180; }
    furnDrag.valid=furnDragValid(f,x,z,f.rot_deg, snap?null:ra); tintFurnMesh(mesh, !furnDrag.valid);
  }
  function endFurnDrag(){
    if(!furnDrag) return; const f=furnDrag.f, dr=furnDrag; furnDrag=null;
    if(controls) controls.enabled=!placeMode; if(renderer) renderer.domElement.style.cursor='';
    if(!dr.moved){ renderFurniture(); return; }                        // sadece tıklama (seçim) → değişiklik yok
    const valid=furnDragValid(f, f.pos.x, f.pos.z, f.rot_deg);         // B10: bırakış noktasından TAZE doğrula
    if(valid){ furnSnapshot();                                         // A5: geri-al için kaydet
      const rid=roomIdAtPoint({x:f.pos.x-(scene.__cx||0), z:f.pos.z-(scene.__cz||0)});
      if(rid && rid!==f.room_id){ detachFurnFromMap(f); f.room_id=rid; attachFurnToMap(f); }
      f.source='manual'; f.locked=true; persistFurniture(); setFurnHint((FURN_TR[f.type]||f.type)+' taşındı');
    } else { f.pos={x:dr.start.x,z:dr.start.z}; f.rot_deg=dr.start.rot; setFurnHint('Geçersiz konum — geri alındı'); }
    renderFurniture(); updateFurnPanel();
  }
  function duplicateFurn(i){ if(i<0||i>=furnList.length) return; furnSnapshot(); const o=furnList[i];
    const f=JSON.parse(JSON.stringify(o)); f.id=newFurnId(f.type,f.room_id); f.pos={x:o.pos.x+0.3,z:o.pos.z+0.3}; f.source='manual'; f.locked=true;
    attachFurnToMap(f); furnList.push(f); activeFurnIdx=furnList.length-1; renderFurniture(); updateFurnPanel(); persistFurniture(); setFurnHint('Çoğaltıldı (Ctrl+D)'); }
  /* ── B2-1: HAYALET yerleştirme — palet parçasına tık → kuşbakışı-kilitli görünümde imleci izleyen yarı-saydam
     mesh (geçerli=normal, geçersiz=kırmızı, furnFits mantığı). Tık=bırak (gerçek mobilya, seçili). Esc/sağ-tık=vazgeç.
     Bırakınca hayalet çıkar (spam-yerleştirme değil; tekrar için palete tekrar tıkla). */
  function startFurnGhost(type){
    if(!furnMode) setFurnMode(true);
    cancelFurnGhost(); if(activeFurnIdx>=0) selectFurn(-1);
    const G=scene&&scene.__furnitureGroup; if(!G){ pendingFurnType=type; return; }
    const mesh=buildFurnMesh({ type:type, rot_deg:0 }); mesh.visible=false;
    mesh.traverse(function(n){ if(n.isMesh && n.material){ n.material=n.material.clone(); n.material.transparent=true; n.material.opacity=0.55; } });
    G.add(mesh);
    furnGhost={ type:type, mesh:mesh, pos:null, rot:0, valid:false };
    pendingFurnType=type;
    if(renderer) renderer.domElement.style.cursor='copy';
    setFurnHint((FURN_TR[type]||type)+' — zeminde tıklayarak yerleştir · Esc / sağ-tık vazgeç');
    syncFurnTypeBtns();
  }
  function moveFurnGhost(ev){
    if(!furnGhost) return; const hit=furnGroundHitAbs(ev); if(!hit) return;
    let x=hit.x, z=hit.z, rot=furnGhost.rot;
    const f={ type:furnGhost.type, rot_deg:rot }; const ra=dragRoomAn(x,z);
    const snap=ev.shiftKey?null:furnWallSnap(f,x,z,ra); if(snap){ x=snap.x; z=snap.z; rot=snap.rot; }
    furnGhost.pos={x:x,z:z}; furnGhost.rot=rot;
    furnGhost.valid=furnDragValid({type:furnGhost.type,__w:null,__d:null}, x, z, rot, snap?null:ra);
    const m=furnGhost.mesh; if(m){ m.visible=true; m.position.set(x,0,z); m.rotation.y=rot*Math.PI/180; tintFurnMesh(m, !furnGhost.valid); }   // C3-1: mesh __furnitureGroup çocuğu (grup zaten -cx,-cz ofsetli) → renderFurniture gibi MUTLAK metre; eski x-cx çift-ofset (hayalet sol-üste kayıyordu)
  }
  function dropFurnGhost(){
    if(!furnGhost||!furnGhost.pos) return false;
    if(!furnGhost.valid){ setFurnHint('Geçersiz konum — kırmızı · başka nokta dene · Esc vazgeç'); return false; }
    const p=furnGhost.pos, rot=furnGhost.rot, type=furnGhost.type;
    const rid=roomIdAtPoint({x:p.x-(scene.__cx||0), z:p.z-(scene.__cz||0)});
    furnSnapshot();
    const f={ id:newFurnId(type,rid), type:type, type_tr:FURN_TR[type]||null, room_id:rid,
              pos:{x:p.x,z:p.z}, rot_deg:rot, scale:1, source:'manual', locked:true };
    attachFurnToMap(f); furnList.push(f); activeFurnIdx=furnList.length-1;
    cancelFurnGhost();
    renderFurniture(); updateFurnPanel(); persistFurniture();
    setFurnHint((FURN_TR[type]||type)+' yerleşti · sürükle taşı · tekerlek/R döndür · Del sil');
    return true;
  }
  function cancelFurnGhost(){
    if(!furnGhost) return; const m=furnGhost.mesh;
    if(m&&m.parent) m.parent.remove(m); if(m) disposeFurn(m);
    furnGhost=null; if(renderer) renderer.domElement.style.cursor=''; syncFurnTypeBtns();
  }
  // B2-3: seçili mobilyanın YÜZEN mini araç çubuğu — dünya konumunu ekrana projekte et, çubuğu üstüne yerleştir (kenarda taşmaz).
  function updateFurnBar(){
    const bar=overlay&&overlay.querySelector('#v3dFurnBar'); if(!bar) return;
    const show=(furnMode && !furnGhost && activeFurnIdx>=0 && activeFurnIdx<furnList.length && scene && cam && renderer);
    if(!show){ bar.style.display='none'; return; }
    const f=furnList[activeFurnIdx];
    const dim=FURN_DIM[f.type]||{h:0.8};
    const v=new THREE.Vector3(f.pos.x-(scene.__cx||0), (dim.h||0.8)+0.15, f.pos.z-(scene.__cz||0)).project(cam);
    const rect=renderer.domElement.getBoundingClientRect();
    const sx=rect.left+(v.x*0.5+0.5)*rect.width, sy=rect.top+(-v.y*0.5+0.5)*rect.height;
    bar.style.display=(v.z<1)?'flex':'none'; if(v.z>=1) return;   // kamera arkasında → gizle
    const bw=bar.offsetWidth||180, bh=bar.offsetHeight||42;
    // C1-2: alt DOCK bölgesine girme — mevcut aktif dock yüksekliği kadar alttan pay bırak.
    const dockH=activeDockPx();
    const botLimit=window.innerHeight-bh-8-dockH;
    let left=sx-bw/2, top=sy-bh-14;
    left=Math.max(8, Math.min(window.innerWidth-bw-8, left));     // ekran kenarında taşmaz
    top=Math.max(8, Math.min(botLimit, top));                     // dock'un ÜSTÜNDE kal (obje dock arkasındaysa çubuk yukarı iter)
    bar.style.left=left.toFixed(0)+'px'; bar.style.top=top.toFixed(0)+'px';
  }
  function onFurnKey(e){ if(!furnMode) return;
    const t=e.target, tag=t&&t.tagName;
    if(t&&(t.isContentEditable||tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')) return;     // A4: başka input'ta yazarken dokunma
    // B2-1: HAYALET yerleştirme aktifken — R döndürür, Esc vazgeçer (öncelik hayalette)
    if(furnGhost){
      if(e.key==='Escape'){ e.preventDefault(); cancelFurnGhost(); setFurnHint('Yerleştirme iptal'); return; }
      if(e.key==='r'||e.key==='R'){ e.preventDefault(); furnGhost.rot=((((furnGhost.rot||0)+(e.shiftKey?-15:15))%360)+360)%360; return; }
      return;
    }
    if((e.key==='z'||e.key==='Z')&&(e.ctrlKey||e.metaKey)){ e.preventDefault(); furnUndoPop(); return; }   // A5: geri al
    if(e.key==='Escape'){ e.preventDefault(); if(activeFurnIdx>=0) selectFurn(-1); return; }  // Esc = seçimi bırak (silmez)
    if(activeFurnIdx<0) return;
    if(e.key==='Delete'||e.key==='Backspace'){ e.preventDefault(); removeFurn(activeFurnIdx); }  // Del + Backspace sil (input'ta yazarken yukarıda korumalı → tarayıcı geri-nav tetiklemez)
    else if(e.key==='r'||e.key==='R'){ e.preventDefault(); rotateFurn(e.shiftKey?-15:15); }
    else if((e.key==='d'||e.key==='D')&&(e.ctrlKey||e.metaKey)){ e.preventDefault(); duplicateFurn(activeFurnIdx); } }
  function attachPicker(){
    if(pickerWired||!renderer) return; pickerWired=true;
    const el=renderer.domElement; let sx=0,sy=0,moved=false;
    // B2-1: HAYALET aktifken sağ-tık = vazgeç (menü açma). contextmenu'yu da yut.
    el.addEventListener('contextmenu',function(e){ if(furnGhost){ e.preventDefault(); cancelFurnGhost(); setFurnHint('Yerleştirme iptal'); } });
    el.addEventListener('pointerdown',function(e){ sx=e.clientX; sy=e.clientY; moved=false;
      if(furnGhost){ if(e.button===2){ cancelFurnGhost(); setFurnHint('Yerleştirme iptal'); } return; }   // hayalet: sürükleme başlatma (tık=bırak, pointerup'ta)
      // B2-2: SÜRÜKLE-vs-PAN — sol-drag MOBİLYANIN ÜSTÜNDE başlarsa taşı; BOŞ zeminde başlarsa PAN (orbit).
      //   Mobilya seçili olsa bile boş alan pan'dir. Hit-test önceliği: mobilya > zemin-pan.
      if(furnMode && e.button===0 && !spacePan){ const idx=furnPickIdx(e); if(idx>=0) beginFurnDrag(e, idx); } });
    el.addEventListener('pointermove',function(e){ if(Math.abs(e.clientX-sx)+Math.abs(e.clientY-sy)>5) moved=true;
      if(furnGhost){ moveFurnGhost(e); return; }
      if(furnDrag){ moveFurnDrag(e); return; }
      if(!spacePan && furnMode && e.buttons===0) el.style.cursor=(furnPickIdx(e)>=0?'grab':'');   // boş zemin = pan imleci (mobilya üstü = grab)
    });
    el.addEventListener('pointerup',function(e){ if(furnDrag){ endFurnDrag(); return; }
      if(furnGhost){ if(!moved && e.button===0){ moveFurnGhost(e); dropFurnGhost(); } return; }   // hayalet: yerinde tık = bırak (sürükleyip orbit ettiyse bırakmaz)
      if(!spacePan && (camUIEnabled||furnMode||(activeGroup==='material'&&matUIEnabled))&&!moved&&e.button===0) scenePick(e); });   // Space'te tıklama seçmesin/koymasın (kaydırma kipi); malzeme modu = oda seç
    // tekerlek = seçili mobilyayı döndür (5° hassas, Shift=1° ince ayar); orbit zoom'u furnMode+seçili iken atlanır (attachOrbit)
    el.addEventListener('wheel',function(e){ if(furnMode && activeFurnIdx>=0){ const f=furnList[activeFurnIdx], st=e.shiftKey?1:5;
      f.rot_deg=((((f.rot_deg||0)+(e.deltaY<0?st:-st))%360)+360)%360; f.source='manual'; f.locked=true; renderFurniture(); schedulePersist(); } }, {passive:true});
    window.addEventListener('keydown', onFurnKey);
    // A3: F = seçiliye odakla (mobilya ya da kamera grubu). Form alanı odaktayken yut; 3B kapalıyken karışma.
    window.addEventListener('keydown', function(e){
      if(e.key!=='f'&&e.key!=='F') return; if(e.ctrlKey||e.metaKey||e.altKey) return;
      if(overlay&&overlay.style.display==='none') return;
      const t=e.target, tag=t&&t.tagName; if(t&&(t.isContentEditable||tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')) return;
      if(focusSelected()) e.preventDefault();
    });
  }
  function logRoom(c){                                     // DOĞRULAMA: oda ortasına koyunca room_id o oda mı?
    const map=scene&&scene.__map; if(!map||typeof window.cameraViewInfo!=='function') return;
    const px=worldToPx(map,c.pos.x,c.pos.z), hd=Math.round(headingOf(c));
    const v=window.cameraViewInfo(map,{x_px:px[0],y_px:px[1],heading_deg:hd,lens_mm:c.lens});
    console.log('[view3d cam] pos_m',[+c.pos.x.toFixed(1),+c.pos.z.toFixed(1)],'→ px',[Math.round(px[0]),Math.round(px[1])],'heading',hd,'→ room_id',v&&v.room_id);
  }

  // bir kamera → export/analiz objesi (plan-px + room_id/koni/furniture_seen). exportCameras + panel
  // prompt'u PAYLAŞIR (aynı cameraViewInfo yolu). map ZORUNLU (çağıran taze harita verir).
  function camViewObj(c, i, map){
    const W=map.render.width, H=map.render.height, hasView=(typeof window.cameraViewInfo==='function');
    const px=worldToPx(map,c.pos.x,c.pos.z);
    const x=Math.round(px[0]*10)/10, y=Math.round(px[1]*10)/10;
    const xn=Math.round(x/W*1e5)/1e5, yn=Math.round(y/H*1e5)/1e5, heading=Math.round(headingOf(c));
    const out={ id:'cam'+(i+1), x_px:x, y_px:y, x_norm:xn, y_norm:yn, heading_deg:heading, lens_mm:c.lens,
      pos_m:{x:+c.pos.x.toFixed(3),y:+c.pos.y.toFixed(3),z:+c.pos.z.toFixed(3)},
      target_m:{x:+c.target.x.toFixed(3),y:+c.target.y.toFixed(3),z:+c.target.z.toFixed(3)},
      fov_deg:lensToFov(c.lens), height:c.height,
      room_id:null, room_weights:[], cone_spills:false, cone_polygon_px:null, cone_polygon_norm:null, furniture_seen:[] };
    if(hasView){
      const v=window.cameraViewInfo(map,{x_px:x,y_px:y,heading_deg:heading,lens_mm:c.lens});
      if(v){ out.room_id=v.room_id; out.room_weights=v.room_weights||[]; out.cone_spills=!!v.cone_spills;
             out.cone_polygon_px=v.cone_polygon_px||null; out.cone_polygon_norm=v.cone_polygon_norm||null;
             out.furniture_seen=v.furniture_seen||[]; }
    }
    return out;
  }
  // opsiyon 1: kamera için otomatik İngilizce render prompt'u (io.js cameraRenderPrompt). Harita/işlev yoksa ''.
  function autoCamPrompt(c, i, map){
    map=map||(scene&&scene.__map); if(!map||typeof window.cameraRenderPrompt!=='function') return '';
    try{ const r=window.cameraRenderPrompt(map, camViewObj(c,i,map), {}); return (r&&r.prompt)||''; }catch(e){ return ''; }
  }
  // ── dışa: kilitli kamera dizisi (prototip adım 4 + §3.3 şeması) — iki render opsiyonunu da taşır ──
  function exportCameras(map){
    map=map||(scene&&scene.__map); if(!map) return [];
    syncFurniturePx(map);                                          // mobilya px'i taze olsun → cameraViewInfo görsün
    const wantSnap=(camRenderMethod!=='prompt'), wantPrompt=(camRenderMethod!=='snapshot');
    return camList.map(function(c,i){
      const out=camViewObj(c,i,map);
      out.render_method=camRenderMethod;
      out.time_of_day=camTime(c);                                                                  // B1-4: gün saati (override yoksa global)
      if(wantPrompt) out.prompt=(c.prompt!=null&&c.prompt!=='')?c.prompt:autoCamPrompt(c,i,map);   // opsiyon 1: metin
      if(wantSnap)   out.snapshot=snapCameraDataURL(c);                                             // opsiyon 2: kendi-açı PNG
      return out;
    });
  }
  function getCameras(){ return camList.map(function(c){ return {pos:Object.assign({},c.pos),target:Object.assign({},c.target),lens:c.lens,height:c.height}; }); }
  function setCameras(arr){                                // demo/türetilmiş kameraları yükle (Faz 4)
    // Q2: yüklenen kamera Y'si tavanı aşıyorsa clamp'le (eski/dış kayıt tavan üstünde olabilir); export şeması değişmez
    const clampY=function(y){ return Math.max(CAM_Y_MIN,Math.min(CAM_Y_MAX,y)); };
    camList=(arr||[]).map(function(c){ return {pos:{x:c.pos.x,y:clampY(c.pos.y!=null?c.pos.y:CAM_Y[c.height||'eye']),z:c.pos.z},
      target:{x:c.target.x,y:(c.target.y!=null?c.target.y:0.5),z:c.target.z}, lens:c.lens||24, height:c.height||'eye'}; });
    activeCamIdx=camList.length?0:-1; pendingPos=null;
    if(activeCamIdx>=0){ camHeight=camList[0].height||'eye'; camLens=camList[0].lens||24; }
    else if(placeMode) placeAction='add';                       // boş liste → zemine tıklama yeni kamera (takılı 'aim/move' kalmasın)
    renderCamGizmos(); applyPlaceModeUI(); return camList.length;
  }
  function clearCams(){ camList=[]; activeCamIdx=-1; pendingPos=null; placeAction='add'; renderCamGizmos(); applyPlaceModeUI(); setHint('Kamera kalmadı · Ekle ile yerleştir'); }

  // ── DEMO kameraları yerleşimden TÜRET (sabit koordinat YASAK; §3.4) ──
  // Daire başına 1-2 vitrin: salon (+ varsa ebeveyn yatak). Köşeden ~0.5m içeri, centroid'e bakar.
  function roomAreaPx(r){ const p=r.polygon_px; let a=0; for(let i=0,j=p.length-1;i<p.length;j=i++) a+=(p[j][0]+p[i][0])*(p[j][1]-p[i][1]); return Math.abs(a/2); }
  function roomCentroidPx(r){ if(r.centroid_px) return r.centroid_px; const s=[0,0]; r.polygon_px.forEach(function(p){s[0]+=p[0];s[1]+=p[1];}); return [s[0]/r.polygon_px.length,s[1]/r.polygon_px.length]; }
  function pxToWorld(map,px,py){ const mpp=map.scale.metersPerPixel,o=map.scale.origin_px; return {x:(px-o[0])*mpp-(scene.__cx||0), z:(py-o[1])*mpp-(scene.__cz||0)}; }
  function deriveShowcaseCameras(map){
    map=map||(scene&&scene.__map); if(!map) return 0;
    const cams=[], mpp=map.scale.metersPerPixel;
    (map.units||[]).forEach(function(u){
      const rs=(u.rooms||[]).filter(function(r){ return r.polygon_px&&r.polygon_px.length>=3; });
      if(!rs.length) return;
      const typeStr=function(r){ return ((r.type||'')+' '+(r.type_tr||'')+' '+(r.name||'')+' '+(r.name_en||'')).toLowerCase(); };
      const living=rs.filter(function(r){ return /living|salon|studio/.test(typeStr(r)); }).sort(function(a,b){ return roomAreaPx(b)-roomAreaPx(a); });
      const primary=living[0] || rs.slice().sort(function(a,b){ return roomAreaPx(b)-roomAreaPx(a); })[0];
      const picks=[primary];
      const beds=rs.filter(function(r){ return /bedroom|yatak/.test(typeStr(r)); }).sort(function(a,b){ return roomAreaPx(b)-roomAreaPx(a); });
      const master=beds.filter(function(r){ return /ebeveyn|master/.test(typeStr(r)); })[0] || beds[0];
      if(master && master!==primary) picks.push(master);
      picks.forEach(function(r){
        const cpx=roomCentroidPx(r);
        let corner=r.polygon_px[0], best=-1;                 // centroid'e en uzak köşe (en geniş açı)
        r.polygon_px.forEach(function(p){ const dd=Math.hypot(p[0]-cpx[0],p[1]-cpx[1]); if(dd>best){ best=dd; corner=p; } });
        const cw=pxToWorld(map,corner[0],corner[1]), tw=pxToWorld(map,cpx[0],cpx[1]);
        const dx=tw.x-cw.x, dz=tw.z-cw.z, L=Math.hypot(dx,dz)||1;
        const pos={x:cw.x+dx/L*0.5, z:cw.z+dz/L*0.5};        // köşeden 0.5m içeri
        const area_m2=roomAreaPx(r)*mpp*mpp, lens=area_m2<11?16:24;   // küçük oda=geniş açı
        cams.push({pos:pos, target:{x:tw.x,z:tw.z}, lens:lens, height:'eye'});
      });
    });
    setCameras(cams);
    return cams.length;
  }

  // ── kamera-modu UI yardımcıları (overlay paneli; standalone test). Prototip adım 4 setPlaceMode/exportCameras ile sürer ──
  // camUIEnabled: bölümü AÇ/KAPAT — adım 2 (salt 3B) hiç göstermez, adım 4 gösterir (#1)
  function setCamUI(on){
    const wasLockGroup=(activeGroup==='camera'||activeGroup==='furniture');
    camUIEnabled=!!on;
    if(camUIEnabled){ activeGroup='camera'; pipClosed=false; applyPipSize(); }  // adım 4 → kamera dock açık; B1-R PiP kapalı-işaretini sıfırla
    else { if(activeGroup===null||activeGroup==='camera') activeGroup='view'; setPlaceMode(false); pipClosed=true; }  // R2: kamera UI kapanınca PiP gizle
    // A4: kamera grubuna giriş → varsayılan kuşbakışı kilidi (setGroup dışı yol; setCamUI doğrudan activeGroup set eder)
    const inLockGroup=(activeGroup==='camera'||activeGroup==='furniture');
    if(inLockGroup && !wasLockGroup) enterTopLock(true);
    else if(!inLockGroup && wasLockGroup) releaseTopLockToFree();
    syncFurnModeToGroup();                                                    // B2: kamera grubuna geçince furnMode kapanır (mobilya draglenemez)
    renderRail(); renderDrawer(); renderCamGizmos(); renderCamDock(); updateLockBtn();
  }
  function applyPlaceModeUI(){
    if(!overlay) return;
    syncCamBtns();                                         // dock highlight + slider + hint (updateCamDock içinde)
  }
  // placeMode AÇIK → mesh KİLİTLİ (controls.enabled=false, #3) + zemine tıklama etkin. KAPALI → mesh serbest (döndür/zoom).
  function setPlaceMode(on){
    placeMode=!!on; pendingPos=null;
    if(placeMode && furnMode){ cancelFurnGhost(); furnMode=false; if(activeFurnIdx>=0) selectFurn(-1); applyFurnModeUI(); renderFurniture(); }   // B2-4: mobilya düzenlemeyi + hayalet + seçim temizle (dışlayan)
    if(controls) controls.enabled=!placeMode;
    if(placeMode) placeAction=(activeCamIdx>=0)?'aim':'add';
    renderCamGizmos(); applyPlaceModeUI();
    setHint(placeMode
      ? (placeAction==='add' ? 'Kamera KONUMUNA tıkla (sonra bakış noktası)' : 'Zemine tıkla = seçili kamerayı çevir · Ekle = yeni')
      : 'Mesh serbest — döndür/yakınlaştır · kamerayı seçmek için üstüne tıkla');
  }
  function togglePlaceMode(){ setPlaceMode(!placeMode); }
  function setPlaceAction(a){
    if(a==='aim'&&activeCamIdx<0){ setHint('Önce bir kamera seç (kart ya da sahnedeki kamera).'); return; }
    if(a==='move'&&activeCamIdx<0){ setHint('Önce taşınacak kamerayı seç.'); return; }
    if(!placeMode){ placeMode=true; if(controls) controls.enabled=false; }   // yerleştirmeyi aç (action'ı SIFIRLAMADAN)
    placeAction=a; pendingPos=null;
    renderCamGizmos(); applyPlaceModeUI();
    setHint(a==='add'?'Yeni kamera: KONUMUNA tıkla, sonra bakış noktasına.'
      :a==='aim'?'Zemine tıkla → seçili kamera oraya bakar.'
      :'Zemine tıkla → seçili kamera oraya taşınır.');
  }
  function selectCam(i){
    if(i<0||i>=camList.length) return;
    pipClosed=false;                                        // C3-6: HER seçim eylemi (çip/sahne/aynı kamera) X bayrağını temizler → PiP geri gelir
    activeCamIdx=i; pendingPos=null;
    if(placeMode && placeAction==='add') placeAction='aim';   // seçince düzenlemeye geç
    const c=camList[i]; camHeight=c.height||'eye'; camLens=c.lens||24;
    renderCamGizmos(); applyPlaceModeUI();
    focusCam(i);                                            // A3: seçince hedefi kameranın baktığı noktaya kaydır (mesafe sabit)
    openPipForSelection();                                  // B1-R (R2): seçim = canlı PiP önizlemesini geri getir (× ile kapatılmışsa da)
    setHint('Kamera '+(i+1)+' seçili · Yön / Taşı ya da zemine tıkla · F odakla');
  }
  // çip × → seçimi bırak (kamerayı SİLMEZ; silme rail'deki çöp kutusu = data-v3d="camdel")
  function deselectCam(){
    if(activeCamIdx<0) return;
    activeCamIdx=-1; pendingPos=null;
    if(placeMode) placeAction='add';                        // seçim yok → zemine tıklama yeni kamera ekler
    renderCamGizmos(); applyPlaceModeUI();
    setHint('Seçim bırakıldı · kamera kartına ya da sahnedeki kameraya tıkla = seç');
  }
  function removeCam(i){
    if(i<0||i>=camList.length) return;
    camList.splice(i,1);
    // seçimi DOĞRU kameraya sabitle: alttan silinirse kaydır, seçili silinirse komşuya geç
    if(i<activeCamIdx) activeCamIdx--;
    else if(i===activeCamIdx) activeCamIdx=Math.min(i,camList.length-1);
    pendingPos=null;
    if(activeCamIdx>=0){ const c=camList[activeCamIdx]; camHeight=c.height||'eye'; camLens=c.lens||24; }  // panel/eklenecek-varsayılanı tazele
    else if(placeMode) placeAction='add';                                                                // seçim kalmadı → zemine tıklama yeni kamera
    renderCamGizmos(); applyPlaceModeUI();
    setHint(camList.length?('Kamera '+(activeCamIdx+1)+' seçili'):'Kamera kalmadı · Ekle ile yerleştir');
  }
  // B1-2: seçili kameranın PITCH'ini (bakış açısı: yukarı+ / ufuk 0 / aşağı−) OKU. target-pos rayının dikey açısı.
  function camTiltDeg(c){ if(!c||!c.target||!c.pos) return 0;
    const dx=c.target.x-c.pos.x, dz=c.target.z-c.pos.z, dy=c.target.y-c.pos.y;
    const horiz=Math.hypot(dx,dz); if(horiz<1e-4) return dy>=0?89:-89;
    return Math.atan2(dy,horiz)*180/Math.PI;
  }
  // pitch KORUYARAK yükseklik/target'ı yeniden kur: horizontal yön + mesafeyi sabit tut, dikeyi tilt'ten türet.
  function applyCamAim(c, tiltDeg){
    const dx=c.target.x-c.pos.x, dz=c.target.z-c.pos.z; let horiz=Math.hypot(dx,dz);
    if(horiz<0.3){ horiz=1; }                          // dejenere → varsayılan ileri mesafe (target üstüste düşmesin)
    const ux=(Math.hypot(dx,dz)<1e-4? 0 : dx/Math.hypot(dx,dz)), uz=(Math.hypot(dx,dz)<1e-4? -1 : dz/Math.hypot(dx,dz));
    const t=Math.max(-85,Math.min(85,tiltDeg))*Math.PI/180;
    c.target={ x:c.pos.x+ux*horiz, y:c.pos.y+Math.tan(t)*horiz, z:c.pos.z+uz*horiz };
  }
  function setCamHeight(h){ camHeight=h;
    if(activeCamIdx>=0){ const c=camList[activeCamIdx]; const tilt=camTiltDeg(c); c.height=h; c.pos.y=CAM_Y[h]; c.customY=null; applyCamAim(c,tilt); renderCamGizmos(); logRoom(c); }
    syncCamBtns();
  }
  // ince METRE yükseklik slider'ı (preset dışı): pos.y'yi sürekli ayarla, pitch'i koru. customY = preset'ten sapma işareti.
  function setCamHeightM(m){
    if(activeCamIdx<0) return; const c=camList[activeCamIdx]; const tilt=camTiltDeg(c);
    c.pos.y=Math.max(CAM_Y_MIN,Math.min(CAM_Y_MAX,+m)); c.customY=c.pos.y; camHeight=c.height||'eye';   // Q2: tavanı aşma
    applyCamAim(c,tilt); renderCamGizmos(); logRoom(c); syncCamBtns();
  }
  // B1-2: BAKIŞ AÇISI (tilt/pitch) slider'ı — tıkla-kabaca'nın ince ayarı (B1-3 ile birlikte). yukarı-ufuk-aşağı.
  function setCamTilt(deg){
    if(activeCamIdx<0) return; const c=camList[activeCamIdx];
    applyCamAim(c,+deg); renderCamGizmos(); updateCamPanel(); updateCamRender(); logRoom(c); syncCamBtns();
  }
  function setCamLens(l){ camLens=l;
    if(activeCamIdx>=0){ camList[activeCamIdx].lens=l; renderCamGizmos(); logRoom(camList[activeCamIdx]); }
    syncCamBtns();
  }
  // B1-4: gün saati — global varsayılan ya da seçili kamera override. exportCameras'a düşer.
  const TIME_OF_DAY=['midday','sunrise','golden','night'];
  const TIME_TR={ midday:'Gün ortası', sunrise:'Gündoğumu', golden:'Altın saat', night:'Gece' };
  function setTimeOfDay(t, perCamera){
    t=(TIME_OF_DAY.indexOf(t)>=0)?t:'midday';
    if(perCamera && activeCamIdx>=0){ camList[activeCamIdx].timeOfDay=t; }
    else { timeOfDay=t; }
    syncCamBtns();
  }
  function camTime(c){ return (c&&c.timeOfDay)||timeOfDay; }   // etkin gün saati (override yoksa global)
  function syncCamBtns(){
    if(!overlay) return;
    updateCamPanel(); updateCamDock(); updateCamRender();   // dock highlight/slider tazeleme (.on class'ları updateCamDock'ta)
  }
  function setCamRenderMethod(m){ camRenderMethod=(m==='prompt'||m==='snapshot')?m:'both'; updateCamRender(); }
  // seçili kameranın render bloğunu tazele: yöntem vurgusu + prompt/görsel görünürlüğü + otomatik prompt
  // (kullanıcı düzenlemediyse) + kendi-açı snapshot önizlemesi (yalnız 'görsel'/'ikisi' modunda, LAZY).
  // ── B1-2: KAMERA DOCK — alt-kenar özel paneli. renderCamDock kurar (yapısal değişimde), updateCamDock tazeler. ──
  let camDockAdvOpen=false, camSliderDrag=false, camDockDetOpen=false;   // B1-R: detay katmanı (özet çip) varsayılan KAPALI
  // kamera şeridi çipleri (numaralı, SARAR — yatay scroll YOK) + Ekle
  function camStripHTML(){
    let h='';
    camList.forEach(function(c,i){ const on=(i===activeCamIdx);
      h+='<span data-camsel="'+i+'" title="Kamera '+(i+1)+' — seç" '+
        'style="position:relative;display:inline-flex;align-items:center;gap:3px;cursor:pointer;'+
        'background:'+(on?'#e0843a':'#3a3a44')+';color:'+(on?'#1a1a1f':'#e8e6e0')+';'+
        'border-radius:7px;padding:4px 6px 4px 7px;font-size:11px;font-weight:700">'+
        ic('camera',12)+(i+1)+
        (on?'<b data-camdesel="1" title="Seçimi bırak" style="cursor:pointer;font-weight:700;opacity:.75;padding:0 1px 0 3px">×</b>':'')+'</span>';
    });
    h+='<span data-camact="add" title="Yeni kamera ekle" style="display:inline-flex;align-items:center;cursor:pointer;'+
      'border:1.5px dashed rgba(255,255,255,.35);color:#c9a16b;border-radius:7px;padding:4px 8px;font-size:11px;font-weight:700">'+ic('plus',13)+'</span>';
    return h;
  }
  // seçili kameranın ÖZET metni: "K2 · Göz 1.60m · 24mm · Gece"
  function camSummaryText(c,i){
    if(!c) return '';
    const y=(c.customY!=null?c.customY:(c.pos&&c.pos.y!=null?c.pos.y:CAM_Y[c.height||'eye']));
    const hName=(c.customY==null)?({low:'Alçak',eye:'Göz',high:'Üst'}[c.height||'eye']):'';
    const hStr=(hName?hName+' ':'')+(y!=null?y.toFixed(2)+'m':'');
    return 'K'+(i+1)+' · '+hStr+' · '+(c.lens||24)+'mm · '+TIME_TR[camTime(c)];
  }
  // dock'u BAŞTAN kur (kamera seç/ekle/sil/setCamUI'da). Highlight/slider tazeleme updateCamDock'ta (yeniden kurMAZ).
  // B1-R: KOMPAKT — kapalıyken tek yatay bar; özet çipe tıkla → detay katmanı (yükseklik/bakış açısı/objektif/gün saati/render).
  // C3-2: yerleştir düğmesi etiketi — placeMode açık=Bitir; seçili kamera var=Düzenle (mevcut Taşı/Yön akışına girer); yok=Yerleştir (yeni kamera akışı).
  function placeBtnLabel(){ return placeMode ? 'Bitir' : ((activeCamIdx>=0 && activeCamIdx<camList.length) ? 'Düzenle' : 'Yerleştir'); }
  function renderCamDock(){
    const dk=overlay&&overlay.querySelector('#v3dCamDock'); if(!dk) return;
    if(!camUIEnabled){ dk.style.display='none'; dk.innerHTML=''; return; }
    dk.style.display='block';
    const has=(activeCamIdx>=0 && activeCamIdx<camList.length);
    const c=has?camList[activeCamIdx]:null;
    const timeChips=TIME_OF_DAY.map(function(t){ return '<button data-camtime="'+t+'" class="'+(camTime(c)===t?'on':'')+'">'+TIME_TR[t]+'</button>'; }).join('');
    let html='<div class="dk'+(camDockDetOpen?' detopen':'')+(camDockAdvOpen?' advopen':'')+'">';
    // ── ANA BAR (kapalıyken tek satır) — şerit + yerleştir + eylem ikonları + özet çip ──
    html+='<div class="bar">'+
      '<div class="strip" id="v3dCamStrip">'+camStripHTML()+'</div>'+
      '<div class="sep"></div>'+
      '<div class="row seg">'+
        '<button data-v3d="place" id="v3dPlaceBtn" class="green'+(placeMode?' on':'')+'">'+ic('camera',12)+placeBtnLabel()+'</button>'+
        '<button data-camact="add" class="v3dact"'+(placeMode&&placeAction==='add'?' data-on="1"':'')+'>'+ic('plus',12)+'Ekle</button>'+
      '</div>'+
      // seçili kamera bağlamında ikon eylemleri (Yön/Taşı/Odakla/Sil)
      '<div class="row" id="v3dCamActs"'+(has?'':' style="opacity:.4;pointer-events:none"')+'>'+
        '<button data-camact="aim" class="ib" title="Yön — bakış noktasına tıkla">'+ic('target',15)+'</button>'+
        '<button data-camact="move" class="ib" title="Taşı — yeni konuma tıkla">'+ic('move',15)+'</button>'+
        '<button data-v3d="camfocus" class="ib" title="Seçiliye odakla (F)">'+ic('fit',15)+'</button>'+
        '<button data-v3d="camdel" class="ib danger" title="Seçili kamerayı sil">'+ic('trash',15)+'</button>'+
      '</div>'+
      '<div class="sep"></div>'+
      // ÖZET çip — tıkla → detay aç/kapa (kamera yoksa "Ayarlar")
      '<button class="sum" id="v3dCamSum" title="Ayrıntıları aç/kapa">'+
        '<span id="v3dCamSumT">'+(has?camSummaryText(c,activeCamIdx):'Kamera seç')+'</span>'+
        '<span class="caret" id="v3dCamSumC">'+(camDockDetOpen?'▲':'▼')+'</span>'+
      '</button>'+
      '<div id="v3dCamHint" style="font-size:10px;opacity:.65;max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>'+
    '</div>';
    // ── DETAY KATMANI (kapalı varsayılan) ──
    html+='<div class="det" id="v3dCamDet">'+
      // yükseklik
      '<div class="dcol" id="v3dCamSettings"'+(has?'':' style="opacity:.4;pointer-events:none"')+'>'+
        '<div class="lbl">Yükseklik</div>'+
        '<div class="row seg" id="v3dHRow"><button data-camh="low" class="v3dh">Alçak</button><button data-camh="eye" class="v3dh">Göz</button><button data-camh="high" class="v3dh">Üst</button></div>'+
        '<div class="row"><input type="range" id="v3dCamHM" min="0.4" max="'+CAM_Y_MAX.toFixed(2)+'" step="0.05" style="flex:1;min-width:110px"><span class="val" id="v3dCamHMVal">1.6 m</span></div>'+   // Q2: dinamik tavan (WALL_H-0.15)
        '<div class="lbl" style="margin-top:3px">Bakış açısı</div>'+
        '<div class="row"><span style="font-size:9px;opacity:.6">aşağı</span><input type="range" id="v3dCamTilt" min="-80" max="80" step="1" style="flex:1;min-width:110px"><span style="font-size:9px;opacity:.6">yukarı</span><span class="val" id="v3dCamTiltVal">0°</span></div>'+
      '</div>'+
      '<div class="sep"></div>'+
      // objektif + gün saati
      '<div class="dcol">'+
        '<div class="lbl">Objektif</div>'+
        '<div class="row seg" id="v3dLRow"><button data-caml="16" class="v3dl">16</button><button data-caml="24" class="v3dl">24</button><button data-caml="35" class="v3dl">35</button><button data-caml="50" class="v3dl">50</button></div>'+
        '<div class="lbl" style="margin-top:3px">Gün saati <span id="v3dTimeScope" style="opacity:.55;text-transform:none;font-weight:600">'+(has?'(bu kamera)':'(tümü)')+'</span></div>'+
        '<div class="row seg" id="v3dTimeRow">'+timeChips+'</div>'+
      '</div>'+
      '<div class="sep"></div>'+
      // render ayarları (kendi içinde katlanır)
      '<div class="dcol">'+
        '<button class="more" id="v3dCamMore">'+(camDockAdvOpen?'Render ayarları ▲':'Render ayarları ▾')+'</button>'+
        '<div class="adv">'+
          '<div class="lbl">Render yöntemi</div>'+
          '<div class="row seg" id="v3dMRow"><button data-cammethod="prompt" class="v3dm" title="Metin prompt → nano">Prompt</button><button data-cammethod="snapshot" class="v3dm" title="Bu açının görseli → nano">Görsel</button><button data-cammethod="both" class="v3dm" title="İkisini de üret">İkisi</button></div>'+
          '<div id="v3dCamPromptWrap">'+
            '<div class="lbl" style="display:flex;justify-content:space-between;align-items:center">Render prompt\'u <span data-v3d="camprompreset" style="cursor:pointer;color:#c9a16b;font-weight:600;font-size:9.5px;text-transform:none">otomatiğe sıfırla</span></div>'+
            '<textarea id="v3dCamPrompt" rows="4" placeholder="Kamera seç → otomatik prompt"></textarea>'+
          '</div>'+
          '<div id="v3dCamSnapWrap">'+
            '<div class="lbl">Kendi-açı görsel (opsiyon 2)</div>'+
            '<img id="v3dCamSnap" class="snap" alt="kameranın kendi açısı">'+
          '</div>'+
          '<button data-v3d="camclear" class="seg" style="margin-top:4px"><span style="background:#33333c;color:#e8e6e0;border-radius:7px;padding:5px 9px;font-size:11px;font-weight:600;display:inline-block">Tüm kameraları temizle</span></button>'+
        '</div>'+
      '</div>'+
    '</div>';
    html+='</div>';
    dk.innerHTML=html;
    wireCamDock();
    updateCamDock(); updateCamRender(); setHint(lastHint);
  }
  // dock wiring: slider input'ları + more toggle + prompt textarea + snapshot tıklama (delege data-* zaten global handler'da)
  function wireCamDock(){
    const dk=overlay&&overlay.querySelector('#v3dCamDock'); if(!dk) return;
    const hm=dk.querySelector('#v3dCamHM'), tl=dk.querySelector('#v3dCamTilt'), more=dk.querySelector('#v3dCamMore');
    const hmv=dk.querySelector('#v3dCamHMVal'), tlv=dk.querySelector('#v3dCamTiltVal');
    // slider input: değeri CANLI yaz (camSliderDrag updateCamDock'un slider .value'sunu ezmesini engeller; etiketi elde tazeleriz)
    if(hm){ hm.addEventListener('pointerdown',function(){ camSliderDrag=true; });
            hm.addEventListener('input',function(){ camSliderDrag=true; setCamHeightM(+hm.value); if(hmv) hmv.textContent=(+hm.value).toFixed(2)+' m'; });
            hm.addEventListener('change',function(){ camSliderDrag=false; }); }
    if(tl){ tl.addEventListener('pointerdown',function(){ camSliderDrag=true; });
            tl.addEventListener('input',function(){ camSliderDrag=true; setCamTilt(+tl.value); if(tlv) tlv.textContent=Math.round(+tl.value)+'°'; });
            tl.addEventListener('change',function(){ camSliderDrag=false; }); }
    if(more) more.addEventListener('click',function(){ camDockAdvOpen=!camDockAdvOpen; dk.querySelector('.dk').classList.toggle('advopen',camDockAdvOpen); more.textContent=camDockAdvOpen?'Render ayarları ▲':'Render ayarları ▾'; updateCamRender(); });
    // B1-R: özet çip → detay katmanını aç/kapa (kompakt genişleme)
    const sum=dk.querySelector('#v3dCamSum');
    if(sum) sum.addEventListener('click',function(){ camDockDetOpen=!camDockDetOpen; dk.querySelector('.dk').classList.toggle('detopen',camDockDetOpen); const cc=dk.querySelector('#v3dCamSumC'); if(cc) cc.textContent=camDockDetOpen?'▲':'▼'; updateCamRender(); });
    const ta=dk.querySelector('#v3dCamPrompt');
    if(ta) ta.oninput=function(){ if(activeCamIdx>=0){ camList[activeCamIdx].prompt=ta.value; camList[activeCamIdx].promptEdited=true; } };
    const im=dk.querySelector('#v3dCamSnap');
    if(im) im.onclick=function(){ if(activeCamIdx>=0){ const u=snapCameraDataURL(activeCamIdx); if(u) im.src=u; } };
  }
  window.addEventListener('pointerup',function(){ camSliderDrag=false; });
  // dock highlight + slider değeri + hint tazele (YAPI değiştirmez). syncCamBtns/applyPlaceModeUI çağırır.
  function updateCamDock(){
    const dk=overlay&&overlay.querySelector('#v3dCamDock'); if(!dk||dk.style.display==='none') return;
    const has=(activeCamIdx>=0 && activeCamIdx<camList.length), c=has?camList[activeCamIdx]:null;
    const pb=dk.querySelector('#v3dPlaceBtn'); if(pb){ pb.classList.toggle('on',placeMode); pb.innerHTML=ic('camera',12)+placeBtnLabel(); }
    // B1-R: özet çip metni + seçili-kamera eylem ikonlarının etkinliği
    const sumT=dk.querySelector('#v3dCamSumT'); if(sumT) sumT.textContent=has?camSummaryText(c,activeCamIdx):'Kamera seç';
    const acts=dk.querySelector('#v3dCamActs'); if(acts){ acts.style.opacity=has?'1':'.4'; acts.style.pointerEvents=has?'':'none'; }
    dk.querySelectorAll('[data-camact]').forEach(function(b){ b.classList.toggle('on', placeMode&&b.getAttribute('data-camact')===placeAction); });
    dk.querySelectorAll('.v3dh').forEach(function(b){ b.classList.toggle('on', c && (c.customY==null) && b.getAttribute('data-camh')===(c.height||'eye')); });
    dk.querySelectorAll('.v3dl').forEach(function(b){ b.classList.toggle('on', c && +b.getAttribute('data-caml')===(c.lens||24)); });
    dk.querySelectorAll('[data-camtime]').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-camtime')===camTime(c)); });
    const ts=dk.querySelector('#v3dTimeScope'); if(ts) ts.textContent=has?'(bu kamera)':'(tümü)';
    const set=dk.querySelector('#v3dCamSettings'); if(set){ set.style.opacity=has?'1':'.4'; set.style.pointerEvents=has?'':'none'; }
    if(!camSliderDrag){
      const hm=dk.querySelector('#v3dCamHM'), hmv=dk.querySelector('#v3dCamHMVal');
      const tl=dk.querySelector('#v3dCamTilt'), tlv=dk.querySelector('#v3dCamTiltVal');
      if(has){ const y=c.pos.y, t=Math.round(camTiltDeg(c));
        if(hm) hm.value=y.toFixed(2); if(hmv) hmv.textContent=y.toFixed(2)+' m';
        if(tl) tl.value=t; if(tlv) tlv.textContent=t+'°';
      } else { if(hmv) hmv.textContent='—'; if(tlv) tlv.textContent='—'; }
    }
  }
  function updateCamRender(){
    if(!overlay) return;
    const dk=overlay.querySelector('#v3dCamDock');
    dk&&dk.querySelectorAll('.v3dm').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-cammethod')===camRenderMethod); });
    const wrapP=overlay.querySelector('#v3dCamPromptWrap'), wrapS=overlay.querySelector('#v3dCamSnapWrap');
    const ta=overlay.querySelector('#v3dCamPrompt'), img=overlay.querySelector('#v3dCamSnap');
    const showP=(camRenderMethod!=='snapshot'), showS=(camRenderMethod!=='prompt');
    if(wrapP) wrapP.style.display=showP?'block':'none';
    if(wrapS) wrapS.style.display=showS?'block':'none';
    const has=(activeCamIdx>=0 && activeCamIdx<camList.length), map=scene&&scene.__map;
    if(ta){
      if(has){ const c=camList[activeCamIdx];
        if(!c.promptEdited) c.prompt=autoCamPrompt(c,activeCamIdx,map);   // düzenlenmediyse otomatiği tazele (lens/açı değişince)
        ta.value=c.prompt||''; ta.disabled=false;
      } else { ta.value=''; ta.disabled=true; }
    }
    if(img){
      if(has && showS && camDockAdvOpen){ const u=snapCameraDataURL(activeCamIdx); if(u){ img.src=u; img.style.display='block'; } }
      else { img.removeAttribute('src'); }
    }
  }
  // eski çekmece şeridi çağrıları → dock'u tazele (uyumluluk: updateCamPanel adı korunuyor, dock'a yönlenir)
  function updateCamPanel(){ const strip=overlay&&overlay.querySelector('#v3dCamStrip'); if(strip) strip.innerHTML=camStripHTML(); }
  function setHint(t){ lastHint=t||''; const h=overlay&&overlay.querySelector('#v3dCamHint'); if(h) h.textContent=lastHint; }

  /* ====================== MALZEME — prosedürel preset katalog + CanvasTexture (M-serisi) ======================
     M1: texture DOSYASI YOK — hepsi canvas'ta prosedürel çizilir (offline kalır). 3 sınıf:
       floor.parke ×4 (tahta çizgi deseni) · floor.seramik ×4 (fuga ızgarası) · wall.boya ×6 (düz + hafif noise).
     Her preset: {key, group, cls, name, base(hex), swatch(css)} + prosedürel çizici. THREE CanvasTexture cache'lenir
     (ensureMatTex — lazy, THREE hazır olunca; test/headless'te THREE yok → çizim atlanır, katalog/kalıcılık saf JS). */
  const MAT_PRESETS = [
    // ── ZEMİN — PARKE (basit tahta çizgi deseni) ──
    { key:'parke_mese',   group:'floor', cls:'parke',   name:'Açık Meşe',     base:0xc9a978, plank:0xbb9866, line:0x9c7a4e },
    { key:'parke_ceviz',  group:'floor', cls:'parke',   name:'Koyu Ceviz',    base:0x6f4d31, plank:0x664529, line:0x40291a },
    { key:'parke_gri',    group:'floor', cls:'parke',   name:'Gri Meşe',      base:0x9a938a, plank:0x8e867c, line:0x6d665e },
    { key:'parke_balik',  group:'floor', cls:'parke',   name:'Balıksırtı',    base:0xc0a072, plank:0xb0925f, line:0x8a6d43, herringbone:true },
    // ── ZEMİN — SERAMİK (fuga ızgarası; ıslak hacim önceliği) ──
    { key:'seramik_beyaz',   group:'floor', cls:'seramik', name:'Beyaz Seramik',   base:0xeceae4, grout:0xc2beb2, wet:true },
    { key:'seramik_gri',     group:'floor', cls:'seramik', name:'Gri Seramik',     base:0xb8b6b2, grout:0x8f8d88, wet:true },
    { key:'seramik_bej',     group:'floor', cls:'seramik', name:'Bej Seramik',     base:0xd8cdb6, grout:0xb0a488, wet:true },
    { key:'seramik_antrasit',group:'floor', cls:'seramik', name:'Antrasit Seramik',base:0x4a4c50, grout:0x35373a, wet:true },
    // ── DUVAR — BOYA (düz + çok hafif noise doku) ──
    { key:'boya_krikbeyaz', group:'wall', cls:'boya', name:'Kırık Beyaz', base:0xf0ece2 },
    { key:'boya_bej',       group:'wall', cls:'boya', name:'Bej',         base:0xe1d3ba },
    { key:'boya_adacayi',   group:'wall', cls:'boya', name:'Adaçayı',     base:0xb7c4ac },
    { key:'boya_dumanmavi', group:'wall', cls:'boya', name:'Duman Mavisi',base:0xaebfca },
    { key:'boya_terracotta',group:'wall', cls:'boya', name:'Terracotta',  base:0xc08163 },
    { key:'boya_antrasit',  group:'wall', cls:'boya', name:'Antrasit',    base:0x565961 }
  ];
  const MAT_BY_KEY = {}; MAT_PRESETS.forEach(function(p){ MAT_BY_KEY[p.key]=p; });
  function hexCss(h){ return '#'+('000000'+(h>>>0).toString(16)).slice(-6); }
  // swatch (küçük önizleme karesi) için CSS arka planı — prosedürel dokuyu ima eden hafif gradient/çizgi.
  function matSwatchCss(p){
    const b=hexCss(p.base);
    if(p.cls==='parke'){ const ln=hexCss(p.line||p.base); return 'repeating-linear-gradient(90deg,'+b+' 0 6px,'+ln+' 6px 7px)'; }
    if(p.cls==='seramik'){ const gr=hexCss(p.grout||p.base); return b+' repeating-linear-gradient(0deg,transparent 0 8px,'+gr+' 8px 9px),'+b+' repeating-linear-gradient(90deg,transparent 0 8px,'+gr+' 8px 9px)'; }
    return b;   // boya = düz renk
  }
  // ── prosedürel canvas çizimi (dosyasız) — 256×256 tekrarlı doku ──
  let _matTexCache=null;
  function drawParke(x,c,p){                                   // basit tahta çizgi deseni (yatay şerit + dikey ek yerleri)
    x.fillStyle=hexCss(p.base); x.fillRect(0,0,c.width,c.height);
    const rows=6, rh=c.height/rows, line=hexCss(p.line||p.base), plank=hexCss(p.plank||p.base);
    for(let r=0;r<rows;r++){
      const y=r*rh, off=(r%2)*(c.width/2);                     // kaydırmalı derz (tuğla dizilimi)
      x.fillStyle=plank; x.fillRect(0,y+1,c.width,rh-2);
      x.strokeStyle=line; x.lineWidth=1.4;
      x.beginPath(); x.moveTo(0,y); x.lineTo(c.width,y); x.stroke();      // tahta arası yatay derz
      for(let k=0;k<2;k++){ const px=((off+k*c.width/2)%c.width);        // dikey ek yeri (tahta uçları)
        x.beginPath(); x.moveTo(px,y); x.lineTo(px,y+rh); x.stroke(); }
    }
  }
  function drawSeramik(x,c,p){                                 // düz kare + fuga (grout) ızgarası
    x.fillStyle=hexCss(p.base); x.fillRect(0,0,c.width,c.height);
    const n=4, s=c.width/n, gr=hexCss(p.grout||p.base);
    x.strokeStyle=gr; x.lineWidth=2.2;
    for(let i=0;i<=n;i++){ const v=i*s;
      x.beginPath(); x.moveTo(v,0); x.lineTo(v,c.height); x.stroke();
      x.beginPath(); x.moveTo(0,v); x.lineTo(c.width,v); x.stroke(); }
  }
  function drawBoya(x,c,p){                                    // düz renk + ÇOK hafif noise (mat boya dokusu)
    x.fillStyle=hexCss(p.base); x.fillRect(0,0,c.width,c.height);
    const img=x.getImageData(0,0,c.width,c.height), d=img.data;
    for(let i=0;i<d.length;i+=4){ const n=(Math.random()-0.5)*10; d[i]+=n; d[i+1]+=n; d[i+2]+=n; }
    x.putImageData(img,0,0);
  }
  function makeMatCanvas(p){
    const c=document.createElement('canvas'); c.width=c.height=256; const x=c.getContext('2d');
    if(p.cls==='parke') drawParke(x,c,p); else if(p.cls==='seramik') drawSeramik(x,c,p); else drawBoya(x,c,p);
    return c;
  }
  // preset key → THREE.MeshStandardMaterial (CanvasTexture'lı, cache'li). THREE yoksa (test) null döner.
  function matMaterial(key){
    const p=MAT_BY_KEY[key]; if(!p || typeof THREE==='undefined' || !THREE.CanvasTexture) return null;
    if(!_matTexCache) _matTexCache={};
    if(_matTexCache[key]) return _matTexCache[key];
    const tex=new THREE.CanvasTexture(makeMatCanvas(p));
    tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
    const rep=(p.cls==='boya')?1:(p.cls==='seramik'?2:3);
    tex.repeat.set(rep,rep);
    if(THREE.SRGBColorSpace) tex.colorSpace=THREE.SRGBColorSpace; else if(THREE.sRGBEncoding) tex.encoding=THREE.sRGBEncoding;
    const rough=(p.cls==='seramik')?0.35:(p.cls==='boya'?0.9:0.7);
    const m=new THREE.MeshStandardMaterial({ map:tex, roughness:rough, metalness:(p.cls==='seramik'?0.06:0.02) });
    // J4: DUVAR boyası da matWall ile AYNI polygonOffset alsın (boyalı oda ↔ nötr matWall komşusu ya da mobilya
    //   arka paneli eş-düzleminde tutarlı öne). Yalnız duvar grubu (zemin parke/seramik dokunulmaz).
    if(p.group==='wall'){ m.polygonOffset=true; m.polygonOffsetFactor=-1; m.polygonOffsetUnits=-1; }
    _matTexCache[key]=m; return m;
  }
  // oda için seçili malzeme (floor|wall) preset key'i — override YOKSA null (→ renk-kodlu varsayılan).
  function roomMatKey(roomId, slot){
    const o=materialOverrides[roomId]; return (o && o[slot]) || null;
  }

  /* ====================== MOBİLYA — mesh fabrikası + render (Faz 1) ======================
     Her mobilya = birkaç BoxGeometry grubu (lokal orijin = item merkezi, +Z = ön yön). Kamera
     gizmolarının kardeşi: renderFurniture ↔ renderCamGizmos, ama AYRI grup (__furnitureGroup).
     THREE LAZY yüklenir → malzemeleri modül-üstünde değil, ensureFMAT() ile tembel kur. */
  let FMAT=null, FMAT_SET=null;
  function ensureFMAT(){
    if(FMAT) return;
    const M=function(c,r,m){ return new THREE.MeshStandardMaterial({color:c, roughness:(r==null?0.8:r), metalness:(m||0)}); };
    FMAT={ wood:M(0x9c7a52,0.82), woodDark:M(0x6e5234,0.78), panel:M(0xe4ddcf,0.7),
           cabinet:M(0xcdb089,0.72), cabinetLine:M(0x8a6f4c,0.75),   // C3-5: dolap = açık ahşap + ayrım çizgisi (kapı koyu tonundan bariz ayrışır)
           fabric:M(0x8593a8,0.95), fabric2:M(0xb7a98c,0.95), cushion:M(0x9aa7bb,0.96), leather:M(0x7c5a44,0.5),
           white:M(0xf1f1f3,0.55), porcelain:M(0xf5f5f7,0.35), steel:M(0xc2c4c8,0.4,0.5), metal:M(0x9a9aa0,0.45,0.6),
           tubInner:M(0xcfd8dc,0.4),   // M2: küvet/lavabo İÇ çukur — porselenden belirgin koyu/gölgeli ton (oyuk okunsun)
           plywood:(function(){ const mm=M(0x6f5636,0.9); mm.emissive=new THREE.Color(0x241a0e); mm.emissiveIntensity=0.35; return mm; })(),
             // M3/Q1: kitaplık ARKA PANEL — gövdeden (FMAT.cabinet açık ahşap) belirgin KOYU kontrplak tonu (kontrast=okunur sırt).
             // Q1 (3. tur): eski 0x8a6d47 + emissive 0.5 güçlü key-light altında açık ahşaba yaklaşıp yıkanıyordu ("sırt yok"
             // algısını sürdürüyordu) → koyulaştırıldı (0x6f5636) + emissive kısıldı (0.35, hâlâ siyah-boşluk değil).
           dark:M(0x303036,0.6,0.3), glass:M(0xbcd6e6,0.2,0.2), green:M(0x5f8f5f,0.9), leaf:M(0x4f8453,0.85),
           pot:M(0x9a6b4e,0.85), rug:M(0xb09277,0.97), rugDark:M(0x8a6f58,0.97) };
    FMAT_SET=new Set(Object.keys(FMAT).map(function(k){ return FMAT[k]; }));   // paylaşılan → dispose etme
  }
  function fbox(w,h,d,mat){ return new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat); }
  function fcyl(r,h,mat,seg){ return new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,seg||14), mat); }
  // --- mesh aile yardımcıları (lokal +Z = ön/odaya bakan yüz; -Z = arka/duvar) ---
  function legsAt(g,w,d,top,lh,mat,ins){ ins=(ins==null?0.06:ins); const lw=0.05;
    [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(function(s){ const l=fbox(lw,lh,lw,mat||FMAT.woodDark); l.position.set(s[0]*(w/2-ins),top-lh/2,s[1]*(d/2-ins)); g.add(l); }); }
  // Q5: KANEPE — eski sürüm alçak arkalık + ince (0.13) düz minder plakaları → "sedir/bench" gibi okunuyordu.
  //   YÜKSEK arkalık + KALIN oturma minderi + ŞİŞKİN arkalık minderi + kalın kolçak → net döşemeli kanepe.
  function sofaMesh(g,w,d,mat){ mat=mat||FMAT.fabric; const arm=0.22, seatH=0.42;
    const base=fbox(w,0.34,d,mat); base.position.y=0.20; g.add(base);
    const back=fbox(w,0.55,0.20,mat); back.position.set(0,0.62,-d/2+0.10); g.add(back);                          // yüksek arkalık
    [-1,1].forEach(function(s){ const a=fbox(arm,0.46,d,mat); a.position.set(s*(w/2-arm/2),0.40,0); g.add(a); });  // kalın kolçak
    const sw=w-2*arm, n=Math.max(1,Math.round(sw/0.75));
    for(let i=0;i<n;i++){ const c=fbox(sw/n-0.06,0.16,d-0.30,FMAT.cushion); c.position.set(-sw/2+sw/n*(i+0.5),seatH,0.06); g.add(c);   // kalın oturma minderi
      const bc=fbox(sw/n-0.06,0.34,0.16,FMAT.cushion); bc.position.set(-sw/2+sw/n*(i+0.5),0.60,-d/2+0.22); g.add(bc); }               // şişkin arkalık minderi
    legsAt(g,w,d,0.06,0.06,FMAT.woodDark,0.06); }
  function tableMesh(g,w,d,topY,mat){ const t=fbox(w,0.05,d,mat||FMAT.wood); t.position.y=topY; g.add(t); legsAt(g,w,d,topY-0.025,topY-0.025,FMAT.woodDark); }
  function chairMesh(g,w,d){ const se=0.46; const s=fbox(w,0.06,d,FMAT.wood); s.position.y=se; g.add(s);
    const b=fbox(w,0.42,0.05,FMAT.wood); b.position.set(0,se+0.22,-d/2+0.04); g.add(b); legsAt(g,w,d,se-0.03,se-0.03,FMAT.woodDark,0.05); }
  // C3-5: gövde = açık ahşap (FMAT.cabinet) + ön yüzde BELİRGİN kapak-ayrım çizgileri + her kapağa ince çerçeve imi
  //   + dikey kulplar → nano girdisinde "dolap" olarak okunur, koyu KAPI kanadıyla karışmaz.
  function cabinetMesh(g,w,d,h,mat,doors,baseY){ baseY=baseY||0; mat=mat||FMAT.cabinet; const box=fbox(w,h,d,mat); box.position.y=baseY+h/2; g.add(box);
    doors=doors||Math.max(1,Math.round(w/0.5)); const fz=d/2+0.006, lineMat=FMAT.cabinetLine;
    for(let i=1;i<doors;i++){ const gv=fbox(0.022,h*0.96,0.02,lineMat); gv.position.set(-w/2+w/doors*i,baseY+h/2,fz); g.add(gv); }   // kapak ayrım çizgisi (kalın)
    const dw=w/doors;
    for(let i=0;i<doors;i++){ const cxp=-w/2+dw*(i+0.5);
      // her kapak yüzüne ince dikdörtgen çerçeve imi (üst+alt yatay çizgi) → panel okunur
      for(const yy of [baseY+h*0.06, baseY+h*0.94]){ const hl=fbox(dw*0.78,0.016,0.014,lineMat); hl.position.set(cxp,yy,fz); g.add(hl); }
      const hd=fbox(0.024,Math.min(0.22,h*0.16),0.03,FMAT.metal); hd.position.set(cxp+dw*0.34,baseY+h/2,fz+0.006); g.add(hd); }   // dikey kulp
  }
  // C3-5b: KİTAPLIK — AÇIK ÖNLÜ KARKAS (kapı/kulp YOK). İki yan panel + üst + alt + ince arka panel;
  //   raflar GÖVDENİN İÇİNDE (girintili, ön yüzden dışarı taşmaz — eski hata: raflar "askılık çıkıntısı"
  //   gibi ön yüzeyden fırlıyordu). İsteğe bağlı 3-5 kitap iması (farklı yükseklik/kalınlık ince kutular,
  //   birkaç sönük renk) → nano'ya "kitaplık" sinyali netleşir.
  // M3 (revizyon): arka panel geometrik olarak DOĞRUYDU (var, konumu doğru) ama gövdeyle AYNI açık-ahşap
  //   tonundaydı (FMAT.cabinet) → kontrast yok, uzaktan/dollhouse ışığında "boşluk" gibi okunuyordu (kullanıcı:
  //   "arkası yok, bi kontrplak ver"). Kök neden KONUM değil, MALZEME KONTRASTI. Fix: arka panel artık BELİRGİN
  //   kontrplak tonu (FMAT.plywood, gövdeden koyu/farklı) — önden bakınca rafların arasından NET bir "sırt" görünür.
  //   Ayrıca raf derinliği arka panelin ön yüzüyle 2mm çakışmasın diye hafif kısaltıldı (z-fighting payı kaldırıldı).
  function bookcaseMesh(g,w,d,h,mat,shelfCount){
    mat=mat||FMAT.cabinet; shelfCount=shelfCount||3;
    const pt=0.03;                                    // yan/üst/alt panel kalınlığı
    const backT=0.02;                                 // Q1: arka panel kalınlaştırıldı (ince 0.012 → z-fight'a kırılgandı)
    [-1,1].forEach(function(s){ const side=fbox(pt,h,d,mat); side.position.set(s*(w/2-pt/2),h/2,0); g.add(side); });
    const top=fbox(w,pt,d,mat); top.position.set(0,h-pt/2,0); g.add(top);
    const bot=fbox(w,pt,d,mat); bot.position.set(0,pt/2,0); g.add(bot);
    // Q1 (3. tur): arka panel GÖVDE İÇİNE alındı. Eskiden panel arka yüzü z=-d/2, yan/üst/alt panellerin arka
    //   yüzüyle ÇAKIŞIYORDU → z-fight (rafların arasından "sırt yok/duvar var" izlenimi). Şimdi panelin ÖN yüzü
    //   z=-d/2+pt (bir panel-kalınlığı içeride) → çakışma yok, sırt net ayrı düzlem. Raflar bu panelin ön yüzünden başlar.
    const backFrontZ=-d/2+pt;
    const back=fbox(w-2*pt,h-2*pt,backT,FMAT.plywood); back.position.set(0,h/2,backFrontZ-backT/2); g.add(back);
    const innerW=w-2*pt, shelfBackZ=backFrontZ, shelfD=(d/2-0.02)-shelfBackZ;   // raf: arka panel ön yüzünden gövde ön-yüzüne (dışa taşmaz)
    for(let i=1;i<shelfCount;i++){
      const sy=pt+(h-2*pt)*i/shelfCount;
      const sh=fbox(innerW,0.025,shelfD,mat); sh.position.set(0,sy,shelfBackZ+shelfD/2); g.add(sh);
    }
    // isteğe bağlı: raf başına 2-3 kitap iması (ince, farklı yükseklik/kalınlık, sönük renk çeşidi)
    const bookMats=[FMAT.woodDark,FMAT.cushion,FMAT.leather,FMAT.fabric2];
    for(let i=0;i<shelfCount;i++){
      const shY=(i===0)?pt:pt+(h-2*pt)*i/shelfCount;         // alt raf tabanı, sonrakiler raf üstü
      const nextY=(i<shelfCount-1)?pt+(h-2*pt)*(i+1)/shelfCount:h-pt;
      const avail=nextY-shY-0.03; if(avail<0.14) continue;    // çok dar aralık → kitap ima etme
      const bh=Math.min(avail*0.62,0.24), n=2+(i%3);           // 2-4 kitap, rafa göre değişir (tekdüze değil)
      let cx=-innerW/2+0.03;
      for(let k=0;k<n && cx<innerW/2-0.03;k++){
        const bw=0.025+((i*3+k)%3)*0.008;                      // ince, kalınlık çeşitlemesi
        if(cx+bw>innerW/2-0.02) break;
        const bk=fbox(bw,bh,shelfD*0.6,bookMats[(i+k)%bookMats.length]);
        bk.position.set(cx+bw/2,shY+bh/2+0.014,shelfBackZ+shelfD*0.4); g.add(bk);
        cx+=bw+0.018;
      }
    }
  }
  function bedMesh(g,w,d){ const base=fbox(w,0.28,d,FMAT.panel); base.position.y=0.14; g.add(base);
    const mat=fbox(w-0.06,0.16,d-0.06,FMAT.fabric2); mat.position.y=0.34; g.add(mat);
    const hb=fbox(w,0.95,0.09,FMAT.woodDark); hb.position.set(0,0.48,-d/2+0.045); g.add(hb);
    const pil=Math.max(1,Math.round(w/0.7)); for(let i=0;i<pil;i++){ const p=fbox(w/pil-0.08,0.10,0.36,FMAT.white); p.position.set(-w/2+w/pil*(i+0.5),0.45,-d/2+0.28); g.add(p); }
    const dv=fbox(w-0.12,0.04,d-0.7,FMAT.cushion); dv.position.set(0,0.43,0.2); g.add(dv); }
  function plantMesh(g,h){ h=h||1.2; const pot=fcyl(0.16,0.30,FMAT.pot,12); pot.position.y=0.15; g.add(pot);
    const stem=fcyl(0.03,h-0.5,FMAT.woodDark,6); stem.position.y=0.30+(h-0.5)/2; g.add(stem);
    [0,1,2].forEach(function(i){ const fol=fcyl(0.22-i*0.04,0.26,FMAT.leaf,7); fol.position.y=h-0.35+i*0.12; g.add(fol); }); }
  // Q3: KÜVET — GERÇEK BOŞ TEKNE (üstü açık). Dış gövde (taban + 4 dış duvar, porselen) + İÇ tekne bir
  //   kademe içeride ve ALÇAK tabanlı (görünür oyuk, açık seramik iç yüzey) + ÜST rim = ince FRAME (dolu kapak
  //   DEĞİL → ağız açık, oyuk üstten/3-4 açıdan NET okunur) + batarya bloğu. Eski sürüm rim'i DOLU slab'dı =
  //   fiilen kapak → "dolap gibi" (kullanıcı reddi). Dış boyut w×d×h DEĞİŞMEDİ (furnFits/SAT etkilenmez).
  function bathtubMesh(g,w,d,h){
    h=h||0.55;
    const outT=0.06;                              // dış duvar kalınlığı
    const innerInset=0.10;                        // iç teknenin dış duvardan içeri çekilmesi (= rim genişliği)
    const iw=w-2*innerInset, idp=d-2*innerInset;  // iç tekne ağız ölçüsü
    const floorY=0.10;                            // iç tekne taban yüksekliği (görünür oyuk derinliği = h-floorY)
    // dış gövde: alt taban + 4 dış duvar
    const base=fbox(w,outT,d,FMAT.porcelain); base.position.y=outT/2; g.add(base);
    [ [ (w-outT)/2,0,outT,d], [-(w-outT)/2,0,outT,d] ].forEach(function(s){ const sw=fbox(s[2],h,s[3],FMAT.porcelain); sw.position.set(s[0],h/2,s[1]); g.add(sw); });
    [ [0, (d-outT)/2,w-2*outT,outT], [0,-(d-outT)/2,w-2*outT,outT] ].forEach(function(s){ const sw=fbox(s[2],h,s[3],FMAT.porcelain); sw.position.set(s[0],h/2,s[1]); g.add(sw); });
    // İÇ TEKNE (görünür oyuk): açık seramik taban + 4 iç duvar (üstü AÇIK). Taban floorY'de → yukarıdan bakınca boşluk NET.
    const inH=h-floorY, inT=0.03;
    const inFloor=fbox(iw,0.03,idp,FMAT.tubInner); inFloor.position.y=floorY+0.015; g.add(inFloor);
    [ [ (iw-inT)/2,0,inT,idp], [-(iw-inT)/2,0,inT,idp] ].forEach(function(s){ const cw=fbox(s[2],inH,s[3],FMAT.tubInner); cw.position.set(s[0],floorY+inH/2,s[1]); g.add(cw); });
    [ [0, (idp-inT)/2,iw,inT], [0,-(idp-inT)/2,iw,inT] ].forEach(function(s){ const cw=fbox(s[2],inH,s[3],FMAT.tubInner); cw.position.set(s[0],floorY+inH/2,s[1]); g.add(cw); });
    // RİM = ince FRAME (4 şerit), dolu slab DEĞİL → ağız açık kalır
    const rimT=0.025, rimY=h+rimT/2-0.005, rw=innerInset;
    [ [ (w-rw)/2,0,rw,d], [-(w-rw)/2,0,rw,d] ].forEach(function(s){ const r=fbox(s[2],rimT,s[3],FMAT.white); r.position.set(s[0],rimY,s[1]); g.add(r); });
    [ [0, (d-rw)/2,w-2*rw,rw], [0,-(d-rw)/2,w-2*rw,rw] ].forEach(function(s){ const r=fbox(s[2],rimT,s[3],FMAT.white); r.position.set(s[0],rimY,s[1]); g.add(r); });
    // batarya bloğu — kısa kenarda musluk gövdesi + iki kol (sıcak/soğuk)
    const fx=0, fz=-d/2+0.08;
    const faBase=fbox(0.10,0.06,0.06,FMAT.metal); faBase.position.set(fx,h+0.03,fz); g.add(faBase);
    const faSpout=fcyl(0.014,0.16,FMAT.metal,8); faSpout.rotation.z=Math.PI/2.3; faSpout.position.set(fx,h+0.12,fz+0.03); g.add(faSpout);
    [-0.09,0.09].forEach(function(kx){ const kn=fcyl(0.018,0.03,FMAT.metal,8); kn.position.set(fx+kx,h+0.05,fz); g.add(kn); });
  }
  // Q4: KLOZET — KLASİK form (eski 3 kutu = koltuk/berjer silüeti, kullanıcı reddi). Arkada rezervuar KUTUSU
  //   (dar, üst) + ÇANAK (oval basık silindir, öne) + tapering PEDESTAL (zemine) + oturak/kapak plakası imi +
  //   sifon düğmesi. Hep açık seramik ton (beyaz/panel — koltuk kumaş tonlarından uzak). Dış W×Dp DEĞİŞMEDİ.
  function toiletMesh(g,W,Dp){
    const tankD=0.15, tankH=0.36, tankTop=0.74;                                          // rezervuar: arka duvara dayalı dar kutu
    const tank=fbox(W,tankH,tankD,FMAT.white); tank.position.set(0,tankTop-tankH/2,-Dp/2+tankD/2); g.add(tank);
    const lidBtn=fbox(W*0.26,0.025,0.08,FMAT.steel); lidBtn.position.set(0,tankTop+0.005,-Dp/2+tankD/2); g.add(lidBtn);   // sifon düğmesi imi
    const bowlCz=(tankD-0.02)/2+0.03, bowlY=0.42, bowlR=W/2*0.98, bowlDp=Dp-tankD-0.04;
    const bowl=new THREE.Mesh(new THREE.CylinderGeometry(bowlR,bowlR*0.80,0.20,24), FMAT.white);      // oval basık çanak
    bowl.scale.z=(bowlDp/2)/bowlR; bowl.position.set(0,bowlY,bowlCz); g.add(bowl);
    const ped=new THREE.Mesh(new THREE.CylinderGeometry(bowlR*0.55,bowlR*0.42,bowlY-0.09,16), FMAT.white);   // zemine daralan ayak
    ped.scale.z=(bowlDp/2*0.55)/(bowlR*0.55); ped.position.set(0,(bowlY-0.09)/2,bowlCz); g.add(ped);
    const seat=new THREE.Mesh(new THREE.CylinderGeometry(bowlR*1.03,bowlR*1.03,0.035,24), FMAT.panel);       // kapalı kapak/oturak plakası
    seat.scale.z=(bowlDp/2*1.03)/(bowlR*1.03); seat.position.set(0,bowlY+0.12,bowlCz); g.add(seat);
  }
  // M2: LAVABO — çanak (basık geniş silindir, İÇİ hafif çukur imi) + batarya + tip'e göre ayak/tezgah.
  //   washbasin (tezgahlı, mevcut kabin) ayrı case'de kalır; bu yardımcı SERBEST çanak biçimi verir (gerekirse başka yerde kullanılabilir).
  function basinBowlMesh(g,w,d,topY){
    const rx=w/2*0.92, rz=d/2*0.92;
    const bowl=new THREE.Mesh(new THREE.CylinderGeometry(rx,rx*0.82,0.14,20), FMAT.porcelain);
    bowl.scale.z=rz/rx; bowl.position.y=topY-0.05; g.add(bowl);
    const cav=new THREE.Mesh(new THREE.CylinderGeometry(rx*0.78,rx*0.6,0.07,20), FMAT.tubInner);
    cav.scale.z=(rz*0.8)/(rx*0.78); cav.position.y=topY-0.015; g.add(cav);                 // iç çukur imi (koyu, basık)
    const fa=fcyl(0.018,0.24,FMAT.metal,8); fa.position.set(0,topY+0.12,-d/2*0.3); g.add(fa);
    const faSpout=fcyl(0.012,0.10,FMAT.metal,8); faSpout.rotation.z=Math.PI/2.4; faSpout.position.set(0,topY+0.20,-d/2*0.3+0.05); g.add(faSpout);
  }
  // tek mobilya item'i → mesh grubu. Bilinmeyen tip = kutu (çökmez).
  function buildFurnMesh(f){
    ensureFMAT();
    const g=new THREE.Group();
    const t=(f.type||'').toLowerCase();
    const D=FURN_DIM[t]||{w:0.6,d:0.6};
    const W=(f.__w!=null?f.__w:D.w), Dp=(f.__d!=null?f.__d:D.d);   // counter gibi parametrik genişlik
    switch(t){
      case 'sofa_2': case 'sofa_3': sofaMesh(g,W,Dp); break;
      case 'sectional_l': { sofaMesh(g,W,0.95); const ch=fbox(0.92,0.30,Dp,FMAT.fabric); ch.position.set(W/2-0.46,0.17,0.0+ (Dp-0.95)/2); g.add(ch);
        const cc=fbox(0.80,0.13,Dp-0.2,FMAT.cushion); cc.position.set(W/2-0.46,0.40,(Dp-0.95)/2); g.add(cc); break; }
      // Q5: BERJER — yüksek arkalık + şişkin arkalık minderi + kalın oturma minderi + chunky kolçak + ayak (koltuk sinyali)
      case 'armchair': { const b=fbox(W,0.34,Dp,FMAT.fabric); b.position.y=0.20; g.add(b);
        const bk=fbox(W,0.52,0.18,FMAT.fabric); bk.position.set(0,0.60,-Dp/2+0.10); g.add(bk);
        [-1,1].forEach(function(s){ const a=fbox(0.20,0.44,Dp,FMAT.fabric); a.position.set(s*(W/2-0.10),0.40,0); g.add(a); });
        const cu=fbox(W-0.40,0.15,Dp-0.28,FMAT.cushion); cu.position.set(0,0.43,0.05); g.add(cu);
        const bc=fbox(W-0.40,0.30,0.14,FMAT.cushion); bc.position.set(0,0.58,-Dp/2+0.20); g.add(bc);
        legsAt(g,W,Dp,0.06,0.06,FMAT.woodDark,0.07); break; }
      case 'pouf': { const p=fbox(W,0.40,Dp,FMAT.fabric2); p.position.y=0.20; g.add(p); break; }
      case 'coffee_table': tableMesh(g,W,Dp,0.40,FMAT.wood); break;
      case 'side_table': { const t2=fcyl(W/2,0.04,FMAT.wood,16); t2.position.y=0.53; g.add(t2); const lg=fcyl(0.03,0.51,FMAT.woodDark,8); lg.position.y=0.255; g.add(lg); break; }
      case 'tv_unit': { const box=fbox(W,0.48,Dp,FMAT.woodDark); box.position.y=0.24; g.add(box); for(let i=1;i<3;i++){ const gv=fbox(0.012,0.44,0.012,FMAT.dark); gv.position.set(-W/2+W/3*i,0.24,Dp/2+0.005); g.add(gv);} break; }
      case 'tv': { const scr=fbox(W,0.80,0.05,FMAT.dark); scr.position.y=1.10; g.add(scr); const st=fbox(0.4,0.04,0.18,FMAT.dark); st.position.y=0.70; g.add(st); break; }
      case 'bookcase': bookcaseMesh(g,W,Dp,D.h,FMAT.cabinet,3); break;   // C3-5b: açık önlü karkas, raflar içeride, kulp yok
      case 'console': { const box=fbox(W,0.18,Dp,FMAT.wood); box.position.y=0.70; g.add(box); legsAt(g,W,Dp,0.70-0.09,0.61,FMAT.woodDark); break; }
      case 'sideboard': cabinetMesh(g,W,Dp,D.h,FMAT.wood); break;
      case 'rug': { const rg=fbox(W,0.02,Dp,FMAT.rug); rg.position.y=0.012; g.add(rg); const bd=fbox(W-0.2,0.022,Dp-0.2,FMAT.rugDark); bd.position.y=0.013; g.add(bd); break; }
      case 'dining_table_4': case 'dining_table_6': tableMesh(g,W,Dp,0.75,FMAT.wood); break;
      case 'dining_chair': case 'bistro_chair': chairMesh(g,W,Dp); break;
      case 'bistro_table': { const t2=fcyl(W/2,0.04,FMAT.metal,16); t2.position.y=0.71; g.add(t2); const lg=fcyl(0.04,0.69,FMAT.metal,8); lg.position.y=0.345; g.add(lg); break; }
      case 'bed_single': case 'bed_double': case 'bed_queen': case 'bed_king': bedMesh(g,W,Dp); break;
      case 'nightstand': { cabinetMesh(g,W,Dp,0.50,FMAT.wood,1); break; }
      case 'wardrobe_2': case 'wardrobe_3': case 'wardrobe_4': cabinetMesh(g,W,Dp,D.h,FMAT.cabinet); break;   // C3-5: açık ahşap dolap (koyu kapıdan ayrışır)
      case 'dresser': cabinetMesh(g,W,Dp,D.h,FMAT.wood, Math.max(2,Math.round(W/0.5))); break;
      case 'vanity': { const tb=fbox(W,0.04,Dp,FMAT.wood); tb.position.y=0.76; g.add(tb); legsAt(g,W,Dp,0.735,0.735,FMAT.woodDark); const mir=fbox(W*0.6,0.5,0.03,FMAT.glass); mir.position.set(0,1.15,-Dp/2+0.03); g.add(mir); break; }
      case 'bench': { const s=fbox(W,0.12,Dp,FMAT.fabric2); s.position.y=0.40; g.add(s); legsAt(g,W,Dp,0.34,0.34,FMAT.woodDark); break; }
      case 'counter': { const c=fbox(W,0.86,Dp,FMAT.panel); c.position.y=0.43; g.add(c); const tp=fbox(W,0.05,Dp+0.03,FMAT.steel); tp.position.y=0.88; g.add(tp);
        const doors=Math.max(1,Math.round(W/0.6)); for(let i=1;i<doors;i++){ const gv=fbox(0.012,0.80,0.012,FMAT.woodDark); gv.position.set(-W/2+W/doors*i,0.45,Dp/2+0.005); g.add(gv);} break; }
      // Q5: ADA — gövde + taş tezgah (overhang) + kapak ayrım çizgileri + kulplar (düz kutu değil, mutfak adası okunur)
      case 'island': { const c=fbox(W,0.86,Dp,FMAT.panel); c.position.y=0.43; g.add(c);
        const tp=fbox(W+0.06,0.06,Dp+0.06,FMAT.white); tp.position.y=0.89; g.add(tp);
        const doors=Math.max(2,Math.round(W/0.6)); for(let i=1;i<doors;i++){ const gv=fbox(0.014,0.78,0.014,FMAT.woodDark); gv.position.set(-W/2+W/doors*i,0.45,Dp/2+0.005); g.add(gv);}
        for(let i=0;i<doors;i++){ const cxp=-W/2+W/doors*(i+0.5); const hd=fbox(0.02,0.12,0.03,FMAT.metal); hd.position.set(cxp,0.66,Dp/2+0.008); g.add(hd);} break; }
      case 'oven_hob': { const c=fbox(W,0.86,Dp,FMAT.dark); c.position.y=0.43; g.add(c); const tp=fbox(W,0.05,Dp,FMAT.steel); tp.position.y=0.88; g.add(tp); [[-1],[1]].forEach(function(s){ const b=fcyl(0.09,0.012,FMAT.dark,12); b.position.set(s[0]*0.13,0.91,0); g.add(b);}); break; }
      // M4: ÇAMAŞIR — ön yüzde YUVARLAK lombar kapak (cam daire, davul okunur) + ÜST kontrol bandı (yatay şerit + 3 düğme).
      case 'washer': { const c=fbox(W,D.h,Dp,FMAT.steel); c.position.y=D.h/2; g.add(c);
        const ring=fcyl(W*0.34,0.02,FMAT.dark,20); ring.rotation.x=Math.PI/2; ring.position.set(0,D.h*0.42,Dp/2+0.008); g.add(ring);          // lombar çerçeve (koyu halka)
        const dr=fcyl(W*0.30,0.03,FMAT.glass,20); dr.rotation.x=Math.PI/2; dr.position.set(0,D.h*0.42,Dp/2+0.014); g.add(dr);                  // cam kapak (yuvarlak)
        const band=fbox(W*0.86,D.h*0.14,0.02,FMAT.dark); band.position.set(0,D.h*0.82,Dp/2+0.006); g.add(band);                                // üst kontrol bandı
        [-0.18,0,0.18].forEach(function(kx){ const kn=fcyl(0.016,0.015,FMAT.metal,10); kn.rotation.x=Math.PI/2; kn.position.set(kx*W,D.h*0.82,Dp/2+0.02); g.add(kn); }); break; }
      // M4: BULAŞIK — DÜZ ön panel (yuvarlak kapak YOK, tezgah-altı görünüm) + YATAY kol/kulp çizgisi (üstte, tezgah komşusu).
      case 'dishwasher': { const c=fbox(W,D.h,Dp,FMAT.steel); c.position.y=D.h/2; g.add(c);
        const panel=fbox(W*0.9,D.h*0.7,0.015,FMAT.dark); panel.position.set(0,D.h*0.42,Dp/2+0.008); g.add(panel);                              // düz ön panel (davul/kapak imi yok)
        const handle=fbox(W*0.82,0.03,0.03,FMAT.metal); handle.position.set(0,D.h*0.86,Dp/2+0.02); g.add(handle); break; }                     // yatay kol çizgisi (üst kenar, tezgah komşusu)
      case 'fridge': { const r=fbox(W,D.h,Dp,FMAT.white); r.position.y=D.h/2; g.add(r); const gv=fbox(0.015,D.h*0.96,0.015,FMAT.metal); gv.position.set(0,D.h*0.62,Dp/2+0.006); g.add(gv);
        [0.40,0.72].forEach(function(fy){ const h2=fbox(0.03,0.22,0.03,FMAT.metal); h2.position.set(-W/2+0.10,D.h*fy,Dp/2+0.02); g.add(h2);}); break; }
      // Q5: EVYE — gövde + ahşap tezgah FRAME (dolu değil) + GÖMME çelik tekne (görünür oyuk) + gooseneck batarya.
      //   Eski sürüm tezgah üstüne küçük çıkıntı koyuyordu → dolap sanılıyordu; şimdi tekne oyuğu net.
      case 'sink': { const c=fbox(W,0.86,Dp,FMAT.panel); c.position.y=0.43; g.add(c);
        const topY=0.885, topT=0.05, bw=W*0.60, bd=Dp*0.58, bh=0.18, bz=0.05;
        const fx0=(W-bw)/2, fzF=Dp/2-(bz+bd/2), fzB=Dp/2+(bz-bd/2);
        const tl=fbox(fx0,topT,Dp,FMAT.wood); tl.position.set(-(W-fx0)/2,topY,0); g.add(tl);
        const tr=fbox(fx0,topT,Dp,FMAT.wood); tr.position.set((W-fx0)/2,topY,0); g.add(tr);
        const tf=fbox(bw,topT,fzF,FMAT.wood); tf.position.set(0,topY,bz+bd/2+fzF/2); g.add(tf);
        const tb=fbox(bw,topT,fzB,FMAT.wood); tb.position.set(0,topY,bz-bd/2-fzB/2); g.add(tb);
        const rimN=0.03;
        [ [ (bw-rimN)/2,0,rimN,bd], [-(bw-rimN)/2,0,rimN,bd] ].forEach(function(s){ const wl=fbox(s[2],bh,s[3],FMAT.steel); wl.position.set(s[0],topY-bh/2,bz+s[1]); g.add(wl); });
        [ [0,(bd-rimN)/2,bw,rimN], [0,-(bd-rimN)/2,bw,rimN] ].forEach(function(s){ const wl=fbox(s[2],bh,s[3],FMAT.steel); wl.position.set(s[0],topY-bh/2,bz+s[1]); g.add(wl); });
        const bfloor=fbox(bw,0.02,bd,FMAT.steel); bfloor.position.set(0,topY-bh,bz); g.add(bfloor);
        const fbaseF=fcyl(0.03,0.06,FMAT.metal,10); fbaseF.position.set(0,0.915,-Dp/2+0.10); g.add(fbaseF);
        const neck=fcyl(0.02,0.24,FMAT.metal,10); neck.position.set(0,1.05,-Dp/2+0.10); g.add(neck);
        const spout=fcyl(0.018,0.16,FMAT.metal,10); spout.rotation.x=Math.PI/2.2; spout.position.set(0,1.15,-Dp/2+0.18); g.add(spout); break; }
      case 'toilet': toiletMesh(g,W,Dp); break;   // Q4: klasik klozet (rezervuar+oval çanak+pedestal)
      // M2: LAVABO — tezgah/kabin AYNEN (dolap gövdesi) + tezgah üstü ÇANAK artık basık silindir (düz dikdörtgen "top" DEĞİL)
      //   + içi hafif çukur imi + batarya. Kabin/tezgah dış boyutları (W×Dp) DEĞİŞMEDİ (furnFits/SAT etkilenmez).
      case 'washbasin': { const cab=fbox(W,0.72,Dp,FMAT.panel); cab.position.y=0.36; g.add(cab);
        const top=fbox(W,0.05,Dp,FMAT.porcelain); top.position.y=0.745; g.add(top);            // ince tezgah üstü (çanağın oturduğu zemin)
        basinBowlMesh(g,Math.min(W*0.62,0.50),Math.min(Dp*0.8,0.40),0.795); break; }
      // M2: KÜVET — dış gövde/İÇ oyuk çukur/kenar bordürü/batarya (bathtubMesh); dış boyut W×Dp×h DEĞİŞMEDİ.
      case 'bathtub': bathtubMesh(g,W,Dp,D.h); break;
      case 'shower_tray': {   // köşe duş kabini — kapalı cam kutu, TEK açıklık = ön kapı (odaya bakar). Arka cam DUVARA FLUSH.
        // Q5: cam saydam → uzaktan "cam kutu" belirsizdi; ön dikey + üst METAL ÇERÇEVE + duş başlığı + gider ekle → duş kabini okunur.
        const sm=0.05, w2=Math.max(0.4,W-2*sm), gh=2.0, gt=0.02, ft=0.03;
        const dBack=-Dp/2+0.03, dFront=Dp/2-0.02, d2=dFront-dBack, dc=(dFront+dBack)/2;
        const tr=fbox(w2,0.10,d2,FMAT.white); tr.position.set(0,0.05,dc); g.add(tr);                           // tekne (yanlar inset, arka flush)
        const drain=fcyl(0.05,0.012,FMAT.steel,12); drain.position.set(0,0.106,dc); g.add(drain);             // gider ızgarası (tekne okunur)
        const back=fbox(w2,gh,gt,FMAT.glass); back.position.set(0,gh/2,dBack); g.add(back);                    // ARKA cam (duvara flush)
        [-1,1].forEach(function(sx){ const sp=fbox(gt,gh,d2,FMAT.glass); sp.position.set(sx*w2/2,gh/2,dc); g.add(sp);        // iki YAN cam
          const fr=fbox(ft,gh,ft,FMAT.steel); fr.position.set(sx*w2/2,gh/2,dFront); g.add(fr); });             // ön dikey metal çerçeve (cam sınırı okunur)
        const topFr=fbox(w2,ft,ft,FMAT.steel); topFr.position.set(0,gh,dFront); g.add(topFr);                  // üst çerçeve
        const dw=w2*0.5, fr=fbox(dw,gh,gt,FMAT.glass); fr.position.set(-(w2-dw)/2,gh/2,dFront); g.add(fr);      // ÖN yarım cam kapı; kalan açıklık = TEK GİRİŞ
        const head=fcyl(0.08,0.03,FMAT.steel,16); head.position.set(w2*0.3,gh-0.25,dBack+0.10); g.add(head);   // duş başlığı (tavana yakın)
        const harm=fcyl(0.012,0.20,FMAT.steel,8); harm.rotation.z=Math.PI/2.5; harm.position.set(w2*0.36,gh-0.12,dBack+0.06); g.add(harm);   // başlık kolu
        break; }
      case 'shoe_cabinet': cabinetMesh(g,W,Dp,D.h,FMAT.cabinet,Math.max(1,Math.round(W/0.5))); break;   // C3-5: açık ahşap dolap
      case 'coat_rack': { const post=fbox(0.06,D.h,0.06,FMAT.woodDark); post.position.y=D.h/2; g.add(post); const base=fbox(W,0.04,Dp,FMAT.woodDark); base.position.y=0.02; g.add(base);
        [0.3,-0.3].forEach(function(s){ const arm=fbox(0.04,0.04,0.22,FMAT.metal); arm.position.set(0,D.h-0.1,s); g.add(arm);}); break; }
      case 'desk': { const tp=fbox(W,0.05,Dp,FMAT.wood); tp.position.y=0.74; g.add(tp); const ped=fbox(0.42,0.68,Dp-0.06,FMAT.panel); ped.position.set(W/2-0.23,0.36,0); g.add(ped); legsAt(g,W,Dp,0.715,0.715,FMAT.woodDark,0.05); break; }
      case 'office_chair': { const se=fbox(W*0.8,0.08,Dp*0.8,FMAT.dark); se.position.y=0.48; g.add(se); const bk=fbox(W*0.75,0.45,0.06,FMAT.dark); bk.position.set(0,0.72,-Dp/2+0.1); g.add(bk); const col=fcyl(0.03,0.40,FMAT.metal,8); col.position.y=0.24; g.add(col); const ft=fcyl(0.28,0.04,FMAT.dark,5); ft.position.y=0.04; g.add(ft); break; }
      case 'plant': plantMesh(g,D.h); break;
      default: { const r=fbox(W,0.6,Dp,FMAT.wood); r.position.y=0.3; g.add(r); }
    }
    return g;
  }
  // eski mobilya mesh'ini GPU'dan bırak — AMA paylaşılan FMAT malzemesini DEĞİL (yalnız per-instance
  // geometri + aktif-vurgu için klonlanan malzeme). disposeGizmo'yu kullansak FMAT'ı bozardık.
  function disposeFurn(o){ if(o.traverse) o.traverse(function(n){
    if(n.geometry) n.geometry.dispose();
    if(n.material && FMAT_SET && !FMAT_SET.has(n.material)){
      (Array.isArray(n.material)?n.material:[n.material]).forEach(function(m){ if(m&&m.dispose) m.dispose(); }); }
  }); }
  // A8: geri yüklenen mobilyayı odasına sığmıyorsa ele (plan düzenlenince pozisyonel room_id kayabilir → taşma önle)
  function furnPruneInvalid(map){
    if(!map) return;
    furnAllRooms(map).forEach(function(r){ if(!r.furniture||!r.furniture.length) return;
      const an=furnAnalyzeRoom(r, map); if(!an) return;
      r.furniture=r.furniture.filter(function(f){ if(!f||!f.pos) return false;
        const dim=FURN_DIM[f.type]||{w:0.6,d:0.6}, w=(f.__w!=null?f.__w:dim.w), d=(f.__d!=null?f.__d:dim.d);
        return furnRectInPoly(furnFootprintM(f.pos.x,f.pos.z,f.rot_deg,w,d), an.poly); });
    });
  }
  // map'teki tüm room.furniture[]'ı düz furnList'e topla (units rooms + common_areas)
  function collectFurnList(){
    furnList=[];
    const map=scene&&scene.__map; if(!map) return;
    (map.units||[]).forEach(function(u){ (u.rooms||[]).forEach(function(r){ (r.furniture||[]).forEach(function(f){ furnList.push(f); }); }); });
    (map.common_areas||[]).forEach(function(r){ (r.furniture||[]).forEach(function(f){ furnList.push(f); }); });
  }
  // furnList → __furnitureGroup mesh'leri (renderCamGizmos ikizi). Her render'da eski mesh bırakılır.
  function renderFurniture(){
    if(!scene||!scene.__furnitureGroup) return;
    ensureFMAT();
    const G=scene.__furnitureGroup;
    while(G.children.length){ const ch=G.children[0]; disposeFurn(ch); G.remove(ch); }
    furnList.forEach(function(f,i){
      if(!f||!f.pos) return;
      const grp=buildFurnMesh(f);
      grp.position.set(f.pos.x, 0, f.pos.z);                      // pos MUTLAK metre; grup -cx,-cz ofsetli → zeminle aynı yer
      grp.rotation.y=(f.rot_deg||0)*Math.PI/180;
      if(f.scale&&f.scale!==1) grp.scale.setScalar(f.scale);
      const active=(i===activeFurnIdx);
      grp.traverse(function(o){
        o.userData.furnIdx=i; o.userData.furnType=f.type;
        if(o.isMesh){ o.castShadow=true; o.receiveShadow=true;
          if(active && o.material){ o.material=o.material.clone(); o.material.emissive=new THREE.Color(0x402a08); } }   // aktif = turuncu kor
      });
      G.add(grp);
    });
  }

  /* ====================== MOBİLYA — manuel düzenleyici (Faz 2; kamera CRUD ikizi) ======================
     furnList = render listesi; room.furniture[] = tek kaynak (cameraViewInfo + kalıcılık oradan okur).
     Ekle/sil/taşı HER İKİSİNİ senkron tutar (attach/detachFurnToMap). pos MUTLAK metre: raycast noktası
     (merkezlenmiş dünya) → +scene.__cx/__cz. furnMode ↔ placeMode (kamera) DIŞLAYAN: ikisi aynı anda olmaz. */
  let furnSeq=0;
  function newFurnId(type, roomId){ furnSeq++; return (roomId||'F')+'-'+type+'-'+furnSeq; }
  function furnIdxFromObj(o){ while(o){ if(o.userData&&o.userData.furnIdx!=null) return o.userData.furnIdx; o=o.parent; } return -1; }
  function furnPip(x,y,poly){ let c=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){ const a=poly[i],b=poly[j];
    if(((a[1]>y)!==(b[1]>y)) && (x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])) c=!c; } return c; }
  // merkezlenmiş dünya raycast noktası → render-px → hangi oda? (worldToPx = +cx,+cz; cameraViewInfo ile aynı uzay)
  function roomIdAtPoint(p){
    const map=scene&&scene.__map; if(!map) return null;
    const px=worldToPx(map,p.x,p.z); let found=null;
    function test(r){ if(found||!r.polygon_px||r.polygon_px.length<3) return; if(furnPip(px[0],px[1],r.polygon_px)) found=r.id; }
    (map.units||[]).forEach(function(u){ (u.rooms||[]).forEach(test); }); (map.common_areas||[]).forEach(test);
    return found;
  }
  function furnRoomById(roomId){
    const map=scene&&scene.__map; if(!map||!roomId) return null; let hit=null;
    (map.units||[]).forEach(function(u){ (u.rooms||[]).forEach(function(r){ if(r.id===roomId) hit=r; }); });
    (map.common_areas||[]).forEach(function(r){ if(r.id===roomId) hit=r; }); return hit;
  }
  function attachFurnToMap(f){ const r=furnRoomById(f&&f.room_id); if(r){ (r.furniture=r.furniture||[]).push(f); } }
  function detachFurnFromMap(f){ const r=furnRoomById(f&&f.room_id); if(r&&r.furniture){ const k=r.furniture.indexOf(f); if(k>=0) r.furniture.splice(k,1); } }

  function selectFurn(i){
    if(i<0||i>=furnList.length){ activeFurnIdx=-1; renderFurniture(); applyFurnModeUI(); return; }
    activeFurnIdx=i;
    if(furnMode && furnAction==='add') furnAction='move';   // seçince düzenlemeye geç
    const f=furnList[i];
    renderFurniture(); applyFurnModeUI();
    focusFurn(i);                                            // A3: seçince hedefi mobilyaya kısa tween'le kaydır (mesafe sabit)
    setFurnHint((FURN_TR[f.type]||f.type)+' seçili · Taşı / döndür / tip / sil · F odakla');
  }
  function removeFurn(i){
    if(i<0||i>=furnList.length) return; furnSnapshot();
    detachFurnFromMap(furnList[i]); furnList.splice(i,1);
    if(i<activeFurnIdx) activeFurnIdx--;
    else if(i===activeFurnIdx) activeFurnIdx=Math.min(i,furnList.length-1);
    renderFurniture(); applyFurnModeUI(); persistFurniture();
    setFurnHint(furnList.length?('Silindi · '+furnList.length+' mobilya'):'Mobilya kalmadı');
  }
  function clearFurn(){
    const map=scene&&scene.__map; furnSnapshot();
    if(map){ (map.units||[]).forEach(function(u){ (u.rooms||[]).forEach(function(r){ r.furniture=[]; }); }); (map.common_areas||[]).forEach(function(r){ r.furniture=[]; }); }
    furnList=[]; activeFurnIdx=-1;
    renderFurniture(); applyFurnModeUI(); persistFurniture(); setFurnHint('Tüm mobilya silindi');
  }
  function rotateFurn(deg){
    if(activeFurnIdx<0){ setFurnHint('Önce bir mobilya seç.'); return; }
    const f=furnList[activeFurnIdx];
    f.rot_deg=((((f.rot_deg||0)+deg)%360)+360)%360; f.source='manual'; f.locked=true;
    renderFurniture(); persistFurniture(); setFurnHint((FURN_TR[f.type]||f.type)+' → '+f.rot_deg+'°');
  }
  // B2-1: palet parça tipini değiştir. Seçili mobilya varsa TİPİNİ değiştirir; yoksa HAYALET yerleştirme başlar.
  // B2 modeli: mobilya grubu AÇIK = furnMode AÇIK (sahne mobilyası tıklanır/sürüklenir). Ayrı "düzenlemeyi aç"
  //   toggle YOK — grup açık olması yeter. Ekleme yolu = palet küçük-resmi → hayalet (startFurnGhost).
  function setFurnMode(on){
    furnMode=!!on;
    if(furnMode){ setPlaceMode(false); furnAction='move'; }                              // kamera yerleştirmeyi kapat (dışlayan)
    else { cancelFurnGhost(); activeFurnIdx=-1; }                                          // B2-4: mod kapanınca hayalet+seçim temizlenir
    if(controls) controls.enabled=!placeMode;                                            // mobilya modu orbit'i KİLİTLEMEZ (yalnız sürükle sırasında)
    renderFurniture(); applyFurnModeUI();
    setFurnHint(furnMode ? 'Mobilyaya tıkla = seç · sürükle = taşı · boş zeminde sürükle = kaydır' : 'Düzenleme kapalı');
  }
  function setFurnUI(on){
    furnUIEnabled=!!on;
    if(!furnUIEnabled){ if(activeGroup==='furniture') activeGroup='view'; setFurnMode(false); }
    else syncFurnModeToGroup();                                                           // grup 'furniture' ise düzenleme AÇIK, değilse KAPALI (B2)
    renderRail(); renderDrawer();
  }
  // B2: mobilya düzenleme (furnMode) = "mobilya grubu aktif mi" ile eşitlenir. Ayrı toggle yok.
  //   Grup değişince (setGroup/setCamUI/renderDrawer) çağrılır → mobilya grubuna girince sahne mobilyası tıklanır/sürüklenir.
  function syncFurnModeToGroup(){
    const want=(activeGroup==='furniture' && furnUIEnabled);
    if(want!==furnMode) setFurnMode(want);
  }
  function applyFurnModeUI(){ if(!overlay) return; updateFurnBar(); syncFurnBtns(); }
  function syncFurnBtns(){ if(!overlay) return; syncFurnTypeBtns(); updateFurnPanel(); }
  // palet küçük-resimlerinden aktif tipi (hayalet ya da seçili) işaretle
  function syncFurnTypeBtns(){
    if(!overlay) return;
    const sel = activeFurnIdx>=0 ? (furnList[activeFurnIdx]||{}).type : (furnGhost?furnGhost.type:null);
    overlay.querySelectorAll('#v3dFurnDock .pit').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-furnpick')===sel); });
  }
  // ── B2-1: MOBİLYA DOCK (kamera dock ikizi) — kategori sekmeleri + kuşbakışı küçük-resim paleti ──
  function renderFurnDock(){
    const dk=overlay&&overlay.querySelector('#v3dFurnDock'); if(!dk) return;
    if(!furnUIEnabled){ dk.style.display='none'; dk.innerHTML=''; return; }
    dk.style.display='block';
    if(furnDockCat<0||furnDockCat>=FURN_PALETTE.length) furnDockCat=0;
    const cats=FURN_PALETTE.map(function(c,i){ return '<button data-furncat="'+i+'" class="cat'+(i===furnDockCat?' on':'')+'">'+c.g+'</button>'; }).join('');
    const items=FURN_PALETTE[furnDockCat].items.map(function(t){
      return '<button data-furnpick="'+t+'" class="pit" title="'+FURN_TR[t]+' — tıkla, sonra zeminde yerleştir">'+
        furnThumb(t)+'<span class="pn">'+FURN_TR[t]+'</span></button>'; }).join('');
    let html='<div class="dk">';
    // sütun 1: kategori sekmeleri
    html+='<div class="col"><div class="lbl">Kategori</div><div class="cats">'+cats+'</div></div>';
    html+='<div class="sep"></div>';
    // sütun 2: seçili kategorinin parçaları (kuşbakışı küçük-resim + ad) — U4: TEK yatay satır (kaydırılır, katlanmaz)
    html+='<div class="col"><div class="lbl">Parça — tıkla, sonra zemine tıkla</div><div class="palwrap"><div class="palgrid">'+items+'</div></div></div>';
    html+='<div class="sep"></div>';
    // sütun 3: otomatik döşe + render on/off + hint + tümünü temizle
    html+='<div class="col" style="max-width:190px">'+
      '<div class="lbl">Otomatik</div>'+
      '<div class="row seg">'+
        '<button data-v3d="furnauto" class="green'+(furnList.length?' on':'')+'" style="background:#7bbf8a;color:#13201a">'+ic('bolt',12)+'Yeniden döşe</button>'+
        '<button data-v3d="furnclear">Temizle</button>'+
      '</div>'+
      '<label class="chk" title="3B render (nano) mobilyalı mı boş mu olsun"><input type="checkbox" data-v3d="furnrender" id="v3dFurnRender" '+(furnList.length?'checked':'')+'>Render\'a mobilya ekle</label>'+
      '<div id="v3dFurnHint" style="font-size:10.5px;opacity:.72;min-height:26px;max-width:190px;line-height:1.35"></div>'+
    '</div>';
    html+='</div>';
    dk.innerHTML=html;
    setFurnHint(lastFurnHint); syncFurnTypeBtns();
  }
  // B2: dock render on/off çipini sahne durumuyla eşle + mini araç çubuğunu tazele + palet vurgusu
  function updateFurnPanel(){
    if(!overlay) return;
    const rc=overlay.querySelector('#v3dFurnRender'); if(rc) rc.checked=furnList.length>0;
    const au=overlay.querySelector('#v3dFurnDock [data-v3d="furnauto"]'); if(au) au.classList.toggle('on',furnList.length>0);
    updateFurnBar(); syncFurnTypeBtns();
  }
  function setFurnHint(t){ lastFurnHint=t||''; const h=overlay&&overlay.querySelector('#v3dFurnHint'); if(h) h.textContent=lastFurnHint; }

  /* ====================== MALZEME — UI (dock + oda-seç + swatch uygula) — mobilya dock deseninin ikizi ====================== */
  // ıslak hacim (banyo/wc) → seramik zemin öncelikli (M2). fpRoomEnum konvansiyonu (io.js) ile tutarlı okur.
  function isWetRoom(r){ const t=((r&&(r.type||r.type_tr||r.name||''))+'').toLowerCase(); return /bath|banyo|wc|ıslak|islak/.test(t); }
  function setMatHint(t){ lastMatHint=t||''; const h=overlay&&overlay.querySelector('#v3dMatHint'); if(h) h.textContent=lastMatHint; }
  function setMatUI(on){
    matUIEnabled=!!on;
    if(!matUIEnabled){ if(activeGroup==='material') activeGroup='view'; matSelRoom=null; }
    renderRail(); renderDrawer();
  }
  // seçili oda → swatch uygula: yalnız O ODANIN zemin/duvar malzemesini değiştirir (M3), sahneyi tazeler (M4).
  function applyMaterial(slot, key){
    if(!matSelRoom){ setMatHint('Önce bir oda seç (mesh\'te odaya tıkla).'); return; }
    const cur=materialOverrides[matSelRoom]||{floor:null,wall:null};
    cur[slot]=(cur[slot]===key?null:key);   // aynı swatch'a tekrar tıkla = kaldır (renk-koda dön)
    materialOverrides[matSelRoom]=cur;
    if(!cur.floor && !cur.wall) delete materialOverrides[matSelRoom];
    persistMaterials(); rebuildKeepView();
    renderMatDock();
    const p=MAT_BY_KEY[key];
    setMatHint(p ? (p.name+' uygulandı ('+(slot==='floor'?'zemin':'duvar')+')') : 'Varsayılana döndürüldü');
  }
  function resetRoomMaterial(){
    if(!matSelRoom){ setMatHint('Önce bir oda seç.'); return; }
    delete materialOverrides[matSelRoom];
    persistMaterials(); rebuildKeepView(); renderMatDock();
    setMatHint('Oda renk-kodlu varsayılana döndürüldü.');
  }
  // R2: ODA TÜRÜNE GÖRE OTOMATİK ATA — tek tıkla tüm odalara tutarlı set. roomKind → zemin/duvar preset'i.
  //   salon=Açık Meşe · yataklar=Koyu Ceviz · antre/koridor=Gri Meşe · banyo/wc=Beyaz Seramik · mutfak=Bej Seramik;
  //   duvarlar HEP Kırık Beyaz (banyo dahil, sade). Mevcut applyMaterial mekanizması (materialOverrides) toplu set edilir.
  //   yerleşemeyen tipler (çekirdek/depo=skip, balkon, çalışma vs.) DOKUNULMAZ → renk-kodlu kalır.
  const MAT_FLOOR_BY_KIND = { living:'parke_mese', living_kitchen:'parke_mese', studio:'parke_mese',
    bedroom:'parke_ceviz', master:'parke_ceviz', entry:'parke_gri', corridor:'parke_gri',
    bathroom:'seramik_beyaz', wc:'seramik_beyaz', kitchen:'seramik_bej' };
  function applyMaterialsByType(){
    const map=scene&&scene.__map; if(!map){ setMatHint('Plan yok.'); return; }
    let n=0;
    furnAllRooms(map).forEach(function(r){
      const floor=MAT_FLOOR_BY_KIND[roomKind(r)]; if(!floor) return;              // eşleşmeyen tip → dokunma
      materialOverrides[r.id]={ floor:floor, wall:'boya_krikbeyaz' }; n++;
    });
    persistMaterials(); rebuildKeepView(); renderMatDock();
    setMatHint(n+' odaya tür-bazlı malzeme atandı.');
  }
  function resetAllMaterials(){
    materialOverrides={}; matSelRoom=null;
    persistMaterials(); rebuildKeepView(); renderMatDock();
    setMatHint('Tüm odalar renk-koda döndürüldü.');
  }
  // sahneyi yeniden kur ama mevcut kamera açısını KORU (buildScene sonunda setView('iso') var → view kaydet/geri yükle).
  function rebuildKeepView(){
    const map=scene&&scene.__map; if(!map) return;
    const v=getView();
    buildScene(map);
    if(v) restoreView(v);
  }
  // mesh'te odaya tıkla → seç (scenePick material dalı bunu çağırır). floor mesh userData.roomRef taşır.
  function selectMatRoom(roomId){
    matSelRoom=roomId||null; renderMatDock();
    const r=furnRoomById(roomId); setMatHint(r? ((r.name||roomId)+' seçildi · aşağıdan malzeme seç') : 'Oda seç');
  }
  function renderMatDock(){
    const dk=overlay&&overlay.querySelector('#v3dMatDock'); if(!dk) return;
    if(!matUIEnabled){ dk.style.display='none'; dk.innerHTML=''; return; }
    dk.style.display='block';
    const r=furnRoomById(matSelRoom);
    const sel=materialOverrides[matSelRoom]||{};
    const wet=r&&isWetRoom(r);
    // zemin swatch'ları: ıslak hacimde SERAMİK önce, kuru hacimde PARKE önce (M2)
    let floors=MAT_PRESETS.filter(function(p){ return p.group==='floor'; });
    if(wet) floors=floors.slice().sort(function(a,b){ return (a.cls==='seramik'?0:1)-(b.cls==='seramik'?0:1); });
    const walls=MAT_PRESETS.filter(function(p){ return p.group==='wall'; });
    // R3: swatch = sadece renk karesi (tek satır sığsın); isim tooltip'te.
    function swatch(p, slot, active){
      return '<button data-matslot="'+slot+'" data-matkey="'+p.key+'" class="sw'+(active?' on':'')+'" title="'+p.name+'">'+
        '<span class="chip" style="background:'+matSwatchCss(p)+'"></span></button>';
    }
    // R3: TEK yatay satır. Global düğmeler (Türe göre ata / Tümünü sıfırla) HEP görünür; oda seçilince swatch grupları eklenir.
    let html='<div class="dk">';
    if(r){
      html+='<span class="roomtag">'+(r.name||r.id)+'</span>'+(wet?'<span class="wet">ıslak</span>':'')+
        '<div class="sep"></div>'+
        '<div class="grp"><span class="lbl">Zemin</span><div class="sws">'+floors.map(function(p){ return swatch(p,'floor',sel.floor===p.key); }).join('')+'</div></div>'+
        '<div class="sep"></div>'+
        '<div class="grp"><span class="lbl">Duvar</span><div class="sws">'+walls.map(function(p){ return swatch(p,'wall',sel.wall===p.key); }).join('')+'</div></div>'+
        '<div class="sep"></div>'+
        '<button class="reset" data-v3d="matreset">Varsayılana dön</button>';
    } else {
      html+='<span class="hint">Mesh\'te odaya tıkla</span><div class="sep"></div>';
    }
    html+='<button class="reset" data-v3d="matauto" title="Oda türüne göre tüm odalara tutarlı malzeme">Türe göre ata</button>'+
      '<button class="reset" data-v3d="matresetall" title="Tüm odaları renk-koda döndür">Tümünü sıfırla</button>';
    html+='</div>';
    dk.innerHTML=html;
  }

  /* ====================== MOBİLYA — otomatik yerleşim (Faz 3; kural-tabanlı + override) ======================
     v1 bbox + "en uzun duvar" varsayımı. Eğik/L odada taşabilir (v1 kabul). pos MUTLAK metre, source:'auto'.
     OVERRIDE: locked:true (elle düzenlenen) KORUNUR; auto onunla çakışırsa elenir. */
  // tip → ayak izi {w,d} (rot 0; X=w, Z=d) — buildFurnMesh boyutlarıyla TUTARLI (Faz 5 furnToPolygonPx de okur).
  // tip → ayak izi {w,d,h} metre (TR perakende + NKBA/Dimensions doğrulamalı spec). rot 0: X=w, Z=d, +Z ön.
  const FURN_DIM = {
    sofa_2:{w:1.60,d:0.95,h:0.85}, sofa_3:{w:2.10,d:0.95,h:0.85}, sectional_l:{w:2.60,d:2.10,h:0.85},
    armchair:{w:0.90,d:0.90,h:0.85}, pouf:{w:0.55,d:0.55,h:0.42}, coffee_table:{w:1.00,d:0.55,h:0.42},
    side_table:{w:0.45,d:0.45,h:0.55}, tv_unit:{w:1.60,d:0.45,h:0.50}, tv:{w:1.40,d:0.08,h:0.80},
    bookcase:{w:0.90,d:0.35,h:1.95}, console:{w:1.10,d:0.37,h:0.80}, rug:{w:2.40,d:1.60,h:0.02},
    dining_table_4:{w:1.20,d:0.80,h:0.76}, dining_table_6:{w:1.60,d:0.90,h:0.76}, dining_chair:{w:0.45,d:0.50,h:0.90}, sideboard:{w:1.60,d:0.45,h:0.85},
    bed_single:{w:0.97,d:1.91,h:0.50}, bed_double:{w:1.50,d:2.00,h:0.50}, bed_queen:{w:1.60,d:2.00,h:0.50}, bed_king:{w:1.80,d:2.00,h:0.50},
    nightstand:{w:0.45,d:0.40,h:0.50}, wardrobe_2:{w:1.00,d:0.60,h:2.10}, wardrobe_3:{w:1.50,d:0.60,h:2.10}, wardrobe_4:{w:2.00,d:0.60,h:2.10},
    dresser:{w:1.00,d:0.50,h:0.85}, vanity:{w:1.20,d:0.45,h:0.78}, bench:{w:1.20,d:0.40,h:0.45},
    counter:{w:0.60,d:0.60,h:0.90}, island:{w:1.20,d:0.90,h:0.90}, fridge:{w:0.70,d:0.70,h:1.85}, oven_hob:{w:0.60,d:0.60,h:0.90},
    dishwasher:{w:0.60,d:0.60,h:0.85}, sink:{w:0.60,d:0.60,h:0.90},
    toilet:{w:0.37,d:0.60,h:0.78}, washbasin:{w:0.60,d:0.45,h:0.85}, bathtub:{w:1.70,d:0.75,h:0.55}, shower_tray:{w:0.90,d:0.90,h:0.10}, washer:{w:0.60,d:0.60,h:0.85},
    shoe_cabinet:{w:0.90,d:0.37,h:1.05}, coat_rack:{w:1.10,d:0.37,h:2.05}, desk:{w:1.20,d:0.60,h:0.74}, office_chair:{w:0.60,d:0.60,h:1.00},
    plant:{w:0.40,d:0.40,h:1.20}, bistro_table:{w:0.60,d:0.60,h:0.72}, bistro_chair:{w:0.45,d:0.45,h:0.85}
  };

  /* ====================== MOBİLYA — geometri/yerleşim çekirdeği (v2 mantık-tabanlı) ======================
     SAF GEOMETRİ (metre uzayı). Mantık programları (computeAutoFurniture v2) bunun üstüne oturur.
     Amaç: HİÇBİR mobilya oda sınırını aşmaz, kapıyı kapatmaz, üst üste binmez (boyut-farkında). */
  function polyAreaSignedM(poly){ let a=0; for(let i=0,j=poly.length-1;i<poly.length;j=i++) a+=(poly[j][0]*poly[i][1]-poly[i][0]*poly[j][1]); return a/2; }
  function pointInPolyM(x,z,poly){ let c=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){ const a=poly[i],b=poly[j];
    if(((a[1]>z)!==(b[1]>z)) && (x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])) c=!c; } return c; }
  function furnRoomPolyM(room, map){
    if(!room||!room.polygon_px||room.polygon_px.length<3) return null;
    if(!room.__polyM) room.__polyM=room.polygon_px.map(function(p){ return px2m(map,p[0],p[1]); });
    return room.__polyM;
  }
  function furnAllRooms(map){ const rs=[]; (map.units||[]).forEach(function(u){ (u.rooms||[]).forEach(function(r){ rs.push(r); }); }); (map.common_areas||[]).forEach(function(r){ rs.push(r); }); return rs; }
  // ayak izi 4 köşe (metre) — Three.js rotation.y konvansiyonu (renderFurniture/furnToPolygonPx ile aynı)
  function furnFootprintM(x,z,rotDeg,w,d){
    const a=(rotDeg||0)*Math.PI/180, ca=Math.cos(a), sa=Math.sin(a), hw=w/2, hd=d/2;
    return [[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd]].map(function(c){ return [x + c[0]*ca + c[1]*sa, z - c[0]*sa + c[1]*ca]; });
  }
  // dikdörtgen TAMAMEN poligon içinde mi (köşeler + kenar-orta + merkez örnekleri → iç bükey girintiyi yakalar)
  function segIntersect(a,b,c,d){ function ccw(p,q,r){ return (r[1]-p[1])*(q[0]-p[0]) > (q[1]-p[1])*(r[0]-p[0]); }
    return ccw(a,c,d)!==ccw(b,c,d) && ccw(a,b,c)!==ccw(a,b,d); }
  function furnRectInPoly(corners, poly){
    let cx=0,cz=0;
    for(let i=0;i<corners.length;i++){ cx+=corners[i][0]; cz+=corners[i][1];
      if(!pointInPolyM(corners[i][0],corners[i][1],poly)) return false;
      const n=corners[(i+1)%corners.length];
      if(!pointInPolyM((corners[i][0]+n[0])/2,(corners[i][1]+n[1])/2,poly)) return false;
    }
    if(!pointInPolyM(cx/corners.length, cz/corners.length, poly)) return false;
    // A6: ayak izi kenarı bir oda kenarını KESİYOR mu (köşeler içeride ama ince girinti/kolon ortadan geçiyor olabilir)
    for(let i=0;i<corners.length;i++){ const a=corners[i], b=corners[(i+1)%corners.length];
      for(let j=0;j<poly.length;j++){ const c=poly[j], d=poly[(j+1)%poly.length];
        if(segIntersect(a,b,c,d)) return false; } }
    return true;
  }
  // iki konveks dörtgen çakışıyor mu (Ayırıcı Eksen Teoremi)
  function furnRectsOverlap(A, B){
    const both=[A,B];
    for(let p=0;p<2;p++){ const poly=both[p];
      for(let i=0;i<poly.length;i++){ const j=(i+1)%poly.length;
        const nx=-(poly[j][1]-poly[i][1]), nz=(poly[j][0]-poly[i][0]);
        let minA=1e9,maxA=-1e9,minB=1e9,maxB=-1e9;
        A.forEach(function(q){ const dd=q[0]*nx+q[1]*nz; if(dd<minA)minA=dd; if(dd>maxA)maxA=dd; });
        B.forEach(function(q){ const dd=q[0]*nx+q[1]*nz; if(dd<minB)minB=dd; if(dd>maxB)maxB=dd; });
        if(maxA<minB-1e-6 || maxB<minA-1e-6) return false;   // ayırıcı eksen → çakışma yok
      } }
    return true;
  }
  // oda → kenar analizi: her duvar kenarı {len, dir, iç-normal, dış-cephe mi, kapı açıklıkları}
  function furnAnalyzeRoom(room, map){
    if(room.__an) return room.__an;                 // oda geometrisi statik → önbellekle (sürükle her karede ucuz)
    const poly=furnRoomPolyM(room,map); if(!poly) return null;
    const allRooms=furnAllRooms(map);
    const doorsM=(map.doors||[]).map(function(d){ return { a:px2m(map,d.p0_px[0],d.p0_px[1]), b:px2m(map,d.p1_px[0],d.p1_px[1]) }; });
    // W3: pencere segmentleri (metre) — cephe pencere span'ları yüksek mobilya için yasak bölge kaynağı.
    const winsM=(map.windows||[]).map(function(d){ return { a:px2m(map,d.p0_px[0],d.p0_px[1]), b:px2m(map,d.p1_px[0],d.p1_px[1]), full:!!d.full }; });
    let minX=1e9,minZ=1e9,maxX=-1e9,maxZ=-1e9;
    poly.forEach(function(p){ if(p[0]<minX)minX=p[0]; if(p[0]>maxX)maxX=p[0]; if(p[1]<minZ)minZ=p[1]; if(p[1]>maxZ)maxZ=p[1]; });
    const edges=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i], b=poly[(i+1)%poly.length];
      const dx=b[0]-a[0], dz=b[1]-a[1], len=Math.hypot(dx,dz);
      if(len<0.2) continue;
      const ux=dx/len, uz=dz/len, mx=(a[0]+b[0])/2, mz=(a[1]+b[1])/2;
      let nx=-uz, nz=ux;                                                  // iç normal (probe ile yön doğrula)
      if(!pointInPolyM(mx+nx*0.06, mz+nz*0.06, poly)){ nx=-nx; nz=-nz; }
      const ox=mx-nx*0.4, oz=mz-nz*0.4;                                   // dış probe: hiçbir odada değilse dış cephe (pencere adayı)
      let exterior=true;
      for(let k=0;k<allRooms.length;k++){ if(allRooms[k]===room) continue; const rp=furnRoomPolyM(allRooms[k],map); if(rp && pointInPolyM(ox,oz,rp)){ exterior=false; break; } }
      const doorSpans=[];
      doorsM.forEach(function(dr){
        const t0=(dr.a[0]-a[0])*ux+(dr.a[1]-a[1])*uz, e0=Math.abs((dr.a[0]-a[0])*(-uz)+(dr.a[1]-a[1])*ux);
        const t1=(dr.b[0]-a[0])*ux+(dr.b[1]-a[1])*uz, e1=Math.abs((dr.b[0]-a[0])*(-uz)+(dr.b[1]-a[1])*ux);
        if(e0<0.3 && e1<0.3){ const s0=Math.max(0,Math.min(t0,t1)), s1=Math.min(len,Math.max(t0,t1)); if(s1-s0>0.25) doorSpans.push([s0,s1]); }
      });
      // W3: bu kenar üzerindeki pencere span'ları ([s0,s1,full]) — kenar doğrultusuna denk gelenler.
      const winSpans=[];
      winsM.forEach(function(wn){
        const t0=(wn.a[0]-a[0])*ux+(wn.a[1]-a[1])*uz, e0=Math.abs((wn.a[0]-a[0])*(-uz)+(wn.a[1]-a[1])*ux);
        const t1=(wn.b[0]-a[0])*ux+(wn.b[1]-a[1])*uz, e1=Math.abs((wn.b[0]-a[0])*(-uz)+(wn.b[1]-a[1])*ux);
        if(e0<0.3 && e1<0.3){ const s0=Math.max(0,Math.min(t0,t1)), s1=Math.min(len,Math.max(t0,t1)); if(s1-s0>0.25) winSpans.push([s0,s1,wn.full]); }
      });
      edges.push({ a:a, b:b, len:len, dir:[ux,uz], nIn:[nx,nz], mid:[mx,mz], exterior:exterior, doorSpans:doorSpans, winSpans:winSpans });
    }
    edges.sort(function(p,q){ return q.len-p.len; });                     // uzun duvar önce (çapa mobilyası için)
    room.__an = { room:room, poly:poly, area:Math.abs(polyAreaSignedM(poly)),
      bbox:{minX:minX,minZ:minZ,maxX:maxX,maxZ:maxZ,w:maxX-minX,d:maxZ-minZ,cx:(minX+maxX)/2,cz:(minZ+maxZ)/2}, edges:edges };
    return room.__an;
  }
  const COLLISION_EXEMPT={ rug:1, tv:1 };   // halı (mobilya altında) + TV (ünite üstünde) → çakışma engellemez/engellenmez
  const DOOR_CLR=0.35;                       // kapı açıklığının YANLARINDA boş kalacak yanal pay (m) — geçiş için span'ı iki uçta genişletir (J2 istenen ≥0.30 karşılanır)
  const DOOR_PASS_DEPTH=1.20;                // J2: kapı önü GEÇİŞ koridoru derinliği (m) — W2'de 0.90'dı, yaklaşım yolu hâlâ kesilebiliyordu → 1.20'ye çıkarıldı (mobilya bu derinliğe kadar YASAK)
  // ayak izi bir kapı geçişini engelliyor mu. W2/J2: her kapı span'ının İKİ tarafında (odaya doğru) geçiş koridoru
  //   MUTLAK yasak: span genişliği (±DOOR_CLR=0.35 yanal) × 1.20m derinlik. Derinlik 0.45→0.90→1.20 kademe kademe
  //   büyütüldü çünkü kapının tam önünde değil ama YAKLAŞIM yolunda duran mobilya hâlâ geçişi kesiyordu (kullanıcı).
  //   Kapı iç kapı olduğundan her iki odada da o duvar kenarı analiz edilir → koridor iki tarafta oluşur.
  function furnDoorBlocked(fp, an){
    for(let i=0;i<an.edges.length;i++){ const e=an.edges[i]; if(!e.doorSpans.length) continue;
      let tMin=1e9,tMax=-1e9,perpMin=1e9;
      for(let k=0;k<fp.length;k++){ const dx=fp[k][0]-e.a[0], dz=fp[k][1]-e.a[1];
        const t=dx*e.dir[0]+dz*e.dir[1], perp=Math.abs(dx*(-e.dir[1])+dz*e.dir[0]);
        if(t<tMin)tMin=t; if(t>tMax)tMax=t; if(perp<perpMin)perpMin=perp; }
      if(perpMin>DOOR_PASS_DEPTH) continue;  // W2: item kapı geçiş-koridoru derinliğinden UZAK → engellemez
      for(let j=0;j<e.doorSpans.length;j++){ const ds=e.doorSpans[j]; if(tMax>ds[0]-DOOR_CLR && tMin<ds[1]+DOOR_CLR) return true; }
    }
    return false;
  }
  const WIN_TALL_H=1.10;                      // W3: bu yükseklikten UZUN mobilya (gardırop/kitaplık/buzdolabı) pencere önüne KONMAZ
  // ayak izi bir pencere span'ının önünü kapatıyor mu. W3: YÜKSEK mobilya (h>1.10m) hiçbir pencere span'ı önüne
  //   yerleşemez (ışığı/manzarayı keser). ALÇAK mobilya (komodin/sehpa/koltuk) normal pencere önünde SERBEST,
  //   ama TAM-BOY cam (full) önünde alçak da yasak (zemine kadar camı kapatır). Yalnız item duvara yakınken
  //   denetlenir (orta-oda item'ı pencereyi umursamaz). Kapı-önü mantığının (furnDoorBlocked) ikizi.
  function furnWindowBlocked(fp, an, itemH){
    const tall=(itemH!=null && itemH>WIN_TALL_H);
    for(let i=0;i<an.edges.length;i++){ const e=an.edges[i]; if(!e.winSpans||!e.winSpans.length) continue;
      let tMin=1e9,tMax=-1e9,perpMin=1e9;
      for(let k=0;k<fp.length;k++){ const dx=fp[k][0]-e.a[0], dz=fp[k][1]-e.a[1];
        const t=dx*e.dir[0]+dz*e.dir[1], perp=Math.abs(dx*(-e.dir[1])+dz*e.dir[0]);
        if(t<tMin)tMin=t; if(t>tMax)tMax=t; if(perp<perpMin)perpMin=perp; }
      if(perpMin>0.45) continue;              // item bu cephe duvarından uzak → pencere önünü kapatmaz
      for(let j=0;j<e.winSpans.length;j++){ const ws=e.winSpans[j];
        if(!tall && !ws[2]) continue;         // alçak mobilya + normal pencere → serbest (yalnız uzun VEYA tam-boy yasak)
        if(tMax>ws[0] && tMin<ws[1]) return true; }
    }
    return false;
  }
  // bir yerleşim odaya sığıyor mu: poligon-içi + kapı açmıyor + pencere önü (yükseklik-farkında) + çakışmıyor (muaf hariç)
  function furnFits(x,z,rot,w,d, an, placed, skipOverlap, itemH){
    const fp=furnFootprintM(x,z,rot,w,d);
    if(!furnRectInPoly(fp, an.poly)) return false;
    if(furnWindowBlocked(fp, an, itemH)) return false;   // W3: pencere-önü kuralı çakışma-atlamadan BAĞIMSIZ (skipOverlap'lı yerleşimlerde de geçerli)
    if(!skipOverlap){ if(furnDoorBlocked(fp, an)) return false;
      for(let i=0;i<placed.length;i++){ const p=placed[i]; if(p.__exempt) continue; if(p.__fp && furnRectsOverlap(fp, p.__fp)) return false; } }
    return true;
  }
  function furnHeightOf(type){ const d=FURN_DIM[type]; return d?d.h:null; }
  // duvara yaslı item bakış açısı = iç normal yönü (local +Z → nIn). w duvar boyunca, d odaya doğru.
  function wallRotDeg(edge){ return (Math.atan2(edge.nIn[0], edge.nIn[1])*180/Math.PI+360)%360; }
  // kenar üzerinde kapı (+ clearance) ve uç payları düşülmüş serbest aralıklar
  function freeSpansOnEdge(edge, endClear, doorClear){
    let spans=[[endClear, edge.len-endClear]];
    edge.doorSpans.forEach(function(ds){
      const d0=ds[0]-doorClear, d1=ds[1]+doorClear, next=[];
      spans.forEach(function(s){ if(d1<=s[0]||d0>=s[1]){ next.push(s); return; }
        if(d0>s[0]) next.push([s[0],d0]); if(d1<s[1]) next.push([d1,s[1]]); });
      spans=next;
    });
    return spans.filter(function(s){ return s[1]-s[0]>0.1; });
  }
  // kenar üzerinde dünya noktasının "t" (kenar-boyu) koordinatı
  function edgeT(edge, x, z){ return (x-edge.a[0])*edge.dir[0]+(z-edge.a[1])*edge.dir[1]; }
  // item'ı kenara yasla → sığan {type,pos,rot,__fp} ya da null. opt: align(center/start/end), w/d/rot override, wallGap, doorClear,
  //   atT(kenar-boyu hedef konuma EN YAKIN yerleştir — TV'yi kanepe karşısına hizala), awayFrom({x,z}'den UZAK yerleştir — kanepeyi mutfaktan ayır)
  function placeOnEdge(an, edge, type, placed, opt){
    opt=opt||{};
    const dim=FURN_DIM[type]||{w:0.6,d:0.6};
    const w=(opt.w!=null?opt.w:dim.w), d=(opt.d!=null?opt.d:dim.d);
    const rot=(opt.rot!=null?opt.rot:wallRotDeg(edge));
    const inset=d/2+(opt.wallGap==null?WALL_CLR:opt.wallGap);   // MESH-K/Q1: varsayılan duvar boşluğu duvar iç yüzünü geçer
    const spans=freeSpansOnEdge(edge, (opt.endClear==null?0.12:opt.endClear), (opt.doorClear==null?0.35:opt.doorClear));
    const cand=[];                                                   // tüm serbest aralıklardaki aday t'ler tek havuzda → konumsal sıralama
    spans.forEach(function(s){ const slen=s[1]-s[0]; if(slen < w-1e-6) return;
      if(opt.align==='start') cand.push(s[0]+w/2); else if(opt.align==='end') cand.push(s[1]-w/2); else cand.push((s[0]+s[1])/2);
      for(let t=s[0]+w/2; t<=s[1]-w/2+1e-6; t+=0.2){ if(t-w/2>=s[0]-1e-6 && t+w/2<=s[1]+1e-6) cand.push(t); }
    });
    if(opt.atT!=null) cand.sort(function(p,q){ return Math.abs(p-opt.atT)-Math.abs(q-opt.atT); });   // hedefe en yakın önce
    else if(opt.awayFrom){ const ax=opt.awayFrom.x, az=opt.awayFrom.z;                                // noktadan en uzak önce
      cand.sort(function(p,q){ return Math.hypot(edge.a[0]+edge.dir[0]*q-ax,edge.a[1]+edge.dir[1]*q-az)
                                    - Math.hypot(edge.a[0]+edge.dir[0]*p-ax,edge.a[1]+edge.dir[1]*p-az); }); }
    for(let ci=0;ci<cand.length;ci++){ const t=cand[ci];
      const px=edge.a[0]+edge.dir[0]*t + edge.nIn[0]*inset;
      const pz=edge.a[1]+edge.dir[1]*t + edge.nIn[1]*inset;
      if(furnFits(px,pz,rot,w,d, an, placed, opt.exempt, furnHeightOf(type))) return { type:type, pos:{x:px,z:pz}, rot_deg:rot, __fp:furnFootprintM(px,pz,rot,w,d), __w:opt.w, __d:opt.d, __exempt:!!opt.exempt };
    }
    return null;
  }
  // serbest bir noktaya (merkez/köşe) yerleştir → sığan {type,pos,rot,__fp} ya da null. candidates: [{x,z,rot}]
  function placeAtCandidates(an, type, placed, candidates, opt){
    opt=opt||{}; const dim=FURN_DIM[type]||{w:0.6,d:0.6};
    const w=(opt.w!=null?opt.w:dim.w), d=(opt.d!=null?opt.d:dim.d);
    for(let i=0;i<candidates.length;i++){ const c=candidates[i], rot=(c.rot!=null?c.rot:0);
      if(furnFits(c.x,c.z,rot,w,d, an, placed, opt.exempt, furnHeightOf(type))) return { type:type, pos:{x:c.x,z:c.z}, rot_deg:rot, __fp:furnFootprintM(c.x,c.z,rot,w,d), __w:opt.w, __d:opt.d, __exempt:!!opt.exempt };
    }
    return null;
  }
  // odanın 4 iç köşesi (bitki/aksesuar için): bbox köşelerinden içeri ofset, poligon-içi olanlar
  function furnInnerCorners(an, inset){
    const b=an.bbox, q=[];
    [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(function(s){
      const x=b.cx + s[0]*(b.w/2 - inset), z=b.cz + s[1]*(b.d/2 - inset);
      if(pointInPolyM(x,z,an.poly)) q.push({x:x,z:z,sx:s[0],sz:s[1]});
    });
    return q;
  }
  // yerleşim listesine ekle + footprint damgala (sonraki çakışma testleri için)
  function pushPlaced(placed, p){ if(p){ placed.push(p); } return p; }
  const CLR = { sofaCoffee:0.42, doorClear:0.35, diningChair:0.45 };
  function clampN(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function frontDir(rotDeg){ const a=rotDeg*Math.PI/180; return [Math.sin(a), Math.cos(a)]; }   // item ön yönü (=iç normal)
  // oda tipi sınıflandırma
  function roomKind(room){
    const blob=((room.type||'')+' '+(room.name||'')+' '+(room.name_en||'')+' '+(room.id||'')+' '+(room.type_tr||'')).toLowerCase();
    if(/stair|merdiven|elevator|asans|shaft|şaft|fire|yangin|yangın|parking|otopark|shelter|sığ|teknik|technical|storage|depo|shop|dükk/.test(blob)) return 'skip';
    if(/koridor|corridor/.test(blob)) return 'corridor';
    if(/\bwc\b/.test(blob)) return 'wc';
    if(/bath|banyo/.test(blob)) return 'bathroom';
    if(/living_kitchen/.test(room.type||'') || (/living|salon/.test(blob) && /kitchen|mutfak/.test(blob))) return 'living_kitchen';
    if(/studio|stüdyo/.test(blob)) return 'studio';                    // A7: stüdyo = salon + yatak
    if(/living|salon/.test(blob)) return 'living';
    if(/kitchen|mutfak/.test(blob)) return 'kitchen';
    if(/bedroom|yatak/.test(blob)) return /eb\.|ebeveyn|master|ensuite/.test(blob) ? 'master' : 'bedroom';
    if(/study|çalışma|calisma|ofis|office|büro|buro/.test(blob)) return 'study';   // A7: çalışma odası
    if(/balcony|balkon/.test(blob)) return 'balcony';
    if(/hall|hol|antre|entry|foyer/.test(blob)) return 'entry';
    return 'other';
  }
  function pickEdge(an, opt){ opt=opt||{}; return an.edges.find(function(e){
    if(opt.minLen!=null && e.len<opt.minLen) return false;
    if(opt.interior && e.exterior) return false;
    if(opt.noDoor && e.doorSpans.length) return false;
    if(opt.exclude && opt.exclude.indexOf(e)>=0) return false; return true; }) || null; }
  function allEdges(an, opt){ opt=opt||{}; return an.edges.filter(function(e){
    if(opt.minLen!=null && e.len<opt.minLen) return false;
    if(opt.noDoor && e.doorSpans.length) return false;
    if(opt.exclude && opt.exclude.indexOf(e)>=0) return false; return true; }); }
  function bedHbEdge(an, item){ const fn=frontDir(item.rot_deg); let best=null,bd=-2;
    an.edges.forEach(function(e){ const dot=e.nIn[0]*fn[0]+e.nIn[1]*fn[1]; if(dot>bd){bd=dot;best=e;} }); return best; }
  // verilen noktaya (zone merkezi) midpoint'i EN YAKIN kenar
  function edgeNearZone(an, c, opt){ opt=opt||{}; let best=null, bd=1e9;
    an.edges.forEach(function(e){ if(opt.minLen!=null&&e.len<opt.minLen) return; if(opt.noDoor&&e.doorSpans.length) return; if(opt.exclude&&opt.exclude.indexOf(e)>=0) return;
      const d=Math.hypot(e.mid[0]-c.x, e.mid[1]-c.z); if(d<bd){ bd=d; best=e; } }); return best; }
  // yerleştir (duvar) — başarılıysa placed'e ekle
  function place(an, edge, type, placed, opt){ if(!edge) return null; opt=Object.assign({}, opt); if(COLLISION_EXEMPT[type]) opt.exempt=true;
    const p=placeOnEdge(an, edge, type, placed, opt); if(p) placed.push(p); return p; }
  // ilk uygun duvara yerleştir (öncelik sıralı)
  function placeAny(an, type, placed, opt, edges){ edges=edges||allEdges(an,{minLen:(FURN_DIM[type]||{w:0.5}).w});
    for(let i=0;i<edges.length;i++){ const p=place(an,edges[i],type,placed,opt); if(p) return p; } return null; }
  // boyut-küçültme zinciri: order[] tiplerini sırayla dene
  function placeChain(an, order, placed, opt, edges){ for(let i=0;i<order.length;i++){ const p=placeAny(an,order[i],placed,opt,edges); if(p) return p; } return null; }
  // mobilyanın ÖNÜNE (baktığı yöne) yerleştir
  function placeFront(an, anchor, type, placed, gap){ if(!anchor) return null; const fn=frontDir(anchor.rot_deg);
    const ad=(anchor.__d!=null?anchor.__d:(FURN_DIM[anchor.type]||{d:0.5}).d), dim=FURN_DIM[type]||{w:0.6,d:0.5};
    const dist=ad/2+(gap==null?CLR.sofaCoffee:gap)+dim.d/2, x=anchor.pos.x+fn[0]*dist, z=anchor.pos.z+fn[1]*dist, ex=!!COLLISION_EXEMPT[type];
    if(furnFits(x,z,anchor.rot_deg,dim.w,dim.d, an, placed, ex, furnHeightOf(type))){ const p={type:type,pos:{x:x,z:z},rot_deg:anchor.rot_deg,__fp:furnFootprintM(x,z,anchor.rot_deg,dim.w,dim.d),__exempt:ex}; placed.push(p); return p; } return null; }
  // serbest noktaya yerleştir (bitki/masa)
  function place2(an, placed, type, x, z, rot){ const dim=FURN_DIM[type]||{w:0.4,d:0.4}, ex=!!COLLISION_EXEMPT[type]; rot=rot||0;
    if(furnFits(x,z,rot,dim.w,dim.d,an,placed,ex, furnHeightOf(type))){ const p={type:type,pos:{x:x,z:z},rot_deg:rot,__fp:furnFootprintM(x,z,rot,dim.w,dim.d),__exempt:ex}; placed.push(p); return p; } return null; }
  // oda bbox'unda ızgara tarayıp clearance'lı sığan ilk yer (yemek masası gibi serbest mobilya)
  // near verilirse: sığan hücreler arasında near'a EN YAKIN olanı seç (yemek masası mutfağa yakın dursun, oturma grubuna değil); yoksa ilk fit
  function scanPlace(an, placed, type, clear, rots, near){ const dim=FURN_DIM[type]||{w:0.6,d:0.6}, b=an.bbox; rots=rots||[0,90];
    const W=dim.w+2*clear, Dp=dim.d+2*clear; let best=null, bestScore=1e18;
    for(let ri=0;ri<rots.length;ri++){ const rot=rots[ri];
      for(let z=b.minZ+0.3; z<=b.maxZ-0.3; z+=0.3) for(let x=b.minX+0.3; x<=b.maxX-0.3; x+=0.3){
        if(!furnFits(x,z,rot,W,Dp,an,placed,false,furnHeightOf(type))) continue;
        if(!near){ const p={type:type,pos:{x:x,z:z},rot_deg:rot,__fp:furnFootprintM(x,z,rot,dim.w,dim.d)}; placed.push(p); return p; }
        const sc=(x-near.x)*(x-near.x)+(z-near.z)*(z-near.z); if(sc<bestScore){ bestScore=sc; best={x:x,z:z,rot:rot}; } } }
    if(best){ const p={type:type,pos:{x:best.x,z:best.z},rot_deg:best.rot,__fp:furnFootprintM(best.x,best.z,best.rot,dim.w,dim.d)}; placed.push(p); return p; }
    return null; }

  // ----- yardımcılar: serbest aralık + açık-plan zonlama + izleme çifti -----
  function spanLen(s){ return s? s[1]-s[0] : 0; }
  function bestSpanOnEdge(edge){ const ss=freeSpansOnEdge(edge,0.05,CLR.doorClear); let b=null; ss.forEach(function(s){ if(!b||(s[1]-s[0])>(b[1]-b[0])) b=s; }); return b; }
  function roomDoorPoint(an){ for(let i=0;i<an.edges.length;i++){ const e=an.edges[i]; if(e.doorSpans.length){ const ds=e.doorSpans[0], t=(ds[0]+ds[1])/2; return { x:e.a[0]+e.dir[0]*t, z:e.a[1]+e.dir[1]*t }; } } return null; }
  // açık-plan odayı uzun eksende İKİYE böl → {kitchen, living} merkez noktaları. Mutfak = girişe (kapıya) yakın yarı.
  function furnOpenZones(an){
    const b=an.bbox; let h1,h2;
    if(b.w>=b.d){ h1={x:(b.minX+b.cx)/2,z:b.cz}; h2={x:(b.cx+b.maxX)/2,z:b.cz}; }
    else { h1={x:b.cx,z:(b.minZ+b.cz)/2}; h2={x:b.cx,z:(b.cz+b.maxZ)/2}; }
    const dp=roomDoorPoint(an); let kit=h1, liv=h2;
    if(dp && Math.hypot(h2.x-dp.x,h2.z-dp.z) < Math.hypot(h1.x-dp.x,h1.z-dp.z)){ kit=h2; liv=h1; }
    return { kitchen:kit, living:liv };
  }
  // iyi izleme mesafesi (2.2–4.4m) veren KARŞI duvar çifti → {a,b,dist}. Yoksa null (yüzen kanepe gerekir).
  function pickViewPair(an, exclude){
    exclude=exclude||[]; let best=null;
    an.edges.forEach(function(tv){ if(exclude.indexOf(tv)>=0||tv.len<1.2) return;
      an.edges.forEach(function(so){ if(so===tv||exclude.indexOf(so)>=0||so.len<1.4) return;
        const facing=-(tv.nIn[0]*so.nIn[0]+tv.nIn[1]*so.nIn[1]); if(facing<0.7) return;       // karşı karşıya bakan duvarlar
        const dx=so.mid[0]-tv.mid[0], dz=so.mid[1]-tv.mid[1], dist=Math.abs(dx*tv.nIn[0]+dz*tv.nIn[1]);
        if(dist<2.2||dist>4.7) return;
        const score=Math.min(tv.len,so.len) - Math.abs(dist-3.0)*1.2 - (tv.doorSpans.length+so.doorSpans.length)*0.3;
        if(!best||score>best.score) best={ a:tv, b:so, dist:dist, score:score };
      }); });
    return best;
  }
  // anchor'ın (TV) ÖNÜNE ~3m'ye yüzen kanepe (açık-plan bölücü) — duvar yokken kullan. Düz önü doluysa (kapı/eşya) yana kaydırarak dener (yine TV'ye bakar).
  function placeSofaFacing(an, placed, anchor, type){
    const dim=FURN_DIM[type]||{w:1.6,d:0.95}, fn=frontDir(anchor.rot_deg), sofaRot=(anchor.rot_deg+180)%360, lat=[fn[1],-fn[0]];
    for(let D=2.5; D<=3.95; D+=0.25){ const offs=[0,-0.55,0.55,-1.1,1.1];
      for(let oi=0;oi<offs.length;oi++){ const x=anchor.pos.x+fn[0]*D+lat[0]*offs[oi], z=anchor.pos.z+fn[1]*D+lat[1]*offs[oi];
        if(furnFits(x,z,sofaRot,dim.w,dim.d,an,placed)){ const p={type:type,pos:{x:x,z:z},rot_deg:sofaRot,__fp:furnFootprintM(x,z,sofaRot,dim.w,dim.d)}; placed.push(p); return p; } } }
    return null;
  }

  // ----- SALON / SALON+MUTFAK -----
  function furnishLiving(ctx, openKitchen){
    const an=ctx.an, placed=ctx.placed, A=ctx.A;
    // 1) açık mutfak: bitişik mutfak dizisini kur → mutfak çapası (gerçek yerleşmiş merkez). Yaşam çapası = ona göre karşı uç.
    let kanchor=null;
    if(openKitchen){ const z=furnOpenZones(an); kanchor=placeKitchenRun(ctx, true, z.kitchen); }
    const kWall = kanchor ? edgeNearZone(an, kanchor) : null;                                     // mutfak duvarı (TV/kanepe onu dışlar)
    const b=an.bbox, livC = kanchor ? {x:2*b.cx-kanchor.x, z:2*b.cz-kanchor.z} : {x:b.cx,z:b.cz}; // mutfaktan en uzak (oda merkezine yansıma)
    // 2) TV + kanepe: mutfak duvarı HARİÇ iyi izleme mesafeli karşı çift; yoksa TV yaşam duvarına + yüzen kanepe
    const sofaType = A>=30?'sectional_l':(A>=15?'sofa_3':'sofa_2');
    const pair = pickViewPair(an, kWall?[kWall]:[]);
    let tvWall=null, sofaWall=null, sofa=null;
    if(pair){
      sofaWall = (Math.hypot(pair.a.mid[0]-livC.x,pair.a.mid[1]-livC.z) <= Math.hypot(pair.b.mid[0]-livC.x,pair.b.mid[1]-livC.z)) ? pair.a : pair.b;  // kanepe = yaşam çapasına yakın
      tvWall = (sofaWall===pair.a) ? pair.b : pair.a;
      sofa = place(an, sofaWall, sofaType, placed, kanchor?{awayFrom:kanchor}:{align:'center'})
          || place(an, sofaWall, 'sofa_2', placed, kanchor?{awayFrom:kanchor}:{align:'center'});
      if(sofa){ const tvu=place(an, tvWall, 'tv_unit', placed, {atT:edgeT(tvWall,sofa.pos.x,sofa.pos.z)});   // TV kanepe karşısına HİZALI
        if(tvu) place(an, tvWall, 'tv', placed, {atT:edgeT(tvWall,tvu.pos.x,tvu.pos.z)}); }                  // tv = ünitenin GERÇEK yerine (kayma olursa onu izle)
    }
    if(!sofa){                                                                                   // temiz çift yok (T/sığ oda) → yüzen kanepe (açık-plan bölücü)
      sofaWall=null;
      tvWall = edgeNearZone(an, livC, {exclude:kWall?[kWall]:[], noDoor:true, minLen:1.2})
            || edgeNearZone(an, livC, {exclude:kWall?[kWall]:[], minLen:1.2})
            || pickEdge(an,{noDoor:true,minLen:1.2}) || pickEdge(an,{minLen:1.2}) || an.edges[0];
      const tvu = place(an, tvWall, 'tv_unit', placed, {atT:edgeT(tvWall,livC.x,livC.z)});       // TV yaşam çapasının karşısına
      if(tvu) place(an, tvWall, 'tv', placed, {atT:edgeT(tvWall,tvu.pos.x,tvu.pos.z)});
      const anchor = tvu || {pos:{x:tvWall.mid[0]+tvWall.nIn[0]*0.25,z:tvWall.mid[1]+tvWall.nIn[1]*0.25}, rot_deg:wallRotDeg(tvWall)};
      sofa = placeSofaFacing(an, placed, anchor, sofaType) || placeSofaFacing(an, placed, anchor, 'sofa_2')
          || placeAny(an,'sofa_2',placed,{align:'center'}, allEdges(an,{exclude:[tvWall],minLen:1.4}));
    }
    // 3) sehpa + halı
    if(sofa) placeFront(an, sofa, 'coffee_table', placed, CLR.sofaCoffee);
    if(sofa) placeRug(an, placed, sofa);
    // 4) yemek masası: mutfak çapasına yakın — KOLTUKTAN ÖNCE yer kapar (yoksa koltuk yemek cebini yutar)
    if(openKitchen && A>=18){ const near = kanchor || (sofa?{x:2*an.bbox.cx-sofa.pos.x,z:2*an.bbox.cz-sofa.pos.z}:{x:an.bbox.cx,z:an.bbox.cz});
      placeDining(ctx, A>=26?'dining_table_6':'dining_table_4', near); }
    // 5) koltuk + kitaplık + yan masa (TV/kanepe/mutfak dışı kalan duvarlar)
    const used=[]; if(tvWall) used.push(tvWall); if(sofaWall) used.push(sofaWall); if(kWall) used.push(kWall);
    if(sofa && sofaWall) place(an, sofaWall, 'side_table', placed, {});
    const nArm=clampN(Math.round((A-14)/9),0,2);
    const sideWalls=allEdges(an,{exclude:used,minLen:0.95});
    let armN=0; for(let i=0;i<sideWalls.length && armN<nArm;i++){ if(place(an,sideWalls[i],'armchair',placed,kanchor?{awayFrom:kanchor}:{})) armN++; }
    if(A>=16) placeAny(an,'bookcase',placed,{}, allEdges(an,{exclude:used,minLen:0.9}));
  }
  function placeRug(an, placed, sofa){ const fn=frontDir(sofa.rot_deg), cx=sofa.pos.x+fn[0]*0.95, cz=sofa.pos.z+fn[1]*0.95;
    let w=2.4, d=1.6; for(let k=0;k<7;k++){ if(furnFits(cx,cz,sofa.rot_deg,w,d,an,placed,true)) break; w*=0.85; d*=0.85; }
    if(w<1.0) return null; const p={type:'rug',pos:{x:cx,z:cz},rot_deg:sofa.rot_deg,__w:w,__d:d,__fp:furnFootprintM(cx,cz,sofa.rot_deg,w,d),__exempt:true}; placed.push(p); return p; }

  // ----- MUTFAK (bitişik tezgah dizisi: buzdolabı–tezgah–evye–ocak–[bulaşık]) -----
  // span aralığına soldan sağa BİTİŞİK mutfak dizisi yerleştir → mutfak merkezi (çapa) ya da null
  function layKitchenRun(an, edge, span, placed, compact){
    const rot=wallRotDeg(edge), gap=0.03, sl=span[1]-span[0];
    const ess = compact ? ['fridge','sink','oven_hob'] : ['fridge','sink','oven_hob','dishwasher'];
    const essW = ess.reduce(function(s,t){ return s+FURN_DIM[t].w; },0) + gap*(ess.length-1);
    let counterW = Math.max(0, Math.min(sl-essW-gap*2, compact?1.6:2.4));     // kalan = tezgah (çalışma tezgahı), sınırlı
    const list=[['fridge',FURN_DIM.fridge.w]];
    if(counterW>=0.5) list.push(['counter',counterW/2]);
    list.push(['sink',FURN_DIM.sink.w]); list.push(['oven_hob',FURN_DIM.oven_hob.w]);
    if(!compact) list.push(['dishwasher',FURN_DIM.dishwasher.w]);
    if(counterW>=0.5) list.push(['counter',counterW/2]);
    let t=span[0], cx=0,cz=0,n=0;
    for(let i=0;i<list.length;i++){ const type=list[i][0], w=list[i][1]; if(w<0.3) continue;
      if(t+w > span[1]+1e-6) break;
      const tc=t+w/2, d=FURN_DIM[type].d, inset=d/2+WALL_CLR;   // MESH-K/Q1: mutfak tezgah dizisi de duvar iç yüzünü geçer
      const px=edge.a[0]+edge.dir[0]*tc+edge.nIn[0]*inset, pz=edge.a[1]+edge.dir[1]*tc+edge.nIn[1]*inset;
      if(furnFits(px,pz,rot,w,d,an,placed,false,furnHeightOf(type))){ placed.push({type:type,pos:{x:px,z:pz},rot_deg:rot,__w:(type==='counter'?w:undefined),__fp:furnFootprintM(px,pz,rot,w,d)}); cx+=px;cz+=pz;n++; }   // W3: fridge (uzun) pencere önüne düşerse atlanır; tezgah/ocak (alçak) serbest
      t += w + gap;
    }
    return n? {x:cx/n,z:cz/n} : null;
  }
  // dizide yer bulamayan esas eleman → başka bir serbest duvara koy (asla "yerleşmedi" olmasın)
  function ensureKitchenItem(an, placed, type, opt, minLen){ if(placed.some(function(p){ return p.type===type; })) return; placeAny(an, type, placed, opt, allEdges(an,{minLen:minLen})); }
  function placeKitchenRun(ctx, compact, zoneC){
    const an=ctx.an, placed=ctx.placed;
    let walls=allEdges(an,{minLen:1.2}); if(!walls.length) walls=allEdges(an,{minLen:0.9});
    walls=walls.slice().sort(function(a,b){ let sa=spanLen(bestSpanOnEdge(a)), sb=spanLen(bestSpanOnEdge(b));
      if(zoneC){ sa-=0.25*Math.hypot(a.mid[0]-zoneC.x,a.mid[1]-zoneC.z); sb-=0.25*Math.hypot(b.mid[0]-zoneC.x,b.mid[1]-zoneC.z); } return sb-sa; });  // en uzun serbest aralık (zon yakınlığı bonuslu) önce
    let anchor=null;
    for(let i=0;i<walls.length;i++){ const s=bestSpanOnEdge(walls[i]); if(s && (s[1]-s[0])>=1.4){ anchor=layKitchenRun(an, walls[i], s, placed, compact); if(anchor) break; } }
    ensureKitchenItem(an, placed, 'fridge', {align:'end'}, 0.7);
    ensureKitchenItem(an, placed, 'sink', {}, 0.6);
    ensureKitchenItem(an, placed, 'oven_hob', {}, 0.6);
    return anchor;
  }
  function furnishKitchen(ctx){ placeKitchenRun(ctx, false, null); }

  // ----- YEMEK -----
  function placeDining(ctx, tableType, near){ const an=ctx.an, placed=ctx.placed;
    const table=scanPlace(an, placed, tableType, CLR.diningChair, null, near); if(!table) return null;
    placeDiningChairs(an, placed, table, tableType==='dining_table_6'?6:4); return table; }
  function placeDiningChairs(an, placed, table, n){ const d=FURN_DIM[table.type], rt=table.rot_deg*Math.PI/180, ca=Math.cos(rt), sa=Math.sin(rt);
    const ax=[ca,-sa], az=[sa,ca], ch=FURN_DIM.dining_chair, off=0.28;
    function put(useW, sgn, total){ const along=useW?az:ax, norm=useW?ax:az;
      const halfN=(useW?d.w/2:d.d/2)+ch.d/2+off, spanH=(useW?d.d/2:d.w/2)-0.12;
      for(let i=0;i<total;i++){ const t=(total===1)?0:(-spanH+2*spanH*i/(total-1));
        const x=table.pos.x+norm[0]*sgn*halfN+along[0]*t, z=table.pos.z+norm[1]*sgn*halfN+along[1]*t;
        const crot=(Math.atan2(-norm[0]*sgn,-norm[1]*sgn)*180/Math.PI+360)%360;
        if(furnFits(x,z,crot,ch.w,ch.d,an,placed)) placed.push({type:'dining_chair',pos:{x:x,z:z},rot_deg:crot,__fp:furnFootprintM(x,z,crot,ch.w,ch.d)}); } }
    const longW=d.w>=d.d, per=Math.max(1,Math.floor(n/2)-(n>=6?1:0)), ends=n-2*per;
    put(longW,1,per); put(longW,-1,per); if(ends>0){ put(!longW,1,Math.ceil(ends/2)); if(ends>1) put(!longW,-1,Math.floor(ends/2)); }
  }

  // ----- YATAK ODASI -----
  // yatak en az BİR uzun kenarında geçiş payı (~58cm, oda sınırına) olmalı — yoksa duvara sıkışmış sayılır
  function bedHasAccess(an, bed){
    const dim=FURN_DIM[bed.type]||{w:1.5,d:2.0}, w=(bed.__w!=null?bed.__w:dim.w), d=(bed.__d!=null?bed.__d:dim.d);
    const a=bed.rot_deg*Math.PI/180, ca=Math.cos(a), sa=Math.sin(a), lx=[ca,-sa], lz=[sa,ca];
    const longAxis=(d>=w?lz:lx), longLen=Math.max(w,d), sideNorm=(d>=w?lx:lz), halfShort=Math.min(w,d)/2, need=0.58;
    for(let s=-1;s<=1;s+=2){ let ok=true;
      for(let t=-0.34;t<=0.341;t+=0.34){ const bx=bed.pos.x+longAxis[0]*t*longLen, bz=bed.pos.z+longAxis[1]*t*longLen;
        if(!pointInPolyM(bx+sideNorm[0]*s*(halfShort+need), bz+sideNorm[1]*s*(halfShort+need), an.poly)){ ok=false; break; } }
      if(ok) return true; }
    return false;
  }
  // yatak+erişim sığmayan oda → giyinme/dolap odası (gardırop dizisi + şifonyer, yatak YOK)
  function furnishDressing(ctx){ const an=ctx.an, placed=ctx.placed;
    for(let k=0;k<3;k++){ if(!placeChain(an,['wardrobe_4','wardrobe_3','wardrobe_2'],placed,{}, allEdges(an,{minLen:0.95}))) break; }
    placeAny(an,'dresser',placed,{}, allEdges(an,{minLen:0.95})); }
  // M1: komodin(ler) yatağın BAŞ ucu İKİ YANINA, duvar hizasında (mutfak gibi ilişkisel yerleşim — ankraja göre konumlanır).
  //   hb kenarı boyunca t-koordinatında yatağın sol/sağ kenarından hemen dışarıda aday nokta kurar (genel duvar-taraması DEĞİL,
  //   doğrudan yatağa göre); furnFits ile sığma/kapı/çakışma denetimi AYNEN korunur. İki taraf da sığarsa ikisi de konur (cap'e kadar),
  //   yalnız biri sığarsa o taraf, hiçbiri sığmazsa hiç komodin yok (mevcut "sığmıyorsa yok" davranışı).
  function placeNightstandsFlanking(an, hb, bed, placed, cap){
    const bd=FURN_DIM[bed.type]||{w:1.5,d:2.0}, bw=(bed.__w!=null?bed.__w:bd.w);
    const nd=FURN_DIM.nightstand||{w:0.45,d:0.40}, nw=nd.w;
    const tBed=edgeT(hb, bed.pos.x, bed.pos.z);
    const gap=0.03, half=bw/2+gap+nw/2;
    const sides=[tBed-half, tBed+half];                       // sol yan, sağ yan (t-koordinatı)
    let placedCount=0;
    for(let i=0;i<sides.length && placedCount<cap;i++){
      const t=sides[i];
      const px=hb.a[0]+hb.dir[0]*t + hb.nIn[0]*(nd.d/2+WALL_CLR);   // MESH-K/Q1: komodin de duvar iç yüzünü geçer
      const pz=hb.a[1]+hb.dir[1]*t + hb.nIn[1]*(nd.d/2+WALL_CLR);
      const rot=wallRotDeg(hb);
      if(furnFits(px,pz,rot,nw,nd.d, an, placed, false)){
        const p={ type:'nightstand', pos:{x:px,z:pz}, rot_deg:rot, __fp:furnFootprintM(px,pz,rot,nw,nd.d) };
        placed.push(p); placedCount++;
      }
    }
    if(!placedCount) place(an, hb, 'nightstand', placed, {});                                    // hiç yan sığmadıysa eski genel-duvar davranışı (yok olmasın)
  }
  function furnishBedroom(ctx, master){ const an=ctx.an, placed=ctx.placed, A=ctx.A;
    const order=['bed_king','bed_queen','bed_double','bed_single'];
    const start = master?(A>=13?0:1):(A>=10?2:3);
    const hbWalls=[ pickEdge(an,{interior:true,noDoor:true,minLen:0.95}), pickEdge(an,{noDoor:true,minLen:0.95}), pickEdge(an,{minLen:0.95}) ].filter(Boolean);
    let bed=null;
    for(let wi=0;wi<hbWalls.length && !bed;wi++){ for(let oi=start; oi<order.length && !bed; oi++){
      const cand=placeOnEdge(an, hbWalls[wi], order[oi], placed, {align:'center'});
      if(cand && bedHasAccess(an, cand)){ placed.push(cand); bed=cand; }                        // sığıyor VE erişim payı var
    } }
    if(!bed){ furnishDressing(ctx); return; }                                                    // hiç yatak erişimle sığmadı → giyinme odası
    const hb=bedHbEdge(an, bed);
    placeNightstandsFlanking(an, hb, bed, placed, master?2:1);
    // W1: YATAK GARANTİSİ önce (yukarıda kesinleşti). Gardırop üst-sınırı ALAN-ORANTILI: geniş yatak
    //   odasında birden fazla gardırop olabilir. Yerel sabit tablo (yorumlu) — <12 m²→1, 12-18→2, >18→3.
    //   Yatak zaten kondu; gardıroplar sığdıkça eklenir, sığmazsa sessizce feda edilir (mevcut "sığmıyorsa yok").
    const wardrobeCap = A>18 ? 3 : (A>=12 ? 2 : 1);
    const wo = master?['wardrobe_4','wardrobe_3','wardrobe_2']:['wardrobe_3','wardrobe_2'];
    for(let wc=0; wc<wardrobeCap; wc++){
      if(!placeChain(an, wo, placed, {}, allEdges(an,{exclude:[hb],minLen:0.95}))) break;         // sığan kalmadı → dur
    }
    if(A>=12) placeAny(an, master?'vanity':'dresser', placed, {}, allEdges(an,{exclude:[hb],minLen:0.9}));
  }

  // ----- BANYO / WC (boyut-farkındalık: küvet→duş→yok) -----
  function furnishBath(ctx, wc){ const an=ctx.an, placed=ctx.placed, A=ctx.A;
    placeAny(an,'toilet',placed,{}, allEdges(an,{minLen:0.45}));
    placeAny(an,'washbasin',placed,{}, allEdges(an,{minLen:0.55}));
    // B8: küvet 1.70m duvar gerektirir → endClear küçük; sığmazsa duş; o da yoksa yıkanma yok
    if(!wc){ let bath=placeAny(an,'bathtub',placed,{align:'center', endClear:0.03}, allEdges(an,{minLen:1.74}));
      if(!bath) placeAny(an,'shower_tray',placed,{endClear:0.03}, allEdges(an,{minLen:0.92})); }
    if(!wc && A>=5) placeAny(an,'washer',placed,{align:'end'}, allEdges(an,{minLen:0.65}));
  }

  // ----- GİRİŞ/ANTRE (orta boş, tek slim item) -----
  function furnishEntry(ctx){ const an=ctx.an, placed=ctx.placed;
    placeChain(an, (an.area>3?['shoe_cabinet','console']:['console']), placed, {}, allEdges(an,{minLen:0.8})); }

  // ----- BALKON -----
  function furnishBalcony(ctx){ const an=ctx.an, placed=ctx.placed; const t=scanPlace(an,placed,'bistro_table',0.35);
    if(t){ place2(an,placed,'bistro_chair',t.pos.x-0.55,t.pos.z,90); place2(an,placed,'bistro_chair',t.pos.x+0.55,t.pos.z,270); } }

  // ----- ÇALIŞMA ODASI (A7) -----
  function furnishStudy(ctx){ const an=ctx.an, placed=ctx.placed;
    placeChain(an, ['desk'], placed, {}, allEdges(an,{minLen:1.1}));
    const desk=placed[placed.length-1];
    if(desk && desk.type==='desk') placeFront(an, desk, 'office_chair', placed, 0.1);
    if(an.area>=10) placeAny(an,'bookcase',placed,{}, allEdges(an,{minLen:0.9}));
  }
  // ----- STÜDYO (A7) = salon + yatak -----
  function furnishStudio(ctx){ furnishLiving(ctx,false);
    placeChain(ctx.an, ['bed_double','bed_single'], ctx.placed, {align:'center'}, allEdges(ctx.an,{noDoor:true,minLen:1.0})); }

  // ----- BİTKİ pass (yalnız yaşam alanları; köşelere, sirkülasyon dışı) -----
  function furnishPlants(ctx, kind){ if(kind!=='living'&&kind!=='living_kitchen'&&kind!=='bedroom'&&kind!=='master'&&kind!=='studio'&&kind!=='study') return;
    const an=ctx.an, placed=ctx.placed, n=clampN(Math.round(an.area/16),0,(kind==='bedroom'?1:2)); if(n<=0) return;
    const corners=furnInnerCorners(an, 0.35).sort(function(a,b){ return 0; }); let put=0;
    for(let i=0;i<corners.length && put<n;i++){ if(place2(an, placed, 'plant', corners[i].x, corners[i].z)) put++; } }

  // dispatcher: oda → yerleşim listesi (seed = kilitli mobilya footprint'leri, auto onlardan kaçınır)
  function furnPlaceRoom(room, map, seed){
    const an=furnAnalyzeRoom(room, map); if(!an || an.area<1.5) return [];
    const kind=roomKind(room); if(kind==='skip'||kind==='corridor'||kind==='other') return [];
    (seed||[]).forEach(function(s){ s.__seed=true; });
    const ctx={ an:an, placed:(seed||[]).slice(), room:room, A:an.area };
    if(kind==='living') furnishLiving(ctx,false);
    else if(kind==='living_kitchen') furnishLiving(ctx,true);
    else if(kind==='studio') furnishStudio(ctx);
    else if(kind==='study') furnishStudy(ctx);
    else if(kind==='kitchen') furnishKitchen(ctx);
    else if(kind==='bedroom') furnishBedroom(ctx,false);
    else if(kind==='master') furnishBedroom(ctx,true);
    else if(kind==='bathroom') furnishBath(ctx,false);
    else if(kind==='wc') furnishBath(ctx,true);
    else if(kind==='entry') furnishEntry(ctx);
    else if(kind==='balcony') furnishBalcony(ctx);
    furnishPlants(ctx, kind);
    return ctx.placed.filter(function(p){ return !p.__seed; });
  }
  function autoFurnish(room, map){
    const locked=(room.furniture||[]).filter(function(f){ return f.locked; });   // elle düzenlenenleri KORU
    const seed=locked.map(function(f){ const dim=FURN_DIM[f.type]||{w:0.6,d:0.6}, w=(f.__w!=null?f.__w:dim.w), d=(f.__d!=null?f.__d:dim.d);
      return { type:f.type, pos:f.pos, rot_deg:f.rot_deg, __fp:furnFootprintM(f.pos.x,f.pos.z,f.rot_deg,w,d), __exempt:!!COLLISION_EXEMPT[f.type] }; });
    const placedNew=furnPlaceRoom(room, map, seed);   // auto seed'lerden (kilitli) kaçınır
    const auto=placedNew.map(function(p){ return { id:newFurnId(p.type, room.id), type:p.type, type_tr:FURN_TR[p.type]||null,
      room_id:room.id, pos:{x:p.pos.x,z:p.pos.z}, rot_deg:p.rot_deg, scale:1, source:'auto', locked:false, __w:p.__w, __d:p.__d }; });
    room.furniture=locked.concat(auto);
  }
  function autoFurnishAll(){
    const map=scene&&scene.__map; if(!map){ setFurnHint('Plan yok.'); return; } furnSnapshot();
    (map.units||[]).forEach(function(u){ (u.rooms||[]).forEach(function(r){ autoFurnish(r, map); }); });
    (map.common_areas||[]).forEach(function(r){ autoFurnish(r, map); });
    collectFurnList(); activeFurnIdx=-1; renderFurniture(); updateFurnPanel(); persistFurniture();
    setFurnHint(furnList.length+' mobilya yerleşti · elle düzenlenenler korundu');
  }

  /* ====================== MOBİLYA — px türetme + kalıcılık + sahne cümlesi (Faz 4+5) ======================
     pos MUTLAK metre → render-px (oda polygon_px ile AYNI uzay) ki kamera (cameraViewInfo) mobilyayı görsün.
     Kalıcılık: window.__kptaFurniture (room_id→item[]) — view3d yazar, io.js buildFloorplanMap okur (3B kapat-aç korunur). */
  // mobilya ayak izi (rot uygulanmış) → 4 köşe render-px. Three.js rotation.y konvansiyonu (local +X → -Z @90°).
  function furnToPolygonPx(f, map){
    const dim=FURN_DIM[f.type]||{w:0.6,d:0.6};
    const hw=(f.__w!=null?f.__w:dim.w)/2, hd=(f.__d!=null?f.__d:dim.d)/2, a=(f.rot_deg||0)*Math.PI/180, ca=Math.cos(a), sa=Math.sin(a);
    return [[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd]].map(function(c){
      const wx=f.pos.x + c[0]*ca + c[1]*sa, wz=f.pos.z - c[0]*sa + c[1]*ca;   // lokal(X=w,Z=d) → MUTLAK metre
      return m2px(map, wx, wz);
    });
  }
  // map'teki tüm mobilyaya polygon_px + centroid_px damgala (cameraViewInfo bunları okur)
  function syncFurniturePx(map){
    map=map||(scene&&scene.__map); if(!map) return;
    function stamp(r){ (r.furniture||[]).forEach(function(f){ if(f&&f.pos){ f.polygon_px=furnToPolygonPx(f,map); f.centroid_px=m2px(map,f.pos.x,f.pos.z); } }); }
    (map.units||[]).forEach(function(u){ (u.rooms||[]).forEach(stamp); }); (map.common_areas||[]).forEach(stamp);
  }
  // güncel mobilyayı kalıcı store'a yaz (px dahil, derin kopya → serileştirilebilir + alias yok)
  function persistFurniture(){
    const map=scene&&scene.__map; if(!map){ return; }
    syncFurniturePx(map);
    const store={};
    function take(r){ const fs=r.furniture||[]; if(fs.length) store[r.id]=fs.map(function(f){ return JSON.parse(JSON.stringify(f)); }); }
    (map.units||[]).forEach(function(u){ (u.rooms||[]).forEach(take); }); (map.common_areas||[]).forEach(take);
    try{ window.__kptaFurniture=store; }catch(e){}
  }
  // M3: kalıcı store'dan (window.__kptaMaterials) runtime materialOverrides'a yükle. Yalnız GEÇERLİ preset key'ler alınır.
  function hydrateMaterials(){
    const store=(typeof window!=='undefined' && window.__kptaMaterials) || {};
    materialOverrides={};
    Object.keys(store).forEach(function(rid){
      const o=store[rid]||{}, f=(o.floor&&MAT_BY_KEY[o.floor])?o.floor:null, w=(o.wall&&MAT_BY_KEY[o.wall])?o.wall:null;
      if(f||w) materialOverrides[rid]={ floor:f, wall:w };
    });
  }
  // M3: güncel malzeme seçimlerini kalıcı store'a yaz (mobilya ikizi). Yalnız DOLU (floor|wall set) odalar → boş kayıt yok.
  function persistMaterials(){
    const store={};
    Object.keys(materialOverrides).forEach(function(rid){
      const o=materialOverrides[rid]; if(o && (o.floor||o.wall)) store[rid]={ floor:o.floor||null, wall:o.wall||null };
    });
    try{ window.__kptaMaterials=store; }catch(e){}
  }
  // kameranın gördüğü mobilyadan TR cümle (nano prompt'una iliştir → mobilyayı uydurmaz, koyduğunu boyar)
  function sceneDescription(cam){
    // kadrajda anlamlı oranı görünen (coverage≥0.2) ya da merkezi koni içinde (coverage null) mobilya
    const f=((cam&&cam.furniture_seen)||[]).filter(function(x){ return x.coverage_ratio==null || x.coverage_ratio>=0.2; });
    const names=[]; f.forEach(function(x){ const n=x.type_tr||FURN_TR[x.type]||x.type; if(names.indexOf(n)<0) names.push(n); });
    const top=names.slice(0,4);
    if(!top.length) return '';
    return 'Kadrajda '+top[0]+(top.length>1?', ayrıca '+top.slice(1).join(', '):'')+' görünür.';
  }
  // dışa: tüm mobilya düz liste (px dahil) — render pipeline / hata ayıklama
  function exportFurniture(){ const map=scene&&scene.__map; if(map) syncFurniturePx(map); return furnList.map(function(f){ return JSON.parse(JSON.stringify(f)); }); }

  // ── açılış: boot (three.js + sahne) → full ya da yan-yana (compare) layout ──
  let compareMode=false, compareRefURL=null;   // adım 4 karşılaştırma: mesh tam genişlik + sol-üst boyalı-plan lightbox
  function boot(){
    ensureOverlay();
    const map = window.buildFloorplanMap && window.buildFloorplanMap();
    if(!map || !map.units || !map.units.length){
      alert('Önce bir yerleşim oluşturun (oda/daire). 3B görünüm planı kullanır.'); return Promise.resolve(null);
    }
    overlay.style.display='block';
    status.textContent='three.js yükleniyor…';
    return loadThree().then(function(){
      if(!renderer){
        renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
        renderer.setPixelRatio(Math.min(devicePixelRatio,2));
        renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
        host.appendChild(renderer.domElement);
        scene=new THREE.Scene(); scene.background=new THREE.Color(0x15151a);
        scene.fog=new THREE.Fog(0x15151a,60,150);
        cam=new THREE.PerspectiveCamera(42, host.clientWidth/host.clientHeight, 0.1, 600);
        controls=attachOrbit(cam,renderer.domElement);
        attachPicker();                                    // kamera-koyma raycaster (placeMode iken aktif)
        window.addEventListener('resize',resize);
        loop();
      }
      setCompareLayout(compareMode, compareRefURL);         // full / yan-yana yerleşimi uygula
      resize();
      hydrateMaterials();                                    // M3: kalıcı store'dan malzeme seçimlerini yükle (save/load + 3B kapat-aç korunur)
      buildScene(map); built=true;
      // host bazen boot anında daha boyutlanmamış olur → fitView aşırı yakın çerçeveler.
      // Bir sonraki karede (host kesin boyutlu) yeniden boyutlandır + sığdır (açıyı korur).
      requestAnimationFrame(function(){ resize(); if(!compareMode) fitView(); });
      return map;
    }).catch(function(e){ status.textContent='HATA: '+(e.message||e); return null; });
  }
  // tam-ekran 3B (toolbar / adım 2 "3B"): SALT İZLEME — kamera bölümü GİZLİ (#1), mesh serbest.
  function open(opts){ compareMode=false; compareRefURL=null; embedded=!!(opts&&opts.embedded); setCamUI(false); return boot().then(function(map){ setCamUI(false); setFurnUI(true); setMatUI(true); return map; }); }
  // plan imzası: yerleşim değişince (oda sayısı / footprint ölçüsü) eski kameralar geçersiz olur
  function planSig(map){
    const u=(map&&map.units)||[]; let rc=0; u.forEach(function(x){ rc+=((x.rooms||[]).length); });
    return u.length+'u'+rc+'r'+Math.round((scene&&scene.__hx||0)*10)+'x'+Math.round((scene&&scene.__hz||0)*10);
  }
  // adım 4 "Kamera": SOL boyalı referans + SAĞ canlı 3B (kilitli açı), kamera bölümü AÇIK, demo vitrin kameralar hazır.
  function openCompare(paintedURL, lockedView, onReRender){
    compareMode=true; compareRefURL=paintedURL||null; embedded=true;   // akış adımı → Kapat X yok
    onReRenderCb=(typeof onReRender==='function')?onReRender:null;
    return boot().then(function(map){
      if(!map) return;
      if(lockedView) restoreView(lockedView);              // 3B = boyalıyla AYNI açıdan başlar
      fitView();                                            // kilitli açıyı KORU, yarı-ekran kadrajına sığdır
      lockedViewRef=lockedView||getView();                  // sürüklenince bununla karşılaştır (açı kayması uyarısı)
      angleDrift=false; updateAngleWarn();
      setCamUI(true);                                        // kamera bölümünü göster
      setFurnUI(true);                                       // mobilya bölümünü de göster (adım 5 / Döşe)
      setMatUI(true);                                         // M2: malzeme bölümünü de göster (adım 3 boya / adım 5 döşe)
      const sig=planSig(map);
      if(camList.length && camPlanSig && camPlanSig!==sig) clearCams();   // plan değişti → eski (geçersiz koordinatlı) kameraları at
      if(!camList.length) deriveShowcaseCameras(map);       // daire başına vitrin kamera otomatik
      else { renderCamGizmos(); updateCamPanel(); }
      camPlanSig=sig;
      setPlaceMode(false);                                   // önce serbest gözat; "Kamera yerleştir" ile kilitle
    });
  }
  // overlay'i full ↔ yan-yana (sol boyalı img / sağ 3B host) arasında geçir + paneli taşı.
  // overlay: 3B mesh TAM genişlik + sol-üstte küçük "boyalı plan" lightbox küçük-resmi (tıkla→büyüt). Slider/split KALDIRILDI.
  function setCompareLayout(on, paintedURL){
    if(!overlay||!host) return;
    host.style.left='0';                                     // mesh her zaman tam genişlik (yan-yana slider yok)
    let thumb=overlay.querySelector('#v3dCompareThumb');
    if(on){
      if(!thumb){
        thumb=document.createElement('div'); thumb.id='v3dCompareThumb'; thumb.title='Boyalı planı büyüt';
        thumb.innerHTML='<img id="v3dRefImg" alt="Boyalı plan">'+
          '<div class="v3dcap"><b>Boyalı plan</b><span class="exp">'+ic('zoom',12)+'büyüt</span></div>'+
          '<div id="v3dAngleWarn">Açı değişti — boyama bu açıyla eşleşmiyor.'+
            '<br><button data-v3d="rerender">'+ic('camera',12)+'Bu açıda yeniden render · 14 Kredi</button></div>';
        overlay.appendChild(thumb);
        thumb.addEventListener('click',function(e){
          if(e.target.closest&&e.target.closest('#v3dAngleWarn')) return;   // uyarı/buton kendi işini yapsın
          openCompareLB();
        });
      }
      const img=thumb.querySelector('#v3dRefImg');
      // utf8 data-URI (btoa DEĞİL): yer-tutucu metni Türkçe "boyalı" içerir → btoa Latin1 dışı karakterde patlar
      if(img) img.src=paintedURL||'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260"><rect width="100%" height="100%" fill="#1a1714"/><text x="50%" y="50%" fill="#7a6f60" font-family="system-ui" font-size="16" text-anchor="middle">boyalı plan bekleniyor</text></svg>');
      thumb.style.display='block';
    } else {
      if(thumb) thumb.style.display='none';
      const lb=overlay.querySelector('#v3dCompareLB'); if(lb) lb.style.display='none';
    }
    resize();
  }
  // boyalı planı tam-ekran lightbox'ta aç (overlay içinde; herhangi bir yere tıkla = kapat).
  function openCompareLB(){
    if(!overlay) return;
    let lb=overlay.querySelector('#v3dCompareLB');
    if(!lb){ lb=document.createElement('div'); lb.id='v3dCompareLB'; lb.innerHTML='<img alt="Boyalı plan">';
      overlay.appendChild(lb); lb.addEventListener('click',function(){ lb.style.display='none'; }); }
    const src=(overlay.querySelector('#v3dRefImg')||{}).src, im=lb.querySelector('img');
    if(src&&im){ im.src=src; lb.style.display='flex'; }
  }
  // ── açı kayması uyarısı (adım 4): kullanıcı mesh'i kilitli render açısından çevirirse sol boyamaya uyarı ──
  function viewDir(v){ if(!v||!v.position||!v.target) return null;
    const dx=v.position.x-v.target.x,dy=v.position.y-v.target.y,dz=v.position.z-v.target.z,l=Math.hypot(dx,dy,dz)||1; return [dx/l,dy/l,dz/l]; }
  function updateAngleWarn(){ const w=overlay&&overlay.querySelector('#v3dAngleWarn'); if(w) w.style.display=(angleDrift&&compareMode)?'block':'none'; }
  function checkAngleDrift(){
    if(!compareMode){ if(angleDrift){ angleDrift=false; updateAngleWarn(); } return; }
    const a=viewDir(lockedViewRef), b=viewDir(getView()); if(!a||!b) return;
    const dot=Math.max(-1,Math.min(1,a[0]*b[0]+a[1]*b[1]+a[2]*b[2])), deg=Math.acos(dot)*180/Math.PI;
    const drift=deg>4;                                       // ~4° üstü sapma = açı değişti say
    if(drift!==angleDrift){ angleDrift=drift; updateAngleWarn(); }
  }
  function doReRender(){
    if(onReRenderCb){ try{ onReRenderCb(getView()); }catch(e){} }
    lockedViewRef=getView(); angleDrift=false; updateAngleWarn();   // yeni açı = yeni kilit
  }
  function close(){ if(walkOn) exitWalk();                   // W1: kapanışta gezinti kilidi bırak
    if(overlay) overlay.style.display='none'; setPlaceMode(false);
    cancelFurnGhost(); if(activeFurnIdx>=0) selectFurn(-1);   // B2-4: kapanışta yarım hayalet + seçim temizlenir
    const dk=overlay&&overlay.querySelector('#v3dCamDock'); if(dk) dk.style.display='none';
    const fd=overlay&&overlay.querySelector('#v3dFurnDock'); if(fd) fd.style.display='none';
    const md=overlay&&overlay.querySelector('#v3dMatDock'); if(md) md.style.display='none';
    const fb=overlay&&overlay.querySelector('#v3dFurnBar'); if(fb) fb.style.display='none';
    topLocked=false; freeSavedView=null; if(controls){ controls.noRotate=false; if(controls.cancelViewTween) controls.cancelViewTween(); } }   // A4: kilit durumunu temizle
  function resize(){ if(!renderer||overlay.style.display==='none') return;
    const w=host.clientWidth,h=host.clientHeight; renderer.setSize(w,h); if(cam){cam.aspect=w/h;cam.updateProjectionMatrix();}
    positionViewCtl(); }
  // U7+R6: ORBIT KÜRE / zoom kolonu sağ-üst RAİL üstüne binmesin (SS kanıtlı). #v3dViewCtl (küre+kilit+zoom)
  //   sağ-altta bottom:14 çapalı, YUKARI büyür. R6 (kök neden): U7 kolona overflowY:auto+maxHeight koymuştu →
  //   viewport biraz kısalınca kolonun (küre+zoom) TAMAMINA dikey KAYDIRMA ÇUBUĞU biniyordu (kullanıcı bunu
  //   'zoom slider'a scroll geldi' diye görür). FIX: scroll TAMAMEN KALDIRILDI (overflow:visible, maxHeight
  //   temizlendi). Rail'e binmemesi için kolonu scroll'la değil, gerekirse alt çapayı yukarı iterek (bottom
  //   artır) rail altında tut → çubuk asla çıkmaz, küre+zoom dikey dizilimi bütün kalır.
  function positionViewCtl(){
    const ctl=overlay&&overlay.querySelector('#v3dViewCtl'); if(!ctl) return;
    ctl.style.overflowY='visible'; ctl.style.overflowX='visible'; ctl.style.maxHeight='';   // R6: scroll YOK
    const dock=overlay.querySelector('#v3dDock');
    const vh=(host&&host.clientHeight)||overlay.clientHeight||810;
    let railBottom=0;
    if(dock){ const r=dock.getBoundingClientRect(), o=overlay.getBoundingClientRect(); railBottom=(r.bottom-o.top); }
    const gap=14, colH=ctl.offsetHeight||0;
    // istenen: kolon tepesi ≥ railBottom+gap  ⇔  bottom ≤ vh − colH − (railBottom+gap). Default 14; sığmazsa clamp.
    const maxBottom=vh - colH - (railBottom + gap);
    ctl.style.bottom=(maxBottom>=14 ? 14 : Math.max(14, maxBottom))+'px';
  }
  function loop(){ raf=requestAnimationFrame(loop);
    if(overlay.style.display!=='none'&&controls){
      if(walkOn){ walkStep(); renderer.render(scene,cam); renderMiniMap(); return; }   // W1: gezinti kendi kamera durumunu sürer (orbit/PiP/koni pass ATLA); R8: minimap scissor-pass (ana pass'ten SONRA)
      controls.update(); renderer.render(scene,cam);
      renderPip();                                           // B1-R (R2): CANLI PiP — seçili kamera perspektifi (scissor pass, sadece kamera grubu+seçim varken)
      checkAngleDrift();                                     // açı kilitten saptı mı → sol uyarı
      updateOrb();                                           // B1-1: yön küresi iğnesini mevcut azimuta döndür (hafif DOM yazımı)
      if(furnMode && activeFurnIdx>=0 && !furnGhost) updateFurnBar();   // B2-3: yüzen mini araç çubuğunu seçili mobilyanın üstünde tut
      if(zoomEl&&!zoomActive) zoomEl.value=distToSlider(controls.getDistance()); } }

  // dışa aç + buton bağla
  window.View3D = { open:open, openCompare:openCompare, close:close, snapDataURL:snapDataURL, getView:getView, restoreView:restoreView,
    snapCameraDataURL:snapCameraDataURL, snapCameraDepthMap:snapCameraDepthMap, captureCameraSnapshots:captureCameraSnapshots,
    setPlaceMode:setPlaceMode, getCameras:getCameras, setCameras:setCameras, exportCameras:exportCameras,
    clearCams:clearCams, deriveShowcaseCameras:deriveShowcaseCameras,
    // B1-4: gün saati — global oku/yaz (iso render köprüsü + prototip). Kamera-başına override camList'te.
    getTimeOfDay:function(){ return timeOfDay; }, setTimeOfDay:function(t){ setTimeOfDay(t,false); },
    // mobilya: map'ten furnList'i tazele + çiz (test + Faz 3). getMap = canlı harita erişimi.
    refreshFurniture:function(){ collectFurnList(); renderFurniture(); }, getMap:function(){ return scene&&scene.__map; },
    setFurnUI:setFurnUI, setFurnMode:setFurnMode, clearFurn:clearFurn, autoFurnishAll:function(){ autoFurnishAll(); },
    // W2/W3 TEST: THREE'siz (headless) oto-döşe — verilen map'in her odasını furnPlaceRoom ile döşer, salt-veri
    //   yerleşim döndürür (kapı/pencere clearance assert'i için). Read-only: scene/DOM'a dokunmaz, kalıcılık YOK.
    furnishMapForTest:function(map){ const out=[];
      (map.units||[]).forEach(function(u){ (u.rooms||[]).forEach(function(r){ r.__an=null;
        out.push({ room_id:r.id, room:r, furniture:furnPlaceRoom(r, map, []) }); }); });
      (map.common_areas||[]).forEach(function(r){ r.__an=null; out.push({ room_id:r.id, room:r, furniture:furnPlaceRoom(r, map, []) }); });
      return out; },
    analyzeRoomForTest:function(room, map){ room.__an=null; return furnAnalyzeRoom(room, map); },
    furnDimForTest:function(type){ return FURN_DIM[type]||null; },
    collisionHoleScan:function(){ return collisionHoleScan(); },   // W5: görsel duvar segmentlerinde çarpışma-deliği taraması
    exportFurniture:exportFurniture, sceneDescription:sceneDescription,
    // MALZEME (M-serisi): preset kataloğu + oda-başına seç/uygula/sıfırla + kalıcılık (test + prototip).
    setMatUI:setMatUI, materialPresets:function(){ return MAT_PRESETS.map(function(p){ return {key:p.key,group:p.group,cls:p.cls,name:p.name}; }); },
    selectMatRoom:selectMatRoom, applyMaterial:applyMaterial, resetRoomMaterial:resetRoomMaterial,
    getMaterials:function(){ return JSON.parse(JSON.stringify(materialOverrides)); }, hydrateMaterials:hydrateMaterials };
  function bind(){
    const btn=document.getElementById('t3d');
    if(btn) btn.addEventListener('click', open);
  }
  if(document.readyState!=='loading') bind(); else document.addEventListener('DOMContentLoaded', bind);
})();
