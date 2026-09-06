import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CopyButton } from './CopyButton'

it('copies text and shows feedback', async () => {
  const writeText = vi.fn(async () => {})
  Object.assign(navigator, { clipboard: { writeText } })
  render(<CopyButton text="0xabc" />)
  await userEvent.click(screen.getByRole('button', { name: '复制' }))
  expect(writeText).toHaveBeenCalledWith('0xabc')
  expect(await screen.findByText('已复制')).toBeInTheDocument()
})
