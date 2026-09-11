import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bug, Check, Loader2, Send, X } from 'lucide-react';

interface BugReportButtonProps {
  lessonNumber: number;
  lessonTitle: string;
  questionNumber: number;
}

type SendStatus = 'idle' | 'sending' | 'sent' | 'error';

export default function BugReportButton({
  lessonNumber,
  lessonTitle,
  questionNumber,
}: BugReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<SendStatus>('idle');
  const [copiedFallback, setCopiedFallback] = useState(false);
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

  // Reset back to a fresh form each time the dialog is reopened, so a
  // previous send's success/error state doesn't linger on the next report.
  useEffect(() => {
    if (open) {
      setStatus('idle');
      setCopiedFallback(false);
    }
  }, [open]);

  const sendReport = async () => {
    setStatus('sending');
    try {
      const response = await fetch('/api/report-problem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim(), diagnostic }),
      });
      if (!response.ok) {
        throw new Error(`Report send failed (${response.status})`);
      }
      setStatus('sent');
      window.setTimeout(() => setOpen(false), 1400);
    } catch {
      setStatus('error');
      // The send failed (offline, server misconfigured, etc.) — fall back to
      // clipboard so the report isn't lost, same as the old copy-only flow.
      const report = `${description.trim() || 'No description supplied.'}\n\n${diagnostic}`;
      try {
        await navigator.clipboard.writeText(report);
        setCopiedFallback(true);
      } catch {
        descriptionRef.current?.select();
      }
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

            {status === 'error' ? (
              <p role="alert" className="mt-3 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  Couldn't send that report{copiedFallback ? ' — copied it to your clipboard instead, so you can paste and send it another way.' : '. Please try again.'}
                </span>
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
              <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-full px-5 text-sm font-bold text-stone-600 hover:bg-stone-100">Cancel</button>
              <button
                type="button"
                onClick={sendReport}
                disabled={status === 'sending' || status === 'sent'}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-orange-600 px-5 text-sm font-extrabold text-white shadow-md shadow-orange-200 transition hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200 disabled:cursor-not-allowed disabled:opacity-80"
              >
                {status === 'sending' ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : null}
                {status === 'sent' ? <Check size={17} aria-hidden="true" /> : null}
                {status === 'idle' || status === 'error' ? <Send size={17} aria-hidden="true" /> : null}
                {status === 'sending' ? 'Sending…' : status === 'sent' ? 'Report sent' : status === 'error' ? 'Try again' : 'Send report'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
