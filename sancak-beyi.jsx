import React, { useState, useRef } from "react";

// ════════════════════════════════════════════════════════════
//  SANCAK — Bir Hanedan Hikâyesi  (Reigns tarzı kart oyunu)
//  Kartı sola/sağa sürükle. Dört gücü dengede tut. Hanedanını yaşat.
// ════════════════════════════════════════════════════════════

const CH = {
  vezir:    { n: "Vezir Kara Davut", e: "🦉" },
  vezir2:   { n: "Vezir Pir Mehmed", e: "🦅" },
  kadi:     { n: "Kadı Şemseddin", e: "📿" },
  subasi:   { n: "Subaşı Demir Ağa", e: "🛡️" },
  hazinedar:{ n: "Hazinedar Yorgo Efendi", e: "🪙" },
  hatun:    { n: "Gülbahar Hatun", e: "🌹" },
  sehzade:  { n: "Şehzade Orhan", e: "🧒" },
  dervis:   { n: "Derviş Hû Baba", e: "🌀" },
  casus:    { n: "Casus Karga", e: "🐦‍⬛" },
  tuccar:   { n: "Tüccar Hacı Bedreddin", e: "🐪" },
  eskiya:   { n: "Eşkıya Çakır", e: "🗡️" },
  elci:     { n: "İmparatorluk Elçisi", e: "📜" },
  koylu:    { n: "Köylü Veli", e: "🌾" },
  ebe:      { n: "Ebe Nene", e: "🌿" },
  ozan:     { n: "Âşık Garip", e: "🪕" },
  mimar:    { n: "Mimar Üstad İlyas", e: "📐" },
  akkoyun:  { n: "Akkoyun Elçisi", e: "🐏" },
  hekim:    { n: "Hekim Lokman", e: "🩺" },
  halk:     { n: "Halk", e: "👥" },
};

const STATS = [
  { k: "h", e: "👥", n: "Halk" },
  { k: "o", e: "⚔️", n: "Ordu" },
  { k: "u", e: "🕌", n: "Ulema" },
  { k: "p", e: "💰", n: "Hazine" },
];

const DEATHS = {
  h0:   { t: "Halk İsyanı",       e: "🔥", d: "Aç kalan halk sarayın kapılarını kırdı. Seni meydanda yargıladılar; duruşma kısa sürdü." },
  h100: { t: "Sevgiden Ölüm",     e: "💞", d: "Halk seni o kadar çok sevdi ki omuzlarında taşımak istedi. Kalabalığın coşkusunda ezildin." },
  o0:   { t: "İstila",            e: "🏴", d: "Ordusuz kalan sancağa komşu beylik bir gecede girdi. Surlarda nöbet tutan kimse yoktu." },
  o100: { t: "Askeri Darbe",      e: "⚔️", d: "Ordu güçlendi, güçlendi... ve bir sabah uyandığında Subaşı senin tahtında oturuyordu." },
  u0:   { t: "Tekfir Fetvası",    e: "📜", d: "Ulema seni din düşmanı ilan etti. Fetva minberden okundu; kalabalık çoktan taş toplamıştı." },
  u100: { t: "Şeyhlerin Devleti", e: "🕯️", d: "Tarikatlar öyle güçlendi ki beye gerek kalmadı. Seni 'kutlu kurban' seçtiklerinde itiraz eden olmadı." },
  p0:   { t: "İflas",             e: "🕳️", d: "Hazine boşaldı, paralı askerler maaş alamadı. Alacaklılar zindana, sen mezara gittin." },
  p100: { t: "Altın Laneti",      e: "👑", d: "Servetin imparatorluğun kulağına gitti. Sancağına el konuldu; kellen vergiden sayıldı." },
  suikast:{ t: "Suikast",         e: "🍷", d: "Şerbetin tadı bir tuhaftı. Son gördüğün şey, vezirin gülümsemesiydi." },
  savas:{ t: "Savaş Meydanı",     e: "🐎", d: "Akkoyun ordusu üstün geldi. Sancağın toza düştü, sen de yanına." },
  veba: { t: "Kara Veba",         e: "🦠", d: "Salgın saray kapısından da girdi. Hekimin sirkesi de duası da yetmedi." },
  ecel: { t: "Ecel",              e: "🌙", d: "Yatağında, eceliyle öldün. Bu topraklarda az beye nasip olur." },
  define:{ t: "Definenin Laneti", e: "🏺", d: "Lanetli altına dokunan eller kurur derler. Doğruymuş." },
  kurt: { t: "Av Kazası",         e: "🐺", d: "Av sırasında atın ürküp seni uçuruma savurdu. Kurtlar beklemiyordu bile." },
};

const HEIRS = ["Orhan", "Murad", "Bayezid", "Mehmed", "Selim", "Süleyman", "Alparslan", "Kılıçarslan"];
const FAMILY_FLAGS = ["kiz_arandi", "evli", "cocuk", "sehzade", "egitim", "varis"];

