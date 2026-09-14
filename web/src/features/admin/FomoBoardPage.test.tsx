import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/admin', () => ({ adminApi: { traderScan: vi.fn() } }))

import { adminApi, type FomoBoard, type FomoCandidate, type FomoRun } from '@/api/admin'
import { makeQueryClient } from '@/app/queryClient'
import FomoBoardPage, { PRESET } from './FomoBoardPage'

const run: FomoRun = {
  id: 3, started_at: '', finished_at: null, status: 'partial',
  error: '曲线身份反查失败 0 次、Prefetch 之后仍认不出 17 条曲线腿：这份结果不可采信',
  from_block: 60833828, to_block: 61684424, node: 'http://10.8.0.60:20140',
  git_rev: '9b81f58903e9-dirty', edges: '{}', min_txs: 10, top_cap: 2000,
  addrs_seen: 104882, addrs_delegated: 88460, addrs_analyzed: 2000, skipped_too_many: 0,
}
function cand(o: Partial<FomoCandidate>): FomoCandidate {
  return {
    address: '0x1111111111111111111111111111111111111111', txs: 20, signals: 20, buys: 9, sells: 13,
    tokens: 6, bought_usdg: '0', sold_usdg: '0', realized_usdg: '0', cost_out_usdg: '0',
    open_cost_usdg: '0', realized_usdg_f: 32.89, roi_closed: 1.9, roi_gross: 1.0,
    hold_min_sec: 854, hold_p50_sec: 1200, reversal_min_sec: -1,
    usdg_leg_share: 1, skipped_leg_share: 0, orphan_share: 0.05, closed_share: 0.94, ...o,
  }
}
function board(o: Partial<FomoBoard> = {}): FomoBoard {
  return { run, candidates: [cand({})], limits: ['【这份榜是什么】只覆盖「EIP-7702 委托账户 ∩ …」'], ...o }
}
function mount() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter>
        <FomoBoardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

it('把 status=partial 与原因全文显眼展示', async () => {
  vi.mocked(adminApi.traderScan).mockResolvedValue(board())
  mount()
  // 榜最容易被当成「可以直接跟」的结论，所以 partial 的原因必须先看到
  await screen.findByText(/status = partial/)
  expect(screen.getByText(/17 条曲线腿/)).toBeInTheDocument()
})

it('「无法计算」渲染成 —，不是 -1 也不是 0', async () => {
  // reversal_min_sec=-1、roi_closed=null、orphan_share=-1 三种哨兵都要显示成 —
  vi.mocked(adminApi.traderScan).mockResolvedValue(
    board({ candidates: [cand({ reversal_min_sec: -1, roi_closed: null, orphan_share: -1 })] }),
  )
  mount()
  await waitFor(() => expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3))
  expect(screen.queryByText('-1')).not.toBeInTheDocument()
  expect(screen.queryByText('-1.00')).not.toBeInTheDocument()
})

it('默认不传 sort（后端默认 roi_closed），也不传 min_realized', async () => {
  vi.mocked(adminApi.traderScan).mockResolvedValue(board())
  mount()
  await screen.findByText(/status = partial/)
  const q = vi.mocked(adminApi.traderScan).mock.calls[0][0]
  expect(q.sort).toBeUndefined()
  // min_realized 会筛掉小本金高 ROI 的地址，而那些人的成交规模与跟单者相当、恰恰最该跟
  expect(q).not.toHaveProperty('min_realized')
})

it('「常用组合」填的是三个可信度门槛，不含金额门槛', async () => {
  vi.mocked(adminApi.traderScan).mockResolvedValue(board())
  mount()
  await screen.findByText(/status = partial/)
  await userEvent.click(screen.getByRole('button', { name: '常用组合' }))
  await waitFor(() => expect(vi.mocked(adminApi.traderScan).mock.calls.length).toBeGreaterThan(1))
  const q = vi.mocked(adminApi.traderScan).mock.calls.at(-1)![0]
  expect(q.min_closed_share).toBe(0.5)
  expect(q.max_orphan_share).toBe(0.3)
  expect(q.min_usdg_leg_share).toBe(0.8)
  // 直接钉住 PRESET 的键集合。上一版断言的是「查询里没有 min_realized」——
  // 那守不住：往 PRESET 里加字段但不接到表单上，查询里本来就不会出现，变异照样全绿。
  expect(Object.keys(PRESET).sort()).toEqual(['max_orphan_share', 'min_closed_share', 'min_usdg_leg_share'])
})

it('翻页把 offset 带上，且首页禁用「上一页」', async () => {
  const many = Array.from({ length: 50 }, (_, i) =>
    cand({ address: '0x' + String(i).padStart(40, '0') }),
  )
  vi.mocked(adminApi.traderScan).mockResolvedValue(board({ candidates: many }))
  mount()
  await screen.findByText(/status = partial/)
  expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: '下一页' }))
  await waitFor(() => {
    const q = vi.mocked(adminApi.traderScan).mock.calls.at(-1)![0]
    expect(q.offset).toBe(50)
  })
})

it('没有跑批结果时给出怎么跑的提示，而不是空白', async () => {
  vi.mocked(adminApi.traderScan).mockResolvedValue({ run: null, candidates: [], limits: [] })
  mount()
  await screen.findByText(/还没有跑批结果/)
  expect(screen.getByText(/app\.sh scan/)).toBeInTheDocument()
})

it('覆盖边界声明可展开（spec §4 的硬要求）', async () => {
  vi.mocked(adminApi.traderScan).mockResolvedValue(board())
  mount()
  await screen.findByText(/status = partial/)
  await userEvent.click(screen.getByText(/这份榜覆盖什么/))
  expect(screen.getByText(/只覆盖「EIP-7702 委托账户/)).toBeInTheDocument()
})
