#!/bin/sh
# KPTA ship — "commit & push, hepsi eş zamanlı güncel"
# Kullanım:  npm run ship "commit mesajı"
#            (veya doğrudan: sh tools/ship.sh "commit mesajı")
#
# Akış: tracked değişiklikleri stage'le → commit (pre-commit hook BURADA
#       npm run build çalıştırır + mesken prototip'i yeniden stage'ler) → push.
# Sonuç: kabuk + Pages + tek-dosya(disk) + mesken prototip = aynı motor.
#
# Yeni bir DOSYA eklediyysen (yeni .js modülü, görsel vb.) önce `git add <dosya>`
# yap; bu script sadece zaten takip edilen dosyaların değişikliklerini stage'ler.

set -e

MSG="$1"
if [ -z "$MSG" ]; then
  echo "Kullanım: npm run ship \"commit mesajı\""
  exit 1
fi

# Takip edilen dosyalardaki değişiklikleri stage'le (untracked input/, ml/ vb. süpürmez)
git add -u

if git diff --cached --quiet; then
  echo "[ship] Stage'de değişiklik yok — commit edilecek bir şey yok."
  exit 0
fi

git commit -m "$MSG"
git push
echo "[ship] ✓ Push tamam. Pages birkaç dakika içinde güncellenir: https://ofbakirci.github.io/katplanitasarim/"