// Kart şeması: { id, c:karakter, t:metin, l/r:{t:seçenek, fx:{h,o,u,p}, set:[], clear:[], next:id, die:ölümKodu, risk:{p,die}}, req:[], not:[], once, w }
const GENEL = [
  { id: "g1", c: "vezir", t: "Beyim, ambarlar doldu ama kervan yolu eşkıya kaynıyor. Tüccarlar koruma istiyor.",
    l: { t: "Asker gönder", fx: { o: -5, p: 10, h: 5 } },
    r: { t: "Başlarının çaresine baksınlar", fx: { p: -5, h: -5 } } },
  { id: "g2", c: "kadi", t: "İki köylü bir tarla için mahkemelik. Biri senin amcanın oğlu, beyim.",
    l: { t: "Adalet kime çıkarsa", fx: { u: 10, h: 5 } },
    r: { t: "Akraba kayırılır", fx: { u: -10, h: -5, p: 5 } } },
  { id: "g3", c: "hazinedar", t: "Vergileri biraz artırsak beyim? Hazine nefes alır, kimse fark etmez bile.",
    l: { t: "Artır", fx: { p: 15, h: -10 } },
    r: { t: "Halk zaten zor durumda", fx: { h: 5, p: -5 } } },
  { id: "g4", c: "subasi", t: "Askerlerin zırhları babalarından kalma. Yenisi pahalı ama gerekli.",
    l: { t: "Yenile", fx: { p: -15, o: 10 } },
    r: { t: "İdare etsinler", fx: { o: -10 } } },
  { id: "g5", c: "koylu", t: "Değirmen yıkıldı beyim. Un yok, un yoksa ekmek yok, ekmek yoksa...",
    l: { t: "Yeniden yapılsın", fx: { p: -10, h: 10 } },
    r: { t: "Komşu köye gitsinler", fx: { h: -10 } } },
  { id: "g6", c: "tuccar", t: "İpek Yolu'ndan kervanım geçecek. Vergi muafiyeti ver, karşılığında... hediyeler olur.",
    l: { t: "Anlaştık", fx: { p: 10, u: -5 } },
    r: { t: "Herkes vergisini öder", fx: { u: 5, h: 5, p: -5 } } },
  { id: "g7", c: "kadi", t: "Medreseye yeni müderris lazım. Genç bir âlim mi, yaşlı bir şeyh mi?",
    l: { t: "Genç âlim", fx: { u: 5, h: 5 } },
    r: { t: "Yaşlı şeyh", fx: { u: 10, h: -5 } } },
  { id: "g8", c: "ozan", t: "Sazımla sarayına şenlik getiririm beyim. Bir kese akçe yeter.",
    l: { t: "Çal bakalım", fx: { h: 10, p: -5 } },
    r: { t: "Git pazarda çal", fx: { h: -5 } } },
  { id: "g9", c: "hatun", req: ["evli"], t: "Saraya bir hamam yaptıralım beyim. Misafir beyler görsün, dillere destan olsun.",
    l: { t: "Yaptır", fx: { p: -15, h: 5 } },
    r: { t: "Bu lüks bize fazla", fx: { u: 5, h: -5 } } },
  { id: "g10", c: "casus", t: "Germiyan beyinin sarayında bir kulağım var. Aylık bir keseyle haber taşırım.",
    l: { t: "Öde", fx: { p: -10, o: 5 } },
    r: { t: "Gerek yok", fx: { o: -5 } } },
  { id: "g11", c: "elci", t: "Yüce İmparatorluk donanması için kereste istiyor. Bedelsiz, elbette.",
    l: { t: "Ver gitsin", fx: { p: -10, h: -5 } },
    r: { t: "Ormanlar bizimdir", fx: { h: 5, o: -5 } } },
  { id: "g12", c: "hekim", t: "Saray mutfağında fareler cirit atıyor beyim. Hastalık kapıda demektir.",
    l: { t: "Baştan aşağı temizlik", fx: { p: -10, h: 5 } },
    r: { t: "Kedi alın", fx: { h: 5, p: -1 } } },
  { id: "g13", c: "dervis", t: "Tekkeye bir arazi bağışla beyim; duamız gece gündüz seninle olsun.",
    l: { t: "Bağışla", fx: { u: 15, p: -10, h: -5 } },
    r: { t: "Toprak halkındır", fx: { h: 10, u: -10 } } },
  { id: "g14", c: "subasi", t: "Sınır karakolundan haber: çapulcular bir köyü bastı, sürüleri götürdü.",
    l: { t: "Akın düzenle, hesap sor", fx: { o: 10, u: -5, p: 5 } },
    r: { t: "Savunmada kalın", fx: { h: -5, o: -5 } } },
  { id: "g15", c: "koylu", t: "Pazar yerinde tartılar hileli beyim. Esnaf bizi düpedüz soyuyor.",
    l: { t: "Kadı denetlesin", fx: { u: 5, h: 10, p: -5 } },
    r: { t: "Pazarlık böyledir", fx: { h: -10, p: 5 } } },
  { id: "g16", c: "hazinedar", t: "Para bastıralım beyim. İçine birazcık bakır karıştırırız... kimse anlamaz.",
    l: { t: "Bastır", fx: { p: 15, h: -5 }, set: ["kalp_para"] },
    r: { t: "Bu düpedüz sahtekârlık", fx: { u: 5 } } },
  { id: "g17", c: "tuccar", req: ["kalp_para"], once: true, t: "Bu akçeler bakır kokuyor beyim! Çarşıda kimse senin paranı almıyor artık.",
    l: { t: "Hazinedarı suçla", fx: { p: -10, h: 5 }, clear: ["kalp_para"] },
    r: { t: "Alan alır, almayan gider", fx: { h: -10, p: -5 }, clear: ["kalp_para"] } },
  { id: "g18", c: "ozan", t: "Senin için bir kahramanlık destanı yazdım beyim. Biraz... abartılı oldu.",
    l: { t: "Her meydanda okunsun", fx: { h: 10, u: -5 } },
    r: { t: "Gerçek bize yeter", fx: { u: 5 } } },
  { id: "g19", c: "kadi", t: "Çarşıda yakalanan hırsız için halk ceza bekliyor. Hükmü sen ver beyim.",
    l: { t: "Şeriat ne diyorsa o", fx: { u: 10, h: -10 } },
    r: { t: "Zindan yeter", fx: { h: 5, u: -5 } } },
  { id: "g20", c: "vezir", t: "Divan toplantıları uzadıkça uzuyor. Küçük işleri bana bırak, mührünü ver beyim.",
    l: { t: "Yetki senin", fx: { p: 5, h: 5, o: -3 } },
    r: { t: "Mühür bende kalır", fx: { p: -5 } } },
  { id: "g21", c: "akkoyun", t: "Uzun Hasan dostluk nişanesi olarak soylu bir at sürüsü yolladı.",
    l: { t: "Kabul et", fx: { o: 5, p: 5 } },
    r: { t: "Truva atı olmasın, geri yolla", fx: { o: -5, u: 5 } } },
  { id: "g22", c: "koylu", t: "Köprü çöktü beyim. Irmaktan geçmeye çalışan üç canımız boğuldu.",
    l: { t: "Taş köprü yapılsın", fx: { p: -15, h: 10 } },
    r: { t: "Salla geçsinler", fx: { h: -10 } } },
  { id: "g23", c: "hekim", t: "Cüzzamlılar surların dışında perişan. Bir darüşşifa kurulsa, beyim...",
    l: { t: "Kurulsun", fx: { p: -15, u: 10, h: 5 } },
    r: { t: "Hazine buna yetmez", fx: { u: -5, h: -5 } } },
  { id: "g24", c: "hatun", req: ["evli"], t: "Annem bizimle yaşamaya geliyor beyim. Sevindin, değil mi?",
    l: { t: "Başımızın tacı", fx: { p: -5, h: 5 } },
    r: { t: "Misafirlik üç gündür", fx: { u: -3, p: 3 } } },
  { id: "g25", c: "casus", t: "Hamamda kulak misafiri oldum: Subaşı maaşından yana dertli. Yüksek sesle hem de.",
    l: { t: "Maaşını artır", fx: { p: -10, o: 10 } },
    r: { t: "Şikâyet eden gider", fx: { o: -10 } } },
  { id: "g26", c: "tuccar", t: "Baharat ticaretinde tekel kurabiliriz beyim. Ortak olur musun?",
    l: { t: "Ortağım", fx: { p: 15, h: -5, u: -5 } },
    r: { t: "Tekel zulümdür", fx: { h: 5 } } },
  { id: "g27", c: "kadi", t: "Cuma hutbesinde adının yanında imparatorun adı da okunsun mu beyim?",
    l: { t: "Okunsun, güvendeyiz", fx: { u: 5, h: -5 } },
    r: { t: "Bu sancakta tek ad okunur", fx: { h: 10, u: -5, o: -3 } } },
  { id: "g28", c: "koylu", t: "Kuyumuza kurt leşi düştü beyim. Su içilmez oldu, hayvanlar hasta.",
    l: { t: "Yeni kuyu kazılsın", fx: { p: -10, h: 10 } },
    r: { t: "Kaynatıp için", fx: { h: -5 } } },
  { id: "g29", c: "subasi", t: "Orduya taze kan lazım. Devşirme mi yapalım, gönüllü mü toplayalım?",
    l: { t: "Devşirme", fx: { o: 15, h: -10, u: -5 } },
    r: { t: "Gönüllü", fx: { o: 5, h: 5 } } },
  { id: "g30", c: "dervis", t: "Bir rüya gördüm beyim: hazinen kanatlanmış, gökyüzünde uçuyordu.",
    l: { t: "Tedbir alalım", fx: { p: 5, h: -5 } },
    r: { t: "Rüya işte", fx: {} } },
  { id: "g31", c: "ozan", t: "Komşu beyliğin ozanı atışmaya çağırıyor beni. Sancağın şerefi söz konusu!",
    l: { t: "Atış bakalım", fx: { h: 10, p: -5 } },
    r: { t: "Saz değil kılıç konuşur", fx: { h: -5, o: 5 } } },
  { id: "g32", c: "hazinedar", t: "Sarraflara borç verip faiz alabiliriz beyim. Kazançlı iştir ama... ulema duymasın.",
    l: { t: "Ver borcu", fx: { p: 15, u: -10 } },
    r: { t: "Faiz haramdır", fx: { u: 10, p: -5 } } },
  { id: "g33", c: "elci", t: "İmparatorun doğum günü yaklaşıyor. Bir hediye... beklenmekte.",
    l: { t: "Gümüş kakmalı kılıç yolla", fx: { p: -10, o: 3 } },
    r: { t: "Tebrik mektubu yeter", fx: { p: 3, o: -5 } } },
  { id: "g34", c: "hekim", t: "Yeni bir tedavi öğrendim: sülük! Yorgun kanı emer, beyim. Deneyelim mi sende?",
    l: { t: "Bilime güven", fx: { h: 3, p: -3 } },
    r: { t: "Kanım bana lazım", fx: {} } },
  { id: "g35", c: "koylu", t: "Bir ayı her gece köye inip kovanları talan ediyor. Çocuklar korkudan uyuyamıyor.",
    l: { t: "Avcı gönder", fx: { o: -3, h: 10 } },
    r: { t: "Ayının da hakkı var", fx: { h: -5, u: 3 } } },
  { id: "g36", c: "tuccar", t: "Halı tüccarları lonca kurmak istiyor. Düzen gelir ama fiyatları da onlar belirler.",
    l: { t: "Lonca kurulsun", fx: { p: 10, h: -5 } },
    r: { t: "Serbest pazar", fx: { h: 5, p: -3 } } },
  { id: "g37", c: "kadi", t: "Liman meyhanesinde Frenk tüccarlar şarap içiyor. Ulema kapatılsın diyor, esnaf ekmek kapımız diyor.",
    l: { t: "Kapat", fx: { u: 10, p: -10 } },
    r: { t: "Tüccar kaçarsa ticaret kaçar", fx: { p: 10, u: -10 } } },
  { id: "g38", c: "casus", t: "Kötü haber beyim: sarayında başka birinin casusu var. Kim olduğunu bilmiyorum... henüz.",
    l: { t: "Bul onu, ne gerekiyorsa harca", fx: { p: -10, o: 5 } },
    r: { t: "Bırak izlesin, yanlış izlesin", fx: { o: 3, u: -3 } } },
  { id: "g39", c: "vezir", t: "Dağ köylerine yol yapalım beyim. Vergi de kolay toplanır, asker de kolay gider.",
    l: { t: "Yol medeniyettir", fx: { p: -15, h: 10, o: 5 } },
    r: { t: "Dağlıya yol ne lazım", fx: { h: -5 } } },
  { id: "g40", c: "hatun", req: ["evli"], t: "Bir kızımız oldu beyim! Gözleri tıpkı senin gibi.",
    l: { t: "Sancağın incisi olsun", fx: { h: 5 } },
    r: { t: "Oğlan olacaktı...", fx: { h: -3, u: -3 } } },
  { id: "g41", c: "sehzade", req: ["sehzade"], t: "Baba! Bana gerçek bir at al. Midilli değil, gerçek at!",
    l: { t: "Al sana küheylan", fx: { p: -5 } },
    r: { t: "Önce eyerde durmayı öğren", fx: { u: 3 } } },
  { id: "g42", c: "subasi", t: "Bahar geldi beyim. Cirit turnuvası düzenleyelim; hem halk eğlenir hem askerin bileği güçlenir.",
    l: { t: "Düzenle", fx: { p: -10, h: 10, o: 5 } },
    r: { t: "Oyun zamanı değil", fx: { h: -5, o: -3 } } },
  { id: "g43", c: "dervis", t: "Kandil gecesi beyim. Tekkede zikir var; halk seni de orada görmek ister.",
    l: { t: "Katıl", fx: { u: 10, h: 5 } },
    r: { t: "Devlet işi bitmez", fx: { u: -5 } } },
  { id: "g44", c: "koylu", t: "Vergi tahsildarın köyleri kasıp kavuruyor beyim. Topladığının yarısı da kendi cebine.",
    l: { t: "Tahsildarı zindana at", fx: { h: 10, p: -5, u: 3 } },
    r: { t: "İşini yapıyor", fx: { h: -10, p: 10 } } },
  { id: "g45", c: "ozan", t: "Akkoyun beyi hakkında bir hicviye yazdım. Çok komik. Çok... saldırgan.",
    l: { t: "Okut, gülelim", fx: { h: 5, o: -5 } },
    r: { t: "Yak şunu", fx: { o: 3 } } },
  { id: "g46", c: "hekim", t: "Çarşıda sahte ilaç satan bir şarlatan türedi. 'Bey suyu' diye küp küp satıyor.",
    l: { t: "Kovun şehirden", fx: { h: 5, u: 3 } },
    r: { t: "Vergisini alıyorum, satsın", fx: { p: 5, h: -5 } } },
  { id: "g47", c: "vezir", t: "Arşivler yanmış beyim. Kim neye vergi borçlu, hiçbir kayıt yok.",
    l: { t: "Herkesten yeniden topla", fx: { p: 10, h: -10 } },
    r: { t: "Temiz sayfa, borçlar silindi", fx: { h: 10, p: -10 } } },
  { id: "g48", c: "halk", t: "Hasat şenliği başladı beyim! Halk meydanda, seni de aralarında görmek istiyorlar.",
    l: { t: "Halkın içine karış", fx: { h: 10, u: -3 } },
    r: { t: "Surlardan selam yeter", fx: { h: -5 } } },
  { id: "g49", c: "subasi", t: "Tepelerde kurt sürüsü görüldü. Av mevsimi de geldi. Ava çıkalım mı beyim?",
    l: { t: "Atları hazırla", fx: { h: 5, o: 5 }, risk: { p: 0.06, die: "kurt" } },
    r: { t: "Bu yıl olmaz", fx: { o: -3 } } },
  { id: "g50", c: "ebe", t: "Köyde ikiz doğdu beyim, ama anaları lohusalıkta zayıf düştü. Saraydan süt anası yollasak?",
    l: { t: "Yolla, çocuklar yaşasın", fx: { h: 5, p: -3 } },
    r: { t: "Saray hizmetçisi köye gitmez", fx: { h: -5 } } },
  { id: "g51", c: "kadi", t: "Bir adam 'dünyanın döndüğünü' iddia ediyor beyim. Ulema küplere bindi.",
    l: { t: "Bırakın konuşsun", fx: { u: -10, h: 5 } },
    r: { t: "Sussun, ortalık karışmasın", fx: { u: 5, h: -3 } } },
  { id: "g52", c: "tuccar", t: "Frenk diyarından 'barut' denen kara bir toz getirdim. Gürler, yakar, yıkar. İlgini çeker mi?",
    l: { t: "Hepsini al", fx: { p: -15, o: 15 } },
    r: { t: "Şeytan icadı", fx: { u: 5, o: -5 } } },
  { id: "g53", c: "halk", t: "Köyün delisi Deli Bekir surlara çıkmış, 'ben beyim!' diye bağırıyor. Halk gülmekten kırılıyor.",
    l: { t: "Bir günlüğüne bey olsun", fx: { h: 10, u: -5 } },
    r: { t: "İndirin şunu", fx: { h: -3 } } },
  { id: "g54", c: "hazinedar", t: "Eski saray eşyalarını satabiliriz beyim. Deden merhumun tahtı bile ambarda çürüyor.",
    l: { t: "Sat gitsin", fx: { p: 10, u: -5 } },
    r: { t: "Atalarımın hatırası satılmaz", fx: { u: 3, p: -3 } } },
  { id: "g55", c: "dervis", t: "Sana bir sır vereyim beyim: en tehlikeli düşman, her dediğine evet diyendir.",
    l: { t: "Vezire bak öyleyse", fx: { o: 3, p: -3 } },
    r: { t: "Bana herkes evet der zaten", fx: { u: -5 } } },
];

