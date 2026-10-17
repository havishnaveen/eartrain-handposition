import { alignPitchSequences, pitchToMidi } from '../audio/timing';
import type { DetectedNote, GradeResult } from '../audio/timing';
import { isClefTranspositionMistake, transposeToOppositeClef } from '../diagnostics/AcousticDrill';
import type { OclefEarDiagnosis } from '../integration/oclefBridge';
import type { StationQuestion } from './types';

function reconstructPlayedNotes(
  report: GradeResult,
  detected?: readonly Pick<DetectedNote, 'midi'>[],
): Array<Pick<DetectedNote, 'midi'>> {
  if (detected && detected.length > 0) {
    return detected.map((d) => ({ midi: d.midi }));
  }
  const fromNames = (report.playedNames ?? [])
    .map(pitchToMidi)
    .filter((m): m is number => m !== null)
    .map((midi) => ({ midi }));
  if (fromNames.length > 0) return fromNames;
  return (report.extras ?? []).map((e) => ({ midi: e.midi }));
}

function countMidiOccurrences(notes: readonly Pick<DetectedNote, 'midi'>[], targetMidi: number): number {
  let count = 0;
  for (const n of notes) {
    if (n.midi === targetMidi) count++;
  }
  return count;
}

/**
 * Triggers a follow-up question ONLY when the student makes the specific mistake
 * that the mini-lesson is designed to counter (reconciling local pitch/timing
 * analysis with Oclef's sound recognition diagnosis). If the student plays in
 * the right clef/register/key-signature/etc. and simply misses a few unrelated
 * notes, returns null so no unnecessary follow-up question is shown.
 */
