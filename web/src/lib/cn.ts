import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// 合并 Tailwind 类名：clsx 处理条件，twMerge 消掉冲突（如 px-2 与 px-4 只留后者）。
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
