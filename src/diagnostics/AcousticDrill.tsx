import { useEffect, useMemo, useRef, useState } from 'react';
import ExerciseView from '../components/ExerciseView';
import type { ExerciseStatus, ExerciseViewHandle } from '../components/ExerciseView';
import AnchorShiftCue from '../components/AnchorShiftCue';
import type { StaffCueHandle } from '../components/StaffCue';
import { useDrillAudio } from '../audio/useDrillAudio';
import { gradeSequence, planForQuestion } from '../audio/timing';
import type { DetectedNote, GradeResult } from '../audio/timing';
import type { Question } from '../curriculum/types';
import type { DiagnosticNotation } from './registry';
import { DiagnosticScore } from './DiagnosticScore';

/** Mastery routing is separate from the existing engine's independent category scores. */
export function passesDiagnosticDrill(report: GradeResult, question: Question): boolean {
  return report.passed && report.matched === report.expectedCount && report.expectedCount > 0 &&
    report.hardExtras === 0 && (report.scores.timing ?? 0) >= 3 &&
    (!question.anchorShift || report.transition?.onTime === true);
}
export default function AcousticDrill({ question, notation, onPassed, transfer }: {
  question: Question; notation: DiagnosticNotation; onPassed: () => void; transfer: boolean;
}) {
  const [status, setStatus] = useState<ExerciseStatus>('position-prompt');
  const [report, setReport] = useState<GradeResult | null>(null);
  const [detected, setDetected] = useState<DetectedNote[]>([]);
  const [progress, setProgress] = useState(0), [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
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
      setReport(result); setDetected(notes); setProgress(100); setStatus('report'); scoreRef.current?.hide();
    },
  });
  useEffect(() => { alive.current = true; return () => { alive.current = false; mode.current = null; }; }, []);
  const start = async () => {
    if (busy.current || !['position-prompt', 'prompt'].includes(status)) return;
    busy.current = true; setStarting(true); setError('');
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
    {status === 'report' && !passed && <p className="diagnostic-feedback">Let’s try once more. Keep the correct notes and a steady beat{question.anchorShift ? ', including the move' : ''}.</p>}
    <ExerciseView ref={viewRef} status={status} instruction={question.instruction} exerciseMode={question.exerciseMode}
      positionProof={question.positionProof} handScope={question.handScope} anchorShift={question.anchorShift}
      onStart={() => { void start(); }} micStatus={starting ? 'requesting' : audio.micStatus}
      onCancelStart={() => { mode.current = null; audio.abort(); setStatus('prompt'); }}
      beatLabel={audio.beatLabel} isDownbeat={audio.isDownbeat} analysisProgress={progress}
      inputLevel={audio.inputLevel} detectedNotes={audio.detectedNames} proofProgress={audio.proofProgress}
      report={report} reportPlan={plan} reportDetectedNotes={detected} reportPlayStartTime={playStart.current}
      recordingUrl={audio.recordingUrl} onPlaybackFrame={beat => scoreRef.current?.seekToBeat(beat)} onPlaybackEnd={() => scoreRef.current?.hide()}
      nextLabel={passed ? transfer ? 'Finish practice' : 'Try a fresh phrase' : 'Try this phrase again'}
      onNext={() => { if (passed) onPassed(); else { audio.abort(); setReport(null); setStatus('position-prompt'); } }}>
      {question.anchorShift ? <AnchorShiftCue ref={scoreRef} cue={question.cue} shift={question.anchorShift} notationScale={2.5} accentColor="#ef6a47" inkColor="#242237" /> :
        <DiagnosticScore ref={scoreRef} question={question} notation={notation} />}
    </ExerciseView>
  </>;
}
