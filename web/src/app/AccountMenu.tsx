import { useEffect, useState, useSyncExternalStore } from 'react'
import { useMutation } from '@tanstack/react-query'
import { getAddress } from 'viem'
import { Select } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { ApiError } from '@/api/client'
import { shortAddress } from '@/lib/format'
import { isSwitchBusy, runSwitchChain, subscribeSwitchBusy } from '@/features/auth/auth'
import { sessionValid, useSession } from '@/features/auth/session'
import { useOkxAccounts } from '@/features/auth/useOkxAccounts'
import { requestPermissions, supportsRequestPermissions } from '@/wallets/okx'

// 不是真实地址，选中它触发"切换账号…"这个动作项，而不是切账号。
const MANAGE = '__manage__'

// 任意一条切换链路（手动或插件自动触发）忙碌期间，下拉整体禁用——避免手快点了两下，
// 或者跟插件自动切换撞在一起。
function useSwitchBusy(): boolean {
  return useSyncExternalStore(subscribeSwitchBusy, isSwitchBusy)
}

export default function AccountMenu() {
  const session = useSession((s) => s.session)
  const saved = useSession((s) => s.saved)
  const { current, refresh } = useOkxAccounts()
  const [canManage, setCanManage] = useState(false)
  const [value, setValue] = useState(session?.address ?? '')
  const busy = useSwitchBusy()

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
    // runSwitchChain 是手动切换（这里）和插件自动切换（watchAccountChanges）共用的唯一入口——
    // 这样"切换进行中收到新的 accountsChanged 事件"这类锁存/补跑逻辑两边都能用上，不会因为是
    // 手动点出来的就漏掉。缓存里的有效会话经 resumeOrLogin/`/auth/me` 校验后直接切换，不会
    // 弹签名；缓存过期或没有缓存的地址会经 loginAs 弹签名，这时如果 OKX 当前选中的不是这个
    // 地址，签名会失败/被拒，走下面 onError 里那句固定文案。
    mutationFn: (address: string) => {
      const checksummed = getAddress(address)
      return runSwitchChain(checksummed, {
        onSuccess: () => toast.success(`已切换到 ${shortAddress(checksummed)}`),
        onError: (err) => {
          // 后端明确拒绝（账号被锁定、限流等）展示后端原话；已经有一个切换在跑（比如手快点了
          // 两下，或者插件自动切换和手动切换撞车）展示那句提示；签名被拒/插件只认当前账号这类
          // 钱包侧失败没有具体后端消息，用设计稿里给的固定文案。
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
    },
    meta: { silent: true },
  })

  if (!session) return null
  // 局部变量捕获，避免闭包里 TS 认不出 session 已经判过非空。
  const sessionAddress = session.address

  // 选项来源：当前会话地址 + saved 里所有记住的地址（本机曾经登录过、可能已过期），
  // 再加上插件当前选中账号（如果它还不在里面）——不再以插件的 eth_accounts 列表为主，
  // 系统内切换本来就是为了不必回插件。全部按小写地址去重。
  const pluginCurrent = current?.toLowerCase() ?? null
  const addrs = new Set<string>([sessionAddress, ...Object.keys(saved)])
  if (pluginCurrent) addrs.add(pluginCurrent)

  const addressOptions = [...addrs].map((addr) => {
    const cached = saved[addr]
    let label = shortAddress(addr)
    if (cached && !sessionValid(cached)) label += '（需重新签名）'
    // 插件当前选中的账号始终标注出来（哪怕它也在 saved 里、甚至是过期的那个）——签名操作
    // 只认插件当前选中账号，用户得知道选哪个地址眼下真能签得动。
    if (addr === pluginCurrent) label += '（插件当前）'
    return { value: addr, label }
  })

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
      disabled={mutation.isPending || busy}
    />
  )
}
