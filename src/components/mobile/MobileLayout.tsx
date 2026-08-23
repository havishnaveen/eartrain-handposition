import { MobileHeader } from "./MobileHeader";
import { MobileSelectionView } from "./MobileSelectionView";
import { Toaster } from "sonner";
import { EmailVerificationBanner } from "../EmailVerificationBanner";

export function MobileLayout() {
  return (
    <div className="min-h-[100dvh] text-foreground font-sans relative overflow-hidden flex flex-col bg-orange-50/50 dark:bg-[#050608] transition-colors duration-500">
      {/* Background Mesh */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[80%] h-[80%] bg-orange-300/20 dark:bg-orange-600/10 rounded-full blur-[100px] mix-blend-multiply dark:mix-blend-screen animate-blob" style={{ animationDuration: '20s' }} />
        <div className="absolute top-[20%] right-[-20%] w-[90%] h-[90%] bg-amber-300/15 dark:bg-red-700/8 rounded-full blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-blob" style={{ animationDuration: '25s', animationDelay: '2s' }} />
        <div className="absolute bottom-[-10%] left-[10%] w-[70%] h-[70%] bg-amber-300/15 dark:bg-amber-600/8 rounded-full blur-[110px] mix-blend-multiply dark:mix-blend-screen animate-blob" style={{ animationDuration: '22s', animationDelay: '5s' }} />
        <div className="absolute inset-0 bg-white/70 dark:bg-black/60 backdrop-blur-[40px]" />
      </div>

      <div className="relative z-10 flex flex-col min-h-[100dvh]">
        <EmailVerificationBanner />
        <MobileHeader />
        
        <main className="flex-1 relative overflow-x-hidden pt-2">
          <MobileSelectionView />
        </main>
      </div>
      
      <Toaster theme="dark" position="top-center" />
    </div>
  );
}