// ── AİLE & VARİS YAYI (taht devri için şart — yeni beyde sıfırlanır) ──
const AILE = [
  { id: "a1", c: "vezir", not: ["kiz_arandi", "evli"], w: 2, t: "Beyim, tahtın varisi yok. Başına bir şey gelse sancak kime kalır? Civar beyliklerden kız isteyelim.",
    l: { t: "Henüz erken", fx: { u: -3 } },
    r: { t: "Uygun bir hatun bulun", fx: {}, set: ["kiz_arandi"], next: "a2" } },
  { id: "a2", c: "elci", req: ["kiz_arandi"], not: ["evli"], t: "Germiyan beyinin kızı Gülbahar Hatun: akıllı, güzel, çeyizi ağır ama ittifakı değerli.",
    l: { t: "Başka kapı arayın", fx: { o: -3 }, clear: ["kiz_arandi"] },
    r: { t: "Düğün hazırlansın", fx: { p: -15, o: 10, h: 5 }, set: ["evli"], clear: ["kiz_arandi"], next: "a3" } },
  { id: "a3", c: "hatun", req: ["evli"], not: ["cocuk"], w: 2, t: "Beyim... müjde. Ocağımıza bir can geliyor.",
    l: { t: "Kızım olsun isterim", fx: { h: 5 }, set: ["cocuk"], next: "a4" },
    r: { t: "Bana bir oğul ver", fx: { u: 3 }, set: ["cocuk"], next: "a4" } },
  { id: "a4", c: "ebe", req: ["cocuk"], not: ["sehzade"], t: "Bir oğlun oldu beyim! Gürbüz mü gürbüz. Ama doğum zor geçti, Hatun'a iyi bakmak gerek.",
    l: { t: "En iyi hekimler gelsin", fx: { p: -10, h: 5 }, set: ["sehzade"] },
    r: { t: "Dua ederiz, geçer", fx: { u: 5, h: -3 }, set: ["sehzade"] } },
  { id: "a5", c: "kadi", req: ["sehzade"], not: ["egitim"], w: 2, t: "Şehzade Orhan büyüyor beyim. Eğitimini kim üstlensin?",
    l: { t: "Medresede okusun", fx: { u: 10, o: -5 }, set: ["egitim"] },
    r: { t: "Kılıç kuşansın", fx: { o: 10, u: -5 }, set: ["egitim"] } },
  { id: "a6", c: "subasi", req: ["egitim"], not: ["varis"], w: 2, t: "Şehzade ilk avından döndü beyim: bileği sağlam, gözü pek. Halk şimdiden onu seviyor.",
    l: { t: "Gurur duydum", fx: { h: 5 }, set: ["varis"] },
    r: { t: "Daha çok yolu var", fx: { o: 3 }, set: ["varis"] } },
  { id: "a7", c: "hatun", req: ["varis"], t: "Oğlumuz sabırsız beyim. Dün 'baba çok yaşadı' dediğini duydum. Şaka yapıyordu... sanırım.",
    l: { t: "Gözünüz üstünde olsun", fx: { o: 3, h: -3 } },
    r: { t: "Ben de babama öyle derdim", fx: { h: 3 } } },
];

