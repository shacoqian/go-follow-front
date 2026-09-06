import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import { toast } from '@/components/ui/toast'

// 401 不弹：client 已清会话，路由守卫会把人送回登录页，再弹一条只是噪音。
function report(err: unknown) {
  if (err instanceof ApiError && err.status === 401) return
  toast.error(err instanceof Error ? err.message : '请求失败')
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    // meta.silent 的查询（如 /health 轮询）失败不弹。
    queryCache: new QueryCache({ onError: (err, query) => { if (!query.meta?.silent) report(err) } }),
    mutationCache: new MutationCache({ onError: report }),
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true, staleTime: 5_000 } },
  })
}
