import { useState } from 'react'
import type { FomoCandidate, FomoQuery, FomoRun } from '@/api/admin'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Table, Tr, Td } from '@/components/ui/table'
import { CopyButton } from '@/components/CopyButton'
import { shortAddress } from '@/lib/format'
import { addressUrl } from '@/lib/explorer'
import { useTraderScan } from './useAdmin'

// 出块间隔（秒）：把块区间换算成人看得懂的小时数。实测 0.103 s/块。
const BLOCK_SECONDS = 0.103

// 常用组合：一次填好推荐门槛。
//
// 刻意**没有 min_realized**。它会筛掉小本金高 ROI 的地址，而跟单下单用的是跟单者
// 自己的本金（size_mode fixed/ratio，与目标仓位无关），那些人的成交规模与跟单者
// 相当、恰恰最该跟。实测有地址赚 32.89 USDG 但 ROI 1.90、仓位平掉 94%、持仓 854 秒，
// 按比例算比榜上「赚 7,570 而 ROI 0.98」的强一倍。
export const PRESET = { min_closed_share: 0.5, max_orphan_share: 0.3, min_usdg_leg_share: 0.8 }


/**
 * COLS 是表头的单一来源：列名 + 悬停提示 + 图例长解释。
 *
 * 为什么把三者放一处：它们必须一致。分开写的话，改了口径只改一处、
 * 另两处就开始骗人——而这些数字是用来决定跟谁的。
 */
export const COLS: { key: string; tip: string; long: string }[] = [
  { key: '#', tip: '本页序号（受 offset 影响）', long: '本页序号，翻页后会接着数。' },
  { key: '地址', tip: '候选钱包，点开链到区块浏览器', long: '候选钱包。点地址链到区块浏览器，旁边按钮一键复制。' },
  {
    key: 'roi_closed',
    tip: '收益率 = 已实现盈亏 ÷ 已结转成本。跟单最该看的一列',
    long: '收益率 = 已实现盈亏 ÷ 已结转成本。2.34 表示已平掉的那部分赚了 2.34 倍。跟单下单用的是你自己的本金（固定 5 USDG 或按比例），所以能被复制的是**比例**而不是金额 —— 这是最重要的一列。',
  },
  {
    key: 'realized',
    tip: '已实现盈亏（USDG），可负。绝对额高往往只说明他本金大',
    long: '已实现盈亏（USDG），可为负。看规模用。绝对额高往往只说明他本金大 —— 榜上有地址赚 7,570 但 ROI 只有 0.98，跟他的收益率不到 ROI 榜首的七分之一。',
  },
  { key: '买/卖', tip: '窗口内买入笔数 / 卖出笔数', long: '窗口内的买入与卖出笔数。两者差太多说明窗口截断了他的交易（配合 orphan 一起看）。' },
  { key: '币', tip: '涉及的代币种数', long: '涉及的代币种数。少 = 专注；几十种 = 广撒网型。' },
  {
    key: 'hold_min',
    tip: '最短持仓 —— 所有买入批次里最快被卖掉的那一批',
    long: '**最短**持仓时长：所有买入批次里最快被卖掉的那一批。用最短而不是中位，因为中位 7 分钟但有几笔 80 秒就跑的，那几笔你跟进去照样接盘。「每次买入持仓 >5 分钟」这个要求卡的就是这一列。',
  },
  { key: 'hold_p50', tip: '持仓时长中位数', long: '持仓时长的中位数，看他整体节奏。' },
  {
    key: 'rev_min',
    tip: '同币相邻反向交易的最小间隔（秒）。几秒 = 做市/刷量',
    long: '同一个币上相邻反向交易的最小时间间隔。几秒内反复买卖同一个币 = 做市或刷量，不是能跟的策略。',
  },
  {
    key: 'orphan',
    tip: '卖出所得里配不上买入的比例（按金额）。大 = 这行收益算不准',
    long: '**数据可信度**。卖出所得里配不上买入的比例（按金额算）。大 = 他卖的是窗口之前就持有的存货，这一行的收益数字算不准。建议 < 0.3。',
  },
  {
    key: 'closed',
    tip: '已平仓比例 = 已结转成本 ÷ 总买入成本。小 = ROI 是浮盈撑的',
    long: '**数据可信度**。已平仓比例 = 已结转成本 ÷ 总买入成本。小 = 大头还没卖，roi_closed 只是从一小撮已平仓位算出来的。榜上有 ROI 7.02 的地址 closed 只有 0.07 —— 那 7 倍是平掉 7% 仓位算出来的，剩下 93% 本金是赚是亏完全未知。建议 ≥ 0.5。',
  },
  {
    key: 'USDG腿',
    tip: 'USDG 原生计价的腿占比。小 = 有腿靠汇率折算，精度低',
    long: '用 USDG 原生计价的腿占比。小 = 有腿是按 ETH 汇率折算的，金额精度低。建议 ≥ 0.8。',
  },
]

