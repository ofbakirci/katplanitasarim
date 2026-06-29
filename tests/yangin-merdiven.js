// Çekirdek ölçü + yükseklik-sınıfı denetimi (checks.js collectCoreDim/HeightChecks,
// core.js FIRE ← yangin-merdiven-kurallari.json).
//  A) ENTEGRASYON: gerçek generate() planında alçak/çok-yüksek/yüksek-blok davranışı
//     + normal planı SPAM'lemediği (false-positive yok).
//  B) İZOLE POZİTİF YOL: bad/info dallarının eşik ALTINDA gerçekten ateşlendiği,
//     eşik SINIRINDA ateşlenmediği, villa gevşemesi ve konut-mükerrer baskılaması.
function stubEl(tag){ return {
  tag, attrs:{}, children:[], style:{}, dataset:{}, _ih:'',
  set innerHTML(v){ this._ih=v; this.children=[]; }, get innerHTML(){ return this._ih; },
  appendChild(c){ this.children.push(c); return c; },
  addEventListener(){}, querySelectorAll(){ return []; },
  classList:{toggle(){},add(){},remove(){}},
  setAttribute(k,v){ this.attrs[k]=v; }, getAttribute(k){ return this.attrs[k]; },
  getBoundingClientRect(){ return {width:1400,height:1000,left:0,top:0}; },
  textContent:'', value:'', disabled:false, onclick:null, click(){}
};}
const byId={}; const getEl=id=>byId[id]||(byId[id]=stubEl('div'));
global.document={getElementById:getEl,createElement:t=>stubEl(t),createElementNS:(n,t)=>stubEl(t)};
global.window={addEventListener(){}};
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){};global.Blob=function(){};global.URL={createObjectURL:()=>''};
const {nodeText}=require('./support/dom-text');
const appJs=require('./support/app-js').readAppScript();

let FAILS=0;
function t(name, ok){ if(!ok) FAILS++; console.log((ok?' ✓ ':' ✗ FAIL ')+name); }

/* ---------- A) ENTEGRASYON (gerçek generate) ---------- */
function run(label, kat, poly, specs){
  getEl('binaTipi').value='apartman'; getEl('katSayisi').value=String(kat); getEl('katYuk').value='2.9';
  byId['checks']=stubEl('div'); global.__C={};
  eval(appJs + `
;unitSpecs=${JSON.stringify(specs)};
pts=${JSON.stringify(poly)}; closed=true; generate();
const cn=t=>plan.regions.filter(g=>g.type===t&&g.cells.length).length;
global.__C={ merdiven:cn('merdiven'), yangin:cn('yangin'), asansor:cn('asansor') };`);
  const msgs=byId['checks'].children.map(d=>({cls:d.className, txt:nodeText(d)}));
  console.log('--- '+label+' (kat '+kat+', binaYuk '+(kat*2.9).toFixed(1)+' m) → çekirdek '+JSON.stringify(global.__C)+' ---');
  return { c:global.__C,
           bad:s=>msgs.filter(m=>m.cls.includes('bad')&&m.txt.includes(s)).length,
           info:s=>msgs.filter(m=>m.cls.includes('info')&&m.txt.includes(s)).length,
           any:s=>msgs.filter(m=>m.txt.includes(s)).length };
}
const SQUARE=[{x:0,y:0},{x:30,y:0},{x:30,y:24},{x:0,y:24}];
const SPECS=[{oda:2,salon:1,ensuite:false,acik:false,adet:4}];

