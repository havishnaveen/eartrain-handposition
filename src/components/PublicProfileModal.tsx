import { getEffectiveStreak } from '@/lib/streak';
import { X, Flame, Shield, Gem, Star, EyeOff, Trophy, Sparkles } from "lucide-react";
import { Profile } from "@/lib/supabase";
import { useEffect, useState } from "react";
import { getTopBadges } from "@/lib/badges";
import { BadgesModal } from "./BadgesModal";
import { getRankForXP, getRankTierOverlay } from "@/lib/ranks";
import { PROFILE_TITLES } from "@/lib/titles";

export function PublicProfileModal({ profile, onClose, isCurrentUser }: { profile: Profile, onClose: () => void, isCurrentUser?: boolean }) {
  const isPublic = profile.is_public !== false; // Defaults to true if undefined
  const [isBadgesViewOpen, setIsBadgesViewOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If the badges modal is open, let it handle the escape key.
      if (e.key === 'Escape' && !isBadgesViewOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isBadgesViewOpen]);

  const topBadges = getTopBadges(profile, 3);
  const rankData = getRankForXP(profile.xp);
  const overlay = getRankTierOverlay(rankData.id);
  
  const activeTitleObj = profile.active_title ? PROFILE_TITLES.find(t => t.id === profile.active_title) : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
      <div className="w-full max-w-lg bg-card border-2 border-border rounded-[2rem] shadow-2xl relative flex flex-col animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto overflow-x-hidden scrollbar-hide" onClick={e => e.stopPropagation()}>
        
        {/* Header / Avatar Section */}
        <div className={`relative pt-12 pb-6 px-8 flex flex-col items-center text-center flex-shrink-0 ${overlay.bgClass}`}>
          <div className={`absolute inset-0 opacity-20 pointer-events-none ${overlay.avatarOuter}`}></div>
          <button onClick={onClose} className="absolute top-4 right-4 z-50 p-2 rounded-full text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
            <X className="w-6 h-6" />
          </button>
          
          <div className="relative w-32 h-32 mb-8 mt-4 shrink-0">
            {overlay.portal && <div className={`absolute -bottom-8 left-1/2 -translate-x-1/2 z-0 ${overlay.portal}`}></div>}
            
            {overlay.shapes?.map((shape, i) => {
              const style: React.CSSProperties = {
                width: shape.size,
                height: shape.size,
                top: shape.top,
                bottom: shape.bottom,
                left: shape.left,
                right: shape.right,
                clipPath: shape.clipPath,
                WebkitClipPath: shape.clipPath, // For Safari compatibility
                borderRadius: shape.borderRadius,
                background: shape.background,
                border: shape.border,
                boxShadow: shape.boxShadow,
                transform: shape.transform,
              };

              return (
                <div 
                  key={i} 
                  className={`absolute z-0 ${shape.animation || ''}`} 
                  style={style}
                />
              );
            })}
            
            <div className={`absolute inset-0 z-10 rounded-xl ${overlay.border} ${overlay.avatarOuter}`}>
              <div className={`w-full h-full rounded-xl flex items-center justify-center text-6xl font-bold overflow-hidden ${overlay.bgClass}`}>
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="Profile" className={`w-full h-full object-cover rounded-xl ${overlay.avatarInner}`} />
                ) : (
                  <span className={`w-full h-full flex items-center justify-center rounded-xl ${overlay.name}`}>{(profile.display_name || "Anonymous").charAt(0).toUpperCase()}</span>
                )}
              </div>
            </div>
          </div>
          <h2 className={`text-3xl font-bold tracking-tight relative z-10 inline-block ${overlay.name}`}>{profile.display_name || "Anonymous"}</h2>
          
          {activeTitleObj && (
            <div className={`relative z-10 mt-2 px-4 py-1.5 rounded-full font-black tracking-widest uppercase text-xs shadow-md border-2 flex items-center gap-2 ${overlay.bgClass} ${overlay.name} ${overlay.border}`}>
              {activeTitleObj.name}
            </div>
          )}
          
          {profile.display_name?.toLowerCase().includes('havish') && !activeTitleObj && (
            <div className="relative z-10 mt-2 px-3 py-1 rounded-full bg-orange-500 text-white font-bold tracking-widest uppercase text-xs shadow-[0_0_15px_rgba(249,115,22,0.6)] border border-orange-400/50 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              PRODUCER
            </div>
          )}
          <p className="text-orange-900/60 dark:text-white/50 font-semibold mt-1 relative z-10">Level {profile.level}</p>
        </div>
        
        <div className="w-full h-px bg-border my-2" />

        {!isPublic && !isCurrentUser ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <EyeOff className="w-16 h-16 text-muted-foreground/30 mb-6" />
            <h2 className="text-2xl font-bold text-foreground mb-2">Private Profile</h2>
            <p className="text-muted-foreground">This user has chosen to hide their data.</p>
          </div>
        ) : (
          <div className="p-6 md:p-8 space-y-8">
            
            {!isPublic && isCurrentUser && (
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 flex items-center gap-3 text-orange-700 dark:text-orange-400">
                <EyeOff className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm font-semibold">Your profile is currently hidden. Only you can view your profile stats and achievements.</p>
              </div>
            )}

            {/* Statistics Section */}
            <div>
              <h3 className="text-xl font-bold text-foreground mb-4 px-1">Statistics</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="border-2 border-border rounded-2xl p-4 flex items-center gap-4 bg-card hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                  <Flame className="w-8 h-8 text-orange-500 flex-shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-2xl font-bold text-foreground leading-none">{getEffectiveStreak(profile)}</span>
                    <span className="text-sm text-muted-foreground font-semibold mt-1">Day Streak</span>
                  </div>
                </div>
                
                <div className="border-2 border-border rounded-2xl p-4 flex items-center gap-4 bg-card hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                  <Trophy className="w-8 h-8 text-orange-500 flex-shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-2xl font-bold text-foreground leading-none">{profile.longest_streak}</span>
                    <span className="text-sm text-muted-foreground font-semibold mt-1">Best Streak</span>
                  </div>
                </div>
                
                <div className="border-2 border-border rounded-2xl p-4 flex items-center gap-4 bg-card hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                  <Star className="w-8 h-8 text-orange-400 flex-shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-2xl font-bold text-foreground leading-none">{profile.xp}</span>
                    <span className="text-sm text-muted-foreground font-semibold mt-1">Total XP</span>
                  </div>
                </div>

                <div className="border-2 border-border rounded-2xl p-4 flex items-center gap-4 bg-card hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                  <Gem className="w-8 h-8 text-orange-500 flex-shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-2xl font-bold text-foreground leading-none">{profile.gems}</span>
                    <span className="text-sm text-muted-foreground font-semibold mt-1">Gems</span>
                  </div>
                </div>

                <div className="border-2 border-border rounded-2xl p-4 flex items-center gap-4 bg-card hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                  <Shield className="w-8 h-8 text-orange-600 flex-shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-2xl font-bold text-foreground leading-none">{profile.streak_freezes}</span>
                    <span className="text-sm text-muted-foreground font-semibold mt-1">Freezes</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Achievements Section */}
            <div>
              <div className="flex items-center justify-between mb-4 px-1">
                <h3 className="text-xl font-bold text-foreground">Top Achievements</h3>
                <button 
                  onClick={() => setIsBadgesViewOpen(true)}
                  className="text-sm font-bold text-orange-600 dark:text-orange-400 hover:text-orange-500 transition-colors"
                >
                  View All
                </button>
              </div>
              
              <div className="space-y-3">
                {topBadges.length > 0 ? topBadges.map((badge: any) => {
                  const Icon = badge.icon;
                  return (
                    <div key={badge.id} className="flex items-center gap-4 p-4 rounded-2xl border-2 border-border bg-card shadow-sm">
                      <div className="w-14 h-14 rounded-full bg-orange-100 dark:bg-orange-500/20 text-orange-500 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-7 h-7" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-lg font-bold text-foreground">{badge.name}</span>
                        <span className="text-sm text-muted-foreground font-medium">{badge.desc}</span>
                      </div>
                      <div className="ml-auto flex items-center gap-1 text-sm font-bold text-orange-500">
                        <Gem className="w-4 h-4 fill-current" /> {badge.gems}
                      </div>
                    </div>
                  );
                }) : (
                  <div className="p-8 text-center text-muted-foreground border-2 border-dashed border-border rounded-2xl font-semibold">
                    No achievements earned yet.
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </div>

      {isBadgesViewOpen && (
        <BadgesModal profile={profile} onClose={() => setIsBadgesViewOpen(false)} isPublicView={true} />
      )}
    </div>
  );
}
