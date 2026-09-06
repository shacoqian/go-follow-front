import * as client from './client'
import { walletsApi, withdrawalsApi } from './wallets'
import { targetsApi } from './targets'
import { tasksApi } from './tasks'

const req = vi.spyOn(client, 'request')
const reqFull = vi.spyOn(client, 'requestFull')
beforeEach(() => {
  req.mockReset().mockResolvedValue({})
  reqFull.mockReset().mockResolvedValue({ status: 200, data: {} })
})

it('wallets routes', async () => {
  await walletsApi.list()
  await walletsApi.create({ label: 'a', note: 'b' })
  await walletsApi.update(3, { label: 'a', note: 'b' })
  await walletsApi.disable(3)
  await walletsApi.exportKey(3, '0xsig')
  await walletsApi.remove(3, '0xsig', false)
  await walletsApi.remove(3, '0xsig', true)
  await walletsApi.withdrawals(3)
  await withdrawalsApi.get(9)
  expect(req.mock.calls.map((c) => c.slice(0, 3))).toEqual([
    ['GET', '/wallets', undefined],
    ['POST', '/wallets', { label: 'a', note: 'b' }],
    ['PUT', '/wallets/3', { label: 'a', note: 'b' }],
    ['POST', '/wallets/3/disable', undefined],
    ['GET', '/wallets/3/export?action_signature=0xsig', undefined],
    ['DELETE', '/wallets/3?action_signature=0xsig&force=0', undefined],
    ['DELETE', '/wallets/3?action_signature=0xsig&force=1', undefined],
    ['GET', '/wallets/3/withdrawals', undefined],
    ['GET', '/withdrawals/9', undefined],
  ])
})

it('withdraw uses requestFull so 202 survives', async () => {
  reqFull.mockResolvedValue({ status: 202, data: { id: 1, tx_hash: '0x', status: 'SENT', note: 'n' } })
  const r = await walletsApi.withdraw(3, { asset: 'USDG', amount: 'all' })
  expect(reqFull).toHaveBeenCalledWith('POST', '/wallets/3/withdraw', { asset: 'USDG', amount: 'all' }, { timeoutMs: 90_000 })
  expect(r.status).toBe(202)
})

it('targets and tasks routes', async () => {
  await targetsApi.list()
  await targetsApi.create({ address: '0xabc', label: 'l', note: 'n' })
  await targetsApi.update(2, { label: 'l', note: 'n' })
  await targetsApi.remove(2)
  await tasksApi.list()
  await tasksApi.enable(5)
  await tasksApi.disable(5)
  await tasksApi.remove(5)
  expect(req.mock.calls.map((c) => c.slice(0, 2))).toEqual([
    ['GET', '/targets'], ['POST', '/targets'], ['PUT', '/targets/2'], ['DELETE', '/targets/2'],
    ['GET', '/tasks'], ['POST', '/tasks/5/enable'], ['POST', '/tasks/5/disable'], ['DELETE', '/tasks/5'],
  ])
})
