import type { DiagnosticLesson } from './registry';
import { fiveFingerPattern, isBlackKey } from './registry';
import { StaffChoiceDiagram } from './StaffVisualGuide';

export default function DiagnosticTip({ lesson }: { lesson: DiagnosticLesson }) {
  const kind = lesson.tip.kind;
  if (kind === 'clef' || !lesson.tip.text) return null;
  return (
    <figure className="diagnostic-tip" aria-label="Visual hint">
      {kind === 'keyboard' && lesson.key ? (
        <div className="diagnostic-fingers" aria-label="Right-hand finger map">
          {fiveFingerPattern(lesson.key).map((pitch, i) => (
            <div key={pitch} className={isBlackKey(pitch) ? 'is-black' : 'is-white'}>
              <b>{i + 1}</b>
              <span>{pitch.replace(/\d/g, '')}</span>
              <small>{isBlackKey(pitch) ? 'Black key' : 'White key'}</small>
            </div>
          ))}
        </div>
      ) : kind === 'octave' ? (
        <div className="diagnostic-tip-visuals">
          <div className="diagnostic-tip-item">
            <StaffChoiceDiagram visual={{ clef: 'treble', position: 'ledger-below', highlight: true }} />
            <span className="diagnostic-tip-label">C4 (Middle C)</span>
            <small className="diagnostic-tip-sublabel">Ledger line below</small>
          </div>
          <b className="diagnostic-tip-vs" aria-hidden="true">vs</b>
          <div className="diagnostic-tip-item">
            <StaffChoiceDiagram visual={{ clef: 'treble', position: 'space-3', highlight: true }} />
            <span className="diagnostic-tip-label">C5 (High C)</span>
            <small className="diagnostic-tip-sublabel">3rd space inside staff</small>
          </div>
        </div>
      ) : kind === 'crossing' ? (
        <div className="diagnostic-metaphor" aria-hidden="true">
          <span>1 · 2 · 3</span><b>↪</b><span>1 · 2 · 3</span>
        </div>
      ) : (
        <div className="diagnostic-metaphor" aria-hidden="true">
          {kind === 'barline' ? (
            <><span>♯ C … C</span><b>┃</b><span>♮ C</span></>
          ) : (
            <><span>𝄢</span><b>→</b><span>𝄞</span></>
          )}
        </div>
      )}
      {kind !== 'octave' && <figcaption className="diagnostic-tip__caption">{lesson.tip.text}</figcaption>}
    </figure>
  );
}
