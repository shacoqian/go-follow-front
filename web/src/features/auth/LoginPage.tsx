import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { isOkxInstalled } from '@/wallets/okx'
import { shortAddress } from '@/lib/format'
import { loginAs, loginWithOkx } from './auth'
import { useOkxAccounts } from './useOkxAccounts'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const installed = isOkxInstalled()
  const { accounts, current } = useOkxAccounts()
  const [selected, setSelected] = useState<string | null>(current)
  const hasAccounts = accounts.length > 0

  // 默认预选插件当前地址；accountsChanged 后如果原选择不在新列表里了，才改选新的 current
  // （仍然保留用户手动选的其它账号，不因为列表顺序变化就打断）。
  useEffect(() => {
    setSelected((prev) => (prev && accounts.includes(prev) ? prev : current))
  }, [accounts, current])

  async function onConnect() {
    setBusy(true)
    setError(null)
    try {
      await loginWithOkx()
      navigate(from, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败')
    } finally {
      setBusy(false)
    }
  }

  async function onLoginAs() {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      await loginAs(selected)
      navigate(from, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">go-follow</h1>
        <p className="mt-2 text-sm text-slate-600">用 OKX 钱包签名登录，钱包地址即账号。签名弹窗里显示的域名应与本页地址一致。</p>
        {!installed && (
          <p className="mt-4 text-sm text-amber-700">
            未检测到 OKX 钱包。请先{' '}
            <a className="underline" href="https://www.okx.com/web3" target="_blank" rel="noreferrer">
              安装 OKX 钱包
            </a>
            ，然后刷新本页。
          </p>
        )}
        {hasAccounts && (
          <div className="mt-4">
            <Field label="账号" htmlFor="login-account">
              <Select
                id="login-account"
                options={accounts.map((a) => ({ value: a, label: shortAddress(a) }))}
                value={selected ?? ''}
                onChange={(e) => setSelected(e.target.value)}
              />
            </Field>
          </div>
        )}
        <Button className="mt-6 w-full" onClick={hasAccounts ? onLoginAs : onConnect} disabled={busy || (hasAccounts && !selected)}>
          {busy ? '等待钱包签名…' : hasAccounts ? '以此账号登录' : '连接 OKX 并登录'}
        </Button>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  )
}
