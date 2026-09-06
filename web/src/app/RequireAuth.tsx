import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { clearSession, sessionValid, useSession } from '@/features/auth/session'

export default function RequireAuth() {
  const session = useSession((s) => s.session)
  const location = useLocation()
  if (!sessionValid(session)) {
    // 过期的会话先清掉，否则导航栏还会显示地址、请求还会带上死 token。
    if (session) clearSession()
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}
