import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Select } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { shortAddress } from '@/lib/format'
import { switchAccount } from '@/features/auth/auth'
import { useSession } from '@/features/auth/session'
import { useOkxAccounts } from '@/features/auth/useOkxAccounts'
import { requestPermissions, supportsRequestPermissions } from '@/wallets/okx'

// 不是真实地址，选中它触发"管理授权账号…"这个动作项，而不是切账号。
const MANAGE = '__manage__'

export default function AccountMenu() {
  const session = useSession((s) => s.session)
  const { accounts, refresh } = useOkxAccounts()
  const [canManage, setCanManage] = useState(false)
  const [value, setValue] = useState(session?.address ?? '')

  useEffect(() => {
    let cancelled = false
    void supportsRequestPermissions().then((ok) => {
      if (!cancelled) setCanManage(ok)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // 会话地址变了（切换成功、或从别处登出重登）就跟着同步下拉的显示值。
  useEffect(() => {
    setValue(session?.address ?? '')
  }, [session?.address])

  const mutation = useMutation({
    mutationFn: (address: string) => switchAccount(address),
    meta: { silent: true },
    onSuccess: () => toast.success('已切换账号'),
    onError: () => {
      toast.error('请在 OKX 里切到该账号后重试')
      setValue(session?.address ?? '')
    },
  })

  if (!session) return null
  // 局部变量捕获，避免闭包里 TS 认不出 session 已经判过非空。
  const sessionAddress = session.address

  const known = new Set(accounts.map((a) => a.toLowerCase()))
  const options = accounts.map((a) => ({ value: a.toLowerCase(), label: shortAddress(a) }))
  // 会话地址可能是用户在插件里撤销授权后剩下的孤儿地址：eth_accounts 里已经没有它了，
  // 但当前还在用它的会话，下拉里得留着，不然连当前账号都选不中。
  if (!known.has(sessionAddress)) options.unshift({ value: sessionAddress, label: shortAddress(sessionAddress) })
  if (canManage) options.push({ value: MANAGE, label: '管理授权账号…' })

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value
    if (next === MANAGE) {
      setValue(sessionAddress)
      void requestPermissions()
        .then((ok) => (ok ? refresh() : undefined))
        .catch(() => {
          // 用户在授权弹窗里取消，无需额外提示。
        })
      return
    }
    setValue(next)
    if (next === sessionAddress) return
    mutation.mutate(next)
  }

  return <Select aria-label="账号" className="w-auto font-mono" options={options} value={value} onChange={onChange} />
}
