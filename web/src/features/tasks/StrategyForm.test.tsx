import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrategyForm } from './StrategyForm'
import { defaultStrategy } from './strategySchema'

it('submits defaults, toggles ratio label and take-profit block, shows validation errors', async () => {
  const onSubmit = vi.fn()
  render(<StrategyForm defaultValues={defaultStrategy} submitText="创建" onSubmit={onSubmit} />)
  expect(screen.getByLabelText('固定金额（USDG）')).toHaveValue('10')
  expect(screen.queryByLabelText('止盈（%）')).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: '创建' }))
  expect(onSubmit).toHaveBeenCalledWith(defaultStrategy)

  await userEvent.selectOptions(screen.getByLabelText('买入模式'), 'ratio')
  expect(screen.getByLabelText('比例（%）')).toBeInTheDocument()

  await userEvent.click(screen.getByLabelText('开启止盈止损'))
  expect(screen.getByLabelText('止盈（%）')).toBeInTheDocument()
  expect(screen.getByLabelText('止盈卖出比例（%）')).toHaveValue(50)

  const slip = screen.getByLabelText('滑点（%）')
  await userEvent.clear(slip)
  await userEvent.type(slip, '0')
  await userEvent.click(screen.getByRole('button', { name: '创建' }))
  expect(await screen.findByText('滑点须在 0–100 之间')).toBeInTheDocument()
  expect(onSubmit).toHaveBeenCalledTimes(1)
})

it('resets hidden take-profit fields to defaults when tp is disabled again', async () => {
  const onSubmit = vi.fn()
  render(<StrategyForm defaultValues={defaultStrategy} submitText="创建" onSubmit={onSubmit} />)

  await userEvent.click(screen.getByLabelText('开启止盈止损'))
  const tpSell = screen.getByLabelText('止盈卖出比例（%）')
  await userEvent.clear(tpSell)
  await userEvent.click(screen.getByLabelText('开启止盈止损'))
  expect(screen.queryByLabelText('止盈卖出比例（%）')).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: '创建' }))
  expect(onSubmit).toHaveBeenCalledWith(defaultStrategy)
})

// jsdom 不跑浏览器的原生表单校验（type="number" 默认 step=1 会在真实浏览器里拦掉 0.5 这类小数，
// 提交事件根本不会触发），所以这里只能直接断言属性，属性本身就是这条约束的保障。
it('lets percent fields accept decimals and keeps count fields integral', async () => {
  render(<StrategyForm defaultValues={defaultStrategy} submitText="创建" onSubmit={vi.fn()} />)
  expect(screen.getByLabelText('滑点（%）')).toHaveAttribute('step', 'any')
  expect(screen.getByLabelText('创建者税上限（%）')).toHaveAttribute('step', 'any')
  expect(screen.getByLabelText('追价上限（%）')).toHaveAttribute('step', 'any')
  expect(screen.getByLabelText('单币加仓次数')).toHaveAttribute('step', '1')
  expect(screen.getByLabelText('发射后跳过（秒）')).toHaveAttribute('step', '1')
  expect(screen.getByLabelText('重试次数')).toHaveAttribute('step', '1')

  await userEvent.click(screen.getByLabelText('开启止盈止损'))
  expect(screen.getByLabelText('止盈（%）')).toHaveAttribute('step', 'any')
  expect(screen.getByLabelText('止盈卖出比例（%）')).toHaveAttribute('step', 'any')
  expect(screen.getByLabelText('止损（%）')).toHaveAttribute('step', 'any')
  expect(screen.getByLabelText('最长持仓（分钟）')).toHaveAttribute('step', 'any')
})

it('resets the buy size to the mode default when the buy mode changes', async () => {
  render(<StrategyForm defaultValues={defaultStrategy} submitText="创建" onSubmit={vi.fn()} />)
  expect(screen.getByLabelText('固定金额（USDG）')).toHaveValue('10')
  await userEvent.selectOptions(screen.getByLabelText('买入模式'), 'ratio')
  expect(screen.getByLabelText('比例（%）')).toHaveValue('5')
  await userEvent.selectOptions(screen.getByLabelText('买入模式'), 'fixed')
  expect(screen.getByLabelText('固定金额（USDG）')).toHaveValue('10')
})
