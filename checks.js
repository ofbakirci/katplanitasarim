'use strict';
/* ================= mevzuat kontrolleri ================= */
/* konut dışı kat (ticari/otopark/sığınak) denetimleri — daire/piyes kuralları yerine
   kullanıma özel notlar; çekirdek (düşey sirkülasyon) sürekliliği kontrol edilir */
function collectUsageChecks(add, p){
  const areaOf=t=>p.regions.filter(g=>g.type===t).reduce((s,g)=>s+g.area,0);
  const ad=floorName(activeFloor);
  if(p.katKullanim==='otopark'){
    const a=areaOf('otopark'), bays=(p.parking&&p.parking.bays)?p.parking.bays.length:0;
    add('info',`${ad} — Otopark: ${a>0?fmt(a)+' m² alana ':''}${bays} araçlık yer çizildi (2,5×5 m dik park + 5 m manevra yolu; çift yüklü, rampa hariç).`);
    add('info','Araç rampası eğimi en çok %15 (kapalı otopark), kapı önü ilk 5 m'+"'"+'de daha düşük; rampayı Yapı katmanında konumlandırın (Otopark Yönetmeliği).');
  } else if(p.katKullanim==='ticari'){
    const n=p.regions.filter(g=>g.type==='dukkan'&&g.cells.length).length, a=areaOf('dukkan');
    add('info',`${ad} — Ticari: ${n} dükkân birimi, toplam ${fmt(a)} m². Zemin ticaride her birimde ıslak hacim, vitrin cephesi ve konuttan AYRI giriş aranır.`);
    add('info','Ticari kullanım için ayrıca yangın çıkışı, engelli erişimi (rampa/asansör) ve işyeri açma ruhsatı koşulları geçerlidir.');
  } else if(p.katKullanim==='siginak'){
    const a=areaOf('siginak');
    add(a>=REG.siginakMinM2?'ok':'bad',`${ad} — Sığınak alanı ${fmt(a)} m² (en az ${fmt(REG.siginakMinM2)} m²; kişi başı ${fmt(REG.siginakKisiM2)} m² — asıl alan bağımsız bölüm/kişi sayısına bağlıdır).`);
    add('info','Sığınak: betonarme kabuk, ayrı havalandırma (gazsızlandırma) ve en az iki çıkış aranır (Sığınak Yönetmeliği). Bu şematik gösterimdir.');
    if(areaOf('otopark')>0) add('info',`Sığınak dışı kalan ${fmt(areaOf('otopark'))} m² bodrum otopark/depo olarak değerlendirildi.`);
  }
  parkingSummaryCheck(add);
  const hasStair=p.regions.some(g=>g.type==='merdiven'&&g.cells.length);
  add(hasStair?'ok':'bad', hasStair
    ? `${ad} — Düşey sirkülasyon (merdiven) bu katta da sürüyor; çekirdek düşeyde korunur.`
    : `${ad} — Merdiven yok: düşey sirkülasyon kesiliyor. Yapı katmanında çekirdeği kilitleyin ya da zemin katı yeniden üretin.`);
}
/* bina geneli otopark gereksinimi vs planlanan kapasite (yalnız katları ayrı planlanırken) */
function parkingSummaryCheck(add){
  if(!(typeof floorsOn==='function' && floorsOn())) return;
  const req=(typeof requiredParking==='function')?requiredParking():0;
  if(req<=0) return;
  const cap=(typeof providedParking==='function')?providedParking():0;
  add(cap>=req?'ok':'bad',
    `Otopark gereksinimi (Otopark Yön. Ek-1, konut): bina genelinde en az ≈ ${req} araçlık yer gerekli; planlanan otopark/sığınak katları ≈ ${cap} araç sığdırıyor. ${cap>=req? 'Yeterli' : ('EKSİK — '+(req-cap)+' araçlık yer daha gerekli (bir bodrum katını “Otopark” yapın ya da tabanı büyütün).')}`);
}
/* ÇEKİRDEK ÖLÇÜ DENETİMİ — üretilen merdiven/yangın/asansör/güvenlik holü boyutlarını
   core.js FIRE eşiklerine (= yangin-merdiven-kurallari.json) karşı test eder; altındaysa
   UYARI üretir. Gerekçe/madde: YANGIN-MERDIVEN-ASANSOR-KURALLARI.md. Boyutlar bölge
   sınır kutusundan (g.minSide=dar kenar, g.bw/g.bh, g.area) okunur — motor basamak/rıht
   üretmediği için yalnız AYAK İZİ (kova/kuyu/hol) ölçüleri denetlenir. */
function collectCoreDimChecks(add, p){
  const longOf=g=>Math.max(g.bw,g.bh);
  const kovaArea=FIRE.merdiven.kovaMin[0]*FIRE.merdiven.kovaMin[1]; // dar×uzun = min kova alanı (m²)
  p.regions.forEach(g=>{
    if(!g.cells.length) return;
    if(g.type==='merdiven'||g.type==='yangin'){
      if(p.villa){ // daire içi merdiven → yalnız kol genişliği (PAİY M.40)
        if(g.minSide < FIRE.merdiven.daireIciMin - 1e-9)
          add('bad',`${g.name}: dar kenar ${fmt(g.minSide)} m < ${fmt(FIRE.merdiven.daireIciMin)} m — daire içi merdiven kolu (PAİY M.40).`, g.id);
        return;
      }
      const [mk,mu]=FIRE.merdiven.kovaMin;
      if(g.minSide < mk - 1e-9)
        add('bad',`${g.name} kovası dar kenarı ${fmt(g.minSide)} m < ${fmt(mk)} m — 1,20 m kol + sahanlık + dönüş sığmaz; kovayı genişletin (PAİY M.40 / BYKHY M.41).`, g.id);
      else if(g.area < kovaArea - 1e-6)
        add('info',`${g.name} kovası ${fmt(g.area)} m² (${fmt(g.minSide)}×${fmt(longOf(g))} m) — basamaklı kol + ara sahanlık için min ~${fmt(mk)}×${fmt(mu)} m önerilir (BYKHY M.41(3)). Kovayı uzatın.`, g.id);
    } else if(g.type==='asansor'){
      const [ak,au]=FIRE.asansor.kuyuMin, [ck,cu]=FIRE.asansor.kabinErisim;
      if(g.minSide < ak - 1e-9 || longOf(g) < au - 1e-9)
        add('bad',`${g.name} kuyusu ${fmt(g.minSide)}×${fmt(longOf(g))} m < ${fmt(ak)}×${fmt(au)} m — erişilebilir kabin (${fmt(ck)}×${fmt(cu)} m, EN 81-70) sığmaz; kuyuyu büyütün.`, g.id);
    } else if(g.type==='guvenlik' || /GÜVENLİK/i.test(g.name||'')){ // motor henüz üretmez; varsa denetle
      const a=FIRE.guvenlikHolu;
      if(g.area < a.alan[0] - 1e-6) add('bad',`${g.name}: ${fmt(g.area)} m² < ${fmt(a.alan[0])} m² — yangın güvenlik holü en az ${fmt(a.alan[0])} m² (BYKHY M.34(3)).`, g.id);
      else if(g.area > a.alan[1] + 1e-6) add('info',`${g.name}: ${fmt(g.area)} m² > ${fmt(a.alan[1])} m² — normal güvenlik holü ${fmt(a.alan[0])}–${fmt(a.alan[1])} m² olmalı (BYKHY M.34(3)).`, g.id);
      if(g.minSide < a.minBoyut - 1e-9) add('bad',`${g.name}: dar kenar ${fmt(g.minSide)} m < ${fmt(a.minBoyut)} m (kaçış yönü, BYKHY M.34(3)).`, g.id);
    }
  });
}
/* YÜKSEKLİK-SINIFI DENETİMİ — yapı yüksekliğine göre kaç-merdiven + güvenlik holü /
   basınçlandırma / acil durum asansörü zorunluluğu (JSON yukseklik_esikleri_m +
   kac_merdiven_konut_TR; BYKHY M.42/M.48/M.34/M.63/M.89). Yalnız apartman (çok bölümlü). */
