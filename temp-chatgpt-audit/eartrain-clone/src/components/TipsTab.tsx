import { useState, useEffect } from "react";
import { scheduleNote, stopAllAudio, initAudio, getAudioContext } from "@/lib/audio";
import { Card } from "./ui/card";
import { Music, Cake, Crown, Sun, Heart, Tv, ArrowUp, ArrowDown, ChevronDown, ChevronRight, Waves, Compass, Home, Rainbow, Smile, Target, Star, Cloud, Play } from "lucide-react";

export function TipsTab() {
  const [expandedSection, setExpandedSection] = useState<string | null>("Interval Song References");
  const [intervalDir, setIntervalDir] = useState<"asc" | "desc">("asc");
  const [activeAudio, setActiveAudio] = useState<string | null>(null);

  useEffect(() => {
    return () => { stopAllAudio(); };
  }, []);

  const handlePlaySequence = (dir: string, id: number) => {
    const key = `${dir}_${id}`;
    if (activeAudio === key) {
      stopAllAudio();
      setActiveAudio(null);
      return;
    }
    
    stopAllAudio();
    initAudio();
    setActiveAudio(key);
    
    const seq = SONG_REGISTRY[key];
    if (!seq) return;
    
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    
    // Play the pure interval first
    // Extract note name and octave from pitch string (e.g., "C4" -> "C", 4 or "C#4" -> "C#", 4)
    const parsePitch = (pitch: string) => {
      const o = parseInt(pitch.slice(-1));
      const n = pitch.slice(0, -1);
      return { n, o };
    };

    const n1 = parsePitch(seq.i[0]);
    const n2 = parsePitch(seq.i[1]);
    
    scheduleNote(n1.n, n1.o, 0.8, 1, now);
    scheduleNote(n2.n, n2.o, 0.8, 1, now + 0.6);
    
    const offset = now + 1.8;
    const stepDuration = 0.45; // 450ms per step
    
    seq.m.forEach(note => {
      const pn = parsePitch(note.pitch);
      let sustain = note.duration * stepDuration * 0.85;
      if (key === 'asc_1') sustain = 0.1; // extreme staccato for Jaws
      scheduleNote(pn.n, pn.o, sustain, 1, offset + (note.stepOffset * stepDuration));
    });
    
    // Reset active audio state after sequence finishes
    const maxOffset = Math.max(...seq.m.map(n => n.stepOffset * stepDuration));
    const totalTime = (1.8 + maxOffset + 1.5) * 1000;
    
    setTimeout(() => {
      setActiveAudio(prev => prev === key ? null : prev);
    }, totalTime);
  };


type ScheduledNote = { pitch: string; duration: number; stepOffset: number };
type SongDefinition = {
  i: [string, string];
  m: ScheduledNote[];
};
const SONG_REGISTRY: Record<string, SongDefinition> = {
  "asc_1": { i: ["E2", "F2"], m: [{ pitch: "E2", duration: 2, stepOffset: 0 }, { pitch: "F2", duration: 2, stepOffset: 2 }, { pitch: "E2", duration: 1, stepOffset: 4 }, { pitch: "F2", duration: 1, stepOffset: 5 }, { pitch: "E2", duration: 0.5, stepOffset: 6 }, { pitch: "F2", duration: 0.5, stepOffset: 6.5 }, { pitch: "E2", duration: 0.5, stepOffset: 7 }, { pitch: "F2", duration: 0.5, stepOffset: 7.5 }] },
  "asc_2": { i: ["C4", "D4"], m: [{ pitch: "C4", duration: 0.75, stepOffset: 0 }, { pitch: "C4", duration: 0.25, stepOffset: 0.75 }, { pitch: "D4", duration: 1, stepOffset: 1 }, { pitch: "C4", duration: 1, stepOffset: 2 }, { pitch: "F4", duration: 1, stepOffset: 3 }, { pitch: "E4", duration: 2, stepOffset: 4 }] },
  "asc_3": { i: ["A3", "C4"], m: [{ pitch: "A3", duration: 1, stepOffset: 0 }, { pitch: "C4", duration: 1.5, stepOffset: 1 }, { pitch: "D4", duration: 0.5, stepOffset: 2.5 }, { pitch: "E4", duration: 1.5, stepOffset: 3 }, { pitch: "F4", duration: 0.5, stepOffset: 4.5 }, { pitch: "E4", duration: 2, stepOffset: 5 }] },
  "asc_4": { i: ["C4", "E4"], m: [{ pitch: "C4", duration: 1, stepOffset: 0 }, { pitch: "E4", duration: 1, stepOffset: 1 }, { pitch: "F4", duration: 1, stepOffset: 2 }, { pitch: "G4", duration: 2, stepOffset: 3 }] },
  "asc_5": { i: ["C4", "F4"], m: [{ pitch: "C4", duration: 1, stepOffset: 0 }, { pitch: "F4", duration: 1.5, stepOffset: 1 }, { pitch: "F4", duration: 0.5, stepOffset: 2.5 }, { pitch: "F4", duration: 2, stepOffset: 3 }] },
  "asc_7": { i: ["C4", "G4"], m: [{ pitch: "C4", duration: 2, stepOffset: 0 }, { pitch: "G4", duration: 2, stepOffset: 2 }, { pitch: "F4", duration: 0.33, stepOffset: 4 }, { pitch: "E4", duration: 0.33, stepOffset: 4.33 }, { pitch: "D4", duration: 0.33, stepOffset: 4.66 }, { pitch: "C5", duration: 2, stepOffset: 5 }, { pitch: "G4", duration: 2, stepOffset: 7 }] },
  "asc_8": { i: ["E4", "C5"], m: [{ pitch: "D4", duration: 0.25, stepOffset: 0 }, { pitch: "D#4", duration: 0.25, stepOffset: 0.25 }, { pitch: "E4", duration: 0.75, stepOffset: 0.5 }, { pitch: "C5", duration: 1.25, stepOffset: 1.25 }, { pitch: "E4", duration: 0.5, stepOffset: 2.5 }, { pitch: "C5", duration: 2.0, stepOffset: 3.0 }] },
  "asc_9": { i: ["C4", "A4"], m: [{ pitch: "C4", duration: 1, stepOffset: 0 }, { pitch: "A4", duration: 1, stepOffset: 1 }, { pitch: "F4", duration: 2, stepOffset: 2 }] },
  "asc_10": { i: ["C4", "A#4"], m: [{ pitch: "C4", duration: 1, stepOffset: 0 }, { pitch: "A#4", duration: 2, stepOffset: 1 }, { pitch: "A4", duration: 1, stepOffset: 3 }, { pitch: "G4", duration: 1, stepOffset: 4 }, { pitch: "F4", duration: 2, stepOffset: 5 }] },
  "asc_11": { i: ["C4", "B4"], m: [{ pitch: "A3", duration: 2, stepOffset: 0 }, { pitch: "G#4", duration: 2, stepOffset: 2 }, { pitch: "F#4", duration: 4, stepOffset: 4 }] },
  "asc_12": { i: ["C4", "C5"], m: [{ pitch: "C4", duration: 2, stepOffset: 0 }, { pitch: "C5", duration: 2, stepOffset: 2 }, { pitch: "B4", duration: 1, stepOffset: 4 }, { pitch: "G4", duration: 0.5, stepOffset: 5 }, { pitch: "A4", duration: 0.5, stepOffset: 5.5 }, { pitch: "B4", duration: 1, stepOffset: 6 }, { pitch: "C5", duration: 2, stepOffset: 7 }] },
  "asc_13": { i: ["C4", "F#4"], m: [{ pitch: "C4", duration: 2, stepOffset: 0 }, { pitch: "F#4", duration: 2, stepOffset: 2 }, { pitch: "G4", duration: 3, stepOffset: 4 }] },
  "desc_1": { i: ["E5", "D#5"], m: [{ pitch: "E5", duration: 0.5, stepOffset: 0 }, { pitch: "D#5", duration: 0.5, stepOffset: 0.5 }, { pitch: "E5", duration: 0.5, stepOffset: 1 }, { pitch: "D#5", duration: 0.5, stepOffset: 1.5 }, { pitch: "E5", duration: 0.5, stepOffset: 2 }, { pitch: "B4", duration: 0.5, stepOffset: 2.5 }, { pitch: "D5", duration: 0.5, stepOffset: 3 }, { pitch: "C5", duration: 0.5, stepOffset: 3.5 }, { pitch: "A4", duration: 2, stepOffset: 4 }] },
  "desc_2": { i: ["E4", "D4"], m: [{ pitch: "E4", duration: 1, stepOffset: 0 }, { pitch: "D4", duration: 1, stepOffset: 1 }, { pitch: "C4", duration: 1, stepOffset: 2 }, { pitch: "D4", duration: 1, stepOffset: 3 }, { pitch: "E4", duration: 1, stepOffset: 4 }, { pitch: "E4", duration: 1, stepOffset: 5 }, { pitch: "E4", duration: 2, stepOffset: 6 }] },
  "desc_3": { i: ["G4", "E4"], m: [{ pitch: "G4", duration: 1, stepOffset: 0 }, { pitch: "E4", duration: 1, stepOffset: 1 }, { pitch: "G4", duration: 2, stepOffset: 2 }] },
  "desc_4": { i: ["G4", "Eb4"], m: [{ pitch: "G4", duration: 0.5, stepOffset: 0 }, { pitch: "G4", duration: 0.5, stepOffset: 0.5 }, { pitch: "G4", duration: 0.5, stepOffset: 1 }, { pitch: "Eb4", duration: 2, stepOffset: 1.5 }] },
  "desc_5": { i: ["G4", "D4"], m: [{ pitch: "G4", duration: 1, stepOffset: 0 }, { pitch: "G4", duration: 1, stepOffset: 1 }, { pitch: "D4", duration: 2, stepOffset: 2 }] },
  "desc_7": { i: ["G4", "C4"], m: [{ pitch: "G4", duration: 1, stepOffset: 0 }, { pitch: "C4", duration: 1.5, stepOffset: 1 }, { pitch: "C5", duration: 0.5, stepOffset: 2.5 }, { pitch: "A4", duration: 1, stepOffset: 3 }, { pitch: "G4", duration: 1, stepOffset: 4 }, { pitch: "C4", duration: 2, stepOffset: 5 }] },
  "desc_8": { i: ["A4", "C#4"], m: [{ pitch: "D4", duration: 1, stepOffset: 0 }, { pitch: "F4", duration: 1, stepOffset: 1 }, { pitch: "A4", duration: 2, stepOffset: 2 }, { pitch: "A4", duration: 1, stepOffset: 4 }, { pitch: "C#4", duration: 3, stepOffset: 5 }] },
  "desc_9": { i: ["E5", "G4"], m: [{ pitch: "E5", duration: 1, stepOffset: 0 }, { pitch: "G4", duration: 2, stepOffset: 1 }, { pitch: "G4", duration: 1, stepOffset: 3 }, { pitch: "G4", duration: 1, stepOffset: 4 }, { pitch: "F4", duration: 1, stepOffset: 5 }, { pitch: "E4", duration: 2, stepOffset: 6 }] },
  "desc_10": { i: ["F5", "G4"], m: [{ pitch: "F5", duration: 1, stepOffset: 0 }, { pitch: "G4", duration: 1.5, stepOffset: 1 }, { pitch: "G4", duration: 1.5, stepOffset: 2.5 }] },
  "desc_11": { i: ["C5", "Db4"], m: [{ pitch: "C5", duration: 2, stepOffset: 0 }, { pitch: "Db4", duration: 2, stepOffset: 2 }, { pitch: "C5", duration: 2, stepOffset: 4 }, { pitch: "Db4", duration: 2, stepOffset: 6 }] },
  "desc_12": { i: ["G4", "G3"], m: [{ pitch: "G4", duration: 1, stepOffset: 0 }, { pitch: "G4", duration: 1, stepOffset: 1 }, { pitch: "G4", duration: 1, stepOffset: 2 }, { pitch: "E4", duration: 1, stepOffset: 3 }, { pitch: "C4", duration: 1, stepOffset: 4 }, { pitch: "G4", duration: 1, stepOffset: 5 }, { pitch: "G3", duration: 2, stepOffset: 6 }] },
  "desc_13": { i: ["A4", "Eb4"], m: [{ pitch: "A4", duration: 1, stepOffset: 0 }, { pitch: "Eb4", duration: 1, stepOffset: 1 }, { pitch: "A4", duration: 1, stepOffset: 2 }, { pitch: "Eb4", duration: 1, stepOffset: 3 }] },
};

  const ascIntervals = [
    { id: 1, name: "Minor 2nd", dir: "↑ ascending", song: "Jaws Theme", desc: 'The menacing two-note motif', icon: Waves, iconColor: "text-red-700 dark:text-red-200", bg: "bg-red-500/10 dark:bg-red-500/30", border: "border-red-400/30" },
    { id: 2, name: "Major 2nd", dir: "↑ ascending", song: "Happy Birthday", desc: 'The first leap "Hap-py Birth..."', icon: Cake, iconColor: "text-orange-700 dark:text-orange-200", bg: "bg-orange-500/10 dark:bg-orange-500/30", border: "border-orange-400/30" },
    { id: 3, name: "Minor 3rd", dir: "↑ ascending", song: "Greensleeves", desc: 'The opening melody "A-las my love"', icon: Crown, iconColor: "text-amber-700 dark:text-amber-200", bg: "bg-amber-500/10 dark:bg-amber-500/30", border: "border-amber-400/30" },
    { id: 4, name: "Major 3rd", dir: "↑ ascending", song: "When the Saints", desc: '"Oh when the saints" — first leap', icon: Sun, iconColor: "text-yellow-700 dark:text-yellow-200", bg: "bg-yellow-500/10 dark:bg-yellow-500/30", border: "border-yellow-400/30" },
    { id: 5, name: "Perfect 4th", dir: "↑ ascending", song: "Here Comes the Bride", desc: 'The iconic wedding march opening', icon: Heart, iconColor: "text-orange-600 dark:text-orange-300", bg: "bg-orange-500/10 dark:bg-orange-500/30", border: "border-orange-400/30" },
    { id: 7, name: "Perfect 5th", dir: "↑ ascending", song: "Star Wars Theme", desc: 'The heroic opening jump', icon: Star, iconColor: "text-orange-600 dark:text-orange-300", bg: "bg-orange-500/10 dark:bg-orange-500/30", border: "border-orange-400/30" },
    { id: 8, name: "Minor 6th", dir: "↑ ascending", song: "The Entertainer", desc: 'The upbeat ragtime leap', icon: Music, iconColor: "text-orange-600 dark:text-orange-300", bg: "bg-orange-500/10 dark:bg-orange-500/30", border: "border-orange-400/30" },
    { id: 9, name: "Major 6th", dir: "↑ ascending", song: "NBC Chimes", desc: 'The famous three-note broadcast tone', icon: Tv, iconColor: "text-orange-600 dark:text-orange-300", bg: "bg-orange-500/10 dark:bg-orange-500/30", border: "border-orange-400/30" },
    { id: 10, name: "Minor 7th", dir: "↑ ascending", song: "Somewhere (West Side Story)", desc: '"There\'s a place for us"', icon: Star, iconColor: "text-orange-600 dark:text-orange-300", bg: "bg-orange-500/10 dark:bg-orange-500/30", border: "border-orange-400/30" },
    { id: 11, name: "Major 7th", dir: "↑ ascending", song: "Take On Me (Chorus)", desc: '"Taaake onn meeeee"', icon: Heart, iconColor: "text-amber-600 dark:text-amber-300", bg: "bg-amber-500/10 dark:bg-amber-500/30", border: "border-amber-400/30" },
    { id: 12, name: "Perfect Octave", dir: "↑ ascending", song: "Over the Rainbow", desc: '"Some-where over the rainbow"', icon: Cloud, iconColor: "text-emerald-600 dark:text-emerald-300", bg: "bg-emerald-500/10 dark:bg-emerald-500/30", border: "border-emerald-400/30" },
    { id: 13, name: "Tritone", dir: "↑ ascending", song: "The Simpsons Theme", desc: '"The Simp-sons" — the opening leap', icon: Tv, iconColor: "text-red-600 dark:text-red-300", bg: "bg-red-500/10 dark:bg-red-500/30", border: "border-red-400/30" },
  ];

  const descIntervals = [
    { id: 1, name: "Minor 2nd", dir: "↓ descending", song: "Fur Elise", desc: 'The famous classical opening', icon: Waves, iconColor: "text-red-700 dark:text-red-200", bg: "bg-red-500/10 dark:bg-red-500/30", border: "border-red-400/30" },
    { id: 2, name: "Major 2nd", dir: "↓ descending", song: "Mary Had a Little Lamb", desc: '"Ma-ry" first two notes', icon: Cake, iconColor: "text-orange-700 dark:text-orange-200", bg: "bg-orange-500/10 dark:bg-orange-500/30", border: "border-orange-400/30" },
    { id: 3, name: "Minor 3rd", dir: "↓ descending", song: "This Old Man", desc: '"This old man" opening', icon: Crown, iconColor: "text-amber-700 dark:text-amber-200", bg: "bg-amber-500/10 dark:bg-amber-500/30", border: "border-amber-400/30" },
    { id: 4, name: "Major 3rd", dir: "↓ descending", song: "Beethoven's 5th Symphony", desc: 'The famous "Da-da-da-DUM"', icon: Sun, iconColor: "text-yellow-700 dark:text-yellow-200", bg: "bg-yellow-500/10 dark:bg-yellow-500/30", border: "border-yellow-400/30" },
    { id: 5, name: "Perfect 4th", dir: "↓ descending", song: "Hallelujah Chorus", desc: '"Hal-le-lu-jah" drop', icon: Heart, iconColor: "text-orange-600 dark:text-orange-300", bg: "bg-orange-500/10 dark:bg-orange-500/30", border: "border-orange-400/30" },
    { id: 7, name: "Perfect 5th", dir: "↓ descending", song: "Flintstones Theme", desc: 'The "Flint-stones" drop', icon: Star, iconColor: "text-orange-600 dark:text-orange-300", bg: "bg-orange-500/10 dark:bg-orange-500/30", border: "border-orange-400/30" },
    { id: 8, name: "Minor 6th", dir: "↓ descending", song: "Across the Stars (Star Wars)", desc: 'The sweeping romantic melody', icon: Heart, iconColor: "text-orange-600 dark:text-orange-300", bg: "bg-orange-500/10 dark:bg-orange-500/30", border: "border-orange-400/30" },
    { id: 9, name: "Major 6th", dir: "↓ descending", song: "NBC Chimes", desc: 'The famous broadcast tone', icon: Music, iconColor: "text-orange-600 dark:text-orange-300", bg: "bg-orange-500/10 dark:bg-orange-500/30", border: "border-orange-400/30" },
    { id: 10, name: "Minor 7th", dir: "↓ descending", song: "Till There Was You", desc: 'The jazz standard drop', icon: Star, iconColor: "text-orange-600 dark:text-orange-300", bg: "bg-orange-500/10 dark:bg-orange-500/30", border: "border-orange-400/30" },
    { id: 11, name: "Major 7th", dir: "↓ descending", song: "Fantasy Leap", desc: 'A dreamy scalar drop', icon: Heart, iconColor: "text-amber-600 dark:text-amber-300", bg: "bg-amber-500/10 dark:bg-amber-500/30", border: "border-amber-400/30" },
    { id: 12, name: "Perfect Octave", dir: "↓ descending", song: "Show Business", desc: '"There\'s no bus-i-ness"', icon: Cloud, iconColor: "text-emerald-600 dark:text-emerald-300", bg: "bg-emerald-500/10 dark:bg-emerald-500/30", border: "border-emerald-400/30" },
    { id: 13, name: "Tritone", dir: "↓ descending", song: "Danse Macabre", desc: 'The spooky classical drop', icon: Tv, iconColor: "text-red-600 dark:text-red-300", bg: "bg-red-500/10 dark:bg-red-500/30", border: "border-red-400/30" },
  ];

  const intervals = intervalDir === "asc" ? ascIntervals : descIntervals;

  const sections = [
    {
      title: "Interval Song References",
      stage: "Stages 1-3",
      icon: Music,
      content: (
        <>
          <p className="text-base text-orange-900 dark:text-orange-100 mb-8 mt-2 font-medium">
            Each example first plays the <strong className="text-orange-950 dark:text-white font-bold">interval</strong> by itself, pauses, then plays the full melody so you can hear it in context.
          </p>
          
          <div className="flex gap-4 mb-8">
            <button 
              onClick={() => setIntervalDir("asc")}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-black shadow-md transition-colors ${intervalDir === 'asc' ? 'bg-orange-500 text-white dark:text-black hover:bg-orange-600 dark:hover:bg-orange-400' : 'bg-white/50 dark:bg-white/10 border border-black/10 dark:border-white/20 text-orange-950 dark:text-white hover:bg-white/70 dark:hover:bg-white/20'}`}
            >
              <ArrowUp className="w-4 h-4"/> Ascending
            </button>
            <button 
              onClick={() => setIntervalDir("desc")}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-colors ${intervalDir === 'desc' ? 'bg-orange-500 text-white dark:text-black hover:bg-orange-600 dark:hover:bg-orange-400' : 'bg-white/50 dark:bg-white/10 border border-black/10 dark:border-white/20 text-orange-950 dark:text-white hover:bg-white/70 dark:hover:bg-white/20'}`}
            >
              <ArrowDown className="w-4 h-4"/> Descending
            </button>
          </div>

          <div className="space-y-4">
            {intervals.map(inv => {
              const Icon = inv.icon;
              return (
                <div key={inv.id} className={`group flex items-center p-5 rounded-2xl border ${inv.border} ${activeAudio === `${intervalDir}_${inv.id}` ? 'bg-orange-500/10 border-orange-500/50 scale-[1.02]' : 'bg-white/40 dark:bg-black/20 hover:bg-white/60 dark:hover:bg-black/30'} transition-all cursor-pointer shadow-sm`}
                  onClick={() => handlePlaySequence(intervalDir, inv.id)}>
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center mr-6 transition-all relative overflow-hidden ${activeAudio === `${intervalDir}_${inv.id}` ? 'bg-orange-500 text-white animate-pulse' : inv.bg}`}>
                    <Icon className={`w-7 h-7 ${inv.iconColor} transition-opacity duration-300 group-hover:opacity-0`} />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <Play className={`w-6 h-6 ${inv.iconColor}`} fill="currentColor" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-1.5">
                      <span className="font-black text-xl text-orange-950 dark:text-white">{inv.name}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-orange-800 dark:text-orange-200 bg-black/5 dark:bg-white/10 px-2.5 py-1 rounded">{inv.dir}</span>
                    </div>
                    <div className="text-sm text-orange-800 dark:text-orange-100 font-semibold mb-0.5">{inv.song}</div>
                    <div className="text-xs text-orange-700/70 dark:text-orange-200/70 italic">"{inv.desc}"</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )
    },
    {
      title: "Major vs Minor",
      stage: "Stage 2",
      icon: Smile,
      content: (
        <div className="space-y-6 text-orange-900 dark:text-orange-100 leading-relaxed text-lg">
          <p>The core difference between Major and Minor is emotional resonance. <strong className="text-orange-950 dark:text-white">Major</strong> sounds bright, happy, and resolved (like a sunny day). <strong className="text-orange-950 dark:text-white">Minor</strong> sounds dark, sad, or tense (like a rainy day).</p>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="bg-white/40 dark:bg-black/20 p-6 rounded-xl border border-orange-500/30 shadow-sm">
              <h4 className="font-bold text-orange-950 dark:text-white text-xl mb-2">Major</h4>
              <p className="text-sm text-orange-800 dark:text-orange-100">Interval pattern features a Major 3rd. It feels stable and uplifting.</p>
            </div>
            <div className="bg-white/40 dark:bg-black/20 p-6 rounded-xl border border-red-500/30 shadow-sm">
              <h4 className="font-bold text-orange-950 dark:text-white text-xl mb-2">Minor</h4>
              <p className="text-sm text-orange-800 dark:text-orange-100">Interval pattern features a Minor 3rd. It feels melancholy or tense.</p>
            </div>
          </div>
        </div>
      )
    },
    {
      title: "Scale Recognition",
      stage: "Stage 3 (Levels 6-10)",
      icon: Rainbow,
      content: (
        <div className="space-y-6 text-orange-900 dark:text-orange-100 leading-relaxed text-lg">
          <p>Listening for specific altered notes is the key to scale recognition.</p>
          <ul className="list-disc pl-6 space-y-3">
            <li><strong className="text-orange-950 dark:text-white">Natural Minor</strong>: Standard minor scale, sounds somewhat medieval or folk-like.</li>
            <li><strong className="text-orange-950 dark:text-white">Harmonic Minor</strong>: Minor scale with a raised 7th. Distinctly "spooky" or Middle-Eastern sound.</li>
            <li><strong className="text-orange-950 dark:text-white">Melodic Minor</strong>: Raised 6th and 7th going up, natural minor going down. Sounds almost Major at the top.</li>
            <li><strong className="text-orange-950 dark:text-white">Diminished</strong>: Minor with a lowered 5th. Extremely tense, scary, and demanding resolution.</li>
            <li><strong className="text-orange-950 dark:text-white">Augmented</strong>: Major with a raised 5th. Sounds dream-like, floating, or magical.</li>
            <li><strong className="text-orange-950 dark:text-white">Pentatonic</strong>: 5-note scale. Sounds distinctly open, airy, and is impossible to play a dissonant note in.</li>
          </ul>
        </div>
      )
    },
    {
      title: "Cadence Recognition",
      stage: "Stage 3 (Levels 8-9)",
      icon: Home,
      content: (
        <div className="space-y-6 text-orange-900 dark:text-orange-100 leading-relaxed text-lg">
          <p>Cadences are musical punctuation marks at the end of phrases.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white/40 dark:bg-black/20 p-5 rounded-xl border border-black/5 dark:border-white/10 shadow-sm"><strong className="text-orange-950 dark:text-white">Authentic (V → I)</strong><br/><span className="text-sm">The "period". Very final and satisfying.</span></div>
            <div className="bg-white/40 dark:bg-black/20 p-5 rounded-xl border border-black/5 dark:border-white/10 shadow-sm"><strong className="text-orange-950 dark:text-white">Plagal (IV → I)</strong><br/><span className="text-sm">The "Amen" cadence. Soft, spiritual resolution.</span></div>
            <div className="bg-white/40 dark:bg-black/20 p-5 rounded-xl border border-black/5 dark:border-white/10 shadow-sm"><strong className="text-orange-950 dark:text-white">Half (Anything → V)</strong><br/><span className="text-sm">The "comma". Unfinished, leaves you hanging.</span></div>
            <div className="bg-white/40 dark:bg-black/20 p-5 rounded-xl border border-black/5 dark:border-white/10 shadow-sm"><strong className="text-orange-950 dark:text-white">Deceptive (V → vi)</strong><br/><span className="text-sm">The "plot twist". Expects to end, but goes minor.</span></div>
          </div>
        </div>
      )
    },
    {
      title: "Mode Recognition",
      stage: "Stage 4",
      icon: Compass,
      content: (
        <div className="space-y-4 text-orange-900 dark:text-orange-100 leading-relaxed text-lg">
          <p>Modes are alterations of major/minor scales. Listen for the ONE note that makes it weird.</p>
          <div className="bg-white/40 dark:bg-black/20 p-6 rounded-xl border border-orange-500/20 shadow-sm">
            <h4 className="text-orange-950 dark:text-white font-bold mb-2">Major Modes</h4>
            <ul className="text-sm space-y-2 text-orange-800 dark:text-orange-100">
              <li>• <strong className="text-orange-950 dark:text-white">Lydian</strong>: Major scale with a sharp 4th. Sounds dreamy, floating, magical.</li>
              <li>• <strong className="text-orange-950 dark:text-white">Mixolydian</strong>: Major scale with a flat 7th. Sounds rock/bluesy, dominant.</li>
              <li>• <strong className="text-orange-950 dark:text-white">Ionian</strong>: The standard Major scale. Pure and happy.</li>
            </ul>
          </div>
          <div className="bg-white/40 dark:bg-black/20 p-6 rounded-xl border border-red-500/20 shadow-sm">
            <h4 className="text-orange-950 dark:text-white font-bold mb-2">Minor Modes</h4>
            <ul className="text-sm space-y-2 text-orange-800 dark:text-orange-100">
              <li>• <strong className="text-orange-950 dark:text-white">Dorian</strong>: Minor scale with a natural (raised) 6th. Sounds jazzy, heroic.</li>
              <li>• <strong className="text-orange-950 dark:text-white">Phrygian</strong>: Minor scale with a flat 2nd. Sounds dark, Spanish/flamenco.</li>
              <li>• <strong className="text-orange-950 dark:text-white">Aeolian</strong>: The standard Natural Minor scale. Sad and somber.</li>
              <li>• <strong className="text-orange-950 dark:text-white">Locrian</strong>: Minor scale with a flat 2nd AND a flat 5th. Very dissonant and unstable.</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      title: "Exact Note Recognition",
      stage: "Stage 4",
      icon: Target,
      content: (
        <div className="space-y-4 text-orange-900 dark:text-orange-100 leading-relaxed text-lg">
          <p>True absolute pitch is rare, but you can build <strong className="text-orange-950 dark:text-white">Pitch Memory</strong>.</p>
          <p>1. <strong className="text-orange-950 dark:text-white">Reference Songs</strong>: Memorize the exact pitch of your favorite song. (e.g. Let It Be is exactly C Major).</p>
          <p>2. <strong className="text-orange-950 dark:text-white">Vocal Resonance</strong>: Sing the lowest note you can comfortably hit. Memorize what note that is (e.g. E2). Use it as a measuring stick.</p>
          <p>3. <strong className="text-orange-950 dark:text-white">Timbre</strong>: On a piano, different keys have slightly different physical resonances. C major sounds "white" and clear, while Db sounds "warm" and fuzzy.</p>
        </div>
      )
    }
  ];

  return (
    <div id="tour-tips-content" className="max-w-5xl mx-auto pb-20 space-y-6 animate-in fade-in zoom-in-95 duration-300">
      {sections.map((section, idx) => {
        const isExpanded = expandedSection === section.title;
        const Icon = section.icon;
        
        // Cycle through intense red/orange/yellow gradients for Dark mode, soft pastel gradients for Light mode
        const darkGradients = [
          "dark:from-red-900 dark:via-orange-900 dark:to-yellow-900 dark:border-orange-500/40",
          "dark:from-orange-900 dark:via-amber-900 dark:to-yellow-900 dark:border-yellow-500/40",
          "dark:from-amber-900 dark:via-red-900 dark:to-orange-900 dark:border-red-500/40",
          "dark:from-amber-900 dark:via-yellow-900 dark:to-orange-900 dark:border-amber-500/40",
          "dark:from-red-950 dark:via-amber-900 dark:to-red-800 dark:border-amber-500/40",
          "dark:from-yellow-900 dark:via-orange-900 dark:to-red-900 dark:border-orange-500/40",
        ];
        
        const lightGradients = [
          "from-orange-100 to-amber-100 border-orange-200",
          "from-amber-100 to-yellow-100 border-amber-200",
          "from-amber-100 to-orange-100 border-amber-200",
          "from-yellow-100 to-amber-100 border-yellow-200",
          "from-red-100 to-amber-100 border-red-200",
          "from-amber-100 to-orange-100 border-amber-200",
        ];

        const gradient = `${lightGradients[idx % lightGradients.length]} ${darkGradients[idx % darkGradients.length]}`;

        return (
          <Card key={section.title} className={`border shadow-2xl overflow-hidden bg-gradient-to-br ${gradient} transition-all duration-300`}>
            <div 
              className={`p-7 flex justify-between items-center cursor-pointer transition-colors ${isExpanded ? 'bg-black/5 dark:bg-black/20' : 'bg-transparent dark:bg-black/10 hover:bg-black/5 dark:hover:bg-black/20'}`}
              onClick={() => setExpandedSection(isExpanded ? null : section.title)}
            >
              <div className="flex items-center gap-5">
                <Icon className={`w-8 h-8 text-orange-600 dark:text-white drop-shadow-lg ${isExpanded ? 'scale-110 transition-transform' : ''}`} />
                <div>
                  <h3 className="font-serif text-3xl font-bold text-orange-950 dark:text-white mb-1">{section.title}</h3>
                  <p className="text-[12px] font-bold text-orange-600 dark:text-orange-200 uppercase tracking-widest">{section.stage}</p>
                </div>
              </div>
              {isExpanded ? <ChevronDown className="w-8 h-8 text-orange-800 dark:text-white" /> : <ChevronRight className="w-8 h-8 text-orange-800/70 dark:text-white/70" />}
            </div>
            
            {isExpanded && (
              <div className="px-7 pb-7 pt-4 bg-white/40 dark:bg-black/30 border-t border-black/5 dark:border-white/10 animate-in slide-in-from-top-4 duration-300">
                {section.content}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
