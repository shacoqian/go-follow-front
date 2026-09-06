import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { getAddress } from 'viem'
import { Select } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { ApiError } from '@/api/client'
import { shortAddress } from '@/lib/format'
import { switchAccount } from '@/features/auth/auth'
import { useSession } from '@/features/auth/session'
import { useOkxAccounts } from '@/features/auth/useOkxAccounts'
import { requestPermissions, supportsRequestPermissions } from '@/wallets/okx'

// 不是真实地址，选中它触发"切换账号…"这个动作项，而不是切账号。
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
    // 选项值是小写地址（方便跟会话地址比较），真正签名登录要用 checksum 形式，和其它签名调用保持一致。
    mutationFn: (address: string) => switchAccount(getAddress(address)),
    meta: { silent: true },
    onSuccess: () => toast.success('已切换账号'),
    onError: (err) => {
      // 后端明确拒绝（账号被锁定、限流等）展示后端原话；已经有一个切换在跑（比如手快点了两下，
      // 或者插件自动切换和手动切换撞车）展示那句提示；签名被拒/插件只认当前账号这类钱包侧失败
      // 没有具体后端消息，用设计稿里给的固定文案。
      const inFlightMessage = '切换进行中，请稍候'
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error && err.message === inFlightMessage
            ? err.message
            : '请在 OKX 里切到该账号后重试'
      toast.error(message)
      setValue(session?.address ?? '')
    },
  })

  if (!session) return null
  // 局部变量捕获，避免闭包里 TS 认不出 session 已经判过非空。
  const sessionAddress = session.address

  const known = new Set(accounts.map((a) => a.toLowerCase()))
  const addressOptions = accounts.map((a) => ({ value: a.toLowerCase(), label: shortAddress(a) }))
  // 会话地址可能是用户在插件里撤销授权后剩下的孤儿地址：eth_accounts 里已经没有它了，
  // 但当前还在用它的会话，下拉里得留着，不然连当前账号都选不中。
  if (!known.has(sessionAddress)) addressOptions.unshift({ value: sessionAddress, label: shortAddress(sessionAddress) })

  // 只有会话这一个地址、又没有"切换账号…"入口（插件不支持 requestPermissions）时，下拉形同虚设——
  // 没有别的账号可选，也没法唤起授权弹窗新增。退化成和 Shell 改造前一样的纯文本，别摆一个假下拉。
  if (addressOptions.length === 1 && !canManage) {
    return <span className="font-mono text-sm text-slate-600">{shortAddress(sessionAddress)}</span>
  }

  const options = [...addressOptions]
  if (canManage) options.push({ value: MANAGE, label: '切换账号…' })

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

  return (
    <Select
      aria-label="账号"
      className="w-auto font-mono"
      options={options}
      value={value}
      onChange={onChange}
      disabled={mutation.isPending}
    />
  )
}
