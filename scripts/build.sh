#!/bin/bash
# Build orchestrator: bump → build → deploy/package (rewind on failure)
set -euo pipefail

# 1. Generate content
npm run generate:faq
npm run generate:onboarding

# 2. Bump version
node scripts/bump-version.mjs

# 3. Build all workspaces — rewind version on failure
if ! npm run build --workspaces; then
  echo ""
  echo "Build failed — rewinding version bump"
  node scripts/bump-version.mjs --rewind
  exit 1
fi

# 4. Build succeeded — deploy and package
npm run deploy
npm run package:extension
