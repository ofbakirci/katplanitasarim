// ZEMİN KAT apartman giriş kapısı denetimi (checks.js collectGroundEntranceCheck).
// Kural: zemin katta apartman holü bina DIŞ sınırına değmeli, yoksa apartman/bina
// giriş kapısı yerleştirilemez. katAyri ON + zemin katı → KIRMIZI (bad);
// katAyri OFF (tek tip kat) → yumuşak (info). Üst kat + villa MUAF.
//  A) İZOLE: collectGroundEntranceCheck'i sentetik planla doğrudan çağır
//     (bad/info/muaf dallarının hepsi).
//  B) ENTEGRASYON: gerçek generate() çıktısında (motor holü'yü cepheye yapıştırır)
//     YANLIŞ-POZİTİF YOK; sonra holü'yü içeri çekince (kullanıcı "maks alan" düzeni)
//     gerçek geometride uyarı ATEŞLENİR.
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
const appJs=require('./support/app-js').readAppScript();

let FAILS=0;
function t(name, ok){ if(!ok) FAILS++; console.log((ok?' ✓ ':' ✗ FAIL ')+name); }
const ENTRANCE=/giriş kapısı yerleştirilemez/;

/* ---------- A) İZOLE (collectGroundEntranceCheck doğrudan) ---------- */
console.log('--- A) izole dallar (sentetik plan) ---');
global.__A=[];
eval(appJs + `
// 4x5 tam-dolu dikdörtgen (tüm hücreler inside). İç hücreler (perimetre dışı):
// r∈{1,2}, c∈{1,2,3} → ör. index 6,7,11,12. Perimetre hücresi: 0 (r0c0).
const mkP=over=>Object.assign({ villa:false, cols:5, rows:4,
  inside:new Array(20).fill(1), unitObjs:[{rooms:[{cells:[6]}]}], regions:[] }, over);
const kor=cells=>({type:'koridor', name:'APARTMAN HOLÜ', id:0, cells});
const call=(p,ground,ayri)=>{ const a=[]; collectGroundEntranceCheck((s,t,reg)=>a.push({s,t,reg}), p, ground, ayri); return a; };
const has=(a,sev)=>a.some(m=>m.s===sev && /giriş kapısı yerleştirilemez/.test(m.t));
const U=(n,v)=>global.__A.push({n,v});

// içeri holü + zemin + katAyri ON → KIRMIZI (bad)
U('katAyri ON + zemin + holü içeride → bad', has(call(mkP({regions:[kor([6,7,11,12])]}), true, true),'bad'));
// içeri holü + zemin + katAyri OFF → yumuşak (info), bad DEĞİL
{ const a=call(mkP({regions:[kor([6,7,11,12])]}), true, false);
  U('katAyri OFF + holü içeride → info (bad değil)', has(a,'info') && !has(a,'bad')); }
// ÜST KAT (ground=false) → hiçbir uyarı (MUAF)
U('üst kat (ground=false) → uyarı YOK', call(mkP({regions:[kor([6,7,11,12])]}), false, true).length===0);
// holü dış sınıra DEĞİYOR (perimetre hücresi 0 dahil) → uyarı YOK
U('holü cepheye değiyor → uyarı YOK', call(mkP({regions:[kor([0,6,7])]}), true, true).length===0);
// villa → MUAF
U('villa → uyarı YOK', call(mkP({villa:true, regions:[kor([6,7,11,12])]}), true, true).length===0);
// daire yok (unitObjs boş) → MUAF (konut-dışı/ticari ayrı yoldan ele alınır)
U('unitObjs boş → uyarı YOK', call(mkP({unitObjs:[], regions:[kor([6,7,11,12])]}), true, true).length===0);
// apartman holü yok (koridor region yok) → uyarı YOK
U('koridor region yok → uyarı YOK', call(mkP({regions:[{type:'salon',id:1,cells:[6,7]}]}), true, true).length===0);
`);
global.__A.forEach(u=>t(u.n, u.v));

