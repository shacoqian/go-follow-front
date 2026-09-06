export const OUTCOMES = ['DRY_RUN', 'SKIPPED', 'FAILED', 'EXECUTED'] as const

export function outcomeTone(o: string): 'green' | 'gray' | 'red' | 'blue' {
  if (o === 'DRY_RUN') return 'green'
  if (o === 'SKIPPED') return 'gray'
  if (o === 'FAILED') return 'red'
  return 'blue'
}
