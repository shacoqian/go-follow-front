import type { ApiError } from '@/api/client'
import type { Withdrawal } from '@/api/wallets'

// 400 的两个已知原因映射成中文；其余状态码/原文原样展示——不猜后端没说清楚的事。
export function withdrawErrorText(err: ApiError): string {
  if (err.status === 400) {
    if (err.message === 'insufficient') return '余额不足'
    if (err.message === 'insufficient gas') return 'ETH 不足以支付 gas'
  }
  return err.message
}

const TONE: Record<Withdrawal['status'], 'gray' | 'blue' | 'green' | 'red'> = {
  PENDING: 'gray',
  SENT: 'blue',
  CONFIRMED: 'green',
  FAILED: 'red',
}

const TEXT: Record<Withdrawal['status'], string> = {
  PENDING: '待发送',
  SENT: '已广播',
  CONFIRMED: '已确认',
  FAILED: '失败',
}

export function statusTone(s: Withdrawal['status']): 'gray' | 'blue' | 'green' | 'red' {
  return TONE[s]
}

export function statusText(s: Withdrawal['status']): string {
  return TEXT[s]
}

export function isTerminal(s: Withdrawal['status']): boolean {
  return s === 'CONFIRMED' || s === 'FAILED'
}
