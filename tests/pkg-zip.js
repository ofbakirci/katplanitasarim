/* MESKEN prototip — STORE (sıkıştırmasız) ZIP yazıcı birim testi.
   Template'ten (prototip.template.html) pkgCrc32 / pkgDataURLToBytes / pkgZipStore
   fonksiyonları SÖKÜLÜP eval edilir → gerçek uygulama test edilir (yeniden yazım değil).
   Bilinen 2 küçük buffer'la ZIP üretilir, Python zipfile ile açılıp:
     - testzip() None (tüm CRC-32 geçerli)
     - dosya adları birebir
     - içerik baytları birebir
   doğrulanır. Harici JS kütüphanesi YOK — kendi yazdığımız yazıcı Python'un standart
   zipfile'ı tarafından sorunsuz açılabiliyor mu, asıl kabul budur. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

let pass=0, fail=0;
const ok=(c,msg)=>{ if(c){pass++;} else {fail++; console.log('  [FAIL]', msg);} };
const done=()=>{ console.log(fail? ('✗ '+fail+' pkg-zip testi düştü ('+pass+' geçti)') : ('✓ tüm pkg-zip testleri geçti ('+pass+')')); process.exit(fail?1:0); };

const src = fs.readFileSync(path.join(__dirname, '..', 'mesken', '02_PROTOTIP', 'prototip.template.html'), 'utf8');

function grab(re, label){ const m = src.match(re); ok(!!m, label+' template içinde bulundu'); return m?m[0]:null; }
const crcSrc   = grab(/function pkgCrc32\(bytes\)\{[\s\S]*?return \(crc\^0xFFFFFFFF\)>>>0;\s*\}/, 'pkgCrc32');
const bytesSrc = grab(/function pkgDataURLToBytes\(d\)\{[\s\S]*?return u;\s*\}/, 'pkgDataURLToBytes');
const zipSrc   = grab(/function pkgZipStore\(entries\)\{[\s\S]*?return new Blob\(all, \{type:'application\/zip'\}\);\s*\}/, 'pkgZipStore');
if(!crcSrc || !bytesSrc || !zipSrc) done();

// window.TextEncoder / Blob / atob motor tarafında global; node'da new Function ile enjekte edilir.
const factory = new Function('window','Blob','atob','TextEncoder',
  crcSrc + '\n' + bytesSrc + '\n' + zipSrc +
  '\nreturn { pkgCrc32:pkgCrc32, pkgDataURLToBytes:pkgDataURLToBytes, pkgZipStore:pkgZipStore };');
const api = factory({ TextEncoder }, Blob, (typeof atob==='function'?atob:null), TextEncoder);

(async function(){
  const enc = new TextEncoder();
  const b1 = enc.encode('Merhaba, KPTA render paketi! 0123456789');           // düz metin buffer
  const b2 = new Uint8Array([0xFF,0xD8,0xFF,0xE0,0x00,0x10,0x4A,0x46,0x49,0x46,0x00]); // JPEG magic (FFD8) benzeri
  ok(b2[0]===0xFF && b2[1]===0xD8, 'ikinci buffer JPEG magic (FFD8) ile başlıyor');

  // pkgDataURLToBytes: dataURL → bayt yuvarlak-gidiş (kaynak-2: dataURL/blob → dataURL → bytes yolu)
  const dataURL = 'data:image/jpeg;base64,' + Buffer.from(b2).toString('base64');
  const back = api.pkgDataURLToBytes(dataURL);
  ok(Buffer.from(back).toString('hex')===Buffer.from(b2).toString('hex'), 'pkgDataURLToBytes dataURL→bytes birebir');

  // pkgCrc32: bilinen vektör — CRC-32("123456789") = 0xCBF43926 (IEEE)
  const crcKnown = api.pkgCrc32(new TextEncoder().encode('123456789'));
  ok(crcKnown===0xCBF43926, 'pkgCrc32 bilinen vektör 0xCBF43926: 0x'+crcKnown.toString(16));

  const entries = [ { name:'metin.txt', bytes:b1 }, { name:'resim.jpg', bytes:b2 } ];
  const blob = api.pkgZipStore(entries);
  ok(blob && typeof blob.arrayBuffer==='function', 'pkgZipStore Blob döndürdü');
  const zipBuf = Buffer.from(await blob.arrayBuffer());
  ok(zipBuf.length>0, 'ZIP baytları > 0');
  ok(zipBuf[0]===0x50 && zipBuf[1]===0x4B, 'ZIP PK imzasıyla başlıyor');

  const tmpZip = path.join(os.tmpdir(), 'kpta-zip-test-'+process.pid+'.zip');
  fs.writeFileSync(tmpZip, zipBuf);

  const py = 'import zipfile,json,sys\n' +
    'z=zipfile.ZipFile(sys.argv[1])\n' +
    'bad=z.testzip()\n' +
    'out={"testzip":bad,"names":z.namelist(),"contents":{n:z.read(n).hex() for n in z.namelist()}}\n' +
    'print(json.dumps(out))\n';
  let r = spawnSync('python3', ['-c', py, tmpZip], { encoding:'utf8' });
  if(r.status!==0 || !r.stdout){ r = spawnSync('python', ['-c', py, tmpZip], { encoding:'utf8' }); }
  ok(r.status===0 && !!r.stdout, 'Python zipfile ZIP\'i açtı (status '+r.status+')'+(r.stderr?(' err:'+r.stderr.trim()):''));
  try{ fs.unlinkSync(tmpZip); }catch(e){}
  if(r.status!==0 || !r.stdout) done();

  const res = JSON.parse(r.stdout);
  ok(res.testzip===null, 'Python testzip() None → tüm CRC-32 geçerli');
  ok(JSON.stringify(res.names)===JSON.stringify(['metin.txt','resim.jpg']), 'dosya adları birebir sırayla: '+JSON.stringify(res.names));
  ok(res.contents['metin.txt']===Buffer.from(b1).toString('hex'), 'metin.txt içeriği birebir');
  ok(res.contents['resim.jpg']===Buffer.from(b2).toString('hex'), 'resim.jpg içeriği birebir (JPEG baytları)');

  // Boş girdi → geçerli boş ZIP (sadece EOCD, 22 bayt)
  const empty = Buffer.from(await api.pkgZipStore([]).arrayBuffer());
  ok(empty.length===22, 'boş ZIP = 22 baytlık EOCD: '+empty.length);

  done();
})().catch(function(e){ console.log('  [FAIL] beklenmeyen hata:', e && e.stack || e); fail++; done(); });
