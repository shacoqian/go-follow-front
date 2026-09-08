import * as client from './client'
import { positionsApi } from './positions'
import { decisionsApi } from './decisions'
import { signalsApi } from './signals'
import { adminApi } from './admin'
import { blacklistApi } from './blacklist'

const req = vi.spyOn(client, 'request')
const reqFull = vi.spyOn(client, 'requestFull')
beforeEach(() => {
  req.mockReset().mockResolvedValue({})
  reqFull.mockReset().mockResolvedValue({ status: 200, data: {} })
})

it('positions / sell', async () => {
  await positionsApi.byTask(3)
  await positionsApi.sell(9, 5000)
  expect(req.mock.calls.map((c) => c.slice(0, 3))).toEqual([
    ['GET', '/tasks/3/positions', undefined],
    ['POST', '/positions/9/sell', { pct_bps: 5000 }],
  ])
  expect(req.mock.calls[1][3]).toEqual({ timeoutMs: 90_000 })
})

it('decisions / signals build query strings with only present params', async () => {
  await decisionsApi.list({ limit: 50 })
  await decisionsApi.list({ task: 3, outcome: 'SKIPPED', limit: 100 })
  await signalsApi.list({ limit: 50 })
  await signalsApi.list({ target: '0xabc', since: '2026-09-06T00:00:00Z', limit: 100 })
  await signalsApi.list({ via: 'relay', limit: 50 })
  expect(req.mock.calls.map((c) => c[1])).toEqual([
    '/decisions?limit=50',
    '/decisions?task=3&outcome=SKIPPED&limit=100',
    '/signals?limit=50',
    '/signals?target=0xabc&since=2026-09-06T00%3A00%3A00Z&limit=100',
    '/signals?via=relay&limit=50',
  ])
})

it('admin routes', async () => {
  await adminApi.overview()
  await adminApi.users()
  await adminApi.lockUser('0xAbC')
  await adminApi.unlockUser('0xabc')
  await adminApi.tasks()
  await adminApi.tasks('0xabc')
  await adminApi.positions('0xabc')
  await adminApi.decisions()
  await adminApi.wallets('0xabc')
  await adminApi.withdrawals()
  await adminApi.enableTask(5)
  await adminApi.disableTask(5)
  await adminApi.audit({ limit: 100 })
  await adminApi.audit({ owner: '0xabc', action: 'withdraw', limit: 200 })
  await adminApi.setSetting('kill_switch', true)
  expect(req.mock.calls.map((c) => [c[0], c[1], c[2]])).toEqual([
    ['GET', '/admin/overview', undefined],
    ['GET', '/admin/users', undefined],
    ['POST', '/admin/users/0xabc/lock', undefined],
    ['POST', '/admin/users/0xabc/unlock', undefined],
    ['GET', '/admin/tasks', undefined],
    ['GET', '/admin/tasks?owner=0xabc', undefined],
    ['GET', '/admin/positions?owner=0xabc', undefined],
    ['GET', '/admin/decisions', undefined],
    ['GET', '/admin/wallets?owner=0xabc', undefined],
    ['GET', '/admin/withdrawals', undefined],
    ['POST', '/admin/tasks/5/enable', undefined],
    ['POST', '/admin/tasks/5/disable', undefined],
    ['GET', '/admin/audit?limit=100', undefined],
    ['GET', '/admin/audit?owner=0xabc&action=withdraw&limit=200', undefined],
    ['PUT', '/settings/kill_switch', { on: true }],
  ])
})

it('admin operator / exec routes', async () => {
  await adminApi.operators()
  await adminApi.createOperator()
  await adminApi.setOperatorEnabled(4, true)
  await adminApi.setOperatorEnabled(4, false)
  await adminApi.deleteOperator(4)
  await adminApi.deleteOperator(4, true)
  await adminApi.execStatus()
  expect(req.mock.calls.map((c) => c.slice(0, 3))).toEqual([
    ['GET', '/admin/operators', undefined],
    ['POST', '/admin/operators', undefined],
    ['POST', '/admin/operators/4/enable', undefined],
    ['POST', '/admin/operators/4/disable', undefined],
    ['DELETE', '/admin/operators/4', undefined],
    ['DELETE', '/admin/operators/4?force=1', undefined],
    ['GET', '/exec/status', undefined],
  ])
})

it('operator withdraw uses requestFull so a 202 (broadcast uncertain) survives', async () => {
  reqFull.mockResolvedValue({ status: 202, data: { id: 1, tx_hash: '0x', status: 'SENT', note: 'n' } })
  await adminApi.operatorWithdraw(4, '1000000000000000000')
  await adminApi.operatorWithdraw(4, 'all')
  expect(reqFull.mock.calls.map((c) => c.slice(0, 3))).toEqual([
    ['POST', '/admin/operators/4/withdraw', { amount: '1000000000000000000' }],
    ['POST', '/admin/operators/4/withdraw', { amount: 'all' }],
  ])
  expect(reqFull.mock.calls[0][3]).toEqual({ timeoutMs: 90_000 })
  const r = await adminApi.operatorWithdraw(4, 'all')
  expect(r.status).toBe(202)
})

it('admin logs builds query strings with only present params in order q, level, from, to, limit, dedup', async () => {
  await adminApi.logs({ limit: 100 })
  await adminApi.logs({ q: 'a,b', level: 'WARN', limit: 100 })
  await adminApi.logs({
    q: 'timeout',
    level: 'ERROR',
    from: '2026-09-08T00:00:00Z',
    to: '2026-09-08T10:00:00Z',
    limit: 200,
    dedup: 'module',
  })
  expect(req.mock.calls.map((c) => c.slice(0, 3))).toEqual([
    ['GET', '/admin/logs?limit=100', undefined],
    ['GET', '/admin/logs?q=a%2Cb&level=WARN&limit=100', undefined],
    [
      'GET',
      '/admin/logs?q=timeout&level=ERROR&from=2026-09-08T00%3A00%3A00Z&to=2026-09-08T10%3A00%3A00Z&limit=200&dedup=module',
      undefined,
    ],
  ])
})

it('blacklist routes', async () => {
  await blacklistApi.get()
  await blacklistApi.put(['0xa'])
  expect(req.mock.calls.map((c) => c.slice(0, 3))).toEqual([
    ['GET', '/settings/blacklist', undefined],
    ['PUT', '/settings/blacklist', { tokens: ['0xa'] }],
  ])
})
