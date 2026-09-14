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
        head={[
          '#',
          '地址',
          'roi_closed',
          'realized',
          '买/卖',
          '币',
          'hold_min',
          'hold_p50',
          'rev_min',
          'orphan',
          'closed',
          'USDG腿',
        ]}
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