/* ---------- B) ENTEGRASYON (gerçek generate + gerçek geometri) ---------- */
console.log('--- B) entegrasyon (gerçek motor) ---');
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='5'; getEl('katYuk').value='2.9';
byId['checks']=stubEl('div');
eval(appJs + `
// çok-daireli apartman → apartman holü (koridor) oluşur; katAyri OFF (varsayılan).
unitSpecs=[{oda:2,salon:1,ensuite:false,acik:false,adet:3}];
pts=[{x:0,y:0},{x:20,y:0},{x:20,y:13},{x:0,y:13}]; closed=true; generate();
const p=plan, cols=p.cols, rows=p.rows;
const kor0=p.regions.find(g=>g.type==='koridor'&&g.cells.length);
global.__HASKOR = !!kor0;
// 1) motor çıktısı: holü cepheye değer → tam runChecks'te giriş uyarısı YOK (yanlış-poz.)
global.__R1 = runChecks().filter(m=>/giriş kapısı yerleştirilemez/.test(m.t)).length;
// 2) kullanıcının "dairelere maks alan" düzeni: holü'nün sınıra değen hücrelerini
//    komşu dairelere ver → holü içeri çekilir. Gerçek geometride collectGroundEntranceCheck.
(function(){
  const isB=i=>{const r=(i/cols)|0,c=i%cols; return r===0||r===rows-1||c===0||c===cols-1||!p.inside[i-cols]||!p.inside[i+cols]||!p.inside[i-1]||!p.inside[i+1];};
  let guard=0;
  while(kor0 && kor0.cells.some(isB) && guard++<5000){
    const idx=kor0.cells.findIndex(isB), cell=kor0.cells[idx], r=(cell/cols)|0,c=cell%cols;
    const nbrs=[[r-1,c],[r+1,c],[r,c-1],[r,c+1]].map(([rr,cc])=>(rr<0||cc<0||rr>=rows||cc>=cols)?-1:rr*cols+cc)
      .filter(j=>j>=0&&p.inside[j]&&p.cm[j]>=0&&p.cm[j]!==kor0.id);
    const tgt=nbrs.map(j=>p.regions[p.cm[j]]).find(g=>g&&g.type!=='koridor'&&g.type!=='merdiven'&&g.type!=='asansor'&&g.type!=='yangin');
    kor0.cells.splice(idx,1);
    if(tgt){ tgt.cells.push(cell); p.cm[cell]=tgt.id; } else { p.cm[cell]=-1; }
  }
  global.__KORLEFT = kor0?kor0.cells.length:0;
  global.__KORTOUCH = kor0?kor0.cells.some(isB):true;
})();
const callR=(ground,ayri)=>{ const a=[]; collectGroundEntranceCheck((s,t,reg)=>a.push({s,t}), plan, ground, ayri); return a; };
global.__R2_info = callR(true,false).filter(m=>m.s==='info'&&/giriş kapısı yerleştirilemez/.test(m.t)).length;  // katAyri OFF
global.__R2_bad  = callR(true,true ).filter(m=>m.s==='bad' &&/giriş kapısı yerleştirilemez/.test(m.t)).length;  // katAyri ON zemin
global.__R2_up   = callR(false,true).length;  // üst kat MUAF
`);
t('entegrasyon: apartman holü (koridor) oluştu', global.__HASKOR===true);
t('entegrasyon: motor çıktısı holü cepheye değer → giriş uyarısı YOK (yanlış-pozitif yok)', global.__R1===0);
t('entegrasyon: holü içeri çekildi (sınıra değmiyor, cells>0)', global.__KORLEFT>0 && global.__KORTOUCH===false);
t('entegrasyon: içeri-holü + katAyri OFF → tam 1 info', global.__R2_info===1);
t('entegrasyon: içeri-holü + katAyri ON zemin → tam 1 bad', global.__R2_bad===1);
t('entegrasyon: içeri-holü + üst kat → uyarı YOK (muaf)', global.__R2_up===0);

console.log(FAILS===0 ? '\nTÜMÜ GEÇTİ' : ('\n'+FAILS+' BAŞARISIZ'));
process.exit(FAILS===0?0:1);
