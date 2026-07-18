'use strict';
/* ================= interaktif onboarding turlari (coklu-tur registry) =================
   KPTA'yi ilk kez acan kullaniciyi gezdiren spotlight'li rehber turlar.
   v2: TEK tur -> TUR REGISTRY'si (ONB_TOURS). Her turun kendi adimlari, kendi
   localStorage anahtarlari (onb.<turId>.status/.step/.v), kendi ctx getter'i,
   kendi tetikleyicisi var. Su an iki tur:
     - 'ana'      : 13 adimlik genel KPTA turu (#onbStart / ?onb=1 / ilk acilis)
     - 'kamera3d' : 3B kamera yerlestirme mini-turu (kamera UI'i acilinca watcher tetikler)

   MIMARI NOTLARI
   - Klasik script (diger modullerle AYNI global scope). Motor globallerini DOGRUDAN
     okur (plan, closed, parcelPts, blocks, activeFloor, editHistory, siteOn(), mode...)
     ama HER ZAMAN typeof-guard'li — cekirdek dosyalara kanca/monkey-patch YOK.
   - Saf mantik (adim dizileri + onbComputeTarget/onbDecideStart/onbWatchDecision/
     onbMigrateLegacy) her ortamda tanimlidir -> headless test edilebilir. check'ler
     yalniz `ctx` uzerinden okur (canli getter tur tanimindaki ctx; testte stub gecilir).
   - ENV GUARD: dosya test harness'inde de eval edilir (window={addEventListener(){}},
     setInterval YOK, window.innerWidth undefined). Auto-start, watcher, setInterval ve
     DOM tel orgusu YALNIZ gercek tarayicida (onbBrowser). Top-level'da yalniz tanim.
   - KAMERA3D SINYALLERI (view3d.js public API, hepsi typeof-guard'li):
       * tetik/adim-oncesi: View3D.isCamUIEnabled() (resmi bayrak); eski gomulu motor icin
         camPreviewForTest().camUI'ye dusulur. Ikisi de yoksa false -> watcher tetiklenmez, tur bozulmaz.
       * kameralar: View3D.getCameras() / getExteriorCameras() / isExteriorMode()
       * 3B gorunurluk: #view3dOverlay VAR ve style.display==='block'
         (view3d.js open'da 'block', close'da 'none'; getMap() close sonrasi null
         OLMADIGINDAN ona guvenilmez). Tur aktifken 3B kapanirsa gizle, acilinca surdur.
   - Z-INDEX: #view3dOverlay inline z-index:9999 -> varsayilan spotlight (60/61) altta
     kalir. kamera3d turunda overlay+karta 'onb3d' sinifi takilir (styles.css:
     #onbOverlay.onb3d z-index:10001, .onbCard.onb3d z-index:10002).
   - SOZLESME (kabuk + styles.css): #onbStart dugmesi; CSS id/class'lari #onbOverlay,
     .onbCard, .onbCard h3/p/.prog/.progBar>i/.onbBtns/.onbSkip/.onbNext/.onbClose,
     .onbPulse, .onb3d.
   - EMOJI YASAK: ikon gerekirse icons.js icon() (typeof-guard'li) ya da duz metin. */

/* ---- senaryo surumleri: adimlar degisince ARTIR -> done/dismissed kullanici yeniden gezer ---- */
const ONB_VERSION = 1;        // 'ana' turu
const ONB_KAM_VERSION = 1;    // 'kamera3d' turu

/* ================= DEMO PAKET HEDEFLERI (ONB_TARGETS) =================
   v2 vizyonu: "paketi vereceğim, onboarding onu kullanıcıya elle çizdirtecek —
   tüm özelliklerini kullanacak." input/proje-20260716-4.mskpkg paketinin olculen
   degerleri INLINE sabit (tekdosya build fetch YAPAMAZ -> ayri JSON YASAK).
   Adim METINLERI buradan turer (koordinat, blok/kose/kat sayilari...).
   ONEMLI (canli /demo geri bildirimi): check'ler ASLA hedef sayiya ZORLAMAZ.
   Hedefler YALNIZ YONLENDIREN METIN; check'lerin tamami JENERIKtir (kapali sinir,
   base'e gore buyume...). Tur kullaniciyi hicbir adimda takili birakmaz.
   parsel.geo = paketten cikan GERCEK parselin motor durumu (parcelPts FINAL/dondurulmus
   yerel koordinat + parcelRot + KIRPILMIS imar); "Ornek parselle devam" bunu yukler. */
const ONB_TARGETS = {
  kaynak:'proje-20260716-4.mskpkg', baslik:'3 daire',
  parsel:{ koordinat:'41.08046386954354, 29.022807303237602',   // TKGM sorgusuna yapistirilacak Google Maps koordinati
           ilce:'BEŞİKTAŞ', mahalle:'AKAT', ada:'2010', parsel:'257', alan:2058,
           imar:{ emsal:3, maksTaks:0.75, hmax:15.5 },
           /* GERCEK parsel — motorun bir TKGM yuklemesinden sonra tuttugu (ve .mskpkg'e
              serilestirdigi) durumun BIREBIR aynisi: parcelPts zaten eksene-hizali FINAL
              koordinat (psAutoAngle(pts)=0), parcelRot uygulanan donme (rad). imar KIRPILMIS
              (scan/snippet blobu YOK) — imarRender tum alanlari null-guard'li okur. */
           geo:{ pts:[{x:43,y:12.5},{x:44.5,y:-16},{x:-31,y:-16},{x:-30,y:8.5},{x:-27,y:11}],
                 closed:true, rot:-1.5153036887208142,
                 imar:{ ada:'2010', parsel:'257', mahalle:'AKAT', ilce:'BEŞİKTAŞ', alan:2058,
                        fonksiyon:'YUKSEK YOGUNLUKTA KONUT ALANI', yogunluk:350,
                        minTaks:null, maksTaks:0.75, emsal:3, hmax:15.5, katAdedi:null,
                        planAdi:'BESIKTAS GERI GORUNUM VE ETKILENME BOLGESI RNIP',
                        planNotuId:null, scan:null, deferred:false, provider:'istanbul' } } },
  bina:{ tip:'apartman', kat:4, bodrum:2, cati:'kirma' },
  sinir:{ kose:8, sekil:'L' },
  bloklar:2,
  daireler:[ {oda:2, salon:1, acikMutfak:true, adet:1}, {oda:3, salon:1, ensuite:true, adet:2} ],
  balkon:10, kesme:3,
  kamera:{ ic:7, drone:3 },
  /* ================= GHOST (hayalet) HEDEF AYAK IZLERI =================
     demo paketin GERCEK blok + site-imkan geometrileri, parselle AYNI yerel metre
     uzayinda (onbDemoParcel direct-set bu uzayi yukler -> ghost'lar parselin uzerine
     birebir oturur). Cizim adimlarinda tuvale SOLUK KESIKLI poligon/kutu olarak enjekte
     edilir; ziyaretci ustunden kose kose cizer ("birebir bizim blogu cizdirmeli").
     ONEMLI: check'ler YINE JENERIK (kapali sinir / sayi artisi) — hayalet YALNIZ
     yonlendirir, birebir oturtma DENETIMI YOK. */
  blokA:{ label:'A', alan:240,
          pts:[{x:-25,y:-10},{x:-25,y:2},{x:-5,y:2},{x:-5,y:-10}] },
  blokB:{ label:'B', alan:420,
          pts:[{x:38.5,y:-11.5},{x:38.5,y:8.5},{x:28.5,y:8.5},{x:28.5,y:4.5},
               {x:28.5,y:-1.5},{x:6.5,y:-1.5},{x:6.5,y:-11.5},{x:28.5,y:-11.5}] },
  imkanlar:[ {type:'green',      x:-30.5, y:-16,  w:37,   h:6},
             {type:'playground', x:-5,    y:-10,  w:8.5,  h:5},
             {type:'pool',       x:0,     y:-0.5, w:21.5, h:8},
             {type:'green',      x:6.5,   y:-16,  w:37.5, h:4.5},
             {type:'ornament',   x:-23,   y:4.5,  w:4,    h:3},
             {type:'ornament',   x:-11.5, y:4.5,  w:4,    h:3},
             {type:'green',      x:-19,   y:4,    w:7.5,  h:4},
             {type:'green',      x:21.5,  y:-1.5, w:7,    h:4},
             {type:'green',      x:23,    y:4.5,  w:5.5,  h:7.5} ]
};

/* TUMU-BUYUK il/mahalle adini baslik-harfe cevirir (Turkce-farkinda; toLowerCase'in
   'İ' -> 'i̇' bozulmasindan kacinmak icin ozel harfler ONCE elle map'lenir):
   'BEŞİKTAŞ' -> 'Beşiktaş', 'AKAT' -> 'Akat'. Saf; metin uretiminde kullanilir. */
