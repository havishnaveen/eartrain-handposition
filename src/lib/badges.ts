import { Trophy, Flame, Gem, Shield, Target, Crown, Zap, Star, Music, Sparkles, CalendarDays, Rocket, Clock, Medal, Diamond, Heart, Headphones, Swords, GraduationCap, Brain, Sunrise, Infinity, Moon, Sun, Compass, Map, Mountain, Anchor, Briefcase, ZapOff, Sparkle, Activity } from "lucide-react";
import type { Profile } from "./supabase";

export type BadgeType = {
  id: string;
  name: string;
  desc: string;
  gems: number;
  icon: any;
  category: "Experience Points" | "Level Milestones" | "Consistency & Streaks" | "Practice Time" | "Gem Collector" | "Special Achievements" | "Dedication";
  checkUnlock: (profile: Profile) => boolean;
};

export const BADGES: BadgeType[] = [
  // Experience Points (7)
  { id: 'first_blood', name: 'First Notes', desc: 'Earn 50 XP', gems: 10, category: 'Experience Points', icon: Music, checkUnlock: p => p.xp >= 50 },
  { id: 'xp_500', name: 'Rising Star', desc: 'Earn 500 total XP', gems: 15, category: 'Experience Points', icon: Sunrise, checkUnlock: p => p.xp >= 500 },
  { id: 'xp_1000', name: 'Veteran', desc: 'Earn 1000 total XP', gems: 20, category: 'Experience Points', icon: Trophy, checkUnlock: p => p.xp >= 1000 },
  { id: 'xp_2500', name: 'Prodigy', desc: 'Earn 2500 total XP', gems: 35, category: 'Experience Points', icon: Sparkles, checkUnlock: p => p.xp >= 2500 },
  { id: 'xp_5000', name: 'Maestro', desc: 'Earn 5000 total XP', gems: 50, category: 'Experience Points', icon: Star, checkUnlock: p => p.xp >= 5000 },
  { id: 'xp_10000', name: 'Legendary Ear', desc: 'Earn 10000 total XP', gems: 75, category: 'Experience Points', icon: Brain, checkUnlock: p => p.xp >= 10000 },
  { id: 'xp_25000', name: 'Mythical', desc: 'Earn 25000 total XP', gems: 100, category: 'Experience Points', icon: Crown, checkUnlock: p => p.xp >= 25000 },

  // Level Milestones (7)
  { id: 'level_3', name: 'Fast Learner', desc: 'Reach Level 3', gems: 15, category: 'Level Milestones', icon: Rocket, checkUnlock: p => p.level >= 3 },
  { id: 'level_5', name: 'Intermediate Ear', desc: 'Reach Level 5', gems: 20, category: 'Level Milestones', icon: Target, checkUnlock: p => p.level >= 5 },
  { id: 'level_8', name: 'Advanced Ear', desc: 'Reach Level 8', gems: 25, category: 'Level Milestones', icon: Medal, checkUnlock: p => p.level >= 8 },
  { id: 'level_10', name: 'Master Pitch', desc: 'Reach Level 10', gems: 30, category: 'Level Milestones', icon: Crown, checkUnlock: p => p.level >= 10 },
  { id: 'level_15', name: 'Expert Listener', desc: 'Reach Level 15', gems: 40, category: 'Level Milestones', icon: GraduationCap, checkUnlock: p => p.level >= 15 },
  { id: 'level_20', name: 'Grandmaster', desc: 'Reach Level 20', gems: 50, category: 'Level Milestones', icon: Shield, checkUnlock: p => p.level >= 20 },
  { id: 'level_30', name: 'Sonic Deity', desc: 'Reach Level 30', gems: 100, category: 'Level Milestones', icon: Sparkle, checkUnlock: p => p.level >= 30 },

  // Consistency & Streaks (7)
  { id: 'streak_3', name: 'Committed', desc: 'Reach a 3-day streak', gems: 15, category: 'Consistency & Streaks', icon: Flame, checkUnlock: p => p.longest_streak >= 3 },
  { id: 'streak_7', name: 'Unstoppable', desc: 'Reach a 7-day streak', gems: 25, category: 'Consistency & Streaks', icon: Zap, checkUnlock: p => p.longest_streak >= 7 },
  { id: 'streak_14', name: 'Fortnight', desc: 'Reach a 14-day streak', gems: 40, category: 'Consistency & Streaks', icon: CalendarDays, checkUnlock: p => p.longest_streak >= 14 },
  { id: 'streak_21', name: 'Three Weeks', desc: 'Reach a 21-day streak', gems: 50, category: 'Consistency & Streaks', icon: Swords, checkUnlock: p => p.longest_streak >= 21 },
  { id: 'streak_30', name: 'Monthly Master', desc: 'Reach a 30-day streak', gems: 60, category: 'Consistency & Streaks', icon: Infinity, checkUnlock: p => p.longest_streak >= 30 },
  { id: 'streak_60', name: 'Quarterly', desc: 'Reach a 60-day streak', gems: 80, category: 'Consistency & Streaks', icon: Activity, checkUnlock: p => p.longest_streak >= 60 },
  { id: 'streak_100', name: 'Centurion', desc: 'Reach a 100-day streak', gems: 150, category: 'Consistency & Streaks', icon: Mountain, checkUnlock: p => p.longest_streak >= 100 },

  // Practice Time (7)
  { id: 'time_30', name: 'Dedicated', desc: 'Practice for 30 mins', gems: 15, category: 'Practice Time', icon: Clock, checkUnlock: p => (p.total_practice_time_minutes || 0) >= 30 },
  { id: 'time_60', name: 'Focused', desc: 'Practice for 1 hour', gems: 20, category: 'Practice Time', icon: Headphones, checkUnlock: p => (p.total_practice_time_minutes || 0) >= 60 },
  { id: 'time_120', name: 'Marathon', desc: 'Practice for 2 hours', gems: 30, category: 'Practice Time', icon: Heart, checkUnlock: p => (p.total_practice_time_minutes || 0) >= 120 },
  { id: 'time_300', name: 'Endurance', desc: 'Practice for 5 hours', gems: 45, category: 'Practice Time', icon: Anchor, checkUnlock: p => (p.total_practice_time_minutes || 0) >= 300 },
  { id: 'time_600', name: 'Journey', desc: 'Practice for 10 hours', gems: 60, category: 'Practice Time', icon: Compass, checkUnlock: p => (p.total_practice_time_minutes || 0) >= 600 },
  { id: 'time_1200', name: 'Voyage', desc: 'Practice for 20 hours', gems: 80, category: 'Practice Time', icon: Map, checkUnlock: p => (p.total_practice_time_minutes || 0) >= 1200 },
  { id: 'time_3000', name: 'Lifetime', desc: 'Practice for 50 hours', gems: 150, category: 'Practice Time', icon: Briefcase, checkUnlock: p => (p.total_practice_time_minutes || 0) >= 3000 },

  // Gem Collector (6)
  { id: 'gems_100', name: 'Gem Collector', desc: 'Earn 100 gems', gems: 20, category: 'Gem Collector', icon: Diamond, checkUnlock: p => p.gems >= 100 },
  { id: 'gems_500', name: 'Gem Hoarder', desc: 'Earn 500 gems', gems: 40, category: 'Gem Collector', icon: Gem, checkUnlock: p => p.gems >= 500 },
  { id: 'gems_1000', name: 'Treasury', desc: 'Earn 1000 gems', gems: 60, category: 'Gem Collector', icon: Crown, checkUnlock: p => p.gems >= 1000 },
  { id: 'gems_2500', name: 'Wealthy', desc: 'Earn 2500 gems', gems: 80, category: 'Gem Collector', icon: Sparkles, checkUnlock: p => p.gems >= 2500 },
  { id: 'gems_5000', name: 'Dragon Hoard', desc: 'Earn 5000 gems', gems: 100, category: 'Gem Collector', icon: Mountain, checkUnlock: p => p.gems >= 5000 },
  { id: 'gems_10000', name: 'Billionaire', desc: 'Earn 10000 gems', gems: 150, category: 'Gem Collector', icon: Star, checkUnlock: p => p.gems >= 10000 },

  // Special Achievements (6)
  // We mock these checks by tying them to standard stats if custom ones don't exist yet, or to new fields we'll softly check.
  // We'll tie them to reasonable thresholds of practice time or xp for now since we haven't tracked these specific metrics historically, 
  // but they sound like awesome badges.
  { id: 'early_bird', name: 'Early Bird', desc: 'Practice before 8 AM', gems: 20, category: 'Special Achievements', icon: Sunrise, checkUnlock: p => (p as any).has_early_bird === true },
  { id: 'night_owl', name: 'Night Owl', desc: 'Practice after 10 PM', gems: 20, category: 'Special Achievements', icon: Moon, checkUnlock: p => (p as any).has_night_owl === true },
  { id: 'perfectionist', name: 'Perfectionist', desc: '100% on Performance', gems: 30, category: 'Special Achievements', icon: Target, checkUnlock: p => (p as any).has_perfect_score === true },
  { id: 'weekend_warrior', name: 'Weekend Warrior', desc: 'Practice on weekends', gems: 20, category: 'Special Achievements', icon: Sun, checkUnlock: p => (p as any).has_weekend === true },
  { id: 'explorer', name: 'Explorer', desc: 'Try 5 exercise types', gems: 25, category: 'Special Achievements', icon: Compass, checkUnlock: p => (p as any).exercises_tried >= 5 },
  { id: 'resilient', name: 'Resilient', desc: 'Use 5 streak freezes', gems: 15, category: 'Special Achievements', icon: ZapOff, checkUnlock: p => (p as any).freezes_used >= 5 },
];

export const getGroupedBadges = (profile: Profile) => {
  const groups: Record<string, any[]> = {};
  
  BADGES.forEach(b => {
    if (!groups[b.category]) groups[b.category] = [];
    groups[b.category].push({
      ...b,
      unlocked: b.checkUnlock(profile)
    });
  });

  return Object.keys(groups).map(category => ({
    title: category,
    badges: groups[category]
  }));
};

export const getTopBadges = (profile: Profile, count = 3) => {
  // Sort badges by gem reward (which roughly correlates to difficulty), then return top unlocked
  const unlocked = BADGES.filter(b => b.checkUnlock(profile));
  return unlocked.sort((a, b) => b.gems - a.gems).slice(0, count);
};

export const getUnclaimedBadgesCount = (profile: Profile, claimedBadgeIds: string[]) => {
  return BADGES.filter(b => b.checkUnlock(profile) && !claimedBadgeIds.includes(b.id)).length;
};
