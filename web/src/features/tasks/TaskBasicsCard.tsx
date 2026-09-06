import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { shortAddress } from '@/lib/format'
import { unitsToUsdg, weiToEth } from '@/lib/amount'
import { TargetDialog } from '@/features/targets/TargetDialog'
import { useInvalidateTargets, useTargets } from '@/features/targets/useTargets'
import { CreateWalletDialog } from '@/features/wallets/CreateWalletDialog'
import { useInvalidateWallets, useWallets } from '@/features/wallets/useWallets'

type Created = { id: number; address: string }
type Option = { value: string; label: string }

// 目标/钱包都按「标签 + 短地址」显示，下拉选项和只读文案共用一份写法。
function displayName(x: { label: string; address: string }): string {
  return `${x.label || '（未命名）'} ${shortAddress(x.address)}`
}

// 对话框关得比列表重取快：这中间 <select value={新 id}> 找不到匹配 option，
// 浏览器会退回第一项（请选择），看着像"白创建了"。用接口返回的地址先补一个选项顶住，
// 重取回来后列表里已经有它了，pending 自然失效（调用方传 null），不需要 effect 去清。
function optionsWith(options: Option[], pending: Created | null): Option[] {
  return pending ? [...options, { value: String(pending.id), label: shortAddress(pending.address) }] : options
}

/**
 * 建单/编辑共用的「基本信息」卡片：选目标、选钱包、看余额。
 * 只读模式（编辑页）不渲染下拉，也不挂对话框——任务建好后目标和钱包不允许改。
 */
export function TaskBasicsCard({
  targetId,
  walletId,
  onTargetChange,
  onWalletChange,
  readOnly,
}: {
  targetId: number | null
  walletId: number | null
  onTargetChange?(id: number): void
  onWalletChange?(id: number): void
  readOnly?: boolean
}) {
  const [addTargetOpen, setAddTargetOpen] = useState(false)
  const [addWalletOpen, setAddWalletOpen] = useState(false)
  // 内联创建刚拿到的 id/地址：列表失效重取还在路上时先顶上，见下面 optionsWith 的说明。
  const [pendingTarget, setPendingTarget] = useState<Created | null>(null)
  const [pendingWallet, setPendingWallet] = useState<Created | null>(null)

  const { data: targets, isLoading: targetsLoading } = useTargets()
  const { data: wallets, isLoading: walletsLoading } = useWallets()
  const invalidateTargets = useInvalidateTargets()
  const invalidateWallets = useInvalidateWallets()

  const targetList = targets ?? []
  const walletList = wallets ?? []
  const target = targetList.find((t) => t.id === targetId)
  // 余额与只读文案在全量钱包里找：任务用的钱包可能已停用，仍要显示得出来。
  const wallet = walletList.find((w) => w.id === walletId)
  const loading = targetsLoading || walletsLoading

  // 钱包还没回来时不留空：先显示占位，别让余额行一闪一闪。
  const balanceLine = wallet
    ? `余额 ${unitsToUsdg(wallet.usdg_balance)} USDG / ${weiToEth(wallet.eth_balance)} ETH`
    : '余额 —'

  const targetOptions = optionsWith(
    targetList.map((t) => ({ value: String(t.id), label: displayName(t) })),
    targetList.some((t) => t.id === pendingTarget?.id) ? null : pendingTarget,
  )
  // pending 是否已"落地"要看下拉实际展示的（active-only）列表，用未过滤的全量列表判断
  // 会在新钱包被停用之前误判为已落地，导致占位选项被过早撤掉。
  const activeWallets = walletList.filter((w) => w.status === 'active')
  const walletOptions = optionsWith(
    activeWallets.map((w) => ({ value: String(w.id), label: displayName(w) })),
    activeWallets.some((w) => w.id === pendingWallet?.id) ? null : pendingWallet,
  )

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 p-4">
      <h2 className="text-base font-semibold">基本信息</h2>

      {loading && <p className="text-sm text-slate-500">加载中…</p>}

      {!loading && readOnly && (
        <div className="space-y-1 text-sm text-slate-600">
          <p>目标 {target ? displayName(target) : `#${targetId}`}</p>
          <p>钱包 {wallet ? displayName(wallet) : `#${walletId}`}</p>
          {wallet && <p>{balanceLine}</p>}
        </div>
      )}

      {!loading && !readOnly && (
        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Field label="目标地址" htmlFor="target">
                <Select
                  id="target"
                  value={targetId == null ? '' : String(targetId)}
                  onChange={(e) => e.target.value && onTargetChange?.(Number(e.target.value))}
                  options={[{ value: '', label: '请选择' }, ...targetOptions]}
                />
              </Field>
            </div>
            <Button type="button" variant="outline" onClick={() => setAddTargetOpen(true)}>
              新增目标
            </Button>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Field label="跟单钱包" htmlFor="wallet">
                <Select
                  id="wallet"
                  value={walletId == null ? '' : String(walletId)}
                  onChange={(e) => e.target.value && onWalletChange?.(Number(e.target.value))}
                  options={[{ value: '', label: '请选择' }, ...walletOptions]}
                />
              </Field>
            </div>
            <Button type="button" variant="outline" onClick={() => setAddWalletOpen(true)}>
              创建钱包
            </Button>
          </div>

          {walletId != null && <p className="text-sm text-slate-600">{balanceLine}</p>}
        </div>
      )}

      {addTargetOpen && (
        <TargetDialog
          open
          onOpenChange={setAddTargetOpen}
          onSaved={(r) => {
            invalidateTargets()
            // 新建才有结果：顺手选中，省得用户回下拉里再找一次。
            if (r) {
              setPendingTarget(r)
              onTargetChange?.(r.id)
            }
          }}
        />
      )}
      {addWalletOpen && (
        <CreateWalletDialog
          open
          onOpenChange={setAddWalletOpen}
          onCreated={(r) => {
            invalidateWallets()
            setPendingWallet(r)
            onWalletChange?.(r.id)
          }}
        />
      )}
    </section>
  )
}
