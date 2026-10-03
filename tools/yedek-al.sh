#!/usr/bin/env bash
# KPTA yerel-veri yedegi — GitHub'in KORUMADIGI her seyi hedefe kopyalar.
# (mesken/ 1.4GB, input/, ref/, snapshots/, .env sirlari, ml agirliklari/veri seti...)
#
# Kullanim:
#   bash tools/yedek-al.sh            # harici disk (UDOGS WB1) — varsayilan
#   bash tools/yedek-al.sh icloud     # iCloud Drive (off-site)
#   bash tools/yedek-al.sh gdrive     # Google Drive (rclone; .env HARIC) — SEN calistir
#   KPTA_YEDEK_DISK='/Volumes/BASKA' bash tools/yedek-al.sh   # baska disk
#
# Not: ADDITIVE (--delete YOK) — yedek yalnizca buyur, kazara dosya silmez.
# node_modules haric (npm install ile geri gelir).
set -euo pipefail

SRC="/Users/ofbakirci/apps_ofb/katplanitasarim/"
TARGET="${1:-disk}"

if [ "$TARGET" = "gdrive" ]; then
  # Google Drive — rclone remote 'gdrive' (drive.file scope).
  # .env HARIC: API anahtarlari buluta gitmez (harici disk + iCloud'da zaten yedekli).
  # NOT: Claude'un guvenlik filtresi bu yuklemeyi bloklar; bunu TERMINALDE SEN calistir.
  command -v rclone >/dev/null 2>&1 || { echo "HATA: rclone kurulu degil"; exit 1; }
  rclone listremotes 2>/dev/null | grep -q '^gdrive:' || {
    echo "HATA: 'gdrive' remote yok. Once kur:"
    echo "  rclone config create gdrive drive scope=drive.file"
    exit 1; }
  echo "Google Drive'a yukleniyor -> gdrive:_YEDEK_katplanitasarim  (.env haric)"
  rclone copy "$SRC" "gdrive:_YEDEK_katplanitasarim" \
    --exclude "node_modules/**" --exclude ".test-tmp/**" --exclude ".DS_Store" \
    --exclude ".env" --exclude ".env.*" --exclude "*.env" \
    --transfers=4 --drive-chunk-size=64M -P
  echo "OK — gdrive:_YEDEK_katplanitasarim · $(date '+%Y-%m-%d %H:%M')"
  exit 0
fi

if [ "$TARGET" = "icloud" ]; then
  DEST="$HOME/Library/Mobile Documents/com~apple~CloudDocs/_YEDEK_katplanitasarim"
  LABEL="iCloud Drive (off-site)"
else
  DRIVE="${KPTA_YEDEK_DISK:-/Volumes/UDOGS WB1}"
  if [ ! -d "$DRIVE" ]; then
    echo "HATA: yedek diski bagli degil -> $DRIVE"
    echo "Diski tak, ya da:  KPTA_YEDEK_DISK='/Volumes/DISK_ADI' bash tools/yedek-al.sh"
    exit 1
  fi
  DEST="$DRIVE/_YEDEK_katplanitasarim"
  LABEL="$DRIVE"
fi

mkdir -p "$DEST"
echo "Yedekleniyor ($LABEL) -> $DEST"
rsync -a --human-readable \
  --exclude 'node_modules/' \
  --exclude '.test-tmp/' \
  --exclude '.DS_Store' \
  "$SRC" "$DEST/"
echo "OK — $(du -sh "$DEST" | cut -f1) · $(date '+%Y-%m-%d %H:%M')"
