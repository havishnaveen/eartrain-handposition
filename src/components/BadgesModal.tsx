import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Gem, Lock, Award } from "lucide-react";
import { Button } from "./ui/button";
import type { Profile } from "@/lib/supabase";
import { getGroupedBadges } from "@/lib/badges";
import { useAuth } from "@/lib/useAuth";
import { toast } from "sonner";

export function BadgesModal({ 
  profile, 
  onClose,
  isPublicView = false,
  publicClaimedBadges = []
}: { 
  profile: Profile, 
  onClose: () => void,
  isPublicView?: boolean,
  publicClaimedBadges?: string[]
}) {
  const { user, updateProfile } = useAuth();
  const [claimedBadges, setClaimedBadges] = useState<string[]>(isPublicView ? publicClaimedBadges : []);

  useEffect(() => {
    if (!isPublicView && user) {
      const stored = localStorage.getItem(`claimedBadges_${user.id}`);
      if (stored) {
        try {
          setClaimedBadges(JSON.parse(stored));
        } catch(e) {}
      }
    }
  }, [user, isPublicView]);

  const claimBadge = (badgeId: string, gems: number) => {
    if (isPublicView || claimedBadges.includes(badgeId) || !profile || !user || !updateProfile) return;
    const newClaimed = [...claimedBadges, badgeId];
    setClaimedBadges(newClaimed);
    localStorage.setItem(`claimedBadges_${user.id}`, JSON.stringify(newClaimed));
    updateProfile({ gems: profile.gems + gems });
    toast.success(`Badge Claimed! +${gems} Gems`, { icon: <Gem className="text-emerald-500" /> });
  };

  const badgeGroups = getGroupedBadges(profile);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8 bg-black/60 backdrop-blur-md animate-in fade-in" onClick={onClose}>
      <div id="badges-modal-content" className="w-full max-w-6xl max-h-full bg-card border border-border rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border bg-orange-50/50 dark:bg-orange-950/10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shadow-lg border border-orange-200 dark:border-orange-800">
              <Award className="w-6 h-6 text-orange-500 dark:text-orange-400" />
            </div>
            <div>
              <h2 className="text-2xl font-serif font-bold text-foreground">
                {isPublicView ? `${profile.display_name || 'User'}'s Badges` : 'Achievements & Badges'}
              </h2>
              <p className="text-sm font-medium text-orange-600 dark:text-orange-400">
                {isPublicView ? 'Explore their hard-earned milestones' : 'Earn Gems to buy Streak Freezes!'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors text-muted-foreground hover:text-foreground">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 sm:p-8 overflow-y-auto bg-background/50 flex-1">
          <div className="flex flex-col gap-10">
            {badgeGroups.map((group, i) => (
              <div key={i}>
                <h3 className="text-xl font-bold mb-4 text-orange-950 dark:text-orange-50/80 tracking-tight">{group.title}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {group.badges.map((badge: any) => {
                    const isClaimed = claimedBadges.includes(badge.id);
                    const isUnlocked = badge.unlocked;
                    const Icon = badge.icon;

                    return (
                      <div key={badge.id} className={`p-5 rounded-2xl border flex flex-col justify-between transition-all ${isClaimed ? 'bg-emerald-500/10 border-emerald-500/30 dark:bg-emerald-500/10 dark:border-emerald-500/20' : isUnlocked ? 'bg-orange-500/10 border-orange-500/40 shadow-[0_0_15px_rgba(249,115,22,0.15)] scale-105 z-20' : 'bg-white/40 dark:bg-black/20 border-border opacity-70 grayscale'}`}>
                        <div>
                          <div className="flex items-start justify-between mb-2">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isClaimed ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : isUnlocked ? 'bg-orange-500/20 text-orange-600 dark:text-orange-400' : 'bg-gray-200 dark:bg-white/10 text-gray-500 dark:text-white/40'}`}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <div className="flex items-center gap-1 text-sm font-bold text-orange-600 dark:text-orange-300">
                              <Gem className="w-3.5 h-3.5" /> {badge.gems}
                            </div>
                          </div>
                          <h4 className={`font-bold mb-1 ${isClaimed ? 'text-emerald-800 dark:text-emerald-100' : isUnlocked ? 'text-orange-950 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>{badge.name}</h4>
                          <p className={`text-xs mb-4 ${isClaimed ? 'text-emerald-700/80 dark:text-emerald-200/70' : isUnlocked ? 'text-orange-800/80 dark:text-orange-100/70' : 'text-gray-500'}`}>{badge.desc}</p>
                        </div>
                        
                        {!isPublicView && isClaimed && (
                          <div className="w-full py-2 text-center text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Claimed</div>
                        )}
                        {!isPublicView && isUnlocked && !isClaimed && claimBadge && (
                          <Button variant="outline" size="sm" onClick={() => claimBadge(badge.id, badge.gems)} className="w-full shadow-md font-bold tracking-wide border-orange-500 text-orange-600 dark:text-orange-400 hover:bg-orange-500 hover:text-white">
                            Claim Reward
                          </Button>
                        )}
                        {(!isUnlocked || (isPublicView && !isUnlocked)) && (
                          <div className="w-full py-2 text-center text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center justify-center gap-1">
                            <Lock className="w-3 h-3" /> Locked
                          </div>
                        )}
                        {(isPublicView && isUnlocked) && (
                          <div className="w-full py-2 text-center text-xs font-bold text-orange-500 dark:text-orange-400 uppercase tracking-wider">Unlocked</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
