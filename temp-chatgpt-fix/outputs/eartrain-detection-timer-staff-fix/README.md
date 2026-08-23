# EarTrain detection, report timer, and staff-edge update

Copy these complete files into the matching project paths.

## Pitch recognition

- `MAX_PITCH_SPREAD_SEMITONES`: `0.4` → `0.8`
- `MIN_PITCH_CONSENSUS`: `0.68` → `0.50`
- `MIN_REPORTED_CLARITY`: `0.42` → `0.25`
- The matching defense-in-depth checks in `useDrillAudio.ts` now use clarity
  `0.25` and consensus `0.50`; otherwise they would silently reject notes
  accepted by the worklet.
- The adaptive amplitude gate and four-frame stability requirement remain in
  place, so this loosens borderline pitch estimates without removing the
  room-noise protection.

## Report timer

- Auto-advance calls `onNext()` after exactly 5,000 ms.
- A visible countdown updates during those five seconds.
- `Stay Here` cancels both the timeout and countdown updates permanently for
  the current report.
- Manual `Next Drill` remains available after parking the report.
- The timer uses an asymmetric ticket-style panel and countdown dial rather
  than copying the referenced site's layout.

## Staff clipping

- Dense music is no longer squeezed into a hard 660 px maximum stave width.
- The final note receives a dedicated 44-unit right-side engraving gutter.
- The SVG viewBox retains the complete designed horizontal canvas and unions
  it with measured overflow.
- Horizontal bounds padding increased to 42 units; vertical padding is 28.

## Validation

- Audio worklet JavaScript syntax check passed.
- TypeScript and Vite production build passed.
- `Stay Here` remained on the report after waiting 5.3 seconds.
- An untouched report advanced after the five-second timeout.
- A dense 12-note staff visually retained its final note, fingering, and end
  barline inside the SVG.