function onbTr(s){
  s = String(s==null ? '' : s);
  if(!s) return s;
  const rest = s.slice(1)
    .replace(/İ/g,'i').replace(/I/g,'ı').replace(/Ş/g,'ş').replace(/Ğ/g,'ğ')
    .replace(/Ü/g,'ü').replace(/Ö/g,'ö').replace(/Ç/g,'ç').toLowerCase();
  return s.charAt(0) + rest;
}
/* daire karmasini okunur metne cevirir:
   "1 daire 2+1 açık mutfak + 2 daire 3+1 ensuite" (ONB_TARGETS.daireler'den turer). */
function onbDaireOzet(){
  try{
    return ONB_TARGETS.daireler.map(function(d){
      let t = d.adet+' daire '+d.oda+'+'+d.salon;
      if(d.acikMutfak) t += ' açık mutfak';
      if(d.ensuite)    t += ' ensuite';
      return t;
    }).join(' + ');
  }catch(e){ return ''; }
}
/* Site imkanlarini okunur ozete cevirir (ONB_TARGETS.imkanlar tiplerini sayarak):
   "yüzme havuzu, çocuk parkı, 5 yeşil alan, 2 süs havuzu". Tekil ad; >1'de sayi oneki.
   imkan-koy adim metni buradan turer -> gercek pakette kac tane varsa metin ONU soyler. */
const ONB_IMKAN_AD = { pool:'yüzme havuzu', playground:'çocuk parkı', green:'yeşil alan', ornament:'süs havuzu', seating:'oturma alanı' };
function onbImkanOzet(){
  try{
    const order=['pool','playground','green','ornament','seating'], cnt={};
    ONB_TARGETS.imkanlar.forEach(function(a){ cnt[a.type]=(cnt[a.type]||0)+1; });
    return order.filter(function(t){ return cnt[t]; }).map(function(t){
      const ad=ONB_IMKAN_AD[t]||t; return cnt[t]>1 ? (cnt[t]+' '+ad) : ad;
    }).join(', ');
  }catch(e){ return ''; }
}
/* SAF (DOM YOK): aktif adimin ghost spec'inden cizilecek {polys, rects} uretir.
   spec.blocks:['blokA'|'blokB'] -> ONB_TARGETS[k].pts poligonlari (+label harfi);
   spec.amenities:true -> ONB_TARGETS.imkanlar dikdortgenleri. onbDrawGhosts bunu
   W2Sx/W2Sy ile tuvale cizer; headless test dogrudan cagirir (DOM'suz). */
function onbGhostPolys(spec){
  const out={ polys:[], rects:[] };
  if(!spec || typeof ONB_TARGETS!=='object' || !ONB_TARGETS) return out;
  if(Array.isArray(spec.blocks)){
    for(let i=0;i<spec.blocks.length;i++){
      const geo=ONB_TARGETS[spec.blocks[i]];
      if(geo && Array.isArray(geo.pts) && geo.pts.length>=3) out.polys.push({ pts:geo.pts, label:geo.label||'' });
    }
  }
  if(spec.amenities && Array.isArray(ONB_TARGETS.imkanlar)){
    for(let i=0;i<ONB_TARGETS.imkanlar.length;i++) out.rects.push(ONB_TARGETS.imkanlar[i]);
  }
  return out;
}

/* ================= ANA TUR — 14 adim =================
   v3 (canli /demo: "birebir bizim demodaki iki bloku cizdirmeli, site imkanlarini
   koymali; cekme mesafesi cizdirmesin"): tur artik ORNEK-PROJE rehberi. cekme-yol
   adimi GOREV OLMAKTAN CIKTI (parsel-getir govdesinde "otomatik uygulanir" notu);
   sinir-ciz -> "Blok A'yi ciz" (HAYALET), blok-ekle sonrasi "blok-b-ciz" (L HAYALET)
   ve "imkan-koy" (9 imkan HAYALETI) adimlari eklendi.
   Adim semasi: {id, title, body, target:{type:'dom',sel}|{type:'canvas'[,sel]},
   needsPro, skippable, baseline?(ctx)->v, check(ctx, base)->bool, action?:{label,run},
   ghost?:{blocks:['blokA'|'blokB'], amenities:bool}} — ghost = cizim adiminda tuvale
   enjekte edilen SOLUK KESIKLI hedef ayak izi (onbDrawGhosts; check'i ETKILEMEZ, JENERIK kalir).
   check() YALNIZ ctx uzerinden okur (canli: onbLiveCtx; test: stub). */
