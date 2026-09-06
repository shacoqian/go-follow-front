import { useQuery } from '@tanstack/react-query'
import { adminApi, type AdminUser, type Overview } from '@/api/admin'

export const adminKeys = {
  overview: ['admin', 'overview'] as const,
  users: ['admin', 'users'] as const,
  list: (kind: string, owner: string) => ['admin', kind, owner] as const,
  audit: (owner: string, action: string, limit: number) => ['admin', 'audit', owner, action, limit] as const,
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
