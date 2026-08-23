import React from 'react';
import ReactDOM from 'react-dom/client';
import StaffCue from '../components/StaffCue';
import { PROGRESSIVE_CONCEPTS } from '../curriculum/progressiveCurriculum';
import { makeRandom } from '../curriculum/positions';
import '../index.css';

const SEED = 20260802;

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  padding: 24,
  background: '#f7f4ef',
  color: '#171b22',
  fontFamily: 'Inter, system-ui, sans-serif',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
  gap: 18,
};

const cardStyle: React.CSSProperties = {
  overflow: 'hidden',
  padding: 16,
  border: '1px solid rgba(42, 34, 27, 0.12)',
  borderRadius: 18,
  background: '#fff',
  boxShadow: '0 8px 24px rgba(56, 39, 25, 0.08)',
};

function CurriculumAuditPage() {
  let ordinal = 0;
  const cases = PROGRESSIVE_CONCEPTS.flatMap((concept) => (
    Array.from({ length: concept.baseQuestionCount }, (_, index) => {
      const questionNumber = index + 1;
      const questionOrdinal = ordinal;
      ordinal += 1;
      const rand = makeRandom(
        SEED + concept.index * 7919 + questionNumber * 131 + questionOrdinal,
      );
      const question = concept.generate(
        questionOrdinal,
        rand,
        index / Math.max(1, concept.baseQuestionCount - 1),
        'normal',
        questionNumber,
      );
      const expectedDots = question.cue.staves.reduce(
        (count, staff) => count + staff.notes.reduce(
          (staffCount, note) =>
            staffCount + (note.duration.replace(/r$/, '').match(/d/g)?.length ?? 0),
          0,
        ),
        0,
      );
      return { concept, question, questionNumber, expectedDots };
    })
  ));

  return (
    <main style={pageStyle}>
      <h1 style={{ margin: '0 0 6px' }}>Curriculum render audit</h1>
      <p style={{ margin: '0 0 22px', opacity: 0.65 }}>
        {cases.length} base drills across {PROGRESSIVE_CONCEPTS.length} lessons
      </p>
      <section style={gridStyle} aria-label="All curriculum drills">
        {cases.map(({ concept, question, questionNumber, expectedDots }) => (
          <article
            key={`${concept.id}-${questionNumber}`}
            data-audit-card="true"
            data-lesson={concept.index}
            data-question={questionNumber}
            data-mode={question.exerciseMode}
            data-expected-dots={expectedDots}
            style={cardStyle}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <strong>Lesson {concept.index} · Drill {questionNumber}</strong>
              <span>{question.exerciseMode}</span>
            </div>
            <div style={{ margin: '4px 0 10px', fontSize: 13, opacity: 0.65 }}>
              {question.positionLabel}
            </div>
            <StaffCue cue={question.cue} />
          </article>
        ))}
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CurriculumAuditPage />
  </React.StrictMode>,
);
