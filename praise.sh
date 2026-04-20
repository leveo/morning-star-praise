#!/usr/bin/env bash
# Kill any existing backend (:8000) / frontend (:5173) dev servers and
# restart both. Logs stream to ./.dev-logs/{backend,frontend}.log and
# both processes are tailed in the foreground — Ctrl+C stops everything.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

LOG_DIR="$ROOT/.dev-logs"
mkdir -p "$LOG_DIR"

kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti:"$port" 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "→ killing pid(s) on :$port: $pids"
    kill -9 $pids 2>/dev/null || true
  fi
}

# Homebrew installs versioned binaries like ``pg_isready-18`` without
# symlinking a plain ``pg_isready``. Resolve whichever exists.
resolve_pg_isready() {
  if command -v pg_isready >/dev/null 2>&1; then
    echo "pg_isready"
    return 0
  fi
  local bin
  for bin in /opt/homebrew/bin/pg_isready-* /usr/local/bin/pg_isready-*; do
    [[ -x "$bin" ]] && { echo "$bin"; return 0; }
  done
  return 1
}

ensure_postgres() {
  local pg_bin
  if ! pg_bin="$(resolve_pg_isready)"; then
    echo "→ postgres: no pg_isready on PATH — Songs Library / Templates will be disabled"
    return
  fi
  if "$pg_bin" -h localhost -q 2>/dev/null; then
    echo "→ postgres: already running"
    return
  fi
  echo "→ postgres: not running, attempting to start"
  if command -v brew >/dev/null 2>&1; then
    local formula
    formula="$(brew list --formula 2>/dev/null | grep -E '^postgresql(@[0-9]+)?$' | head -1 || true)"
    if [[ -n "$formula" ]]; then
      brew services start "$formula" >/dev/null 2>&1 || true
    fi
  elif command -v systemctl >/dev/null 2>&1; then
    sudo systemctl start postgresql >/dev/null 2>&1 || true
  fi
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if "$pg_bin" -h localhost -q 2>/dev/null; then
      echo "→ postgres: up after ${i}s"
      return
    fi
    sleep 1
  done
  echo "→ postgres: failed to start within 10s — continuing without it"
}

cleanup() {
  echo
  echo "→ stopping dev servers"
  [[ -n "${BACKEND_PID:-}" ]] && kill "$BACKEND_PID" 2>/dev/null || true
  [[ -n "${FRONTEND_PID:-}" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
  kill_port 8000
  kill_port 5173
  exit 0
}
trap cleanup INT TERM

kill_port 8000
kill_port 5173
ensure_postgres

echo "→ starting backend on :8000 (logs: $LOG_DIR/backend.log)"
(cd "$ROOT/backend" && python run.py) >"$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!

echo "→ starting frontend on :5173 (logs: $LOG_DIR/frontend.log)"
(cd "$ROOT/frontend" && npm run dev) >"$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!

echo
echo "backend  pid=$BACKEND_PID  http://localhost:8000"
echo "frontend pid=$FRONTEND_PID  http://localhost:5173"
echo
echo "tailing logs — Ctrl+C to stop both"
echo "---"
tail -n +1 -F "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log"
