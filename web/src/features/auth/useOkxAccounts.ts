import { useCallback, useEffect, useState } from 'react'
import { listAccounts, onAccountsChanged, waitForOkx } from '@/wallets/okx'
import { notePluginAccounts } from './auth'

export interface OkxAccountsState {
  accounts: string[]
  // 插件当前选中的地址：eth_accounts 返回的列表第一项。
  current: string | null
  // accountsChanged 通常会自己触发刷新；requestPermissions 成功后如果没有触发，
  // 调用方（AccountMenu）可以用这个手动再拉一次。
  refresh: () => Promise<void>
}

// OKX 是异步注入的，等它就绪后先读一次已授权地址列表，再订阅 accountsChanged 保持同步。
export function useOkxAccounts(): OkxAccountsState {
  const [accounts, setAccounts] = useState<string[]>([])

  const refresh = useCallback(async () => {
    const next = await listAccounts()
    setAccounts(next)
    // 只在 auth.ts 还没有任何基准值时才用这次结果初始化 pluginCurrent（页面刚加载）；一旦
    // watchAccountChanges 处理过一次真正的 accountsChanged，这里就是空操作——pluginCurrent
    // 之后只归 handleAccountsChanged 写，不然这个 refresh()（这里的 accountsChanged 监听、
    // requestPermissions 成功后的手动刷新）随时可能抢在 watcher 前面把"还没处理的变化"提前
    // 记成"已知状态"，导致锁存事件补跑时被误判成"没变"而漏掉一次该有的自动切换。
    notePluginAccounts(next)
  }, [])

  useEffect(() => {
    let cancelled = false
    let off = () => {}
    void waitForOkx().then((ok) => {
      if (cancelled || !ok) return
      void refresh()
      off = onAccountsChanged(() => void refresh())
    })
    return () => {
      cancelled = true
      off()
    }
  }, [refresh])

  return { accounts, current: accounts[0] ?? null, refresh }
}
