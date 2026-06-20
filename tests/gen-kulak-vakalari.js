/* Kulak (çıkıntı) kalibrasyon vakaları üretici.
   Çeşitli footprint'leri motordan geçirip içe-aktarılabilir kpState'li SVG yazar.
   Kullanıcı bu dosyaları araca "SVG içe aktar" ile yükler, ideal yerleşimi çizer,
   tekrar dışa aktarıp geri verir → kulak algılama kalibre edilir.
   Çalıştır:  node tests/gen-kulak-vakalari.js   (/tmp/app.js gerekir) */
const fs=require('fs'), path=require('path');

function stubEl(tag){ return {
  tag, attrs:{}, children:[], style:{}, dataset:{}, _ih:'',
  set innerHTML(v){ this._ih=v; this.children=[]; }, get innerHTML(){ return this._ih; },
  appendChild(c){ this.children.push(c); return c; },
  insertBefore(c){ this.children.unshift(c); return c; },
  addEventListener(){}, querySelectorAll(){ return []; }, querySelector(){ return null; },
  classList:{toggle(){},add(){},remove(){},contains(){return false;}},
  setAttribute(k,v){ this.attrs[k]=v; }, getAttribute(k){ return this.attrs[k]; },
  getBoundingClientRect(){ return {width:1200,height:800,left:0,top:0}; },
  textContent:'', value:'', disabled:false, checked:false, onclick:null, click(){}, focus(){}, remove(){}
};}
const byId={}; const getEl=id=> byId[id]||(byId[id]=stubEl('div'));
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='5'; getEl('katYuk').value='2.9';
global.document={getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t),
  addEventListener(){}, querySelectorAll(){return [];}};
global.window={addEventListener(){}, matchMedia:()=>({matches:false})};
global.matchMedia=()=>({matches:false});
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){}; global.Blob=function(){}; global.URL={createObjectURL:()=>'',revokeObjectURL(){}};
global.localStorage={getItem(){return null;},setItem(){}};
global.requestAnimationFrame=fn=>fn&&fn();

const src=fs.readFileSync('/tmp/app.js','utf-8');
/* eval-içi fonksiyon/değişkenler dışarı sızmaz; motor scope'una bir yardımcı enjekte
   edip globalThis üzerinden çağırıyoruz (harness2 deseni). */
eval(src + `
;globalThis.__genCase=function(ptsArr, specs){
  lockedCore=null; villaFloors=null; activeFloor=0;
  balconies=[]; parcelPts=[]; parcelClosed=false;
  customCutsZ=null; unitLayout={}; doorOverrides={}; extraDoors=[]; doorHidden={}; editHistory=[];
  unitSpecs=JSON.parse(JSON.stringify(specs));
  pts=ptsArr.map(p=>({x:p[0],y:p[1]})); closed=true;
  generate();
  return { st: stateSnapshot(), cols: plan.cols,
    core: plan.regions.filter(g=>['merdiven','asansor','yangin','teknik'].includes(g.type)&&g.cells.length).map(g=>g.type+' '+(g.cells.length*0.25)+' m2'),
    units: plan.unitObjs.map(u=>Math.round(u.rooms.reduce((s,g)=>s+g.cells.length*0.25,0))+' m2') };
};
`);

const SPEC=[{oda:3,salon:1,ensuite:false,acik:false,adet:2}];  // 2 × 3+1

/* footprint'ler — pts (m), saat yönü, 0,5 m ızgaraya oturur */
const CASES=[
  { name:'kulak-A-tek-sol', not:'Tek SOL kulak (2,5×5), 20×10 gövde',
    pts:[[5,5],[25,5],[25,15],[5,15],[5,12.5],[2.5,12.5],[2.5,7.5],[5,7.5]] },
  { name:'kulak-B-ust-orta', not:'ÜST kulak (5×2,5, ortada), 20×10 gövde',
    pts:[[5,5],[12.5,5],[12.5,2.5],[17.5,2.5],[17.5,5],[25,5],[25,15],[5,15]] },
  { name:'kulak-C-asimetrik', not:'İki kulak, asimetrik: sol büyük (2,5×7), sağ küçük (2,5×3)',
    pts:[[5,5],[25,5],[25,9],[27.5,9],[27.5,12],[25,12],[25,15],[5,15],[5,13],[2.5,13],[2.5,6],[5,6]] },
  { name:'kulak-D-uzun-tek-uc', not:'UZUN gövde (28×8) + tek sol kulak → çekirdek bir uçta kümelenir mi? küçük hol?',
    pts:[[5,5],[33,5],[33,13],[5,13],[5,11.5],[2.5,11.5],[2.5,6.5],[5,6.5]] },
  { name:'kulak-E-genis-iki-kulak', not:'GENİŞ gövde (30×10) + iki uçta kulak',
    pts:[[5,5],[35,5],[35,8],[37.5,8],[37.5,12],[35,12],[35,15],[5,15],[5,12],[2.5,12],[2.5,8],[5,8]] },
  { name:'kulak-F-cift-sol', not:'İki kulak AYNI tarafta (sol-üst + sol-alt) → çekirdek solda kümelenir',
    pts:[[5,5],[25,5],[25,17],[5,17],[5,15],[2.5,15],[2.5,12],[5,12],[5,9],[2.5,9],[2.5,6],[5,6]] },
];

const outDir=path.join(__dirname,'..','kulak-vakalari');
fs.mkdirSync(outDir,{recursive:true});

CASES.forEach(C=>{
  let R;
  try{ R=global.__genCase(C.pts, SPEC); }catch(e){ console.log(C.name,'GEN HATA',e.message); return; }
  const st=R.st;
  const core=R.core.join(', ');
  const units=R.units.join('/');
  /* basit görünür SVG + kpState (araç içe aktarınca yeniden render eder) */
  const xs=C.pts.map(p=>p[0]), ys=C.pts.map(p=>p[1]);
  const sc=24, mb=20, minX=Math.min(...xs), minY=Math.min(...ys);
  const W=Math.round((Math.max(...xs)-minX)*sc+2*mb), H=Math.round((Math.max(...ys)-minY)*sc+2*mb);
  const d='M'+C.pts.map(p=>((p[0]-minX)*sc+mb).toFixed(1)+','+((p[1]-minY)*sc+mb).toFixed(1)).join('L')+'Z';
  const svg='<svg id="svg" xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'" '
    +'style="background:#faf8f3" font-family="Helvetica,Arial,sans-serif">'
    +'<metadata id="kpState">'+JSON.stringify(st)+'</metadata>'
    +'<path d="'+d+'" fill="rgba(179,90,46,.06)" stroke="#2b2620" stroke-width="2.5" stroke-linejoin="miter"/>'
    +'<text x="'+mb+'" y="'+(H-6)+'" font-size="11" fill="#9c8e76">'+C.name+' — '+C.not+'</text>'
    +'</svg>';
  fs.writeFileSync(path.join(outDir,C.name+'.svg'),svg);
  console.log(C.name.padEnd(24)+' yazıldı | çekirdek: '+(core||'(band)')+' | daireler '+units);
});
console.log('\n→ kulak-vakalari/ klasörüne '+CASES.length+' dosya yazıldı');
