#!/usr/bin/env bash
# 用法: ./app.sh build|start|stop|restart|status
set -euo pipefail
cd "$(dirname "$0")"
BIN=bin/gofollow-front
PID=bin/gofollow-front.pid
LOG=logs/gofollow-front.log
[ -f .env ] && set -a && . ./.env && set +a

# 读 pid 文件；文件不存在或内容为空都返回空串。
read_pid() {
  [ -f "$PID" ] || return 0
  cat "$PID" 2>/dev/null || true
}

alive() {
  [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null
}

start_app() {
  local p pid
  p="$(read_pid)"
  if alive "$p"; then echo "已在运行 pid=$p"; return 0; fi
  [ -x "$BIN" ] || { echo "先 ./app.sh build"; exit 1; }
  mkdir -p logs bin
  nohup "$BIN" >>"$LOG" 2>&1 &
  pid=$!
  echo "$pid" >"$PID"
  # 端口被占用之类的失败是进程起来后立刻退出，不确认一下会误报「已启动」。
  sleep 0.3
  if ! alive "$pid"; then
    rm -f "$PID"
    echo "启动失败，查看 $LOG"
    exit 1
  fi
  echo "已启动 pid=$pid 日志 $LOG"
}

stop_app() {
  local p i
  p="$(read_pid)"
  if ! alive "$p"; then
    # 残留的 pid 文件（进程早没了）直接清掉，免得 start 以为还在跑。
    rm -f "$PID"
    echo "未运行"
    return 0
  fi
  kill "$p" 2>/dev/null || true
  # 优雅关闭最多 5 秒，等它真的退出再返回，否则 restart 会撞上还没释放的端口。
  i=0
  while [ "$i" -lt 50 ] && alive "$p"; do
    sleep 0.1
    i=$((i + 1))
  done
  if alive "$p"; then
    kill -9 "$p" 2>/dev/null || true
    sleep 0.2
  fi
  rm -f "$PID"
  echo "已停止 pid=$p"
}

# 不带参数即 restart：部署后最常用的动作，省一次敲键。
case "${1:-restart}" in
  build) make build ;;
  start) start_app ;;
  stop) stop_app ;;
  restart) stop_app; start_app ;;
  status)
    p="$(read_pid)"
    if alive "$p"; then echo "运行中 pid=$p"; else echo "未运行"; fi
    ;;
  *) echo "用法: $0 [build|start|stop|restart|status]（不带参数=restart）"; exit 1 ;;
esac
