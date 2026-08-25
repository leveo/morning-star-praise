#!/usr/bin/env bash
# Manage Morning Star Praise as persistent macOS user services.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
PYTHON_BIN="$BACKEND_DIR/.venv/bin/python"
NPM_BIN="$(command -v npm 2>/dev/null || true)"
USER_DOMAIN="gui/$(id -u)"
AGENT_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$ROOT/.service-logs"
BACKEND_LABEL="com.morning-star-praise.backend"
FRONTEND_LABEL="com.morning-star-praise.frontend"
BACKEND_PLIST="$AGENT_DIR/$BACKEND_LABEL.plist"
FRONTEND_PLIST="$AGENT_DIR/$FRONTEND_LABEL.plist"
SERVICE_PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

usage() {
  cat <<'EOF'
Usage: ./scripts/morning-star-service.sh COMMAND

Commands:
  install    Build the frontend, install LaunchAgents, and start both services
  start      Start installed services
  stop       Stop services without removing their configuration
  restart    Restart both services
  status     Show launchd and HTTP health status
  logs       Follow backend and frontend service logs
  uninstall  Stop services and remove their LaunchAgent configuration
EOF
}

require_runtime() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "This persistent-service installer currently supports macOS only." >&2
    exit 1
  fi
  if [[ ! -x "$PYTHON_BIN" ]]; then
    echo "Backend virtual environment not found: $PYTHON_BIN" >&2
    exit 1
  fi
  if [[ -z "$NPM_BIN" || ! -x "$NPM_BIN" ]]; then
    echo "npm was not found. Install Node.js before installing the service." >&2
    exit 1
  fi
}

is_loaded() {
  launchctl print "$USER_DOMAIN/$1" >/dev/null 2>&1
}

bootout_if_loaded() {
  local label="$1"
  if is_loaded "$label"; then
    launchctl bootout "$USER_DOMAIN/$label" >/dev/null
  fi
}

write_plist() {
  local output="$1"
  local label="$2"
  local work_dir="$3"
  local stdout_log="$4"
  local stderr_log="$5"
  shift 5

  "$PYTHON_BIN" - "$output" "$label" "$work_dir" "$stdout_log" "$stderr_log" "$SERVICE_PATH" "$@" <<'PY'
import plistlib
import sys

output, label, work_dir, stdout_log, stderr_log, service_path, *args = sys.argv[1:]
payload = {
    "Label": label,
    "ProgramArguments": args,
    "WorkingDirectory": work_dir,
    "RunAtLoad": True,
    "KeepAlive": True,
    "ThrottleInterval": 5,
    "ProcessType": "Interactive",
    "StandardOutPath": stdout_log,
    "StandardErrorPath": stderr_log,
    "EnvironmentVariables": {
        "PATH": service_path,
        "PYTHONUNBUFFERED": "1",
        "LANG": "en_US.UTF-8",
        "FRONTEND_URL": "http://localhost:5173",
    },
}
with open(output, "wb") as handle:
    plistlib.dump(payload, handle, fmt=plistlib.FMT_XML, sort_keys=False)
PY
}

load_agent() {
  local label="$1"
  local plist="$2"
  if ! is_loaded "$label"; then
    launchctl bootstrap "$USER_DOMAIN" "$plist"
  fi
}

stop_port_listener() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "Stopping previous process on port $port: $pids"
    kill $pids 2>/dev/null || true
    sleep 1
  fi
}

install_services() {
  require_runtime
  mkdir -p "$AGENT_DIR" "$LOG_DIR"

  echo "Building frontend..."
  (cd "$FRONTEND_DIR" && "$NPM_BIN" run build)

  write_plist \
    "$BACKEND_PLIST" \
    "$BACKEND_LABEL" \
    "$BACKEND_DIR" \
    "$LOG_DIR/backend.log" \
    "$LOG_DIR/backend.error.log" \
    "$PYTHON_BIN" -m uvicorn app.main:app --host 127.0.0.1 --port 8000

  write_plist \
    "$FRONTEND_PLIST" \
    "$FRONTEND_LABEL" \
    "$FRONTEND_DIR" \
    "$LOG_DIR/frontend.log" \
    "$LOG_DIR/frontend.error.log" \
    "$NPM_BIN" run preview -- --host 127.0.0.1 --port 5173 --strictPort

  bootout_if_loaded "$BACKEND_LABEL"
  bootout_if_loaded "$FRONTEND_LABEL"
  stop_port_listener 8000
  stop_port_listener 5173
  load_agent "$BACKEND_LABEL" "$BACKEND_PLIST"
  load_agent "$FRONTEND_LABEL" "$FRONTEND_PLIST"

  echo
  echo "Morning Star Praise is installed and will start automatically after login."
  echo "Open: http://localhost:5173"
  echo "Status: $0 status"
  echo "Logs:   $0 logs"
}

