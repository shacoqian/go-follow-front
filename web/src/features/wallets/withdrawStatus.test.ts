import { ApiError } from '@/api/client'
import { isTerminal, statusText, statusTone, withdrawErrorText } from './withdrawStatus'

it('maps errors and statuses', () => {
  expect(withdrawErrorText(new ApiError(400, 'insufficient'))).toBe('余额不足')
  expect(withdrawErrorText(new ApiError(400, 'insufficient gas'))).toBe('ETH 不足以支付 gas')
  expect(withdrawErrorText(new ApiError(409, '提现进行中'))).toBe('提现进行中')
  expect(statusText('SENT')).toBe('已广播')
  expect(statusTone('FAILED')).toBe('red')
  expect(isTerminal('CONFIRMED')).toBe(true)
  expect(isTerminal('PENDING')).toBe(false)
})
