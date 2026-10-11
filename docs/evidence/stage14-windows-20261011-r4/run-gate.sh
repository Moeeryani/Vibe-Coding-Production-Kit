#!/usr/bin/env bash
# Stage14 R4 gate runner — logs each command with exit code and duration.
export TMP=/d/vcp-r4-tmp TEMP=/d/vcp-r4-tmp npm_config_cache=/d/vcp-r4-npm-cache
LOGDIR=/d/vcp-r4-evidence-raw/logs
mkdir -p "$LOGDIR"
cd /d/vcp-stage14-r4 || exit 99
name="$1"; shift
log="$LOGDIR/$name.log"
{
  echo "=== GATE: $name ==="
  echo "=== CMD: $* ==="
  echo "=== CWD: $(pwd) ==="
  echo "=== START: $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
} > "$log"
start=$SECONDS
"$@" >> "$log" 2>&1
code=$?
dur=$((SECONDS - start))
{
  echo "=== END: $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  echo "=== DURATION_SECONDS: $dur ==="
  echo "=== EXIT_CODE: $code ==="
} >> "$log"
echo "$name exit=$code duration=${dur}s" >> "$LOGDIR/_summary.txt"
echo "$name exit=$code duration=${dur}s"
