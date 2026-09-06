import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  FIXED_DEFAULTS,
  PLATFORMS,
  QUOTE_ASSETS,
  RATIO_DEFAULTS,
  defaultStrategy,
  strategySchema,
  type StrategyValues,
} from './strategySchema'

const SIZE_MODE_OPTIONS = [
  { value: 'fixed', label: '固定金额' },
  { value: 'ratio', label: '按比例' },
]

const SELL_MODE_OPTIONS = [
  { value: 'manual', label: '手动' },
  { value: 'proportional', label: '按比例' },
  { value: 'all', label: '全部' },
]

const SELL_MODE_HINT: Record<StrategyValues['sell_mode'], string> = {
  manual: '手动 = 只手动卖出，不发提醒',
  proportional: '按比例 = 目标卖多少比例我们卖多少',
  all: '全部 = 目标一卖我们全清',
}

const SELL_MODE_SENTENCE = Object.values(SELL_MODE_HINT).join('；')

// 数字输入一律显式写 step：type="number" 默认 step=1，浏览器会用原生校验在 submit 之前挡下 0.5
// 这类小数（表单事件根本不触发）。百分比/分钟字段用 step="any"，次数/秒数字段写明 step="1"。
// jsdom 不跑原生校验，测试只能断言属性本身。
export function StrategyForm({
  defaultValues,
  submitText,
  busy,
  submitDisabled,
  onSubmit,
}: {
  defaultValues: StrategyValues
  submitText: string
  busy?: boolean
  submitDisabled?: boolean
  onSubmit(values: StrategyValues): void
}) {
  const form = useForm<StrategyValues>({ resolver: zodResolver(strategySchema), defaultValues })
  const { register, control, watch, setValue } = form
  const { errors } = form.formState
  const sizeMode = watch('size_mode')
  const tpEnabled = watch('tp_enabled')

  return (
    <form className="space-y-6" onSubmit={form.handleSubmit((v) => onSubmit(v))}>
      <section className="space-y-3 rounded-md border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-700">买入</h2>
        <Field label="买入模式" htmlFor="size_mode">
          {/* 切模式时金额/比例的量纲完全不同（10 USDG vs 10%），沿用旧值会误导，改回该模式的默认值。 */}
          <Select
            id="size_mode"
            options={SIZE_MODE_OPTIONS}
            {...register('size_mode', {
              onChange: (e) => {
                if (e.target.value === 'ratio') {
                  setValue('size_value', RATIO_DEFAULTS.size_value, { shouldValidate: false })
                  setValue('ratio_min', RATIO_DEFAULTS.ratio_min, { shouldValidate: false })
                  setValue('max_per_trade', RATIO_DEFAULTS.max_per_trade, { shouldValidate: false })
                } else {
                  setValue('size_value', FIXED_DEFAULTS.size_value, { shouldValidate: false })
                }
              },
            })}
          />
        </Field>
        {sizeMode === 'fixed' ? (
          <Field
            label="固定金额（USDG）"
            htmlFor="size_value"
            hint="目标买多少都不管，每笔买这个金额"
            error={errors.size_value?.message}
          >
            <Input id="size_value" {...register('size_value')} />
          </Field>
        ) : (
          <>
            <Field
              label="比例（%）"
              htmlFor="size_value"
              hint="我方金额 = 目标买入金额 × 比例，可超过 100"
              error={errors.size_value?.message}
            >
              <Input id="size_value" {...register('size_value')} />
            </Field>
            <Field
              label="我方下限（USDG，可选）"
              htmlFor="ratio_min"
              hint="算出来低于此值就按此值买"
              error={errors.ratio_min?.message}
            >
              <Input id="ratio_min" {...register('ratio_min')} />
            </Field>
            <Field
              label="我方上限（USDG，必填）"
              htmlFor="max_per_trade"
              hint="算出来高于此值就按此值买"
              error={errors.max_per_trade?.message}
            >
              <Input id="max_per_trade" {...register('max_per_trade')} />
            </Field>
          </>
        )}
        <Field label="总额度（USDG，0=不限）" htmlFor="spend_limit" error={errors.spend_limit?.message}>
          <Input id="spend_limit" {...register('spend_limit')} />
        </Field>
        <Field label="单币加仓次数" htmlFor="max_addon_per_token" error={errors.max_addon_per_token?.message}>
          <Input id="max_addon_per_token" type="number" step="1" {...register('max_addon_per_token', { valueAsNumber: true })} />
        </Field>
      </section>

      <section className="space-y-3 rounded-md border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-700">目标买入过滤</h2>
        <Field
          label="目标最小买入（USDG，可选）"
          htmlFor="target_min"
          hint="目标单笔买入低于此值不跟"
          error={errors.target_min?.message}
        >
          <Input id="target_min" {...register('target_min')} />
        </Field>
        <Field
          label="目标最大买入（USDG，可选）"
          htmlFor="target_max"
          hint="目标单笔买入高于此值不跟"
          error={errors.target_max?.message}
        >
          <Input id="target_max" {...register('target_max')} />
        </Field>
      </section>

      <section className="space-y-3 rounded-md border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-700">卖出</h2>
        <Field label="卖出模式" htmlFor="sell_mode">
          <Select id="sell_mode" options={SELL_MODE_OPTIONS} {...register('sell_mode')} />
        </Field>
        <p className="text-xs text-slate-500">{SELL_MODE_SENTENCE}</p>
      </section>

      <section className="space-y-3 rounded-md border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-700">止盈止损</h2>
        <Checkbox
          label="开启止盈止损"
          {...register('tp_enabled', {
            onChange: (e) => {
              if (!e.target.checked) {
                form.setValue('take_profit_pct', defaultStrategy.take_profit_pct, { shouldValidate: false })
                form.setValue('take_profit_sell_pct', defaultStrategy.take_profit_sell_pct, { shouldValidate: false })
                form.setValue('stop_loss_pct', defaultStrategy.stop_loss_pct, { shouldValidate: false })
                form.setValue('max_hold_min', defaultStrategy.max_hold_min, { shouldValidate: false })
              }
            },
          })}
        />
        {tpEnabled && (
          <>
            <Field label="止盈（%）" htmlFor="take_profit_pct" error={errors.take_profit_pct?.message}>
              <Input id="take_profit_pct" type="number" step="any" {...register('take_profit_pct', { valueAsNumber: true })} />
            </Field>
            <Field
              label="止盈卖出比例（%）"
              htmlFor="take_profit_sell_pct"
              error={errors.take_profit_sell_pct?.message}
            >
              <Input
                id="take_profit_sell_pct"
                type="number"
                step="any"
                {...register('take_profit_sell_pct', { valueAsNumber: true })}
              />
            </Field>
            <Field label="止损（%）" htmlFor="stop_loss_pct" error={errors.stop_loss_pct?.message}>
              <Input id="stop_loss_pct" type="number" step="any" {...register('stop_loss_pct', { valueAsNumber: true })} />
            </Field>
            <Field label="最长持仓（分钟）" htmlFor="max_hold_min" error={errors.max_hold_min?.message}>
              <Input id="max_hold_min" type="number" step="any" {...register('max_hold_min', { valueAsNumber: true })} />
            </Field>
          </>
        )}
      </section>

      <section className="space-y-3 rounded-md border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-700">过滤</h2>
        <Controller
          control={control}
          name="platforms"
          render={({ field }) => (
            <Field label="场所" error={errors.platforms?.message}>
              <div className="flex flex-wrap gap-3">
                {PLATFORMS.map((p) => (
                  <Checkbox
                    key={p.value}
                    label={p.label}
                    checked={field.value.includes(p.value)}
                    onChange={(e) => {
                      const next = new Set(field.value)
                      if (e.target.checked) next.add(p.value)
                      else next.delete(p.value)
                      field.onChange(PLATFORMS.filter((x) => next.has(x.value)).map((x) => x.value))
                    }}
                  />
                ))}
              </div>
            </Field>
          )}
        />
        <Controller
          control={control}
          name="quote_assets"
          render={({ field }) => (
            <Field label="计价币" error={errors.quote_assets?.message}>
              <div className="flex flex-wrap gap-3">
                {QUOTE_ASSETS.map((q) => (
                  <Checkbox
                    key={q.value}
                    label={q.label}
                    checked={field.value.includes(q.value)}
                    onChange={(e) => {
                      const next = new Set(field.value)
                      if (e.target.checked) next.add(q.value)
                      else next.delete(q.value)
                      field.onChange(QUOTE_ASSETS.filter((x) => next.has(x.value)).map((x) => x.value))
                    }}
                  />
                ))}
              </div>
            </Field>
          )}
        />
        <Checkbox label="跟内盘" {...register('follow_curve')} />
        <Field label="创建者税上限（%）" htmlFor="max_creator_tax_pct" error={errors.max_creator_tax_pct?.message}>
          <Input id="max_creator_tax_pct" type="number" step="any" {...register('max_creator_tax_pct', { valueAsNumber: true })} />
        </Field>
        <Field label="发射后跳过（秒）" htmlFor="skip_launch_window_sec" error={errors.skip_launch_window_sec?.message}>
          <Input
            id="skip_launch_window_sec"
            type="number"
            step="1"
            {...register('skip_launch_window_sec', { valueAsNumber: true })}
          />
        </Field>
        <Field label="追价上限（%）" htmlFor="max_chase_pct" error={errors.max_chase_pct?.message}>
          <Input id="max_chase_pct" type="number" step="any" {...register('max_chase_pct', { valueAsNumber: true })} />
        </Field>
        <Field label="滑点（%）" htmlFor="slippage_pct" error={errors.slippage_pct?.message}>
          <Input id="slippage_pct" type="number" step="any" {...register('slippage_pct', { valueAsNumber: true })} />
        </Field>
        <Field label="重试次数" htmlFor="retry_max" error={errors.retry_max?.message}>
          <Input id="retry_max" type="number" step="1" {...register('retry_max', { valueAsNumber: true })} />
        </Field>
        <Field label="黑名单地址（每行一个）" htmlFor="token_blacklist" error={errors.token_blacklist?.message}>
          <Textarea id="token_blacklist" rows={4} {...register('token_blacklist')} />
        </Field>
      </section>

      <div className="flex justify-end">
        <Button type="submit" disabled={busy || submitDisabled}>
          {submitText}
        </Button>
      </div>
    </form>
  )
}
