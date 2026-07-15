/* Blok TASLAĞI (sınır çizili, yerleşim YOK) blok geçişinde kaybolmamalı.
   node tests/blok-taslak.js

   Kök hata (deterministik repro: boş projede sınır çiz + kapat → Site aç → "+ Blok" →
   Blok A'ya dön → sınır YOK):
   saveActiveBlock() yalnız `plan` varken snapshot alıyordu (stateSnapshot(false) plansız
   null döner). Sınırı çizilmiş ama "Yerleşimi Oluştur" denmemiş bloktan çıkılınca çizili
   pts sessizce kayboluyordu. Oysa renderBlockTabs bu durumu ("sınır çizili, yerleşim
   bekliyor") gösteriyor, siteBlocksData/siteFootprintTotal/view3d ise plansız snapshot'ı
   (b.pts + b.ui) okuyabiliyordu — yani UI destekliyor, kayıt katmanı desteklemiyordu.

   (a) "+ Blok" çizili sınırı taslak olarak kaydeder + geri dönünce sınır açılır;
   (b) blok geçişi (switchBlock) taslağı korur — iki yönlü, plansız↔planlı karışık;
   (c) taslak site katmanında görünür (sekme etiketi/alan, Σ taban, hayalet, view3d kat sayısı);
   (d) taslak sonradan generate() ile plana döner (taslak → tam snapshot terfi eder);
   (e) yarım çizim (closed=false) taslağa YAZILMAZ (inaktif blok kapalı poligon varsayılır);
   (f) boş tuval mevcut kaydı EZMEZ; (g) planlı blok yolu + removeBlock bozulmadı. */
function stubEl(tag){ return {
  tag, attrs:{}, children:[], style:{}, dataset:{}, _ih:'',
  set innerHTML(v){ this._ih=v; this.children=[]; }, get innerHTML(){ return this._ih; },
  appendChild(c){ this.children.push(c); return c; },
  addEventListener(){}, querySelectorAll(){ return []; }, querySelector(){ return null; },
  classList:{toggle(){},add(){},remove(){}},
  setAttribute(k,v){ this.attrs[k]=v; }, getAttribute(k){ return this.attrs[k]; },
  getBoundingClientRect(){ return {width:1200,height:800,left:0,top:0}; },
  textContent:'', value:'', disabled:false, checked:false, onclick:null, click(){}, parentElement:null, offsetHeight:0
};}
const byId={}; const getEl=id=>byId[id]||(byId[id]=stubEl('div'));
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='3'; getEl('katYuk').value='2.9';
getEl('bodrumSayisi').value='0';
global.document={ getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t),
  querySelectorAll:sel=>[] };
global.window={addEventListener(){}};
global.matchMedia=()=>({matches:false});
global.alert=()=>{}; global.confirm=()=>true;
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){}; global.Blob=function(){}; global.URL={createObjectURL:()=>''};
const {extractAppScript}=require('./support/app-js');
const src=extractAppScript();

let pass=0, fail=0;
const T=(name,cond)=>{ if(cond){pass++;} else {fail++; console.log('  [FAIL]', name);} };

