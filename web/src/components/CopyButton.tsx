import { useState } from 'react'
import { Button } from './ui/button'
import { toast } from './ui/toast'

// writeText 在非安全上下文（纯 HTTP 且非 localhost）下不可用：浏览器要么不给
// navigator.clipboard，要么直接抛 NotAllowedError。生产现在就是 http://<ip>:8080，
// 所以必须有降级路径，否则地址、交易哈希这些全都复制不了。
// execCommand('copy') 已废弃但所有目标浏览器仍支持，且不要求安全上下文。
async function writeClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 落到下面的降级实现，不直接判失败
    }
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    // 必须留在文档流内且可聚焦，否则 iOS Safari 选不中；用定位移出视口而不是 display:none。
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, ta.value.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export function CopyButton({ text, label = '复制' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)

  async function copy() {
    if (!(await writeClipboard(text))) {
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
