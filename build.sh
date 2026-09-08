#!/bin/bash
#
# 就地部署（在运行目录执行）：拉源码 → npm ci + vite build → go build（内嵌 dist）→ 同步到当前目录。
#   SRC_DIR   源码 checkout 路径，默认 /home/chain-bridge/go-follow-front
#   BRANCH    分支，默认 main
#   SKIP_PULL=1 不拉代码
# 同步内容：bin/gofollow-front、app.sh、.env.example、web/.env.example。
# 绝不覆盖：.env（LISTEN/GOFOLLOW_URL）、web/.env（VITE_* 构建期变量在源码目录里读）、logs/。
set -euo pipefail
WORK_DIR=$(pwd)
SRC_DIR="${SRC_DIR:-/home/chain-bridge/go-follow-front}"
BRANCH="${BRANCH:-main}"

[ -d "$SRC_DIR/.git" ] || { echo "源码目录不存在或不是 git 仓库: $SRC_DIR（用 SRC_DIR=... 指定）"; exit 1; }
cd "$SRC_DIR"
if [ "${SKIP_PULL:-0}" != "1" ]; then
  git checkout -q "$BRANCH"
  git pull -q
fi
REV=$(git rev-parse --short HEAD)
echo "构建 $BRANCH@$REV ..."
# 构建期变量（VITE_EXPLORER_BASE 等）从源码目录的 web/.env 读；没有就用运行目录的 web/.env（若存在）。
if [ ! -f web/.env ] && [ -f "$WORK_DIR/web/.env" ]; then cp "$WORK_DIR/web/.env" web/.env; fi
(cd web && npm ci --silent && npm run build --silent)
go build -tags embeddist -o "$WORK_DIR/bin/gofollow-front.new" ./cmd/gofollow-front
mkdir -p "$WORK_DIR/bin" "$WORK_DIR/logs"
mv -f "$WORK_DIR/bin/gofollow-front.new" "$WORK_DIR/bin/gofollow-front"
cp app.sh "$WORK_DIR/app.sh"; chmod +x "$WORK_DIR/app.sh"
[ -f .env.example ] && cp .env.example "$WORK_DIR/.env.example"
mkdir -p "$WORK_DIR/web"; [ -f web/.env.example ] && cp web/.env.example "$WORK_DIR/web/.env.example"
[ -f "$WORK_DIR/.env" ] || echo "提示：$WORK_DIR/.env 不存在，请从 .env.example 复制并填写 LISTEN / GOFOLLOW_URL"
echo "构建完成（$REV），运行目录已更新：$WORK_DIR；重启用 ./app.sh restart"