// 1) Alçak bina (6 kat, 17,4 m < 21,5): TEK merdiven varsayılan (azami oturum alanı);
//    yeni yüksek-sınıf uyarıları ÇIKMAMALI, kova/kuyu false-positive yok.
{ const r=run('alçak apartman', 6, SQUARE, SPECS);
  t('alçak: TEK merdiven varsayılan (yangın bölgesi YOK)', r.c.yangin===0 && r.c.merdiven===1);
  t('alçak: "tek korunumlu merdiven yeterli" (M.48/5a) mesajı var', r.any('tek korunumlu merdiven yeterli')>0);
  t('alçak: "2. kaçış (yangın) merdiveni zorunlu" YOK', r.any('2. kaçış (yangın) merdiveni zorunlu')===0);
  t('güvenlik holü zorunluluğu YOK (<21,5)', r.bad('güvenlik holü')===0);
  t('acil durum asansörü YOK (<21,5)', r.bad('acil durum asansörü')===0);
  t('merdiven kovası dar-kenar HARD ihlali yok', r.bad('kovası dar kenarı')===0);
  t('asansör kuyusu HARD ihlali yok', r.bad('kuyusu')===0);
}
// 1b) Eşik üstü (8 kat, 23,2 m > 21,5): 2. kaçış (yangın) merdiveni OTOMATİK eklenir.
{ const r=run('eşik üstü apartman', 8, SQUARE, SPECS);
  t('eşik üstü: 2. (yangın) merdiveni otomatik eklendi', r.c.yangin===1 && r.c.merdiven===1);
  t('eşik üstü: "2. kaçış ... zorunlu" mesajı + yerleşti (Yerleştirilemedi yok)', r.any('2. kaçış (yangın) merdiveni zorunlu')>0 && r.bad('Yerleştirilemedi')===0);
}
// 2) Çok-yüksek (12 kat, 34,8 m > 30,5): güvenlik holü/basınçlandırma zorunlu (motor çizmez → bad).
{ const r=run('çok-yüksek apartman', 12, SQUARE, SPECS);
  t('güvenlik holü/basınçlandırma zorunluluğu var (>30,5)', r.bad('güvenlik holü')>0);
  t('30,50 m eşiği mesajda geçiyor', r.any('30,5')>0);
  t('acil durum asansörü HENÜZ yok (≤51,5)', r.bad('acil durum asansörü')===0);
  t('konut: mükerrer "en az 2 kaçış merdiveni" YOK (dedup; eski yangın bloğu söylüyor)', r.any('en az 2 kaçış merdiveni')===0);
}
// 3) Yüksek-blok (18 kat, 52,2 m > 51,5): acil durum asansörü + asansör önü holü zorunlu.
{ const r=run('yüksek-blok apartman', 18, SQUARE, SPECS);
  t('acil durum asansörü zorunluluğu var (>51,5)', r.bad('acil durum asansörü')>0);
  t('51,50 m eşiği mesajda geçiyor', r.any('51,5')>0);
  t('güvenlik holü uyarısı da var', r.bad('güvenlik holü')>0);
}