const ONB_STEPS = [
  { id:'pro-mod', needsPro:false, skippable:false,
    title:'Profesyonel moda geç',
    body:'Parsel ve imar araçları Profesyonel modda açılır. Üst köşedeki Profesyonel düğmesine dokun.',
    /* GIRIS-SAGLANMIS (Pro zaten acik) durumda kartta gosterilen uyarlanabilir metin —
       oto-atlama YOK, İleri ile gecilir (canli /demo: "1. adimi atliyor" fix). */
    bodyDone:'Profesyonel mod zaten açık — İleri ile devam et.',
    target:{type:'dom', sel:'#modePro'},
    check:function(ctx){ return ctx.modePro(); } },

  { id:'parsel-sekme', needsPro:true, skippable:false,
    title:'Parsel/İmar sekmesi',
    body:'Sol paneldeki Parsel/İmar sekmesini aç — parseli buradan getireceğiz. Örnek: ada '+ONB_TARGETS.parsel.ada+' parsel '+ONB_TARGETS.parsel.parsel+', emsal '+ONB_TARGETS.parsel.imar.emsal+'.',
    target:{type:'dom', sel:'.ptab[data-tab="parsel"]'},
    check:function(ctx){ return ctx.tabActive(); } },

  { id:'parsel-getir', needsPro:true, skippable:true,
    title:'Parseli getir',
    /* cekme-yol adimi KALKTI (canli /demo: "cekme mesafesi cizdirmesin") -> cekme
       sinirinin otomatik oldugu tek cumleyle burada anlatilir. */
    body:'Koordinat ya da Google Maps bağlantısıyla gerçek parseli çek. Örnek projenin parseli: '+onbTr(ONB_TARGETS.parsel.ilce)+'/'+onbTr(ONB_TARGETS.parsel.mahalle)+', ada '+ONB_TARGETS.parsel.ada+' parsel '+ONB_TARGETS.parsel.parsel+' ('+ONB_TARGETS.parsel.alan+' m2). TKGM sorgusuna şu koordinatı yapıştır: '+ONB_TARGETS.parsel.koordinat+'. Denemek istersen örnek parselle de devam edebilirsin. Çekme sınırı örnek imardan otomatik uygulanır (kesikli çizgi).',
    target:{type:'dom', sel:'#psFetch'},
    action:{ label:'Örnek parselle devam', run:function(){ onbDemoParcel(); } },
    check:function(ctx){ return ctx.parcelLen() >= 3; } },

  { id:'sinir-ciz', needsPro:false, skippable:false,
    title:'Blok A\'yı çiz',
    /* HAYALET + ELLE CIZDIR (canli /demo: "birebir bizim blogu cizdirmeli"): tuvalde
       soluk kesikli Blok A ayak izi (ghost) gorunur, ziyaretci Çiz araciyla ustunden
       kose kose gider. psDrawBld oto-cizen kisayol notu KALKTI (hayaletle celisirdi). */
    ghost:{ blocks:['blokA'] },
    body:'Çiz aracıyla tuvaldeki soluk kesikli Blok A hayaletinin üstünden köşe köşe tıkla, ilk köşeye dönerek kapat. Örnek Blok A basit bir dörtgen ('+ONB_TARGETS.blokA.alan+' m2).',
    target:{type:'dom', sel:'#tDraw'},
    /* JENERIK: sinir KAPANDI mi (kapali poligon). Hayalet YALNIZ yonlendirir;
       kullaniciyi belli bir kose sayisina/konuma ZORLAMAZ. */
    check:function(ctx){ return !!ctx.closed(); } },

  { id:'yerlesim', needsPro:false, skippable:false,
    title:'Yerleşimi oluştur',
    body:'"Yerleşimi Oluştur" düğmesi daireleri otomatik yerleştirir. Örnek projede katta '+ONB_TARGETS.baslik+': '+onbDaireOzet()+'.',
    target:{type:'dom', sel:'#genBtn'},
    check:function(ctx){ return !!ctx.plan(); } },

  { id:'oda-duzenle', needsPro:false, skippable:false,
    title:'Odaları düzenle',
    body:'Tuvalde duvarları sürükle, oda tiplerini değiştir — plan senin elinde şekillenir. Örnek projede '+ONB_TARGETS.kesme+' kesme ile daireler ayrıldı.',
    target:{type:'canvas'},
    baseline:function(ctx){ return ctx.editCount(); },
    check:function(ctx, base){ return ctx.editCount() > (base||0); } },

  { id:'kapi-pencere', needsPro:false, skippable:true,
    title:'Kapı ve pencere',
    body:'Kapı ya da Pencere aracını seç, duvara tıklayarak ekle veya taşı. Örnek projede '+ONB_TARGETS.balkon+' balkon var.',
    target:{type:'dom', sel:'#tDoor'},
    baseline:function(ctx){ return ctx.doorWinCount(); },
    check:function(ctx, base){ return ctx.doorWinCount() > (base||0); } },

  { id:'site-ac', needsPro:true, skippable:true,
    title:'Site modunu aç',
    body:'Birden çok blok yerleştirmek için Site (çoklu blok) anahtarını aç.',
    target:{type:'dom', sel:'#siteMod'},
    check:function(ctx){ return ctx.siteOn(); } },

  { id:'blok-ekle', needsPro:false, skippable:true,
    title:'Blok ekle',
    body:'Yeni blok ekleyip her birini ayrı planlayabilirsin. Blok sekmelerinden "+ Blok" ile ekle. Örnek projede '+ONB_TARGETS.bloklar+' blok (A+B).',
    target:{type:'dom', sel:'#blockTabs'},
    baseline:function(ctx){ return ctx.blocksLen(); },
    /* JENERIK: bloga en az bir YENI blok eklendi mi (base'e gore buyume). Hedef "2 blok"
       YALNIZ metinde; kullaniciyi 2 bloga ZORLAMAZ (takilma riski -> hedefli >=2 dali KALDIRILDI). */
    check:function(ctx, base){ return ctx.blocksLen() > (base||0); } },

  { id:'blok-b-ciz', needsPro:false, skippable:true,
    title:'Blok B\'yi çiz',
    /* +Blok yeni blogu BOS getirir (app.js clearCanvasForNewBlock: pts=[], closed=false)
       ve otomatik Çiz moduna dusurur. Tuvalde Blok B'nin L hayaleti gorunur; ziyaretci
       ustunden kose kose cizer ("birebir bizim bloku"). */
    ghost:{ blocks:['blokB'] },
    body:'Yeni blok boş geldi. Çiz aracıyla soluk kesikli Blok B hayaletinin üstünden köşe köşe git, ilk köşeye dönerek kapat. Örnek Blok B '+ONB_TARGETS.sinir.kose+' köşeli bir '+ONB_TARGETS.sinir.sekil+' ('+ONB_TARGETS.blokB.alan+' m2).',
    target:{type:'dom', sel:'#tDraw'},
    /* JENERIK: yeni blogun sinir KAPANDI mi (global closed — sinir-ciz ile AYNI sinyal;
       taze blokta girişte false). L kose sayisina ZORLAMAZ. */
    check:function(ctx){ return !!ctx.closed(); } },

  { id:'imkan-koy', needsPro:false, skippable:true,
    title:'Site imkanlarını yerleştir',
    /* Site imkan araci (#tAmenity) bir sinir cizilince gorunur. Tuvalde 9 imkan hayaleti
       (havuz/yesil/oyun/sus) kesikli kutu + tip etiketiyle gorunur; ziyaretci ustlerine
       yerlestirir. amenities MUTLAK dunya-metre (parsel-ortak). */
    ghost:{ amenities:true },
    body:'Site imkanları aracını (ağaç ikonu) aç. Örnek sitede '+onbImkanOzet()+' var — havuzdan başla, hayalet kutuların üstüne yerleştir.',
    target:{type:'dom', sel:'#tAmenity'},
    baseline:function(ctx){ return ctx.amenitiesLen(); },
    /* JENERIK: en az BIR yeni imkan eklendi mi (base'e gore buyume). 9'a ZORLAMAZ. */
    check:function(ctx, base){ return ctx.amenitiesLen() > (base||0); } },

  { id:'kat-ayri', needsPro:true, skippable:true,
    title:'Katları ayrı planla',
    body:'Her katı bağımsız planlamak için "Katları ayrı planla" anahtarını aç. Örnek projede '+ONB_TARGETS.bina.kat+' normal kat + '+ONB_TARGETS.bina.bodrum+' bodrum var.',
    target:{type:'dom', sel:'#katAyri'},
    check:function(ctx){ return ctx.katAyri(); } },

  { id:'kat-gez', needsPro:false, skippable:true,
    title:'Katlarda gez',
    body:'Kat sekmelerinden katlar arasında geç; kat kullanımını (konut, ticari, otopark) seç. Örnek projede '+ONB_TARGETS.bina.kat+' kat + '+ONB_TARGETS.bina.bodrum+' bodrum.',
    target:{type:'dom', sel:'#floorTabs'},
    baseline:function(ctx){ return ctx.floorSig(); },
    check:function(ctx, base){ return ctx.floorSig() !== base; } },

  { id:'export', needsPro:false, skippable:false,
    title:'Planı dışa aktar',
    body:'Hazır! Planı SVG olarak indir ya da daha sonra "İçe aktar" ile geri yükle.',
    target:{type:'dom', sel:'#svgBtn'},
    check:function(ctx){ return ctx.exportClicked(); } }
];

/* ================= KAMERA3D MINI-TURU — 6 adim =================
   NOT: plandaki 1-2 BIRLESTIRILDI — "kamera-araci" adiminin tamamlanma sinyali
   (camUI aktif) turun TETIGIYLE ayni oldugundan adim aninda gecerdi (bos adim);
   rail bilgisi kamera-koy'un govdesine tasindi. Tum check'ler ctx (View3D poll'u). */
const ONB_KAM_STEPS = [
  { id:'kamera-koy', skippable:true,
    title:'Kamera yerleştir',
    body:'Kamera aracı raydan açıldı. Dock\'taki Ekle ile plana iç kamera koy — tıkladığın nokta kameranın yeri olur. Örnek projede '+ONB_TARGETS.kamera.ic+' iç kamera var.',
    target:{type:'dom', sel:'#v3dPlaceBtn'},
    baseline:function(ctx){ return ctx.camCount(); },
    check:function(ctx, base){ return ctx.camCount() > (base||0); } },

  { id:'aci-ayarla', skippable:true,
    title:'Açıyı ayarla',
    body:'Kamerayı sürükleyerek taşı ya da Yön ile bakış noktasını değiştir — önizleme anında güncellenir.',
    target:{type:'canvas', sel:'#view3dOverlay canvas'},
    baseline:function(ctx){ return ctx.lastCamSig(); },
    check:function(ctx, base){ return ctx.camCount() > 0 && ctx.lastCamSig() !== base; } },

  { id:'lens-sec', skippable:true,
    title:'Lens seç',
    body:'16-24-35-50 mm lensler görüş açısını değiştirir: küçük sayı geniş açı, büyük sayı yakın plan.',
    target:{type:'dom', sel:'#v3dLRow'},
    baseline:function(ctx){ return ctx.lensSig(); },
    check:function(ctx, base){ return ctx.lensSig() !== base; } },

  { id:'drone-gec', skippable:true,
    title:'Drone moduna geç',
    body:'Dış çekim için raydan Drone aracına geç — sahne dış cepheye döner.',
    target:{type:'dom', sel:'[data-grp="drone"]'},
    check:function(ctx){ return ctx.extMode(); } },

  { id:'drone-ekle', skippable:true,
    title:'Drone kamerası ekle',
    body:'"+ Drone Ekle" ile binanın etrafına dış kamera yerleştir. Örnek projede '+ONB_TARGETS.kamera.drone+' drone açısı var.',
    target:{type:'dom', sel:'[data-v3d="extadd"]'},
    baseline:function(ctx){ return ctx.extCount(); },
    check:function(ctx, base){ return ctx.extCount() > (base||0); } },

  { id:'render-isaret', skippable:false,
    title:'Dış Render',
    /* ana KPTA'da mevcut metin AYNEN; gomulu mesken prototipinde (onbInIframe) akis
       turu kabukta surer -> bodyIframe dali onbStepBody ile secilir. */
    body:'Hazır! Dış Render düğmesi yerleştirdiğin drone açılarından görsel üretir. İstediğin zaman buradan devam edebilirsin.',
    bodyIframe:'Sağ alttaki \'Render Kadrajları\' düğmesiyle Render adımına geç — akış turu kabukta devam eder.',
    target:{type:'dom', sel:'[data-v3d="extrender"]'},
    action:{ label:'Bitir', run:function(){ onbFinish(); } },
    check:function(ctx){ return ctx.extRenderClicked(); } }
];