export function playingFollowUp(
  q: StationQuestion,
  report: GradeResult,
  detected?: readonly Pick<DetectedNote, 'midi'>[],
  oclefDiagnosis?: OclefEarDiagnosis | null,
) {
  const seq = q.question.expectedSequence;
  if (!seq.length) return null;

  const playedNotes = reconstructPlayedNotes(report, detected);
  const expectedMidis = seq.map(pitchToMidi).filter((m): m is number => m !== null);
  const matchedSet = new Set(
    alignPitchSequences(expectedMidis, playedNotes, (m) => m).flatMap((op) =>
      op.kind === 'match' ? [op.expectedIndex] : [],
    ),
  );

  if (q.topic === 'clef-transposition') {
    const writtenClef = q.notation.clef ?? 'bass';
    const isWrongClef =
      oclefDiagnosis?.kind === 'clef-confusion' ||
      isClefTranspositionMistake(seq, playedNotes, writtenClef);
    if (!isWrongClef) return null;
    return q.clue;
  }

  if (q.topic === 'octave-displacement') {
    if (oclefDiagnosis?.kind === 'wrong-register') {
      return q.clue;
    }
    if (!playedNotes.length || !expectedMidis.length) return null;
    const exactMatches = alignPitchSequences(expectedMidis, playedNotes, (m) => m)
      .filter((op) => op.kind === 'match').length;
    let bestShiftedMatches = 0;
    for (const shift of [-12, -24, 12, 24]) {
      const shifted = expectedMidis.map((m) => m + shift);
      const matches = alignPitchSequences(shifted, playedNotes, (m) => m)
        .filter((op) => op.kind === 'match').length;
      if (matches > bestShiftedMatches) bestShiftedMatches = matches;
    }
    const isOctaveError =
      bestShiftedMatches >= 2 &&
      bestShiftedMatches / expectedMidis.length >= 0.35 &&
      bestShiftedMatches > exactMatches;
    if (!isOctaveError) return null;
    return q.clue;
  }

  if (q.topic === 'key-signature') {
    let missedSigIndex = -1;
    for (let i = 0; i < seq.length; i++) {
      const pitch = seq[i];
      if (!/[#b]/.test(pitch) || matchedSet.has(i)) continue;
      const naturalPitch = pitch.replace(/[#b]/, '');
      const naturalMidi = pitchToMidi(naturalPitch);
      if (naturalMidi === null) continue;
      const expectedNaturalCount = seq.filter((p) => pitchToMidi(p) === naturalMidi).length;
      const playedNaturalCount = countMidiOccurrences(playedNotes, naturalMidi);
      const inExtras = (report.extras ?? []).some((e) => e.midi === naturalMidi);
      if (playedNaturalCount > expectedNaturalCount || inExtras) {
        missedSigIndex = i;
        break;
      }
    }
    if (missedSigIndex < 0 && oclefDiagnosis?.kind === 'key-signature') {
      missedSigIndex = seq.findIndex((p, i) => /[#b]/.test(p) && !matchedSet.has(i));
      if (missedSigIndex < 0) missedSigIndex = q.targetIndex;
    }
    if (missedSigIndex < 0 || missedSigIndex >= seq.length) return null;
    const pitch = seq[missedSigIndex];
    const name = pitch.replace('#', '♯').replace('b', '♭');
    const letter = pitch[0];
    const flat = pitch.includes('b');
    const note = `Note ${missedSigIndex + 1}`;
    return {
      prompt: `Look at the key signature. What should you play for ${note}?`,
      choices: [name, `${letter}${pitch.slice(-1)} (natural)`],
      correct: 0,
      explanation: `The key signature makes ${letter} ${flat ? 'flat' : 'sharp'}. The sign does not need to appear beside ${note.toLowerCase()}.`,
    };
  }

  if (q.topic === 'accidental-carryover') {
    const openingPitch = seq[0] ?? '';
    const alteredLetter = openingPitch[0];
    const openingMidi = pitchToMidi(openingPitch);
    if (!alteredLetter || openingMidi === null) return null;

    let madeCarryoverMistake = false;
    for (let i = 1; i < seq.length; i++) {
      const pitch = seq[i];
      if (pitch[0] !== alteredLetter || matchedSet.has(i)) continue;
      const isWrittenNatural = !/[#b]/.test(pitch);
      const trapPitch = isWrittenNatural ? openingPitch : `${alteredLetter}${pitch.slice(-1)}`;
      const trapMidi = pitchToMidi(trapPitch);
      if (trapMidi === null) continue;
      const expectedTrapCount = seq.filter((p) => pitchToMidi(p) === trapMidi).length;
      const playedTrapCount = countMidiOccurrences(playedNotes, trapMidi);
      const inExtras = (report.extras ?? []).some((e) => e.midi === trapMidi);
      if (playedTrapCount > expectedTrapCount || inExtras) {
        madeCarryoverMistake = true;
        break;
      }
    }
    if (!madeCarryoverMistake) return null;
    return q.clue;
  }

  if (q.topic === 'mid-line-clef-change') {
    if (oclefDiagnosis?.kind === 'clef-confusion') return q.clue;
    const changeStaffIndex = q.notation.clefChange?.index ?? Math.floor(seq.length / 4);
    const preChangeLowerIndices: number[] = [];
    const postChangeLowerIndices: number[] = [];
    for (let staffNoteIdx = 0; staffNoteIdx * 2 + 1 < seq.length; staffNoteIdx++) {
      const seqIdx = staffNoteIdx * 2 + 1;
      if (staffNoteIdx < changeStaffIndex) preChangeLowerIndices.push(seqIdx);
      else postChangeLowerIndices.push(seqIdx);
    }
    if (!postChangeLowerIndices.length) return null;

    // Check if the student read the post-change treble notes as bass clef
    const oldBassMidis = postChangeLowerIndices
      .map((idx) => transposeToOppositeClef(seq[idx], 'treble'))
      .filter((p): p is string => p !== null)
      .map(pitchToMidi)
      .filter((m): m is number => m !== null);
    const oldBassMatches = alignPitchSequences(oldBassMidis, playedNotes, (m) => m)
      .filter((op) => op.kind === 'match').length;
    const postChangeMatched = postChangeLowerIndices.filter((idx) => matchedSet.has(idx)).length;
    const preChangeMatched = preChangeLowerIndices.filter((idx) => matchedSet.has(idx)).length;

    const readInOldBass = oldBassMatches >= 2 && oldBassMatches > postChangeMatched;
    const droppedAfterClefChange =
      preChangeMatched >= Math.ceil(preChangeLowerIndices.length * 0.5) &&
      postChangeMatched <= Math.floor(postChangeLowerIndices.length * 0.25);

    if (!readInOldBass && !droppedAfterClefChange) return null;
    return q.clue;
  }

  if (q.topic === 'hand-position') {
    if (oclefDiagnosis?.kind === 'wrong-start') return q.clue;
    if (!playedNotes.length) return null;

    const missedStart = !matchedSet.has(0) && playedNotes[0]?.midi !== expectedMidis[0];
    const targetIdx = q.targetIndex;
    const targetMidi = expectedMidis[targetIdx];
    const missedTargetWithNeighbor =
      !matchedSet.has(targetIdx) &&
      targetMidi !== undefined &&
      playedNotes.some((n) => n.midi !== targetMidi && Math.abs(n.midi - targetMidi) <= 2);

    const exactMatches = alignPitchSequences(expectedMidis, playedNotes, (m) => m)
      .filter((op) => op.kind === 'match').length;
    let shiftedPosition = false;
    for (const shift of [-4, -3, -2, -1, 1, 2, 3, 4]) {
      const shiftedMatches = alignPitchSequences(
        expectedMidis.map((m) => m + shift),
        playedNotes,
        (m) => m,
      ).filter((op) => op.kind === 'match').length;
      if (shiftedMatches >= Math.ceil(expectedMidis.length * 0.4) && shiftedMatches > exactMatches) {
        shiftedPosition = true;
        break;
      }
    }

    if (!missedStart && !missedTargetWithNeighbor && !shiftedPosition) return null;
    return q.clue;
  }

  if (q.topic === 'cross-over-under') {
    const crossingIdx = q.targetIndex;
    const missedAtCrossing =
      !matchedSet.has(crossingIdx) ||
      (crossingIdx > 0 && !matchedSet.has(crossingIdx - 1));
    const hesitatedOnCrossing =
      report.missed === 0 &&
      ((report.scores.rhythm ?? report.scores.timing ?? 5) < 3 ||
        (report.scores.continuity ?? 5) < 4.4);
    if (!missedAtCrossing && !hesitatedOnCrossing) return null;
    return q.clue;
  }

  return null;
}

