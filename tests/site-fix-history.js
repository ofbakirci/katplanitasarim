/* SITE-FIX F2: "Yerleşimi Oluştur" (generate) ARTIK geçmişi RESETLEMEZ — node tests/site-fix-history.js
   Kök neden: generate() editHistory filtresi bölge-referanslı delta'ları (kapı/duvar/oda-tipi vb.)
   bayat oldukları için düşürür ve HİÇBİR geri-dönüş kaydı bırakmazdı → panel boşalır, Ctrl+Z ölür.
   Fix: generateWithHistory() generate ÖNCESİ TAM durumu __snap checkpoint olarak iter (filtre __snap'i
   KORUR). Bu test: (1) generate sonrası "Yerleşim oluşturuldu" satırı DURUR, (2) redoHistory temizlenir,
   (3) undoEdit generate ÖNCESİ görsel duruma döner (elle düzenler baked-in), (4) redoEdit geri uygular. */
function stubEl(tag){ return {
  tag, attrs:{}, children:[], style:{}, dataset:{}, _ih:'',
  set innerHTML(v){ this._ih=v; this.children=[]; }, get innerHTML(){ return this._ih; },
  appendChild(c){ this.children.push(c); return c; },
  addEventListener(){}, querySelectorAll(){ return []; }, querySelector(){ return null; },
  classList:{toggle(){},add(){},remove(){}},
  setAttribute(k,v){ this.attrs[k]=v; }, getAttribute(k){ return this.attrs[k]; },
  getBoundingClientRect(){ return {width:1200,height:800,left:0,top:0}; },
  textContent:'', value:'', disabled:false, onclick:null, click(){}, parentElement:null, offsetHeight:0
};}
const byId={};
const getEl=id=>byId[id]||(byId[id]=stubEl('div'));
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='5'; getEl('katYuk').value='2.9';
global.document={getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t)};
global.window={addEventListener(){}};
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){}; global.Blob=function(){}; global.URL={createObjectURL:()=>''};

const {extractAppScript}=require('./support/app-js');
const src=extractAppScript();

let pass=0, fail=0;
const T=(name,cond)=>{ if(cond){pass++;} else {fail++; console.log('  [FAIL]', name);} };

eval(src + `
;unitSpecs=[{oda:2,salon:1,ensuite:true,acik:false,adet:2},{oda:1,salon:1,ensuite:false,acik:true,adet:2}];
pts=[{x:0,y:0},{x:32,y:0},{x:32,y:16},{x:0,y:16}]; closed=true;

// 1) İlk üretim (henüz plan yok → checkpoint YAZILMAZ, temiz başlangıç)
generateWithHistory();
T('ilk generate: plan üretildi', !!plan);
T('ilk generate: geçmiş boş (önceki plan yoktu → checkpoint yok)', editHistory.length===0);

// bölge sayısı imzası (undo'nun pre-gen duruma döndüğünü doğrulamak için)
const regCountA = plan.regions.length;

// 2) Elle düzenlemeler (bölge-referanslı → generate filtresi bunları DÜŞÜRÜR)
pushEdit({type:'retype', prev:{}});
pushEdit({type:'door',   prev:{}});
pushEdit({type:'wallsnap',prev:{}});
T('elle düzenleme: 3 kayıt', editHistory.length===3);
T('elle düzenleme: redo boş (pushEdit temizler)', redoHistory.length===0);

// 3) İKİNCİ üretim (kullanıcı yeniden "Yerleşimi Oluştur") — checkpoint YAZILMALI
generateWithHistory();
T('generate sonrası: geçmiş RESETLENMEDİ (checkpoint var)', editHistory.length===1);
T('generate sonrası: checkpoint __snap tipinde', editHistory[0] && editHistory[0].type==='__snap');
T('generate sonrası: etiket "Yerleşim oluşturuldu"', editHistory[0] && editHistory[0].label==='Yerleşim oluşturuldu');
T('generate sonrası: redoHistory temizlendi (yeni eylem)', redoHistory.length===0);
T('generate sonrası: plan hâlâ geçerli', !!plan && plan.regions.length>0);

// 4) Ctrl+Z → generate ÖNCESİ duruma dön (undo zinciri kopmadı)
const okUndo = undoEdit();
T('undo: true döndü (zincir kopmadı)', okUndo===true);
T('undo: plan hâlâ geçerli (pre-gen durum yüklendi)', !!plan);
T('undo: bölge sayısı pre-gen ile tutarlı', plan.regions.length===regCountA);
T('undo: geçmiş boşaldı (tek checkpoint pop edildi)', editHistory.length===0);
T('undo: redoHistory doldu (ileri-al mümkün)', redoHistory.length===1);

// 5) Ctrl+Y → generate'i geri uygula (simetrik redo)
const okRedo = redoEdit();
T('redo: true döndü', okRedo===true);
T('redo: checkpoint geçmişe döndü (__snap)', editHistory.length===1 && editHistory[0].type==='__snap');
T('redo: plan geçerli', !!plan);
`);

console.log('SITE-FIX F2 (geçmiş resetlenmesin): '+pass+' geçti, '+fail+' başarısız');
if(fail>0) process.exit(1);