type Form = {
  run: string
  sort: '' | 'realized'
  min_hold_sec: string
  min_closed_share: string
  max_orphan_share: string
  min_usdg_leg_share: string
  limit: string
}
const EMPTY: Form = {
  run: '',
  sort: '',
  min_hold_sec: '',
  min_closed_share: '',
  max_orphan_share: '',
  min_usdg_leg_share: '',
  limit: '50',
}

function numOr(v: string): number | undefined {
  const s = v.trim()
  if (s === '') return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

function toQuery(f: Form, offset: number): FomoQuery {
  return {
    run: numOr(f.run),
    sort: f.sort === 'realized' ? 'realized' : undefined,
    min_hold_sec: numOr(f.min_hold_sec),
    min_closed_share: numOr(f.min_closed_share),
    max_orphan_share: numOr(f.max_orphan_share),
    min_usdg_leg_share: numOr(f.min_usdg_leg_share),
    limit: numOr(f.limit) ?? 50,
    offset,
  }
}

/**
 * dash 把「无法计算」渲染成「—」。
 *
 * 两组字段的哨兵不同（go-follow spec §2 的硬约定）：四个 *_share 与 hold_*／
 * reversal_min_sec 用 **-1**，两个 ROI 用 **null**。两者都必须显示成「—」——
 * 显示成 -1 会被当成一个很小的数值，显示成 0 会被当成「算出来是零」，
 * 而它们的含义是「这一项算不出来」。
 */
function dash(v: number | null, render: (n: number) => string): string {
  if (v === null || v < 0) return '—'
  return render(v)
}
const secs = (v: number) => dash(v, (n) => `${n}s`)
const share = (v: number) => dash(v, (n) => n.toFixed(2))
const roi = (v: number | null) => (v === null ? '—' : v.toFixed(2))

function RunBar({ run }: { run: FomoRun }) {
  const hours = ((run.to_block - run.from_block) * BLOCK_SECONDS) / 3600
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-slate-600">
        <span>
          run <b className="text-slate-900">{run.id}</b>
        </span>
        <span>
          窗口 <b className="text-slate-900">{hours.toFixed(1)} 小时</b>（块 {run.from_block}–{run.to_block}）
        </span>
        <span>
          判据 min_txs=<b className="text-slate-900">{run.min_txs}</b> top=
          <b className="text-slate-900">{run.top_cap}</b>
        </span>
        <span>
          枚举 <b className="text-slate-900">{run.addrs_seen}</b> → 7702{' '}
          <b className="text-slate-900">{run.addrs_delegated}</b> → 精算{' '}
          <b className="text-slate-900">{run.addrs_analyzed}</b>
        </span>
        <span className="text-slate-400">{run.git_rev}</span>
      </div>
      {/* status 横幅：partial 时必须显眼并给出全文原因。run 3 就是 partial（17 条曲线腿
          反查不出 ⇒ 账本可能有假信号），看榜的人必须先看到这句话，而不是直接读数字。 */}
      <div
        className={
          run.status === 'done'
            ? 'rounded-md border-l-4 border-emerald-500 bg-emerald-50 px-3 py-2 text-emerald-900'
            : 'rounded-md border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-amber-900'
        }
      >
        <b>status = {run.status}</b>
        {run.error ? ` — ${run.error}` : run.status === 'done' ? ' — 判据覆盖面已走完' : null}
      </div>
    </div>
  )
}

