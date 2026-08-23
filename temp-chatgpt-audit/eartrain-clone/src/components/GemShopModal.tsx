import { useState, useEffect } from "react";
import { useAuth } from "@/lib/useAuth";
import { toast } from "sonner";
import { X, Shield, Diamond, Store, Tag } from "lucide-react";
import { PROFILE_TITLES } from "@/lib/titles";

export function GemShopModal({ onClose }: { onClose: () => void }) {
  const { profile, updateProfile, user } = useAuth();
  const [isBuying, setIsBuying] = useState(false);
  const [unlockedTitles, setUnlockedTitles] = useState<string[]>([]);
  const [activeTitle, setActiveTitle] = useState<string | null>(null);

  useEffect(() => {
    if (user?.id) {
      const titles = JSON.parse(localStorage.getItem(`eartrain_unlocked_titles_${user.id}`) || '[]');
      setUnlockedTitles(titles);
      const active = localStorage.getItem(`eartrain_active_title_${user.id}`);
      setActiveTitle(active);
    }
  }, [user?.id]);

  const handleBuyTitle = async (id: string, price: number) => {
    if (!profile || !user?.id) return;
    if (profile.gems < price) {
      toast.error("Not enough gems!");
      return;
    }
    
    setIsBuying(true);
    await updateProfile({ gems: profile.gems - price });
    
    const newUnlocked = [...unlockedTitles, id];
    setUnlockedTitles(newUnlocked);
    localStorage.setItem(`eartrain_unlocked_titles_${user.id}`, JSON.stringify(newUnlocked));
    
    setIsBuying(false);
    toast.success("Title purchased!");
  };

  const handleEquipTitle = (id: string) => {
    if (!user?.id) return;
    setActiveTitle(id);
    localStorage.setItem(`eartrain_active_title_${user.id}`, id);
    updateProfile({ active_title: id });
    toast.success("Title equipped!");
    window.dispatchEvent(new Event('titleUpdate'));
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  const handleBuyStreakFreeze = async () => {
    if (!profile) return;
    if (profile.gems < 100) {
      toast.error("Not enough gems!");
      return;
    }
    
    setIsBuying(true);
    await updateProfile({ 
      gems: profile.gems - 100,
      streak_freezes: profile.streak_freezes + 1
    });
    setIsBuying(false);
    toast.success("Purchased 1 Streak Freeze!");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Blurred overlay */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-md"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="relative w-full max-w-md bg-white dark:bg-[#1a1210] rounded-3xl shadow-2xl overflow-hidden border border-orange-200 dark:border-orange-900/50 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="relative h-32 bg-orange-500 bg-gradient-to-r from-orange-400 to-amber-500 flex items-center justify-center">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/20 text-white hover:bg-black/40 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="text-white font-serif text-3xl font-bold flex items-center gap-3 drop-shadow-md">
            <Store className="w-8 h-8" /> Gem Shop
          </div>
        </div>
        
        {/* Body */}
        <div className="p-6 overflow-y-auto">
          <div className="flex justify-between items-center mb-6 p-4 bg-orange-50 dark:bg-orange-950/20 rounded-2xl border border-orange-100 dark:border-orange-900/30">
            <span className="font-bold text-orange-900 dark:text-orange-200 uppercase text-sm tracking-wider">Your Balance</span>
            <span className="flex items-center gap-2 font-black text-2xl text-orange-500">
              <Diamond className="w-6 h-6 fill-current" /> {profile?.gems || 0}
            </span>
          </div>

          <div className="space-y-4">
            {/* Item: Streak Freeze */}
            <div className="group relative p-4 rounded-2xl border-2 border-orange-200 dark:border-orange-900/30 hover:border-orange-400 dark:hover:border-orange-600/50 transition-colors bg-white dark:bg-black/20 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900/40 text-orange-500">
                  <Shield className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg text-orange-950 dark:text-orange-100">Streak Freeze</h3>
                  <p className="text-sm text-orange-800/60 dark:text-orange-200/60 leading-tight mt-1">
                    Protects your streak if you miss a day of practice.
                  </p>
                </div>
              </div>
              <button 
                onClick={handleBuyStreakFreeze}
                disabled={isBuying || (profile?.gems || 0) < 100}
                className="w-full py-3 rounded-xl font-bold text-sm tracking-wide uppercase transition-all
                  bg-orange-500 hover:bg-orange-400 text-white shadow-md disabled:opacity-50 disabled:cursor-not-allowed
                  flex justify-center items-center gap-2"
              >
                <Diamond className="w-4 h-4 fill-current" /> 100
              </button>
            </div>
            
            <div className="pt-4 pb-2">
              <h3 className="font-bold text-xl text-orange-900 dark:text-orange-200 uppercase tracking-wide flex items-center gap-2">
                <Tag className="w-5 h-5" /> Profile Titles
              </h3>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                Show off your dedication. Titles scale with your design tier!
              </p>
              
              <div className="grid gap-3">
                {PROFILE_TITLES.map(title => {
                  const isUnlocked = unlockedTitles.includes(title.id);
                  const isActive = activeTitle === title.id;
                  return (
                    <div key={title.id} className={`p-3 rounded-xl border-2 transition-colors flex items-center justify-between gap-4 ${
                      isActive 
                        ? "border-orange-500 bg-orange-50 dark:bg-orange-900/20" 
                        : isUnlocked 
                          ? "border-orange-200 dark:border-orange-900/50 bg-white dark:bg-black/20" 
                          : "border-border bg-card/50 opacity-80"
                    }`}>
                      <span className="font-bold text-base truncate flex-1">{title.name}</span>
                      
                      {isActive ? (
                        <button className="px-4 py-2 rounded-lg font-bold text-xs uppercase bg-orange-500 text-white" disabled>
                          Equipped
                        </button>
                      ) : isUnlocked ? (
                        <button 
                          onClick={() => handleEquipTitle(title.id)}
                          className="px-4 py-2 rounded-lg font-bold text-xs uppercase bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/60 transition-colors"
                        >
                          Equip
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleBuyTitle(title.id, title.price)}
                          disabled={isBuying || (profile?.gems || 0) < title.price}
                          className="px-4 py-2 rounded-lg font-bold text-xs uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                        >
                          <Diamond className="w-3 h-3 fill-current" /> {title.price}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
