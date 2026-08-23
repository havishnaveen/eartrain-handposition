import { motion } from "framer-motion";
import { Pointer } from "lucide-react";

interface Props {
  className?: string;
}

export function AnimatedPointer({ className = "" }: Props) {
  return (
    <motion.div
      initial={{ y: -10, opacity: 0 }}
      animate={{ y: [0, -10, 0], opacity: 1 }}
      transition={{ 
        y: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
        opacity: { duration: 0.3 }
      }}
      className={`absolute z-[60] text-blue-500 drop-shadow-lg pointer-events-none ${className}`}
    >
      <Pointer className="w-12 h-12 rotate-180" strokeWidth={2.5} />
    </motion.div>
  );
}
