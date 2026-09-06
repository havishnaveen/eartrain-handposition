// Reuse the regression-tested polyphonic engine outside the audio-render thread.
self.onmessage = ({ data }) => {
  if (data.type !== 'connect') return;
  const port = data.port;
  self.sampleRate = data.sampleRate;
  self.currentTime = 0;
  let processor;
  let sequence = null;
  self.AudioWorkletProcessor = class {
    constructor() { this.port = { postMessage: (message) => port.postMessage(message) }; }
  };
  self.registerProcessor = (_name, Processor) => { processor = new Processor(); };
  try {
    importScripts(data.engineUrl);
    port.onmessage = ({ data: message }) => {
      if (message.type !== 'pcm') {
        processor.port.onmessage({ data: message });
        return;
      }
      if (sequence !== null && message.sequence !== sequence + 1) {
        processor.ring.fill(0);
        processor.stableFrames.clear();
        processor.missingFrames.clear();
        processor.reportedPresent.clear();
        processor.arrivalTimes.clear();
        processor.energyHistory?.clear();
      }
      sequence = message.sequence;
      self.currentTime = message.time;
      processor.process([[message.samples]]);
      port.postMessage({ type: 'consumed' });
    };
    self.postMessage({ type: 'ready' });
  } catch (error) {
    self.postMessage({ type: 'error', message: String(error) });
  }
};
