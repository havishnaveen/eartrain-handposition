import type { StaffVisualGuide as StaffVisualGuideConfig } from "./registry";

export default function StaffVisualGuide({ guide }: { guide: StaffVisualGuideConfig }) {
  const { clef, highlight, label, compareLedger } = guide;

  // Staff Line Y Coordinates (20px line spacing)
  const yL5 = 30;
  const yL4 = 50;
  const yL3 = 70;
  const yL2 = 90;
  const yL1 = 110;
  const yLedger = 130;
  const yAbove = 10;

  const staffLeft = 52;
  const staffRight = 265;
  const labelX = 274;
  const badgeX = 348;

  return (
    <div className="diagnostic-staff-visual" role="img" aria-label={`Staff guide highlighting ${label ?? highlight}`}>
      <svg
        viewBox="0 0 520 156"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="diagnostic-staff-visual__svg"
      >
        {/* Background card */}
        <rect x="2" y="2" width="516" height="152" rx="14" fill="#ffffff" stroke="#eeebf4" strokeWidth="1.5" />

        {/* Space 3 Highlight Band */}
        {(highlight === "space-3" || compareLedger) && (
          <g className="diagnostic-guide-highlight-space">
            <rect
              x={staffLeft}
              y={yL4}
              width={staffRight - staffLeft}
              height={yL3 - yL4}
              rx="4"
              fill="rgba(239, 106, 71, 0.16)"
              stroke="#ef6a47"
              strokeWidth="1.5"
              strokeDasharray="4 2"
            />
            {/* Note in Space 3 */}
            <ellipse
              cx={compareLedger ? 210 : 160}
              cy={(yL4 + yL3) / 2}
              rx="9"
              ry="7"
              transform={`rotate(-18 ${compareLedger ? 210 : 160} ${(yL4 + yL3) / 2})`}
              fill="#ef6a47"
            />
            <line
              x1={compareLedger ? 218 : 168}
              y1={(yL4 + yL3) / 2}
              x2={compareLedger ? 218 : 168}
              y2={(yL4 + yL3) / 2 - 28}
              stroke="#ef6a47"
              strokeWidth="2"
              strokeLinecap="round"
            />
            {/* Callout Badge for Space 3 */}
            <g transform={`translate(${badgeX}, 47)`}>
              <rect x="0" y="0" width="158" height="26" rx="7" fill="#ffedd5" stroke="#f97316" strokeWidth="1.5" />
              <text x="79" y="17" textAnchor="middle" fill="#c2410c" fontSize="11.5" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif">
                👈 3rd Space (High C)
              </text>
            </g>
          </g>
        )}

        {/* Ledger Line Below Highlight Band */}
        {(highlight === "ledger-below" || compareLedger) && (
          <g className="diagnostic-guide-highlight-ledger">
            <rect
              x={compareLedger ? 90 : staffLeft + 40}
              y={yLedger - 10}
              width={compareLedger ? 65 : staffRight - staffLeft - 80}
              height="20"
              rx="4"
              fill="rgba(239, 106, 71, 0.16)"
              stroke="#ef6a47"
              strokeWidth="1.5"
              strokeDasharray="4 2"
            />
            <line
              x1={compareLedger ? 100 : 140}
              y1={yLedger}
              x2={compareLedger ? 140 : 180}
              y2={yLedger}
              stroke="#ef6a47"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <ellipse
              cx={compareLedger ? 120 : 160}
              cy={yLedger}
              rx="9"
              ry="7"
              transform={`rotate(-18 ${compareLedger ? 120 : 160} ${yLedger})`}
              fill="#ef6a47"
            />
            <line
              x1={compareLedger ? 128 : 168}
              y1={yLedger}
              x2={compareLedger ? 128 : 168}
              y2={yLedger - 28}
              stroke="#ef6a47"
              strokeWidth="2"
              strokeLinecap="round"
            />
            {!compareLedger && (
              <g transform={`translate(${badgeX}, 117)`}>
                <rect x="0" y="0" width="158" height="26" rx="7" fill="#ffedd5" stroke="#f97316" strokeWidth="1.5" />
                <text x="79" y="17" textAnchor="middle" fill="#c2410c" fontSize="11" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif">
                  👈 Ledger Line (Middle C)
                </text>
              </g>
            )}
            {compareLedger && (
              <g transform="translate(68, 138)">
                <text x="60" y="11" textAnchor="middle" fill="#c2410c" fontSize="10.5" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif">
                  Middle C (below staff)
                </text>
              </g>
            )}
          </g>
        )}

        {/* Above Line 5 Highlight */}
        {highlight === "above-line-5" && (
          <g className="diagnostic-guide-highlight-above">
            <rect
              x={staffLeft}
              y={yAbove}
              width={staffRight - staffLeft}
              height="18"
              rx="4"
              fill="rgba(239, 106, 71, 0.16)"
              stroke="#ef6a47"
              strokeWidth="1.5"
              strokeDasharray="4 2"
            />
            <ellipse cx="160" cy={yAbove + 9} rx="9" ry="7" transform="rotate(-18 160 19)" fill="#ef6a47" />
            <line x1="152" y1={yAbove + 9} x2="152" y2={yAbove + 37} stroke="#ef6a47" strokeWidth="2" strokeLinecap="round" />
            <g transform={`translate(${badgeX}, 7)`}>
              <rect x="0" y="0" width="158" height="26" rx="7" fill="#ffedd5" stroke="#f97316" strokeWidth="1.5" />
              <text x="79" y="17" textAnchor="middle" fill="#c2410c" fontSize="11.5" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif">
                👈 Above Line 5 (High G)
              </text>
            </g>
          </g>
        )}

        {/* Line 4 Highlight */}
        {highlight === "line-4" && (
          <g className="diagnostic-guide-highlight-line4">
            <line x1={staffLeft} y1={yL4} x2={staffRight} y2={yL4} stroke="#ef6a47" strokeWidth="3.5" />
            <g transform={`translate(${badgeX}, 37)`}>
              <rect x="0" y="0" width="158" height="26" rx="7" fill="#ffedd5" stroke="#f97316" strokeWidth="1.5" />
              <text x="79" y="17" textAnchor="middle" fill="#c2410c" fontSize="11.5" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif">
                👈 Line 4 (F Line)
              </text>
            </g>
          </g>
        )}

        {/* Line 2 Highlight */}
        {highlight === "line-2" && (
          <g className="diagnostic-guide-highlight-line2">
            <line x1={staffLeft} y1={yL2} x2={staffRight} y2={yL2} stroke="#ef6a47" strokeWidth="3.5" />
            <g transform={`translate(${badgeX}, 77)`}>
              <rect x="0" y="0" width="158" height="26" rx="7" fill="#ffedd5" stroke="#f97316" strokeWidth="1.5" />
              <text x="79" y="17" textAnchor="middle" fill="#c2410c" fontSize="11.5" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif">
                👈 Line 2 (G Line)
              </text>
            </g>
          </g>
        )}

        {/* 5 Staff Lines */}
        <line x1={staffLeft} y1={yL5} x2={staffRight} y2={yL5} stroke="#334155" strokeWidth="1.5" />
        <line x1={staffLeft} y1={yL4} x2={staffRight} y2={yL4} stroke={highlight === "line-4" ? "#ef6a47" : "#334155"} strokeWidth={highlight === "line-4" ? "3" : "1.5"} />
        <line x1={staffLeft} y1={yL3} x2={staffRight} y2={yL3} stroke="#334155" strokeWidth="1.5" />
        <line x1={staffLeft} y1={yL2} x2={staffRight} y2={yL2} stroke={highlight === "line-2" ? "#ef6a47" : "#334155"} strokeWidth={highlight === "line-2" ? "3" : "1.5"} />
        <line x1={staffLeft} y1={yL1} x2={staffRight} y2={yL1} stroke="#334155" strokeWidth="1.5" />

        {/* Clef Glyphs */}
        {clef === "treble" ? (
          <text x="14" y="96" fontSize="56" fill="#1e293b" fontFamily="Bravura, Academico, serif" style={{ userSelect: "none" }}>
            𝄞
          </text>
        ) : (
          <text x="16" y="76" fontSize="46" fill="#1e293b" fontFamily="Bravura, Academico, serif" style={{ userSelect: "none" }}>
            𝄢
          </text>
        )}

        {/* Line & Space Counting Labels (Neatly placed next to staff) */}
        {!compareLedger && (
          <g className="diagnostic-guide-counting-labels" fontFamily="system-ui, -apple-system, sans-serif">
            {/* Lines 1 to 5 from bottom up */}
            <text x={labelX} y={yL5 + 3.5} fill="#64748b" fontSize="10" fontWeight="600">Line 5</text>
            <text x={labelX} y={(yL5 + yL4) / 2 + 3.5} fill="#94a3b8" fontSize="9.5" fontWeight="500">Space 4</text>
            <text x={labelX} y={yL4 + 3.5} fill="#64748b" fontSize="10" fontWeight="600">Line 4</text>
            <text x={labelX} y={(yL4 + yL3) / 2 + 3.5} fill={highlight === "space-3" ? "#c2410c" : "#94a3b8"} fontSize={highlight === "space-3" ? "10.5" : "9.5"} fontWeight={highlight === "space-3" ? "800" : "500"}>Space 3</text>
            <text x={labelX} y={yL3 + 3.5} fill="#64748b" fontSize="10" fontWeight="600">Line 3</text>
            <text x={labelX} y={(yL3 + yL2) / 2 + 3.5} fill="#94a3b8" fontSize="9.5" fontWeight="500">Space 2</text>
            <text x={labelX} y={yL2 + 3.5} fill="#64748b" fontSize="10" fontWeight="600">Line 2</text>
            <text x={labelX} y={(yL2 + yL1) / 2 + 3.5} fill="#94a3b8" fontSize="9.5" fontWeight="500">Space 1</text>
            <text x={labelX} y={yL1 + 3.5} fill="#64748b" fontSize="10" fontWeight="600">Line 1</text>
          </g>
        )}
      </svg>
    </div>
  );
}
