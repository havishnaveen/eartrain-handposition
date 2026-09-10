// Installed via page.evaluateOnNewDocument BEFORE any app script runs.
//
// Overrides navigator.mediaDevices.getUserMedia so that when the app's own,
// completely unmodified useDrillAudio.ts calls
// `navigator.mediaDevices.getUserMedia({ audio: ... })` and then
// `ctx.createMediaStreamSource(stream)`, it receives a REAL MediaStream --
// just one produced by a MediaStreamAudioDestinationNode we control, instead
// of a physical microphone. From that point on, every downstream stage
// (AudioWorkletNode pitch-processor.js, lossless PCM capture, the offline
// score-analyzer-worker.js, Basic Pitch ML transcription, gradeSequence) is
// the app's real, unmodified pipeline -- it cannot tell the difference.
(function installEarTrainAudioInjection() {
  const NativeAudioContext = window.AudioContext || window.webkitAudioContext;

  const injection = {
    seq: 0,
    current: null, // { ctx, dest }
  };
  window.__ET_INJECTION__ = injection;

  function freshInjectionContext() {
    const ctx = new NativeAudioContext();
    const dest = ctx.createMediaStreamDestination();
    injection.seq += 1;
    injection.current = { ctx, dest, seq: injection.seq };
    return injection.current;
  }

  const realGetUserMedia = navigator.mediaDevices && navigator.mediaDevices.getUserMedia
    ? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    : null;
  void realGetUserMedia; // intentionally unused -- never falls back to it

  if (!navigator.mediaDevices) {
    // Some headless configurations omit the whole namespace.
    Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true });
  }

  navigator.mediaDevices.getUserMedia = async function overriddenGetUserMedia() {
    const slot = freshInjectionContext();
    if (slot.ctx.state === 'suspended') {
      try { await slot.ctx.resume(); } catch (e) { /* ignore */ }
    }
    return slot.dest.stream;
  };

  // Also stub the legacy prefixed API some detection code may probe for.
  navigator.getUserMedia = function legacyGetUserMedia(constraints, success, error) {
    navigator.mediaDevices.getUserMedia(constraints).then(success, error);
  };

  function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  // Exposed for the Node-side harness: play a base64-encoded WAV through the
  // CURRENT injection destination (i.e. into the app's real live mic input)
  // starting `delaySeconds` from now. Returns the seq this was scheduled
  // against, so the caller can tell if a remount raced it.
  window.__ETPlayWav = async function playWav(base64Wav, delaySeconds) {
    const slot = injection.current;
    if (!slot) throw new Error('no injection audio context yet -- getUserMedia not called');
    const arrayBuffer = base64ToArrayBuffer(base64Wav);
    const audioBuffer = await slot.ctx.decodeAudioData(arrayBuffer);
    const src = slot.ctx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(slot.dest);
    const startAt = slot.ctx.currentTime + (delaySeconds || 0.05);
    src.start(startAt);
    return { seq: slot.seq, startAt, duration: audioBuffer.duration };
  };

  // Diagnostics: collect console/page errors the harness can pull out later.
  window.__ET_LOGS__ = [];
  const origError = console.error.bind(console);
  console.error = function (...args) {
    try { window.__ET_LOGS__.push({ level: 'error', text: args.map(String).join(' '), t: Date.now() }); } catch (e) {}
    origError(...args);
  };
  const origWarn = console.warn.bind(console);
  console.warn = function (...args) {
    try { window.__ET_LOGS__.push({ level: 'warn', text: args.map(String).join(' '), t: Date.now() }); } catch (e) {}
    origWarn(...args);
  };
  window.addEventListener('error', (e) => {
    try { window.__ET_LOGS__.push({ level: 'pageerror', text: String(e.message || e.error), t: Date.now() }); } catch (err) {}
  });
  window.addEventListener('unhandledrejection', (e) => {
    try { window.__ET_LOGS__.push({ level: 'unhandledrejection', text: String(e.reason), t: Date.now() }); } catch (err) {}
  });
})();
