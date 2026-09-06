import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { isOkxInstalled } from '@/wallets/okx'
import { loginWithOkx } from './auth'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const installed = isOkxInstalled()

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
        <Button className="mt-6 w-full" onClick={onConnect} disabled={busy}>
          {busy ? '等待钱包签名…' : '连接 OKX 钱包'}
        </Button>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  )
}
