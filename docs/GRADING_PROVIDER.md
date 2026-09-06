# Grading provider boundary

Exercise capture ends at `gradeTake()` in `src/grading/gradingProvider.ts`.
The current `localGradingProvider` preserves EarTrain's existing grader.

Live polyphony is isolated from playback: `chord-capture-processor.js` copies
512-sample blocks through a bounded MessagePort queue to
`chord-analysis-worker.js`, which hosts the spectral engine in
`chord-processor.js`. Audio-clock timestamps survive worker delivery delays.
`findCompletePolyphonicGroup()` in `useDrillAudio.ts` consumes acoustic arrivals
once, after the complete written stack is present. It does not use callback
latency as a reason to discard a chord. Single-note detection and post-take
grading remain separate. Run `audit:audio`, `audit:score`, and the development
`chord-runtime-audit.html` browser test when replacing this transport.

The PCM chooser permits simultaneous written pitches in either acoustic
confirmation order. Sustain analysis ends at the next strike of the **same
pitch**, not the next attack from the other hand; polyphonic sustain uses a
narrow fundamental envelope. Detector `reattack` messages are not key-up
evidence. PCM-verified extra chord tones affect Cleanliness without removing
correct chord tones. Timing has a small per-attack ceiling for clearly
off-beat events so averaging cannot turn a missed first beat into full credit.

Student reports can require acknowledgement of missing notes or an evidenced
octave displacement. `reportNoticeFor` is presentation-only: it never changes
scores, and missing audio alone is not described as an octave mistake. The
live pitch ticker is hidden because it is provisional; telemetry is retained.

To integrate reading.oclef.com, install a provider during trusted application
bootstrap. A remote provider should POST the `GradingRequest` to an EarTrain
server route, where the partner API key is stored as a server-only environment
variable. It must return the existing `GradeResult` contract so reports,
telemetry, adaptive progression, and retries do not need partner-specific code.

Do not put the API key, model URL, or signed partner credentials in Vite
environment variables: `VITE_*` values are public browser code. Launch identity
and attempt syncing remain separate in `src/integration/oclefBridge.ts`.
