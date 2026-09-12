import type { DiagnosticLesson } from './registry';
import { fiveFingerPattern, isBlackKey } from './registry';

export default function DiagnosticTip({ lesson }: { lesson: DiagnosticLesson }) {
  const kind = lesson.tip.kind;
  return <figure className="diagnostic-tip">
    {kind === 'keyboard' && lesson.key ? <div className="diagnostic-fingers" aria-label="Right-hand finger map">
      {fiveFingerPattern(lesson.key).map((pitch, i) => <div key={pitch} className={isBlackKey(pitch) ? 'is-black' : 'is-white'}><b>{i + 1}</b><span>{pitch.replace(/\d/g, '')}</span><small>{isBlackKey(pitch) ? 'Black key' : 'White key'}</small></div>)}
    </div> : kind === 'clef' ? <svg viewBox="0 0 320 100" role="img" aria-label="Bass clef dots surround the F line, second from the top">
      {[20, 35, 50, 65, 80].map(y => <line key={y} x1="20" x2="300" y1={y} y2={y} stroke={y === 35 ? '#ef6a47' : '#777'} strokeWidth={y === 35 ? 3 : 1} />)}
      <text x="25" y="77" fontSize="68" fill="#242237">𝄢</text><text x="130" y="30" fill="#b54125" fontSize="20">F line</text>
    </svg> : <div className="diagnostic-metaphor" aria-hidden="true">{
      kind === 'octave' ? <><span>C4</span><b>↑ 8va ↑</b><span>C5</span></> :
      kind === 'barline' ? <><span>♯ C … C</span><b>┃</b><span>♮ C</span></> :
      kind === 'clef-change' ? <><span>𝄢</span><b>→</b><span>𝄞</span></> :
      <><span>1 · 2 · 3</span><b>↪</b><span>1 · 2 · 3</span></>
    }</div>}
    <figcaption>{lesson.tip.text}</figcaption>
  </figure>;
}
