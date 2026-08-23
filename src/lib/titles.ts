export type ProfileTitle = {
  id: string;
  name: string;
  price: number;
};

export const PROFILE_TITLES: ProfileTitle[] = [
  // 50-200 Gems
  { id: "novice", name: "Novice", price: 50 },
  { id: "rhythm_rookie", name: "Rhythm Rookie", price: 50 },
  { id: "beat_student", name: "Beat Student", price: 75 },
  { id: "pitch_matcher", name: "Pitch Matcher", price: 100 },
  { id: "scale_walker", name: "Scale Walker", price: 100 },
  { id: "chord_strummer", name: "Chord Strummer", price: 150 },
  { id: "harmony_helper", name: "Harmony Helper", price: 150 },
  { id: "note_reader", name: "Note Reader", price: 200 },
  
  // 300-800 Gems
  { id: "interval_inspector", name: "Interval Inspector", price: 300 },
  { id: "metronome_whisperer", name: "Metronome Whisperer", price: 400 },
  { id: "chord_conqueror", name: "Chord Conqueror", price: 500 },
  { id: "scale_specialist", name: "Scale Specialist", price: 500 },
  { id: "melody_maker", name: "Melody Maker", price: 600 },
  { id: "groove_guru", name: "Groove Guru", price: 750 },
  { id: "rhythm_ruler", name: "Rhythm Ruler", price: 800 },
  { id: "tempo_tamer", name: "Tempo Tamer", price: 800 },
  
  // 1000-2000 Gems
  { id: "perfect_pitch", name: "Perfect Pitch", price: 1000 },
  { id: "dominant_7th", name: "Dominant 7th", price: 1000 },
  { id: "virtuoso", name: "Virtuoso", price: 1200 },
  { id: "maestro", name: "Maestro", price: 1200 },
  { id: "symphony_sovereign", name: "Symphony Sovereign", price: 1500 },
  { id: "audio_alchemist", name: "Audio Alchemist", price: 1500 },
  { id: "sonic_sorcerer", name: "Sonic Sorcerer", price: 1600 },
  { id: "golden_ear", name: "Golden Ear", price: 1750 },
  { id: "platinum_pitch", name: "Platinum Pitch", price: 1800 },
  { id: "diamond_dynamics", name: "Diamond Dynamics", price: 1900 },
  { id: "legendary_listener", name: "Legendary Listener", price: 2000 },
  { id: "god_of_groove", name: "God of Groove", price: 2000 }
];
