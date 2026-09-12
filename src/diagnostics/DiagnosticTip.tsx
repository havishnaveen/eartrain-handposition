import type { DiagnosticLesson } from './registry';
import { fiveFingerPattern, isBlackKey } from './registry';

export default function DiagnosticTip({ lesson }: { lesson: DiagnosticLesson }) {
  const kind = lesson.tip.kind;
  if (kind === 'clef' || !lesson.tip.text) return null;
  return <figure className="diagnostic-tip">
    {kind === 'keyboard' && lesson.key ? <div className="diagnostic-fingers" aria-label="Right-hand finger map">
      {fiveFingerPattern(lesson.key).map((pitch, i) => <div key={pitch} className={isBlackKey(pitch) ? 'is-black' : 'is-white'}><b>{i + 1}</b><span>{pitch.replace(/\d/g, '')}</span><small>{isBlackKey(pitch) ? 'Black key' : 'White key'}</small></div>)}
    </div> : <div className="diagnostic-metaphor" aria-hidden="true">{
      kind === 'octave' ? <><span>C4</span><b>↑ 8va ↑</b><span>C5</span></> :
      kind === 'barline' ? <><span>♯ C … C</span><b>┃</b><span>♮ C</span></> :
      kind === 'clef-change' ? <><span>𝄢</span><b>→</b><span>𝄞</span></> :
      <><span>1 · 2 · 3</span><b>↪</b><span>1 · 2 · 3</span></>
    }</div>}
    <figcaption>{lesson.tip.text}</figcaption>
  </figure>;
}
