import { Navigate, Outlet } from 'react-router-dom'
import { useSession } from '@/features/auth/session'

export default function RequireAdmin() {
  const role = useSession((s) => s.session?.role)
  if (role !== 'admin') return <Navigate to="/wallets" replace />
  return <Outlet />
}
