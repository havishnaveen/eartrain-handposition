import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { OpenSheetMusicDisplay, IOSMDOptions, VoiceEntry, Note } from 'opensheetmusicdisplay';
import * as Tone from 'tone';
import { initToneAudio, stopToneAudio } from '../lib/toneAudio';

// A malformed or partially loaded MusicXML cursor must never freeze the UI.
const MAX_OSMD_CURSOR_STEPS = 20_000;

interface OSMDScoreProps {
  fileUrl: string;
  onScoreLoaded?: () => void;
  options?: IOSMDOptions;
}

export interface OSMDScoreRef {
  playSegment: (startMeasure: number, startRealValue: number, endMeasure: number, endRealValue: number, onComplete?: () => void) => void;
  stop: () => void;
  osmd: OpenSheetMusicDisplay | null;
}

export const OSMDScore = forwardRef<OSMDScoreRef, OSMDScoreProps>(({ fileUrl, onScoreLoaded, options }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [osmd, setOsmd] = useState<OpenSheetMusicDisplay | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const playStateRef = useRef({ isPlaying: false, currentPart: null as Tone.Part | null });

  useEffect(() => {
    if (!containerRef.current) return;

    const osmdInstance = new OpenSheetMusicDisplay(containerRef.current, {
      autoResize: true,
      drawTitle: false,
      drawPartNames: false,
      drawMeasureNumbers: true,
      cursorsOptions: [{ type: 0, color: "#f97316", alpha: 0.5, follow: true }],
      ...options
    });

    const loadScore = async () => {
      await osmdInstance.load(fileUrl);
      osmdInstance.render();
      setOsmd(osmdInstance);
      setIsLoaded(true);
      if (onScoreLoaded) onScoreLoaded();
      await initToneAudio(); // Pre-warm the Tone.js sampler
    };

    loadScore();

    return () => {
      stopToneAudio();
      osmdInstance.clear();
    };
  }, [fileUrl, options]);

  useImperativeHandle(ref, () => ({
    osmd,
    stop: () => {
      playStateRef.current.isPlaying = false;
      Tone.Transport.stop();
      Tone.Transport.cancel();
      if (playStateRef.current.currentPart) {
        playStateRef.current.currentPart.dispose();
        playStateRef.current.currentPart = null;
      }
      stopToneAudio();
      if (osmd) {
        osmd.cursor.hide();
      }
    },
    playSegment: async (startMeasure: number, startRealValue: number, endMeasure: number, endRealValue: number, onComplete?: () => void) => {
      if (!osmd || !isLoaded) {
        return;
      }
      
      // Ensure Tone AudioContext is active immediately on click (before network requests!)
      await Tone.start();

      const sampler = await initToneAudio();
      if (!sampler) {
        console.error("[OSMDScore] Sampler failed to load!");
        return;
      }

      // Stop previous playback
      Tone.Transport.stop();
      Tone.Transport.cancel();
      Tone.Transport.position = 0;
      if (playStateRef.current.currentPart) {
        playStateRef.current.currentPart.dispose();
      }
      playStateRef.current.isPlaying = true;

      // Extract notes and timings using OSMD Cursor Iterator
      osmd.cursor.reset();
      const iterator = osmd.cursor.iterator;

      // Fast-forward to startMeasure and startRealValue
      let cursorSteps = 0;
      while (!iterator.EndReached && 
            (iterator.CurrentMeasureIndex + 1 < startMeasure || 
            (iterator.CurrentMeasureIndex + 1 === startMeasure && iterator.currentTimeStamp.RealValue < startRealValue)) &&
            cursorSteps++ < MAX_OSMD_CURSOR_STEPS) {
        iterator.moveToNext();
      }

      osmd.cursor.show();
      osmd.cursor.update();

      const events: Array<{ time: number; notes: any[]; iteratorState: any }> = [];
      const TEMPO = 80; // Hardcoded for this exercise (BWV 772)
      Tone.Transport.bpm.value = TEMPO;

      let currentTimeOffset = 0;
      let lastTimestamp = iterator.currentTimeStamp.RealValue; // in fractions

      cursorSteps = 0;
      while (!iterator.EndReached && cursorSteps++ < MAX_OSMD_CURSOR_STEPS) {
        const mIndex = iterator.CurrentMeasureIndex + 1;
        const currentTimestamp = iterator.currentTimeStamp.RealValue;
        
        // Check if we passed the end boundary
        if (mIndex > endMeasure || (mIndex === endMeasure && currentTimestamp >= endRealValue)) {
          break;
        }

        const voices = iterator.CurrentVoiceEntries;
        
        // Calculate time delta in BEATS (a quarter note is 1.0 in standard OSMD, but we need to map OSMD fractions to beats)
        // OSMD's RealValue is based on whole notes = 1.0. 
        // So a quarter note = 0.25 RealValue.
        // In 4/4 time, 0.25 RealValue = 1 beat.
        const deltaReal = currentTimestamp - lastTimestamp;
        
        // If there's a negative delta (e.g. crossing a measure), we handle it by adding 1.0 (a whole measure).
        // Wait, OSMD's RealValue for currentTimeStamp is local to the measure. 
        // Example: Beat 1 = 0, Beat 4 = 0.75.
        // So if we cross a measure, currentTimestamp is 0, lastTimestamp was 0.75.
        // Delta = (1.0 - lastTimestamp) + currentTimestamp!
        let actualDeltaReal = deltaReal;
        if (deltaReal < 0) {
          actualDeltaReal = (1.0 - lastTimestamp) + currentTimestamp;
        }
        
        const deltaBeats = actualDeltaReal * 4.0; // convert whole notes to quarter note beats
        
        // Convert beats to seconds at 120 BPM (1 beat = 0.5s)
        const deltaSeconds = deltaBeats * (60 / TEMPO);
        currentTimeOffset += deltaSeconds;

        const pitchEvents: any[] = [];
        
        voices.forEach((voice: VoiceEntry) => {
          voice.Notes.forEach((note: Note) => {
            if (note.Pitch && !note.isRest()) {
              // Extract pitch string for Tone.js (e.g. C#4)
              const tonePitch = note.Pitch.ToStringShort();
              
              // Only trigger if it's not a tied continuation
              // OSMD note.isTied() returns true if it's tied. But we need to know if it's the start of a tie.
              // Note: tone js length is usually provided, but we can just use 8n or 16n based on OSMD length
              const noteLengthBeats = note.Length.RealValue * 4.0; 
              let toneDur = (noteLengthBeats * (60 / TEMPO)) * 1.2;
              
              // If tie continuation, do not re-trigger
              // In OSMD, NoteTie has startNote and notes[]. We skip retriggering if it's not the start.
              let skip = false;
              if (note.NoteTie && note.NoteTie.Notes[0] !== note) {
                skip = true;
              }

              if (!skip) {
                pitchEvents.push({ pitch: tonePitch, duration: toneDur });
              }
            }
          });
        });

        if (pitchEvents.length > 0 || iterator.CurrentMeasureIndex + 1 <= endMeasure) {
          // Push event. We also need to clone the iterator state to advance the cursor on draw
          // Since OSMD iterator doesn't clone easily, we just rely on calling cursor.next() sequentially
          events.push({
            time: currentTimeOffset,
            notes: pitchEvents,
            iteratorState: null // Placeholder
          });
        }
        
        lastTimestamp = currentTimestamp;
        iterator.moveToNext();
      }

      // We will create a Tone.Part to schedule these events
      if (events.length === 0) {
        if (playStateRef.current.isPlaying) {
          playStateRef.current.isPlaying = false;
          
          osmd.cursor.reset();
          let endCursorSteps = 0;
          while (!osmd.cursor.iterator.EndReached && 
                (osmd.cursor.iterator.CurrentMeasureIndex + 1 < endMeasure || 
                (osmd.cursor.iterator.CurrentMeasureIndex + 1 === endMeasure && osmd.cursor.iterator.currentTimeStamp.RealValue < endRealValue)) &&
                endCursorSteps++ < MAX_OSMD_CURSOR_STEPS) {
            osmd.cursor.next();
          }
          osmd.cursor.update();
          
          if (onComplete) onComplete();
        }
        return;
      }

      let eventIndex = 0;
      
      // Reset OSMD cursor to start
      osmd.cursor.reset();
      let startCursorSteps = 0;
      while (!osmd.cursor.iterator.EndReached && 
            (osmd.cursor.iterator.CurrentMeasureIndex + 1 < startMeasure || 
            (osmd.cursor.iterator.CurrentMeasureIndex + 1 === startMeasure && osmd.cursor.iterator.currentTimeStamp.RealValue < startRealValue)) &&
            startCursorSteps++ < MAX_OSMD_CURSOR_STEPS) {
        osmd.cursor.next();
      }
      osmd.cursor.update();

      const part = new Tone.Part((time, value) => {
        // Trigger audio
        value.notes.forEach((n: any) => {
          sampler.triggerAttackRelease(n.pitch, n.duration, time);
        });

        // Sync visual cursor using Tone.Draw
        Tone.Draw.schedule(() => {
          if (!playStateRef.current.isPlaying) return;
          // Advance OSMD cursor
          if (eventIndex > 0) {
            osmd.cursor.next();
          }
          eventIndex++;
          
          // If this is the last event, call onComplete shortly after
          if (eventIndex >= events.length) {
            setTimeout(() => {
              if (playStateRef.current.isPlaying) {
                playStateRef.current.isPlaying = false;
                
                // Snap cursor exactly to the pause boundary
                osmd.cursor.reset();
                let finalCursorSteps = 0;
                while (!osmd.cursor.iterator.EndReached && 
                      (osmd.cursor.iterator.CurrentMeasureIndex + 1 < endMeasure || 
                      (osmd.cursor.iterator.CurrentMeasureIndex + 1 === endMeasure && osmd.cursor.iterator.currentTimeStamp.RealValue < endRealValue)) &&
                      finalCursorSteps++ < MAX_OSMD_CURSOR_STEPS) {
                  osmd.cursor.next();
                }
                osmd.cursor.update();

                if (onComplete) onComplete();
              }
            }, 500); // give the last note a moment to ring
          }
        }, time);
      }, events);

      part.start(0);
      playStateRef.current.currentPart = part;
      Tone.Transport.start();
    }
  }));

  return (
    <div className="w-full relative bg-white dark:bg-slate-100 rounded-2xl shadow-inner p-4 overflow-x-hidden overflow-y-auto min-h-[300px] max-h-[400px]">
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
          <span className="text-slate-500 font-bold animate-pulse">Loading Musical Score...</span>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
});

OSMDScore.displayName = 'OSMDScore';
