import { useAuth } from "@/lib/useAuth"
import { AuthModal } from "../AuthModal"
import { Logo } from "../Logo"
import { SettingsMenu } from "../SettingsMenu"

export function MobileHeader() {
  const { user } = useAuth()

  return (
    <header className="border-b border-border bg-background/90 backdrop-blur sticky top-0 z-50 transition-colors">
      <div className="px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Logo className="w-8 h-8" />
        </div>
        
        <div className="flex items-center gap-3">
          {user ? (
            <SettingsMenu />
          ) : (
            <AuthModal customTrigger={<button className="px-3 py-1.5 text-xs font-bold bg-orange-500 text-white rounded-lg">Sign In</button>} />
          )}
        </div>
      </div>
    </header>
  )
}
