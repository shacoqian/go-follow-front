import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Dialog } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/CopyButton'
import { toast } from '@/components/ui/toast'
import { ApiError } from '@/api/client'
import { walletsApi, type Wallet } from '@/api/wallets'
import { signAction } from '@/features/auth/auth'

export function ExportDialog({
  wallet,
  open,
  onOpenChange,
}: {
  wallet: Wallet
  open: boolean
  onOpenChange(o: boolean): void
}) {
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  // 对话框关闭后把密文从内存里清掉，不留痕迹。
  useEffect(() => {
    if (!open) setKey('')
  }, [open])

  // 内联展示错误，不走全局 toast；signAction 抛出的非 ApiError（比如用户拒签）单独兜底。
  const m = useMutation({
    mutationFn: async (_vars: void) => {
      const sig = await signAction('export_wallet', { wallet_id: String(wallet.id) })
      return walletsApi.exportKey(wallet.id, sig)
    },
    meta: { silent: true },
    onSuccess: (data) => {
      setError(null)
      setKey(data.wallet_key)
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setError(err.status === 429 ? '每分钟最多导出 3 次，请稍后再试' : err.message)
      } else {
        // signAction 失败（例如用户在钱包里拒绝签名）不是 ApiError，走全局 toast 提示。
        toast.error(err instanceof Error ? err.message : '操作失败')
      }
    },
  })

  function onSubmit() {
    setError(null)
    m.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="导出密文">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          导出的是数据库里保存的加密密文，不能直接导入钱包；只有拿到服务端 WALLET_STORE_KEY 才能解密。请妥善保管，不要发给任何人。
        </p>
        {key ? (
          <div className="space-y-2">
            <Textarea readOnly value={key} rows={4} />
            <CopyButton text={key} />
          </div>
        ) : (
          <div className="space-y-2">
            <Button onClick={onSubmit} disabled={m.isPending}>
              签名并导出
            </Button>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}
