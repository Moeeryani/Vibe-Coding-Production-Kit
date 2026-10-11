#!/usr/bin/env bash
# Single canonical entrypoint for the Stage14 Windows/NTFS campaign on frozen SHA d6be7420.
# Evidence and scratch live OUTSIDE the clone so the frozen tree stays provably pristine.
# Deliberately no `set -e`: every gate must run and be reported, red or green.

REPO="/d/vcp-stage14-d6be7420-win"
EVID="/d/vcp-stage14-evidence"
LOGS="$EVID/logs-d6be7420"

export TEMP="D:\\vcp-stage14-tmp"
export TMP="D:\\vcp-stage14-tmp"
export npm_config_cache="D:\\vcp-stage14-npmcache"

mkdir -p "$LOGS"
SUMMARY="$LOGS/GATE-SUMMARY.txt"
: > "$SUMMARY"

{
  echo "campaign=stage14-windows-d6be7420"
  echo "started_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "host_platform=$(node -p 'process.platform + " " + process.arch')"
  echo "node_version=$(node -v)"
  echo "npm_version=$(npm -v)"
  echo "git_version=$(git --version)"
  echo "TEMP=$TEMP"
  echo "TMP=$TMP"
  echo "npm_config_cache=$npm_config_cache"
  echo "os_tmpdir_as_seen_by_node=$(node -p 'require("os").tmpdir()')"
} >> "$SUMMARY"

run() {
  local name="$1"; shift
  local log="$LOGS/$name.log"
  local start end secs rc
  start=$(date +%s)
  echo "----- BEGIN $name :: $* -----" > "$log"
  ( cd "$REPO" && "$@" ) >> "$log" 2>&1
  rc=$?
  end=$(date +%s)
  secs=$((end - start))
  echo "----- END $name exit=$rc elapsed=${secs}s -----" >> "$log"
  printf '%-28s exit=%-3s elapsed=%ss\n' "$name" "$rc" "$secs" >> "$SUMMARY"
  echo "[$name] exit=$rc elapsed=${secs}s"
}

# Integrity re-check immediately before execution.
run "00-integrity" git rev-parse HEAD
{
  echo "head=$(cd "$REPO" && git rev-parse HEAD)"
  echo "tree=$(cd "$REPO" && git rev-parse 'HEAD^{tree}')"
  echo "status_porcelain_lines=$(cd "$REPO" && git status --porcelain | wc -l)"
} >> "$SUMMARY"

run "01-npm-ci" npm ci
run "02-validate-framework" node scripts/validate-framework.mjs
run "03-check-syntax" npm run check
run "04-stage12-contract" npm run check:stage12-contract
run "05-stage13-contract" npm run check:stage13-contract
run "06-stage14-contract" npm run check:stage14-contract
run "07-doctor" npm run doctor
run "08-test-cli" npm run test:cli
run "09-test-stage13" npm run test:stage13
run "10-test-stage14" npm run test:stage14
run "11-test-full" npm test

# bsdtar (System32) must win over Git's GNU tar, which cannot read native Windows paths.
run "12-pack-check" env PATH="/c/Windows/System32:$PATH" npm run pack:check
run "13-validate-composite" npm run validate

# Post-execution integrity: the campaign must not have dirtied the frozen tree.
{
  echo "post_head=$(cd "$REPO" && git rev-parse HEAD)"
  echo "post_status_porcelain_lines=$(cd "$REPO" && git status --porcelain | wc -l)"
  echo "post_status_detail<<$(cd "$REPO" && git status --porcelain | head -20)>>"
  echo "finished_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} >> "$SUMMARY"

echo "=== SUMMARY ==="
cat "$SUMMARY"
