export function SolfegeReferenceChart() {
  const degrees = [
    { name: "Do", numeral: "I" },
    { name: "Re", numeral: "II" },
    { name: "Mi", numeral: "III" },
    { name: "Fa", numeral: "IV" },
    { name: "Sol", numeral: "V" },
    { name: "La", numeral: "VI" },
    { name: "Ti", numeral: "VII" },
    { name: "Do", numeral: "VIII" }
  ];

  return (
    <div className="flex flex-col items-center mb-6 w-full">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Solfege Scale Reference</p>
      <div className="flex gap-2 bg-slate-900/50 p-3 rounded-xl border border-slate-700 overflow-x-auto max-w-full custom-scrollbar">
        {degrees.map((deg, i) => (
          <div key={i} className="flex flex-col items-center px-3 py-2 bg-slate-800 rounded-lg border border-slate-600 min-w-[60px] shadow-sm">
            <span className="font-bold text-orange-300">{deg.name}</span>
            <span className="text-[10px] text-slate-400 mt-1 font-medium">{deg.numeral}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
