import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({headless:true, args:['--autoplay-policy=no-user-gesture-required']});
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5187/');
  await page.evaluate(async () => {
    const {default:React} = await import('/node_modules/.vite/deps/react.js');
    const {default:{createRoot}} = await import('/node_modules/.vite/deps/react-dom_client.js');
    const {useDrillAudio} = await import('/src/audio/useDrillAudio.ts');
    const {PROGRESSIVE_CONCEPTS} = await import('/src/curriculum/progressiveCurriculum.ts');
    const {planForQuestion, gradeSequence} = await import('/src/audio/timing.ts');
    const input = new AudioContext(); await input.resume();
    const destination = input.createMediaStreamDestination();
    navigator.mediaDevices.getUserMedia = async () => destination.stream;
    const questions = PROGRESSIVE_CONCEPTS.slice(0,3).flatMap(lesson =>
      [1,2,3,4].map(slot=>lesson.generate(slot,()=>.5,.5,'normal',slot))).slice(0,10);
    const buffers = new Map();
    await Promise.all([...new Set(questions.flatMap(q=>q.expectedSequence))].map(async pitch=>{
      buffers.set(pitch,await input.decodeAudioData(await (await fetch(`https://gleitz.github.io/midi-js-soundfonts/MusyngKite/acoustic_grand_piano-mp3/${pitch.replace('#','s')}.mp3`)).arrayBuffer()));
    }));
    let question, plan, start;
    window.earlyResults = [];
    function Harness() {
      window.earlyAudio = useDrillAudio({
        onPlayStart: time => {
          start = time;
          const base = input.currentTime;
          for (const note of plan.expectedNotes) {
            const source = input.createBufferSource(); source.buffer = buffers.get(note.pitch);
            const gain = input.createGain(); source.connect(gain); gain.connect(destination);
            const onset = base + note.beat * plan.secondsPerBeat;
            const end = onset + note.beats * plan.secondsPerBeat;
            gain.gain.setValueAtTime(.25,onset);
            gain.gain.setValueAtTime(.25,Math.max(onset,end-.04));
            gain.gain.linearRampToValueAtTime(0,end);
            source.start(onset); source.stop(end+.01);
          }
        },
        onFinish: (notes,diagnostics) => {
          const result = gradeSequence(question.expectedSequence,notes,{plan,playStartTime:start,exerciseMode:question.exerciseMode});
          window.earlyResults.push({id:question.id,scores:result.scores,matched:result.matched,expected:result.expectedCount,diagnostics});
        },
      });
      return null;
    }
    const host = document.body.appendChild(document.createElement('div'));
    createRoot(host).render(React.createElement(Harness));
    window.startEarly = async index => {
      question=questions[index]; plan=planForQuestion(question,90);
      return window.earlyAudio.begin(plan);
    };
  });
  await page.waitForFunction(()=>Boolean(window.earlyAudio));
  for(let i=0;i<10;i++) {
    assert.equal(await page.evaluate(i=>window.startEarly(i),i),true);
    await page.waitForFunction(i=>window.earlyResults.length>i,{timeout:45000},i);
    console.log(JSON.stringify(await page.evaluate(()=>window.earlyResults.at(-1))));
  }
  const results=await page.evaluate(()=>window.earlyResults);
  assert.ok(results.every(r=>r.scores.pitch>=4.5 && r.scores.timing>=4 && r.scores.cleanliness>=4),'Clean opening exercises must not receive low scores');
} finally {await browser.close();}
