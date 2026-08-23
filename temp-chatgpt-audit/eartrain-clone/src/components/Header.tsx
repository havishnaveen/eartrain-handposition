import { Headphones } from "lucide-react"
import { Logo } from "./Logo"

export function Header() {
  return (
    <header className="border-b border-border bg-background/90 backdrop-blur sticky top-0 z-50 transition-colors">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer group">
          <Logo className="w-10 h-10 group-hover:scale-105 transition-transform" />
          <h1 className="text-2xl font-serif font-bold text-foreground leading-tight tracking-tight hidden sm:block">EarTrain</h1>
        </div>
        
        <div className="flex items-center gap-4 md:gap-6">
          <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground font-medium">
            <Headphones className="w-4 h-4" />
            Use headphones
          </div>
        </div>
      </div>
    </header>
  )
}
