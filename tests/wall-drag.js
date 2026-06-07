/* Oda duvarı sürükleme testi: hücre bütünlüğü, bağlantılılık, koruma kuralları, canlı denetim */
function run(label, bina, kat, poly, specs){
  for(const k of Object.keys(require.cache)) delete require.cache[k];
  function stubEl(tag){ return {
    tag, attrs:{}, children:[], style:{}, dataset:{}, _ih:'',
    set innerHTML(v){ this._ih=v; this.children=[]; }, get innerHTML(){ return this._ih; },
    appendChild(c){ this.children.push(c); return c; },
    addEventListener(){}, querySelectorAll(){ return []; },
    classList:{toggle(){},add(){},remove(){}},
    setAttribute(k,v){ this.attrs[k]=v; }, getAttribute(k){ return this.attrs[k]; },
    getBoundingClientRect(){ return {width:1200,height:800,left:0,top:0}; },
    textContent:'', value:'', disabled:false, onclick:null, click(){}
  };}
  const byId = {};
  const getEl = id => byId[id] || (byId[id]=stubEl('div'));
  getEl('binaTipi').value=bina; getEl('katSayisi').value=String(kat); getEl('katYuk').value='2.9';
  global.document={getElementById:getEl, createElement:t=>stubEl(t), createElementNS:(n,t)=>stubEl(t)};
  global.window={addEventListener(){}};
  global.XMLSerializer=function(){this.serializeToString=()=>'';};
  global.Image=function(){}; global.Blob=function(){}; global.URL={createObjectURL:()=>''};
  const src=require('fs').readFileSync(process.env.APP_JS||'/tmp/app.js','utf-8');
  eval(src + `
  ;unitSpecs=${JSON.stringify(specs)};
  pts=${JSON.stringify(poly)}; closed=true;
  generate();
  console.log('--- ${label} ---');
  let fails=0;
  const F=(m)=>{ fails++; console.log('  [FAIL]', m); };

  const insCount=(()=>{ let n=0; plan.inside.forEach(v=>n+=v); return n; })();
  const integrity=(when)=>{
    let tot=0; const seen=new Set();
    plan.regions.forEach(g=>{ tot+=g.cells.length;
      g.cells.forEach(i=>{ if(seen.has(i)) F(when+': hücre iki bölgede '+i); seen.add(i);
        if(plan.cm[i]!==g.id) F(when+': cm tutarsız '+g.name); }); });
    if(tot!==insCount) F(when+': hücre kaybı '+tot+'/'+insCount);
  };
  integrity('başlangıç');

  const runs=plan.wallRuns;
  if(!runs.length) F('hiç sürüklenebilir duvar yok');
  // her duvar yalnız aynı dairenin odaları arasında ve merdiven içermez
  const unitOf=new Map(); plan.unitObjs.forEach((u,k)=>u.rooms.forEach(g=>unitOf.set(g.id,k)));
  runs.forEach(rn=>{
    if(unitOf.get(rn.a)===undefined||unitOf.get(rn.a)!==unitOf.get(rn.b)) F('duvar daire dışına taşıyor');
    if(plan.regions[rn.a].type==='merdiven'||plan.regions[rn.b].type==='merdiven') F('merdiven duvarı sürüklenebilir olmamalı');
  });

  // her duvarı 2 adım it, 2 adım geri çek; bütünlük + bağlantılılık korunmalı
  let moves=0, refusals=0;
  runs.slice(0, 40).forEach(rn=>{
    const a=plan.regions[rn.a], b=plan.regions[rn.b];
    for(const dir of [1,1,-1,-1]){
      if(moveWallStep(rn,dir)) moves++; else refusals++;
      if(!regConnected(a)) F(a.name+' koptu');
      if(!regConnected(b)) F(b.name+' koptu');
      if(!a.cells.length||!b.cells.length) F('oda yok oldu');
    }
  });
  integrity('itme-çekme sonrası');

  // koruma: duvarı sonuna kadar it — donör asla <4 hücreye düşmemeli, kopmamalı
  if(runs.length){
    const rn=runs[0], donor=plan.regions[rn.b];
    let g2=0; while(moveWallStep(rn,1) && g2++<200);
    if(donor.cells.length && donor.cells.length<4) F('donör 1 m² altına düştü: '+donor.cells.length);
    if(!regConnected(donor)) F('donör sona itmede koptu');
    integrity('sona itme sonrası');
  }

  // GERİ AL: drag → finishDrag → undoEdit tam eski duruma döndürmeli
  if(plan.wallRuns.length){
    const rn=plan.wallRuns[Math.floor(plan.wallRuns.length/3)];
    const srt=x=>x.slice().sort((p,q)=>p-q);
    const before={a:srt(plan.regions[rn.a].cells), b:srt(plan.regions[rn.b].cells)};
    dragging={type:'wall', run:rn,
      undo:{a:rn.a, b:rn.b, cellsA:plan.regions[rn.a].cells.slice(), cellsB:plan.regions[rn.b].cells.slice()}};
    let st=0, dir=1;
    while(st<3 && moveWallStep(rn,dir)) st++;
    if(!st){ dir=-1; while(st<3 && moveWallStep(rn,dir)) st++; }
    const h0=editHistory.length;
    finishDrag();
    if(st>0){
      if(editHistory.length!==h0+1) F('drag geçmişe yazılmadı');
      if(!undoEdit()) F('undoEdit false döndü');
      const eq=(x,y)=>x.length===y.length&&x.every((v,i)=>v===y[i]);
      if(!eq(srt(plan.regions[rn.a].cells), before.a)) F('undo: A hücreleri geri gelmedi');
      if(!eq(srt(plan.regions[rn.b].cells), before.b)) F('undo: B hücreleri geri gelmedi');
      integrity('undo sonrası');
    }
    if(editHistory.length!==h0) F('geçmiş sayacı tutarsız');
    // hareketsiz drag geçmişe yazılMAmalı
    dragging={type:'wall', run:rn,
      undo:{a:rn.a, b:rn.b, cellsA:plan.regions[rn.a].cells.slice(), cellsB:plan.regions[rn.b].cells.slice()}};
    finishDrag();
    if(editHistory.length!==h0) F('boş drag geçmişe yazıldı');
  }
  // GERİ AL (ayırıcı): cut girdisi customCutsZ'yi ve planı eski haline döndürmeli
  if(customCutsZ){
    const zi=customCutsZ.findIndex(a=>a&&a.length);
    if(zi>=0){
      const prev=customCutsZ.map(a=>a?a.slice():null);
      customCutsZ[zi][0]+=0.5; generate(true);
      editHistory.push({type:'cut', cuts:prev});
      undoEdit();
      if(customCutsZ[zi][0]!==prev[zi][0]) F('cut undo başarısız');
      integrity('cut undo sonrası');
    }
  }

  // canlı denetim: dragWallTo runChecks/buildUnitTable/render zincirini hatasız çalıştırmalı
  if(plan.wallRuns.length){
    const rn=plan.wallRuns[Math.floor(plan.wallRuns.length/2)];
    dragging={type:'wall', run:rn};
    const tx = rn.horiz? plan.minX+(rn.lo+1)*M : plan.minX+(rn.pos+2)*M;
    const ty = rn.horiz? plan.minY+(rn.pos+2)*M : plan.minY+(rn.lo+1)*M;
    try{ dragWallTo(W2Sx(tx), W2Sy(ty)); }catch(err){ F('dragWallTo hata: '+err.message); }
    dragging=null;
    integrity('dragWallTo sonrası');
    // metrikler güncellendi mi?
    const g=plan.regions[rn.a];
    const expect=g.cells.length*M*M;
    if(Math.abs(g.area-expect)>1e-9) F('alan metriği güncellenmedi');
  }

  console.log('  duvar:', runs.length, 'hamle:', moves, 'ret:', refusals, fails? '': '✓ TÜM DENETİMLER GEÇTİ');
  `);
}
const rect=[{x:0,y:0},{x:32,y:0},{x:32,y:16},{x:0,y:16}];
const Lshape=[{x:0,y:0},{x:30,y:0},{x:30,y:10},{x:16,y:10},{x:16,y:16},{x:0,y:16}];
const small=[{x:0,y:0},{x:12,y:0},{x:12,y:10},{x:0,y:10}];
run('Apartman 12 kat', 'apartman', 12, rect, [{oda:2,salon:1,ensuite:true,acik:false,adet:2},{oda:1,salon:1,ensuite:false,acik:true,adet:2}]);
run('6 daire/kat', 'apartman', 5, rect, [{oda:2,salon:1,ensuite:false,acik:false,adet:4},{oda:1,salon:1,ensuite:false,acik:true,adet:2}]);
run('L-şekilli 8 kat', 'apartman', 8, Lshape, [{oda:3,salon:1,ensuite:true,acik:false,adet:2},{oda:1,salon:1,ensuite:false,acik:true,adet:2}]);
run('Villa 2 kat 4+1', 'villa', 2, small, [{oda:4,salon:1,ensuite:true,acik:false,adet:1}]);
run('Stüdyolar', 'apartman', 4, rect, [{oda:1,salon:0,ensuite:false,acik:true,adet:6}]);
