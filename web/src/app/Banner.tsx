import { useQuery } from '@tanstack/react-query'
import { healthApi } from '@/api/health'

// /health 是公开接口；10 秒轮询，出错不弹（onError 已在 queryClient 统一处理为 toast，这里用 meta 跳过）。
export default function Banner() {
  const { data } = useQuery({ queryKey: ['health'], queryFn: healthApi.get, refetchInterval: 10_000, meta: { silent: true } })
  if (!data) return null
  return (
    <>
      {data.kill_switch && <div className="bg-red-600 px-4 py-2 text-center text-sm font-medium text-white">已全局停止跟单</div>}
      {data.dry_run && <div className="bg-amber-400 px-4 py-2 text-center text-sm font-medium text-amber-950">模拟运行中（dry-run）</div>}
    </>
  )
}