function Row({ c, idx }: { c: FomoCandidate; idx: number }) {
  const url = addressUrl(c.address)
  return (
    <Tr>
      <Td className="text-slate-400">{idx}</Td>
      <Td>
        <span className="inline-flex items-center gap-1 font-mono text-xs">
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">
              {shortAddress(c.address)}
            </a>
          ) : (
            shortAddress(c.address)
          )}
          <CopyButton text={c.address} />
        </span>
      </Td>
      <Td className="font-medium">{roi(c.roi_closed)}</Td>
      <Td className={c.realized_usdg_f > 0 ? 'text-emerald-700' : c.realized_usdg_f < 0 ? 'text-rose-700' : ''}>
        {c.realized_usdg_f.toFixed(2)}
      </Td>
      <Td>
        {c.buys}/{c.sells}
      </Td>
      <Td>{c.tokens}</Td>
      <Td>{secs(c.hold_min_sec)}</Td>
      <Td>{secs(c.hold_p50_sec)}</Td>
      <Td>{secs(c.reversal_min_sec)}</Td>
      <Td>{share(c.orphan_share)}</Td>
      <Td>{share(c.closed_share)}</Td>
      <Td>{share(c.usdg_leg_share)}</Td>
    </Tr>
  )
}

export default function FomoBoardPage() {
  const [form, setForm] = useState<Form>(EMPTY)
  const [applied, setApplied] = useState<Form>(EMPTY)
  const [offset, setOffset] = useState(0)
  const [showLimits, setShowLimits] = useState(false)
  const [showCols, setShowCols] = useState(false)
  const limit = numOr(applied.limit) ?? 50
  const { data, isLoading, isError, error } = useTraderScan(toQuery(applied, offset))

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))
  const apply = (f: Form) => {
    setForm(f)
    setApplied(f)
    setOffset(0)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">FOMO 榜</h1>
        <Badge>候选跟单目标</Badge>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <Field label="run">
          <Input value={form.run} onChange={set('run')} placeholder="最近一次" className="w-24" />
        </Field>
        <Field label="排序">
          <Select
            value={form.sort}
            onChange={set('sort')}
            className="w-44"
            options={[
              { value: '', label: 'roi_closed（默认）' },
              { value: 'realized', label: 'realized（看规模）' },
            ]}
          />
        </Field>
        <Field label="持仓 ≥ 秒">
          <Input value={form.min_hold_sec} onChange={set('min_hold_sec')} placeholder="不限" className="w-24" />
        </Field>
        <Field label="closed_share ≥">
          <Input
            value={form.min_closed_share}
            onChange={set('min_closed_share')}
            placeholder="不限"
            className="w-24"
          />
        </Field>
        <Field label="orphan_share ≤">
          <Input
            value={form.max_orphan_share}
            onChange={set('max_orphan_share')}
            placeholder="不限"
            className="w-24"
          />
        </Field>
        <Field label="USDG 腿 ≥">
          <Input
            value={form.min_usdg_leg_share}
            onChange={set('min_usdg_leg_share')}
            placeholder="不限"
            className="w-24"
          />
        </Field>
        <Field label="每页">
          <Input value={form.limit} onChange={set('limit')} className="w-20" />
        </Field>
        <Button onClick={() => apply(form)}>查询</Button>
        <Button
          variant="outline"
          onClick={() =>
            apply({
              ...form,
              min_closed_share: String(PRESET.min_closed_share),
              max_orphan_share: String(PRESET.max_orphan_share),
              min_usdg_leg_share: String(PRESET.min_usdg_leg_share),
              sort: '',
            })
          }
        >
          常用组合
        </Button>
      </div>

      {/* 列含义图例。不放在页面底部而放在表格之前：看不懂列名的人第一眼就该找得到，
          而底部要滚很久。默认折叠，不挤占看榜的空间。 */}
      <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
        <button className="text-sky-700 hover:underline" onClick={() => setShowCols((v) => !v)}>
          {showCols ? '收起列说明' : '这些列是什么意思'}
        </button>
        {showCols ? (
          <dl className="mt-2 space-y-2 text-slate-600">
            {COLS.slice(2).map((c) => (
              <div key={c.key} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <dt className="shrink-0 font-mono text-xs font-semibold text-slate-900 sm:w-28">{c.key}</dt>
                <dd className="text-xs leading-relaxed">{c.long}</dd>
              </div>
            ))}
            <div className="flex flex-col gap-0.5 pt-1 sm:flex-row sm:gap-3">
              <dt className="shrink-0 font-mono text-xs font-semibold text-slate-900 sm:w-28">—</dt>
              <dd className="text-xs leading-relaxed">
                <b>不是 0，是「算不出来」</b>。比如 rev_min 为「—」表示这个币上没出现过反向交易；
                roi_closed 为「—」表示他还没平过仓（分母为 0）。
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 pt-1 sm:flex-row sm:gap-3">
              <dt className="shrink-0 text-xs font-semibold text-slate-900 sm:w-28">一眼判断能不能信</dt>
              <dd className="text-xs leading-relaxed">
                看三个：<b>orphan &lt; 0.3</b>、<b>closed ≥ 0.5</b>、<b>USDG腿 ≥ 0.8</b>。
                三个都满足，roi_closed 才是可信的数 —— 「常用组合」按钮一次填好这三项。
              </dd>
            </div>
          </dl>
        ) : null}
      </div>

      {isError ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error instanceof Error ? error.message : '加载失败'}
        </div>
      ) : null}

      {data?.run ? <RunBar run={data.run} /> : null}
      {!isLoading && data && !data.run ? (
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
          还没有跑批结果 —— 在服务器上执行 <code>./app.sh scan</code>
        </div>
      ) : null}

      <Table
        head={COLS.map((c) => (
          <span key={c.key} title={c.tip} className="cursor-help border-b border-dotted border-slate-400">
            {c.key}
          </span>
        ))}
        empty={isLoading ? '加载中…' : '这些条件下没有候选'}
      >
        {(data?.candidates ?? []).map((c, i) => (
          <Row key={c.address} c={c} idx={offset + i + 1} />
        ))}
      </Table>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>
          本页 {data?.candidates.length ?? 0} 行
          {data?.run ? `，共精算 ${data.run.addrs_analyzed} 个地址` : ''}
        </span>
        <span className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={offset <= 0}
            onClick={() => setOffset((o) => Math.max(0, o - limit))}
          >
            上一页
          </Button>
          <span className="text-slate-400">
            {offset + 1}–{offset + (data?.candidates.length ?? 0)}
          </span>
          <Button
            variant="outline"
            disabled={(data?.candidates.length ?? 0) < limit}
            onClick={() => setOffset((o) => o + limit)}
          >
            下一页
          </Button>
        </span>
      </div>

      {/* limits 是后端随每次响应返回的覆盖边界声明，第一条是 go-follow spec §4 的**硬要求**
          （这份榜只覆盖「7702 ∩ 活跃 ≥N 笔」，不得表述成「高收益交易者榜」）。默认折叠但
          必须可见 —— 榜单最容易被当成「可以直接跟」的结论。 */}
      {data?.limits?.length ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <button className="text-amber-700 hover:underline" onClick={() => setShowLimits((v) => !v)}>
            {showLimits ? '收起' : '这份榜覆盖什么 / 不覆盖什么'}（{data.limits.length} 条）
          </button>
          {showLimits ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
              {data.limits.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
