#!/bin/bash
# Build script for Warehouse Spending Tracker Chrome Extension
# Creates a clean ZIP for Chrome Web Store submission

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

VERSION=$(grep '"version"' manifest.json | sed 's/.*"version": *"\(.*\)".*/\1/')
OUTPUT="warehouse-spending-tracker-v${VERSION}.zip"

echo "Building Warehouse Spending Tracker v${VERSION}..."

# Remove old build
rm -f "$OUTPUT"

# Create ZIP excluding non-extension files
zip -r "$OUTPUT" \
  manifest.json \
  background/ \
  content/ \
  icons/ \
  lib/ \
  popup/ \
  results/ \
  -x "*.DS_Store" \
  -x "*__MACOSX*"

SIZE=$(du -h "$OUTPUT" | cut -f1)
echo ""
echo "✅ Built: $OUTPUT ($SIZE)"
echo ""
echo "Next steps:"
echo "  1. Go to https://chrome.google.com/webstore/devconsole"
echo "  2. Click 'New Item' → Upload $OUTPUT"
echo "  3. Fill in listing details from store-listing.md"
echo "  4. Add screenshots (1280x800)"
echo "  5. Set Privacy Policy URL"
echo "  6. Submit for review"
