#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${INJETAFLOW_PROJECT_DIR:-$HOME/Projetos/injetaflow-erp}"
PORT="${INJETAFLOW_PORT:-3000}"
URL="http://127.0.0.1:${PORT}"
LOG_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/injetaflow"
LOG_FILE="$LOG_DIR/dev-server.log"

mkdir -p "$LOG_DIR"

if [[ ! -d "$PROJECT_DIR" ]]; then
  if command -v notify-send >/dev/null 2>&1; then
    notify-send "InjetaFlow ERP" "Pasta não encontrada: $PROJECT_DIR"
  fi
  printf 'Pasta do projeto não encontrada: %s\n' "$PROJECT_DIR" >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v notify-send >/dev/null 2>&1; then
    notify-send "InjetaFlow ERP" "pnpm não está instalado. Instale Node.js e pnpm primeiro."
  fi
  printf 'pnpm não encontrado.\n' >&2
  exit 1
fi

if [[ ! -d "$PROJECT_DIR/node_modules" ]]; then
  (cd "$PROJECT_DIR" && pnpm install --frozen-lockfile) >>"$LOG_FILE" 2>&1
fi

if ! curl -fsS "$URL" >/dev/null 2>&1; then
  nohup bash -lc "cd '$PROJECT_DIR' && pnpm dev" >>"$LOG_FILE" 2>&1 &
  for _ in {1..30}; do
    if curl -fsS "$URL" >/dev/null 2>&1; then break; fi
    sleep 1
  done
fi

if ! curl -fsS "$URL" >/dev/null 2>&1; then
  if command -v notify-send >/dev/null 2>&1; then
    notify-send "InjetaFlow ERP" "O servidor não iniciou. Consulte: $LOG_FILE"
  fi
  printf 'O servidor não iniciou. Consulte: %s\n' "$LOG_FILE" >&2
  exit 1
fi

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 &
else
  printf 'Abra no navegador: %s\n' "$URL"
fi
