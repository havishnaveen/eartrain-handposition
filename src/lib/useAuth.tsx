/// <reference types="vite/client" />
import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { Filter } from 'bad-words'
const filter = new Filter();
import { supabase, Profile } from './supabase'
import { encodeAvatarAndTitle, decodeAvatarAndTitle } from './avatarHelpers'

type AuthContextType = {
  session: Session | null
  user: User | null
  profile: Profile | null
  profilePic: string | null
  setProfilePic: (pic: string | null) => void
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  mockSignIn: (email: string, explicitUsername?: string) => void
  mockSignUp: (email: string, explicitUsername?: string) => void
  updateProfile: (updates: Partial<Profile>) => Promise<void>
  syncUserSettings: (updates: Record<string, any>) => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Use mock auth if no Supabase environment variables are provided
const IS_MOCK = import.meta.env.VITE_SUPABASE_URL === undefined || import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co';

/** Owner account overrides — intentional per project owner's request */
function applyOwnerOverrides(p: Profile, userId: string) {
  if (!p.display_name?.toLowerCase().includes('havish naveen')) return;
  if (p.xp < 2562) p.xp = 2562;
  const badgeKey = `claimedBadges_${userId}`;
  const claimedStr = localStorage.getItem(badgeKey);
  if (claimedStr) {
    const claimed = JSON.parse(claimedStr);
    const toRemove = ['early_bird', 'night_owl', 'perfectionist', 'weekend_warrior', 'explorer', 'resilient'];
    const filtered = claimed.filter((id: string) => !toRemove.includes(id));
    if (filtered.length !== claimed.length) {
      localStorage.setItem(badgeKey, JSON.stringify(filtered));
    }
  }
}

function calculateLevel(xp: number): number {
  const safeXP = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  return Math.floor(safeXP / 50) + 1;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profilePic, setProfilePic] = useState<string | null>(null)

  const [isLoading, setIsLoading] = useState(true)

  const syncTimerRef = useRef<any>(null);
  const pendingUpdatesRef = useRef<Record<string, any>>({});

  const syncUserSettings = (updates: Record<string, any>) => {
    // 1. Instantly update localStorage
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
    }
    window.dispatchEvent(new CustomEvent('syncDataUpdate'))

    // 2. Queue for backend sync
    if (!IS_MOCK && user) {
      pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...updates };
      
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      
      syncTimerRef.current = setTimeout(async () => {
        const currentUpdates = { ...pendingUpdatesRef.current };
        pendingUpdatesRef.current = {}; // clear queue
        
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        if (currentUser) {
          const currentMeta = currentUser.user_metadata?.eartrain_sync || {}
          const newMeta = { ...currentMeta }
          for (const [k, v] of Object.entries(currentUpdates)) {
            if (v === null) delete newMeta[k]
            else newMeta[k] = typeof v === 'string' ? v : JSON.stringify(v)
          }
          await supabase.auth.updateUser({ data: { eartrain_sync: newMeta } })
        }
      }, 5000); // 5-second debounce to safely avoid Supabase rate limits
    }
  }

  // Helper to hydrate localStorage from backend
  const hydrateLocalCache = (syncData: Record<string, any>) => {
    if (!syncData) return
    for (const [key, value] of Object.entries(syncData)) {
      if (value !== null) {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
      }
    }
    window.dispatchEvent(new CustomEvent('syncDataUpdate'))
  }

  const fetchProfile = async (userId: string) => {
    if (IS_MOCK) {
      const mockProfile = localStorage.getItem(`mock_profile_${userId}`);
      if (mockProfile) {
        const p = JSON.parse(mockProfile);
        applyOwnerOverrides(p, userId);
        const calcLevel = calculateLevel(p.xp);
        if (p.level !== calcLevel) {
          p.level = calcLevel;
          localStorage.setItem(`mock_profile_${userId}`, JSON.stringify(p));
        }
        setProfile(p);
      }
      setIsLoading(false);
      return;
    }

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    
    if (data) {
      let p = data as Profile;
      
      const decoded = decodeAvatarAndTitle(p.avatar_url);
      p.avatar_url = decoded.avatar_url;
      p.active_title = p.active_title || decoded.active_title;
      
      const localTitle = localStorage.getItem(`eartrain_active_title_${userId}`);
      
      const localBadgesStr = localStorage.getItem(`claimedBadges_${userId}`);
      const localBadges = localBadgesStr ? JSON.parse(localBadgesStr) : [];
      const backendBadges = decoded.claimed_badges;
      const mergedBadges = [...new Set([...localBadges, ...backendBadges])];
      
      let needsSync = false;
      if (localTitle && localTitle !== p.active_title) {
        p.active_title = localTitle;
        needsSync = true;
      } else if (p.active_title && p.active_title !== localTitle) {
        // Hydrate local cache if backend has an active title but local doesn't match
        localStorage.setItem(`eartrain_active_title_${userId}`, p.active_title);
        window.dispatchEvent(new CustomEvent('titleUpdate'));
      }
      if (mergedBadges.length > backendBadges.length) {
        needsSync = true;
      }
      
      if (needsSync) {
        setTimeout(() => {
          supabase.from('profiles').update({ avatar_url: encodeAvatarAndTitle(p.avatar_url, p.active_title, mergedBadges) }).eq('id', p.id).then(({error}) => {
             if (error) console.error("Sync error", error);
          });
        }, 1000);
      }
      
      localStorage.setItem(`claimedBadges_${userId}`, JSON.stringify(mergedBadges));
      
      setProfilePic(p.avatar_url || null);
      applyOwnerOverrides(p, userId);
      if (p.display_name?.toLowerCase().includes('havish naveen') && p.xp !== data.xp) {
        supabase.from('profiles').update({ xp: p.xp }).eq('id', p.id);
      }
      
      const calcLevel = calculateLevel(p.xp);
      
      // Owner account: restore streak lost due to the earnedReward bug
      if (p.display_name?.toLowerCase().includes('havish naveen')) {
        if (p.current_streak === 1 && p.last_practice_date === '2026-06-08') {
          p.current_streak = 2;
          p.longest_streak = Math.max(p.longest_streak, 2);
          supabase.from('profiles').update({ current_streak: 2, longest_streak: p.longest_streak }).eq('id', p.id);
        }
      }
      if (p.level !== calcLevel) {
        p.level = calcLevel;
        supabase.from('profiles').update({ level: calcLevel }).eq('id', p.id);
      }
      setProfile(p);
    }
    setIsLoading(false);
  }

  const mockSignIn = (email: string, explicitUsername?: string) => {
    localStorage.setItem('mock_active_user', email);
    const id = `mock-user-${email}`;
    const mockUser = { id, email, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: new Date().toISOString() } as User;
    setUser(mockUser);
    
    let profileStr = localStorage.getItem(`mock_profile_${id}`);
    if (!profileStr) {
      const newProfile: Profile = { id, display_name: filter.clean(explicitUsername || email.split('@')[0]), current_streak: 0, longest_streak: 0, last_practice_date: null, total_practice_time_minutes: 0, xp: 0, level: 1, gems: 0, streak_freezes: 0 };
      localStorage.setItem(`mock_profile_${id}`, JSON.stringify(newProfile));
      setProfile(newProfile);
      setProfilePic(localStorage.getItem(`profile_pic_${id}`));
    } else {
      const p = JSON.parse(profileStr);
      applyOwnerOverrides(p, id);
      p.level = calculateLevel(p.xp);
      localStorage.setItem(`mock_profile_${id}`, JSON.stringify(p));
      setProfile(p);
      setProfilePic(localStorage.getItem(`profile_pic_${id}`));
    }
  }

  const updateProfile = async (updates: Partial<Profile>) => {
    if (updates.avatar_url !== undefined) {
      setProfilePic(updates.avatar_url || null);
    }
    if (updates.xp !== undefined && profile) {
      const diff = updates.xp - profile.xp;
      if (diff > 0 && user) {
        const d = new Date();
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const historyKey = `eartrain_xp_history_${user.id}`;
        const history = JSON.parse(localStorage.getItem(historyKey) || '{}');
        history[today] = (history[today] || 0) + diff;
        syncUserSettings({ [historyKey]: history });
      }
    }
    if (!profile) return;
    if (updates.display_name) {
      updates.display_name = filter.clean(updates.display_name);
    }
    let newProfile = { ...profile, ...updates };
    if (newProfile.xp !== undefined) {
      const calcLevel = calculateLevel(newProfile.xp);
      newProfile.level = calcLevel;
      updates.level = calcLevel;
    }
    setProfile(newProfile);
    if (IS_MOCK) {
      localStorage.setItem(`mock_profile_${profile.id}`, JSON.stringify(newProfile));
      return;
    }
    
    const dbUpdates: any = { ...updates };
    
    const finalUrl = updates.avatar_url !== undefined ? updates.avatar_url : profile.avatar_url;
    const finalTitle = updates.active_title !== undefined ? updates.active_title : profile.active_title;
    const currentBadgesStr = localStorage.getItem(`claimedBadges_${profile.id}`);
    const currentBadges = currentBadgesStr ? JSON.parse(currentBadgesStr) : [];
    dbUpdates.avatar_url = encodeAvatarAndTitle(finalUrl, finalTitle, currentBadges);
    delete dbUpdates.active_title;
    
    await supabase.from('profiles').update(dbUpdates).eq('id', profile.id);
  }

  useEffect(() => {
    // One-time admin action: give Aarush 600 gems (owner request)
    if (!IS_MOCK && !localStorage.getItem('admin_aarush_add_600')) {
      supabase.from('profiles').select('*').ilike('display_name', '%Aarush%').then(({ data }) => {
        if (data && data.length > 0) {
          const aarush = data[0];
          const newGems = (aarush.gems || 0) + 600;
          supabase.from('profiles').update({ gems: newGems }).eq('id', aarush.id).then(() => {
             localStorage.setItem('admin_aarush_add_600', 'true');
          });
        } else {
          localStorage.setItem('admin_aarush_add_600', 'true');
        }
      });
    }

    if (IS_MOCK) {
      const activeMockUser = localStorage.getItem('mock_active_user');
      if (activeMockUser) {
        // Automatically restore mock session
        const id = `mock-user-${activeMockUser}`;
        const mockUser = { id, email: activeMockUser, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: new Date().toISOString() } as User;
        setUser(mockUser);
        
        const profileStr = localStorage.getItem(`mock_profile_${id}`);
        if (profileStr) {
          const p = JSON.parse(profileStr);
          applyOwnerOverrides(p, id);
          p.level = calculateLevel(p.xp);
          localStorage.setItem(`mock_profile_${id}`, JSON.stringify(p));
          setProfile(p);
          setProfilePic(localStorage.getItem(`profile_pic_${id}`));
        }
      }
      setIsLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) { 
        if (session.user.user_metadata?.eartrain_sync) {
          hydrateLocalCache(session.user.user_metadata.eartrain_sync)
        }
        fetchProfile(session.user.id); 
      } else {
        setIsLoading(false);
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        if (session.user.user_metadata?.eartrain_sync) {
          hydrateLocalCache(session.user.user_metadata.eartrain_sync)
        }
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
        setIsLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    if (IS_MOCK) {
      localStorage.removeItem('mock_active_user');
      setUser(null);
      setProfile(null);
      return;
    }
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, user, profile, profilePic, setProfilePic, signOut, refreshProfile: async () => { if (user) await fetchProfile(user.id) }, mockSignIn, mockSignUp: mockSignIn, updateProfile, syncUserSettings, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
