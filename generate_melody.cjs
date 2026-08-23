const fs = require('fs');

const data = JSON.parse(fs.readFileSync('./bach1.json', 'utf8'));

// 120 BPM => 1 beat = 0.5s
const BEAT_TO_SEC = 0.5;

let resultStr = `export const FULL_MELODY = [\n`;

data.exercise_measures.forEach(measure => {
  resultStr += `  // Measure ${measure.measure_number} - ${measure.active_key}\n`;
  
  // We need to slice the measure into small chunks wherever a note starts or ends
  let events = [];
  
  const processHand = (handData, handName) => {
    if (!handData) return;
    handData.notes.forEach(note => {
      events.push({
        time: note.beat_offset,
        type: 'start',
        note: note,
        hand: handName
      });
      events.push({
        time: note.beat_offset + note.duration_beats,
        type: 'end',
        note: note,
        hand: handName
      });
    });
  };
  
  processHand(measure.right_hand, 'right');
  processHand(measure.left_hand, 'left');
  
  // Get all unique times
  let times = [...new Set(events.map(e => e.time))].sort((a, b) => a - b);
  
  // For each time segment, what is playing?
  let activeRight = null;
  let activeLeft = null;
  
  for (let i = 0; i < times.length - 1; i++) {
    const tStart = times[i];
    const tEnd = times[i+1];
    const durationBeats = tEnd - tStart;
    
    // Update active notes
    events.filter(e => e.time === tStart && e.type === 'start').forEach(e => {
      if (e.hand === 'right') activeRight = e.note;
      if (e.hand === 'left') activeLeft = e.note;
    });
    
    events.filter(e => e.time === tStart && e.type === 'end').forEach(e => {
      if (e.hand === 'right' && activeRight === e.note) activeRight = null;
      if (e.hand === 'left' && activeLeft === e.note) activeLeft = null;
    });
    
    // Determine if tied to next (if the note continues beyond tEnd)
    const rightTied = activeRight && (activeRight.beat_offset + activeRight.duration_beats > tEnd);
    const leftTied = activeLeft && (activeLeft.beat_offset + activeLeft.duration_beats > tEnd);
    
    let chordNotes = [];
    
    const parsePitch = (pitch, tied) => {
      if (pitch === 'REST') return null;
      let note = pitch.replace(/\d/g, '');
      let octave = parseInt(pitch.replace(/\D/g, ''));
      // Handle accidentals
      note = note.replace('#', 'sharp').replace('b', 'flat');
      let str = `{ note: "${note}", octave: ${octave}`;
      if (tied) str += `, tiedToNext: true`;
      str += ` }`;
      return str;
    };
    
    if (activeRight) {
      let parsed = parsePitch(activeRight.pitch, rightTied);
      if (parsed) chordNotes.push(parsed);
    }
    if (activeLeft) {
      let parsed = parsePitch(activeLeft.pitch, leftTied);
      if (parsed) chordNotes.push(parsed);
    }
    
    // Duration in seconds
    const durSec = durationBeats * BEAT_TO_SEC;
    
    if (chordNotes.length > 0) {
      resultStr += `  { duration: ${durSec}, chord: [ ${chordNotes.join(', ')} ] },\n`;
    } else {
      // It's a rest
      resultStr += `  { duration: ${durSec}, chord: [] },\n`;
    }
  }
});

resultStr += `];\n`;

fs.writeFileSync('generated_melody.ts', resultStr);
console.log('Done!');
