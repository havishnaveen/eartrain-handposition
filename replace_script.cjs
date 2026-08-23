const fs = require('fs');

const generated = fs.readFileSync('generated_melody.ts', 'utf8');
const targetFile = 'src/components/exercises/hand_positions/MasterNavigatorExercise.tsx';
let targetContent = fs.readFileSync(targetFile, 'utf8');

// Find the start and end of FULL_MELODY
const startIdx = targetContent.indexOf('const FULL_MELODY: StaffNote[] = [');
if (startIdx === -1) {
  console.log("Could not find FULL_MELODY");
  process.exit(1);
}

const endIdx = targetContent.indexOf('];\n\nconst SEGMENTS', startIdx);
if (endIdx === -1) {
  console.log("Could not find end of FULL_MELODY");
  process.exit(1);
}

const newMelodyStr = generated.replace('export const FULL_MELODY = [\n', 'const FULL_MELODY: any[] = [\n');

const newTargetContent = targetContent.substring(0, startIdx) + newMelodyStr + targetContent.substring(endIdx + 3);

fs.writeFileSync(targetFile, newTargetContent);
console.log('Replaced successfully!');
