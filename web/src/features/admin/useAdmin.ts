import { useQuery } from '@tanstack/react-query'
import {
  adminApi,
  type AdminUser,
  type ExecStatus,
  type FomoBoard,
  type FomoQuery,
  type Operator,
  type Overview,
} from '@/api/admin'

export const adminKeys = {
  overview: ['admin', 'overview'] as const,
  users: ['admin', 'users'] as const,
  list: (kind: string, owner: string) => ['admin', kind, owner] as const,
  audit: (owner: string, action: string, limit: number) => ['admin', 'audit', owner, action, limit] as const,
  operators: ['admin', 'operators'] as const,
  execStatus: ['admin', 'exec-status'] as const,
  traderScan: (q: FomoQuery) => ['admin', 'trader-scan', q] as const,
}

/**
 * useTraderScan 取 FOMO 榜。
 *
 * 不自动轮询（其它 admin 钩子都是 10 秒一轮）：这份数据由人手动跑批产出，
 * 一次跑批 100 分钟，轮询除了白打请求没有任何意义。
 */
export function useTraderScan(q: FomoQuery) {
  return useQuery<FomoBoard>({
    queryKey: adminKeys.traderScan(q),
    queryFn: () => adminApi.traderScan(q),
    meta: { silent: true },
  })
}

export function useOverview() {
  return useQuery<Overview>({
    queryKey: adminKeys.overview,
    queryFn: adminApi.overview,
    refetchInterval: 10_000,
    meta: { silent: true },
  })
}

export function useAdminUsers() {
  return useQuery<AdminUser[]>({
    queryKey: adminKeys.users,
    queryFn: adminApi.users,
    refetchInterval: 10_000,
    meta: { silent: true },
  })
}

export function useOperators() {
  return useQuery<Operator[]>({
    queryKey: adminKeys.operators,
    queryFn: adminApi.operators,
    refetchInterval: 10_000,
    meta: { silent: true },
  })
}

export function useExecStatus() {
  return useQuery<ExecStatus>({
    queryKey: adminKeys.execStatus,
    queryFn: adminApi.execStatus,
    refetchInterval: 10_000,
    meta: { silent: true },
  })
}
