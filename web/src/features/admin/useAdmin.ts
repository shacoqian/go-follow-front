import { useQuery } from '@tanstack/react-query'
import { adminApi, type AdminUser, type ExecStatus, type Operator, type Overview } from '@/api/admin'

export const adminKeys = {
  overview: ['admin', 'overview'] as const,
  users: ['admin', 'users'] as const,
  list: (kind: string, owner: string) => ['admin', kind, owner] as const,
  audit: (owner: string, action: string, limit: number) => ['admin', 'audit', owner, action, limit] as const,
  operators: ['admin', 'operators'] as const,
  execStatus: ['admin', 'exec-status'] as const,
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
