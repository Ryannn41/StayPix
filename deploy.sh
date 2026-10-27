#!/usr/bin/env bash

set -Eeuo pipefail

ENV_NAME="fullstack"
REQUESTED_PORT="${STAYPIX_PORT:-}"
PORT="${REQUESTED_PORT:-3001}"
PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

info() {
  printf '\033[1;32m[StayPix]\033[0m %s\n' "$1"
}

fail() {
  printf '\033[1;31m[StayPix]\033[0m %s\n' "$1" >&2
  exit 1
}

command -v conda >/dev/null 2>&1 || fail "未找到 conda，请先确认 Conda 已安装并加入 PATH。"

CONDA_BASE="$(conda info --base)"
# shellcheck disable=SC1091
source "${CONDA_BASE}/etc/profile.d/conda.sh"

cd "${PROJECT_DIR}"

if ! conda env list | awk '{print $1}' | grep -qx "${ENV_NAME}"; then
  info "创建 Conda 环境 ${ENV_NAME}…"
  conda create -y -n "${ENV_NAME}" -c conda-forge nodejs=22
else
  info "更新 Conda 环境中的 Node.js…"
  conda install -y -n "${ENV_NAME}" -c conda-forge nodejs=22
fi

info "安装锁定版本的项目依赖…"
conda run -n "${ENV_NAME}" npm ci

if [[ ! -f "${PROJECT_DIR}/.env" ]]; then
  info "生成生产环境配置 .env…"
  cat > "${PROJECT_DIR}/.env" <<EOF
HOST=0.0.0.0
PORT=${PORT}
DATA_DIR=./data
MAX_FILE_SIZE_MB=50
EOF
else
  info "保留已有 .env 配置。"
  if [[ -n "${REQUESTED_PORT}" ]]; then
    awk -v port="${REQUESTED_PORT}" '
      BEGIN { found = 0 }
      /^PORT=/ { print "PORT=" port; found = 1; next }
      { print }
      END { if (!found) print "PORT=" port }
    ' "${PROJECT_DIR}/.env" > "${PROJECT_DIR}/.env.tmp"
    mv "${PROJECT_DIR}/.env.tmp" "${PROJECT_DIR}/.env"
  else
    CONFIGURED_PORT="$(awk -F= '/^PORT=/{print $2; exit}' "${PROJECT_DIR}/.env")"
    PORT="${CONFIGURED_PORT:-3001}"
  fi
fi

mkdir -p "${PROJECT_DIR}/data/originals"

info "构建生产版本…"
conda run -n "${ENV_NAME}" npm run build

printf '\n'
info "环境、依赖和生产构建已准备完成，脚本没有启动服务。"
printf '\n你可以自行进入 tmux 后运行：\n'
printf '  cd %q\n' "${PROJECT_DIR}"
printf '  conda activate %s\n' "${ENV_NAME}"
printf '  npm run start -w @staypix/server\n'
printf '\n请确认阿里云安全组已放行 TCP 端口 %s。\n' "${PORT}"
