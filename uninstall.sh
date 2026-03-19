#!/usr/bin/env bash
set -Eeuo pipefail

WIREGATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_FILE="/etc/systemd/system/wiregate.service"
SUDOERS_FILE="/etc/sudoers.d/wiregate"
ENV_FILE="${WIREGATE_DIR}/.env"
DATA_DIR="${WIREGATE_DIR}/backend/data"
BACKEND_NODE_MODULES="${WIREGATE_DIR}/backend/node_modules"
FRONTEND_NODE_MODULES="${WIREGATE_DIR}/frontend/node_modules"
FRONTEND_DIST="${WIREGATE_DIR}/frontend/dist"
REMOVE_WIREGUARD="${REMOVE_WIREGUARD:-true}"

print_banner() {
  echo "======================================"
  echo "          WireGate Uninstall          "
  echo "======================================"
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "This uninstall script must run as root."
    exit 1
  fi
}

read_env_value() {
  local key="$1"

  if [[ ! -f "${ENV_FILE}" ]]; then
    return 0
  fi

  grep -E "^${key}=" "${ENV_FILE}" | tail -n 1 | cut -d '=' -f 2-
}

stop_wiregate_service() {
  if systemctl list-unit-files | grep -q '^wiregate.service'; then
    echo "Stopping wiregate.service..."
    systemctl stop wiregate || true
    systemctl disable wiregate || true
  fi
}

remove_wiregate_service() {
  if [[ -f "${SERVICE_FILE}" ]]; then
    echo "Removing wiregate.service..."
    rm -f "${SERVICE_FILE}"
    systemctl daemon-reload
  fi
}

remove_sudoers_rule() {
  if [[ -f "${SUDOERS_FILE}" ]]; then
    echo "Removing WireGate sudoers rule..."
    rm -f "${SUDOERS_FILE}"
  fi
}

remove_generated_files() {
  echo "Removing generated WireGate files..."
  rm -rf "${BACKEND_NODE_MODULES}"
  rm -rf "${FRONTEND_NODE_MODULES}"
  rm -rf "${FRONTEND_DIST}"
  rm -rf "${DATA_DIR}"
  rm -f "${ENV_FILE}"
}

remove_wireguard_state() {
  local iface
  iface="$(read_env_value WG_INTERFACE)"
  iface="${iface:-wg0}"

  if [[ "${REMOVE_WIREGUARD,,}" != "true" ]]; then
    echo "Keeping WireGuard interface files because REMOVE_WIREGUARD=${REMOVE_WIREGUARD}."
    return
  fi

  if systemctl list-unit-files | grep -q "^wg-quick@${iface}.service"; then
    echo "Stopping wg-quick@${iface}.service..."
    systemctl stop "wg-quick@${iface}" || true
    systemctl disable "wg-quick@${iface}" || true
  fi

  echo "Removing /etc/wireguard/${iface}.conf and key files..."
  rm -f "/etc/wireguard/${iface}.conf"
  rm -f "/etc/wireguard/${iface}.key"
  rm -f "/etc/wireguard/${iface}.pub"
}

print_summary() {
  echo
  echo "WireGate has been removed from this server."
  echo "The repository files are still in: ${WIREGATE_DIR}"
  echo "To install again, run: sudo ./install.sh"
}

print_banner
require_root
stop_wiregate_service
remove_wiregate_service
remove_sudoers_rule
remove_generated_files
remove_wireguard_state
print_summary