/* ================= TUR REGISTRY =================
   {id, version, steps, ctx()->stateGetter, iframeAuto (iframe'de auto-start OK),
    zBoost ('onb3d' sinifi tak), visible?()->bool (false iken turu gizle/duraklat),
    watch (arka plan watcher'i bu turu tetikler)} */
const ONB_TOURS = [
  { id:'ana',      version:ONB_VERSION,     steps:ONB_STEPS,     ctx:function(){ return onbLiveCtx(); },
    iframeAuto:false, zBoost:false, visible:null, watch:false },
  { id:'kamera3d', version:ONB_KAM_VERSION, steps:ONB_KAM_STEPS, ctx:function(){ return onbKamCtx(); },
    iframeAuto:true,  zBoost:true,  visible:function(){ return onbV3dVisible(); }, watch:true }
];
function onbTourById(id){ for(let i=0;i<ONB_TOURS.length;i++) if(ONB_TOURS[i].id===id) return ONB_TOURS[i]; return null; }

/* ================= saf durum makinesi (her ortamda) ================= */

/* ARDISIK KAPI: 0'dan tarar, ILK "duracak" adimin indeksini doner. Adim durur ise:
     (a) check SAGLANMIYOR (kullanici o adimi yapmali), VEYA
     (b) check saglaniyor AMA giris-saglanmis-İleri-bekliyor (gate[i]) — oto-atlama yok.
   Tumu gecer (hicbiri durmaz) -> steps.length (= tur bitti).
   ESKI davranis "en ileri saglanan+1" (gap'te ileri firlatirdi) DEGISTI: canli /demo
   raporu "1. adimi atliyor" -> saglanmis bas adimlari sessizce yutmak YASAK; tur
   ADIM ADIM ilerler, giris-saglanmis adimda İleri düğmesiyle durur.
   bases: {idx:baseline} — ziyaret edilmis baseline'li adimlarin yakalanmis tabanlari.
   gate:  {idx:bool}     — o adima GIRISTE check zaten saglaniyordu (İleri bekliyor). */
function onbComputeTarget(steps, ctx, bases, gate){
  for(let i=0; i<steps.length; i++){
    const s = steps[i];
    let base;
    if(bases && (i in bases)) base = bases[i];
    else if(s.baseline){ try{ base = s.baseline(ctx); }catch(e){ base = undefined; } }
    let ok = false;
    try{ ok = !!s.check(ctx, base); }catch(e){ ok = false; }
    if(!ok) return i;                 // ilk saglanmayan -> burada dur
    if(gate && gate[i]) return i;     // giris-saglanmis ama İleri bekliyor -> burada dur
  }
  return steps.length;                // tumu gecti => tur bitti
}

/* Depolanmis duruma gore baslatma karari: 'start' | 'resume' | 'idle'.
   Senaryo surumu degismisse (v!==ver) done/dismissed dahi olsa yeniden gezdir. */
function onbDecideStart(stored, force, ver){
  if(ver===undefined) ver=ONB_VERSION;
  if(force) return 'start';
  if(stored && stored.status === 'active') return (stored.v === ver) ? 'resume' : 'start';
  if(stored && (stored.status === 'done' || stored.status === 'dismissed'))
    return (stored.v === ver) ? 'idle' : 'start';
  return 'start';   // hic durum yok -> ilk kez
}

/* Watcher karari (kamera3d tetigi) — SAF: env={active,inIframe,visible,camUI}.
   FARK: iframeAuto'lu tur iframe'de DE tetiklenir (mesken prototipi kamera adimi
   bu turun asil sahnesi); digerleri iframe'de tetiklenmez. */
function onbWatchDecision(tour, env, stored){
  if(!tour || !tour.watch) return null;
  if(env.active) return null;                       // zaten bir tur calisiyor
  if(env.inIframe && !tour.iframeAuto) return null;
  if(!env.visible || !env.camUI) return null;
  const d = onbDecideStart(stored, false, tour.version);
  return (d==='start' || d==='resume') ? d : null;
}

/* Eski TEK-TUR anahtarlarini (onb.status/.step/.v) 'ana' turuna tasi.
   KARAR: v-bump DEGIL migrasyon — mevcut kullanicinin done/dismissed durumu
   korunur (ana turu yeniden dayatilmaz). Idempotent; eski anahtarlar silinir. */
function onbMigrateLegacy(){
  const st = onbGet('onb.status');
  if(st == null) return false;
  if(onbGet('onb.ana.status') == null){
    onbSet('onb.ana.status', st);
    const sp = onbGet('onb.step'); if(sp != null) onbSet('onb.ana.step', sp);
    const v  = onbGet('onb.v');    if(v  != null) onbSet('onb.ana.v', v);
  }
  onbDel('onb.status'); onbDel('onb.step'); onbDel('onb.v');
  return true;
}

/* ================= canli state getter'lar (tarayici; testte stub) ================= */
function onbEl(id){ try{ return (typeof document!=='undefined' && document.getElementById) ? document.getElementById(id) : null; }catch(e){ return null; } }
function onbSel(sel){ try{ return (typeof document!=='undefined' && document.querySelector) ? document.querySelector(sel) : null; }catch(e){ return null; } }
function onbHasBodyClass(c){ try{ return !!(document.body && document.body.classList && document.body.classList.contains(c)); }catch(e){ return false; } }
function onbVisible(el){ try{ const r=el.getBoundingClientRect(); return r.width>0 && r.height>0; }catch(e){ return false; } }
function onbEsc(s){ return String(s==null?'':s).replace(/[&<>]/g, c=> c==='&'?'&amp;' : c==='<'?'&lt;' : '&gt;'); }

function onbDoorWinCount(){
  if(typeof editHistory==='undefined' || !editHistory || !editHistory.length) return 0;
  let n=0; for(let i=0;i<editHistory.length;i++){ const e=editHistory[i]; if(e && (e.type==='door' || e.type==='window')) n++; }
  return n;
}
function onbCekmeSig(){
  const ids=['psCekme','psCekmeOn','psCekmeYan','psCekmeArka']; let s='';
  for(let i=0;i<ids.length;i++){ const el=onbEl(ids[i]); s += '|' + (el ? String(el.value) : ''); }
  return s;
}
function onbFloorSig(){
  const f = (typeof activeFloor!=='undefined') ? activeFloor : 0;
  const kk = onbEl('katKullanim');
  return f + '|' + (kk ? String(kk.value) : 'konut');
}
/* CTX = check'lerin okudugu CANLI durum. check'ler JENERIK -> ONB_TARGETS'i (hedefleri)
   OKUMAZ; hedefler yalniz adim METINLERINDE gecer (ONB_TARGETS'tan dogrudan). Bu yuzden
   ctx'te 'targets' ya da 'ptsLen' YOK (hedef-bagli tolerans kaldirildi). */
function onbLiveCtx(){
  return {
    modePro:      function(){ return onbHasBodyClass('mode-pro'); },
    tabActive:    function(){ const e=onbSel('.ptab[data-tab="parsel"]'); return !!(e && e.classList && e.classList.contains('active')); },
    parcelLen:    function(){ return (typeof parcelPts!=='undefined' && parcelPts) ? parcelPts.length : 0; },
    frontEdge:    function(){ return (typeof psFrontEdge!=='undefined') ? psFrontEdge : -1; },
    cekme:        function(){ return onbCekmeSig(); },
    closed:       function(){ return (typeof closed!=='undefined') ? !!closed : false; },
    plan:         function(){ return (typeof plan!=='undefined') ? plan : null; },
    editCount:    function(){ return (typeof editHistory!=='undefined' && editHistory) ? editHistory.length : 0; },
    doorWinCount: function(){ return onbDoorWinCount(); },
    siteOn:       function(){ return (typeof siteOn==='function') ? !!siteOn() : false; },
    blocksLen:    function(){ return (typeof blocks!=='undefined' && blocks) ? blocks.length : 0; },
    amenitiesLen: function(){ return (typeof amenities!=='undefined' && amenities) ? amenities.length : 0; },
    katAyri:      function(){ const e=onbEl('katAyri'); return !!(e && e.checked); },
    floorSig:     function(){ return onbFloorSig(); },
    exportClicked:function(){ return !!onbExportFlag; }
  };
}

