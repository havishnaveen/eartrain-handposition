import { Trophy, Flame, Gem, Shield, TrendingUp, BarChart2, Target, Store, Info } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { useAuth } from "@/lib/useAuth";
import { supabase, type Profile } from "@/lib/supabase";
import { motion } from "framer-motion";
import { getRankForXP, getRankTierOverlay } from "@/lib/ranks";
import { PROFILE_TITLES } from "@/lib/titles";

import { AuthModal } from "./AuthModal";
import { GemShopModal } from "./GemShopModal";
import { PublicProfileModal } from "./PublicProfileModal";
import { RankInfoModal } from "./RankInfoModal";

import { useState, useEffect } from "react";

function levelForXP(xp: number): number {
  const safeXP = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  return Math.floor(safeXP / 50) + 1;
}

export function ProgressTab() {
  const { user, profile, profilePic } = useAuth();
  const [isGemShopOpen, setIsGemShopOpen] = useState(false);
  const [leaderboard, setLeaderboard] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [timeRange, setTimeRange] = useState<"7d"|"30d"|"60d"|"90d"|"1y"|"all">("7d");
  const [activeGraph, setActiveGraph] = useState<"xp" | "exercises">("xp");
  const [, setUpdateTrigger] = useState(0);

  useEffect(() => {
    const handleUpdate = () => setUpdateTrigger(prev => prev + 1);
    window.addEventListener('titleUpdate', handleUpdate);
    return () => window.removeEventListener('titleUpdate', handleUpdate);
  }, []);

  const getTitleName = (userId: string, profileActiveTitle?: string | null) => {
    let activeId = profileActiveTitle;
    if (user && userId === user.id) {
       activeId = localStorage.getItem(`eartrain_active_title_${userId}`) || profileActiveTitle;
    }
    if (!activeId) return null;
    const t = PROFILE_TITLES.find(t => t.id === activeId);
    return t ? t.name : null;
  };
  const getGraphData = () => {
    const data = [];
    let days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : timeRange === "60d" ? 60 : timeRange === "90d" ? 90 : timeRange === "1y" ? 365 : 730;
    
    const userCreatedAt = user?.created_at ? new Date(user.created_at).getTime() : new Date().getTime() - 86400000;
    const accountCreateDate = new Date(userCreatedAt);
    accountCreateDate.setHours(0,0,0,0);
    
    const accountAgeDays = Math.ceil((new Date().getTime() - accountCreateDate.getTime()) / 86400000);

    if (timeRange === "all") {
      days = Math.max(1, accountAgeDays);
    }
    
    const interval = Math.max(1, Math.floor(days / (timeRange === "7d" ? 7 : 10)));
    
    let xpHistory: any = {};
    if (user) {
      xpHistory = JSON.parse(localStorage.getItem(`eartrain_xp_history_${user.id}`) || '{}');
    }
    
    let currentCumulativeXP = profile?.xp || 0;
    const historicalDataPoints = [];
    
    for (let i = 0; i <= days; i++) {
       const d = new Date();
       d.setDate(d.getDate() - i);
       d.setHours(0,0,0,0);
       
       const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
       const dailyXpGained = xpHistory[dateKey] || 0;
       
       let plotXp = currentCumulativeXP;
       if (d.getTime() < accountCreateDate.getTime()) {
         plotXp = 0;
       }
       
       historicalDataPoints.push({
         daysAgo: i,
         date: d,
         cumulativeXP: plotXp,
         dailyXpGained: dailyXpGained
       });
       
       currentCumulativeXP -= dailyXpGained;
       if (currentCumulativeXP < 0) currentCumulativeXP = 0;
    }
    
    historicalDataPoints.reverse();

    const points = [];
    for (let i = days; i >= 0; i -= interval) {
      if (i > 0 && i < interval) points.push(0);
      else points.push(i);
    }
    if (points[points.length - 1] !== 0) points.push(0);
    
    const uniquePoints = [...new Set(points)].sort((a,b) => b - a);

    for (let i of uniquePoints) {
      const p = historicalDataPoints.find(dp => dp.daysAgo === i);
      if (!p) continue;
      
      const label = timeRange === "7d" ? p.date.toLocaleDateString("en-US", {weekday: "short"}) : p.date.toLocaleDateString("en-US", {month: "short", day: "numeric"});
      data.push({
        day: label,
        xp: p.cumulativeXP,
        exercises: Math.ceil(p.cumulativeXP / 15)
      });
    }
    
    if (data.length === 1) {
      const p = historicalDataPoints[0];
      const label = timeRange === "7d" ? p.date.toLocaleDateString("en-US", {weekday: "short"}) : p.date.toLocaleDateString("en-US", {month: "short", day: "numeric"});
      return [{ day: label, xp: 0, exercises: 0 }, data[0]];
    }

    return data;
  };

  useEffect(() => {
    if (user) {
          }
  }, [user]);

  useEffect(() => {
    if (!profile) return;
        const fetchLeaderboard = async () => {
      const isMock = import.meta.env.VITE_SUPABASE_URL === undefined || import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co';
      if (isMock) {
        // If mock, just show the user and a fake bot
        setLeaderboard([
          profile,
          
        ].sort((a, b) => b.xp - a.xp));
        return;
      }

      try {
        const { data, error } = await supabase.from('profiles').select('*');
        if (data && data.length > 0 && !error) {
          const modifiedData = (data as Profile[]).map(lbProfile => {
            // Owner account override — intentional (see useAuth.tsx)
            if (lbProfile.display_name?.toLowerCase().includes('havish naveen') && lbProfile.xp < 2562) {
              lbProfile.xp = 2562;
              lbProfile.level = levelForXP(lbProfile.xp);
            }
            return lbProfile;
          }).sort((a, b) => b.xp - a.xp).slice(0, 10);
          setLeaderboard(modifiedData);
        } else {
          setLeaderboard([profile]); // Only show current user if no other data
        }
      } catch (e) {
        setLeaderboard([profile]);
      }
    };
    fetchLeaderboard();
  }, [profile]);

  
  if (!user || !profile) {
    return (
      <div className="text-center py-20 animate-in fade-in">
        <BarChart2 className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
        <h3 className="text-xl font-bold text-foreground mb-2">Track Your Progress</h3>
        <p className="text-muted-foreground mb-6">Sign in to track your progress, earn achievements, and build your streak.</p>
        <AuthModal customTrigger={<Button variant="premium" className="px-8">Sign In</Button>} />
      </div>
    );
  }

  // Level Logic
  const currentXP = profile.xp;
  const calcLevel = levelForXP(currentXP);
  
  const levelStartXP = (calcLevel - 1) * 50;
  const xpIntoLevel = currentXP - levelStartXP;
  const xpForNextLevel = 50;
  const xpProgress = Math.min(100, Math.max(0, (xpIntoLevel / xpForNextLevel) * 100));
  const currentRank = getRankForXP(currentXP);
  const currentUserOverlay = getRankTierOverlay(currentRank.id);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-6xl mx-auto pb-20">
      
      {/* Top XP Card */}
      <Card className="p-8 mb-8 border border-orange-200 dark:border-orange-500/20 relative overflow-hidden shadow-2xl transition-all duration-300">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-50 to-amber-50 dark:hidden" />
        <div className="absolute inset-0 bg-gradient-to-br from-red-950 via-red-900/60 to-orange-950/40 hidden dark:block" />
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-400 to-amber-400 dark:from-orange-500/40 dark:to-amber-500/20" />
        <div className="relative z-10 flex flex-col md:flex-row justify-between md:items-center gap-6">
          <div className="flex items-center gap-8">
            <div className="text-foreground dark:text-white text-center flex-shrink-0">
              <div className="text-5xl font-extrabold font-serif text-orange-500 dark:text-orange-400 drop-shadow-sm">{calcLevel}</div>
              <div className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-widest mt-1">Level</div>
            </div>
            
            <div className="h-12 w-px bg-orange-200 dark:bg-white/10 hidden sm:block" />
            
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg border ${currentUserOverlay.bgClass} ${currentUserOverlay.border} ${currentUserOverlay.avatarOuter}`}>
                {profilePic || profile.avatar_url ? (
                  <img src={profilePic || profile.avatar_url || ''} alt="Profile" className={`w-full h-full object-cover rounded-xl ${currentUserOverlay.avatarInner}`} />
                ) : (
                  <span className={`text-2xl font-bold ${currentUserOverlay.name}`}>{(profile.display_name || 'U').charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="flex flex-col justify-center">
                <div className="flex items-center gap-3 mb-0.5">
                  <div className={`text-2xl font-black tracking-tight ${currentUserOverlay.name}`}>
                    {profile.display_name || "User"}
                  </div>
                </div>
                <div className="text-sm font-bold mb-1 uppercase tracking-widest text-foreground/60">
                  <span className={`inline-block ${currentUserOverlay.name}`}>{currentRank.name} Rank</span>
                </div>
                <div className="text-3xl flex items-center gap-3 drop-shadow-md">
                  <span className={`inline-block ${currentUserOverlay.name}`}>{profile.xp.toLocaleString()} XP</span>
                </div>
              </div>
            </div>
          </div>
          
          {getTitleName(user.id, profile.active_title) && (
            <div className="flex-1 flex justify-center w-full md:w-auto my-4 md:my-0 px-2 lg:px-6">
              <div className={`w-full max-w-sm px-4 lg:px-8 py-3 rounded-2xl border-4 text-sm lg:text-lg font-black tracking-[0.2em] uppercase shadow-2xl flex items-center justify-center text-center backdrop-blur-sm ${currentUserOverlay.bgClass} ${currentUserOverlay.name} ${currentUserOverlay.border}`}>
                <span className="relative z-10 drop-shadow-md">{getTitleName(user.id, profile.active_title)}</span>
              </div>
            </div>
          )}

          <div className="flex gap-4">
            <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-300 font-bold border border-orange-500/20">
              <Gem className="w-5 h-5" /> {profile.gems}
            </div>
            <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-300 font-bold border border-orange-500/20">
              <Shield className="w-5 h-5" /> {profile.streak_freezes}
            </div>
          </div>
        </div>
        
        <div className="mt-10 mb-3 flex justify-between text-xs text-orange-700 dark:text-white/80 font-bold uppercase tracking-wider relative z-10">
          <span>{xpIntoLevel} / {xpForNextLevel} XP</span>
          <span>Level {calcLevel + 1}</span>
        </div>
        <div className="h-3 w-full bg-orange-950/20 dark:bg-black/80 border border-orange-900/30 dark:border-black rounded-full overflow-hidden mb-8 shadow-inner relative z-10">
          <div className="h-full bg-orange-500 rounded-full" style={{ width: `${xpProgress}%` }}></div>
        </div>
        
        <button id="tour-gem-shop" onClick={() => setIsGemShopOpen(true)} className="relative z-10 w-full py-4 rounded-xl bg-white/60 dark:bg-black/20 backdrop-blur-md border border-orange-200 dark:border-orange-500/20 text-orange-800 dark:text-white hover:bg-white/80 dark:hover:bg-black/30 transition-all text-sm font-bold flex items-center justify-center gap-2 group shadow-xl">
          <Store className="w-5 h-5 group-hover:text-brandOrange transition-colors" /> Open Gem Shop
        </button>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-8">
          
          {/* Practice Streak Card */}
          <Card className="p-8 relative overflow-hidden shadow-2xl border border-orange-200 dark:border-yellow-500/20 transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-50 to-orange-50 dark:hidden" />
            <div className="absolute inset-0 bg-gradient-to-br from-orange-950 via-amber-900/60 to-yellow-950/40 hidden dark:block" />
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-400 to-amber-300" />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-8 text-orange-950 dark:text-white font-serif text-2xl font-bold drop-shadow-md">
                <Flame className="w-6 h-6 text-orange-500 dark:text-orange-300" /> Practice Streak
              </div>
            <div className="grid grid-cols-2 gap-6 relative z-10">
              <div className="bg-white/60 dark:bg-black/20 backdrop-blur-sm border border-orange-200 dark:border-white/10 rounded-2xl p-6 text-center shadow-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-orange-400/50 dark:bg-yellow-400/50"></div>
                <div className="text-7xl font-serif font-black text-orange-600 dark:text-white mb-4 tracking-tighter drop-shadow-md">{profile.current_streak}</div>
                <div className="text-sm text-orange-700 dark:text-white/80 font-bold uppercase mb-3">Current Streak</div>
              </div>
              <div className="bg-white/60 dark:bg-black/20 backdrop-blur-sm border border-orange-200 dark:border-white/10 rounded-2xl p-6 text-center shadow-xl">
                <div className="text-7xl font-serif font-black text-orange-600 dark:text-white mb-4 tracking-tighter drop-shadow-md">{profile.longest_streak}</div>
                <div className="text-sm text-orange-700 dark:text-white/80 font-bold uppercase mb-3">Best Streak</div>
              </div>
            </div>
            <p className="text-center mt-6 text-sm text-orange-700 dark:text-white/90 font-bold relative z-10">
              {profile.current_streak === 0 ? "Let's start over and build a strong streak!" : 
               profile.last_practice_date === new Date().toISOString().split('T')[0] ?
               `Streak extended! Come back tomorrow to keep your ${profile.current_streak}-day streak alive.` :
               `Practice today to keep your ${profile.current_streak}-day streak alive!`}
            </p>
            </div>
          </Card>

          {/* Overall Growth Card */}
          <Card id="tour-overall-growth" className="p-8 relative overflow-hidden shadow-2xl border border-orange-200 dark:border-orange-500/20 transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-50 to-orange-100 dark:hidden" />
            <div className="absolute inset-0 bg-gradient-to-br from-orange-950 via-red-950/60 to-orange-950/40 hidden dark:block" />
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-400 to-orange-500 dark:from-orange-500/30 dark:to-orange-500/10" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div className="flex items-center gap-3 text-orange-950 dark:text-white font-serif text-2xl font-bold drop-shadow-md">
                <TrendingUp className="w-6 h-6 text-orange-500 dark:text-white" /> Overall Growth
              </div>
              <RankInfoModal 
                customTrigger={
                  <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-100 dark:bg-orange-500/10 text-orange-600 dark:text-orange-300 font-bold border border-orange-200 dark:border-orange-500/20 hover:bg-orange-200 dark:hover:bg-orange-500/20 transition-colors shadow-sm text-sm whitespace-nowrap">
                    <Info className="w-4 h-4" /> View Tier Info
                  </button>
                }
              />
            </div>
            <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <Card className="p-8 text-center flex flex-col items-center border border-orange-200 dark:border-white/10 shadow-xl bg-white/60 dark:bg-black/20 backdrop-blur-md hover:bg-white/80 dark:hover:bg-black/30 transition-colors">
                <div className="w-16 h-16 rounded-full bg-orange-500/10 dark:bg-white/10 flex items-center justify-center mb-4 border border-orange-400/30 dark:border-white/20">
                  <Flame className="w-8 h-8 text-orange-500 dark:text-white" />
                </div>
                <h3 className="text-3xl font-bold mb-1 text-orange-950 dark:text-white">{profile.current_streak} Days</h3>
                <p className="text-orange-600 dark:text-white/80 font-bold uppercase text-xs">Current Streak</p>
              </Card>
              
              <Card className="p-8 text-center flex flex-col items-center border border-orange-200 dark:border-white/10 shadow-xl bg-white/60 dark:bg-black/20 backdrop-blur-md hover:bg-white/80 dark:hover:bg-black/30 transition-colors">
                <div className="w-16 h-16 rounded-full bg-orange-400/10 dark:bg-white/10 flex items-center justify-center mb-4 border border-orange-400/30 dark:border-white/20">
                  <Trophy className="w-8 h-8 text-orange-400 dark:text-white" />
                </div>
                <h3 className="text-3xl font-bold mb-1 text-orange-950 dark:text-white">{profile.xp.toLocaleString()} XP</h3>
                <p className="text-orange-600 dark:text-white/80 font-bold uppercase text-xs">Total Experience</p>
              </Card>

              <Card className="p-8 text-center flex flex-col items-center border border-orange-200 dark:border-white/10 shadow-xl bg-white/60 dark:bg-black/20 backdrop-blur-md hover:bg-white/80 dark:hover:bg-black/30 transition-colors">
                <div className="w-16 h-16 rounded-full bg-orange-600/10 dark:bg-white/10 flex items-center justify-center mb-4 border border-orange-600/30 dark:border-white/20">
                  <Target className="w-8 h-8 text-orange-600 dark:text-white" />
                </div>
                <h3 className="text-3xl font-bold mb-1 text-orange-950 dark:text-white">Level {profile.level}</h3>
                <p className="text-orange-600 dark:text-white/80 font-bold uppercase text-xs">Current Rank</p>
              </Card>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6 relative z-10">
              <div className="flex flex-wrap items-center gap-2 bg-black/5 dark:bg-white/5 p-1.5 rounded-xl w-max">
              {[
                { id: "7d", label: "7 Days" },
                { id: "30d", label: "30 Days" },
                { id: "60d", label: "60 Days" },
                { id: "90d", label: "90 Days" },
                { id: "1y", label: "1 Year" },
                { id: "all", label: "All Time" }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setTimeRange(t.id as any)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${timeRange === t.id ? 'bg-white dark:bg-orange-500 text-orange-600 dark:text-white shadow-sm' : 'text-orange-900/60 dark:text-white/50 hover:text-orange-900 dark:hover:text-white'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            
            <div className="flex bg-black/5 dark:bg-white/5 p-1.5 rounded-xl w-max">
              <button 
                onClick={() => setActiveGraph("xp")} 
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeGraph === "xp" ? 'bg-orange-500 text-white shadow-sm' : 'text-orange-900/60 dark:text-white/50 hover:text-orange-900 dark:hover:text-white'}`}
              >
                XP Gained
              </button>
              <button 
                onClick={() => setActiveGraph("exercises")} 
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeGraph === "exercises" ? 'bg-orange-400 text-white shadow-sm' : 'text-orange-900/60 dark:text-white/50 hover:text-orange-900 dark:hover:text-white'}`}
              >
                Exercises
              </button>
            </div>
            </div>
            <div className="relative z-10 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={getGraphData()} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorXp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorEx" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#fb923c" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#fb923c" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#888', fontWeight: 600}} dy={10} />
                  <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#888', fontWeight: 600}} dx={0} />
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#888', fontWeight: 600}} dx={10} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 'bold' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px', fontWeight: 'bold', color: '#888' }} />
                  <Area yAxisId="left" type="monotone" dataKey="xp" name="Total XP Gained" stroke="#f97316" strokeWidth={activeGraph === 'xp' ? 4 : 2} strokeDasharray={activeGraph === 'xp' ? "0" : "5 5"} fillOpacity={activeGraph === 'xp' ? 1 : 0.2} fill="url(#colorXp)" />
                  <Area yAxisId="right" type="monotone" dataKey="exercises" name="Exercises Completed" stroke="#fb923c" strokeWidth={activeGraph === 'exercises' ? 4 : 2} strokeDasharray={activeGraph === 'exercises' ? "0" : "5 5"} fillOpacity={activeGraph === 'exercises' ? 1 : 0.2} fill="url(#colorEx)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Leaderboard Card */}
        <Card id="tour-leaderboard" className="p-8 relative overflow-hidden shadow-2xl border border-orange-200 dark:border-amber-500/20 transition-all duration-300 flex flex-col h-fit">
          <div className="absolute inset-0 bg-gradient-to-br from-yellow-50 to-amber-50 dark:hidden" />
          <div className="absolute inset-0 bg-gradient-to-br from-amber-950 via-yellow-950/60 to-orange-950/40 hidden dark:block" />
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-yellow-400 dark:from-amber-500/30 dark:to-yellow-500/10" />
          
          <div className="relative z-10 flex items-center justify-between mb-8">
            <div className="flex items-center gap-3 text-orange-950 dark:text-white font-serif text-2xl font-bold drop-shadow-md">
              <Trophy className="w-6 h-6 text-amber-500 dark:text-white" /> All-Time Leaderboard
            </div>
          </div>

          <div className="relative z-10 flex-1 space-y-3">
            {leaderboard.map((lbProfile, idx) => {

              const isCurrentUser = lbProfile.id === profile.id;
              const rankData = getRankForXP(lbProfile.xp);
              const lbOverlay = getRankTierOverlay(rankData.id);
              
              return (
                <div 
                  key={lbProfile.id + idx} 
                  onClick={() => setSelectedProfile(isCurrentUser ? profile : lbProfile)}
                  className={`flex items-center p-4 rounded-2xl border transition-all cursor-pointer ${isCurrentUser ? 'bg-amber-100/50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/30 shadow-md scale-[1.02]' : 'bg-white/40 dark:bg-black/20 border-orange-200 dark:border-white/5 hover:bg-white/60 dark:hover:bg-black/30'}`}
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="font-black text-lg text-orange-800/50 dark:text-white/30 w-6 text-center">
                      #{idx + 1}
                    </div>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm border flex-shrink-0 ${lbOverlay.bgClass} ${lbOverlay.border} ${lbOverlay.avatarOuter}`}>
                      {(() => {
                        const pic = lbProfile.avatar_url || (lbProfile.id === profile?.id ? profilePic : null);
                        if (pic) return <img src={pic} alt="Profile" className={`w-full h-full object-cover rounded-xl ${lbOverlay.avatarInner}`} />;
                        return <span className={`text-base font-bold ${lbOverlay.name}`}>{(lbProfile.display_name || 'U').charAt(0).toUpperCase()}</span>;
                      })()}
                    </div>
                    <div>
                      <div className={`font-bold text-base flex flex-wrap items-center gap-2 ${lbOverlay.name}`}>
                        {lbProfile.display_name || 'Anonymous'}
                      </div>
                      <div className="text-xs font-semibold text-orange-700/60 dark:text-white/50">{rankData.name} • Lvl {lbProfile.level}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 px-3 flex-shrink-0">
                    {getTitleName(lbProfile.id, lbProfile.active_title) && (
                      <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border-2 border-current font-black opacity-80 ${lbOverlay.name}`}>
                        {getTitleName(lbProfile.id, lbProfile.active_title)}
                      </span>
                    )}

                    {isCurrentUser && <span className="text-[10px] font-black uppercase tracking-widest bg-amber-500 text-white px-2 py-0.5 rounded-full shadow-sm">You</span>}
                  </div>

                  <div className="font-bold text-orange-900 dark:text-white tabular-nums tracking-tight min-w-[80px] text-right flex-shrink-0">
                    {lbProfile.xp.toLocaleString()} <span className="text-orange-500/60 dark:text-white/40 text-xs">XP</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>



      {isGemShopOpen && <GemShopModal onClose={() => setIsGemShopOpen(false)} />}
      {selectedProfile && <PublicProfileModal profile={selectedProfile} onClose={() => setSelectedProfile(null)} isCurrentUser={selectedProfile.id === profile?.id} />}
    </motion.div>
  );
}
