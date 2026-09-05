import React, { useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { beatsForDuration } from '../audio/timing';
import AnchorShiftCue from '../components/AnchorShiftCue';
import ExerciseLayout from '../components/ExerciseLayout';
import ExerciseView from '../components/ExerciseView';
import StaffCue from '../components/StaffCue';
import type { StaffCueHandle } from '../components/StaffCue';
import { PROGRESSIVE_CONCEPTS } from '../curriculum/progressiveCurriculum';
import { makeRandom } from '../curriculum/positions';
import type { Question } from '../curriculum/types';
import '../index.css';

type AuditFrame =
  | 'memory-prompt' | 'memory-look' | 'memory-play'
  | 'shift-overview' | 'shift-rest' | 'shift-land'
  | 'chord-reference' | 'chord-listen' | 'chord-search' | 'chord-complete';

const FRAME = (new URLSearchParams(window.location.search).get('frame') ?? 'memory-look') as AuditFrame;

function question(lessonIndex: number, questionNumber: number): Question {
  const lesson = PROGRESSIVE_CONCEPTS[lessonIndex - 1];
  return lesson.generate(lessonIndex * 10 + questionNumber, makeRandom(42), 0.5, 'normal', questionNumber);
}

function Frame() {
  const shiftRef = useRef<StaffCueHandle>(null);
  const config = useMemo(() => {
    if (FRAME.startsWith('memory')) return { question: question(9, 3), lesson: 9 };
    if (FRAME.startsWith('shift')) return { question: question(14, 1), lesson: 14 };
    return { question: question(19, 1), lesson: 19 };
  }, []);
  const active = config.question;
  const status = FRAME === 'memory-prompt' || FRAME === 'shift-overview' || FRAME === 'chord-reference'
    ? 'prompt'
    : FRAME === 'memory-look'
      ? 'memory-preview'
      : FRAME === 'chord-listen'
        ? 'chord-cue'
        : FRAME === 'chord-search'
          ? 'chord-build'
          : FRAME === 'chord-complete'
            ? 'chord-complete'
            : 'listening';

  useEffect(() => {
    if (!active.anchorShift) return;
    const staff = active.cue.staves[0];
    const firstBeats = staff.notes.slice(0, active.anchorShift.splitIndex)
      .reduce((sum, note) => sum + beatsForDuration(note.duration), 0);
    if (FRAME === 'shift-rest') shiftRef.current?.seekToBeat(firstBeats + 2);
    else if (FRAME === 'shift-land') shiftRef.current?.seekToBeat(firstBeats + 4.25);
    else shiftRef.current?.seekToBeat(0.25);
  }, [active]);

  return (
    <ExerciseLayout
      questionNumber={1}
      questionsInLoop={4}
      lessonNumber={config.lesson}
      totalLessons={24}
      lessonTitle={PROGRESSIVE_CONCEPTS[config.lesson - 1].title}
      lessonFocus={PROGRESSIVE_CONCEPTS[config.lesson - 1].focus}
      phaseLabel={PROGRESSIVE_CONCEPTS[config.lesson - 1].phaseLabel}
    >
      <ExerciseView
        status={status}
        instruction={active.instruction}
        exerciseMode={active.exerciseMode}
        blindMemory={active.blindMemory}
        anchorShift={active.anchorShift}
        spatialChord={active.spatialChord}
        memorySecondsRemaining={7}
        beatLabel={FRAME === 'shift-rest' ? '3' : FRAME === 'shift-land' ? '1' : '2'}
        inputLevel={FRAME === 'chord-search' ? 0.62 : 0.2}
        spatialProgress={FRAME === 'chord-search' ? 1 : FRAME === 'chord-complete' ? 3 : 0}
        spatialFoundMidi={[]}
        startLabel={active.exerciseMode === 'spatial-chord' ? 'Hear the target' : 'Start drill'}
      >
        {active.anchorShift ? (
          <AnchorShiftCue ref={shiftRef} cue={active.cue} shift={active.anchorShift} notationScale={2.55} />
        ) : (
          <StaffCue cue={active.cue} notationScale={2.3} />
        )}
      </ExerciseView>
    </ExerciseLayout>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Frame /></React.StrictMode>);
