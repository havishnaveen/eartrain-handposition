# Bass Prove It and Blind Memory fix (v13)

## Root causes

- The live Prove It path used the same open-world thresholds as ordinary
  grading. A soft bass hammer could create usable, exact pitch evidence but
  be discarded before the sequential proof state machine saw it.
- The offline score analyzer sampled negative FFT-bin indices while estimating
  the noise floor of C3–F3 fundamentals. JavaScript returned `undefined`, the
  salience math became `NaN`, and a correct left-hand Blind Memory phrase
  could be reduced to zero accepted notes.
- A 2048-point spectrum cannot safely distinguish adjacent bass semitones by
  FFT-bin contrast alone.

## Changes

- Prove It now tells the worklet the one exact MIDI key currently requested.
  A quieter physical attack is preserved only for that watched-key context,
  then must pass an independent exact-pitch, multi-frame stability check.
  Wrong keys are never relabeled as the requested key.
- The watched pitch advances C/E/G (or the applicable position tones) with
  the UI state machine and is cleared on completion or abort.
- The score analyzer now bounds every spectral-floor index.
- Bass score slots use a score-windowed onset search followed by a narrow,
  independent time-domain period confirmation. This restores quiet bass
  recall without turning nearby keys, clicks, speech, or ringing tails into
  the written answer.
- Worker/worklet URLs use a v13 cache key so a deployment cannot silently keep
  the prior audio code.

## Regression coverage

- quiet C3–E3–G3 live detection;
- extremely soft watched C3 recovery;
- watched C3 rejecting a played D3;
- full quiet left-hand Blind Memory phrase recovery;
- expected C3 rejecting a played D3;
- existing speech, click, sustain, re-attack, sixteenth-note, PCM, grading,
  curriculum, and state-machine audits.
