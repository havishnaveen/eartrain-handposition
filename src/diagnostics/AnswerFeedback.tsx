/** Same animation and feedback styling as the established side-lesson checks. */
export default function AnswerFeedback({ correct, explanation, answer, onContinue, label = 'Continue', disabled = false }: {
  correct: boolean; explanation: string; answer?: string; onContinue: () => void; label?: string; disabled?: boolean;
}) {
  return <div className={`diagnostic-brief-feedback diagnostic-brief-feedback--${correct ? 'correct' : 'wrong'}`} role="status">
    <div className="diagnostic-morph-box">
      {correct && <svg className="diagnostic-morph-check" viewBox="0 0 52 52" aria-hidden="true">
        <circle className="diagnostic-morph-check__circle" cx="26" cy="26" r="25" />
        <path className="diagnostic-morph-check__path" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
      </svg>}
      <span className={`diagnostic-brief-badge diagnostic-brief-badge--${correct ? 'correct' : 'wrong'}`}>{correct ? 'Correct!' : 'Incorrect'}</span>
      <p className={`diagnostic-brief-text diagnostic-brief-text--${correct ? 'correct' : 'wrong'}`}>
        {!correct && answer && !explanation.includes(answer) && <>Answer: {answer}. </>}{explanation}
      </p>
    </div>
    <button type="button" className="et-start diagnostic-brief-btn" disabled={disabled} onClick={onContinue}>
      <span className="et-start__dot"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="currentColor" /></svg></span>{label}
    </button>
  </div>;
}
