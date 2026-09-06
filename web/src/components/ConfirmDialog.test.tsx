import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from './ConfirmDialog'

it('confirms and cancels', async () => {
  const onConfirm = vi.fn()
  const onOpenChange = vi.fn()
  render(<ConfirmDialog open title="禁用钱包" description="禁用后不再跟单" confirmText="禁用" destructive onConfirm={onConfirm} onOpenChange={onOpenChange} />)
  await userEvent.click(screen.getByRole('button', { name: '禁用' }))
  expect(onConfirm).toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

it('renders exactly one dismiss button (no duplicate close)', () => {
  render(
    <ConfirmDialog
      open
      title="禁用钱包"
      description="禁用后不再跟单"
      confirmText="禁用"
      destructive
      onConfirm={() => {}}
      onOpenChange={() => {}}
    />,
  )
  expect(screen.getAllByRole('button')).toHaveLength(2)
})

it('is non-dismissable while busy', async () => {
  const onConfirm = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <ConfirmDialog
      open
      title="禁用钱包"
      description="禁用后不再跟单"
      confirmText="禁用"
      destructive
      busy
      onConfirm={onConfirm}
      onOpenChange={onOpenChange}
    />,
  )
  expect(screen.getByRole('button', { name: '禁用' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '取消' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(onOpenChange).not.toHaveBeenCalled()
})
