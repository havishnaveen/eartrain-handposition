/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Profile = {
  id: string
  display_name: string | null
  current_streak: number
  longest_streak: number
  last_practice_date: string | null
  total_practice_time_minutes: number
  xp: number
  level: number
  gems: number
  streak_freezes: number
  avatar_url?: string | null
  is_public?: boolean
  is_email_verified?: boolean
  active_title?: string | null
}
