#!/bin/bash
set -euo pipefail

ROOT="/Users/narduk/new-code/template-apps/scrape"

cd "$ROOT"
exec /opt/homebrew/bin/doppler run --config prd -- /bin/bash -lc '
  export SCRAPE_API_BASE="https://scrape.nard.uk"
  export SCRAPE_AGENT_ID="scrape-prod-launchd"
  exec /Users/narduk/.volta/bin/pnpm --dir "'"$ROOT"'" --filter scrape-agent run worker
'
