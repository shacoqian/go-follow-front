import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useSession } from '@/features/auth/session'
import { logout, refreshMe, watchAccountChanges } from '@/features/auth/auth'
import { waitForOkx } from '@/wallets/okx'
import { shortAddress } from '@/lib/format'
import { cn } from '@/lib/cn'
import Banner from './Banner'

const userNav = [
  { to: '/wallets', label: '钱包' },
  { to: '/targets', label: '目标' },
  { to: '/tasks', label: '跟单' },
  { to: '/positions', label: '仓位' },
  { to: '/decisions', label: '决策' },
  { to: '/signals', label: '信号' },
]
const adminNav = [
  { to: '/admin/overview', label: '总览' },
  { to: '/admin/users', label: '用户' },
  { to: '/admin/data', label: '全站数据' },
  { to: '/admin/audit', label: '审计' },
]

function Nav({ items }: { items: { to: string; label: string }[] }) {
  return (
    <ul className="space-y-1">
      {items.map((i) => (
        <li key={i.to}>
          <NavLink
            to={i.to}
            className={({ isActive }) =>
              cn('block rounded-md px-3 py-2 text-sm hover:bg-slate-100', isActive && 'bg-slate-200 font-medium')
            }
          >
            {i.label}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}

export default function Shell() {
  const session = useSession((s) => s.session)
  useEffect(() => {
    void refreshMe()
    // OKX 是异步注入的，首屏同步调用 watchAccountChanges 往往等不到 provider，
    // 切换账号的登出保护就永远装不上——先等注入再挂监听。
    let off = () => {}
    let cancelled = false
    void waitForOkx().then((ok) => {
      if (ok && !cancelled) off = watchAccountChanges()
    })
    return () => {
      cancelled = true
      off()
    }
  }, [])
  return (
    <div className="flex min-h-screen">
      <aside className="w-52 shrink-0 border-r border-slate-200 bg-white p-4">
        <div className="mb-6 text-lg font-semibold">go-follow</div>
        <Nav items={userNav} />
        {session?.role === 'admin' && (
          <div className="mt-6">
            <div className="mb-1 px-3 text-xs uppercase text-slate-400">管理</div>
            <Nav items={adminNav} />
          </div>
        )}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Banner />
        <header className="flex items-center justify-end gap-3 border-b border-slate-200 bg-white px-6 py-3">
          <span className="font-mono text-sm text-slate-600">{session ? shortAddress(session.address) : ''}</span>
          <Button variant="outline" size="sm" onClick={() => void logout()}>
            登出
          </Button>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
