import { useEffect, useMemo, useRef, useState } from 'react';
import ExerciseView from '../components/ExerciseView';
import type { ExerciseStatus, ExerciseViewHandle } from '../components/ExerciseView';
import AnchorShiftCue from '../components/AnchorShiftCue';
import type { StaffCueHandle } from '../components/StaffCue';
import { useDrillAudio } from '../audio/useDrillAudio';
import { alignPitchSequences, gradeSequence, pitchToMidi, planForQuestion } from '../audio/timing';
import type { DetectedNote, GradeResult } from '../audio/timing';
import type { Question } from '../curriculum/types';
import type { DiagnosticNotation } from './registry';
import { DiagnosticScore } from './DiagnosticScore';

const DIATONIC_STEPS: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const STEP_TO_LETTER = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

export function transposeToOppositeClef(pitch: string, writtenClef: 'bass' | 'treble'): string | null {
  const match = /^([A-G])([#b]*)(-?\d+)$/.exec(pitch.trim());
  if (!match) return null;
  const [, letter, accidentals, octaveStr] = match;
  const octave = parseInt(octaveStr, 10);
  const step = DIATONIC_STEPS[letter];
  if (step === undefined) return null;

  const diatonicIndex = octave * 7 + step;
  // Bass to Treble is +12 diatonic steps; Treble to Bass is -12 diatonic steps
  const shift = writtenClef === 'bass' ? 12 : -12;
  const newDiatonicIndex = diatonicIndex + shift;

  const newOctave = Math.floor(newDiatonicIndex / 7);
  const newStep = ((newDiatonicIndex % 7) + 7) % 7;
  return `${STEP_TO_LETTER[newStep]}${accidentals}${newOctave}`;
}

export function isClefTranspositionMistake(
  expectedSequence: string[],
  detected: readonly Pick<DetectedNote, 'midi'>[],
  writtenClef: 'bass' | 'treble' = 'bass'
): boolean {
  if (!detected.length || !expectedSequence.length) return false;

  const wrongClefSequence = expectedSequence
    .map(p => transposeToOppositeClef(p, writtenClef))
    .filter((p): p is string => p !== null);
  if (!wrongClefSequence.length) return false;

  const wrongClefMidi = wrongClefSequence
    .map(pitchToMidi)
    .filter((m): m is number => m !== null);
  if (!wrongClefMidi.length) return false;

  // Exact pitch alignment against wrong-clef sequence
  const exactMatches = alignPitchSequences(wrongClefMidi, detected, m => m)
    .filter(op => op.kind === 'match').length;

  // Allow for octave-displaced hand positioning (+-12 semitones)
  const lowerMatches = alignPitchSequences(wrongClefMidi.map(m => m - 12), detected, m => m)
    .filter(op => op.kind === 'match').length;
  const higherMatches = alignPitchSequences(wrongClefMidi.map(m => m + 12), detected, m => m)
    .filter(op => op.kind === 'match').length;

  const bestMatches = Math.max(exactMatches, lowerMatches, higherMatches);

  const detectedRatio = bestMatches / detected.length;
  const expectedRatio = bestMatches / expectedSequence.length;

  // Only trigger if over 40%+ of detected notes were right in the wrong clef
  return detectedRatio >= 0.4 && expectedRatio >= 0.4;
}

/** Mastery routing is separate from the existing engine's independent category scores. */
export function passesDiagnosticDrill(report: GradeResult, question: Question): boolean {
  return report.passed && report.matched === report.expectedCount && report.expectedCount > 0 &&
    report.hardExtras === 0 && (report.scores.timing ?? 0) >= 3 &&
    (!question.anchorShift || report.transition?.onTime === true);
}

export default function AcousticDrill({ question, notation, onPassed, transfer, skipProof, forcedErrorMessage }: {
  question: Question; notation: DiagnosticNotation; onPassed: () => void; transfer: boolean;
  skipProof?: boolean; forcedErrorMessage?: string;
}) {
  const noProof = skipProof || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('noproof') === '1');
  const [status, setStatus] = useState<ExerciseStatus>(noProof ? 'prompt' : 'position-prompt');
  const [report, setReport] = useState<GradeResult | null>(null);
  const [detected, setDetected] = useState<DetectedNote[]>([]);
  const [progress, setProgress] = useState(0), [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [forcedDismissed, setForcedDismissed] = useState(false);
  const [isClefError, setIsClefError] = useState(false);
  const scoreRef = useRef<StaffCueHandle>(null), viewRef = useRef<ExerciseViewHandle>(null);
  const playStart = useRef(0), alive = useRef(true), busy = useRef(false), mode = useRef<'proof' | 'take' | null>(null);
  const plan = useMemo(() => planForQuestion(question, 75), [question]);
  const audio = useDrillAudio({
    onProofListenStart: () => { if (alive.current && mode.current === 'proof') setStatus('proving'); },
    onProofSuccess: () => { if (alive.current && mode.current === 'proof') { mode.current = null; setStatus('prompt'); } },
    onPlayStart: time => { if (alive.current && mode.current === 'take') { playStart.current = time; setStatus('listening'); } },
    onFrame: beat => { if (mode.current === 'take') { scoreRef.current?.seekToBeat(beat); viewRef.current?.seekToProgress(Math.max(0, beat / plan.totalBeats)); } },
    onAnalysisStart: () => { if (alive.current && mode.current === 'take') setStatus('grading'); },
    onAnalysisProgress: value => { if (alive.current && mode.current === 'take') setProgress(value); },
    onFinish: notes => {
      if (!alive.current || mode.current !== 'take') return;
      mode.current = null;
      const result = gradeSequence(question.expectedSequence, notes, { plan, playStartTime: playStart.current,
        exerciseMode: question.exerciseMode, anchorShift: question.anchorShift });
      const passedDrill = passesDiagnosticDrill(result, question);
      const clefError = !passedDrill && Boolean(forcedErrorMessage) && isClefTranspositionMistake(
        question.expectedSequence,
        notes,
        notation.clef ?? 'bass'
      );
      setIsClefError(clefError);
      setReport(result); setDetected(notes); setProgress(100); setStatus('report'); scoreRef.current?.hide();
    },
  });
  useEffect(() => { alive.current = true; return () => { alive.current = false; mode.current = null; }; }, []);
  const start = async () => {
    if (busy.current || !['position-prompt', 'prompt'].includes(status)) return;
    busy.current = true; setStarting(true); setError(''); setForcedDismissed(false); setIsClefError(false);
    const proof = status === 'position-prompt';
    mode.current = proof ? 'proof' : 'take';
    try {
      if (!proof) { setStatus('leadin'); setProgress(0); }
      const started = proof ? await audio.beginProof(question.positionProof!) : await audio.begin(plan);
      if (!started && alive.current) { mode.current = null; setStatus(proof ? 'position-prompt' : 'prompt'); setError('The microphone could not start. Check microphone permission, then try again.'); }
    } catch {
      if (alive.current) { mode.current = null; setStatus(proof ? 'position-prompt' : 'prompt'); setError('The microphone could not start. Please try again.'); }
    } finally { busy.current = false; if (alive.current) setStarting(false); }
  };
  const passed = report ? passesDiagnosticDrill(report, question) : false;
  return <>
    {error && <p role="alert" className="diagnostic-feedback">{error}</p>}
    {status === 'report' && !passed && !isClefError && (
      <p className="diagnostic-feedback">
        Let’s try once more. Keep the correct notes and a steady beat{question.anchorShift ? ', including the move' : ''}.
      </p>
    )}
    {status === 'report' && !passed && isClefError && forcedErrorMessage && !forcedDismissed && (
      <div className="diagnostic-forced-overlay" role="alertdialog" aria-modal="true" aria-labelledby="forced-error-title">
        <div className="diagnostic-forced-card">
          <DiagnosticScore question={question} notation={notation} enlarged={true} highlightClef={true} />
          <h3 id="forced-error-title" className="diagnostic-forced-title">Check the clef</h3>
          <p className="diagnostic-forced-body">{forcedErrorMessage}</p>
          <button
            type="button"
            className="diagnostic-btn-primary diagnostic-forced-btn"
            onClick={() => {
              setForcedDismissed(true);
              setIsClefError(false);
              audio.abort();
              setReport(null);
              setStatus(noProof ? 'prompt' : 'position-prompt');
            }}
          >
            I understand
          </button>
        </div>
      </div>
    )}
    <ExerciseView ref={viewRef} status={status} instruction={question.instruction} exerciseMode={question.exerciseMode}
      positionProof={noProof ? undefined : question.positionProof} handScope={question.handScope} anchorShift={question.anchorShift}
      onStart={() => { void start(); }} micStatus={starting ? 'requesting' : audio.micStatus}
      onCancelStart={() => { mode.current = null; audio.abort(); setStatus('prompt'); }}
      beatLabel={audio.beatLabel} isDownbeat={audio.isDownbeat} analysisProgress={progress}
      inputLevel={audio.inputLevel} detectedNotes={audio.detectedNames} proofProgress={audio.proofProgress}
      report={report} reportPlan={plan} reportDetectedNotes={detected} reportPlayStartTime={playStart.current}
      recordingUrl={audio.recordingUrl} onPlaybackFrame={beat => scoreRef.current?.seekToBeat(beat)} onPlaybackEnd={() => scoreRef.current?.hide()}
      nextLabel={passed ? transfer ? 'Finish practice' : 'Try a fresh phrase' : 'Try this phrase again'}
      onNext={() => { if (passed) onPassed(); else { audio.abort(); setReport(null); setIsClefError(false); setStatus(noProof ? 'prompt' : 'position-prompt'); } }}>
      {question.anchorShift ? <AnchorShiftCue ref={scoreRef} cue={question.cue} shift={question.anchorShift} notationScale={2.5} accentColor="#ef6a47" inkColor="#242237" /> :
        <DiagnosticScore ref={scoreRef} question={question} notation={notation} enlarged={status === 'report' && !passed && isClefError} highlightClef={status === 'report' && !passed && isClefError} />}
    </ExerciseView>
  </>;
}
