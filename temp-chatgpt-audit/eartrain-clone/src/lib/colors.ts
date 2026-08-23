export const getNoteColor = (noteName: string) => {
  // Normalize to standard Boomwhacker/ChromaNote colors
  // Extract just the note name without octave
  const pitch = noteName.replace(/[0-9]/g, '');
  
  switch (pitch) {
    case 'C': return 'bg-red-500';
    case 'C#':
    case 'Db': return 'bg-rose-600';
    case 'D': return 'bg-orange-500';
    case 'D#':
    case 'Eb': return 'bg-amber-500';
    case 'E': return 'bg-yellow-400';
    case 'F': return 'bg-green-500';
    case 'F#':
    case 'Gb': return 'bg-emerald-600';
    case 'G': return 'bg-teal-500';
    case 'G#':
    case 'Ab': return 'bg-cyan-600';
    case 'A': return 'bg-indigo-500'; // Standard A is often purple/indigo
    case 'A#':
    case 'Bb': return 'bg-purple-600';
    case 'B': return 'bg-pink-500';
    default: return 'bg-stone-500';
  }
};
