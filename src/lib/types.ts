export interface Room {
  id: string
  name: string
  description: string
  created_at: string
  settings: Record<string, unknown>
  version: number
  updated_at: string
}

export interface RoomMember {
  id: string
  room_id: string
  user_id: string
  name: string
  is_unsubmitted: boolean
  created_at: string
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
  members: Pick<RoomMember, 'id' | 'name' | 'user_id' | 'is_unsubmitted'>[]
}

export interface BillFilter {
  content: string
  creator_id: string | null
  paid_at_start: string | null
  paid_at_end: string | null
}

export type SortMode = 'created_at' | 'paid_at'
