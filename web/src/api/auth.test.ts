import { authApi } from './auth'
import { healthApi } from './health'
import * as client from './client'

describe('authApi / healthApi', () => {
  const req = vi.spyOn(client, 'request')
  beforeEach(() => req.mockReset())

  it('nonce posts the address', async () => {
    req.mockResolvedValue({ message: 'm' })
    await expect(authApi.nonce('0xAbC')).resolves.toEqual({ message: 'm' })
    expect(req).toHaveBeenCalledWith('POST', '/auth/nonce', { address: '0xAbC' })
  })
  it('verify posts address + signature', async () => {
    req.mockResolvedValue({ token: 't', address: '0xabc', role: 'user', expires_at: 'x' })
    await authApi.verify('0xabc', '0xsig')
    expect(req).toHaveBeenCalledWith('POST', '/auth/verify', { address: '0xabc', signature: '0xsig' })
  })
  it('action posts action + params', async () => {
    req.mockResolvedValue({ message: 'm' })
    await authApi.action('export_wallet', { wallet_id: '1' })
    expect(req).toHaveBeenCalledWith('POST', '/auth/action', { action: 'export_wallet', params: { wallet_id: '1' } })
  })
  it('me / logout / health use the right routes', async () => {
    req.mockResolvedValue({})
    await authApi.me()
    await authApi.logout()
    await healthApi.get()
    expect(req.mock.calls.map((c) => c.slice(0, 2))).toEqual([
      ['GET', '/auth/me'],
      ['POST', '/auth/logout'],
      ['GET', '/health'],
    ])
  })
})
