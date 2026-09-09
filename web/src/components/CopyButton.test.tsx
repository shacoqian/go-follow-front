import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CopyButton } from './CopyButton'

// 生产跑在 http://<ip>:8080（非安全上下文），浏览器会拿掉 navigator.clipboard 或让它抛错。
// 这组用例钉的就是那条降级路径——它失效过一次，地址、交易哈希全都复制不了。
describe('CopyButton', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('安全上下文下走 navigator.clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    render(<CopyButton text="0xabc" />)
    await userEvent.click(screen.getByRole('button', { name: '复制' }))
    expect(writeText).toHaveBeenCalledWith('0xabc')
    expect(await screen.findByRole('button', { name: '已复制' })).toBeInTheDocument()
  })

  it('没有 clipboard API 时降级到 execCommand，仍然成功', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })
    const exec = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true, writable: true })
    render(<CopyButton text="0xabc" />)
    await userEvent.click(screen.getByRole('button', { name: '复制' }))
    expect(exec).toHaveBeenCalledWith('copy')
    expect(await screen.findByRole('button', { name: '已复制' })).toBeInTheDocument()
  })

  it('clipboard 抛错时也降级，不直接判失败', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const exec = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true, writable: true })
    render(<CopyButton text="0xabc" />)
    await userEvent.click(screen.getByRole('button', { name: '复制' }))
    expect(writeText).toHaveBeenCalled()
    expect(exec).toHaveBeenCalledWith('copy')
    expect(await screen.findByRole('button', { name: '已复制' })).toBeInTheDocument()
  })

  it('两条路都失败才报错，且不显示已复制', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })
    Object.defineProperty(document, 'execCommand', {
      value: vi.fn().mockReturnValue(false), configurable: true, writable: true,
    })
    render(<CopyButton text="0xabc" />)
    await userEvent.click(screen.getByRole('button', { name: '复制' }))
    expect(screen.getByRole('button', { name: '复制' })).toBeInTheDocument()
  })
})