function collectCoreHeightChecks(add, p){
  if(p.villa) return;
  const H=+p.binaYuk||0; if(H<=0) return;
  /* konut apartmanında "≥2 kaçış merdiveni" gereği zaten fireStairNeeded bloğunda (yukarıda)
     söyleniyor → burada tekrar etme (mükerrer yeşil / yangın yerleşemezse çift-kırmızı olmasın).
     ticari/otopark yüksek binada o blok ÇALIŞMADIĞI için sayı denetimi burada verilir. */
  const konutApt = !p.katKullanim || p.katKullanim==='konut';
  const stairs=p.regions.filter(g=>(g.type==='merdiven'||g.type==='yangin')&&g.cells.length).length;
  const hasVes=p.regions.some(g=>g.cells.length&&(g.type==='guvenlik'||/GÜVENLİK/i.test(g.name||'')));
  if(!konutApt && H>FIRE.heights.yuksek+1e-9){ // >21,50 m → en az 2 kaçış merdiveni (≥1 korunumlu)
    add(stairs>=2?'ok':'bad', stairs>=2
      ? `Yapı yüksekliği ${fmt(H)} m > ${fmt(FIRE.heights.yuksek)} m → en az 2 kaçış merdiveni gerekli; planda ${stairs} merdiven var (BYKHY M.48(5)).`
      : `Yapı yüksekliği ${fmt(H)} m > ${fmt(FIRE.heights.yuksek)} m → en az 2 kaçış merdiveni zorunlu (BYKHY M.48(5)); planda ${stairs} var. İkinci kaçış merdivenini Yapı katmanından ekleyin ya da tabanı genişletin.`);
  }
  if(H>FIRE.heights.cokYuksek+1e-9) // >30,50 m → güvenlik holü VEYA basınçlandırma
    add(hasVes?'ok':'bad', `Yapı yüksekliği ${fmt(H)} m > ${fmt(FIRE.heights.cokYuksek)} m → kaçış merdivenlerinin ikisi de korunumlu + en az birinde yangın güvenlik holü (${fmt(FIRE.guvenlikHolu.alan[0])}–${fmt(FIRE.guvenlikHolu.alan[1])} m², kaçış yönü ≥ ${fmt(FIRE.guvenlikHolu.minBoyut)} m) veya basınçlandırma zorunlu (BYKHY M.48(5c)/M.34/M.89).${hasVes?'':' Şematik motor güvenlik holü/basınçlandırma çizmez — projede ekleyin.'}`);
  if(H>FIRE.heights.yuksekBlok+1e-9) // >51,50 m → acil durum asansörü + asansör önü holü
    add('bad', `Yapı yüksekliği ${fmt(H)} m > ${fmt(FIRE.heights.yuksekBlok)} m → acil durum asansörü (kabin ≥ ${fmt(FIRE.acilAsansor.kabinMin)} m², 630 kg) + asansör önü güvenlik holü (${fmt(FIRE.guvenlikHolu.asansorAlan[0])}–${fmt(FIRE.guvenlikHolu.asansorAlan[1])} m², ≥ ${fmt(FIRE.guvenlikHolu.asansorBoyut)} m) + merdiven basınçlandırma zorunlu (BYKHY M.63/M.34(4)/M.89).`);
}
/* ZEMİN KAT — apartman holü bina DIŞ sınırına değmeli: yoksa apartman/bina giriş
   kapısı (apartman holü → sokak) yerleştirilemez. Konut zeminde giriş kapısı
   OTOMATİK konmaz (yalnız zemin katta elle, dış cepheye eklenir — interaction.js
   extEdgeNear); holü içeride kalırsa eklenecek yer yoktur.
   ground = zemin kat mı (katAyri ON ise activeFloor===zeminIdx(); OFF ise tek tip
   kat zemini de temsil eder → daima true). ayri = katAyri açık mı (sertlik: zemin
   katı AÇIK planlanıyorsa KIRMIZI, tek tip katta yumuşak bilgi). Üst kat (ground
   false) ve villa (apartman holü yok / unitObjs boş) MUAF. İzole test edilebilir. */
