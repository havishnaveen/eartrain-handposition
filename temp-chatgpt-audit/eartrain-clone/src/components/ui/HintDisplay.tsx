import { Lightbulb } from "lucide-react";
import { motion } from "framer-motion";

export function HintDisplay({ children }: { children: React.ReactNode }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 bg-white/40 dark:bg-black/20 border border-black/5 dark:border-white/5 p-4 rounded-xl max-w-lg mb-8 shadow-sm"
    >
      <Lightbulb className="w-5 h-5 text-amber-500 dark:text-amber-400 mt-0.5 shrink-0" />
      <p className="text-sm text-orange-950/80 dark:text-white/70 leading-relaxed font-medium">
        {children}
      </p>
    </motion.div>
  );
}
