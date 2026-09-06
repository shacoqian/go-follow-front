import { getAddress } from 'viem'
import { queryClient } from '@/app/queryClient'
import { ApiError } from '@/api/client'
import { authApi } from '@/api/auth'
import { toast } from '@/components/ui/toast'
import { shortAddress } from '@/lib/format'
import { isOkxInstalled, listAccounts, onAccountsChanged, personalSign, requestAccounts, waitForOkx } from '@/wallets/okx'
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
// 撞在一起）直接拒绝第二个，不排队也不互相打断，调用方自己决定要不要重试。这是 switchAccount
// 自己的互斥锁，只覆盖它自己那段——不包括调用方紧跟着做的成功/失败收尾（见下面 chainBusy）。
let inFlight: Promise<void> | null = null

// chainBusy 覆盖的是"一整条切换链路"：switchAccount 本身 + 紧跟着的成功/失败收尾（onSuccess/
// onError，两者都可能是异步的，比如 accounts 为空时的 logout() 要等后端调用落地）。
// watchAccountChanges 拿它（而不是 inFlight）来判断要不要锁存新事件：只看 inFlight 的话，
// switchAccount 内部已经结束但收尾还没跑完的这段空档里 inFlight 已经是 null 了，这时候来的
// 事件会被当成"没人管"直接派发，跟还没跑完的收尾撞出竞态（该清的会话被提前顶替，或者两边谁
// 清掉谁说不准）。chainBusy 从 runSwitchChain 一开始就置上、到它整个 await 完（含收尾）才
// 清掉，覆盖了这段空档。
let chainBusy: Promise<void> | null = null

// chainBusy 期间收到的 accountsChanged 事件锁存在这里——只留最新一次，链路结束后补跑。
// runSwitchChain 是 AccountMenu 手动切换和 watchAccountChanges 自动切换共用的唯一入口，
// 所以不管这次切换是插件自动触发的还是手动点出来的，跑完都会经过同一处收尾逻辑补上，
// 不会因为发起方不同就漏掉。
let pendingAccounts: string[] | null = null

// chainBusy 的订阅者（AccountMenu 的 useSwitchBusy，用 useSyncExternalStore 接进 React）。
// 只在 chainBusy 从有到无/从无到有那两个时刻通知一次，不是每次切换尝试都通知。
const switchBusyListeners = new Set<() => void>()

function notifySwitchBusy(): void {
  for (const cb of switchBusyListeners) cb()
}

export function isSwitchBusy(): boolean {
  return chainBusy !== null
}

export function subscribeSwitchBusy(cb: () => void): () => void {
  switchBusyListeners.add(cb)
  return () => switchBusyListeners.delete(cb)
}

// 多账号切换：优先复用本机缓存的会话，缓存不可用才重新签名登录；成功后清空查询缓存
// （换账号不能看到上一个账号的数据）。签名被拒、插件只认当前选中账号、或缓存和签名都失败时，
// resumeOrLogin/loginAs 会抛错，原样往上抛——会话和缓存都不动，调用方（runSwitchChain）负责
// 收尾。
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
  }
}

