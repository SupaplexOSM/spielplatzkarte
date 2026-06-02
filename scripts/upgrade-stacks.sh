#!/usr/bin/env bash
# upgrade-stacks.sh — sequential upgrade of all spieli stacks on one host.
#
# Run on the VPS as the user who owns the stack directories.
# Edit STACKS below to match your deployment. List data-nodes first, hub last.
#
# Usage: bash upgrade-stacks.sh
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
# Format per entry: "DIRECTORY:SPACE-SEPARATED-PROFILES:LOCAL_PORT"
# data-nodes first, hub (ui auto-update) last.
# Pure hub stacks (DEPLOY_MODE=ui) skip the API_ONLY step — no importer.
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
  "$HOME/spieli:ui auto-update:8080"
)
# ─────────────────────────────────────────────────────────────────────────────

fail() { echo "ERROR: $*" >&2; exit 1; }

for entry in "${STACKS[@]}"; do
  IFS=: read -r dir profiles port <<< "$entry"
  name=$(basename "$dir")

  echo ""
  echo "━━━ $name ━━━"

  cd "$dir" || fail "Cannot cd to $dir"

  profile_flags=()
  for p in $profiles; do
    profile_flags+=(--profile "$p")
  done

  echo "→ Pulling images..."
  # Explicitly pull each image by name to bypass the Docker daemon's manifest
  # cache, which can cause `docker compose pull` to skip a freshly-pushed tag
  # it already has locally (observed with rapid CI push + immediate upgrade run).
  docker compose config --images | sort -u | xargs -I{} docker pull {}
  docker compose pull

  echo "→ Restarting app container..."
  docker compose "${profile_flags[@]}" up -d app

  # Pure hub stacks (DEPLOY_MODE=ui) have no importer — skip importer steps.
  if [[ "$profiles" == *"data-node"* ]]; then
    echo "→ Applying api.sql (one-shot, never triggers full reimport)..."
    # Run API_ONLY=1 before restarting the daemon. The daemon only runs api.sql
    # on container startup; while it is idle between reimport cycles it won't
    # touch playground_stats. Running both concurrently races on the DROP/CREATE
    # of that materialized view and reliably fails on large datasets.
    docker compose --profile data-node-ui run --rm -e API_ONLY=1 importer
  else
    echo "→ Pure hub — no importer, skipping api.sql step."
  fi

  echo "→ Verifying..."
  sleep 3
  if [[ "$profiles" == *"data-node"* ]]; then
    meta=$(curl -sf "http://localhost:${port}/api/rpc/get_meta") \
      || fail "get_meta unreachable for $name on port $port"
    result=$(printf '%s' "$meta" | \
      python3 -c "import sys,json; d=json.load(sys.stdin); print('version:', d.get('version','?'), ' playgrounds:', d.get('playground_count','?'))")
    playground_count=$(printf '%s' "$meta" | \
      python3 -c "import sys,json; print(json.load(sys.stdin).get('playground_count', 0))")
    echo "  $result"
  else
    # Pure hub has no PostgREST — verify the app is serving HTTP instead.
    curl -sf "http://localhost:${port}/" -o /dev/null \
      || fail "App unreachable for $name on port $port"
    echo "  app responding on port ${port}"
    playground_count=-1
  fi

  if [[ "$profiles" == *"data-node"* ]]; then
    echo "→ Restarting daemon importer on new image..."
    # Restart after verify so the daemon's api.sql startup run does not race
    # with the API_ONLY=1 container above.
    docker compose "${profile_flags[@]}" up -d importer

    if [[ "$playground_count" -eq 0 ]]; then
      logfile="/tmp/${name}-reimport.log"
      echo "→ No playgrounds found — triggering forced reimport in background (log: $logfile)"
      (
        docker compose --profile data-node-ui run --rm \
          -e REIMPORT_INTERVAL_MIN_DAYS= \
          -e REIMPORT_INTERVAL_MAX_DAYS= \
          importer
      ) > "$logfile" 2>&1 &
      echo "  PID $! — check log when done: tail -f $logfile"
    fi
  fi

  echo "✓ $name done"
done

echo ""
echo "All stacks upgraded."