// ── VEBA YAYI ──
const VEBA = [
  { id: "vb1", c: "hekim", once: true, w: 2, t: "Limana yanaşan gemide kara ölüm var beyim. Tayfalar kan kusup ölüyor.",
    l: { t: "Gemiyi yakın", fx: { p: -10, h: 5 } },
    r: { t: "Mal kıymetli, yükü indirin", fx: { p: 15 }, set: ["veba"], next: "vb2" } },
  { id: "vb2", c: "hekim", req: ["veba"], once: true, t: "Salgın mahallelere sıçradı. Şehir kapılarını kapatalım mı?",
    l: { t: "Kapat, kimse girip çıkmasın", fx: { p: -15, h: -10 }, next: "vb3" },
    r: { t: "Ticaret durmasın", fx: { p: 10, h: -15 }, set: ["veba_yayildi"], next: "vb3" } },
  { id: "vb3", c: "kadi", req: ["veba"], once: true, t: "Halk 'günahlarımızın cezası' diyor. Ulema camide toplu dua istiyor — ama kalabalık, hastalık demek.",
    l: { t: "Toplanmak yasak", fx: { u: -15, h: -5 }, next: ["vb4", "vb4b"] },
    r: { t: "Dua edilsin", fx: { u: 10, h: 5 }, next: ["vb4", "vb4b"] } },
  { id: "vb4", c: "hekim", req: ["veba"], not: ["veba_yayildi"], once: true, t: "Bir çare buldum beyim: sirke, kireç ve ateş. Ama bütün mahalleleri arındırmak pahalı.",
    l: { t: "Ne gerekiyorsa harca", fx: { p: -20, h: 10 }, set: ["veba_bitti"], clear: ["veba"] },
    r: { t: "Kadere bırak", fx: { h: -20 }, clear: ["veba"] } },
  { id: "vb4b", c: "hekim", req: ["veba", "veba_yayildi"], once: true, t: "Salgın saraya dayandı beyim. Muhafızlar bile hasta. Sirke ve ateşle son bir şansımız var.",
    l: { t: "Harca, ne gerekiyorsa!", fx: { p: -25, h: 5 }, set: ["veba_bitti"], clear: ["veba", "veba_yayildi"], risk: { p: 0.25, die: "veba" } },
    r: { t: "Kaderde varsa ölürüz", fx: {}, clear: ["veba", "veba_yayildi"], risk: { p: 0.6, die: "veba" } } },
  { id: "vb5", c: "ozan", req: ["veba_bitti"], once: true, t: "Kara ölümden kurtuluşun destanını yazdım beyim. Adı: 'Sirkeyle Gelen Şafak'.",
    l: { t: "Çal bakalım", fx: { h: 10, p: -5 } },
    r: { t: "O günleri anmayalım", fx: { h: -3 } } },
];