// 切换账号的唯一入口：AccountMenu 手动切换、watchAccountChanges 自动切换都走这里，两边共用
// chainBusy／锁存补跑这套机制。成功/失败各自要做什么（toast、要不要 logout）由调用方通过
// onSuccess/onError 传进来；这个函数本身不管失败往上抛——两边都已经在 callback 里把该做的
// 做完了，没必要再抛一次给调用方兜底。
export async function runSwitchChain(
  address: string,
  handlers: { onSuccess?: () => void | Promise<void>; onError?: (err: unknown) => void | Promise<void> } = {},
): Promise<void> {
  const chain = (async () => {
    try {
      await switchAccount(address)
      await handlers.onSuccess?.()
    } catch (err) {
      await handlers.onError?.(err)
    }
  })()
  // 只有 chainBusy 空着的时候才抢下这次链路的归属权。撞上正在跑的另一条链路时（内部的
  // switchAccount 会因为 inFlight 被占用立刻拒绝，走 onError，跟以前一样），这次调用绝不能
  // 抢走／提前清掉别人的 chainBusy——不然它一结束就把还在真正进行中的那条链路的锁给解了，
  // 后面来的事件会被当成"没人管"直接派发，撞上还没完事的那条链路（可能因此误判成失败、
  // 平白多一次登出）。用 `chainBusy === chain`（而不是单独一个布尔值）判断"这次调用是不是
  // 归属者"：没抢到归属权的调用，chainBusy 从头到尾都不会等于它自己的 chain，天然被挡在
  // finally 的清理／补跑之外。
  if (chainBusy === null) {
    chainBusy = chain
    notifySwitchBusy()
  }
  try {
    await chain
  } finally {
    if (chainBusy === chain) {
      chainBusy = null
      notifySwitchBusy()
      // 整条链路（含失败分支里的收尾，比如 accounts 为空时的 logout()，或者下面
      // handleAccountsChanged 自动切换失败时的 clearSession()+forgetSession()）都落定、
      // chainBusy 也清掉之后才补跑，不然"先补跑 C、C 刚登进去，随后才轮到的失败收尾又把 C 的
      // 会话一起清掉"这种错误顺序就会发生。
      if (pendingAccounts) {
        const latched = pendingAccounts
        pendingAccounts = null
        handleAccountsChanged(latched)
      }
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
// OKX 只会用它当前选中的账号签名——系统内下拉切换会话不经过插件，会话地址和插件当前选中
// 账号完全可能对不上。发起签名前先 listAccounts()（不弹窗）确认一下：插件当前不是会话地址
// 就直接抛错提示用户去 OKX 里切，不发起签名（不白白弹一次注定失败/文不对题的签名窗，也不
// 白白消耗后端的挑战）。listAccounts() 返回空（未安装/未授权）时不拦——那种情况签名请求
// 本身会在别处失败，走现有的错误提示。
export async function signAction(action: string, params: Record<string, string>): Promise<string> {
  const s = useSession.getState().session
  if (!s) throw new Error('未登录')
  const current = await listAccounts()
  if (current.length > 0 && current[0].toLowerCase() !== s.address) {
    throw new Error(`请在 OKX 里切到 ${shortAddress(getAddress(s.address))} 后重试`)
  }
  const { message } = await authApi.action(action, params)
  // 会话里存的是小写地址，签名要用 checksum 形式，和登录时保持一致。
  return personalSign(message, getAddress(s.address))
}

// 被动清会话时顺手忘掉这个地址的缓存——被后端拒绝的会话不该再留在 saved 里等下次切换免签时
// 又被拿出来用一次。main.tsx 的 configureClient 拿这个当 onUnauthorized；下面 refreshMe 的
// 401/403 分支是同一件事的另一个触发点。清完顺手清一下查询缓存：接下来大概率是走登录页
// 重新签名登录另一个地址，A 的列表数据不该在 B 登进去之后还闪一下。
export function onUnauthorized(): void {
  const s = useSession.getState().session
  clearSession()
  if (s) forgetSession(s.address)
  queryClient.clear()
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

// 插件当前选中账号（小写），供 handleAccountsChanged 判断"插件选中是不是真的变了"。
// 只有 handleAccountsChanged（不管是刚收到的事件，还是 chainBusy 期间锁存、事后补跑的）才能
// 更新它——它是唯一的写者，通过下面 setPluginCurrent 这个内部函数写。
// useOkxAccounts 的 refresh()（首次 listAccounts()、它自己的 accountsChanged 监听、
// requestPermissions 成功后的手动刷新）都可能在 chainBusy 期间、或在 watcher 真正处理某次
// accountsChanged 事件之前就跑完；如果它也能直接写 pluginCurrent，就可能抢在 watcher 前面把
// "还没处理的变化"提前记成"已知状态"——等锁存的事件补跑时，比较出来的是"没变"，那次真实的
// 自动切换就被平白吞掉了（复现：锁存期间调一次 notePluginAccounts([C])，drain 时 C 的切换
// 应该照样触发，却因为 pluginCurrent 提前被 hook 写成了 'c' 而被判成"没变"）。所以 hook 那边
// 改成调用下面导出的 notePluginAccounts——它只在 pluginCurrent 还是 null（页面刚加载、
// 还没有任何基准值）时才会真正写一次，之后就是空操作，把"更新"这件事完全让给 watcher。
let pluginCurrent: string | null = null

function setPluginCurrent(accounts: string[]): void {
  pluginCurrent = accounts[0] ? accounts[0].toLowerCase() : null
}

// useOkxAccounts 调用：只在还没有任何基准值时才用它初始化 pluginCurrent（页面刚加载、
// watcher 还没处理过任何一次 accountsChanged）；一旦 watcher 写过一次，这里就是空操作。
// 不触发任何切换/登出逻辑。
export function notePluginAccounts(accounts: string[]): void {
  if (pluginCurrent !== null) return
  setPluginCurrent(accounts)
}

// 仅供测试：pluginCurrent 是模块级状态，不会随 vi.clearAllMocks()/clearAllSessions() 重置，
// 上一个用例留下的值会串到下一个用例，把"首次事件"错判成"没变"。每个用例开始前调它，
// 模拟"页面刚加载、还没有任何基准值"。
export function __resetPluginCurrentForTests(): void {
  pluginCurrent = null
}

// 钱包账号事件：分三种情况——
//   1. accounts 为空：本站被撤销授权/断开，有会话就登出（这种"整个都不认了"的场景才用
//      logout()/clearAllSessions()，清掉本机全部记住的账号——跟下面 onError 分支不是一回事）。
//   2. accounts[0]（插件当前选中项）跟上一次记的 pluginCurrent 一样：插件选中账号没有真的变
//      （锁定/解锁、单纯追加/撤销别的地址的授权等也会触发这个事件），不动会话——哪怕这时
//      会话地址本来就跟 accounts[0] 不一致（比如用户刚在系统内下拉切到了另一个缓存的账号，
//      插件还停在原地），也不该因为这类噪声事件被拽回去。
//   3. 否则（插件选中真的变了）：会话地址跟新的 accounts[0] 不一样就自动对它重新签名登录/
//      复用缓存（runSwitchChain，内部会先试免签的缓存）；一样就什么都不用做。
// 页面刚加载、模块里还没有 pluginCurrent 时，按"变了"处理——这是唯一一种"当前会话地址
// 不等于插件选中账号就自动切换"的默认行为，跟旧版本保持一致。
function handleAccountsChanged(accounts: string[]): void {
  const prev = pluginCurrent
  setPluginCurrent(accounts)
  const s = useSession.getState().session
  if (accounts.length === 0) {
    if (s) void logout()
    return
  }
  const nextLower = accounts[0].toLowerCase()
  if (prev !== null && nextLower === prev) return
  if (!s) return
  if (nextLower === s.address) return
  const next = getAddress(accounts[0])
  void runSwitchChain(next, {
    onSuccess: () => toast.success(`已切换到 ${shortAddress(next)}`),
    onError: () => {
      // 插件自动切到的这个新地址签名失败/被拒——只清掉正在显示的会话（回登录页）和这次
      // 没能切成功的目标地址的缓存（下次别再拿它免签重试），本机记住的其它地址原样保留：
      // 下拉的价值就在于这些缓存，一次自动切换失败不该把它们全部清空。跟用户主动点登出、
      // 或者上面 accounts 为空（插件撤销了整个授权）那种"全部都不认了"的场景不是一回事，
      // 那两种才用 logout()/clearAllSessions()。查询缓存还是要清：接下来大概率要用另一个
      // 地址重新登录，A 的列表数据不该在新账号登进去之后还闪一下。
      toast.error('切换账号失败，请重新登录')
      clearSession()
      forgetSession(next)
      queryClient.clear()
    },
  })
}

export function watchAccountChanges(): () => void {
  if (!isOkxInstalled()) return () => {}
  return onAccountsChanged((accounts) => {
    // 用 chainBusy 而不是 inFlight：chainBusy 覆盖到成功/失败收尾（含失败分支里的
    // clearSession()/forgetSession()，或者 accounts 为空时的 logout()），inFlight 在
    // switchAccount 内部一结束就清了，中间那段空档会被撞出竞态，见上面的注释。
    if (chainBusy) {
      pendingAccounts = accounts
      return
    }
    handleAccountsChanged(accounts)
  })
}
