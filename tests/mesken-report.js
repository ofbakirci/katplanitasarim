const fs = require('fs');
const path = require('path');

const report = path.join(__dirname, '..', 'mesken', 'urun-tanimi-teknik-yapi-dogrulama-raporu.html');
const html = fs.readFileSync(report, 'utf8');
let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) pass++;
  else { fail++; console.error('  [FAIL]', message); }
}

ok(/<html lang="tr">/.test(html), 'Türkçe belge dili tanımlı');
ok(/name="viewport"/.test(html), 'mobil viewport tanımlı');
ok(/Ürün Tanımı/.test(html) && /Teknik Yapı/.test(html) && /Doğrulama/.test(html) && /Sonuç/.test(html), 'zorunlu rapor bölümleri var');
ok(/href="\/"/.test(html) && /Ana uygulamaya dön/.test(html), 'ana uygulamaya dönüş bağlantısı var');
ok(/Çalışıyor/.test(html) && /Henüz tamamlanmadı/.test(html) && /Ön-gösterim/.test(html), 'uygulanmış ve planlanan özellikler ayrılmış');
ok(/80 \/ 80 test dosyası/.test(html) && /92 \/ 92 test dosyası/.test(html), 'güncel doğrulama sayıları raporda');
ok(!/<(?:script|link)[^>]+(?:src|href)="https?:/i.test(html), 'rapor dış CSS/JS kaynağına bağlı değil');
ok(!/RABBIT|BUNNY|TABAK|KPTA/.test(html), 'başka ürün adı veya kimliği rapora taşınmamış');
ok(!/REPLICATE_API_TOKEN|NANO_VERSION|localhost:|:\/\/78\./.test(html), 'gizli veya gereksiz altyapı ayrıntısı yok');
ok(!/href="[^"#]*demo/i.test(html), 'raporda demo içine yerleştirilen ikinci bağlantı yok');

console.log(fail ? `  ${fail} BAŞARISIZ, ${pass} geçti` : `  ✓ Mesken rapor sözleşmesi geçti (${pass})`);
if (fail) process.exit(1);
