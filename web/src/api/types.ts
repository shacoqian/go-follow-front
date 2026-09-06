export type Role = 'admin' | 'user'

export interface Me {
  address: string
  role: Role
}

export interface VerifyResponse {
  token: string
  address: string
  role: Role
  expires_at: string
}

export interface Health {
  dry_run: boolean
  kill_switch: boolean
  engine_last_block: number
  node_block: number
}