// ── SAVAŞ YAYI (Akkoyun Beyliği) ──
const SAVAS = [
  { id: "sv1", c: "akkoyun", once: true, w: 2, t: "Akkoyun Beyi Uzun Hasan'dan haber: sınırdaki Kızılca Ova'yı istiyor. 'Dostça' diyor. Şimdilik.",
    l: { t: "Ova bizimdir. Savaş!", fx: { u: 5, h: -5 }, set: ["savas"], next: "sv2" },
    r: { t: "Bir ova için kan dökülmez", fx: { h: -10, o: -10 }, set: ["ova_verildi"], next: "sv6" } },
  { id: "sv2", c: "subasi", req: ["savas"], once: true, t: "Savaş hazırlığı beyim: paralı asker mi tutalım, köylüden mi toplayalım?",
    l: { t: "Paralı asker", fx: { p: -20, o: 15 }, next: "sv3" },
    r: { t: "Köylü silah altına", fx: { h: -15, o: 10 }, next: "sv3" } },
  { id: "sv3", c: "casus", req: ["savas"], once: true, t: "Akkoyun ordugâhında bir zayıflık buldum: su kuyuları doğu yamacında, korunaksız. Zehirleyebilirim.",
    l: { t: "Yap", fx: { u: -10 }, set: ["kuyu"], next: "sv4a" },
    r: { t: "Şerefimizle savaşırız", fx: { u: 5 }, next: "sv4b" } },
  { id: "sv4a", c: "subasi", req: ["savas", "kuyu"], once: true, t: "Düşman susuzluktan kırılıyor beyim. Saflar dağınık. Emrini ver!",
    l: { t: "Gece baskını", fx: { o: -5, p: 10 }, set: ["zafer"], clear: ["savas"], risk: { p: 0.1, die: "savas" }, next: "sv5" },
    r: { t: "Şafakta meydan savaşı", fx: { o: -10, p: 10 }, set: ["zafer"], clear: ["savas"], risk: { p: 0.2, die: "savas" }, next: "sv5" } },
  { id: "sv4b", c: "subasi", req: ["savas"], not: ["kuyu"], once: true, t: "Ordular karşı karşıya beyim. Akkoyun kalabalık ama bizim toprak, bizim rüzgâr.",
    l: { t: "Gece baskını", fx: { o: -10, p: 5 }, set: ["zafer"], clear: ["savas"], risk: { p: 0.3, die: "savas" }, next: "sv5" },
    r: { t: "Şafakta meydan savaşı", fx: { o: -15, p: 5 }, set: ["zafer"], clear: ["savas"], risk: { p: 0.45, die: "savas" }, next: "sv5" } },
  { id: "sv5", c: "ozan", req: ["zafer"], once: true, t: "ZAFER! Kızılca Ova bizim, Uzun Hasan'ın sancağı çamurda! Destanı çoktan yazdım bile.",
    l: { t: "Şölen ver, halk eğlensin", fx: { p: -10, h: 15, o: 5 } },
    r: { t: "Ganimet hazineye", fx: { p: 15, h: -5, o: 5 } } },
  { id: "sv6", c: "akkoyun", req: ["ova_verildi"], once: true, t: "Uzun Hasan ovayı aldı. Şimdi de 'dostluğun nişanesi' olarak yıllık haraç istiyor.",
    l: { t: "Bu kadarı da fazla. Savaş!", fx: { h: 5 }, set: ["savas"], clear: ["ova_verildi"], next: "sv2" },
    r: { t: "Öde, baş ağrımasın", fx: { p: -15, h: -5, o: -5 } } },
];

// ── KOMPLO YAYI ──
const KOMPLO = [
  { id: "k1", c: "casus", once: true, w: 2, t: "Beyim, kulağıma fısıldandı: bu sarayda biri senin ölümünü konuşuyor. Kim olduğunu öğrenirim... bir kese altına.",
    l: { t: "Al keseni, bul onu", fx: { p: -10 }, next: "k2" },
    r: { t: "Dedikodu bunlar", fx: {}, next: "k3" } },
  { id: "k2", c: "casus", once: true, t: "İz vezire çıkıyor beyim. Kara Davut'un kasasında Akkoyun altınları buldum.",
    l: { t: "Vezirin başını vurun", fx: { h: -5, u: -5, o: 5 }, set: ["vezir_idam"], next: "k5" },
    r: { t: "Kanıt az. İzlemeye devam", fx: {}, set: ["izleniyor"], next: "k4" } },
  { id: "k3", c: "hatun", req: ["evli"], once: true, t: "Beyim, şerbetçinin elleri titriyordu bu akşam. Gözü de kapıdaydı. İçme şunu.",
    l: { t: "Dök şerbeti", fx: {}, next: "k2" },
    r: { t: "Korkaklık etme, ver şunu", fx: {}, risk: { p: 0.5, die: "suikast" } } },
  { id: "k4", c: "casus", req: ["izleniyor"], once: true, t: "Vezir bu gece Akkoyun elçisiyle buluşacak. Baskın emri ver, suçüstü yakalayalım.",
    l: { t: "Basın", fx: { u: 5, h: 5, o: 5 }, set: ["vezir_idam"], clear: ["izleniyor"], next: "k5" },
    r: { t: "Biraz daha bekle", fx: {}, clear: ["izleniyor"], risk: { p: 0.4, die: "suikast" } } },
  { id: "k5", c: "vezir2", req: ["vezir_idam"], once: true, t: "Yeni vezirin Pir Mehmed, beyim. 'Selefimin akıbeti kulağıma küpedir' diyor.",
    l: { t: "Sadakatini göreceğiz", fx: { o: 3 } },
    r: { t: "Hoş geldin. Çay?", fx: { h: 3 } } },
];

// ── EŞKIYA YAYI ──
const ESKIYA = [
  { id: "e1", c: "koylu", once: true, w: 2, t: "Çakır'ın çetesi kervan soyuyor, köyleri haraca bağladı. Devlet nerede beyim?",
    l: { t: "Subaşı peşine düşsün", fx: { o: -5 }, next: "e2" },
    r: { t: "Köylü kendini korusun", fx: { h: -15, p: -5 } } },
  { id: "e2", c: "subasi", once: true, t: "Çakır'ı dağda kıstırdık ama her kayayı biliyor. Kuşatma uzun ve pahalı olur.",
    l: { t: "Kuşat, aç kalsın", fx: { p: -10 }, next: "e3" },
    r: { t: "Af teklif et", fx: {}, next: "e4" } },
  { id: "e3", c: "subasi", once: true, t: "Çakır yakalandı beyim! Zincire vurulmuş, meydanda hükmünü bekliyor.",
    l: { t: "İdam — ibret olsun", fx: { h: 10, u: 5 } },
    r: { t: "Orduma katılsın", fx: { o: 10, h: -5 }, set: ["eskiya_orduda"], next: "e5" } },
  { id: "e4", c: "eskiya", once: true, t: "Af mı? Çakır kimseden af almaz... ama beye kılıç sallamak da yorucu iş. Şartım var: adamlarım asker sayılsın.",
    l: { t: "Kabul", fx: { o: 15, h: -5, u: -5 }, set: ["eskiya_orduda"], next: "e5" },
    r: { t: "Eşkıya şart koşamaz", fx: { h: -10, p: -10 } } },
  { id: "e5", c: "eskiya", req: ["eskiya_orduda"], once: true, t: "Eski çetem rahat durmuyor diyorlar. Yalan. Ben söz verdim; Çakır'ın sözü senettir.",
    l: { t: "Sana güveniyorum", fx: { h: 5, o: 5 } },
    r: { t: "Gözüm üstünde", fx: { o: -5 } } },
];

