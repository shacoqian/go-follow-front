import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import LoginPage from '@/features/auth/LoginPage'
import WalletsPage from '@/features/wallets/WalletsPage'
import TargetsPage from '@/features/targets/TargetsPage'
import TasksPage from '@/features/tasks/TasksPage'
import TaskFormPage from '@/features/tasks/TaskFormPage'
import TaskEditPage from '@/features/tasks/TaskEditPage'
import BlacklistPage from '@/features/blacklist/BlacklistPage'
import PositionsPage from '@/features/positions/PositionsPage'
import DecisionsPage from '@/features/positions/DecisionsPage'
import SignalsPage from '@/features/positions/SignalsPage'
import OverviewPage from '@/features/admin/OverviewPage'
import UsersPage from '@/features/admin/UsersPage'
import DataPage from '@/features/admin/DataPage'
import AuditPage from '@/features/admin/AuditPage'
import { Toaster } from '@/components/ui/toast'
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
          <Route path="/wallets" element={<WalletsPage />} />
          <Route path="/targets" element={<TargetsPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/new" element={<TaskFormPage />} />
          <Route path="/tasks/:id/edit" element={<TaskEditPage />} />
          <Route path="/blacklist" element={<BlacklistPage />} />
          <Route path="/positions" element={<PositionsPage />} />
          <Route path="/decisions" element={<DecisionsPage />} />
          <Route path="/signals" element={<SignalsPage />} />
          <Route element={<RequireAdmin />}>
            <Route path="/admin/overview" element={<OverviewPage />} />
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/data" element={<DataPage />} />
            <Route path="/admin/audit" element={<AuditPage />} />
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