/* --- kamera3d ctx: View3D public API poll'u (hepsi try/catch + typeof guard) --- */
function onbV3d(){ try{ return (typeof window!=='undefined' && window.View3D) ? window.View3D : null; }catch(e){ return null; } }
function onbV3dVisible(){
  const o=onbEl('view3dOverlay');
  return !!(o && o.style && o.style.display==='block');
}
function onbKamCams(){ const v=onbV3d(); try{ return (v && typeof v.getCameras==='function') ? (v.getCameras()||[]) : []; }catch(e){ return []; } }
function onbKamExt(){ const v=onbV3d(); try{ return (v && typeof v.getExteriorCameras==='function') ? (v.getExteriorCameras()||[]) : []; }catch(e){ return []; } }
function onbKamCtx(){
  return {
    /* kamera3d check'leri >=1 (jenerik); ONB_TARGETS yalniz metinde. resmi bayrak
       isCamUIEnabled; eski motor gomulmusse camPreviewForTest'e (teshis ucu) dusulur */
    camUI:function(){ const v=onbV3d();
      try{
        if(v && typeof v.isCamUIEnabled==='function') return !!v.isCamUIEnabled();
        return !!(v && typeof v.camPreviewForTest==='function' && v.camPreviewForTest().camUI);
      }catch(e){ return false; } },
    camCount:function(){ return onbKamCams().length; },
    /* aktif kamera indeksi public DEGIL -> son eklenen (dizinin sonu) izlenir */
    lastCamSig:function(){ const c=onbKamCams(); if(!c.length) return '';
      try{ const l=c[c.length-1], r=function(n){ return Math.round((+n||0)*100)/100; };
        return [r(l.pos.x),r(l.pos.y),r(l.pos.z),r(l.target.x),r(l.target.y),r(l.target.z)].join(','); }
      catch(e){ return ''; } },
    lensSig:function(){ try{ return onbKamCams().map(function(c){ return c.lens||24; }).join(','); }catch(e){ return ''; } },
    extMode:function(){ const v=onbV3d();
      try{ return !!(v && typeof v.isExteriorMode==='function' && v.isExteriorMode()); }catch(e){ return false; } },
    extCount:function(){ return onbKamExt().length; },
    extRenderClicked:function(){ return !!onbExtRenderFlag; }
  };
}

/* "Ornek parselle devam" -> AG CAGRISIZ demo parseli yukle = BIZIM parsel
   (ONB_TARGETS.parsel.geo, proje-20260716-4.mskpkg'den; Besiktas/Akat ada 2010 parsel 257).
   YAKLASIM: statik dikdortgen + tkgmLoadParcel YERINE, motorun bir GERCEK TKGM yuklemesinden
   sonra tuttugu durumu (parcelPts=FINAL koordinat, parcelRot, parcelImar) DOGRUDAN kur —
   geo.pts zaten eksene-hizali (psAutoAngle=0) oldugundan tkgmLoadParcel'i taklit etmeye gerek yok;
   bu yol parcelPts'i verilen 5 nokta ile BIREBIR birakir (aksi halde auto-align + grid-snap ile
   deger kayabilirdi). Butun motor globalleri/fonksiyonlari typeof-guard'li -> headless test guvenli.
   ONEMLI: parsel.js applyData() (gercek TKGM akisi) parseli yukledikten sonra #psImar blogunu
   acar (display:block) — adim 5'in hedefi #psDrawBld o blogun ICINDE; applyData closure'i
   disaridan cagirilamadigindan esdeger reveal'i + imarRender'i burada yapariz; imarLoad (ag) atlanir. */
function onbDemoParcel(){
  const geo = ONB_TARGETS && ONB_TARGETS.parsel && ONB_TARGETS.parsel.geo;
  if(!geo || !Array.isArray(geo.pts) || geo.pts.length<3) return;
  /* 1) geometri + imar durumu: motor globallerini GERCEK yuklemenin birakacagi hale kur */
  try{ if(typeof parcelPts!=='undefined')    parcelPts    = geo.pts.map(function(p){ return {x:p.x, y:p.y}; }); }catch(e){}
  try{ if(typeof parcelClosed!=='undefined') parcelClosed = geo.closed!==false; }catch(e){}
  try{ if(typeof parcelRot!=='undefined')    parcelRot    = (typeof geo.rot==='number') ? geo.rot : 0; }catch(e){}
  try{ if(typeof psFrontEdge!=='undefined')  psFrontEdge  = -1; }catch(e){}   // yeni parsel -> yol cephesi secimi sifir
  try{ if(typeof parcelImar!=='undefined')   parcelImar   = geo.imar ? Object.assign({}, geo.imar) : null; }catch(e){}
  /* 2) motorun kendi hattini calistir (hepsi guard'li): cekme zarfi + imar paneli + kadraj */
  try{ if(typeof psComputeSetback==='function') psComputeSetback(); }catch(e){}
  try{ if(typeof imarRender==='function') imarRender((typeof parcelImar!=='undefined') ? parcelImar : null); }catch(e){}   // #psImarBilgi doldurur
  try{ if(typeof psSyncRotUI==='function') psSyncRotUI(); }catch(e){}
  /* 3) #psImar blogunu ac (applyData esdegeri reveal) -> #psDrawBld gorunur */
  const imar=onbEl('psImar'); if(imar && imar.style) imar.style.display='block';
  /* 4) tuval + kadraj */
  try{ if(typeof render==='function') render(); }catch(e){}
  try{ if(typeof fitView==='function') fitView(); }catch(e){}
  /* 5) bilgi mesaji */
  const msg=onbEl('psMsg');
  if(msg && msg.style){ msg.style.display='block'; msg.className='ps-msg ps-ok';
    msg.innerHTML='Örnek parsel yüklendi <span class="ps-dim">('+onbEsc(onbTr(ONB_TARGETS.parsel.ilce))+'/'+onbEsc(onbTr(ONB_TARGETS.parsel.mahalle))+', ada '+onbEsc(ONB_TARGETS.parsel.ada)+' parsel '+onbEsc(ONB_TARGETS.parsel.parsel)+' — demo, TKGM sorgusu yapılmadı)</span>'; }
}

/* ================= calisma zamani denetleyicisi (yalniz tarayici) ================= */
let onbTour     = null;          // aktif tur (ONB_TOURS elemani) | null
let onbActive   = false;
let onbIdx      = 0;
let onbPaused   = false;         // needsPro adiminda Basit moda dusuldu -> duraklat karti
let onbHidden   = false;         // tur.visible() false (3B kapandi) -> UI gizli, bekle
let onbBases    = {};            // {idx: yakalanmis baseline}
let onbGate     = {};            // {idx: bool} — o adima GIRISTE check saglaniyordu -> İleri bekliyor (oto-atlama yok)
let onbTimer    = null;          // ~250ms algilama dongusu (tur aktifken)
let onbWatchTimer = null;        // ~750ms tetik watcher'i (kamera3d)
let onbRaf      = 0;             // spotlight takip rAF
let onbExportFlag = false;       // #svgBtn/#impBtn tiklandi (ana adim 13)
let onbExtRenderFlag = false;    // [data-v3d="extrender"] tiklandi (kamera3d adim 6)
let onbUI       = null;          // {svg,bg,hole,holeC,dim,card}
let onbWired    = false;         // resize/scroll dinleyicisi bir kez

function onbBrowser(){ return typeof window!=='undefined' && typeof window.innerWidth==='number' && typeof document!=='undefined'; }

/* --- localStorage (try/catch) — anahtarlar TUR-KAPSAMLI: onb.<turId>.<alan> --- */
function onbGet(k){ try{ return (typeof localStorage!=='undefined' && localStorage) ? localStorage.getItem(k) : null; }catch(e){ return null; } }
function onbSet(k,v){ try{ if(typeof localStorage!=='undefined' && localStorage) localStorage.setItem(k,v); }catch(e){} }
function onbDel(k){ try{ if(typeof localStorage!=='undefined' && localStorage && localStorage.removeItem) localStorage.removeItem(k); }catch(e){} }
function onbStepStored(tour){ const n=parseInt(onbGet('onb.'+tour.id+'.step'),10); return isNaN(n)?0:n; }
function onbStored(tour){
  return { status:onbGet('onb.'+tour.id+'.status'),
           v:(parseInt(onbGet('onb.'+tour.id+'.v'),10)||0),
           step:onbStepStored(tour) };
}

function onbUrlForce(){
  try{ return typeof location!=='undefined' && location.search && /[?&]onb=1(?:&|$)/.test(location.search); }
  catch(e){ return false; }
}

/* Gomulu iframe tespiti (mesken prototipi motoru srcdoc iframe'de calistirir).
   srcdoc iframe same-origin -> window.top erisimi guvenli; yine de cross-origin
   ihtimaline karsi try/catch (erisim FIRLATIYORSA kesin iframe'deyiz -> true). */
function onbInIframe(){
  try{ return typeof window!=='undefined' && window.self !== window.top; }
  catch(e){ return true; }
}