function collectGroundEntranceCheck(add, p, ground, ayri){
  if(p.villa || !(p.unitObjs && p.unitObjs.length)) return;
  if(!ground) return;
  const kor=p.regions.find(g=>g.type==='koridor'&&g.cells.length);
  if(!kor) return;
  const touches=kor.cells.some(i=>{ const r=(i/p.cols)|0,c=i%p.cols;
    return r===0||r===p.rows-1||c===0||c===p.cols-1
      || !p.inside[i-p.cols]||!p.inside[i+p.cols]||!p.inside[i-1]||!p.inside[i+1]; });
  if(touches) return;
  if(ayri) add('bad', 'Zemin katta apartman holü bina dış sınırına değmiyor → apartman/bina giriş kapısı yerleştirilemez. Holü\'yü dış cepheye sürükleyip uzatın.', kor.id);
  else      add('info', 'Apartman holü bina dış sınırına değmiyor → zemin katta apartman/bina giriş kapısı yerleştirilemez (tek tip kat zemini de temsil eder). Zemini ayrı planlıyorsanız "Katları ayrı planla" ile zemin katında holü\'yü dış cepheye uzatın.', kor.id);
}
/* B7: piyes-ölçüsü ihlallerinde panel düğmesinin göstereceği düzeltme ÖNERİSİ (sadece
   yönlendirme — otomatik düzeltme YOK). Denetim metni/mesajı DEĞİŞMEZ; yalnız satıra
   opsiyonel action meta'sı eklenir (bad/info sayıları etkilenmez). */