start_services() {
  require_runtime
  if [[ ! -f "$BACKEND_PLIST" || ! -f "$FRONTEND_PLIST" ]]; then
    echo "Services are not installed. Run: $0 install" >&2
    exit 1
  fi
  load_agent "$BACKEND_LABEL" "$BACKEND_PLIST"
  load_agent "$FRONTEND_LABEL" "$FRONTEND_PLIST"
  launchctl kickstart "$USER_DOMAIN/$BACKEND_LABEL"
  launchctl kickstart "$USER_DOMAIN/$FRONTEND_LABEL"
  echo "Morning Star Praise started: http://localhost:5173"
}

stop_services() {
  bootout_if_loaded "$BACKEND_LABEL"
  bootout_if_loaded "$FRONTEND_LABEL"
  echo "Morning Star Praise stopped."
}

restart_services() {
  require_runtime
  if [[ ! -f "$BACKEND_PLIST" || ! -f "$FRONTEND_PLIST" ]]; then
    echo "Services are not installed. Run: $0 install" >&2
    exit 1
  fi
  echo "Rebuilding frontend..."
  (cd "$FRONTEND_DIR" && "$NPM_BIN" run build)
  if is_loaded "$BACKEND_LABEL"; then
    launchctl kickstart -k "$USER_DOMAIN/$BACKEND_LABEL"
  else
    load_agent "$BACKEND_LABEL" "$BACKEND_PLIST"
  fi
  if is_loaded "$FRONTEND_LABEL"; then
    launchctl kickstart -k "$USER_DOMAIN/$FRONTEND_LABEL"
  else
    load_agent "$FRONTEND_LABEL" "$FRONTEND_PLIST"
  fi
  echo "Morning Star Praise restarted: http://localhost:5173"
}

print_agent_status() {
  local label="$1"
  local name="$2"
  if is_loaded "$label"; then
    local summary
    summary="$(launchctl print "$USER_DOMAIN/$label" | awk '
      /^[[:space:]]+state =/ && state == "" { state = $3 }
      /^[[:space:]]+pid =/ && pid == "" { pid = $3 }
      /^[[:space:]]+last exit code =/ && exit_code == "" {
        exit_code = $0
        sub(/^[[:space:]]+last exit code = /, "", exit_code)
      }
      END {
        printf "state=%s", state
        if (pid != "") printf ", pid=%s", pid
        if (exit_code != "") printf ", last-exit=%s", exit_code
      }
    ')"
    echo "$name: loaded${summary:+ ($summary)}"
  else
    echo "$name: stopped"
  fi
}

status_services() {
  print_agent_status "$BACKEND_LABEL" "Backend"
  print_agent_status "$FRONTEND_LABEL" "Frontend"

  if curl -fsS --max-time 3 http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
    echo "Backend HTTP: healthy"
  else
    echo "Backend HTTP: unavailable"
  fi
  if curl -fsS --max-time 3 http://127.0.0.1:5173/ >/dev/null 2>&1; then
    echo "Frontend HTTP: healthy"
  else
    echo "Frontend HTTP: unavailable"
  fi
}

follow_logs() {
  mkdir -p "$LOG_DIR"
  touch \
    "$LOG_DIR/backend.log" \
    "$LOG_DIR/backend.error.log" \
    "$LOG_DIR/frontend.log" \
    "$LOG_DIR/frontend.error.log"
  tail -n 100 -F \
    "$LOG_DIR/backend.log" \
    "$LOG_DIR/backend.error.log" \
    "$LOG_DIR/frontend.log" \
    "$LOG_DIR/frontend.error.log"
}

uninstall_services() {
  stop_services
  rm -f "$BACKEND_PLIST" "$FRONTEND_PLIST"
  echo "LaunchAgent configuration removed. Generated logs were kept in $LOG_DIR."
}

case "${1:-}" in
  install) install_services ;;
  start) start_services ;;
  stop) stop_services ;;
  restart) restart_services ;;
  status) status_services ;;
  logs) follow_logs ;;
  uninstall) uninstall_services ;;
  *) usage; exit 1 ;;
esac
