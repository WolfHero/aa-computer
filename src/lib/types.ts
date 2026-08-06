export interface Room {
  id: string
  name: string
  description: string
  created_at: string
  settings: Record<string, unknown>
  version: number
  updated_at: string
  owner_id: string
}

export interface RoomMember {
  id: string
  room_id: string
  user_id: string | null
  name: string
  is_unsubmitted: boolean
  created_at: string
  invite_token?: string | null
}

export interface Bill {
  id?: string
  local_id: string
  room_id: string
  content: string
  amount: number
  paid_at: string
  shared_by: string[]
  created_by: string
  payer_id?: string
  creator_name: string
  created_at: string
  synced: boolean
}

export interface LocalBillStore {
  [roomId: string]: Bill[]
}

export interface AAMemberResult {
  member_id: string
  name: string
  total_paid: number
  total_share: number
  net: number
  self_pay: number
}

export interface AATransfer {
  from_member_id: string
  from_name: string
  to_member_id: string
  to_name: string
  amount: number
}

export interface AAResultData {
  members: AAMemberResult[]
  transfers: AATransfer[]
}

export interface AAResult {
  id: string
  room_id: string
  version: number
  results: AAResultData
  calculated_at: string
}

export interface RoomWithMembers extends Room {
  members: Pick<RoomMember, 'id' | 'name' | 'user_id' | 'is_unsubmitted' | 'created_at'>[]
}

export type RoomMode = 'local' | 'online' | 'expired'

export interface LocalRoom {
  id: string
  name: string
  description: string
  created_at: string
  updated_at: string
  settings: Record<string, unknown>
  version: number
  owner_id: string | null
  mode: RoomMode
  self_member_id: string | null
  members: Pick<RoomMember, 'id' | 'name' | 'user_id' | 'is_unsubmitted' | 'created_at'>[]
}

export interface LocalRoomStore {
  [roomId: string]: LocalRoom
}

export interface LocalRoomFile {
  format: 'aa-local-room'
  version: 1
  exported_at: string
  room: LocalRoom
  bills: Bill[]
  aa_result?: AAResult | null
}

export interface BillFilter {
  content: string
  creator_id: string | null
  paid_at_start: string | null
  paid_at_end: string | null
}

export type SortMode = 'created_at' | 'paid_at'

export interface CachedRoom {
  id: string
  name: string
  description: string
  created_at: string
  settings: Record<string, unknown>
  version: number
  updated_at: string
  owner_id: string
  members: Pick<RoomMember, 'id' | 'name' | 'user_id' | 'is_unsubmitted' | 'created_at'>[]
}

export interface LegacyRoomStore {
  [roomId: string]: CachedRoom
}

export interface LocalAAResultStore {
  [roomId: string]: AAResult
}

export interface ImportBillData {
  localId: string
  content: string
  amount: number
  paidAt: string
  sharedBy: string[]
  createdBy: string
  payerId?: string
  rawRow: string
}

export interface ColumnMapping {
  timePos: string
  contentPos: string
  amountPos: string
}
