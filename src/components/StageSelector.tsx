import { motion } from "framer-motion"

type StageSelectorProps = {
  activeStage: number
  onSelectStage: (stage: number) => void
  activeLevel: number
  onSelectLevel: (level: number) => void
}

const STAGES = [
  { id: 1, title: "Stage 1", desc: "Starting Out", gradient: "from-orange-400 to-amber-400", darkBg: "bg-[#1a1210]", darkAccentColor: "bg-orange-600/15", glow: "shadow-[0_0_30px_rgba(234,88,12,0.15)] dark:shadow-[0_0_15px_rgba(234,88,12,0.1)]" },
  { id: 2, title: "Stage 2", desc: "Slight Experience", gradient: "from-amber-400 to-yellow-400", darkBg: "bg-[#171012]", darkAccentColor: "bg-amber-600/15", glow: "shadow-[0_0_30px_rgba(245,158,11,0.15)] dark:shadow-[0_0_15px_rgba(225,29,72,0.1)]" },
  { id: 3, title: "Stage 3", desc: "Certificate of Merit", gradient: "from-amber-400 to-orange-400", darkBg: "bg-[#150e10]", darkAccentColor: "bg-red-700/15", glow: "shadow-[0_0_30px_rgba(244,63,94,0.15)] dark:shadow-[0_0_15px_rgba(185,28,28,0.1)]" },
  { id: 4, title: "Stage 4", desc: "Advanced Techniques", gradient: "from-yellow-400 to-orange-400", darkBg: "bg-[#18140e]", darkAccentColor: "bg-amber-500/15", glow: "shadow-[0_0_30px_rgba(250,204,21,0.15)] dark:shadow-[0_0_15px_rgba(245,158,11,0.1)]" },
]

const LEVELS = [
  { id: 6, label: "Level 6", desc: "Basic interval training, chord quality, and scale identification" },
  { id: 7, label: "Level 7", desc: "Emphasis on 7th chords and advanced intervals" },
  { id: 8, label: "Level 8", desc: "Chord inversions and cadence recognition" },
  { id: 9, label: "Level 9", desc: "Extended range intervals and longer cadences" },
  { id: 10, label: "Level 10", desc: "Advanced scales, wide intervals, and complex inversions" },
]

export function StageSelector({ activeStage, onSelectStage, activeLevel, onSelectLevel }: StageSelectorProps) {
  return (
    <div className="mb-14">
      <h3 className="text-muted-foreground text-sm font-bold uppercase tracking-widest mb-5 ml-1">Select Your Stage</h3>
      <div id="tour-stage-selector" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {STAGES.map(s => {
          const isActive = activeStage === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onSelectStage(s.id)}
              className={`group text-left p-8 rounded-2xl transition-all duration-500 relative overflow-hidden border ${
                isActive 
                  ? `border-orange-500 bg-white dark:border-orange-500 dark:bg-gradient-to-br dark:from-orange-600/90 dark:to-amber-600/90 ${s.glow} scale-[1.02] shadow-[0_0_20px_rgba(249,115,22,0.3)] dark:shadow-[0_0_30px_rgba(249,115,22,0.6)] z-10` 
                  : `border-orange-200 dark:border-white/5 bg-transparent hover:border-orange-300 dark:hover:border-white/10 hover:scale-[1.01]`
              }`}
            >
              {/* Background Layers */}
              <div className={`absolute inset-0 ${isActive ? 'bg-orange-500' : 'bg-gradient-to-br from-orange-50 to-amber-50'} dark:hidden backdrop-blur-md transition-colors duration-500`} />
              <div className={`absolute inset-0 ${s.darkBg} hidden dark:block`} />
              <div className={`absolute -bottom-8 -right-8 w-36 h-36 ${s.darkAccentColor} rounded-full blur-3xl hidden dark:block`} />
              
              {/* Subtle top border gradient accent */}
              <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${s.gradient} opacity-80 dark:opacity-0`} />
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-orange-500/30 via-amber-500/15 to-transparent hidden dark:block" />
              
              <div className="relative z-10">
                <h3 className={`text-3xl font-extrabold font-serif mb-3 tracking-tight ${isActive ? 'text-white dark:text-white' : 'text-orange-800 dark:text-white/90'}`}>{s.title}</h3>
                <p className={`text-sm font-medium leading-relaxed ${isActive ? 'text-orange-50 dark:text-white/90' : 'text-orange-700 dark:text-white/60'}`}>{s.desc}</p>
              </div>
              {isActive && (
                <div className="absolute right-6 top-1/2 -translate-y-1/2">
                  <div className={`w-3 h-3 rounded-full bg-gradient-to-r ${s.gradient} animate-pulse shadow-lg`} />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {activeStage === 3 && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="mt-8 pt-8 border-t border-border"
        >
          <h3 className="text-muted-foreground text-sm font-bold uppercase tracking-widest mb-5 ml-1">Select Your Level</h3>
          <div id="tour-level-selector" className="flex flex-wrap gap-3 mb-4">
            {LEVELS.map(l => {
              const isActive = activeLevel === l.id;
              return (
                <button
                  key={l.id}
                  onClick={() => onSelectLevel(l.id)}
                  className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all border-2 ${isActive ? 'bg-white border-orange-500 text-orange-600 shadow-md dark:bg-transparent dark:bg-gradient-to-r dark:from-amber-500 dark:to-orange-500 dark:text-white dark:border-black dark:shadow-[0_0_20px_rgba(0,0,0,0.5)]' : 'bg-card border-transparent text-muted-foreground hover:bg-orange-50 dark:hover:bg-white/5 hover:text-orange-950 dark:hover:text-white hover:border-orange-200 dark:hover:border-white/10'}`}
                >
                  {l.label}
                </button>
              )
            })}
          </div>
          <p className="text-sm text-muted-foreground italic pl-2 border-l-2 border-orange-500/50">
            {LEVELS.find(l => l.id === activeLevel)?.desc}
          </p>
        </motion.div>
      )}
    </div>
  )
}
