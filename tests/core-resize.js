/* ÇEKİRDEK YENİDEN BOYUTLANDIRMA testi — node tests/core-resize.js
   Vaka (kat-plani-45 / yangın merdiveni): kullanıcı yapı modunda çekirdeği (merdiven /
   asansör / yangın) sağdan 1 sütun daraltıp bırakınca ÇEKİRDEK GERİ BÜYÜYORDU. Kök neden:
   daralınca yan dairede açığa çıkan kopuk şerit fixOrphans tarafından "baskın komşu"ya
   atılırken alıcı olarak ÇEKİRDEK seçilebiliyordu → daralttığın sütun aynen geri yapışır.
   Fix (planner.js fixOrphans): alıcı isStructReg ise atlanır (assignCellsToNeighbor ve
   healDisconnected zaten böyle). Fixture, kullanıcının elle daralttığı durumu taşır:
   lockedCore.yangın = 5 sütun (2,5 m) AMA kayıtlı bölge = 6 sütun (generate'in büyüttüğü).
   Doğru motor generate()'te bölgeyi kilitli 5 sütuna indirmeli (büyütmemeli). */
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
getEl('binaTipi').value='apartman'; getEl('katSayisi').value='8'; getEl('katYuk').value='2.9';
global.document={getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t)};
global.window={addEventListener(){}};
global.matchMedia=()=>({matches:false});
global.XMLSerializer=function(){this.serializeToString=()=>'';};
global.Image=function(){}; global.Blob=function(){}; global.URL={createObjectURL:()=>''};
global.requestAnimationFrame=fn=>fn&&fn();

const fs=require('fs'), path=require('path');
const {extractAppScript}=require('./support/app-js');
const src=extractAppScript();
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'support','core-resize-fixture.json'),'utf8'));

let pass=0, fail=0;
const T=(name,cond)=>{ if(cond){pass++;} else {fail++; console.log('  [FAIL]', name);} };

eval(src + `
;restoreState(fixture);
const COLS=plan.cols, MM=0.5;
function box(type){ const g=plan.regions.find(x=>x.type===type&&x.cells.length); if(!g) return null;
  let r0=1e9,r1=-1e9,c0=1e9,c1=-1e9;
  g.cells.forEach(i=>{const r=(i/COLS)|0,c=i%COLS; r0=Math.min(r0,r);r1=Math.max(r1,r);c0=Math.min(c0,c);c1=Math.max(c1,c);});
  return {id:g.id,r0,r1,c0,c1,w:c1-c0+1,h:r1-r0+1,cells:g.cells.length}; }
function lockW(type){ const e=lockedCore.find(x=>x.type===type); return e? Math.round((e.x1-e.x0)/MM) : null; }
function lockH(type){ const e=lockedCore.find(x=>x.type===type); return e? Math.round((e.y1-e.y0)/MM) : null; }
function disconnectedDwellings(){ let n=0;
  plan.regions.forEach(g=>{ if(!g.cells.length||['merdiven','yangin','asansor','teknik','koridor','isiklik'].includes(g.type))return;
    const set=new Set(g.cells),seen=new Set(); let comps=0;
    g.cells.forEach(s=>{ if(seen.has(s))return; comps++; const st=[s]; seen.add(s);
      while(st.length){const i=st.pop();const r=(i/COLS)|0,c=i%COLS;[[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc])=>{
        if(rr<0||cc<0||rr>=plan.rows||cc>=COLS)return; const j=rr*COLS+cc; if(set.has(j)&&!seen.has(j)){seen.add(j);st.push(j);}});}});
    if(comps>1) n++; });
  return n; }

T('fixture yüklendi: yangın merdiveni + kilitli iskelet var', !!box('yangin') && !!lockedCore);

/* --- ASIL REGRESYON: generate() kilitli çekirdeği BÜYÜTMEMELİ ---
   fixture.lockedCore.yangin = 5 sütun; buggy motor fixOrphans ile 6 sütuna büyütür. */
generate();
['merdiven','asansor','yangin'].forEach(type=>{
  const b=box(type), lw=lockW(type), lh=lockH(type);
  T(type+': generate çekirdeği kilitli ENe sadık (büyütmüyor) — '+(b?b.w:'?')+'≟'+lw, !!b && b.w===lw);
  T(type+': generate çekirdeği kilitli BOYa sadık — '+(b?b.h:'?')+'≟'+lh, !!b && b.h===lh);
});
T('üretim sonrası kopuk daire bölgesi yok', disconnectedDwellings()===0);

/* --- UI AKIŞI: yapı modunda daha da daralt → bırak → daralma korunmalı --- */
['yangin','asansor','merdiven'].forEach(type=>{
  const b0=box(type); if(!b0||b0.w<3){ return; }   // ≥3 sütun yoksa daraltma testini atla
  applyStructRect(plan.regions[b0.id], b0.r0, b0.c0, b0.r1, b0.c1-1); // dragStructTo: doğu kenarı içeri
  const bDrag=box(type);
  T(type+': drag sırasında 1 sütun daraldı', bDrag.w===b0.w-1);
  captureLockedCore(); generate();                  // finishDrag (apartman): kilitle + yeniden diz
  const bRel=box(type);
  T(type+': bırakınca DARALMA KORUNDU (geri büyümedi)', bRel && bRel.w===bDrag.w && bRel.h===bDrag.h);
});
T('daraltma sonrası hâlâ kopuk daire bölgesi yok', disconnectedDwellings()===0);
`);

console.log(fail? '✗ '+fail+' hata, '+pass+' başarılı' : '✓ çekirdek yeniden-boyutlandırma testleri geçti ('+pass+')');
process.exit(fail?1:0);