// ── CAMİ YAYI ──
const CAMI = [
  { id: "c1", c: "mimar", once: true, w: 2, t: "Ulu bir cami çizdim beyim — kubbesi gökle yarışır, minaresi buluta değer. Üç yıl ve bin altın ister.",
    l: { t: "Başla", fx: { p: -20, u: 15 }, set: ["cami"], next: "c2" },
    r: { t: "Hayal kurma üstad", fx: { u: -10 } } },
  { id: "c2", c: "mimar", once: true, req: ["cami"], t: "Taş ocağı çöktü, iki işçi öldü. Kalanlar 'uğursuz' diye kaçıyor. Para da bitti beyim.",
    l: { t: "Daha fazla para, daha fazla işçi", fx: { p: -15, h: -5 }, next: "c3" },
    r: { t: "Yarım kalsın", fx: { u: -15, h: -5 }, clear: ["cami"] } },
  { id: "c3", c: "kadi", once: true, req: ["cami"], t: "Cami bitti beyim! Kubbesi güneşte yanıyor. İlk cuma hutbesinde adın okunacak.",
    l: { t: "Açılışa bütün sancak gelsin", fx: { p: -5, u: 15, h: 10 }, clear: ["cami"], set: ["cami_bitti"] },
    r: { t: "Gösterişsiz olsun", fx: { u: 10 }, clear: ["cami"], set: ["cami_bitti"] } },
  { id: "c4", c: "dervis", once: true, req: ["cami_bitti"], t: "Kubbenin gölgesi düştü mü toprağa, beyin gönlü de o kadar geniş olsun derler. Tebrik ederim beyim.",
    l: { t: "Sağ ol derviş baba", fx: { u: 5 } },
    r: { t: "Gölge mölge, pahalıydı ama", fx: { p: 3, u: -3 } } },
];

// ── KURAKLIK YAYI ──
const KURAK = [
  { id: "q1", c: "koylu", once: true, w: 2, t: "Üç aydır yağmur yok beyim. Tohum toprakta yanıyor, hayvanlar susuz.",
    l: { t: "Ambarları aç", fx: { p: -10, h: 15 }, next: "q2" },
    r: { t: "Sabredin, yağar", fx: { h: -15 }, next: "q2" } },
  { id: "q2", c: "kadi", once: true, t: "Halk yağmur duasına çıkmak istiyor. Bütün sancak tepede toplanacak.",
    l: { t: "Ben de geleceğim", fx: { u: 10, h: 5 }, next: "q3" },
    r: { t: "Dua yerine kuyu kazın", fx: { p: -10, h: 10, u: -10 }, next: "q3" } },
  { id: "q3", c: "tuccar", once: true, t: "Kıtlık kapıda beyim. Sana gemiyle buğday getiririm... iki kat fiyatına.",
    l: { t: "Öde, halk aç kalmasın", fx: { p: -15, h: 10 } },
    r: { t: "Vurguncu! Defol", fx: { h: -10, u: 5 } } },
];

// ── İMPARATORLUK VERGİSİ YAYI ──
const VERGI = [
  { id: "t1", c: "elci", once: true, w: 2, t: "Yüce İmparatorluk yıllık vergiyi iki katına çıkardı. İtiraz... önerilmez.",
    l: { t: "Öde", fx: { p: -20 } },
    r: { t: "Sancak fakir, ödeyemeyiz", fx: {}, set: ["vergi_red"], next: "t2" } },
  { id: "t2", c: "elci", once: true, req: ["vergi_red"], t: "İmparatorluk 'fakirliğinizi' yerinde görmek için teftiş heyeti yolluyor.",
    l: { t: "Defterlerde oyna", fx: { p: 10 }, risk: { p: 0.35, die: "p100" }, clear: ["vergi_red"] },
    r: { t: "Doğruyu göster, pazarlık et", fx: { p: -15 }, clear: ["vergi_red"] } },
  { id: "t3", c: "elci", once: true, t: "İmparator senden memnun beyim. 'Sadık beyimiz' diye söz ediyormuş. Bir nişan bile yollamış.",
    l: { t: "Şeref duydum", fx: { o: 5, h: -5 } },
    r: { t: "Nişanla vergi mi ödenir", fx: { h: 5, o: -3 } } },
];

// ── DEFİNE YAYI ──
const DEFINE = [
  { id: "d1", c: "koylu", once: true, w: 2, t: "Tarlamı sürerken küpler dolusu altın buldum beyim! Ama üstünde eski yazılar var; köylü 'lanetli' diyor.",
    l: { t: "Hazineye getirin", fx: { p: 25 }, set: ["lanet"], next: "d2" },
    r: { t: "Geri gömün, dokunmayın", fx: { u: 5, h: 5 } } },
  { id: "d2", c: "dervis", once: true, req: ["lanet"], t: "O altın eski bir kavmin ölü diyetidir beyim. Elinde tutma; dağıt ki lanet dağılsın.",
    l: { t: "Sadaka olarak dağıt", fx: { p: -15, h: 10, u: 10 }, clear: ["lanet"] },
    r: { t: "Hurafe bunlar", fx: { u: -5 }, next: "d3" } },
  { id: "d3", c: "hekim", once: true, req: ["lanet"], t: "Beyim... elinizdeki bu kararmayı daha önce hiç görmedim. Ağrıyor mu?",
    l: { t: "Bütün hekimleri topla", fx: { p: -15 }, clear: ["lanet"], risk: { p: 0.3, die: "define" } },
    r: { t: "Bir şey değildir", fx: {}, clear: ["lanet"], risk: { p: 0.6, die: "define" } } },
];

// ── MİSTİK / DERVİŞ KARTLARI ──
const MISTIK = [
  { id: "m1", c: "dervis", t: "Rüyanda kara bir at gördün mü beyim? Görmediysen... göreceksin.",
    l: { t: "Anlat derviş baba", fx: { u: 5, p: -3 } },
    r: { t: "Falcılık yapma", fx: { u: -5 } } },
  { id: "m2", c: "dervis", t: "Az ye, az uyu, az konuş beyim. Çok ver.",
    l: { t: "Hikmetli söz", fx: { u: 5, h: 3, p: -5 } },
    r: { t: "Karnım tok, sözün bol", fx: { u: -5 } } },
  { id: "m3", c: "dervis", t: "Bu gece yıldızlar hizaya girdi beyim. Ya büyük bir talih, ya büyük bir bela. Yıldız bu, net konuşmaz.",
    l: { t: "Talihe oynarım", fx: { p: 5, u: -3 } },
    r: { t: "Belaya hazırlan", fx: { o: 5, p: -5 } } },
  { id: "m4", c: "ebe", t: "Kırk yıllık ebeyim beyim, şunu bilirim: doğum da ölüm de vakit sormaz. Vasiyetin hazır mı?",
    l: { t: "Hazırlat", fx: { u: 5 } },
    r: { t: "Daha çok erken", fx: {} } },
];