const FIX_HINT={
  salon:'Komşu duvarı sürükleyerek salonu büyütün; ya da daire sayısını azaltın.',
  yatak:'Komşu duvarı sürükleyerek yatak odasını büyütün.',
  mutfak:'Komşu duvarı sürükleyerek mutfağı büyütün.',
  banyo:'Komşu duvarı sürükleyerek banyoyu büyütün.',
  wc:'Komşu duvarı sürükleyerek WC\'yi büyütün.'
};
function collectChecks(){
  const out=[], add=(s,t,reg,unit,action)=>out.push({s,t,reg:reg==null?null:reg,unit:unit==null?null:unit,action:action||null});
  const p=plan;
  if(typeof planAutoRepaired!=='undefined' && planAutoRepaired)
    add('info','İçe aktarılan düzen bozuktu (apartman holü bağımsız bölüm alanını yutmuştu, odalar hücresiz kalmıştı) → spec ve ayırıcılardan otomatik yeniden üretildi. Elle yapılmış oda düzenlemeleri korunamadı.');
  /* piyes ölçüleri — Planlı Alanlar İmar Yönetmeliği md.30 */
  p.unitObjs.forEach((u,k)=>{
    if(!u.rooms.some(g=>g.cells.length)) return;   // silinmiş (komşuya katılmış) daire
    const tag=(p.villa?(floorsOn()?'Villa '+floorName(activeFloor).toLowerCase():'Villa'):'Daire '+(k+1)+' ('+unitTag(u.spec)+')');
    const find=t=>u.rooms.filter(g=>g.type===t);
    const salon=find('salon')[0];
    if(salon){ const comb=!u.rooms.some(g=>g.type==='mutfak'); // ayrı mutfak yoksa salon+mutfak ölçütü
      const req=comb?REG.salonMutfak:REG.salon;
      add(salon.area>=req.area&&salon.minSide>=req.side?'ok':'bad',
        `${tag} — ${comb?'Salon+Mutfak':'Salon'}: ${fmt(salon.area)} m² / dar kenar ${fmt(salon.minSide)} m (min ${fmt(req.area)} m², ${fmt(req.side)} m)`, salon.id, null, {hint:FIX_HINT.salon}); }
    const beds=find('yatak');
    if(beds.length){ const best=beds.reduce((a,b)=>b.area>a.area?b:a);
      add(best.area>=REG.yatak.area&&best.minSide>=REG.yatak.side?'ok':'bad',
        `${tag} — En az bir yatak odası ≥9 m² & ≥2,5 m: en büyüğü ${fmt(best.area)} m² / ${fmt(best.minSide)} m`, best.id, null, {hint:FIX_HINT.yatak}); }
    /* istenen oda programı tam yerleşti mi? (villa + katları ayrı: salon=0 stüdyo değil, yatak eksilmez) */
    const wantBeds=(u.spec.salon===0&&!(p.villa&&floorsOn()))? Math.max(0,u.spec.oda-1) : u.spec.oda;
    if(beds.length<wantBeds) add('bad', `${tag} — ${wantBeds} yatak odasından ${beds.length} tanesi yerleştirilebildi (alan/biçim yetersiz; ayırıcıyı sürükleyin veya daire sayısını azaltın).`, null, k);
    /* ensuite sözü: spec ebeveyn banyolu ise EB. BANYO var mı + ölçüleri (sessiz kayıp v20'de 4 daireden 3'ünü vurmuştu) */
    if(u.spec.ensuite && wantBeds>0){
      const ebb=u.rooms.find(g=>g.name==='EB. BANYO'&&g.cells.length);
      if(!ebb) add('bad', `${tag} — Ebeveyn banyosu istendi ama yerleştirilemedi (eb. yatak odası çok küçük; ayırıcıyı sürükleyin).`, null, k);
      else add(ebb.area>=REG.banyo.area&&ebb.minSide>=REG.banyo.side?'ok':'bad',
        `${tag} — Eb. banyo: ${fmt(ebb.area)} m² / ${fmt(ebb.minSide)} m (min ${fmt(REG.banyo.area)} m², ${fmt(REG.banyo.side)} m)`, ebb.id, null, {hint:FIX_HINT.banyo});
    }
    const banAll=u.rooms.find(g=>g.type==='banyo');
    if(!banAll) add('bad', `${tag} — Banyo yerleştirilemedi!`, null, k);
    const mut=u.rooms.find(g=>g.type==='mutfak');
    if(!u.spec.acik && u.spec.salon>0 && !mut) add('bad', `${tag} — Ayrı mutfak istendi ama yerleştirilemedi (salonla birleşik sayıldı).`, null, k);
    if(!salon && !(p.villa&&floorsOn()&&u.spec.salon===0)) // katları ayrı planlanan villada salonsuz kat serbest (ev geneli ayrıca denetlenir)
      add('bad', `${tag} — Salon/oturma odası yerleştirilemedi (yasal zorunlu piyes)!`, null, k);
    // ince-uzun mutfak uyarısı kaldırıldı (tasarım tercihi, mevzuat sorunu değil)
    if(mut) add(mut.area>=REG.mutfak.area&&mut.minSide>=REG.mutfak.side?'ok':'bad',
      `${tag} — Mutfak: ${fmt(mut.area)} m² / ${fmt(mut.minSide)} m (min ${fmt(REG.mutfak.area)} m², ${fmt(REG.mutfak.side)} m)`, mut.id, null, {hint:FIX_HINT.mutfak});
    const ban=u.rooms.find(g=>g.type==='banyo'&&!g.name.startsWith('EB'));
    if(ban) add(ban.area>=REG.banyo.area&&ban.minSide>=REG.banyo.side?'ok':'bad',
      `${tag} — Banyo: ${fmt(ban.area)} m² / ${fmt(ban.minSide)} m (min ${fmt(REG.banyo.area)} m², ${fmt(REG.banyo.side)} m)`, ban.id, null, {hint:FIX_HINT.banyo});
    const wc=u.rooms.find(g=>g.type==='wc');
    if(wc) add(wc.area>=REG.wc.area&&wc.minSide>=REG.wc.side?'ok':'bad',
      `${tag} — WC: ${fmt(wc.area)} m² / ${fmt(wc.minSide)} m (min ${fmt(REG.wc.area)} m², ${fmt(REG.wc.side)} m)`, wc.id, null, {hint:FIX_HINT.wc});
    /* doğal ışık: yaşama mekânları (salon, yatak odası) dış cepheye dokunmalı —
       PAİY md.30: piyeslerde pencere alanı ≥ taban alanının 1/8'i */
    u.rooms.forEach(g=>{ if(!g.cells.length||(g.type!=='salon'&&g.type!=='yatak'&&g.type!=='mutfak')) return;
      const ext=g.cells.some(i=>{ const r=(i/p.cols)|0, c=i%p.cols;
        return r===0||r===p.rows-1||c===0||c===p.cols-1
          ||!p.inside[i-p.cols]||!p.inside[i+p.cols]||!p.inside[i-1]||!p.inside[i+1]; });
      if(!ext){
        if(g.type==='mutfak') add('info', `${tag} — Mutfak dış cepheye açılmıyor: penceresiz mutfağa DOĞALGAZ bağlanamaz. Mutfağı duvar sürükleyerek ya da takasla cepheye alın. (Alternatifler — elektrikli ocak / havalandırma boşluğu — Türkiye'de tercih edilmez.)`, g.id);
        else add('bad', `${tag} — ${g.name} dış cepheye açılmıyor: pencere/doğal ışık alamaz (PAİY md.30). Taban derinliğini azaltın veya daire sayısını artırın.`, g.id);
      }
    });
    /* TİP-BİLİNÇLİ boyut denetimi (FAZ 2 / #42): artık alan salona/odalara akar. Daire,
       tipinin makul üst sınırını (Türk normu hedef × 1.4) aşıyorsa taban bu programa fazla
       geliyor → daire sayısını artır / derinliği azalt. Motorun eskiden eksik olan "1+1
       86 m² olmaz" kavramı: hedef 1+1≈58, 2+1≈86, 3+1≈109 m²; >1.4× = şişme. Salon-oranı
       (>%50) yedek sinyal. Yalnız INFO — yerleşim değişmez. Detay: MOTOR-DAGITIM-KURALLARI.md */
    if(salon&&salon.cells.length){
      const totU=u.rooms.reduce((s,g)=>s+g.area,0);
      const sp=u.spec, tM2=22+13*(sp.salon||0)+23*(sp.oda||0)+(sp.ensuite?5:0);
      if(totU>tM2*1.4)
        add('info', `${tag} — Daire ${fmt(totU)} m² (${unitTag(sp)} için makul ~${fmt(tM2)} m²): artık taban alanı odalara aktı (şişme). Daire sayısını artırın veya derinliği azaltın.`, salon.id);
      else if(salon.area>Math.max(45, totU*0.5))
        add('info', `${tag} — Salon ${fmt(salon.area)} m² (dairenin %${Math.round(100*salon.area/totU)}'i): artık taban alanı salona aktı. Daire sayısını artırın veya derinliği azaltın.`, salon.id);
    }
    /* biçim denetimi: oda, kapsayan dikdörtgeninin en az %55'ini doldurmalı */
    u.rooms.forEach(g=>{ if(!g.cells.length||g.type==='antre'||g.bw*g.bh<=0) return;
      const fill=g.area/(g.bw*g.bh);
      if(fill<0.55) add('bad', `${tag} — ${g.name} biçimsiz (dikdörtgen doluluk %${Math.round(fill*100)}). Ayırıcıyı sürükleyerek veya daire sayısını azaltarak düzeltin.`, g.id); });
    /* erişim denetimi: her oda antreye (EB. BANYO eb. yatak odasına) komşu olmalı — duvar sürüklenince canlı izlenir */
    if(u.antre&&u.antre.cells.length){
      u.rooms.forEach(g=>{
        if(g===u.antre||!g.cells.length||g.type==='merdiven') return;
        let tid=u.antre.id;
        if(g.name==='EB. BANYO'){ // her EB. BANYO KENDİ ebeveyn yatak odasına (ebHost) komşu olmalı
          const host=(g.ebHost!=null&&u.rooms.find(o=>o.id===g.ebHost&&o.cells.length))||u.rooms.find(o=>o.name==='EB. YATAK ODASI'&&o.cells.length);
          if(host) tid=host.id;
        }
        const ok=g.cells.some(i=>{ const r=(i/p.cols)|0, c=i%p.cols;
          return (r>0&&p.cm[i-p.cols]===tid)||(r<p.rows-1&&p.cm[i+p.cols]===tid)
               ||(c>0&&p.cm[i-1]===tid)||(c<p.cols-1&&p.cm[i+1]===tid); });
        if(!ok) add('bad', `${tag} — ${g.name} ${g.name==='EB. BANYO'?'ebeveyn yatak odasına':'antreye'} komşu değil; kapı verilemez. Duvarı geri sürükleyin.`, g.id);
      });
    }
  });
  /* kapı denetimi: silinen veya yerleştirilemeyen kapılar */
  computeDoors().forEach(d=>{
    if(d.status==='ok'||d.status==='stale') return;
    const tag=(p.villa?(floorsOn()?'Villa '+floorName(activeFloor).toLowerCase():'Villa'):'Daire '+(d.k+1));
    if(d.kind==='unit')
      add('bad', d.status==='hidden'
        ? `${tag} — Giriş kapısı silindi! (Kapı modunda "Geri al" ile geri getirin.)`
        : `${tag} — Giriş kapısı için uygun duvar yok (antre koridora komşu değil).`, null, d.k);
    else
      add('bad', d.status==='hidden'
        ? `${tag} — ${d.reg.name} kapısı silindi; odaya erişim yok. ("Geri al" ile geri getirin.)`
        : `${tag} — ${d.reg.name} için uygun kapı yeri yok: duvar teması 1 m'den kısa. Duvarı sürükleyin.`, d.reg.id);
  });
  if(p.katKullanim && p.katKullanim!=='konut'){
    collectUsageChecks(add, p);
  } else if(!p.villa){
    /* GERÇEK ölçüm: eskiden statik "1,50 m yerleştirildi/ok" yazardı → 0,5 m'ye oyulmuş
       (zikzak) koridoru bile ok gösteriyordu. corridorMinWidth (walls.js) baskın eksende
       en dar kesiti ölçer; < koridorMin ise kaçış/erişim bloke → kırmızı. */
    { const kor=p.regions.find(g=>g.type==='koridor'&&g.cells.length);
      if(kor){ const w=corridorMinWidth(kor, p.cols);
        if(w < REG.koridorMin-1e-6)
          add('bad',`Apartman holü en dar yerinde ${fmt(w)} m < ${REG.koridorMin.toLocaleString('tr-TR')} m — koridor daralmış (kaçış/erişim engellenir). Holü genişletin veya yeniden üretin.`, kor.id);
        else
          add('ok',`Apartman holü en dar yeri ${fmt(w)} m ≥ ${REG.koridorMin.toLocaleString('tr-TR')} m.`, kor.id);
      }
    }
    const hasMerd=p.regions.some(g=>g.type==='merdiven'&&g.cells.length);
    add(hasMerd?'ok':'bad', hasMerd
      ? `Ortak merdiven 3,0 × 5,0 m çekirdek; kol genişliği ≥ ${REG.merdivenMin.toLocaleString('tr-TR')} m (konut).`
      : `Ortak merdiven yok — apartmanda en az bir kaçış merdiveni zorunlu (BYKHY). Bir odaya/çekirdeğe sağ tık → "Yapı elemanı ekle → Merdiven".`);
    /* asansör */
    if(p.kat>=REG.ikiAsansorKat) add(p.nAsansor>=2?'ok':'bad',`Kat adedi ${p.kat} ≥ ${REG.ikiAsansorKat-1}+ → en az 2 asansör zorunlu. Planda: ${p.nAsansor}.`);
    else if(p.kat>=REG.asansorKat) add(p.nAsansor>=1?'ok':'bad',`Kat adedi ${p.kat} ≥ 4 → asansör zorunlu. Planda: ${p.nAsansor}.`);
    else if(p.kat===3) add('ok','Kat adedi 3 → asansör tesisi değil, asansör YERİ ayrılması yeterli (planda kesikli gösterildi).');
    else add('info','Kat adedi ≤ 2 → asansör zorunluluğu yok.');
    /* yangın / 2. kaçış merdiveni — BYKHY M.48: yalnız yapı > 21,5 m konutta ZORUNLU.
       (Gerçek yüksekliğe göre; fireStairNeeded bayrağına değil — içe aktarımda bayrak
       "yangın bölgesi var mı"dan türetildiği için elle eklenen 2. merdivenli düşük binayı
       yanlışlıkla "zorunlu" gösterebilirdi.) ≤21,5 m'de tek merdiven yeter (M.48/5a). */
    const hasYangin=p.regions.some(g=>g.type==='yangin');
    if(p.binaYuk>REG.yanginYukseklik){
      add(hasYangin?'ok':'bad',`Yapı yüksekliği ${fmt(p.binaYuk)} m > ${fmt(REG.yanginYukseklik)} m → 2. kaçış (yangın) merdiveni zorunlu (BYKHY M.48). ${hasYangin?'Planda eklendi.':'Yerleştirilemedi — taban geometrisini genişletin!'}`);
    } else {
      add('ok',`Yapı yüksekliği ${fmt(p.binaYuk)} m ≤ ${fmt(REG.yanginYukseklik)} m → tek korunumlu merdiven yeterli (BYKHY M.48/5a); çekirdek küçük tutuldu, azami oturum alanı.${hasYangin?' İsteğe bağlı 2. merdiven eklenmiş.':' Dilersen Yapı katmanından 2. kaçış merdiveni ekleyebilirsin.'}`);
    }
    /* kaçış mesafesi */
    if(p.stairs.length){
      /* BYKHY mesafesi daire ÇIKIŞ KAPISINDAN ölçülür (antre merkezinden değil) */
      const doors=computeDoors().filter(d=>d.kind==='unit'&&d.e);
      let worst=0, worstReg=null;
      const meas=(x,y,reg)=>{ let best=1e9;
        p.stairs.forEach(s=>{ const sx=p.minX+(s.c0+s.w/2)*M, sy=p.minY+(s.r0+s.h/2)*M;
          best=Math.min(best, Math.abs(x-sx)+Math.abs(y-sy)); });
        if(best>worst){ worst=best; worstReg=reg; } };
      if(doors.length) doors.forEach(d=>meas(d.e.x, d.e.y, p.unitObjs[d.k].antre?p.unitObjs[d.k].antre.id:null));
      else p.unitObjs.forEach(u=>{ if(u.antre) meas(u.antre.cx, u.antre.cy, u.antre.id); });
      add(worst<=REG.kacisMesafe?'ok':'bad',`En uzak daire kapısı → merdiven kaçış mesafesi ≈ ${fmt(worst)} m (max ${REG.kacisMesafe} m).`, worstReg);
    }
    /* HOL↔ÇEKİRDEK bağlantısı (#41): apartman holü asansör/merdiven/yangın merdivenine
       KOMŞU olmalı (daireden çekirdeğe erişim + kaçış). Motor eskiden bunu denetlemiyordu;
       kopuksa holü "Holü çekirdeğe uzat" ile uzatın (hol sağ tık). */
    { const kor=p.regions.find(g=>g.type==='koridor'&&g.cells.length);
      if(kor){
        const reaches=g=>g.cells.some(i=>{ const r=(i/p.cols)|0,c=i%p.cols;
          return [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].some(([rr,cc])=>{ if(rr<0||cc<0||rr>=p.rows||cc>=p.cols)return false;
            const j=rr*p.cols+cc; return p.inside[j]&&p.cm[j]>=0&&p.regions[p.cm[j]].type==='koridor'; }); });
        const unr=p.regions.filter(g=>(g.type==='merdiven'||g.type==='asansor'||g.type==='yangin')&&g.cells.length&&!reaches(g));
        if(unr.length) add('bad', `Apartman holü ${unr.map(g=>g.name).join(', ')} ile komşu değil — daireden çekirdeğe erişim/kaçış kopuk. Holü sağ tık → "Holü çekirdeğe uzat".`, kor.id);
      }
    }
    /* ZEMİN KAT giriş kapısı: apartman holü dış sınıra değmeli (collectGroundEntranceCheck).
       ground = zemin kat mı; ayri = katAyri açık mı (sertlik). */
    { const ayri=(typeof floorsOn==='function')&&floorsOn();
      const ground=!ayri || activeFloor===zeminIdx();
      collectGroundEntranceCheck(add, p, ground, ayri); }
    /* sığınak + teknik — bina genelinde bir kat SIĞINAK olarak planlandıysa karşılanmış sayılır */
    const toplam=p.perFloor*p.kat;
    if(toplam>REG.siginakDaire){
      const sigVar = (typeof buildingHasUsage==='function') && buildingHasUsage('siginak');
      add(sigVar?'ok':'info', sigVar
        ? `Toplam ${toplam} bağımsız bölüm > ${REG.siginakDaire} → sığınak gerekli; bir kat SIĞINAK olarak planlandı.`
        : `Toplam ${toplam} bağımsız bölüm > ${REG.siginakDaire} → Sığınak Yönetmeliği gereği bodrumda sığınak planlanmalı (bir katın kullanımını “Sığınak” yapın).`);
    }
    parkingSummaryCheck(add); // katları ayrı planlanırken otopark gereksinimi konut katında da görünür
    if(p.teknikNeeded) add('ok',`Katta ${p.perFloor} daire ≥ ${REG.teknikOdaDaire} → teknik/tesisat şaftı çekirdeğe eklendi.`);
    const saftReg=p.regions.find(g=>g.name==='ŞAFT'&&g.cells.length);
    if(saftReg) add('info',`Çekirdek arkasındaki ${fmt(saftReg.area)} m² cep, ulaşılamaz alan kalmaması için tesisat şaftına dönüştürüldü.`);
    if(p.unitObjs.length<p.perFloor) add('bad',`${p.perFloor} daireden ${p.unitObjs.length} tanesi yerleştirilebildi — bölge cepheleri daha fazla daireye yetmiyor. Daire sayısını azaltın veya tabanı genişletin.`);
    /* daire büyüklüğü gerçekçiliği: ortalama daire hedefin çok üstündeyse taban bu adede fazla */
    if(p.unitObjs.length){
      const targetOf=s2=>30 + s2.oda*15 + s2.salon*25 + (s2.ensuite?6:0);
      const tTot=p.unitObjs.reduce((s,u2)=>s+targetOf(u2.spec),0);
      const aTot=p.unitObjs.reduce((s,u2)=>s+u2.rooms.reduce((q,g)=>q+g.area,0),0);
      if(tTot>0 && aTot/tTot>1.6)
        add('info',`Ortalama daire ${fmt(aTot/p.unitObjs.length)} m² — bu programın hedefinin ~${fmt(aTot/tTot)} katı. Bu tabana kat başına ~${Math.round(p.perFloor*aTot/tTot)} daire daha uygun olur.`);
    }
    add('info','İç konumda kalan (dış cepheye açılmayan) banyo/WC için mekanik havalandırma veya ışıklık gerekir.');
  } else {
    add('info','Tek bağımsız bölümlü konut → asansör zorunluluğundan muaf (PAİY md.34).');
    /* katları ayrı planlanırken katta salon zorunlu değil ama EVDE en az bir
       oturma alanı olmalı (PAİY md.30) — bir katta salon olması yeter */
    if(floorsOn()){
      let hasSalon=false;
      for(let k=0;k<p.kat;k++){ const f=floorState(k);
        if(f&&(f.plan.regions||[]).some(g=>g.type==='salon'&&g.cells&&g.cells.length)){ hasSalon=true; break; } }
      if(!hasSalon) add('bad','Evde hiç salon/oturma odası yok — konutta en az bir oturma alanı zorunlu (PAİY md.30). Bir katın programına salon ekleyin.');
    }
    if(!floorsOn()){
      if(p.kat>1){
        /* BUG-FIX: önceden merdiven bölgesi GERÇEKTEN var mı bakmadan koşulsuz 'ok'
           basılıyordu → yerleşmemiş merdiveni maskeliyordu. Artık gerçek denetim. */
        const hasStair=p.regions.some(g=>g.type==='merdiven'&&g.cells&&g.cells.length);
        add(hasStair?'ok':'bad', hasStair
          ? 'Çok katlı villa → iç merdiven yerleştirildi.'
          : 'Çok katlı villa ama iç merdiven yerleştirilemedi — taban geometrisini genişletin veya kat programını hafifletin.');
      }
    } else {
      /* --- katları ayrı planla: katlar arası tutarlılık kuralları --- */
      const fl=[]; for(let k=0;k<p.kat;k++) fl.push(floorState(k));
      const areas=fl.map(f=>f?shoelace(f.pts):null);
      const planned=areas.filter(a=>a!=null);
      add('info',`Katlar ayrı planlanıyor: ${planned.length}/${p.kat} kat hazır · toplam inşaat alanı ≈ ${fmt(planned.reduce((s,a)=>s+a,0))} m².`);
      for(let k=1;k<p.kat;k++){
        if(!fl[k]){ add('info',`${floorName(k)} henüz planlanmadı — sekmesine geçince bir alt katın sınırıyla başlar.`); continue; }
        /* oturum oranı: zemine göre */
        if(fl[0]&&areas[0]>0){
          const oran=areas[k]/areas[0];
          add(oran>=REG.katOturumOran-1e-9?'ok':'bad',
            `${floorName(k)} oturumu ${fmt(areas[k])} m² — zemin katın %${Math.round(oran*100)}'i (kural: en az %${Math.round(REG.katOturumOran*100)}).`);
        }
        /* çıkma: bir alt kattan en çok 1,5 m taşma */
        const below=fl[k-1];
        if(below){
          let worst=0;
          polySamples(fl[k].pts).forEach(q=>{ if(!pip(q.x,q.y,below.pts)) worst=Math.max(worst,distToPoly(q,below.pts)); });
          if(worst>0.01)
            add(worst<=REG.cikmaMax+1e-6?'info':'bad',
              `${floorName(k)} bir alt kattan ≈ ${fmt(worst)} m taşıyor (kapalı çıkma sınırı ${fmt(REG.cikmaMax)} m — PAİY).`);
        }
      }
      /* iç merdiven düşey hizası */
      if(p.kat>1){
        const sb=fl.map(f=>f&&stairBoxOf(f.plan));
        if(fl[0]&&!sb[0]) add('bad','Zemin katta iç merdiven yok (kat sayısı sonradan mı artırıldı?) — zemin katı yeniden üretin.');
        else if(sb[0]){
          let tum=true, var2=false;
          for(let k=1;k<p.kat;k++){ if(!fl[k]) continue; var2=true;
            if(!sb[k]){ add('bad',`${floorName(k)} planında iç merdiven yok — "Yerleşimi Oluştur" ile yeniden üretin.`); tum=false; continue; }
            const ayni=Math.abs(sb[k].x0-sb[0].x0)<0.26&&Math.abs(sb[k].y0-sb[0].y0)<0.26
                     &&Math.abs(sb[k].x1-sb[0].x1)<0.26&&Math.abs(sb[k].y1-sb[0].y1)<0.26;
            if(!ayni){ add('bad',`${floorName(k)} iç merdiveni zemin katla düşeyde hizalı değil (kat sınırı merdiveni kesiyor olabilir) — katı yeniden üretin.`); tum=false; }
          }
          if(var2&&tum) add('ok','İç merdiven tüm katlarda aynı konumda — düşey hiza korunuyor.');
        }
      }
      /* üst kat: merdiven sofaya/antreye bağlanıyor mu (kat erişimi) */
      if(activeFloor>0){
        const u0=p.unitObjs[0];
        const mer=u0&&u0.rooms.find(g=>g.type==='merdiven'&&g.cells.length);
        if(mer&&u0.antre&&u0.antre.cells.length){
          const aid=u0.antre.id;
          const ok2=mer.cells.some(i=>{const r=(i/p.cols)|0,c=i%p.cols;
            return (r>0&&p.cm[i-p.cols]===aid)||(r<p.rows-1&&p.cm[i+p.cols]===aid)
                 ||(c>0&&p.cm[i-1]===aid)||(c<p.cols-1&&p.cm[i+1]===aid); });
          add(ok2?'ok':'bad', ok2
            ? `${floorName(activeFloor)} — merdiven sofaya/antreye bağlanıyor (kat erişimi tamam).`
            : `${floorName(activeFloor)} — merdiven antreye komşu değil; kata erişim yok. Duvarları sürükleyerek bağlantı verin.`, mer.id);
        } else if(u0&&!mer) add('bad',`${floorName(activeFloor)} — iç merdiven yerleştirilemedi; kata erişim yok.`);
      }
      /* ıslak hacim düşey hizası (tesisat ekonomisi) */
      for(let k=1;k<p.kat;k++){
        if(!fl[k]||!fl[k-1]) continue;
        const wet=f=>{ const s=new Set(); const pl=f.plan;
          const bx=Math.round(pl.minX/M), by=Math.round(pl.minY/M);
          (pl.regions||[]).forEach(g=>{ if(g.type!=='banyo'&&g.type!=='wc') return;
            (g.cells||[]).forEach(i=>s.add((by+((i/pl.cols)|0))*100000 + bx+(i%pl.cols))); });
          return s; };
        const a=wet(fl[k]), b=wet(fl[k-1]);
        let hit=false; a.forEach(v=>{ if(b.has(v)) hit=true; });
        if(a.size&&b.size&&!hit)
          add('info',`${floorName(k)} ıslak hacimleri (banyo/WC) bir alt katla üst üste gelmiyor — düşey tesisat şaftı için hizalamak ekonomiktir.`);
      }
    }
  }
  /* çekirdek ölçü + yükseklik-sınıfı denetimi (yangin-merdiven-kurallari.json → FIRE) */
  collectCoreDimChecks(add, p);
  collectCoreHeightChecks(add, p);
  /* parsel / bahçe */
  if(parcelClosed && parcelPts.length>=3 && closed){
    const site=(typeof siteOn==='function')&&siteOn();
    /* katları ayrı planlanan villada taban alanı = ZEMİN kat oturumu (aktif kat değil) */
    const zf=(p.villa&&floorsOn())? floorState(zeminIdx()) : null;
    const pa=shoelace(parcelPts);
    const ba=site? siteFootprintTotal() : shoelace(zf?zf.pts:pts);
    add('info', site
      ? `Parsel ${fmt(pa)} m² · ${blocks.length} blok toplam taban ${fmt(ba)} m² · bahçe ${fmt(Math.max(0,pa-ba))} m².`
      : `Parsel ${fmt(pa)} m² · bina taban alanı ${fmt(ba)} m² · bahçe ${fmt(Math.max(0,pa-ba))} m².`);
    /* tüm blok sınırları (site) ya da aktif bina (tek) parsel içinde mi? */
    const polys = site
      ? blocks.map((b,i)=> i===activeBlock? pts : (b&&b.pts)||[]).filter(a=>a.length>=3)
      : [pts];
    if(polys.some(poly=> poly.some(q=>!pip(q.x,q.y,parcelPts))))
      add('bad', site? 'Bir blok sınırı parsel dışına taşıyor!' : 'Bina sınırı parsel dışına taşıyor!');
    else{
      const taks=ba/pa;
      // İmar durumu (İBB e-Plan) çekildiyse gerçek TAKS/emsal limitine göre denetle, yoksa örnek mevzuat max'ı.
      const imar = (typeof parcelImar!=='undefined') ? parcelImar : null;
      const taksMax = (imar && imar.maksTaks>0) ? imar.maksTaks : REG.taksMax;
      const taksSrc = (imar && imar.maksTaks>0) ? `imar durumu max ${fmt(taksMax)}` : `örnek max ${fmt(REG.taksMax)} — imar durumuna göre değişir`;
      add(taks<=taksMax+1e-9?'ok':'bad',`TAKS ≈ ${fmt(taks)} (${taksSrc}).`);
      if(site){ const kaks=siteGrossTotal()/pa;
        if(imar && imar.emsal>0)
          add(kaks<=imar.emsal+1e-9?'ok':'bad',`KAKS (emsal) ≈ ${fmt(kaks)} (imar durumu emsal ${fmt(imar.emsal)}).`);
        else
          add('info',`KAKS (emsal) ≈ ${fmt(kaks)} (Σ blok taban × kat sayısı / parsel — imar durumuna göre değişir).`); }
      let minD=1e9;
      polys.forEach(poly=> poly.forEach(q=>{ for(let i=0;i<parcelPts.length;i++){ const A=parcelPts[i],B=parcelPts[(i+1)%parcelPts.length];
        minD=Math.min(minD, distSeg(q.x,q.y,A.x,A.y,B.x,B.y)); }}));
      add(minD>=REG.yanBahce?'ok':'info',`En küçük çekme mesafesi ≈ ${fmt(minD)} m (yan bahçe min ${fmt(REG.yanBahce)} m, ön bahçe imar durumuna bağlı).`);
    }
  }
  /* iç avlular */
  if(typeof courtyards!=='undefined' && courtyards && courtyards.length && closed){
    const tot=courtyards.reduce((s,av)=>s+shoelace(av.poly),0);
    add('info',`${courtyards.length} iç avlu, toplam ${fmt(tot)} m² (footprint'ten oyuldu; avluya bakan oda kenarları cephe/doğal havalandırma sayılır).`);
    const binaYuk=(p&&p.binaYuk)||(Math.max(1,+document.getElementById('katSayisi').value||1)*(+document.getElementById('katYuk').value||2.9));
    const oneri=binaYuk*REG.avluIsikOran;
    courtyards.forEach((av,i)=>{
      const bb=bboxOf(av.poly), kisa=Math.min(bb.maxX-bb.minX, bb.maxY-bb.minY);
      if(kisa < REG.avluMinKisa)
        add('bad',`Avlu ${i+1}: kısa kenar ${fmt(kisa)} m < ${fmt(REG.avluMinKisa)} m (şematik asgari hava bacası — havalandırma yetersiz).`);
      else if(kisa < oneri)
        add('info',`Avlu ${i+1}: kısa kenar ${fmt(kisa)} m; alt katlara ışık için önerilen ≈ ${fmt(oneri)} m (bina yük. ${fmt(binaYuk)} m × ${fmt(REG.avluIsikOran)} — imar durumuna göre).`);
      else
        add('ok',`Avlu ${i+1}: kısa kenar ${fmt(kisa)} m yeterli (≥ önerilen ${fmt(oneri)} m).`);
    });
  }
  /* site: bloklar arası mesafe / çakışma (yangın + imar şematik) */
  if((typeof siteOn==='function')&&siteOn() && typeof siteBlocksData==='function'){
    const polys=siteBlocksData().filter(d=>d.pts&&d.pts.length>=3);
    if(polys.length>=2){
      let minD=1e9, overlap=false, worst=null;
      for(let i=0;i<polys.length;i++) for(let j=i+1;j<polys.length;j++){
        const A=polys[i].pts, B=polys[j].pts;
        if(A.some(q=>pip(q.x,q.y,B)) || B.some(q=>pip(q.x,q.y,A))) overlap=true;
        let d=1e9;
        A.forEach(q=>{ for(let k=0;k<B.length;k++){ const P=B[k],Q=B[(k+1)%B.length]; d=Math.min(d,distSeg(q.x,q.y,P.x,P.y,Q.x,Q.y)); } });
        B.forEach(q=>{ for(let k=0;k<A.length;k++){ const P=A[k],Q=A[(k+1)%A.length]; d=Math.min(d,distSeg(q.x,q.y,P.x,P.y,Q.x,Q.y)); } });
        if(d<minD){ minD=d; worst=[polys[i].name,polys[j].name]; }
      }
      if(overlap) add('bad','İki blok çakışıyor (üst üste) — Site görünümünde sürükleyip ayırın.');
      else if(minD<REG.bloklarArasiMin) add('bad',`En yakın iki blok (${worst[0]}–${worst[1]}) arası ≈ ${fmt(minD)} m < ${fmt(REG.bloklarArasiMin)} m (şematik asgari; imar/yangın durumuna göre).`);
      else add('ok',`Bloklar arası en küçük mesafe ≈ ${fmt(minD)} m (≥ ${fmt(REG.bloklarArasiMin)} m).`);
    }
  }
  /* balkonlar */
  if(balconies.length){
    const tot=balconies.reduce((s,b)=>s+balkArea(b),0);
    add('info',`${balconies.length} balkon, toplam ${fmt(tot)} m² açık alan (brüt alana dahil edilmedi).`);
    balconies.forEach((b,i)=>{
      if(b.depth>REG.cikmaMax) add('bad',`Balkon ${i+1}: çıkma derinliği ${fmt(b.depth)} m > max ${fmt(REG.cikmaMax)} m (PAİY açık çıkma).`);
      else if(b.depth<REG.balkonMinD) add('info',`Balkon ${i+1}: derinlik ${fmt(b.depth)} m < ${fmt(REG.balkonMinD)} m — kullanışlılık için önerilen min.`);
      if(parcelClosed && balkQuad(b).some(q=>!pip(q.x,q.y,parcelPts)))
        add('bad',`Balkon ${i+1} parsel dışına taşıyor!`);
    });
  }
  /* sorunlar en üstte */
  const ORD={bad:0, ok:1, info:2};
  out.sort((a,b)=>ORD[a.s]-ORD[b.s]);
  return out;
}
function renderChecks(out){
  const box=document.getElementById('checks'); box.innerHTML='';
  const IC={ok:'check',bad:'cross',info:'info'};
  out.forEach(o=>{ const d=document.createElement('div');
    const clickable=o.reg!=null||o.unit!=null;
    d.className='chk '+o.s+(clickable?' click':'');
    const ic=document.createElement('span'); ic.className='ic'; ic.innerHTML=icon(IC[o.s]); d.appendChild(ic);
    const msg=document.createElement('span'); msg.textContent=o.t; d.appendChild(msg);
    if(o.reg!=null){ d.title='Plana odaklamak için tıklayın'; d.onclick=()=>focusRegion(o.reg); }
    else if(o.unit!=null){ d.title='Daireye odaklamak için tıklayın'; d.onclick=()=>focusUnit(o.unit); }
    /* B7: ihlalden eyleme köprü — odağa git + durum çubuğunda düzeltme önerisi (otomatik düzeltme YOK) */
    if(o.s==='bad' && o.action && o.reg!=null){
      const btn=document.createElement('button'); btn.className='chkAct'; btn.type='button';
      btn.textContent='Öneri'; btn.title='Odağa git ve nasıl düzeltileceğini göster';
      btn.onclick=ev=>{ ev.stopPropagation(); focusRegion(o.reg);
        if(typeof setStatusHint==='function') setStatusHint(o.action.hint,'#b35a2e'); };
      d.appendChild(btn);
    }
    box.appendChild(d); });
}
function runChecks(){
  const out=collectChecks();
  renderChecks(out);
  return out; // slimUnitAntre vb. ihlal sayısını kabul kapısı olarak kullanır
}