eval(src+`
;(function(){
  const A=[{x:0,y:0},{x:16,y:0},{x:16,y:12},{x:0,y:12}];      // Blok A sınırı (16x12 = 192 m²)
  const B=[{x:30,y:0},{x:46,y:0},{x:46,y:12},{x:30,y:12}];    // Blok B sınırı
  /* fix'siz kodda blocks[i]===null → assert'ler patlamak yerine kırmızı yansın (tüm FAIL'ler görünsün) */
  const bp=i=>((blocks[i]&&blocks[i].pts)||[]);

  /* === (a) DETERMİNİSTİK REPRO: sınır çiz + kapat (plan YOK) → Site aç → "+ Blok" === */
  pts=A.map(p=>({...p})); closed=true; plan=null;             // çizim kapanışı (interaction.js) — yerleşim üretilmedi
  unitSpecs=[{oda:2,salon:1,ensuite:false,acik:false,adet:2}];
  document.getElementById('siteMod').checked=true;
  blocks=[null]; activeBlock=0;                               // siteMod change handler ile birebir (plan yok → null)
  T('kurulum: site açık, Blok A sınırı çizili ama plansız', siteOn()===true && closed===true && !plan);

  addBlock();                                                 // "+ Blok" → Blok B (boş tuval)
  T('a: + Blok sonrası 2 blok', blocks.length===2 && activeBlock===1);
  T('a: Blok A taslağı KAYDEDİLDİ (pts kaybolmadı)',
     !!blocks[0] && Array.isArray(blocks[0].pts) && blocks[0].pts.length===4 && !blocks[0].plan);
  T('a: taslak sınırı birebir', bp(0).length===4 && bp(0)[1].x===16 && bp(0)[2].y===12);
  T('a: yeni blok tuvali boş', pts.length===0 && closed===false && !plan);

  switchBlock(0);                                             // Blok A'ya geri dön
  T('a: Blok A geri — sınır açıldı', activeBlock===0 && closed===true && pts.length===4);
  T('a: Blok A geri — sınır koordinatları korundu', pts.length===4 && pts[1].x===16 && pts[2].y===12);
  T('a: Blok A geri — plan hâlâ yok (taslak)', !plan);
  T('a: Blok A geri — "Yerleşimi Oluştur" düğmesi açık', document.getElementById('genBtn').disabled===false);
  T('a: Blok A geri — alan durum çubuğunda', /192/.test(document.getElementById('stArea').textContent));
  T('a: Blok A geri — daire programı korundu', unitSpecs.length===1 && unitSpecs[0].adet===2);

  /* === (c) taslak site katmanında GÖRÜNÜR === */
  T('c: Σ taban taslağı sayıyor (aktif taslak)', Math.abs(siteFootprintTotal()-192)<0.01);
  const gh=otherBlockGhosts();
  T('c: aktif taslak hayalet listesinde değil', gh.length===0);
  const sbd=siteBlocksData();
  T('c: siteBlocksData aktif taslağı veriyor (regions boş)',
     sbd.length===1 && sbd[0].idx===0 && sbd[0].active===true && (sbd[0].regions||[]).length===0);
  renderBlockTabs();
  T('c: sekme kutusu kuruldu', document.getElementById('blockTabs').style.display==='flex');

  /* === (b) taslak ↔ taslak geçişi: Blok B sınırını çiz, A'ya geç, B'ye dön === */
  switchBlock(1);
  pts=B.map(p=>({...p})); closed=true;                        // Blok B de taslak (plansız)
  switchBlock(0);
  T('b: A taslağı hâlâ sağlam', pts.length===4 && pts[0].x===0 && !plan);
  T('b: B taslağı kaydedildi', bp(1).length===4 && bp(1)[0].x===30 && !blocks[1].plan);
  T('b: iki taslak birlikte Σ tabana giriyor', Math.abs(siteFootprintTotal()-384)<0.01);
  const gh2=otherBlockGhosts();
  T('b: inaktif taslak hayalet olarak çiziliyor', gh2.length===1 && gh2[0].name==='B' && (gh2[0].pts||[]).length===4);
  switchBlock(1);
  T('b: B taslağına dönüş — sınır açıldı', activeBlock===1 && closed===true && pts.length===4 && pts[0].x===30 && !plan);

  /* === (c2) view3d sahne envanteri blok başına b.ui.katSayisi okur → taslak ui taşımalı === */
  T('c2: taslak ui.katSayisi taşıyor', !!(blocks[0] && blocks[0].ui && blocks[0].ui.katSayisi==='3'));

  /* === (d) taslak → generate() → tam snapshot terfisi === */
  generate();                                                 // Blok B'de yerleşim üret
  T('d: taslak bloktan plan üretildi', !!plan && activeBlock===1);
  switchBlock(0);
  T('d: B artık TAM snapshot (planlı)', !!blocks[1] && !!blocks[1].plan && !blocks[1].draft);
  T('d: A hâlâ taslak (karışık site tutarlı)', !!blocks[0] && !blocks[0].plan && bp(0).length===4);
  T('d: karışık sitede A taslağı canlı', activeBlock===0 && closed===true && !plan && pts.length===4);

  /* === (g) planlı ↔ taslak karışık geçiş + planlı blok yolu bozulmadı === */
  switchBlock(1);
  T('g: planlı bloğa geçiş çalışıyor', activeBlock===1 && !!plan && plan.regions.length>0);
  switchBlock(0);
  T('g: planlıdan taslağa dönüş (plan temizlendi)', activeBlock===0 && !plan && closed===true && pts.length===4);

  /* === (e) YARIM çizim (closed=false) taslağa yazılmaz === */
  pts=[{x:0,y:0},{x:5,y:0},{x:5,y:5}]; closed=false;          // kapatılmamış çizim
  T('e: blockDraftSnapshot yarım çizimi reddediyor', blockDraftSnapshot()===null);
  const before=JSON.stringify(blocks[0]);
  saveActiveBlock();
  T('e: yarım çizim kaydı EZMİYOR (eski taslak duruyor)', JSON.stringify(blocks[0])===before);

  /* === (f) boş tuval mevcut kaydı ezmez === */
  pts=[]; closed=false; plan=null;
  saveActiveBlock();
  T('f: boş tuval kaydı ezmiyor', JSON.stringify(blocks[0])===before);

  /* === (g2) removeBlock taslağı doğru açar === */
  switchBlock(1); switchBlock(0);                             // A'dan çık+dön → (f)'nin ezilmeyen taslağı geri gelmeli
  T('g2: kurulum — boş tuvalden çıkıp dönünce A taslağı geri geldi', closed===true && pts.length===4 && !plan);
  blocks.push(null); activeBlock=2; clearCanvasForNewBlock();  // Blok C (boş) ekle, A kaydedilir
  removeBlock(2);                                              // C'yi sil → aktif A'ya döner (taslak!)
  T('g2: C silindi', blocks.length===2 && activeBlock===1);
  switchBlock(0);
  T('g2: silme sonrası A taslağı hâlâ açılıyor', closed===true && pts.length===4 && pts[1].x===16 && !plan);
})();
`);
console.log(pass+' geçti, '+fail+' kaldı');
process.exit(fail?1:0);
