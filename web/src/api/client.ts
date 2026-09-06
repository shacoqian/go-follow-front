export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const API_BASE = '/api'

export const REQUEST_TIMEOUT_MS = 30_000

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

let tokenSource: () => string | null = () => null
let unauthorized: () => void = () => {}

// 由应用入口注入：token 来自会话 store，401 时清会话（幂等，多个并发 401 也只是重复清空）。
export function configureClient(opts: { token: () => string | null; onUnauthorized: () => void }): void {
  tokenSource = opts.token
  unauthorized = opts.onUnauthorized
}

export function messageFor(status: number, backendMessage: string): string {
  switch (status) {
    case 401:
      return '登录已失效，请重新登录'
    case 403:
      return backendMessage || '账号已被管理员锁定'
    case 404:
      return '资源不存在或无权访问'
    case 429:
      return '操作过于频繁，请稍后再试'
  }
  if (status >= 500) return backendMessage || '内部错误'
  return backendMessage || `请求失败（${status}）`
}

export interface Reply<T> {
  status: number
  data: T
}

// requestFull 保留状态码：提现接口用 200/202 区分“已确认写库”与“已广播待确认”，只看 body 分不出来。
export async function requestFull<T>(
  method: Method,
  path: string,
  body?: unknown,
  opts?: { timeoutMs?: number },
): Promise<Reply<T>> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = tokenSource()
  if (token) headers.Authorization = `Bearer ${token}`

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), opts?.timeoutMs ?? REQUEST_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ac.signal,
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new ApiError(0, '请求超时')
    if ((e as { name?: string })?.name === 'AbortError') throw new ApiError(0, '请求超时')
    throw new ApiError(0, '无法连接服务')
  } finally {
    clearTimeout(timer)
  }

  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }
  if (res.ok) return { status: res.status, data: data as T }

  const backendMessage =
    data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
      ? (data as { error: string }).error
      : ''
  if (res.status === 401) unauthorized()
  throw new ApiError(res.status, messageFor(res.status, backendMessage), data ?? undefined)
}

export async function request<T>(method: Method, path: string, body?: unknown, opts?: { timeoutMs?: number }): Promise<T> {
  return (await requestFull<T>(method, path, body, opts)).data
}
