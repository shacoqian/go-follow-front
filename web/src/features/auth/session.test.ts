import { clearSession, sessionToken, sessionValid, useSession, type Session } from './session'

function put(expiresAt: string): Session {
  const s: Session = { token: 'tok', address: '0xabc', role: 'user', expiresAt }
  useSession.getState().setSession(s)
  return s
}

beforeEach(() => {
  clearSession()
})

it('treats a missing session as invalid', () => {
  expect(sessionValid(null)).toBe(false)
  expect(sessionToken()).toBeNull()
})

it('drops the token once the session has expired', () => {
  const s = put(new Date(Date.now() - 1000).toISOString())
  expect(sessionValid(s)).toBe(false)
  expect(sessionToken()).toBeNull()
})

it('keeps the token while the session is still in the future', () => {
  const s = put(new Date(Date.now() + 60_000).toISOString())
  expect(sessionValid(s)).toBe(true)
  expect(sessionToken()).toBe('tok')
})

it('treats an unparsable expiry as valid — 后端才是权威', () => {
  const s = put('')
  expect(sessionValid(s)).toBe(true)
  expect(sessionToken()).toBe('tok')
  expect(sessionValid({ ...s, expiresAt: '不是时间' })).toBe(true)
})
