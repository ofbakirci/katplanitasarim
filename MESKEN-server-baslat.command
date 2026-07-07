#!/bin/zsh
# ============================================================================
#  MESKEN render sunucusu — tek tık başlatıcı
#  Finder'da çift tıkla (ilk sefer: sağ tık > Aç).
#  Bu pencere AÇIK kaldığı sürece sunucu çalışır (localhost:8787).
#  Durdurmak için: bu pencerede Ctrl+C ya da pencereyi kapat.
# ============================================================================

set -o pipefail

# --- 0. Proje klasörü = bu dosyanın bulunduğu klasör (repo kökü) ---
PROJE="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJE" || { echo "Proje klasörü bulunamadı."; echo "Enter'a bas."; read; exit 1; }

echo ""
echo "  ======  MESKEN RENDER SUNUCUSU  ======"
echo "  Proje: $PROJE"
echo ""

# --- 1. node'u PATH'e getir (Finder'dan açılınca PATH boş gelebilir) ---
[ -f "$HOME/.zprofile" ] && source "$HOME/.zprofile" >/dev/null 2>&1
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh" >/dev/null 2>&1
for d in "$HOME/.nvm/versions/node/"*/bin; do
  [ -d "$d" ] && export PATH="$d:$PATH"
done
if ! command -v node >/dev/null 2>&1; then
  echo "  [X] node bulunamadı. Terminal'de 'which node' çalışıyor mu bak."
  echo "      Kapatmak için Enter'a bas."; read; exit 1
fi
echo "  [OK] node $(node -v)"

# --- 2. Sunucu dosyası + .env kontrolü ---
SERVER="$PROJE/mesken/02_PROTOTIP/server/render-server.js"
if [ ! -f "$SERVER" ]; then
  echo "  [X] Sunucu dosyası yok: $SERVER"
  echo "      (mesken/ klasörü bu makinede eksik olabilir.)"
  echo "      Kapatmak için Enter'a bas."; read; exit 1
fi
if ! grep -q "REPLICATE_API_TOKEN=" "$PROJE/.env" 2>/dev/null; then
  echo "  [!] Uyarı: .env içinde REPLICATE_API_TOKEN görünmüyor —"
  echo "      sunucu açılır ama render istekleri hata verir."
fi

# --- 3. 8787 portunu tutan eski süreci CERRAHİ kapat (yalnız o port) ---
OLD=$(lsof -ti tcp:8787 2>/dev/null)
if [ -n "$OLD" ]; then
  echo "  ... 8787 portunda eski sunucu var, kapatılıyor..."
  echo "$OLD" | xargs kill 2>/dev/null
  sleep 1
fi

# --- 4. Sunucuyu ÖN PLANDA çalıştır (loglar bu pencerede akar) ---
echo ""
echo "  =============================================="
echo "   MESKEN RENDER SUNUCUSU CALISIYOR"
echo ""
echo "   Adres        : http://localhost:8787"
echo "   Bu pencereyi KAPATMA - kapatinca sunucu durur."
echo "   Durdurmak icin: Ctrl+C ya da pencereyi kapat."
echo "  =============================================="
echo ""
node "$SERVER"
echo ""
echo "  Sunucu durdu. Kapatmak için Enter'a bas."; read
