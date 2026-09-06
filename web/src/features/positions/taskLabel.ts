import type { Task } from '@/api/tasks'
import type { Target } from '@/api/targets'
import type { Wallet } from '@/api/wallets'
import { shortAddress } from '@/lib/format'

// 任务下拉标签：`目标 缩写 · 钱包`；目标/钱包列表还没取回来时退化成 #id。
export function taskLabel(task: Task, targets: Target[] | undefined, wallets: Wallet[] | undefined): string {
  const target = targets?.find((x) => x.id === task.target_id)
  const wallet = wallets?.find((x) => x.id === task.wallet_id)
  const targetLabel = target ? target.label || shortAddress(target.address) : `#${task.target_id}`
  const walletLabel = wallet ? wallet.label || shortAddress(wallet.address) : `#${task.wallet_id}`
  return `${targetLabel} · ${walletLabel}`
}

export function taskOptions(
  tasks: Task[] | undefined,
  targets: Target[] | undefined,
  wallets: Wallet[] | undefined,
): { value: string; label: string }[] {
  return (tasks ?? []).map((t) => ({ value: String(t.id), label: taskLabel(t, targets, wallets) }))
}
