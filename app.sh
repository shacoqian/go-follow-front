#!/usr/bin/env bash
# 用法: ./app.sh build|start|stop|restart|status
set -euo pipefail
cd "$(dirname "$0")"
BIN=bin/gofollow-front
PID=bin/gofollow-front.pid
LOG=logs/gofollow-front.log
[ -f .env ] && set -a && . ./.env && set +a

case "${1:-}" in
  build) make build ;;
  start)
    if [ -f "$PID" ] && kill -0 "$(cat "$PID")" 2>/dev/null; then echo "已在运行 pid=$(cat "$PID")"; exit 0; fi
    [ -x "$BIN" ] || { echo "先 ./app.sh build"; exit 1; }
    mkdir -p logs
    nohup "$BIN" >>"$LOG" 2>&1 &
    echo $! >"$PID"
    echo "已启动 pid=$! 日志 $LOG"
    ;;
  stop)
    if [ -f "$PID" ]; then kill "$(cat "$PID")" 2>/dev/null || true; rm -f "$PID"; echo "已停止"; else echo "未运行"; fi
    ;;
  restart) "$0" stop; "$0" start ;;
  status)
    if [ -f "$PID" ] && kill -0 "$(cat "$PID")" 2>/dev/null; then echo "运行中 pid=$(cat "$PID")"; else echo "未运行"; fi
    ;;
  *) echo "用法: $0 build|start|stop|restart|status"; exit 1 ;;
esac
