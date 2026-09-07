import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Field } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { blacklistApi, type BlacklistResult } from '@/api/blacklist'
import { parseBlacklistText } from './parse'

export default function BlacklistPage() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, isSuccess } = useQuery({ queryKey: ['blacklist'], queryFn: blacklistApi.get })
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  // 只在数据第一次到达时把 textarea 填成现有地址，后续 refetch/重渲染不再覆盖用户正在编辑的内容。
  const initialized = useRef(false)

  useEffect(() => {
    if (data && !initialized.current) {
      initialized.current = true
      setText(data.tokens.join('\n'))
    }
  }, [data])

  const save = useMutation({
    mutationFn: (tokens: string[]) => blacklistApi.put(tokens),
    meta: { silent: true },
    onSuccess: (result: BlacklistResult) => {
      queryClient.setQueryData(['blacklist'], result)
      toast.success('黑名单已保存')
      if (result.warning) toast.error(result.warning)
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : '操作失败')
    },
  })

  const parsed = parseBlacklistText(text)

  function onSave() {
    if (parsed.error) {
      setError(parsed.error)
      return
    }
    setError(null)
    save.mutate(parsed.tokens)
  }

  // 全量替换的 PUT 在 GET 成功前不能发出去：这时 textarea 还是空的，保存会把服务端已有的名单清空。
  const count = parsed.error
    ? text.split('\n').map((l) => l.trim()).filter(Boolean).length
    : parsed.tokens.length

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">黑名单</h1>
      <p className="text-sm text-slate-500">每行一个代币地址，对你的所有跟单任务生效，只拦买入</p>
      {isLoading ? (
        <p className="text-sm text-slate-500">加载中…</p>
      ) : isError ? (
        <p className="text-sm text-red-600">加载失败</p>
      ) : (
        <>
          <Field label="地址列表" htmlFor="blacklist-textarea" error={error ?? undefined}>
            <Textarea
              id="blacklist-textarea"
              rows={12}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                if (error) setError(null)
              }}
            />
          </Field>
          <p className="text-xs text-slate-500">共 {count} 条</p>
          <div className="flex justify-end">
            <Button onClick={onSave} disabled={save.isPending || !isSuccess}>
              保存
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
