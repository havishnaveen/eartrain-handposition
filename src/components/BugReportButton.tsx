import { useEffect, useMemo, useRef, useState } from 'react';
import { Bug, Check, Copy, X } from 'lucide-react';

interface BugReportButtonProps {
  lessonNumber: number;
  lessonTitle: string;
  questionNumber: number;
}

export default function BugReportButton({
  lessonNumber,
  lessonTitle,
  questionNumber,
}: BugReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [copied, setCopied] = useState(false);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const diagnostic = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return [
      `EarTrain issue — Lesson ${lessonNumber}: ${lessonTitle}, drill ${questionNumber}`,
      `Page: ${window.location.href}`,
      `Viewport: ${window.innerWidth}×${window.innerHeight}`,
      `Browser: ${window.navigator.userAgent}`,
    ].join('\n');
  }, [lessonNumber, lessonTitle, questionNumber]);

  useEffect(() => {
    if (!open) return;
    descriptionRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  const copyReport = async () => {
    const report = `${description.trim() || 'No description supplied.'}\n\n${diagnostic}`;
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      descriptionRef.current?.select();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 inline-flex min-h-11 items-center gap-2 rounded-full border border-stone-200 bg-white/95 px-4 py-2 text-sm font-bold text-stone-700 shadow-lg backdrop-blur transition hover:-translate-y-0.5 hover:border-orange-300 hover:text-orange-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200"
        aria-label="Report a problem with this exercise"
      >
        <Bug size={17} aria-hidden="true" />
        Report a problem
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/35 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setOpen(false);
        }}>
          <section
            className="w-full max-w-lg rounded-3xl border border-orange-100 bg-white p-6 text-left shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="et-bug-title"
          >
            <header className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-widest text-orange-600">Quick report</p>
                <h2 id="et-bug-title" className="mt-1 text-2xl font-black tracking-tight text-stone-900">What went wrong?</h2>
                <p className="mt-1 text-sm font-medium text-stone-500">The lesson, drill, page, screen size, and browser are attached automatically.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200" aria-label="Close report">
                <X size={20} aria-hidden="true" />
              </button>
            </header>

            <label className="mt-5 block text-sm font-extrabold text-stone-800" htmlFor="et-bug-description">Describe what you saw</label>
            <textarea
              ref={descriptionRef}
              id="et-bug-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={5}
              placeholder="Example: I played the third note late, but Timing still showed 5."
              className="mt-2 w-full resize-y rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-base text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100"
            />

            <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
              <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-full px-5 text-sm font-bold text-stone-600 hover:bg-stone-100">Cancel</button>
              <button type="button" onClick={copyReport} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-orange-600 px-5 text-sm font-extrabold text-white shadow-md shadow-orange-200 transition hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200">
                {copied ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
                {copied ? 'Report copied' : 'Copy report'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
