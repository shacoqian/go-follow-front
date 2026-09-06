import { clearAllSessions, clearSession, forgetSession, savedSession, sessionToken, sessionValid, useSession, type Session } from './session'

function put(expiresAt: string, address = '0xabc'): Session {
  const s: Session = { token: 'tok', address, role: 'user', expiresAt }
  useSession.getState().setSession(s)
  return s
}

beforeEach(() => {
  clearAllSessions()
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

it('setSession remembers the address under saved (keyed by lowercase address)', () => {
  put(new Date(Date.now() + 60_000).toISOString(), '0xabc')
  expect(useSession.getState().saved['0xabc']?.token).toBe('tok')
})

it('setSession(null) only clears the current session, leaving saved untouched', () => {
  put(new Date(Date.now() + 60_000).toISOString(), '0xabc')
  clearSession()
  expect(useSession.getState().session).toBeNull()
  expect(useSession.getState().saved['0xabc']?.token).toBe('tok')
})

it('savedSession returns null and forgets an expired cached session', () => {
  put(new Date(Date.now() - 1000).toISOString(), '0xabc')
  expect(savedSession('0xABC')).toBeNull()
  expect(useSession.getState().saved['0xabc']).toBeUndefined()
})

it('savedSession returns a still-valid cached session by lowercase lookup', () => {
  put(new Date(Date.now() + 60_000).toISOString(), '0xabc')
  expect(savedSession('0xabc')?.token).toBe('tok')
})

it('savedSession returns null for an address with no cache', () => {
  expect(savedSession('0xdead')).toBeNull()
})

it('forgetSession removes just the one address', () => {
  put(new Date(Date.now() + 60_000).toISOString(), '0xabc')
  useSession.getState().setSession({ token: 'tok-b', address: '0xdef', role: 'user', expiresAt: new Date(Date.now() + 60_000).toISOString() })
  forgetSession('0xABC')
  expect(useSession.getState().saved['0xabc']).toBeUndefined()
  expect(useSession.getState().saved['0xdef']?.token).toBe('tok-b')
})

it('clearAllSessions wipes the current session and every cached one', () => {
  put(new Date(Date.now() + 60_000).toISOString(), '0xabc')
  clearAllSessions()
  expect(useSession.getState().session).toBeNull()
  expect(useSession.getState().saved).toEqual({})
})

it('loads old persisted data that has no saved field without throwing', async () => {
  localStorage.setItem(
    'gofollow.session',
    JSON.stringify({ state: { session: { token: 'old', address: '0xabc', role: 'user', expiresAt: '' } }, version: 0 }),
  )
  await useSession.persist.rehydrate()
  expect(useSession.getState().session?.token).toBe('old')
  expect(useSession.getState().saved).toEqual({})
  expect(savedSession('0xabc')).toBeNull()
})

it('setRole mirrors the role change into the saved copy for the current address', () => {
  put(new Date(Date.now() + 60_000).toISOString(), '0xabc')
  useSession.getState().setRole('admin')
  expect(useSession.getState().session?.role).toBe('admin')
  expect(useSession.getState().saved['0xabc']?.role).toBe('admin')
})

it('prunes expired saved sessions on rehydrate, keeping the still-valid ones', async () => {
  const validExp = new Date(Date.now() + 60_000).toISOString()
  const expiredExp = new Date(Date.now() - 1000).toISOString()
  localStorage.setItem(
    'gofollow.session',
    JSON.stringify({
      state: {
        session: null,
        saved: {
          '0xabc': { token: 'still-good', address: '0xabc', role: 'user', expiresAt: validExp },
          '0xdef': { token: 'stale', address: '0xdef', role: 'user', expiresAt: expiredExp },
        },
      },
      version: 0,
    }),
  )
  await useSession.persist.rehydrate()
  expect(useSession.getState().saved['0xdef']).toBeUndefined()
  expect(useSession.getState().saved['0xabc']?.token).toBe('still-good')
})
