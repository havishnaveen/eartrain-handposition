import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as OSMDModule from 'opensheetmusicdisplay';
import type { Question } from '../curriculum/types';
import type { StaffCueHandle } from '../components/StaffCue';
import type { DiagnosticNotation } from './registry';
import { diagnosticMusicXML } from './notation';

interface Renderer { load(xml: string): Promise<void>; render(): void; Zoom: number; cursor: { reset(): void; next(): void; show(): void; hide(): void } }
const OSMD = (OSMDModule as unknown as { OpenSheetMusicDisplay: new (host: HTMLElement, options: Record<string, unknown>) => Renderer }).OpenSheetMusicDisplay;
export const DiagnosticScore = forwardRef<StaffCueHandle, {
  question: Question;
  notation: DiagnosticNotation;
  highlight?: boolean;
  enlarged?: boolean;
  highlightClef?: boolean;
}>(function DiagnosticScore({ question, notation, highlight = false, enlarged = false, highlightClef = false }, ref) {
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
      const baseZoom = element.clientWidth < 420 ? 1.15 : 1.55;
      score.Zoom = enlarged ? baseZoom * 1.35 : baseZoom;
      score.render(); score.cursor.hide(); active.current = -1;
      element.querySelectorAll('svg').forEach(svg => {
        try {
          const box = svg.getBBox();
          if (box.width > 0 && box.height > 0) {
            const padX = 14;
            const padY = 8;
            svg.setAttribute('viewBox', `${box.x - padX} ${box.y - padY} ${box.width + padX * 2} ${box.height + padY * 2}`);
            svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
          }
          if (highlightClef) {
            const clefEl = svg.querySelector('.vf-clef');
            if (clefEl) {
              const cb = (clefEl as SVGGraphicsElement).getBBox();
              const halo = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
              halo.setAttribute('x', String(cb.x - 5));
              halo.setAttribute('y', String(cb.y - 5));
              halo.setAttribute('width', String(cb.width + 10));
              halo.setAttribute('height', String(cb.height + 10));
              halo.setAttribute('rx', '7');
              halo.setAttribute('fill', 'rgba(239, 68, 68, 0.16)');
              halo.setAttribute('stroke', '#ef4444');
              halo.setAttribute('stroke-width', '2.5');
              halo.setAttribute('class', 'diagnostic-clef-halo');
              clefEl.parentElement?.insertBefore(halo, clefEl);
            }
          }
        } catch {
          // getBBox fallback for non-DOM environments
        }
        svg.style.removeProperty('width');
        svg.style.removeProperty('height');
      });
    };
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (renderer.current === score) render(); }); });
    void score.load(diagnosticMusicXML(question, notation, highlight)).then(() => {
      if (disposed) return;
      renderer.current = score; render(); observer.observe(element);
    }).catch(() => { if (!disposed) setError(true); });
    return () => { disposed = true; observer.disconnect(); cancelAnimationFrame(frame); renderer.current = null; element.replaceChildren(); };
  }, [question, notation, highlight, enlarged, highlightClef]);
  return <div className={`diagnostic-score${enlarged ? ' diagnostic-score--enlarged' : ''}${highlightClef ? ' diagnostic-score--clef-highlight' : ''}`} aria-label={`${question.handScope} hand sheet music`}>
    <div ref={host} className="diagnostic-score__host" />
    {error && <p role="alert">The sheet music could not load. Please refresh before playing.</p>}
  </div>;
});
