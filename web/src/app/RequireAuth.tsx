import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSession } from '@/features/auth/session'

export default function RequireAuth() {
  const session = useSession((s) => s.session)
  const location = useLocation()
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <Outlet />
}
