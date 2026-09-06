import { ApiError, configureClient, messageFor, request, requestFull } from './client'

function jsonResponse(status: number, body: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('request', () => {
  const fetchMock = vi.fn()
  const onUnauthorized = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    onUnauthorized.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    configureClient({ token: () => 'tok123', onUnauthorized })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sends JSON with bearer token under /api and parses the body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }))
    const out = await request<{ ok: boolean }>('POST', '/wallets', { label: 'w' })
    expect(out).toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/wallets')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer tok123')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ label: 'w' }))
  })

  it('omits Authorization and body when there is no token / no body', async () => {
    configureClient({ token: () => null, onUnauthorized })
    fetchMock.mockResolvedValue(jsonResponse(200, {}))
    await request('GET', '/health')
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBeUndefined()
    expect(init.body).toBeUndefined()
  })

  it('maps 409 to the backend error text and keeps the payload', async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { error: '钱包仍被任务引用', task_ids: [3] }))
    const err = (await request('DELETE', '/wallets/1').catch((e: unknown) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(409)
    expect(err.message).toBe('钱包仍被任务引用')
    expect(err.data).toEqual({ error: '钱包仍被任务引用', task_ids: [3] })
  })

  it('calls onUnauthorized exactly once per 401', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: '未登录' }))
    await expect(request('GET', '/auth/me')).rejects.toMatchObject({ status: 401, message: '登录已失效，请重新登录' })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('maps network failure to status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('failed'))
    await expect(request('GET', '/health')).rejects.toMatchObject({ status: 0, message: '无法连接服务' })
  })

  it('tolerates an empty body on success', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    await expect(request('POST', '/auth/logout')).resolves.toBeNull()
  })

  it('requestFull keeps the status code (202 stays distinguishable)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(202, { id: 1, note: '已广播，状态待确认' }))
    const r = await requestFull<{ id: number }>('POST', '/wallets/1/withdraw', { asset: 'ETH', amount: '1' })
    expect(r.status).toBe(202)
    expect(r.data.id).toBe(1)
  })

  it('aborts after the timeout and maps it to 请求超时', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      }),
    )
    const p = requestFull('GET', '/health', undefined, { timeoutMs: 1000 })
    const assertion = expect(p).rejects.toMatchObject({ status: 0, message: '请求超时' })
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
    vi.useRealTimers()
  })
})

describe('messageFor', () => {
  it.each([
    [401, 'x', '登录已失效，请重新登录'],
    [403, '', '账号已被管理员锁定'],
    [403, '用户已被锁定', '用户已被锁定'],
    [404, 'not found', '资源不存在或无权访问'],
    [429, '', '操作过于频繁，请稍后再试'],
    [500, '', '内部错误'],
    [500, '内部错误', '内部错误'],
    [400, 'insufficient', 'insufficient'],
    [418, '', '请求失败（418）'],
  ])('status %i / %s → %s', (status, backend, want) => {
    expect(messageFor(status, backend)).toBe(want)
  })
})