/* ---------- B) İZOLE POZİTİF YOL (denetim fonksiyonlarını sentetik bölgeyle doğrudan çağır) ---------- */
console.log('--- izole pozitif/sınır vakaları ---');
global.__U=[];
eval(appJs + `
function mk(o){ return Object.assign({cells:[1], id:1, unit:-1}, o); }
function dim(p){ const a=[]; collectCoreDimChecks((s,t)=>a.push({s,t}), p); return a; }
function hgt(p){ const a=[]; collectCoreHeightChecks((s,t)=>a.push({s,t}), p); return a; }
const bad=(a,re)=>a.some(m=>m.s==='bad'&&re.test(m.t));
const info=(a,re)=>a.some(m=>m.s==='info'&&re.test(m.t));
const ok=(a,re)=>a.some(m=>m.s==='ok'&&re.test(m.t));
const U=(n,v)=>global.__U.push({n,v});

// --- merdiven kova: HARD bad / SOFT info / temiz ---
U('merdiven dar kenar 2,0<2,4 → HARD bad', bad(dim({villa:false,regions:[mk({type:'merdiven',name:'MERDİVEN',bw:2.0,bh:3.6,area:7.2,minSide:2.0})]}), /kovası dar kenarı/));
{ const a=dim({villa:false,regions:[mk({type:'merdiven',name:'MERDİVEN',bw:2.4,bh:2.9,area:6.96,minSide:2.4})]});
  U('merdiven dar OK + alan 6,96<8,64 → SOFT info (bad değil)', info(a,/önerilir|Kovayı uzatın/)&&!bad(a,/kovası/)); }
U('merdiven 3,0×5,0 (area 15) → TEMİZ', dim({villa:false,regions:[mk({type:'merdiven',name:'MERDİVEN',bw:3.0,bh:5.0,area:15,minSide:3.0})]}).length===0);

// --- asansör kuyu: HARD bad (her iki OR dalı) / temiz ---
U('asansör 1,2×1,4 → HARD bad (dar kenar dalı)', bad(dim({villa:false,regions:[mk({type:'asansor',name:'ASANSÖR',bw:1.2,bh:1.4,area:1.68,minSide:1.2})]}), /kuyusu/));
U('asansör 1,6×1,6 → HARD bad (uzun kenar 1,6<1,7 dalı)', bad(dim({villa:false,regions:[mk({type:'asansor',name:'ASANSÖR',bw:1.6,bh:1.6,area:2.56,minSide:1.6})]}), /kuyusu/));
U('asansör 2,0×3,0 → TEMİZ', dim({villa:false,regions:[mk({type:'asansor',name:'ASANSÖR',bw:2.0,bh:3.0,area:6,minSide:2.0})]}).length===0);

// --- villa daire-içi: gevşek 1,0 m eşik + apartman kova eşiği UYGULANMAZ ---
U('villa daire-içi merdiven 0,9<1,0 → bad', bad(dim({villa:true,regions:[mk({type:'merdiven',name:'MERDİVEN',bw:0.9,bh:3,area:2.7,minSide:0.9})]}), /daire içi merdiven kolu/));
U('villada apartman kova eşiği (2,4) UYGULANMAZ: 1,2 m temiz', dim({villa:true,regions:[mk({type:'merdiven',name:'MERDİVEN',bw:1.2,bh:3,area:3.6,minSide:1.2})]}).length===0);

// --- güvenlik holü (adı GÜVENLİK; motor henüz üretmez ama dal denetlenmeli) ---
U('küçük GÜVENLİK HOLÜ (2 m², dar 1,0) → bad', bad(dim({villa:false,regions:[mk({type:'koridor',name:'GÜVENLİK HOLÜ',bw:1.0,bh:2.0,area:2.0,minSide:1.0})]}), /güvenlik holü|kaçış yönü/i));

// --- yükseklik eşik SINIRI (strict >) ---
U('H=30,5 TAM → güvenlik holü dalı TETİKLENMEZ', !hgt({villa:false,binaYuk:30.5,regions:[mk({type:'merdiven',name:'MERDİVEN',minSide:3,bw:5,bh:3,area:15})]}).some(m=>/güvenlik holü/.test(m.t)));
U('H=30,51 → güvenlik holü dalı tetiklenir', hgt({villa:false,binaYuk:30.51,regions:[mk({type:'merdiven',name:'MERDİVEN',minSide:3,bw:5,bh:3,area:15})]}).some(m=>/güvenlik holü/.test(m.t)));
U('H=51,5 TAM → acil durum asansörü TETİKLENMEZ', !hgt({villa:false,binaYuk:51.5,regions:[mk({type:'merdiven',name:'MERDİVEN',minSide:3,bw:5,bh:3,area:15})]}).some(m=>/acil durum asansörü/.test(m.t)));
U('H=51,51 → acil durum asansörü tetiklenir', hgt({villa:false,binaYuk:51.51,regions:[mk({type:'merdiven',name:'MERDİVEN',minSide:3,bw:5,bh:3,area:15})]}).some(m=>/acil durum asansörü/.test(m.t)));

// --- kaç-merdiven (stairs<2) + konut dedup ---
const oneStair=[mk({type:'merdiven',name:'MERDİVEN',minSide:3,bw:5,bh:3,area:15})];
const twoStair=[mk({type:'merdiven',name:'MERDİVEN',minSide:3,bw:5,bh:3,area:15}),mk({type:'yangin',name:'YANGIN MERD.',id:2,minSide:2.5,bw:5,bh:2.5,area:12.5})];
U('ticari yüksek (34,8 m) + tek merdiven → "zorunlu" bad', bad(hgt({villa:false,katKullanim:'ticari',binaYuk:34.8,regions:oneStair}), /kaçış merdiveni zorunlu/));
U('ticari yüksek + 2 merdiven → "gerekli" ok', ok(hgt({villa:false,katKullanim:'ticari',binaYuk:34.8,regions:twoStair}), /en az 2 kaçış merdiveni/));
U('KONUT yüksek + tek merdiven → mükerrer "2 kaçış" BASTIRILDI', !hgt({villa:false,binaYuk:34.8,regions:oneStair}).some(m=>/en az 2 kaçış merdiveni/.test(m.t)));
`);
global.__U.forEach(u=>t(u.n, u.v));

console.log(FAILS===0 ? '\nTÜMÜ GEÇTİ' : ('\n'+FAILS+' BAŞARISIZ'));
process.exit(FAILS===0?0:1);
