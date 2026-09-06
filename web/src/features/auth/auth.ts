import { getAddress } from 'viem'
import { queryClient } from '@/app/queryClient'
import { ApiError } from '@/api/client'
import { authApi } from '@/api/auth'
import { toast } from '@/components/ui/toast'
import { shortAddress } from '@/lib/format'
import { isOkxInstalled, onAccountsChanged, personalSign, requestAccounts, waitForOkx } from '@/wallets/okx'
import { clearAllSessions, clearSession, forgetSession, savedSession, useSession, type Session } from './session'

// 用指定地址走一遍 SIWE 登录：取消息 → personal_sign(address) → verify → 存会话。
// 地址统一小写存会话（后端 owner 也是小写）。首次连接（loginWithOkx）和多账号切换
// （switchAccount）都走这一条路径，区别只在地址从哪来。
export async function loginAs(address: string): Promise<Session> {
  const { message } = await authApi.nonce(address)
  const signature = await personalSign(message, address)
  const r = await authApi.verify(address, signature)
  const session: Session = {
    token: r.token,
    address: r.address.toLowerCase(),
    role: r.role === 'admin' ? 'admin' : 'user',
    expiresAt: r.expires_at,
  }
  useSession.getState().setSession(session)
  return session
}

// 登录：连接钱包拿地址 → loginAs。
export async function loginWithOkx(): Promise<Session> {
  if (!(await waitForOkx())) throw new Error('未检测到 OKX 钱包，请先安装')
  const address = await requestAccounts()
  return loginAs(address)
}

// 切到一个地址：先看本机是否还留着它上次登录成功的会话——有就拿缓存里的 token 去 /auth/me
// 探一下后端还认不认，免得再弹一次签名。注意这一步在校验通过之前不发布会话（不 setSession）：
// 轮询/挂载中的查询用的还是当前会话，/auth/me 探测失败或半路网络错误都不会让它们背地里换了
// token；只有校验成功才 setSession，把 role 换成 /auth/me 的最新返回。
// 缓存没有、地址对不上（后端返回的 address 和要切的不是同一个）、或者 /auth/me 失败（token
// 过期/被吊销/账号被锁，401/403 或别的错误一并当作"不能用"），就删掉这条缓存，照旧走一遍
// 签名登录（loginAs 失败会原样抛出，调用方——switchAccount/AccountMenu——负责兜底）。
export async function resumeOrLogin(address: string): Promise<Session> {
  const key = address.toLowerCase()
  const saved = savedSession(key)
  if (!saved) return loginAs(address)
  try {
    const me = await authApi.me({ token: saved.token })
    if (me.address.toLowerCase() !== key) {
      forgetSession(key)
      return loginAs(address)
    }
    const session: Session = { ...saved, role: me.role === 'admin' ? 'admin' : 'user' }
    useSession.getState().setSession(session)
    return session
  } catch {
    forgetSession(key)
    return loginAs(address)
  }
}

// switchAccount 同一时间只跑一个：并发调用（比如下拉手快点了两下，或者手动切换和插件自动切换
// 撞在一起）直接拒绝第二个，不排队也不互相打断，调用方自己决定要不要重试。
// watchAccountChanges 收到的 accountsChanged 事件在这期间也先别处理——插件在用户确认切换前后
// 可能连着触发好几次事件，此时会话本来就要变，不该被当成"外部切走了"而登出；未处理完的最新一次
// 事件会被记下来（见下面 pendingAccounts），等这次切换结束后再补一次，不会被平白丢掉。
let inFlight: Promise<void> | null = null

// switchAccount 进行中收到的 accountsChanged 事件锁存在这里——只留最新一次，切换结束后补跑。
// 挂在 switchAccount 自己身上（而不是发起它的那次 handleAccountsChanged 调用）：不管这次切换
// 是插件自动触发的、还是 AccountMenu 手动点出来的，只要有事件在它跑的时候被锁存，跑完都要补上，
// 不会因为发起方不同就漏掉。
let pendingAccounts: string[] | null = null

