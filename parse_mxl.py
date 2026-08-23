import music21
import json
import math

def parse_mxl(file_path):
    # Load the MusicXML file
    score = music21.converter.parse(file_path)
    
    # We want to extract a flat list of timeslices.
    # A timeslice represents a unique offset in the piece.
    # At each offset, we determine which notes are playing.
    
    # Flatten the score to get all notes across all parts
    flat_score = score.flatten()
    
    # Get all notes and rests
    elements = flat_score.notesAndRests
    
    # Group by offset
    offset_map = {}
    for el in elements:
        offset = float(el.offset)
        duration = float(el.quarterLength)
        
        if offset not in offset_map:
            offset_map[offset] = []
        
        if el.isNote:
            # tied logic
            tied = False
            if el.tie and (el.tie.type == 'stop' or el.tie.type == 'continue'):
                tied = True # This note is a continuation, don't trigger it again
            if not tied:
                offset_map[offset].append({
                    "note": el.pitch.nameWithOctave,
                    "octave": el.pitch.implicitOctave,
                    "duration": duration
                })
        elif el.isChord:
            for n in el.notes:
                tied = False
                if n.tie and (n.tie.type == 'stop' or n.tie.type == 'continue'):
                    tied = True
                if not tied:
                    offset_map[offset].append({
                        "note": n.pitch.nameWithOctave,
                        "octave": n.pitch.implicitOctave,
                        "duration": duration
                    })
    
    # Sort offsets
    offsets = sorted(list(offset_map.keys()))
    
    # Generate the FULL_MELODY array
    full_melody = []
    
    for i in range(len(offsets)):
        curr_offset = offsets[i]
        curr_notes = offset_map[curr_offset]
        
        # Determine duration to next offset
        if i < len(offsets) - 1:
            duration = offsets[i+1] - curr_offset
        else:
            # Last note duration
            duration = max([n['duration'] for n in curr_notes]) if curr_notes else 1.0
            
        duration = duration * 0.5
        
        chord = [{"note": n['note'].replace("-", "flat").replace("#", "sharp"), "octave": n['octave']} for n in curr_notes]
        
        full_melody.append({
            "duration": duration,
            "gapAfter": 0,
            "chord": chord
        })
        
    return full_melody

melody = parse_mxl("/Users/havish/Downloads/invention-bwv-772-in-c-major.mxl")

# Write to typescript file
ts_content = "export const FULL_MELODY = " + json.dumps(melody, indent=2) + ";\n"
with open("generated_melody.ts", "w") as f:
    f.write(ts_content)

print("generated_melody.ts created successfully.")
