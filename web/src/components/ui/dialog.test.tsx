import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dialog } from './dialog'

it('renders title/description/children when open and calls onOpenChange on close', async () => {
  const onOpenChange = vi.fn()
  render(
    <Dialog open title="标题" description="说明" onOpenChange={onOpenChange} footer={<button>确定</button>}>
      <p>内容</p>
    </Dialog>,
  )
  expect(screen.getByRole('dialog', { name: '标题' })).toBeInTheDocument()
  expect(screen.getByText('说明')).toBeInTheDocument()
  expect(screen.getByText('内容')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '关闭' }))
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

it('renders nothing when closed', () => {
  render(<Dialog open={false} title="标题" onOpenChange={() => {}}><p>内容</p></Dialog>)
  expect(screen.queryByText('内容')).not.toBeInTheDocument()
})
