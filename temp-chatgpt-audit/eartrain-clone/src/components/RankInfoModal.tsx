import { useState } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";
import { RANKS } from "@/lib/ranks";

type RankInfoModalProps = {
  customTrigger?: React.ReactNode;
};

export function RankInfoModal({ customTrigger }: RankInfoModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div onClick={(e) => { e.stopPropagation(); setIsOpen(true); }} className="inline-flex cursor-pointer items-center justify-center relative z-20">
        {customTrigger || <Info className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors ml-2" />}
      </div>

      {isOpen && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => setIsOpen(false)}>
          <div className="w-full max-w-lg bg-card border-2 border-border rounded-[2rem] shadow-2xl relative flex flex-col animate-in zoom-in-95 duration-300 max-h-[90vh]" onClick={e => e.stopPropagation()}>
            
            <div className="p-6 md:p-8 flex-shrink-0 border-b border-border/50">
              <button onClick={() => setIsOpen(false)} className="absolute top-6 right-6 z-50 p-2 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-muted-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
              <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
                <Info className="w-7 h-7 text-orange-500" /> Rank Escalation
              </h2>
              <p className="text-muted-foreground mt-2">
                Gain XP by practicing to unlock higher ranks. Higher tiers come with exclusive profile badges, colorful animated avatars, and expansive 3D backgrounds that spin around your profile picture!
              </p>
            </div>

            <div className="p-6 md:p-8 overflow-y-auto scrollbar-hide flex-1 space-y-3 relative">
              {RANKS.map((rank, i) => {
                const Icon = rank.icon;
                return (
                  <div key={rank.id} className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-white/40 dark:bg-black/20">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/5 ${rank.color} ${rank.darkColor}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className={`font-bold text-lg leading-none ${rank.color} ${rank.darkColor}`}>{rank.name}</h4>
                        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mt-1">Tier {i + 1}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-foreground">{rank.minXP.toLocaleString()}</span>
                      <span className="text-muted-foreground text-xs font-bold uppercase ml-1">XP</span>
                    </div>
                  </div>
                )
              })}
            </div>
            
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
