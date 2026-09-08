#!/bin/sh
#
# 就地部署：拉源码 → 构建前端与内嵌二进制 → copy 运行所需文件到当前目录。
# 运行目录只需要有本脚本。.env 是每机一份的运行参数，不在 git 里，缺失时从示例生成后再改。
#   SRC_DIR 源码路径，默认 /opt/src/go-follow-front；BRANCH 默认 main；SKIP_PULL=1 跳过 git pull
#
WORK_DIR=$(pwd)
SRC_DIR=${SRC_DIR:-/home/chain-bridge/go-follow-front}
BRANCH=${BRANCH:-main}
set -e

cd "$SRC_DIR"
[ "${SKIP_PULL:-0}" = 1 ] || { git checkout "$BRANCH"; git pull; }
(cd web && npm ci --silent && npm run build --silent)
go build -tags embeddist -o gofollow-front ./cmd/gofollow-front

# 二进制必须先落临时名再 mv：进程跑着时直接 cp 覆盖会报 "Text file busy"（Linux 不允许写
# 正在执行的文件，但允许 rename 顶掉它，旧 inode 由运行中的进程继续持有）。所以本脚本可以
# 在服务运行时安全执行，不需要先停服。后端 build.sh 2026-09-08 踩过这个坑。
mkdir -p "$WORK_DIR/bin"
cp gofollow-front "$WORK_DIR/bin/gofollow-front.new"
cp app.sh         "$WORK_DIR/app.sh.new"      # 运维脚本随包同步
cp build.sh       "$WORK_DIR/build.sh.new"    # 脚本自身也同步，省得运行目录留旧副本
cp .env.example   "$WORK_DIR/"
mv "$WORK_DIR/bin/gofollow-front.new" "$WORK_DIR/bin/gofollow-front"
mv "$WORK_DIR/app.sh.new"   "$WORK_DIR/app.sh"
mv "$WORK_DIR/build.sh.new" "$WORK_DIR/build.sh"
chmod +x "$WORK_DIR/app.sh" "$WORK_DIR/build.sh" "$WORK_DIR/bin/gofollow-front"
[ -f "$WORK_DIR/.env" ] || { cp .env.example "$WORK_DIR/.env"; echo "已生成 .env，请改 LISTEN / GOFOLLOW_URL 后再启动"; }

echo "构建完成（$(git rev-parse --short HEAD)），运行目录已更新：$WORK_DIR；启动 ./app.sh restart"
