#!/bin/bash
# Zips the built Chrome extension and rclone copies it to Google Drive.
# Reads version from packages/extension/package.json.

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT_DIR="$ROOT/packages/extension/dist/chrome"
BUILDS_DIR="/home/chris/GoogleDrive/Development/map-marketplace/builds"

# Read version from package.json
VERSION=$(node -e "console.log(require('$ROOT/packages/extension/package.json').version)")

ZIP_NAME="mhcm-extension_${VERSION}.zip"
ZIP_PATH="$ROOT/packages/extension/dist/$ZIP_NAME"

# Create the zip
cd "$EXT_DIR"
rm -f "$ZIP_PATH"
zip -r "$ZIP_PATH" . -x '*.map'

echo "[package-extension] created $ZIP_NAME"

# Copy to Google Drive via rclone
rclone copy "$ZIP_PATH" "drive:Development/map-marketplace/builds/"

echo "[package-extension] uploaded $ZIP_NAME to Google Drive"