const CARDS = [...GENEL, ...AILE, ...VEBA, ...SAVAS, ...KOMPLO, ...ESKIYA, ...CAMI, ...KURAK, ...VERGI, ...DEFINE, ...MISTIK];

// ── motor yardımcıları ──
const byId = (id) => CARDS.find((c) => c.id === id);
const okC = (c, fl, us) => {
  if (us.has(c.id)) return false;
  if (c.req && !c.req.every((f) => fl.has(f))) return false;
  if (c.not && c.not.some((f) => fl.has(f))) return false;
  return true;
};
function pickCard(fl, us, qu) {
  const q = [...qu];
  while (q.length) {
    const c = byId(q.shift());
    if (c && (!us.has(c.id) || true) && (!c.req || c.req.every((f) => fl.has(f))) && (!c.not || !c.not.some((f) => fl.has(f))))
      return { card: c, queue: q };
  }
  let pool = CARDS.filter((c) => okC(c, fl, us));
  let us2 = us;
  if (!pool.length) {
    // deste bitti → tek seferlik olmayanları yeniden karıştır
    us2 = new Set([...us].filter((id) => { const c = byId(id); return c && c.once; }));
    pool = CARDS.filter((c) => okC(c, fl, us2));
  }
  const tw = pool.reduce((s, c) => s + (c.w || 1), 0);
  let r = Math.random() * tw;
  for (const c of pool) { r -= c.w || 1; if (r <= 0) return { card: c, queue: q, used: us2 }; }
  return { card: pool[0], queue: q, used: us2 };
}

