import { useState } from 'react'
import { Button } from './ui/button'
import { toast } from './ui/toast'

export function CopyButton({ text, label = '复制' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      toast.error('复制失败，请手动选择文本')
      return
    }
    setDone(true)
    setTimeout(() => setDone(false), 1500)
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={copy}>
      {done ? '已复制' : label}
    </Button>
  )
}
