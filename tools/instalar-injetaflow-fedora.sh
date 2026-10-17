#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="$HOME/.local/bin"
APPS_DIR="$HOME/.local/share/applications"

mkdir -p "$BIN_DIR" "$APPS_DIR"
cp "$REPO_DIR/tools/injetaflow-launcher.sh" "$BIN_DIR/injetaflow-launcher"
cp "$REPO_DIR/tools/Instalação-InjetaFlow.desktop" "$APPS_DIR/injetaflow.desktop"
chmod +x "$BIN_DIR/injetaflow-launcher" "$APPS_DIR/injetaflow.desktop"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APPS_DIR" >/dev/null 2>&1 || true
fi

printf 'Instalado. Procure por “InjetaFlow ERP” no menu de aplicativos.\n'
printf 'Pasta esperada do projeto: %s\n' "${INJETAFLOW_PROJECT_DIR:-$HOME/Projetos/injetaflow-erp}"
