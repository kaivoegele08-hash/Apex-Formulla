#!/bin/bash
# Führt einen Node-Test gegen die DOM-/THREE-freien Module aus (Kern, Daten, Strecke, Physik).
#   tools/run-pure.sh tests/physik/test_lap.js
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEST="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
OUT="$(mktemp --suffix=.mjs)"
trap 'rm -f "$OUT"' EXIT
cat "$ROOT/src/10_core.js" "$ROOT/src/20_data.js" "$ROOT/src/22_eras.js" "$ROOT/src/24_mods.js" "$ROOT/src/30_track.js" "$ROOT/src/40_physics.js" "$ROOT/src/45_ai.js" "$ROOT/src/46_replay.js" "$ROOT/src/47_race.js" "$ROOT/src/48_weather.js" "$ROOT/src/49_season.js" "$TEST" > "$OUT"
TESTFILE="$TEST" node "$OUT"
