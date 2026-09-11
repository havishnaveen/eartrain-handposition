import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
const browser=await puppeteer.launch({headless:true});
try {
  const page=await browser.newPage();
  for(const width of [320,768,1024,1440]) {
    await page.setViewport({width,height:1000});
    await page.goto('http://127.0.0.1:5187/visual-audit.html?lesson=1&slot=2&frame=normal-prompt');
    await page.waitForSelector('.et-staff svg');
    await page.evaluate(async()=>{
      const {default:React}=await import('/node_modules/.vite/deps/react.js');
      const {default:{createRoot}}=await import('/node_modules/.vite/deps/react-dom_client.js');
      const {StaffCue}=await import('/src/components/StaffCue.tsx');
      window.cursorRef=React.createRef();
      const host=document.createElement('div'); host.id='cursor-test';
      host.style.cssText='width:100%;height:320px;'; document.body.replaceChildren(host);
      createRoot(host).render(React.createElement(StaffCue,{ref:window.cursorRef,cue:{timeSignature:'4/4',staves:[{clef:'treble',hand:'right',notes:[
        {keys:['c/4'],duration:'qd'}, {keys:['d/4'],duration:'8'}, {keys:['e/4'],duration:'q'}, {keys:['f/4'],duration:'q'},
        {keys:['g/4'],duration:'h'}, {keys:['e/4'],duration:'q'}, {keys:['c/4'],duration:'q'},
      ]}]}}));
    });
    await page.waitForSelector('#cursor-test .et-scrub__line');
    const errors=await page.evaluate(()=>[0,1.5,2,3,4,6,7].map((beat,index)=>{
      window.cursorRef.current.seekToBeat(beat);
      const line=document.querySelector('.et-scrub__line').getBoundingClientRect();
      const head=document.querySelectorAll('.vf-notehead > path')[index].getBoundingClientRect();
      return Math.abs(line.x-(head.x+head.width/2));
    }));
    assert.ok(errors.every(error=>error<1),`${width}px cursor errors: ${errors}`);
    console.log(`${width}px: cursor aligns to all 7 dotted/quarter/half-note onsets`);
  }
} finally {await browser.close();}
