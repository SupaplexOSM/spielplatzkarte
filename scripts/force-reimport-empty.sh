#!/usr/bin/env bash
# force-reimport-empty.sh — triggers forced reimport for every data-node stack
# that currently reports 0 playgrounds. Runs imports sequentially to avoid OOM
# on a single VPS (each import can use several GB of RAM).
#
# Usage: bash scripts/force-reimport-empty.sh
set -euo pipefail

STACKS=(
  "$HOME/spieli-hessen:data-node-ui:8081"
  "$HOME/spieli-berlin:data-node-ui:8082"
  "$HOME/spieli-bayern:data-node-ui:8083"
  "$HOME/spieli-brandenburg:data-node-ui:8084"
  "$HOME/spieli-bremen:data-node-ui:8085"
  "$HOME/spieli-hamburg:data-node-ui:8086"
  "$HOME/spieli-mv:data-node-ui:8087"
  "$HOME/spieli-nrw:data-node-ui:8088"
  "$HOME/spieli-rlp:data-node-ui:8089"
  "$HOME/spieli-saarland:data-node-ui:8090"
  "$HOME/spieli-sachsen:data-node-ui:8091"
  "$HOME/spieli-sachsen-anhalt:data-node-ui:8092"
  "$HOME/spieli-sh:data-node-ui:8093"
  "$HOME/spieli-thueringen:data-node-ui:8094"
)

failed=()

for entry in "${STACKS[@]}"; do
  IFS=: read -r dir profiles port <<< "$entry"
  name=$(basename "$dir")

  count=$(curl -sf "http://localhost:${port}/api/rpc/get_meta" 2>/dev/null \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('playground_count', -1))" 2>/dev/null \
    || echo -1)

  if [[ "$count" -gt 0 ]]; then
    echo "✓ $name — $count playgrounds, skipping"
    continue
  fi

  echo ""
  echo "━━━ $name — 0 playgrounds, running forced reimport ━━━"
  cd "$dir"
  if docker compose --profile data-node-ui run --rm \
      -e REIMPORT_INTERVAL_MIN_DAYS= \
      -e REIMPORT_INTERVAL_MAX_DAYS= \
      importer; then
    echo "✓ $name done"
  else
    echo "✗ $name FAILED"
    failed+=("$name")
  fi
done

echo ""
if [[ ${#failed[@]} -gt 0 ]]; then
  echo "Failed: ${failed[*]}"
  exit 1
fi
echo "All forced reimports completed."
