import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { LogOut, Settings, SlidersHorizontal } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import { AccountSettingsModal } from "./AccountSettingsModal";
import { getRankForXP, getRankTierOverlay } from "@/lib/ranks";

export function SettingsMenu() {
  const { user, profile, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [settingsModalTab, setSettingsModalTab] = useState<'account' | 'preferences' | 'help' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user || !profile) return null;

  const rankData = getRankForXP(profile.xp);
  const overlay = getRankTierOverlay(rankData.id);

  return (
    <div className="relative" ref={menuRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 pl-3 pr-1 py-1 rounded-full ${overlay.bgClass} border ${overlay.border} hover:opacity-90 transition-all shadow-sm`}
      >
        <span className={`inline-block text-sm font-bold max-w-[100px] truncate ${overlay.name}`}>
          {profile.display_name || user.email?.split('@')[0]}
        </span>
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="Profile" className={`w-8 h-8 rounded-full object-cover ${overlay.avatarInner}`} />
        ) : (
          <div className={`w-8 h-8 rounded-full bg-black/20 flex items-center justify-center ${overlay.name} ${overlay.avatarInner}`}>
            <Settings className="w-4 h-4" />
          </div>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-3 w-72 bg-card border border-border rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
          <div className={`p-4 border-b border-border ${overlay.bgClass} relative overflow-hidden`}>
            <div className={`absolute inset-0 opacity-20 pointer-events-none ${overlay.avatarOuter}`}></div>
            <span className={`inline-block text-base font-bold truncate relative z-10 ${overlay.name}`}>{profile.display_name || 'User'}</span>
            <p className="text-sm text-foreground/70 dark:text-white/70 font-semibold truncate mb-1 relative z-10">{user.email}</p>
            <div className="mt-2 relative z-10 flex flex-wrap items-center gap-1.5">
            </div>
          </div>
          
          <div className="p-2 space-y-1">
            <button 
              onClick={() => {
                setIsOpen(false);
                setSettingsModalTab('account');
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-foreground rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <Settings className="w-4 h-4" />
              Account Settings
            </button>
            <button 
              onClick={() => {
                setIsOpen(false);
                setSettingsModalTab('preferences');
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-foreground rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <SlidersHorizontal className="w-4 h-4" />
              User Preferences
            </button>
            <button 
              onClick={() => {
                setIsOpen(false);
                setSettingsModalTab('help');
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-foreground rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
              Help & Support
            </button>
          </div>
          
          <div className="p-2 border-t border-border">
            <button 
              onClick={() => {
                setIsOpen(false);
                signOut();
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm font-bold text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Log Out
            </button>
          </div>
        </div>
      )}
      
      {settingsModalTab && createPortal(
        <AccountSettingsModal tab={settingsModalTab} onClose={() => setSettingsModalTab(null)} />,
        document.body
      )}
    </div>
  );
}
