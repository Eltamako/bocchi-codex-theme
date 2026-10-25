#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
NODE="./engine/node-darwin-arm64"
if [[ ! -x "$NODE" ]]; then
  NODE="$(command -v node || true)"
fi
if [[ -z "$NODE" ]]; then
  echo "缺少 Node.js 24+。请下载含运行环境的 macOS 完整包，或自行安装 Node.js 24。"
  read -r -p "按回车关闭…" _
  exit 1
fi
result=0
"$NODE" macos/launcher.mjs resume || result=$?
echo
read -r -p "按回车关闭…" _
exit "$result"