/* --- UI kur / yik --- */
function onbBuildUI(){
  if(onbUI || typeof document==='undefined' || !document.body) return;
  const NS='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(NS,'svg'); svg.setAttribute('id','onbOverlay');
  const defs=document.createElementNS(NS,'defs');
  const mask=document.createElementNS(NS,'mask'); mask.setAttribute('id','onbHoleMask'); mask.setAttribute('maskUnits','userSpaceOnUse');
  const bg=document.createElementNS(NS,'rect'); bg.setAttribute('x',0); bg.setAttribute('y',0); bg.setAttribute('fill','#fff');
  const hole=document.createElementNS(NS,'rect'); hole.setAttribute('fill','#000'); hole.setAttribute('rx',8);
  const holeC=document.createElementNS(NS,'circle'); holeC.setAttribute('fill','#000'); holeC.setAttribute('r',0); holeC.setAttribute('class','onbPulse');
  mask.appendChild(bg); mask.appendChild(hole); mask.appendChild(holeC); defs.appendChild(mask);
  const dim=document.createElementNS(NS,'rect'); dim.setAttribute('id','onbDim'); dim.setAttribute('x',0); dim.setAttribute('y',0);
  dim.setAttribute('fill','var(--scrim)'); dim.setAttribute('mask','url(#onbHoleMask)');
  svg.appendChild(defs); svg.appendChild(dim);
  const card=document.createElement('div'); card.className='onbCard';
  document.body.appendChild(svg); document.body.appendChild(card);
  onbUI={svg:svg, bg:bg, hole:hole, holeC:holeC, dim:dim, card:card};
  card.addEventListener('click', onbCardClick);
  if(!onbWired){ onbWired=true;
    window.addEventListener('resize', function(){ if(onbActive) onbReposition(); });
    window.addEventListener('scroll', function(){ if(onbActive) onbReposition(); }, {passive:true, capture:true});
  }
}
function onbTeardown(){ onbGhostRemove(); if(onbUI){ try{ onbUI.svg.remove(); onbUI.card.remove(); }catch(e){} onbUI=null; } }
/* z-boost: 3B overlay (inline z-index:9999) ustunde kalmak icin 'onb3d' sinifi */
function onbApplyZBoost(on){
  if(!onbUI) return;
  try{ onbUI.svg.classList.toggle('onb3d', !!on); onbUI.card.classList.toggle('onb3d', !!on); }catch(e){}
}
/* tur.visible() false iken UI'yi gizle (durum korunur, 3B tekrar acilinca surer) */
function onbSetHidden(h){
  if(!onbUI) return;
  onbUI.svg.style.display = h ? 'none' : '';
  onbUI.card.style.display = h ? 'none' : '';
}

/* --- kart --- */
function onbCardClick(e){
  const b=(e.target && e.target.closest) ? e.target.closest('[data-onb]') : null; if(!b) return;
  const a=b.getAttribute('data-onb');
  if(a==='close') onbStop('dismissed');
  else if(a==='skip') onbSkip();
  else if(a==='next') onbNext();
  else if(a==='pro'){ const m=onbEl('modePro'); if(m && m.click) m.click(); }
  else if(a==='act'){ const s=onbTour && onbTour.steps[onbIdx]; if(s && s.action && typeof s.action.run==='function') s.action.run(); }
}
/* adim govde metni: gomulu iframe (mesken prototipi) baglaminda alternatif metin
   (step.bodyIframe) varsa onu, yoksa standart step.body'yi doner. SAF (arg olarak
   inIframe alir) -> headless test edilebilir. */
function onbStepBody(step, inIframe){
  if(step && inIframe && step.bodyIframe) return step.bodyIframe;
  return (step && step.body) || '';
}
function onbRenderCard(){
  if(!onbUI || !onbUI.card || !onbTour) return;
  const s=onbTour.steps[onbIdx]; if(!s) return;
  const total=onbTour.steps.length, n=onbIdx+1, pct=Math.round(n/total*100);
  const ic=(typeof icon==='function') ? icon('bulb','inl') : '';
  /* GIRIS-SAGLANMIS adim (onbGate[onbIdx]) -> oto-atlama YOK; kartta İleri düğmesi
     (kullanici elle gecer). Oncelik: paused > gate(İleri) > action. */
  const gated = !onbPaused && !!onbGate[onbIdx];
  let btns='';
  if(s.skippable && !gated) btns += '<button type="button" class="onbSkip" data-onb="skip">Atla</button>';
  if(onbPaused) btns += '<button type="button" class="onbAct onbNext" data-onb="pro">Profesyonel moda geç</button>';
  else if(gated) btns += '<button type="button" class="onbAct onbNext" data-onb="next">İleri</button>';
  else if(s.action && s.action.label) btns += '<button type="button" class="onbAct onbNext" data-onb="act">'+onbEsc(s.action.label)+'</button>';
  const text = onbPaused
    ? 'Bu adım Profesyonel modda çalışır. Devam etmek için Profesyonel moda geç.'
    : gated
      ? onbEsc(s.bodyDone || 'Bu adım zaten tamamlanmış görünüyor — İleri ile devam et.')
      : onbEsc(onbStepBody(s, onbInIframe()));
  /* CSS sozlesmesi (styles.css): baslik=h3, metin=p, sayac=.prog,
     ilerleme cubugu=.progBar>i, kapat=24x24 ikon-buton (.onbClose, absolute kose). */
  onbUI.card.innerHTML =
      '<button type="button" class="onbClose" data-onb="close" aria-label="Turu kapat" title="Turu kapat">×</button>'
    + '<h3 class="onbTitle">'+ic+'<span>'+onbEsc(s.title)+'</span></h3>'
    + '<p class="onbText">'+text+'</p>'
    + '<div class="prog">'+n+' / '+total+'</div>'
    + '<div class="progBar"><i style="width:'+pct+'%"></i></div>'
    + '<div class="onbBtns">'+btns+'</div>';
}

/* --- spotlight (delik) + kart konumu --- */
function onbTargetRect(){
  const s=onbTour && onbTour.steps[onbIdx]; if(!s) return {kind:'none'};
  if(s.target && s.target.type==='canvas'){
    /* sel verilirse o tuval (kamera3d: #view3dOverlay canvas), yoksa ana #canvasWrap */
    const w = s.target.sel ? onbSel(s.target.sel) : onbEl('canvasWrap');
    if(w && w.getBoundingClientRect && onbVisible(w)) return {kind:'canvas', rect:w.getBoundingClientRect()};
    return {kind:'none'};
  }
  if(s.target && s.target.type==='dom'){
    const el=onbSel(s.target.sel);
    if(el && el.getBoundingClientRect && onbVisible(el)) return {kind:'dom', rect:el.getBoundingClientRect()};
    return {kind:'none'};
  }
  return {kind:'none'};
}
function onbPositionCard(rect){
  if(!onbUI || !onbUI.card) return;
  const M=12, GAP=14, vw=window.innerWidth, vh=window.innerHeight;
  const w=onbUI.card.offsetWidth||300, h=onbUI.card.offsetHeight||160;
  let x, y;
  if(!rect){ x=(vw-w)/2; y=(vh-h)/2; }
  else{
    x=rect.left+rect.width/2-w/2;
    y=rect.bottom+GAP;
    if(y+h>vh-M) y=rect.top-GAP-h;      // altina sigmazsa ustune
    if(y<M) y=M;
  }
  x=Math.max(M, Math.min(x, vw-w-M));
  y=Math.max(M, Math.min(y, vh-h-M));
  onbUI.card.style.left=x+'px'; onbUI.card.style.top=y+'px';
}
function onbReposition(){
  if(!onbUI || onbHidden || typeof window==='undefined') return;
  const vw=window.innerWidth, vh=window.innerHeight;
  onbUI.svg.setAttribute('width',vw); onbUI.svg.setAttribute('height',vh);
  onbUI.bg.setAttribute('width',vw); onbUI.bg.setAttribute('height',vh);
  onbUI.dim.setAttribute('width',vw); onbUI.dim.setAttribute('height',vh);
  const t=onbTargetRect();
  if(t.kind==='dom'){ const r=t.rect, pad=6;
    onbUI.hole.setAttribute('x', r.left-pad); onbUI.hole.setAttribute('y', r.top-pad);
    onbUI.hole.setAttribute('width', Math.max(0, r.width+pad*2)); onbUI.hole.setAttribute('height', Math.max(0, r.height+pad*2));
    onbUI.holeC.setAttribute('r', 0);
    onbPositionCard(r);
  } else if(t.kind==='canvas'){ const r=t.rect;
    const cx=r.left+r.width/2, cy=r.top+r.height/2, rad=Math.max(40, Math.min(r.width, r.height)*0.18);
    onbUI.holeC.setAttribute('cx',cx); onbUI.holeC.setAttribute('cy',cy); onbUI.holeC.setAttribute('r',rad);
    onbUI.hole.setAttribute('width',0); onbUI.hole.setAttribute('height',0);
    onbPositionCard({left:cx-rad, top:cy-rad, right:cx+rad, bottom:cy+rad, width:rad*2, height:rad*2});
  } else {
    onbUI.hole.setAttribute('width',0); onbUI.hole.setAttribute('height',0); onbUI.holeC.setAttribute('r',0);
    onbPositionCard(null);
  }
  onbDrawGhosts();   // ghost'u ayni cagride idempotent yeniden enjekte -> render() sildiyse geri gelir
}
function onbFrame(){ if(!onbActive){ onbRaf=0; return; } onbReposition(); onbRaf=requestAnimationFrame(onbFrame); }

