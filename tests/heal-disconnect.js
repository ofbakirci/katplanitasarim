/* KOPUK BÖLGE ONARIMI testi — node tests/heal-disconnect.js
   Vaka (kat-plani-44 / D3): relayoutFootprint (daire takası, sınır relayout'u, yükleme)
   tüketilmeyen "leftover" hücreleri tek odaya döküyor; çekirdek girintisi yüzünden uzak
   cepler ANA GÖVDEDEN KOPUK bir parça olarak takılıyor. Kopuk bölge regConnected'ı kalıcı
   false yapar → o odada "oda ekle" ve duvar sürükleme HEP reddedilir (D3 antresi 71,75 m²,
   sağ tık eklemiyor, handle büyütmüyor). healDisconnected() ikincil parçaları en uygun
   AYNI-daire komşusuna katar → bölge tek parça, düzenlenebilir. Bağlı planda NO-OP. */
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
;unitSpecs=[{oda:3,salon:1,ensuite:true,acik:false,adet:2},{oda:2,salon:1,ensuite:false,acik:false,adet:1}];
pts=[{x:0,y:0},{x:32,y:0},{x:32,y:18},{x:0,y:18}]; closed=true;
generate();

const COLS=plan.cols;
function comps(g){ const set=new Set(g.cells),seen=new Set(),out=[];
  for(const s of g.cells){ if(seen.has(s))continue; const st=[s],comp=[];seen.add(s);
    while(st.length){const i=st.pop();comp.push(i);const r=(i/COLS)|0,c=i%COLS;
      for(const j of [i-COLS,i+COLS,i-1,i+1]){ const rj=(j/COLS)|0,cj=j%COLS;
        if(set.has(j)&&!seen.has(j)&&Math.abs(rj-r)+Math.abs(cj-c)===1){seen.add(j);st.push(j);} } }
    out.push(comp);} return out; }
const anyDisc=()=>plan.regions.some(g=>g.cells.length>1 && comps(g).length>1);
const integrity=()=>{ let ins=0; for(let i=0;i<plan.inside.length;i++) if(plan.inside[i]) ins++;
  let tot=0; const seen=new Set(); let ok=true;
  plan.regions.forEach(g=>g.cells.forEach(i=>{ if(seen.has(i)) ok=false; seen.add(i); if(plan.cm[i]!==g.id) ok=false; }));
  plan.regions.forEach(g=>tot+=g.cells.length);
  return ok && tot===ins; };

/* taze üretim TEK PARÇA olmalı (generate fixOrphans çalışır) ve heal NO-OP olmalı */
T('taze üretim: kopuk bölge yok', !anyDisc());
T('taze üretim: heal NO-OP (idempotent)', healDisconnected()===false);
T('taze üretim: bütünlük', integrity());

/* ===== STRAND BUG'ını ÜRET (leftover-döküm taklidi): bir odanın gövdesinden UZAK,
   başka odaya ait bir şeridi doğrudan ona yapıştır → bölge iki parçaya bölünür. Gerçek
   vakada (D3 antresi) çekirdek girintisinin arkasındaki ceptir; burada büyük SALON üstünde
   üretilir ki "düzenleme açıldı" kontrolü oda boyutundan bağımsız olsun. ===== */
const u=plan.unitObjs.find(u=>u.rooms.some(g=>g.type==='salon'&&g.cells.length>20));
const victim=u.rooms.find(g=>g.type==='salon'&&g.cells.length>20);   // büyük oda (D3 antresi gibi)
const adjV=i=>{ const r=(i/COLS)|0,c=i%COLS;
  return (r>0&&plan.cm[i-COLS]===victim.id)||(r<plan.rows-1&&plan.cm[i+COLS]===victim.id)
       ||(c>0&&plan.cm[i-1]===victim.id)||(c<plan.cols-1&&plan.cm[i+1]===victim.id); };
let donor=null;                                          // victim'e komşu OLMAYAN bir oda
for(const g of u.rooms){ if(g===victim||!g.cells.length) continue;
  if(g.cells.length>8 && !g.cells.some(adjV)){ donor=g; break; } }
T('strand kurulumu: uzak donör oda bulundu', !!donor);
if(donor){
  const strip=donor.cells.slice(0,4);                    // gövdeden kopuk 4 hücre
  const rm=new Set(strip);
  strip.forEach(i=>{ plan.cm[i]=victim.id; victim.cells.push(i); });
  donor.cells=donor.cells.filter(i=>!rm.has(i));
}

T('strand: bölge artık KOPUK (bug yeniden üretildi)', !regConnected(victim));
T('strand: oda ekle BLOKLU (regConnected guard)', addRoom(victim,{name:'BANYO',type:'banyo',h:3,w:4},victim.cells[0])===false);

/* ===== ONAR ===== */
const healed=healDisconnected();
T('heal: değişiklik yaptı', healed===true);
T('heal: kopuk bölge kalmadı', !anyDisc());
T('heal: bölge tek parça', regConnected(victim));
T('heal: bütünlük korundu', integrity());

/* artık düzenleme açık: bölgeden oda oyulabiliyor (D3'te kullanıcının yapamadığı şey) */
const before=u.rooms.length;
const okAdd=addRoom(victim,{name:'BANYO',type:'banyo',h:3,w:4},victim.cells[0]);
T('heal sonrası: oda ekle ÇALIŞIYOR', okAdd===true && u.rooms.length===before+1);
T('heal sonrası: bütünlük', integrity());
`);

console.log(fail? '✗ '+fail+' hata, '+pass+' başarılı' : '✓ kopuk-bölge onarım testleri geçti ('+pass+')');
process.exit(fail?1:0);
