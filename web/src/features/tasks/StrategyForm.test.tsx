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
  expect(screen.getByLabelText('追价上限（%）')).toHaveAttribute('step', 'any')
  expect(screen.getByLabelText('单币加仓次数')).toHaveAttribute('step', '1')
  expect(screen.getByLabelText('重试次数')).toHaveAttribute('step', '1')

  await userEvent.click(screen.getByLabelText('开启止盈止损'))
  expect(screen.getByLabelText('止盈（%）')).toHaveAttribute('step', 'any')
  expect(screen.getByLabelText('止盈卖出比例（%）')).toHaveAttribute('step', 'any')
  expect(screen.getByLabelText('止损（%）')).toHaveAttribute('step', 'any')
  expect(screen.getByLabelText('最长持仓（分钟）')).toHaveAttribute('step', 'any')
})

it('fixed mode shows only the amount; ratio mode shows ratio + our bounds; target filter always visible', async () => {
  const onSubmit = vi.fn()
  render(<StrategyForm defaultValues={defaultStrategy} submitText="创建" onSubmit={onSubmit} />)
  expect(screen.getByLabelText('固定金额（USDG）')).toHaveValue('10')
  expect(screen.queryByLabelText('我方上限（USDG，必填）')).not.toBeInTheDocument()
  expect(screen.getByLabelText('目标最小买入（USDG，可选）')).toHaveValue('')
  expect(screen.getByLabelText('目标最大买入（USDG，可选）')).toHaveValue('')

  await userEvent.click(screen.getByRole('button', { name: '创建' }))
  expect(onSubmit).toHaveBeenCalledWith(defaultStrategy)

  await userEvent.selectOptions(screen.getByLabelText('买入模式'), 'ratio')
  expect(screen.getByLabelText('比例（%）')).toHaveValue('10')
  expect(screen.getByLabelText('我方下限（USDG，可选）')).toHaveValue('')
  expect(screen.getByLabelText('我方上限（USDG，必填）')).toHaveValue('20')
  expect(screen.queryByLabelText('固定金额（USDG）')).not.toBeInTheDocument()

  await userEvent.type(screen.getByLabelText('比例（%）'), '0') // 100%
  await userEvent.type(screen.getByLabelText('我方下限（USDG，可选）'), '30')
  await userEvent.click(screen.getByRole('button', { name: '创建' }))
  expect(await screen.findByText('我方下限不能大于上限')).toBeInTheDocument()
  expect(onSubmit).toHaveBeenCalledTimes(1)

  await userEvent.clear(screen.getByLabelText('我方下限（USDG，可选）'))
  await userEvent.type(screen.getByLabelText('目标最小买入（USDG，可选）'), '100')
  await userEvent.type(screen.getByLabelText('目标最大买入（USDG，可选）'), '1')
  await userEvent.click(screen.getByRole('button', { name: '创建' }))
  expect(await screen.findByText('目标最大买入不能小于最小买入')).toBeInTheDocument()

  await userEvent.clear(screen.getByLabelText('目标最大买入（USDG，可选）'))
  await userEvent.click(screen.getByRole('button', { name: '创建' }))
  expect(onSubmit).toHaveBeenLastCalledWith({ ...defaultStrategy, size_mode: 'ratio', size_value: '100', ratio_min: '', max_per_trade: '20', target_min: '100', target_max: '' })
})

it('switching mode resets the buy fields to that mode defaults and back', async () => {
  render(<StrategyForm defaultValues={defaultStrategy} submitText="创建" onSubmit={vi.fn()} />)
  await userEvent.selectOptions(screen.getByLabelText('买入模式'), 'ratio')
  await userEvent.clear(screen.getByLabelText('我方上限（USDG，必填）'))
  await userEvent.type(screen.getByLabelText('我方上限（USDG，必填）'), '77')
  await userEvent.selectOptions(screen.getByLabelText('买入模式'), 'fixed')
  expect(screen.getByLabelText('固定金额（USDG）')).toHaveValue('10')
  await userEvent.selectOptions(screen.getByLabelText('买入模式'), 'ratio')
  expect(screen.getByLabelText('我方上限（USDG，必填）')).toHaveValue('20')
})

it('clears the stale size_value error when switching modes', async () => {
  const onSubmit = vi.fn()
  render(<StrategyForm defaultValues={defaultStrategy} submitText="创建" onSubmit={onSubmit} />)

  await userEvent.clear(screen.getByLabelText('固定金额（USDG）'))
  await userEvent.click(screen.getByRole('button', { name: '创建' }))
  expect(await screen.findByText('金额必须大于 0')).toBeInTheDocument()
  expect(onSubmit).not.toHaveBeenCalled()

  await userEvent.selectOptions(screen.getByLabelText('买入模式'), 'ratio')
  expect(screen.queryByText('金额必须大于 0')).not.toBeInTheDocument()
})

it('submitDisabled disables the submit button', () => {
  render(<StrategyForm defaultValues={defaultStrategy} submitText="创建" onSubmit={vi.fn()} submitDisabled />)
  expect(screen.getByRole('button', { name: '创建' })).toBeDisabled()
})

it('no longer shows the removed fields; keeps 追价上限 with its hint', () => {
  render(<StrategyForm defaultValues={defaultStrategy} submitText="创建" onSubmit={vi.fn()} />)
  expect(screen.queryByText('总额度（USDG，0=不限）')).not.toBeInTheDocument()
  expect(screen.queryByText('场所')).not.toBeInTheDocument()
  expect(screen.queryByText('计价币')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('跟内盘')).not.toBeInTheDocument()
  expect(screen.queryByText('创建者税上限（%）')).not.toBeInTheDocument()
  expect(screen.queryByText('发射后跳过（秒）')).not.toBeInTheDocument()
  expect(screen.queryByText('黑名单地址（每行一个）')).not.toBeInTheDocument()

  expect(screen.getByLabelText('追价上限（%）')).toBeInTheDocument()
  expect(screen.getByText('含 STOCK 计价信号建议放宽 0.5–1 个百分点')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '风险控制' })).toBeInTheDocument()
})