/* ================= HAYALET (ghost) cizim katmani (YALNIZ tarayici) =================
   Cizim adimlarinda (sinir-ciz/blok-b-ciz/imkan-koy) hedef ayak izini ana tuvale (#svg)
   SOLUK KESIKLI poligon/kutu olarak enjekte eder; ziyaretci ustunden kose kose cizer
   ("birebir bizim blogu cizdirmeli"). Dunya-metre {x,y} -> W2Sx/W2Sy ile cizilir =>
   pan/zoom OTOMATIK izlenir (ayri transform grubu YOK; motor da boyle cizer). render()
   her karede svg.innerHTML'i siler -> ghost onbReposition (rAF ~60fps + 250ms poll +
   resize/scroll) her cagrisinda IDEMPOTENT yeniden enjekte edilir (svg.appendChild var
   olan <g>'yi en uste tasir, cocuk cogaltmaz). check'ler JENERIK, hayalet YALNIZ yonlendirir. */
const ONB_SVGNS='http://www.w3.org/2000/svg';
const ONB_GHOST_STROKE='#b35a2e';   // soluk turuncu vurgu (--acc); motor mavisi/yesilinden ayrisir
const ONB_GHOST_LBL={ green:'Yeşil', pool:'Havuz', playground:'Oyun', ornament:'Süs', seating:'Oturma' };
function onbGRound(n){ n=+n; if(!isFinite(n)) n=0; return Math.round(n*10)/10; }
function onbW2S(){
  try{ if(typeof W2Sx==='function' && typeof W2Sy==='function') return { x:W2Sx, y:W2Sy }; }catch(e){}
  return null;
}
function onbGhostRemove(){ try{ const g=onbEl('onbGhost'); if(g && g.parentNode) g.parentNode.removeChild(g); }catch(e){} }
function onbDrawGhosts(){
  const s=onbTour && onbTour.steps[onbIdx];
  const spec=(s && s.ghost) ? s.ghost : null;
  if(!spec || onbHidden){ onbGhostRemove(); return; }
  const conv=onbW2S(), svgEl=onbEl('svg');
  if(!conv || !svgEl){ onbGhostRemove(); return; }          // motor/tuval yok (headless) -> ghost yok
  const data=onbGhostPolys(spec);
  if(!data.polys.length && !data.rects.length){ onbGhostRemove(); return; }
  let g=onbEl('onbGhost');
  if(!g){ try{ g=document.createElementNS(ONB_SVGNS,'g'); g.setAttribute('id','onbGhost'); g.setAttribute('pointer-events','none'); }catch(e){ return; } }
  try{ svgEl.appendChild(g); }catch(e){ return; }            // render() sildiyse en uste geri ekle
  const Wx=conv.x, Wy=conv.y, R=onbGRound; let out='';
  /* bloklar: soluk kesikli poligon + kose noktalari + harf etiketi (kose kose cizmeyi kolaylastir) */
  for(let i=0;i<data.polys.length;i++){
    const p=data.polys[i].pts; let d='M', cx=0, cy=0;
    for(let j=0;j<p.length;j++){ const X=R(Wx(p[j].x)), Y=R(Wy(p[j].y)); d+=(j?'L':'')+X+','+Y; cx+=X; cy+=Y; }
    d+='Z'; cx/=p.length; cy/=p.length;
    out+='<path d="'+d+'" fill="rgba(179,90,46,0.06)" stroke="'+ONB_GHOST_STROKE+'" stroke-width="2.2" stroke-dasharray="8 5" stroke-linejoin="round" stroke-linecap="round"/>';
    for(let j=0;j<p.length;j++) out+='<circle cx="'+R(Wx(p[j].x))+'" cy="'+R(Wy(p[j].y))+'" r="3.5" fill="'+ONB_GHOST_STROKE+'" fill-opacity="0.55"/>';
    if(data.polys[i].label) out+='<text x="'+R(cx)+'" y="'+R(cy)+'" text-anchor="middle" dominant-baseline="middle" font-size="16" font-weight="700" fill="'+ONB_GHOST_STROKE+'" fill-opacity="0.5">'+onbEsc(data.polys[i].label)+'</text>';
  }
  /* imkanlar: kesikli kutu + tip etiketi */
  for(let i=0;i<data.rects.length;i++){ const a=data.rects[i];
    const x0=Wx(a.x), y0=Wy(a.y), x1=Wx(a.x+a.w), y1=Wy(a.y+a.h);
    const rx=Math.min(x0,x1), ry=Math.min(y0,y1), rw=Math.abs(x1-x0), rh=Math.abs(y1-y0);
    out+='<rect x="'+R(rx)+'" y="'+R(ry)+'" width="'+R(rw)+'" height="'+R(rh)+'" rx="3" fill="rgba(179,90,46,0.05)" stroke="'+ONB_GHOST_STROKE+'" stroke-width="1.6" stroke-dasharray="6 4"/>';
    const lbl=ONB_GHOST_LBL[a.type]||'';
    if(lbl) out+='<text x="'+R(rx+rw/2)+'" y="'+R(ry+rh/2)+'" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="'+ONB_GHOST_STROKE+'" fill-opacity="0.8">'+onbEsc(lbl)+'</text>';
  }
  g.innerHTML=out;
}

/* --- adim gecisleri --- */
function onbGoto(idx){
  if(!onbTour) return;
  onbIdx=Math.max(0, Math.min(idx, onbTour.steps.length-1));
  const s=onbTour.steps[onbIdx];
  if(s.baseline && !(onbIdx in onbBases)){
    try{ onbBases[onbIdx]=s.baseline(onbTour.ctx()); }catch(e){ onbBases[onbIdx]=undefined; }
  }
  /* GIRIS-SAGLANMISLIK: bu adima GIRERKEN check zaten saglaniyor mu? -> onbGate[idx].
     Evetse tur burada durur ve İleri düğmesi cikar (oto-atlama yok). baseline'li
     adimlarda base=giris-degeri oldugundan "buyume" check'leri girişte HEP false
     (editCount>editCount) -> onlar hicbir zaman İleri-kapisi olmaz, kullanici hareketini bekler. */
  let entryOk=false;
  try{ entryOk=!!s.check(onbTour.ctx(), onbBases[onbIdx]); }catch(e){ entryOk=false; }
  onbGate[onbIdx]=entryOk;
  onbSet('onb.'+onbTour.id+'.step', String(onbIdx));
  onbPaused = !!s.needsPro && !onbLiveCtx().modePro();
  onbRenderCard();
  onbScrollTargetIntoView();   // IS 3: hedef viewport disindaysa ortala (adim basina bir kez)
  onbReposition();
}
/* IS 3 — HEDEFE OTOMATIK KAYDIRMA (canli /demo: "4/13 asagida kaliyor, kullanici
   kaydirmayabilir"): adim aktiflesince hedef DOM elemani viewport'ta TAM gorunur degilse
   en yakin scrollable ata icinde ortala (scrollIntoView block:'center'). GENEL mekanizma:
   tum dom-hedefli adimlar (sol panel ici dahil). Yumusak kaydirma -> scroll event ->
   onbReposition spotlight'i takip eder (mevcut resize/scroll dinleyicisi + rAF). */
