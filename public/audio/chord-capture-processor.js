// Audio-thread work is limited to copying PCM. Polyphonic DSP runs in a Worker.
class ChordCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(512);
    this.offset = 0;
    this.pending = 0;
    this.sequence = 0;
    this.enabled = false;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'connect') {
        this.analysisPort = data.port;
        this.analysisPort.onmessage = ({ data: result }) => {
          if (result.type === 'consumed') this.pending = Math.max(0, this.pending - 1);
          else this.port.postMessage(result);
        };
      } else if (this.analysisPort) {
        this.enabled = data.type !== 'idle';
        this.offset = 0;
        this.analysisPort.postMessage(data);
      }
    };
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input || !this.enabled || !this.analysisPort) return true;
    for (let i = 0; i < input.length; i++) {
      this.buffer[this.offset++] = input[i];
      if (this.offset !== this.buffer.length) continue;
      this.sequence++;
      // Bound the queue if the device is temporarily overloaded. A sequence
      // gap makes the worker discard spectral history, never join missing PCM.
      if (this.pending < 8) {
        this.analysisPort.postMessage({ type: 'pcm', samples: this.buffer,
          sequence: this.sequence, time: currentTime + (i + 1 - input.length) / sampleRate }, [this.buffer.buffer]);
        this.buffer = new Float32Array(512);
        this.pending++;
      }
      this.offset = 0;
    }
    return true;
  }
}
registerProcessor('chord-capture-processor', ChordCaptureProcessor);
