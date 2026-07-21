# KPTA / katplanitasarim — ajan talimatları

Ana talimatlar `CLAUDE.md` dosyasında — önce onu oku.

## ÇOK-AJAN SUNUCU KURALLARI (ZORUNLU — ihlali canlı site düşürür)

Prod sunucuda (server.nousworks.co / 78.142.211.44, SSH port 35342) AYNI ANDA
birden fazla ajan çalışıyor (Codex + Claude Code, birden çok oturum). Ajanlar
birbirinden habersizdir. Sunucuya deploy/SSH yapan HER işlemde:

1. **Doğru kaynak SUNUCUDUR, lokal kopya değil.** Sunucudaki bir dosya (özellikle
   `/srv/edge/Caddyfile` ve `/srv/edge/docker-compose.yml`) lokaldeki kopyandan
   farklıysa, onu başka bir ajan bilerek değiştirmiştir. Lokal kopyayı üstüne
   basmak onun işini siler (md.nousworks.co böyle kaybedildi, 2026-07-17).
2. **Caddyfile değişikliği HER ZAMAN şu sırayla:** sunucudaki güncel hali çek ve
   yedekle → değişikliği o güncel halin ÜZERİNE yap → `caddy validate` → gönder +
   reload → TÜM domainlerin hâlâ cevap verdiğini doğrula (sadece kendi eklediğin
   değil) → sorun varsa yedeği geri koy. Lokal kopyayı asla olduğu gibi basma.
3. **`rsync --delete` paylaşılan hedefe YASAK** — başka ajanın koyduğu dosyaları
   siler. Sadece tek sahibi olduğun proje klasörüne, o da gerekiyorsa.
4. **Tanımadığın şeyi silme/değiştirme.** Sunucuda beklemediğin bir site, konteyner,
   config bloğu, cron görürsen o başka ajanın işidir: dokunma, kullanıcıya sor.
5. **Aynı anda tek deploy.** Kullanıcı hangi ajanın deploy sırası olduğunu söyler;
   sıran değilse sunucuya yazma (okumak serbest).
