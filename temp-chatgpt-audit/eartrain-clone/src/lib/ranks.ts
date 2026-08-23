import { Star, Shield, Medal, Trophy, Crown, Gem, Flame, Zap, Award, Target, Key, Compass, Music, Heart, Sun, Feather, Eye, Diamond, Hexagon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type Rank = {
  id: string;
  name: string;
  minXP: number;
  icon: LucideIcon;
  color: string;
  darkColor: string;
};

export const RANKS: Rank[] = [
  { id: "novice", name: "Novice", minXP: 0, icon: Star, color: "text-slate-400", darkColor: "dark:text-slate-500" },
  { id: "beginner", name: "Beginner", minXP: 10, icon: Shield, color: "text-slate-500", darkColor: "dark:text-slate-400" },
  { id: "amateur", name: "Amateur", minXP: 40, icon: Target, color: "text-zinc-600", darkColor: "dark:text-zinc-300" },
  { id: "apprentice", name: "Apprentice", minXP: 75, icon: Compass, color: "text-emerald-500", darkColor: "dark:text-emerald-400" },
  { id: "learner", name: "Learner", minXP: 125, icon: Key, color: "text-emerald-600", darkColor: "dark:text-emerald-300" },
  { id: "enthusiast", name: "Enthusiast", minXP: 200, icon: Heart, color: "text-rose-500", darkColor: "dark:text-rose-400" },
  { id: "scholar", name: "Scholar", minXP: 250, icon: Eye, color: "text-blue-500", darkColor: "dark:text-blue-400" },
  { id: "adept", name: "Adept", minXP: 350, icon: Zap, color: "text-blue-600", darkColor: "dark:text-blue-300" },
  { id: "musician", name: "Musician", minXP: 500, icon: Music, color: "text-indigo-500", darkColor: "dark:text-indigo-400" },
  { id: "performer", name: "Performer", minXP: 750, icon: Feather, color: "text-violet-500", darkColor: "dark:text-violet-400" },
  { id: "specialist", name: "Specialist", minXP: 1000, icon: Hexagon, color: "text-purple-500", darkColor: "dark:text-purple-400" },
  { id: "expert", name: "Expert", minXP: 1250, icon: Award, color: "text-fuchsia-500", darkColor: "dark:text-fuchsia-400" },
  { id: "professional", name: "Professional", minXP: 1600, icon: Medal, color: "text-pink-500", darkColor: "dark:text-pink-400" },
  { id: "virtuoso", name: "Virtuoso", minXP: 2000, icon: Flame, color: "text-orange-500", darkColor: "dark:text-orange-400" },
  { id: "master", name: "Master", minXP: 2500, icon: Trophy, color: "text-amber-500", darkColor: "dark:text-yellow-400" },
  { id: "grandmaster", name: "Grandmaster", minXP: 3750, icon: Gem, color: "text-cyan-500", darkColor: "dark:text-cyan-400" },
  { id: "maestro", name: "Maestro", minXP: 5000, icon: Crown, color: "text-yellow-600", darkColor: "dark:text-yellow-300" },
  { id: "prodigy", name: "Prodigy", minXP: 7500, icon: Diamond, color: "text-sky-500", darkColor: "dark:text-sky-400" },
  { id: "legend", name: "Legend", minXP: 12500, icon: Sun, color: "text-amber-600", darkColor: "dark:text-amber-300" },
  { id: "oracle", name: "Oracle", minXP: 25000, icon: Crown, color: "text-orange-600", darkColor: "dark:text-orange-300" },
];

export function getRankForXP(xp: number): Rank {
  let currentRank = RANKS[0];
  for (const rank of RANKS) {
    if (xp >= rank.minXP) {
      currentRank = rank;
    } else {
      break;
    }
  }
  return currentRank;
}

export function getNextRank(xp: number): Rank | null {
  for (const rank of RANKS) {
    if (rank.minXP > xp) {
      return rank;
    }
  }
  return null;
}

export type ShapeDefinition = {
  size: string; // e.g. "14rem"
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
  clipPath?: string;
  borderRadius?: string;
  background?: string;
  border?: string;
  animation?: 'animate-spin-slow' | 'animate-spin-slow-reverse' | string;
  boxShadow?: string;
  transform?: string;
};

export type Overlay = {
  border: string;
  name: string;
  avatarOuter: string;
  avatarInner: string;
  bgClass: string;
  portal?: string;
  shapes?: ShapeDefinition[];
};

export function getRankTierOverlay(rankId: string): Overlay {
  const tierMap: Record<string, number> = {
    "novice": 1, "beginner": 2, "amateur": 3, "apprentice": 4, "learner": 5, "enthusiast": 6,
    "scholar": 7, "adept": 8, "musician": 9, "performer": 10, "specialist": 11, "expert": 12,
    "professional": 13, "virtuoso": 14, "master": 15, "grandmaster": 16, "maestro": 17,
    "prodigy": 18, "legend": 19, "oracle": 20
  };
  
  const tier = tierMap[rankId] || 1;
  
  // Feature flag: disable tier overlays per user request
  /*
  return {
    border: "border-stone-300 dark:border-stone-700", name: "text-foreground", avatarOuter: "", avatarInner: "",
    bgClass: "bg-white dark:bg-black/40"
  };
  */

  switch(tier) {
    case 1: return {
      border: "border-stone-300 dark:border-stone-700", name: "text-foreground", avatarOuter: "", avatarInner: "",
      bgClass: "bg-white dark:bg-black/40"
    };
    case 2: return {
      border: "border-slate-300 dark:border-slate-600 shadow-sm", name: "text-slate-600 dark:text-slate-300", avatarOuter: "ring-2 ring-slate-200", avatarInner: "",
      bgClass: "bg-slate-50 dark:bg-slate-900/50"
    };
    case 3: return {
      border: "border-slate-400 dark:border-slate-500 shadow-[0_0_10px_rgba(148,163,184,0.3)]", name: "text-slate-700 dark:text-slate-300 font-extrabold",
      avatarOuter: "ring-2 ring-slate-300 dark:ring-slate-700 ring-offset-1 ring-offset-background", avatarInner: "",
      bgClass: "bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900"
    };
    case 4: return {
      border: "border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.3)]", name: "text-emerald-700 dark:text-emerald-400 font-extrabold",
      avatarOuter: "ring-2 ring-emerald-300 ring-offset-1 ring-offset-background", avatarInner: "ring-2 ring-inset ring-emerald-200/50",
      bgClass: "bg-gradient-to-b from-emerald-50 to-green-100 dark:from-emerald-900/40 dark:to-green-950/40"
    };
    case 5: return {
      border: "border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)] animate-float", name: "text-emerald-600 dark:text-emerald-300 font-black",
      avatarOuter: "ring-2 ring-emerald-400 ring-offset-2 ring-offset-background", avatarInner: "ring-2 ring-inset ring-emerald-200/50",
      bgClass: "bg-gradient-to-tr from-emerald-100 to-teal-50 dark:from-emerald-900/50 dark:to-teal-950/50 relative overflow-hidden animate-gradient-xy"
    };
    case 6: return {
      border: "border-rose-400 shadow-[0_0_18px_rgba(251,113,133,0.5)] animate-float", name: "text-rose-600 dark:text-rose-300 font-black",
      avatarOuter: "ring-2 ring-rose-400 ring-offset-2 ring-offset-background", avatarInner: "ring-2 ring-inset ring-rose-200/50",
      bgClass: "bg-gradient-to-bl from-rose-100 to-pink-50 dark:from-rose-900/50 dark:to-pink-950/50 relative overflow-hidden animate-gradient-xy",
      portal: "w-16 h-3 bg-rose-400/40 blur-md rounded-full animate-pulse"
    };
    case 7: return {
      border: "border-blue-400 shadow-[0_0_20px_rgba(96,165,250,0.5)] animate-pulse-glow", name: "text-blue-700 dark:text-blue-300 font-black",
      avatarOuter: "ring-2 ring-blue-400 ring-offset-2 ring-offset-background", avatarInner: "ring-2 ring-inset ring-blue-200/50",
      bgClass: "bg-gradient-to-br from-blue-100 to-cyan-50 dark:from-blue-900/50 dark:to-cyan-950/50 relative overflow-hidden animate-gradient-xy",
      portal: "w-20 h-4 bg-blue-400/50 blur-md rounded-[100%] animate-pulse",
      shapes: [
        { size: "10rem", top: "-4rem", left: "-4rem", animation: "animate-spin-slow", background: "linear-gradient(to bottom right, rgba(96,165,250,0.5), rgba(34,211,238,0.5))", clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)" },
        { size: "10rem", bottom: "-4rem", right: "-4rem", animation: "animate-spin-slow-reverse", background: "linear-gradient(to top left, rgba(96,165,250,0.5), rgba(34,211,238,0.5))", clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)" }
      ]
    };
    case 8: return {
      border: "border-indigo-400 border-2 shadow-[0_0_22px_rgba(129,140,248,0.6)] animate-float", name: "text-indigo-600 dark:text-indigo-300 font-black",
      avatarOuter: "ring-4 ring-indigo-400 ring-offset-2 ring-offset-background", avatarInner: "ring-2 ring-inset ring-indigo-200/50",
      bgClass: "bg-gradient-to-tr from-indigo-100 to-blue-50 dark:from-indigo-900/50 dark:to-blue-950/50 relative overflow-hidden animate-gradient-xy",
      portal: "w-24 h-4 bg-indigo-500/50 blur-md rounded-[100%] animate-pulse",
      shapes: [
        { size: "12rem", top: "-5rem", left: "-5rem", animation: "animate-spin-slow-reverse", background: "linear-gradient(to top right, rgba(129,140,248,0.7), rgba(96,165,250,0.7))", clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" },
        { size: "12rem", bottom: "-5rem", right: "-5rem", animation: "animate-spin-slow", background: "linear-gradient(to bottom left, rgba(129,140,248,0.7), rgba(96,165,250,0.7))", clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }
      ]
    };
    case 9: return {
      border: "border-violet-500 border-2 shadow-[0_0_25px_rgba(139,92,246,0.6)] animate-pulse-glow", name: "text-violet-700 dark:text-violet-300 font-black",
      avatarOuter: "ring-4 ring-violet-500 ring-offset-2 ring-offset-background", avatarInner: "ring-2 ring-inset ring-violet-200/50",
      bgClass: "bg-gradient-to-bl from-violet-100 to-purple-50 dark:from-violet-900/60 dark:to-purple-950/60 relative overflow-hidden animate-gradient-xy",
      portal: "w-24 h-5 bg-violet-500/50 blur-md rounded-[100%] animate-pulse",
      shapes: [
        { size: "14rem", top: "-6rem", left: "-6rem", animation: "animate-spin-slow", background: "linear-gradient(to bottom right, rgba(139,92,246,0.7), rgba(168,85,247,0.7))", clipPath: "polygon(50% 0%, 100% 38%, 81% 100%, 19% 100%, 0% 38%)" },
        { size: "14rem", bottom: "-6rem", right: "-6rem", animation: "animate-spin-slow-reverse", background: "linear-gradient(to top left, rgba(139,92,246,0.7), rgba(168,85,247,0.7))", clipPath: "polygon(50% 0%, 100% 38%, 81% 100%, 19% 100%, 0% 38%)" }
      ]
    };
    case 10: return {
      border: "border-purple-500 border-2 shadow-[0_0_30px_rgba(168,85,247,0.7)] animate-float", name: "text-purple-700 dark:text-purple-300 font-black",
      avatarOuter: "ring-4 ring-purple-500 ring-offset-2 ring-offset-background shadow-[0_0_20px_rgba(168,85,247,0.5)]", avatarInner: "ring-2 ring-inset ring-white/50",
      bgClass: "bg-gradient-to-br from-purple-100 via-fuchsia-50 to-purple-100 dark:from-purple-950/60 dark:via-fuchsia-900/30 dark:to-purple-950/60 relative overflow-hidden animate-gradient-xy",
      portal: "w-24 h-5 bg-purple-500/60 blur-md rounded-[100%] animate-pulse",
      shapes: [
        { size: "16rem", top: "-7rem", left: "-7rem", animation: "animate-spin-slow-reverse", background: "linear-gradient(to right, rgba(168,85,247,0.8), rgba(217,70,239,0.8))", clipPath: "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)" },
        { size: "16rem", bottom: "-7rem", right: "-7rem", animation: "animate-spin-slow", background: "linear-gradient(to left, rgba(168,85,247,0.8), rgba(217,70,239,0.8))", clipPath: "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)" }
      ]
    };
    case 11: return {
      border: "border-fuchsia-500 border-2 shadow-[0_0_35px_rgba(217,70,239,0.7)] animate-pulse-glow", name: "text-fuchsia-700 dark:text-fuchsia-300 font-black",
      avatarOuter: "ring-4 ring-fuchsia-500 ring-offset-2 ring-offset-fuchsia-100 dark:ring-offset-fuchsia-900/50 shadow-[0_0_25px_rgba(217,70,239,0.6)]", avatarInner: "ring-2 ring-inset ring-white/50",
      bgClass: "bg-gradient-to-tl from-fuchsia-100 via-pink-50 to-fuchsia-100 dark:from-fuchsia-950/60 dark:via-pink-900/30 dark:to-fuchsia-950/60 relative overflow-hidden animate-gradient-xy",
      portal: "w-28 h-6 bg-fuchsia-500/60 blur-md rounded-[100%] animate-pulse",
      shapes: [
        { size: "18rem", top: "-8rem", left: "-8rem", animation: "animate-spin-slow", background: "linear-gradient(to bottom right, rgba(217,70,239,0.8), rgba(236,72,153,0.8))", clipPath: "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)" },
        { size: "18rem", bottom: "-8rem", right: "-8rem", animation: "animate-spin-slow-reverse", background: "linear-gradient(to top left, rgba(217,70,239,0.8), rgba(236,72,153,0.8))", clipPath: "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)" }
      ]
    };
    case 12: return {
      border: "border-pink-500 border-2 shadow-[0_0_40px_rgba(236,72,153,0.8)] animate-float", name: "text-pink-700 dark:text-pink-300 font-black drop-shadow-md",
      avatarOuter: "ring-4 ring-pink-500 ring-offset-2 ring-offset-pink-100 dark:ring-offset-pink-900/50 shadow-[0_0_30px_rgba(236,72,153,0.7)]", avatarInner: "ring-2 ring-inset ring-white/30",
      bgClass: "bg-gradient-to-bl from-pink-100 via-rose-50 to-pink-100 dark:from-pink-950/60 dark:via-rose-900/30 dark:to-pink-950/60 relative overflow-hidden animate-gradient-xy",
      portal: "w-28 h-6 bg-pink-500/70 blur-md rounded-[100%] animate-pulse",
      shapes: [
        { size: "20rem", top: "-9rem", left: "-9rem", animation: "animate-spin-slow-reverse", background: "linear-gradient(to top right, rgba(236,72,153,0.8), rgba(251,113,133,0.8))", clipPath: "polygon(50% 0%, 60% 40%, 100% 50%, 60% 60%, 50% 100%, 40% 60%, 0% 50%, 40% 40%)" },
        { size: "20rem", bottom: "-9rem", right: "-9rem", animation: "animate-spin-slow", background: "linear-gradient(to bottom left, rgba(236,72,153,0.8), rgba(251,113,133,0.8))", clipPath: "polygon(50% 0%, 60% 40%, 100% 50%, 60% 60%, 50% 100%, 40% 60%, 0% 50%, 40% 40%)" }
      ]
    };
    case 13: return {
      border: "border-rose-500 border-2 shadow-[0_0_45px_rgba(244,63,94,0.8)] animate-pulse-glow", name: "text-rose-700 dark:text-rose-300 font-black drop-shadow-lg",
      avatarOuter: "ring-4 ring-rose-500 ring-offset-4 ring-offset-rose-100 dark:ring-offset-rose-900/50 shadow-[0_0_35px_rgba(244,63,94,0.8)]", avatarInner: "ring-2 ring-inset ring-rose-200/50 animate-spin-slow",
      bgClass: "bg-gradient-to-tr from-rose-100 via-red-50 to-rose-100 dark:from-rose-950/60 dark:via-red-900/30 dark:to-rose-950/60 relative overflow-hidden animate-gradient-xy",
      portal: "w-32 h-6 bg-rose-500/70 blur-md rounded-[100%] animate-pulse",
      shapes: [
        { size: "24rem", top: "-11rem", left: "-11rem", animation: "animate-spin-slow", background: "linear-gradient(to bottom right, rgba(244,63,94,0.8), rgba(239,68,68,0.8))", clipPath: "polygon(50% 0%, 65% 35%, 100% 50%, 65% 65%, 50% 100%, 35% 65%, 0% 50%, 35% 35%)" },
        { size: "24rem", bottom: "-11rem", right: "-11rem", animation: "animate-spin-slow-reverse", background: "linear-gradient(to top left, rgba(244,63,94,0.8), rgba(239,68,68,0.8))", clipPath: "polygon(50% 0%, 65% 35%, 100% 50%, 65% 65%, 50% 100%, 35% 65%, 0% 50%, 35% 35%)" }
      ]
    };
    case 14: return {
      border: "border-red-500 border-2 shadow-[0_0_50px_rgba(239,68,68,0.9)] animate-float", name: "text-red-700 dark:text-red-300 font-black drop-shadow-xl",
      avatarOuter: "ring-4 ring-red-500 ring-offset-4 ring-offset-red-100 dark:ring-offset-red-900/50 shadow-[0_0_40px_rgba(239,68,68,0.9)]", avatarInner: "ring-2 ring-inset ring-red-200/50 animate-spin-slow-reverse",
      bgClass: "bg-gradient-to-bl from-red-100 via-orange-50 to-red-100 dark:from-red-950/60 dark:via-orange-900/30 dark:to-red-950/60 relative overflow-hidden animate-gradient-xy",
      portal: "w-32 h-6 bg-red-500/70 blur-md rounded-[100%] animate-pulse",
      shapes: [
        { size: "26rem", top: "-12rem", left: "-12rem", animation: "animate-spin-slow-reverse", background: "linear-gradient(to right, rgba(239,68,68,0.9), rgba(249,115,22,0.9))", clipPath: "polygon(50% 0%, 75% 25%, 100% 50%, 75% 75%, 50% 100%, 25% 75%, 0% 50%, 25% 25%)" },
        { size: "26rem", bottom: "-12rem", right: "-12rem", animation: "animate-spin-slow", background: "linear-gradient(to left, rgba(239,68,68,0.9), rgba(249,115,22,0.9))", clipPath: "polygon(50% 0%, 75% 25%, 100% 50%, 75% 75%, 50% 100%, 25% 75%, 0% 50%, 25% 25%)" }
      ]
    };
    case 15: return {
      border: "border-orange-500 border-2 shadow-[0_0_55px_rgba(249,115,22,0.9)] animate-pulse-glow", name: "text-orange-700 dark:text-orange-300 font-black drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]",
      avatarOuter: "ring-4 ring-orange-500 ring-offset-4 ring-offset-orange-100 dark:ring-offset-orange-900/50 shadow-[0_0_45px_rgba(249,115,22,0.9)]", avatarInner: "ring-4 ring-amber-400/50 animate-spin-slow",
      bgClass: "bg-gradient-to-br from-orange-100 via-amber-100 to-yellow-100 dark:from-orange-950/60 dark:via-amber-950/60 dark:to-yellow-950/60 relative overflow-hidden animate-gradient-xy",
      portal: "w-36 h-7 bg-orange-500/80 blur-md rounded-[100%] animate-pulse",
      shapes: [
        { size: "28rem", top: "-13rem", left: "-13rem", animation: "animate-spin-slow", background: "linear-gradient(to top right, rgba(249,115,22,0.9), rgba(250,204,21,0.9))", clipPath: "polygon(50% 0%, 65% 15%, 100% 50%, 65% 85%, 50% 100%, 35% 85%, 0% 50%, 35% 15%)" },
        { size: "28rem", bottom: "-13rem", right: "-13rem", animation: "animate-spin-slow-reverse", background: "linear-gradient(to bottom left, rgba(249,115,22,0.9), rgba(250,204,21,0.9))", clipPath: "polygon(50% 0%, 65% 15%, 100% 50%, 65% 85%, 50% 100%, 35% 85%, 0% 50%, 35% 15%)" }
      ]
    };
    case 16: return {
      border: "border-amber-500 border-2 shadow-[0_0_60px_rgba(245,158,11,1)] animate-float", name: "text-amber-700 dark:text-amber-300 font-black drop-shadow-[0_2px_5px_rgba(0,0,0,0.6)]",
      avatarOuter: "ring-4 ring-amber-500 ring-offset-4 ring-offset-amber-100 dark:ring-offset-amber-900/50 shadow-[0_0_50px_rgba(245,158,11,1)]", avatarInner: "ring-4 ring-yellow-400/60 animate-spin-slow-reverse",
      bgClass: "bg-gradient-to-tr from-amber-100 via-yellow-100 to-orange-100 dark:from-amber-950/60 dark:via-yellow-950/60 dark:to-orange-950/60 relative overflow-hidden animate-gradient-xy before:absolute before:inset-0 before:bg-[linear-gradient(rgba(255,255,255,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.3)_1px,transparent_1px)] dark:before:bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] before:bg-[size:24px_24px] before:animate-float",
      portal: "w-36 h-7 bg-amber-500/80 blur-md rounded-[100%] animate-pulse-glow",
      shapes: [
        { size: "32rem", top: "-15rem", left: "-15rem", animation: "animate-spin-slow-reverse", background: "linear-gradient(to bottom right, rgba(245,158,11,1), rgba(250,204,21,1))", clipPath: "polygon(50% 0%, 65% 15%, 90% 20%, 80% 40%, 100% 50%, 80% 60%, 90% 80%, 65% 85%, 50% 100%, 35% 85%, 10% 80%, 20% 60%, 0% 50%, 20% 40%, 10% 20%, 35% 15%)", boxShadow: "0 0 30px rgba(245,158,11,0.5)" },
        { size: "32rem", bottom: "-15rem", right: "-15rem", animation: "animate-spin-slow", background: "linear-gradient(to top left, rgba(245,158,11,1), rgba(250,204,21,1))", clipPath: "polygon(50% 0%, 65% 15%, 90% 20%, 80% 40%, 100% 50%, 80% 60%, 90% 80%, 65% 85%, 50% 100%, 35% 85%, 10% 80%, 20% 60%, 0% 50%, 20% 40%, 10% 20%, 35% 15%)", boxShadow: "0 0 30px rgba(245,158,11,0.5)" }
      ]
    };
    case 17: return {
      border: "border-cyan-400 border-2 shadow-[0_0_65px_rgba(34,211,238,1)] animate-pulse-glow", name: "text-cyan-700 dark:text-cyan-300 font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]",
      avatarOuter: "ring-4 ring-cyan-400 ring-offset-4 ring-offset-cyan-100 dark:ring-offset-cyan-900/50 shadow-[0_0_55px_rgba(34,211,238,1)]", avatarInner: "ring-4 ring-blue-400/60 animate-spin-slow",
      bgClass: "bg-gradient-to-br from-cyan-100 via-sky-100 to-blue-100 dark:from-cyan-950/60 dark:via-sky-950/60 dark:to-blue-950/60 relative overflow-hidden animate-gradient-xy before:absolute before:inset-0 before:bg-[linear-gradient(rgba(255,255,255,0.4)_2px,transparent_2px),linear-gradient(90deg,rgba(255,255,255,0.4)_2px,transparent_2px)] dark:before:bg-[linear-gradient(rgba(255,255,255,0.1)_2px,transparent_2px),linear-gradient(90deg,rgba(255,255,255,0.1)_2px,transparent_2px)] before:bg-[size:32px_32px] before:animate-float",
      portal: "w-40 h-8 bg-cyan-500/80 blur-lg rounded-[100%] animate-pulse-glow",
      shapes: [
        { size: "36rem", top: "-17rem", left: "-17rem", animation: "animate-spin-slow", background: "linear-gradient(to right, rgba(34,211,238,0.9), rgba(59,130,246,0.9))", clipPath: "polygon(50% 0%, 53% 47%, 100% 50%, 53% 53%, 50% 100%, 47% 53%, 0% 50%, 47% 47%)" },
        { size: "36rem", bottom: "-17rem", right: "-17rem", animation: "animate-spin-slow-reverse", background: "linear-gradient(to left, rgba(34,211,238,0.9), rgba(59,130,246,0.9))", clipPath: "polygon(50% 0%, 53% 47%, 100% 50%, 53% 53%, 50% 100%, 47% 53%, 0% 50%, 47% 47%)" }
      ]
    };
    case 18: return {
      border: "border-sky-500 border-2 shadow-[0_0_70px_rgba(14,165,233,1)] animate-float", name: "text-sky-700 dark:text-sky-300 font-black drop-shadow-[0_2px_7px_rgba(0,0,0,0.6)]",
      avatarOuter: "ring-4 ring-sky-500 ring-offset-4 ring-offset-sky-100 dark:ring-offset-sky-900/50 shadow-[0_0_60px_rgba(14,165,233,1)]", avatarInner: "ring-4 ring-indigo-400/60 animate-spin-slow-reverse",
      bgClass: "bg-gradient-to-tl from-sky-100 via-indigo-100 to-violet-100 dark:from-sky-950/60 dark:via-indigo-950/60 dark:to-violet-950/60 relative overflow-hidden animate-gradient-xy before:absolute before:inset-0 before:bg-[linear-gradient(rgba(255,255,255,0.4)_2px,transparent_2px),linear-gradient(90deg,rgba(255,255,255,0.4)_2px,transparent_2px)] dark:before:bg-[linear-gradient(rgba(255,255,255,0.1)_2px,transparent_2px),linear-gradient(90deg,rgba(255,255,255,0.1)_2px,transparent_2px)] before:bg-[size:32px_32px] before:animate-float",
      portal: "w-44 h-8 bg-sky-500/80 blur-lg rounded-[100%] animate-pulse-glow",
      shapes: [
        { size: "40rem", top: "-19rem", left: "-19rem", animation: "animate-spin-slow-reverse", background: "linear-gradient(to bottom right, rgba(56,189,248,0.9), rgba(99,102,241,0.9))", clipPath: "polygon(35% 0%, 65% 0%, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0% 65%, 0% 35%, 35% 35%)" },
        { size: "40rem", bottom: "-19rem", right: "-19rem", animation: "animate-spin-slow", background: "linear-gradient(to top left, rgba(56,189,248,0.9), rgba(99,102,241,0.9))", clipPath: "polygon(35% 0%, 65% 0%, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0% 65%, 0% 35%, 35% 35%)" }
      ]
    };
    case 19: return {
      border: "border-purple-500 border-2 shadow-[0_0_80px_rgba(168,85,247,1)] animate-pulse-glow", name: "text-purple-700 dark:text-purple-300 font-black drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]",
      avatarOuter: "ring-4 ring-purple-500 ring-offset-4 ring-offset-fuchsia-100 dark:ring-offset-fuchsia-900/50 shadow-[0_0_70px_rgba(168,85,247,1)]", avatarInner: "ring-4 ring-pink-400/60 animate-spin-slow",
      bgClass: "bg-gradient-to-br from-purple-100 via-fuchsia-100 to-pink-100 dark:from-purple-950/60 dark:via-fuchsia-950/60 dark:to-pink-950/60 relative overflow-hidden animate-gradient-xy before:absolute before:inset-0 before:bg-[linear-gradient(rgba(255,255,255,0.4)_2px,transparent_2px),linear-gradient(90deg,rgba(255,255,255,0.4)_2px,transparent_2px)] dark:before:bg-[linear-gradient(rgba(255,255,255,0.1)_2px,transparent_2px),linear-gradient(90deg,rgba(255,255,255,0.1)_2px,transparent_2px)] before:bg-[size:32px_32px] before:animate-float",
      portal: "w-48 h-10 bg-purple-500/90 blur-xl rounded-[100%] animate-pulse-glow",
      shapes: [
        { size: "48rem", top: "-23rem", left: "-23rem", animation: "animate-spin-slow", background: "linear-gradient(to top right, rgba(168,85,247,0.9), rgba(236,72,153,0.9))", clipPath: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)" },
        { size: "48rem", bottom: "-23rem", right: "-23rem", animation: "animate-spin-slow-reverse", background: "linear-gradient(to bottom left, rgba(168,85,247,0.9), rgba(236,72,153,0.9))", clipPath: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)" }
      ]
    };
    case 20: return {
      border: "border-orange-600 border-4 shadow-[0_0_100px_rgba(234,88,12,1)] animate-pulse-glow", name: "text-orange-700 dark:text-orange-300 font-black drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)]",
      avatarOuter: "ring-4 ring-orange-600 ring-offset-4 ring-offset-orange-200 dark:ring-offset-orange-900/80 shadow-[0_0_90px_rgba(234,88,12,1)]", avatarInner: "ring-4 ring-yellow-400/80 animate-spin-slow",
      bgClass: "bg-gradient-to-tr from-orange-200 via-red-200 to-yellow-200 dark:from-orange-900/80 dark:via-red-900/80 dark:to-yellow-900/80 relative overflow-hidden animate-gradient-xy before:absolute before:inset-0 before:bg-[linear-gradient(rgba(255,255,255,0.5)_3px,transparent_3px),linear-gradient(90deg,rgba(255,255,255,0.5)_3px,transparent_3px)] dark:before:bg-[linear-gradient(rgba(255,255,255,0.2)_3px,transparent_3px),linear-gradient(90deg,rgba(255,255,255,0.2)_3px,transparent_3px)] before:bg-[size:40px_40px] before:animate-float",
      portal: "w-56 h-12 bg-orange-600/90 blur-xl rounded-[100%] animate-pulse-glow",
      shapes: [
        { size: "60rem", top: "-29rem", left: "-29rem", animation: "animate-spin-slow", border: "40px solid rgba(249,115,22,0.8)", borderRadius: "50%", boxShadow: "0 0 50px rgba(249,115,22,0.5), inset 0 0 50px rgba(249,115,22,0.5)" },
        { size: "40rem", bottom: "-19rem", right: "-19rem", animation: "animate-spin-slow-reverse", background: "linear-gradient(to top right, rgba(250,204,21,0.9), rgba(234,88,12,0.9))", borderRadius: "4rem", transform: "rotate(45deg)", boxShadow: "0 0 80px rgba(234,88,12,0.8)" }
      ]
    };
    default: return {
      border: "border-stone-300 dark:border-stone-700", name: "text-foreground", avatarOuter: "", avatarInner: "",
      bgClass: "bg-white dark:bg-black/40"
    };
  }
}