export default function SancakBeyi() {
  const [screen, setScreen] = useState("menu"); // menu | play | death | olumler
  const [stats, setStats] = useState({ h: 50, o: 50, u: 50, p: 50 });
  const [year, setYear] = useState(1402);
  const [startYear, setStartYear] = useState(1402);
  const [dynStart, setDynStart] = useState(1402);
  const [age, setAge] = useState(28);
  const [beyNo, setBeyNo] = useState(1);
  const [beyName, setBeyName] = useState("Kara Osman Bey");
  const [flags, setFlags] = useState(new Set());
  const [used, setUsed] = useState(new Set());
  const [queue, setQueue] = useState([]);
  const [card, setCard] = useState(null);
  const [death, setDeath] = useState(null);
  const [seen, setSeen] = useState(new Set());
  const [best, setBest] = useState(0);
  const [dx, setDx] = useState(0);
  const [anim, setAnim] = useState(null);
  const drag = useRef({ on: false, x0: 0 });

  const newDynasty = () => {
    const f = new Set(), u = new Set();
    const { card: c, queue: q } = pickCard(f, u, []);
    setStats({ h: 50, o: 50, u: 50, p: 50 });
    setFlags(f); setUsed(new Set([c.id])); setQueue(q || []);
    setStartYear(year); setDynStart(year); setAge(25 + Math.floor(Math.random() * 10));
    setBeyNo(1); setBeyName("Kara Osman Bey");
    setCard(c); setDeath(null); setDx(0); setAnim(null); setScreen("play");
  };

  const succession = () => {
    const f = new Set([...flags].filter((x) => !FAMILY_FLAGS.includes(x)));
    const u = new Set([...used].filter((id) => { const c = byId(id); return c && c.once; }));
    const { card: c, queue: q } = pickCard(f, u, []);
    u.add(c.id);
    const name = HEIRS[(beyNo - 1) % HEIRS.length] + " Bey";
    setStats({ h: 50, o: 50, u: 50, p: 50 });
    setFlags(f); setUsed(u); setQueue(q || []);
    setStartYear(year + 1); setYear(year + 1); setAge(18 + Math.floor(Math.random() * 6));
    setBeyNo(beyNo + 1); setBeyName(name);
    setCard(c); setDeath(null); setDx(0); setAnim(null); setScreen("play");
  };

  const die = (key) => {
    const dynYears = year - dynStart;
    setBest((b) => Math.max(b, dynYears));
    setSeen((s) => new Set([...s, key]));
    setDeath(key); setScreen("death");
  };

  const commit = (dir) => {
    if (!card || anim) return;
    setAnim(dir);
    const ch = dir === "left" ? card.l : card.r;
    setTimeout(() => {
      // bayraklar
      const f = new Set(flags);
      (ch.set || []).forEach((x) => f.add(x));
      (ch.clear || []).forEach((x) => f.delete(x));
      // istatistikler
      const ns = { ...stats };
      Object.entries(ch.fx || {}).forEach(([k, v]) => (ns[k] += v));
      // yıl & yaş
      const tick = Math.random() < 0.6 ? 1 : 0;
      const ny = year + tick, na = age + tick;
      setYear(ny); setAge(na); setFlags(f);
      setStats({ h: Math.max(0, Math.min(100, ns.h)), o: Math.max(0, Math.min(100, ns.o)), u: Math.max(0, Math.min(100, ns.u)), p: Math.max(0, Math.min(100, ns.p)) });
      // ölüm kontrolleri
      if (ch.die) return die(ch.die);
      if (ch.risk && Math.random() < ch.risk.p) return die(ch.risk.die);
      for (const s of STATS) {
        if (ns[s.k] <= 0) return die(s.k + "0");
        if (ns[s.k] >= 100) return die(s.k + "100");
      }
      if (na >= 72 && Math.random() < 0.08) return die("ecel");
      // sıradaki kart
      let q = [...queue];
      if (ch.next) q.unshift(...[].concat(ch.next));
      const u = new Set(used); u.add(card.id);
      const res = pickCard(f, u, q);
      const u2 = res.used ? new Set(res.used) : u;
      u2.add(res.card.id);
      setUsed(u2); setQueue(res.queue || []);
      setCard(res.card); setDx(0); setAnim(null);
    }, 280);
  };

  const onDown = (e) => { if (anim) return; drag.current = { on: true, x0: e.clientX }; e.currentTarget.setPointerCapture(e.pointerId); };
  const onMove = (e) => { if (!drag.current.on || anim) return; setDx(e.clientX - drag.current.x0); };
  const onUp = () => {
    if (!drag.current.on) return;
    drag.current.on = false;
    if (dx < -85) commit("left");
    else if (dx > 85) commit("right");
    else setDx(0);
  };

  const choice = dx < -25 ? card?.l : dx > 25 ? card?.r : null;
  const fxKeys = choice ? Object.keys(choice.fx || {}).filter((k) => choice.fx[k] !== 0) : [];
  const tx = anim === "left" ? -560 : anim === "right" ? 560 : dx;
  const rot = tx / 14;
  const op = Math.min(1, Math.abs(dx) / 70);

  // ── EKRAN: MENÜ ──
  if (screen === "menu") return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-amber-950 flex flex-col items-center justify-center p-6 text-amber-50 select-none">
      <div className="text-6xl mb-2">🏰</div>
      <h1 className="text-5xl font-bold tracking-widest mb-1" style={{ fontFamily: "Georgia, serif" }}>SANCAK</h1>
      <p className="text-amber-200/70 italic mb-8">Bir Hanedan Hikâyesi</p>
      <div className="text-center text-sm text-amber-100/60 max-w-xs mb-8 leading-relaxed">
        Sancağın beyi sensin. Kartları <b>sola</b> ya da <b>sağa</b> sürükleyerek hüküm ver.
        Halkı, orduyu, ulemayı ve hazineyi dengede tut — biri dibe vurursa da taşarsa da ölürsün.
        Bir varis yetiştir ki hanedanın seninle ölmesin.
      </div>
      <button onClick={newDynasty} className="bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold px-10 py-3 rounded-full text-lg mb-3 shadow-lg">Tahta Çık</button>
      <button onClick={() => setScreen("olumler")} className="text-amber-200/60 underline text-sm">Ölümler Defteri ({seen.size}/{Object.keys(DEATHS).length})</button>
      {best > 0 && <div className="mt-6 text-amber-300/80 text-sm">🏆 En uzun hanedan: {best} yıl</div>}
    </div>
  );

  // ── EKRAN: ÖLÜMLER DEFTERİ ──
  if (screen === "olumler") return (
    <div className="min-h-screen bg-slate-950 text-amber-50 p-6 select-none">
      <h2 className="text-2xl font-bold mb-4 text-center" style={{ fontFamily: "Georgia, serif" }}>☠️ Ölümler Defteri</h2>
      <div className="max-w-md mx-auto grid grid-cols-1 gap-2 mb-6">
        {Object.entries(DEATHS).map(([k, d]) => (
          <div key={k} className={"rounded-xl p-3 flex items-center gap-3 " + (seen.has(k) ? "bg-slate-800" : "bg-slate-900 opacity-50")}>
            <div className="text-3xl">{seen.has(k) ? d.e : "❓"}</div>
            <div>
              <div className="font-bold text-amber-200">{seen.has(k) ? d.t : "???"}</div>
              <div className="text-xs text-amber-100/60">{seen.has(k) ? d.d : "Bu ölümü henüz tatmadın."}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="text-center"><button onClick={() => setScreen("menu")} className="bg-amber-700 px-8 py-2 rounded-full font-bold">Geri</button></div>
    </div>
  );

  // ── EKRAN: ÖLÜM ──
  if (screen === "death") {
    const d = DEATHS[death];
    const reignY = year - startYear, dynY = year - dynStart;
    const hasHeir = flags.has("varis");
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-red-950 flex flex-col items-center justify-center p-6 text-amber-50 text-center select-none">
        <div className="text-7xl mb-4">{d.e}</div>
        <h2 className="text-3xl font-bold mb-2 text-red-300" style={{ fontFamily: "Georgia, serif" }}>{d.t}</h2>
        <p className="max-w-xs text-amber-100/80 mb-6 leading-relaxed">{d.d}</p>
        <div className="text-sm text-amber-200/70 mb-1">{beyName} · {reignY} yıl hüküm sürdü ({startYear}–{year})</div>
        <div className="text-sm text-amber-200/70 mb-6">Hanedan: {beyNo}. kuşak · toplam {dynY} yıl</div>
        {dynY >= 60 && <div className="text-amber-300 font-bold mb-4">🏆 Efsanevi Hanedan! Adınız tarihe altın harflerle yazıldı.</div>}
        {hasHeir
          ? <button onClick={succession} className="bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold px-8 py-3 rounded-full mb-3">👑 Şehzade tahta çıksın</button>
          : <div className="text-red-300/80 text-sm mb-3 italic">Varis yok... Hanedan seninle son buldu.</div>}
        <button onClick={newDynasty} className="bg-slate-700 hover:bg-slate-600 px-8 py-2 rounded-full mb-2">Yeni Hanedan Kur</button>
        <button onClick={() => setScreen("menu")} className="text-amber-200/50 underline text-sm">Ana Menü</button>
      </div>
    );
  }

  // ── EKRAN: OYUN ──
  const chr = CH[card.c];
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-amber-950 flex flex-col items-center p-4 text-amber-50 select-none overflow-hidden">
      {/* istatistikler */}
      <div className="flex gap-5 mt-2 mb-3">
        {STATS.map((s) => (
          <div key={s.k} className="flex flex-col items-center">
            <div className="relative w-12 h-12 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
              <div className="absolute bottom-0 left-0 right-0 bg-amber-500/70 transition-all duration-300" style={{ height: stats[s.k] + "%" }} />
              <div className="absolute inset-0 flex items-center justify-center text-xl">{s.e}</div>
              {fxKeys.includes(s.k) && (
                <div className="absolute top-0 right-0 m-0.5 rounded-full bg-amber-50 border border-slate-500"
                  style={{ width: Math.abs(choice.fx[s.k]) > 7 ? 12 : 7, height: Math.abs(choice.fx[s.k]) > 7 ? 12 : 7, opacity: op }} />
              )}
            </div>
            <div className="text-[10px] text-amber-200/50 mt-1">{s.n}</div>
          </div>
        ))}
      </div>
      {/* yıl */}
      <div className="text-amber-200/70 text-sm mb-3">⳩ {year} · {beyName} · Saltanatın {Math.max(1, year - startYear)}. yılı</div>
      {/* kart */}
      <div className="relative w-72 h-96 mb-3" style={{ perspective: 800 }}>
        <div
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          className="absolute inset-0 bg-amber-50 text-slate-900 rounded-3xl shadow-2xl p-5 flex flex-col items-center cursor-grab active:cursor-grabbing touch-none"
          style={{ transform: `translateX(${tx}px) rotate(${rot}deg)`, transition: anim ? "transform .28s ease-in" : drag.current.on ? "none" : "transform .2s ease-out" }}>
          {/* seçenek etiketleri */}
          <div className="absolute top-3 left-3 right-3 flex justify-between text-xs font-bold">
            <span className="bg-slate-900 text-amber-50 rounded-lg px-2 py-1 max-w-[45%]" style={{ opacity: dx < -25 ? op : 0 }}>⬅ {card.l.t}</span>
            <span className="bg-slate-900 text-amber-50 rounded-lg px-2 py-1 max-w-[45%] text-right" style={{ opacity: dx > 25 ? op : 0 }}>{card.r.t} ➡</span>
          </div>
          <div className="text-7xl mt-8 mb-3">{chr.e}</div>
          <div className="text-center text-[15px] leading-snug font-medium px-1 flex-1 flex items-center" style={{ fontFamily: "Georgia, serif" }}>{card.t}</div>
          <div className="text-xs text-slate-500 italic mb-1">— {chr.n}</div>
        </div>
      </div>
      <div className="text-amber-200/40 text-xs">⬅ sola sürükle · sağa sürükle ➡</div>
      {flags.has("varis") && <div className="text-amber-300/70 text-xs mt-1">👑 Varis hazır — hanedan güvende</div>}
    </div>
  );
}