function onbScrollTargetIntoView(){
  const s=onbTour && onbTour.steps[onbIdx];
  if(!s || !s.target || s.target.type!=='dom') return;      // canvas hedefi kaydirilmaz
  const el=onbSel(s.target.sel);
  if(!el || !el.getBoundingClientRect || !el.scrollIntoView) return;
  try{
    const vh=(typeof window!=='undefined' && window.innerHeight) ? window.innerHeight : 0;
    const vw=(typeof window!=='undefined' && window.innerWidth) ? window.innerWidth : 0;
    if(!vh || !vw) return;
    const r=el.getBoundingClientRect();
    if(r.width<=0 && r.height<=0) return;                    // gizli eleman -> kaydirma yok
    const M=24;                                              // kenar payi; tam gorunur degilse ortala
    if(r.top<M || r.bottom>vh-M || r.left<0 || r.right>vw)
      el.scrollIntoView({block:'center', inline:'nearest', behavior:'smooth'});
  }catch(e){}
}
/* İleri: giris-saglanmis adimi elle gec (kapiyi ac + bir sonraki adima) */
function onbNext(){
  if(!onbTour) return;
  onbGate[onbIdx]=false;                                    // bu adim İleri ile gecildi -> kapi burada durmaz
  if(onbIdx>=onbTour.steps.length-1){ onbFinish(); return; }
  onbGoto(onbIdx+1);
}
function onbSkip(){ if(!onbTour) return; onbGate[onbIdx]=false; if(onbIdx>=onbTour.steps.length-1){ onbFinish(); return; } onbGoto(onbIdx+1); }
function onbTick(){
  if(!onbActive || !onbTour) return;
  /* 3B-baglantili tur: overlay kapaliysa gizle+duraklat, acilinca surdur */
  if(onbTour.visible){
    const vis=!!onbTour.visible();
    if(!vis){ if(!onbHidden){ onbHidden=true; onbSetHidden(true); } return; }
    if(onbHidden){ onbHidden=false; onbSetHidden(false); onbReposition(); }
  }
  const steps=onbTour.steps, s=steps[onbIdx], ctx=onbTour.ctx();
  const nowPaused = !!s.needsPro && !onbLiveCtx().modePro();
  if(nowPaused!==onbPaused){ onbPaused=nowPaused; onbRenderCard(); }
  if(onbPaused) return;                       // Pro gerekli ama kapali -> ilerleme yok
  /* GIRIS-SAGLANMIS adim -> İleri bekliyor: oto-ilerleme YOK (kullanici İleri'ye basacak). */
  if(onbGate[onbIdx]){ onbReposition(); return; }
  /* ARDISIK KAPI (adim adim): mevcut adim saglandiysa BIR sonraki adima gec. onbGoto o
     adimin giris-saglanmisligini yakalar -> giris-saglanmis ise orada İleri kapisiyla durur;
     degilse kullanici hareketini bekler (bugunku oto-ilerleme). "Skip-ahead" (birden cok
     adimi tek tikta yutma) BILEREK kaldirildi: canli /demo "1. adimi atliyor" raporu. */
  let ok=false; try{ ok=!!s.check(ctx, onbBases[onbIdx]); }catch(e){ ok=false; }
  if(ok){
    if(onbIdx>=steps.length-1){ onbFinish(); return; }
    onbGoto(onbIdx+1); return;
  }
  /* rAF-bagimsiz konum tazeleme: gizli/gomulu baglamlarda (ornek: arka plan sekmesi,
     mesken iframe'i) tarayici rAF'i ASKIYA ALIR — spotlight takibi tick'ten de surer. */
  onbReposition();
}
function onbClearTimers(){
  if(onbTimer){ clearInterval(onbTimer); onbTimer=null; }
  if(onbRaf){ if(typeof cancelAnimationFrame==='function') cancelAnimationFrame(onbRaf); onbRaf=0; }
}
function onbFinish(){
  if(onbTour){ onbSet('onb.'+onbTour.id+'.status','done'); onbSet('onb.'+onbTour.id+'.v',String(onbTour.version)); }
  onbActive=false; onbTour=null; onbHidden=false; onbClearTimers(); onbTeardown();
}
function onbStop(status){
  if(onbTour){ onbSet('onb.'+onbTour.id+'.status', status||'dismissed'); onbSet('onb.'+onbTour.id+'.v',String(onbTour.version)); }
  onbActive=false; onbTour=null; onbHidden=false; onbClearTimers(); onbTeardown();
}

/* reset=true -> TAZE tur: HER ZAMAN 0. adimdan basla (Pro mod acik olsa bile) — canli /demo
   "yine 1. adimi atliyor" raporu: kullanici 1/13'u GORMEK istiyor. Onceki "flash-onleyici"
   (computeTarget ile saglanmis bas adimlari atla) BILEREK kaldirildi; artik giris-saglanmis
   0. adim (or. Pro zaten acik) atlanmaz, kartta İleri düğmesiyle DURUR (onbGate + onbTick).
   reset degilse (DEVAM): depolanmis adim + ardisik-kapi (ilk saglanmayan) senkronu ile surdur. */
function onbLaunchTour(tour, reset){
  if(!tour || !onbBrowser() || !document.body) return;
  if(onbActive) onbStop('dismissed');          // ayni anda tek tur
  onbTour=tour; onbActive=true; onbPaused=false; onbHidden=false; onbBases={}; onbGate={};
  if(tour.id==='ana') onbExportFlag=false;
  if(tour.id==='kamera3d') onbExtRenderFlag=false;
  onbSet('onb.'+tour.id+'.status','active'); onbSet('onb.'+tour.id+'.v', String(tour.version));
  const auto = onbComputeTarget(tour.steps, tour.ctx(), {}, {});   // DEVAM icin ilk saglanmayan adim
  let idx = reset ? 0 : Math.max(onbStepStored(tour), auto);
  if(idx>=tour.steps.length){ onbFinish(); return; }
  onbBuildUI();
  onbApplyZBoost(!!tour.zBoost);
  onbGoto(idx);
  if(!onbTimer) onbTimer=setInterval(onbTick, 250);
  if(!onbRaf && typeof requestAnimationFrame==='function') onbRaf=requestAnimationFrame(onbFrame);
}
/* geriye-uyum sarmalayici: eski cagri yollari 'ana'yi baslatir */
function onbLaunch(reset){ onbLaunchTour(onbTourById('ana'), reset); }

function onbAutoStart(){
  const tour=onbTourById('ana');
  const force=onbUrlForce();
  if(onbInIframe() && !force) return;          // gomulu iframe: ANA tur kendiliginden BASLAMAZ (kamera3d watcher'i ayri, o iframeAuto)
  const d=onbDecideStart(onbStored(tour), force, tour.version);
  if(d==='start') onbLaunchTour(tour, true);
  else if(d==='resume') onbLaunchTour(tour, false);
  /* 'idle' -> tamamlanmis/kapatilmis, ayni surum: dokunma (kullanici #onbStart ile acar) */
}

/* ~750ms tetik watcher'i: kamera UI'i etkinlesince kamera3d mini-turunu baslat.
   Ucuz: tur aktifken hicbir sey yapmaz; View3D API'sine yalniz overlay GORUNURKEN dokunur. */
function onbWatchTick(){
  for(let i=0;i<ONB_TOURS.length;i++){
    const tour=ONB_TOURS[i]; if(!tour.watch) continue;
    const vis=onbV3dVisible();
    const env={ active:onbActive, inIframe:onbInIframe(), visible:vis,
                camUI:vis ? tour.ctx().camUI() : false };
    const d=onbWatchDecision(tour, env, onbStored(tour));
    if(d) onbLaunchTour(tour, d==='start');
  }
}

function onbBoot(){
  onbMigrateLegacy();
  const b=onbEl('onbStart'); if(b && b.addEventListener) b.addEventListener('click', function(){ onbLaunch(true); });
  if(typeof document!=='undefined' && document.addEventListener){
    document.addEventListener('click', function(e){                 // delege tamamlanma tiklamalari
      const t=(e.target && e.target.closest) ? e.target.closest('#svgBtn,#impBtn,[data-v3d="extrender"]') : null;
      if(!t) return;
      if(t.getAttribute && t.getAttribute('data-v3d')==='extrender') onbExtRenderFlag=true;   // kamera3d adim 6
      else onbExportFlag=true;                                                                // ana adim 13
    }, true);
  }
  onbAutoStart();
  if(!onbWatchTimer && typeof setInterval==='function') onbWatchTimer=setInterval(onbWatchTick, 750);
}

/* ---- headless test icin saf mantik kancasi (ONB); tarayicida da zararsiz ---- */
var ONB = {
  VERSION: ONB_VERSION,
  KAM_VERSION: ONB_KAM_VERSION,
  TARGETS: ONB_TARGETS,           // demo-paket hedefleri (proje-20260716-4.mskpkg)
  STEPS: ONB_STEPS,               // geriye-uyum: 'ana' adimlari
  KAM_STEPS: ONB_KAM_STEPS,
  TOURS: ONB_TOURS,
  tourById: onbTourById,
  stepBody: onbStepBody,
  ghostPolys: onbGhostPolys,        // SAF ghost cozucu (headless test)
  imkanOzet: onbImkanOzet,
  computeTarget: onbComputeTarget,
  decideStart: onbDecideStart,
  watchDecision: onbWatchDecision,
  migrateLegacy: onbMigrateLegacy,
  liveCtx: onbLiveCtx,
  kamCtx: onbKamCtx,
  launch: onbLaunch,
  launchTour: onbLaunchTour,
  stop: onbStop
};

/* ================= tetik (YALNIZ gercek tarayici) ================= */
if(onbBrowser()){
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', onbBoot);
  else setTimeout(onbBoot, 0);
}
