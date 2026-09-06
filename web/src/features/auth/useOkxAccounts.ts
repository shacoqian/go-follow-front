import { useCallback, useEffect, useState } from 'react'
import { listAccounts, onAccountsChanged, waitForOkx } from '@/wallets/okx'

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
    setAccounts(await listAccounts())
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
