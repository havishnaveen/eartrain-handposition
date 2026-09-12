import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as OSMDModule from 'opensheetmusicdisplay';
import type { Question } from '../curriculum/types';
import type { StaffCueHandle } from '../components/StaffCue';
import type { DiagnosticNotation } from './registry';
import { diagnosticMusicXML } from './notation';

interface Renderer { load(xml: string): Promise<void>; render(): void; Zoom: number; cursor: { reset(): void; next(): void; show(): void; hide(): void } }
const OSMD = (OSMDModule as unknown as { OpenSheetMusicDisplay: new (host: HTMLElement, options: Record<string, unknown>) => Renderer }).OpenSheetMusicDisplay;
export const DiagnosticScore = forwardRef<StaffCueHandle, { question: Question; notation: DiagnosticNotation; highlight?: boolean }>(function DiagnosticScore({ question, notation, highlight = false }, ref) {
  const host = useRef<HTMLDivElement>(null), renderer = useRef<Renderer | null>(null), active = useRef(-1);
  const [error, setError] = useState(false);
  useImperativeHandle(ref, () => ({
    seekToBeat(beat) {
      const score = renderer.current;
      if (!score) return;
      const target = Math.max(0, Math.min(question.expectedSequence.length - 1, Math.floor(beat)));
      if (target === active.current) return;
      score.cursor.reset();
      for (let i = 0; i < target; i++) score.cursor.next();
      score.cursor.show(); active.current = target;
    },
    hide() { renderer.current?.cursor.hide(); active.current = -1; },
  }), [question]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false, frame = 0;
    setError(false);
    const score = new OSMD(element, { backend: 'svg', autoResize: false, drawTitle: false, drawSubtitle: false, drawComposer: false, drawPartNames: false, drawMeasureNumbers: false, drawMetronomeMarks: false, drawingParameters: 'compacttight' });
    const render = () => {
      if (disposed || element.clientWidth < 1) return;
      score.Zoom = element.clientWidth < 420 ? 0.85 : 1.2;
      score.render(); score.cursor.hide(); active.current = -1;
      element.querySelectorAll('svg').forEach(svg => { svg.style.removeProperty('width'); svg.style.removeProperty('height'); });
    };
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (renderer.current === score) render(); }); });
    void score.load(diagnosticMusicXML(question, notation, highlight)).then(() => {
      if (disposed) return;
      renderer.current = score; render(); observer.observe(element);
    }).catch(() => { if (!disposed) setError(true); });
    return () => { disposed = true; observer.disconnect(); cancelAnimationFrame(frame); renderer.current = null; element.replaceChildren(); };
  }, [question, notation, highlight]);
  return <div className="diagnostic-score" aria-label={`${question.handScope} hand sheet music`}>
    <div ref={host} className="diagnostic-score__host" />
    {error && <p role="alert">The sheet music could not load. Please refresh before playing.</p>}
  </div>;
});
