import { Profile } from "./supabase";

export function getEffectiveStreak(profile: Profile): number {
  if (!profile.last_practice_date) return 0;
  
  // Use local timezone dates to avoid UTC offset issues
  const today = new Date();
  const todayStr = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
  
  const lastPractice = profile.last_practice_date;
  
  if (todayStr === lastPractice) {
    return profile.current_streak;
  }
  
  const todayDate = new Date(todayStr);
  const lastDate = new Date(lastPractice);
  
  const diffDays = Math.floor((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays > 1) {
    if (profile.streak_freezes && diffDays <= profile.streak_freezes + 1) {
      return profile.current_streak;
    }
    return 0;
  }
  
  return profile.current_streak;
}

export function getStreakUpdates(profile: Profile, userId: string | undefined): { updates: Partial<Profile>, toastMessage: string | null } {
  const updates: Partial<Profile> = {};
  let toastMessage: string | null = null;
  
  const now = new Date();
  const today = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
  
  let newStreak = profile.current_streak;
  let newLongest = profile.longest_streak;
  let lastDate = profile.last_practice_date;
  
  const localStreakKey = `eartrain_last_streak_date_${userId || "guest"}`;
  const localLastStreakDate = localStorage.getItem(localStreakKey);

  if (userId && lastDate !== today && localLastStreakDate !== today) {
    localStorage.setItem(localStreakKey, today);
    let streakUpdated = false;
    let freezesUsed = 0;
    
    if (lastDate) {
      const todayD = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const lastDParts = lastDate.split('-').map(Number);
      const lastD = new Date(lastDParts[0], lastDParts[1] - 1, lastDParts[2]);
      const diffTime = Math.abs(todayD.getTime() - lastD.getTime());
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)); 
      
      if (diffDays === 1) {
        newStreak += 1;
        streakUpdated = true;
      } else if (diffDays > 1 && (profile.streak_freezes || 0) >= diffDays - 1) {
        newStreak += 1;
        streakUpdated = true;
        freezesUsed = diffDays - 1;
      } else if (diffDays > 0) {
        newStreak = 1;
        streakUpdated = true;
      }
    } else {
      newStreak = 1;
      streakUpdated = true;
    }
    
    if (newStreak > newLongest) newLongest = newStreak;
    
    if (streakUpdated && newStreak > 1 && freezesUsed === 0) {
      toastMessage = `Streak increased to ${newStreak} days!`;
    } else if (freezesUsed > 0) {
      toastMessage = `${freezesUsed} Streak Freeze${freezesUsed > 1 ? 's' : ''} used! You're now on a ${newStreak} day streak! ❄️`;
      updates.streak_freezes = (profile.streak_freezes || 0) - freezesUsed;
    }
    
    updates.current_streak = newStreak;
    updates.longest_streak = newLongest;
    updates.last_practice_date = today;
  }

  return { updates, toastMessage };
}
