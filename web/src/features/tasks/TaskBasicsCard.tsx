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

// 目标/钱包都按「标签 + 短地址」显示，下拉选项和只读文案共用一份写法。
function displayName(x: { label: string; address: string }): string {
  return `${x.label || '（未命名）'} ${shortAddress(x.address)}`
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

  const { data: targets, isLoading: targetsLoading } = useTargets()
  const { data: wallets, isLoading: walletsLoading } = useWallets()
  const invalidateTargets = useInvalidateTargets()
  const invalidateWallets = useInvalidateWallets()

  const target = (targets ?? []).find((t) => t.id === targetId)
  // 余额与只读文案在全量钱包里找：任务用的钱包可能已停用，仍要显示得出来。
  const wallet = (wallets ?? []).find((w) => w.id === walletId)
  const loading = targetsLoading || walletsLoading

  const balanceLine = wallet
    ? `余额 ${unitsToUsdg(wallet.usdg_balance)} USDG / ${weiToEth(wallet.eth_balance)} ETH`
    : ''

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
                  options={[
                    { value: '', label: '请选择' },
                    ...(targets ?? []).map((t) => ({ value: String(t.id), label: displayName(t) })),
                  ]}
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
                  options={[
                    { value: '', label: '请选择' },
                    ...(wallets ?? [])
                      .filter((w) => w.status === 'active')
                      .map((w) => ({ value: String(w.id), label: displayName(w) })),
                  ]}
                />
              </Field>
            </div>
            <Button type="button" variant="outline" onClick={() => setAddWalletOpen(true)}>
              创建钱包
            </Button>
          </div>

          {wallet && <p className="text-sm text-slate-600">{balanceLine}</p>}
        </div>
      )}

      {addTargetOpen && (
        <TargetDialog
          open
          onOpenChange={setAddTargetOpen}
          onSaved={(r) => {
            invalidateTargets()
            // 新建才有结果：顺手选中，省得用户回下拉里再找一次。
            if (r) onTargetChange?.(r.id)
          }}
        />
      )}
      {addWalletOpen && (
        <CreateWalletDialog
          open
          onOpenChange={setAddWalletOpen}
          onCreated={(r) => {
            invalidateWallets()
            onWalletChange?.(r.id)
          }}
        />
      )}
    </section>
  )
}
