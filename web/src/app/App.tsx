import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import LoginPage from '@/features/auth/LoginPage'
import { Toaster } from '@/components/ui/toast'
import Placeholder from './Placeholder'
import RequireAdmin from './RequireAdmin'
import RequireAuth from './RequireAuth'
import Shell from './Shell'
import { queryClient } from './queryClient'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Shell />}>
          <Route index element={<Navigate to="/wallets" replace />} />
          <Route path="/wallets" element={<Placeholder title="钱包" />} />
          <Route path="/targets" element={<Placeholder title="目标" />} />
          <Route path="/tasks" element={<Placeholder title="跟单" />} />
          <Route path="/positions" element={<Placeholder title="仓位" />} />
          <Route path="/decisions" element={<Placeholder title="决策" />} />
          <Route path="/signals" element={<Placeholder title="信号" />} />
          <Route element={<RequireAdmin />}>
            <Route path="/admin/overview" element={<Placeholder title="总览" />} />
            <Route path="/admin/users" element={<Placeholder title="用户" />} />
            <Route path="/admin/data" element={<Placeholder title="全站数据" />} />
            <Route path="/admin/audit" element={<Placeholder title="审计" />} />
          </Route>
          <Route path="*" element={<Navigate to="/wallets" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes />
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  )
}
