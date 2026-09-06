import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { PLATFORMS, QUOTE_ASSETS, strategySchema, type StrategyValues } from './strategySchema'

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

export function StrategyForm({
  defaultValues,
  submitText,
  busy,
  onSubmit,
}: {
  defaultValues: StrategyValues
  submitText: string
  busy?: boolean
  onSubmit(values: StrategyValues): void
}) {
  const form = useForm<StrategyValues>({ resolver: zodResolver(strategySchema), defaultValues })
  const { register, control, watch } = form
  const { errors } = form.formState
  const sizeMode = watch('size_mode')
  const sellMode = watch('sell_mode')
  const tpEnabled = watch('tp_enabled')

  return (
    <form className="space-y-6" onSubmit={form.handleSubmit((v) => onSubmit(v))}>
      <section className="space-y-3 rounded-md border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-700">买入</h2>
        <Field label="买入模式" htmlFor="size_mode">
          <Select id="size_mode" options={SIZE_MODE_OPTIONS} {...register('size_mode')} />
        </Field>
        <Field
          label={sizeMode === 'fixed' ? '固定金额（USDG）' : '比例（%）'}
          htmlFor="size_value"
          error={errors.size_value?.message}
        >
          <Input id="size_value" {...register('size_value')} />
        </Field>
        <Field label="单笔上限（USDG）" htmlFor="max_per_trade" error={errors.max_per_trade?.message}>
          <Input id="max_per_trade" {...register('max_per_trade')} />
        </Field>
        <Field label="目标最小交易额（USDG）" htmlFor="min_target_trade" error={errors.min_target_trade?.message}>
          <Input id="min_target_trade" {...register('min_target_trade')} />
        </Field>
        <Field label="总额度（USDG，0=不限）" htmlFor="spend_limit" error={errors.spend_limit?.message}>
          <Input id="spend_limit" {...register('spend_limit')} />
        </Field>
        <Field label="单币加仓次数" htmlFor="max_addon_per_token" error={errors.max_addon_per_token?.message}>
          <Input id="max_addon_per_token" type="number" {...register('max_addon_per_token', { valueAsNumber: true })} />
        </Field>
      </section>

      <section className="space-y-3 rounded-md border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-700">卖出</h2>
        <Field label="卖出模式" htmlFor="sell_mode">
          <Select id="sell_mode" options={SELL_MODE_OPTIONS} {...register('sell_mode')} />
        </Field>
        <p className="text-xs text-slate-500">{SELL_MODE_HINT[sellMode]}</p>
      </section>

      <section className="space-y-3 rounded-md border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-700">止盈止损</h2>
        <Checkbox label="开启止盈止损" {...register('tp_enabled')} />
        {tpEnabled && (
          <>
            <Field label="止盈（%）" htmlFor="take_profit_pct" error={errors.take_profit_pct?.message}>
              <Input id="take_profit_pct" type="number" {...register('take_profit_pct', { valueAsNumber: true })} />
            </Field>
            <Field
              label="止盈卖出比例（%）"
              htmlFor="take_profit_sell_pct"
              error={errors.take_profit_sell_pct?.message}
            >
              <Input
                id="take_profit_sell_pct"
                type="number"
                {...register('take_profit_sell_pct', { valueAsNumber: true })}
              />
            </Field>
            <Field label="止损（%）" htmlFor="stop_loss_pct" error={errors.stop_loss_pct?.message}>
              <Input id="stop_loss_pct" type="number" {...register('stop_loss_pct', { valueAsNumber: true })} />
            </Field>
            <Field label="最长持仓（分钟）" htmlFor="max_hold_min" error={errors.max_hold_min?.message}>
              <Input id="max_hold_min" type="number" {...register('max_hold_min', { valueAsNumber: true })} />
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
                    onChange={(e) =>
                      field.onChange(
                        e.target.checked ? [...field.value, p.value] : field.value.filter((v) => v !== p.value),
                      )
                    }
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
                    onChange={(e) =>
                      field.onChange(
                        e.target.checked ? [...field.value, q.value] : field.value.filter((v) => v !== q.value),
                      )
                    }
                  />
                ))}
              </div>
            </Field>
          )}
        />
        <Checkbox label="跟内盘" {...register('follow_curve')} />
        <Field label="创建者税上限（%）" htmlFor="max_creator_tax_pct" error={errors.max_creator_tax_pct?.message}>
          <Input id="max_creator_tax_pct" type="number" {...register('max_creator_tax_pct', { valueAsNumber: true })} />
        </Field>
        <Field label="发射后跳过（秒）" htmlFor="skip_launch_window_sec" error={errors.skip_launch_window_sec?.message}>
          <Input
            id="skip_launch_window_sec"
            type="number"
            {...register('skip_launch_window_sec', { valueAsNumber: true })}
          />
        </Field>
        <Field label="追价上限（%）" htmlFor="max_chase_pct" error={errors.max_chase_pct?.message}>
          <Input id="max_chase_pct" type="number" {...register('max_chase_pct', { valueAsNumber: true })} />
        </Field>
        <Field label="滑点（%）" htmlFor="slippage_pct" error={errors.slippage_pct?.message}>
          <Input id="slippage_pct" type="number" {...register('slippage_pct', { valueAsNumber: true })} />
        </Field>
        <Field label="重试次数" htmlFor="retry_max" error={errors.retry_max?.message}>
          <Input id="retry_max" type="number" {...register('retry_max', { valueAsNumber: true })} />
        </Field>
        <Field label="黑名单地址（每行一个）" htmlFor="token_blacklist" error={errors.token_blacklist?.message}>
          <Textarea id="token_blacklist" rows={4} {...register('token_blacklist')} />
        </Field>
      </section>

      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {submitText}
        </Button>
      </div>
    </form>
  )
}