// 多账号切换：优先复用本机缓存的会话，缓存不可用才重新签名登录；成功后清空查询缓存
// （换账号不能看到上一个账号的数据）。签名被拒、插件只认当前选中账号、或缓存和签名都失败时，
// resumeOrLogin/loginAs 会抛错，原样往上抛——会话和缓存都不动，调用方（AccountMenu）负责把
// 下拉值退回原会话地址并提示用户。
export async function switchAccount(address: string): Promise<void> {
  if (inFlight) throw new Error('切换进行中，请稍候')
  const run = (async () => {
    await resumeOrLogin(address)
    queryClient.clear()
  })()
  inFlight = run
  try {
    await run
  } finally {
    inFlight = null
    // 先清 inFlight 再补跑，不然补跑里如果又要 switchAccount 会被自己刚设的锁挡住。
    if (pendingAccounts) {
      const latched = pendingAccounts
      pendingAccounts = null
      handleAccountsChanged(latched)
    }
  }
}

// 登出：后端失败也要清本地会话——用户点了登出就不该还留在登录态。
// 但 await 后端那一下的空档里，会话可能已经被别的流程（比如 switchAccount 登录成功）替换成
// 新账号——这时不能把新会话也清掉，只清自己进来时看到的那个会话还在场的情况。
// 清的是全部地址的缓存（clearAllSessions）而不只是当前这个——登出就该是登出，不留一个免签的
// 后门，跟 401/403 触发的被动清会话（onUnauthorized、下面 refreshMe 的 401/403 分支，只清
// 当前地址）不是一回事。
export async function logout(): Promise<void> {
  const before = useSession.getState().session
  try {
    await authApi.logout()
  } catch {
    // ignore
  } finally {
    if (useSession.getState().session?.token === before?.token) {
      clearAllSessions()
      // 换人登录不能看到上一个账号的数据：会话清了，缓存也得清。
      queryClient.clear()
    }
  }
}

// 动作签名：每次重新要挑战。后端在 409 时也会消耗挑战，缓存签名只会换来"挑战不存在"。
export async function signAction(action: string, params: Record<string, string>): Promise<string> {
  const s = useSession.getState().session
  if (!s) throw new Error('未登录')
  const { message } = await authApi.action(action, params)
  // 会话里存的是小写地址，签名要用 checksum 形式，和登录时保持一致。
  return personalSign(message, getAddress(s.address))
}

// 被动清会话时顺手忘掉这个地址的缓存——被后端拒绝的会话不该再留在 saved 里等下次切换免签时
// 又被拿出来用一次。main.tsx 的 configureClient 拿这个当 onUnauthorized；下面 refreshMe 的
// 401/403 分支是同一件事的另一个触发点。
export function onUnauthorized(): void {
  const s = useSession.getState().session
  clearSession()
  if (s) forgetSession(s.address)
}

// 启动时校验会话并刷新角色。401/403 清会话（并忘掉这个地址的缓存，理由同 onUnauthorized）；
// 网络错误保留（离线时不把人踢出去）。
export async function refreshMe(): Promise<boolean> {
  try {
    const me = await authApi.me()
    useSession.getState().setRole(me.role === 'admin' ? 'admin' : 'user')
    return true
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) onUnauthorized()
    return false
  }
}

// 钱包切换账号：会话地址一旦不再出现在插件的已授权列表里，分两种情况——列表为空，说明本站
// 被撤销授权/断开，只能登出；列表非空但不含会话地址，说明插件在别处切到了另一个账号，这时不必
// 让用户跑回登录页再点一次，直接对新地址（eth_accounts[0]，插件当前选中项）重新签名登录
// （switchAccount 内部会先试免签的缓存）。
// 会话地址仍在列表里（不管它是不是插件当前选中项，管理授权/锁定解锁之类操作也会触发
// accountsChanged 但顺序里第一项未必是会话地址）就什么都不做。
function handleAccountsChanged(accounts: string[]): void {
  const s = useSession.getState().session
  if (!s) return
  const present = accounts.some((a) => a.toLowerCase() === s.address)
  if (present) return
  if (accounts.length === 0) {
    void logout()
    return
  }
  const next = getAddress(accounts[0])
  void switchAccount(next)
    .then(() => toast.success(`已切换到 ${shortAddress(next)}`))
    .catch(() => {
      toast.error('切换账号失败，请重新登录')
      void logout()
    })
}

export function watchAccountChanges(): () => void {
  if (!isOkxInstalled()) return () => {}
  return onAccountsChanged((accounts) => {
    if (inFlight) {
      pendingAccounts = accounts
      return
    }
    handleAccountsChanged(accounts)
  })
}
