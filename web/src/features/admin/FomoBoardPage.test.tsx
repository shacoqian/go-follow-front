import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/admin', () => ({ adminApi: { traderScan: vi.fn() } }))

import { adminApi, type FomoBoard, type FomoCandidate, type FomoRun } from '@/api/admin'
import { makeQueryClient } from '@/app/queryClient'
import FomoBoardPage, { COLS, PRESET } from './FomoBoardPage'

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
    open_cost_usdg: '0', open_value_usdg: '0', unpriced_open_cost_usdg: '0',
    realized_usdg_f: 32.89, pnl_usdg_f: 32.89, roi_true: 1.5, roi_closed: 1.9, roi_gross: 1.0,
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

it('表头带悬停提示，且列说明可展开', async () => {
  vi.mocked(adminApi.traderScan).mockResolvedValue(board())
  mount()
  await screen.findByText(/status = partial/)
  // 悬停提示：roi_closed 这一列必须说清它是「跟单最该看的」
  expect(screen.getByTitle(/榜单按它排序/)).toBeInTheDocument()
  // closed 的提示要点出「小 = ROI 是浮盈撑的」——那是最容易踩的坑
  expect(screen.getByTitle(/小 = ROI 是浮盈撑的/)).toBeInTheDocument()
  await userEvent.click(screen.getByText('这些列是什么意思'))
  expect(screen.getByText(/不是 0，是「算不出来」/)).toBeInTheDocument()
  expect(screen.getByText(/一眼判断能不能信/)).toBeInTheDocument()
})

it('COLS 覆盖表格实际渲染的每一列（改了列必须同步改说明）', async () => {
  vi.mocked(adminApi.traderScan).mockResolvedValue(board())
  const { container } = mount()
  await screen.findByText(/status = partial/)
  // 钉住「表头数量 == COLS 数量」：加了列却忘了写说明，这里会红
  const ths = container.querySelectorAll('thead th')
  expect(ths.length).toBe(COLS.length)
  for (const c of COLS) expect(screen.getByTitle(c.tip)).toBeInTheDocument()
})

// 2026-09-15 的排序改版：真实盈亏是新的首要列，roi_closed 降级为对照。
// 这条钉住「两个口径都必须在场」——只留新的会让人看不出差距，只留旧的就是回到缺陷本身。
it('shows 真实盈亏 as the ranking column and keeps roi_closed alongside it for contrast', async () => {
  vi.mocked(adminApi.traderScan).mockResolvedValue(
    board({ candidates: [cand({ pnl_usdg_f: -1325.88, roi_true: -0.43, roi_closed: 7.03 })] }),
  )
  mount()
  const row = (await screen.findByText('0x1111…1111')).closest('tr')!
  expect(within(row).getByText('-1325.88')).toBeInTheDocument()
  expect(within(row).getByText('7.03')).toBeInTheDocument()
  // 表头两列都在，且真实盈亏排在 roi_closed 前面
  const heads = COLS.map((c) => c.key)
  expect(heads).toContain('真实盈亏')
  expect(heads.indexOf('真实盈亏')).toBeLessThan(heads.indexOf('roi_closed'))
  // 图例必须写明 roi_closed 不再用于排序，否则看的人还会把它当主指标
  expect(COLS.find((c) => c.key === 'roi_closed')!.long).toContain('已不再用于排序')
})

// 未估值（旧 run）的行必须显示「—」，不能显示成 0 —— 0 会被读成「不赚不亏」。
it('renders an unvalued row as — rather than 0', async () => {
  vi.mocked(adminApi.traderScan).mockResolvedValue(
    board({ candidates: [cand({ pnl_usdg_f: null, roi_true: null, open_value_usdg: '-1' })] }),
  )
  mount()
  const row = (await screen.findByText('0x1111…1111')).closest('tr')!
  expect(within(row).queryByText('0.00')).not.toBeInTheDocument()
  expect(within(row).getAllByText('—').length).toBeGreaterThanOrEqual(2)
})
