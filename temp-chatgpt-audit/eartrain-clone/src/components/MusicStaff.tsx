import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";

export type StaffNote = { note: string, octave: number, duration?: number, fingering?: number, tiedToNext?: boolean, dotted?: boolean };
export type MusicStaffProps = {
  notes: (StaffNote | { chord: StaffNote[], duration?: number, fingering?: number, dotted?: boolean, tiedToNext?: boolean })[];
  caption?: string;
  cursorIndex?: number | null;
  highlightRange?: [number, number] | null;
  timeSignature?: string;
  keySignature?: string;
  measureLines?: number[];
}

const KEY_SIGNATURES: Record<string, { type: 'sharp'|'flat', dv: number, xIndex: number }[]> = {
  "F Major": [
    { type: 'flat', dv: 6, xIndex: 0 }, 
    { type: 'flat', dv: -8, xIndex: 0 }, 
  ],
  "G Major": [
    { type: 'sharp', dv: 10, xIndex: 0 }, 
    { type: 'sharp', dv: -4, xIndex: 0 }, 
  ],
  "D Major": [
    { type: 'sharp', dv: 10, xIndex: 0 }, 
    { type: 'sharp', dv: -4, xIndex: 0 }, 
    { type: 'sharp', dv: 7, xIndex: 1 }, 
    { type: 'sharp', dv: -7, xIndex: 1 }, 
  ]
};

export function MusicStaff({ notes, caption, cursorIndex = null, highlightRange = null, timeSignature, keySignature, measureLines }: MusicStaffProps) {
  const diatonicValue = (n: { note: string, octave: number }) => {
    const letters = ["C", "D", "E", "F", "G", "A", "B"];
    const base = letters.indexOf(n.note.replace(/[^A-G]/g, ''));
    return (n.octave - 4) * 7 + base;
  };

  const innerWidth = Math.max(651, 300 + notes.length * 90 + 50);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cursorIndex !== null && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const noteOffset = 300 + cursorIndex * 90;
      
      container.scrollTo({
        left: noteOffset - container.clientWidth / 2,
        behavior: 'smooth'
      });
    }
  }, [cursorIndex]);

  useEffect(() => {
    if (highlightRange && highlightRange[0] !== undefined && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const noteOffset = 300 + highlightRange[0] * 90;
      
      container.scrollTo({
        left: noteOffset - container.clientWidth / 2 + 45,
        behavior: 'smooth'
      });
    }
  }, [highlightRange?.[0], highlightRange?.[1]]);

  return (
    <div className="bg-slate-100 dark:bg-[#1a1c23] border border-border rounded-xl p-8 my-6 flex flex-col items-center w-full">
      <div 
        ref={scrollContainerRef}
        className="w-full flex justify-start bg-white rounded-xl overflow-x-auto overflow-y-hidden shadow-inner my-4 custom-scrollbar relative"
      >
        <div 
          className="relative shrink-0 mx-auto my-24" 
          style={{ width: `${innerWidth}px`, height: '422px' }}
        >
          {cursorIndex !== null && cursorIndex >= 0 && cursorIndex < notes.length && (
            <div 
              className="absolute top-[36px] bottom-[20px] w-[2px] bg-blue-500 shadow-sm transition-all duration-150"
              style={{ left: `${300 + cursorIndex * 90 + 17}px`, zIndex: 20 }} 
            />
          )}
          
          {highlightRange && highlightRange[0] >= 0 && highlightRange[1] < notes.length && (
            <div 
              className="absolute top-[36px] bottom-[20px] bg-yellow-300/30 border-2 border-yellow-400/50 rounded-lg transition-all duration-300"
              style={{ 
                left: `${300 + highlightRange[0] * 90 - 30}px`, 
                width: `${Math.max(1, highlightRange[1] - highlightRange[0]) * 90 + 96}px`,
                zIndex: 15
              }} 
            />
          )}
          
          <img 
            src="/musicstaff.jpg" 
            alt="Grand Staff" 
            className="absolute inset-0 pointer-events-none" 
            style={{ objectFit: 'none', objectPosition: 'left top', width: '100%', height: '100%' }} 
          />
          
          <div className="absolute top-0 bottom-0 right-0 pointer-events-none" style={{ left: '500px', zIndex: 1 }}>
            <div className="absolute left-0 right-0 h-[5px] bg-[#181818]" style={{ top: 36 }} />
            {[64, 92, 120, 148].map(y => <div key={'t'+y} className="absolute left-0 right-0 h-[5px] bg-[#181818]" style={{ top: y }} />)}
            
            {[290, 318, 346, 374, 402].map(y => <div key={'b'+y} className="absolute left-0 right-0 h-[5px] bg-[#181818]" style={{ top: y }} />)}
          </div>

          {keySignature && KEY_SIGNATURES[keySignature]?.map((sig, idx) => {
            let yPosition = 0;
            if (sig.dv >= 0) {
              yPosition = 150 - (sig.dv - 2) * 14;
            } else {
              yPosition = 292 - (sig.dv - (-2)) * 14;
            }
            return (
              <div 
                key={idx} 
                className="absolute z-10 pointer-events-none flex items-center justify-center"
                style={{ left: 170 + sig.xIndex * 20, top: yPosition - 14, width: 36, height: 28 }}
              >
                {sig.type === 'sharp' && <img src="/sharp.svg" className="absolute top-1/2 -translate-y-1/2 h-10 w-auto" style={{ left: '50%', transform: 'translate(-50%, -50%)' }} alt="sharp" />}
                {sig.type === 'flat' && <img src="/flat.svg" className="absolute top-1/2 h-9 w-auto" style={{ left: '50%', transform: 'translate(-50%, -70%)' }} alt="flat" />}
              </div>
            );
          })}

          {timeSignature === "4/4" && (
            <>
              <img 
                src="/time-44.png" 
                alt="4/4 Time Signature"
                className="absolute z-10" 
                style={{ left: 230, top: 36, height: 112, objectFit: 'contain' }} 
              />
              <img 
                src="/time-44.png" 
                alt="4/4 Time Signature"
                className="absolute z-10" 
                style={{ left: 230, top: 290, height: 112, objectFit: 'contain' }} 
              />
            </>
          )}

          {timeSignature === "3/4" && (
            <>
              <div className="absolute z-10 flex flex-col items-center justify-center text-[#181818] font-serif font-bold leading-[0.7]" style={{ left: 230, top: 44, fontSize: '64px', letterSpacing: '-0.1em' }}>
                <span style={{ marginBottom: '-6px' }}>3</span>
                <span>4</span>
              </div>
              <div className="absolute z-10 flex flex-col items-center justify-center text-[#181818] font-serif font-bold leading-[0.7]" style={{ left: 230, top: 298, fontSize: '64px', letterSpacing: '-0.1em' }}>
                <span style={{ marginBottom: '-6px' }}>3</span>
                <span>4</span>
              </div>
            </>
          )}

          {measureLines && measureLines.map((idx, i) => (
            <div 
              key={'barline'+i} 
              className="absolute w-[3px] bg-[#181818] z-10" 
              style={{ left: 300 + idx * 90 + 55, top: 36, height: 370 }} 
            />
          ))}

          {notes.map((nItem, i) => {
            const chordNotes = 'chord' in nItem ? nItem.chord : [nItem];
            const duration = nItem.duration;
            const dotted = 'dotted' in nItem ? nItem.dotted : undefined;
            const tiedToNext = 'tiedToNext' in nItem ? nItem.tiedToNext : undefined;
            const fingering = 'fingering' in nItem ? nItem.fingering : undefined;
            const isPlaying = cursorIndex === i;

            const trebleNotes = chordNotes.filter(cn => diatonicValue(cn) >= 0);
            const bassNotes = chordNotes.filter(cn => diatonicValue(cn) < 0);
            
            const minTrebleDv = trebleNotes.length > 0 ? Math.min(...trebleNotes.map(cn => diatonicValue(cn))) : null;
            const maxBassDv = bassNotes.length > 0 ? Math.max(...bassNotes.map(cn => diatonicValue(cn))) : null;

            return (
              <React.Fragment key={i}>
                {chordNotes.map((n, chordIdx) => {
                  const dv = diatonicValue(n);
                  
                  let yPosition = 0;
                  if (dv >= 0) {
                    yPosition = 150 - (dv - 2) * 14;
                  } else {
                    yPosition = 292 - (dv - (-2)) * 14;
                  }

                  const isSharp = n.note.includes("#");
                  const isFlat = n.note.includes("b") && !(keySignature === "F Major" && n.note.includes("B"));
                  const isNatural = n.note.includes("natural");

                  const ledgerLines = [];
                  if (dv >= 0) {
                    if (dv === 0) ledgerLines.push(149 + 28);
                    for (let lDv = 12; lDv <= dv; lDv += 2) {
                      ledgerLines.push(149 - (lDv - 2) * 14);
                    }
                  } else {
                    if (dv === -1) ledgerLines.push(291 - 28);
                    for (let lDv = -12; lDv >= dv; lDv -= 2) {
                      ledgerLines.push(291 - (lDv + 2) * 14);
                    }
                  }

                  let showStem = false;
                  if (dv >= 0 && dv === minTrebleDv) showStem = true;
                  if (dv < 0 && dv === maxBassDv) showStem = true;

                  let horizontalOffset = 0;
                  if (dv >= 0) {
                    if (trebleNotes.some(cn => diatonicValue(cn) === dv - 1)) {
                      horizontalOffset = 22;
                    }
                  } else {
                    if (bassNotes.some(cn => diatonicValue(cn) === dv - 1)) {
                      horizontalOffset = 22;
                    }
                  }

                  return (
                    <motion.div 
                      key={chordIdx}
                      initial={{ opacity: 0, top: yPosition - 10 }}
                      animate={{ opacity: 1, top: yPosition, scale: isPlaying ? 1.4 : 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                      className="absolute flex items-center justify-center z-10"
                      style={{ left: 300 + i * 90 + horizontalOffset, width: 36, height: 28, marginTop: -14, zIndex: isPlaying ? 30 : 10 }}
                    >
                      {fingering !== undefined && chordIdx === chordNotes.length - 1 && (
                        <div 
                          className={`absolute font-black text-xl w-[36px] text-center transition-all z-20 ${fingering === 1 && i > 0 ? 'text-blue-500 scale-[1.3]' : 'text-slate-500'}`}
                          style={{ top: dv >= 0 ? -130 : -40 }}
                        >
                          {fingering}
                        </div>
                      )}

                      {ledgerLines.map(ly => (
                        <div key={ly} className="absolute h-[3px] bg-black w-[54px]" style={{ top: ly - yPosition + 12.5, left: -9 }}></div>
                      ))}

                      {isSharp && <img src="/sharp.svg" className="absolute -left-9 top-1/2 -translate-y-1/2 h-10 w-auto" alt="sharp" />}
                      {isFlat && <img src="/flat.svg" className="absolute -left-9 top-1/2 -translate-y-[70%] h-9 w-auto" alt="flat" />}
                      {isNatural && <span className="absolute -left-9 top-1/2 -translate-y-[55%] font-serif text-[42px] font-bold text-black leading-none">♮</span>}

                      <div className={`w-[36px] h-[26px] rounded-[50%] rotate-[-15deg] shadow-sm ${duration && duration >= 0.8 ? 'border-[4px] border-black bg-white' : 'bg-black'}`}></div>
                      
                      {showStem && (!duration || duration < 1.6) && (
                        dv >= 0 ? (
                          <div className="w-[3px] h-28 absolute right-[1px] bottom-[12px] bg-black shadow-sm">
                            {duration && duration <= 0.25 && (
                              <svg className="absolute left-[1px]" style={{ top: 0 }} width="14" height="32" viewBox="0 0 14 32">
                                <path d="M0,0 Q14,4 10,24 Q6,12 0,16 Z" fill="black" />
                              </svg>
                            )}
                            {duration && duration <= 0.125 && (
                              <svg className="absolute left-[1px]" style={{ top: 10 }} width="14" height="32" viewBox="0 0 14 32">
                                <path d="M0,0 Q14,4 10,24 Q6,12 0,16 Z" fill="black" />
                              </svg>
                            )}
                          </div>
                        ) : (
                          <div className="w-[3px] h-28 absolute left-[1px] top-[12px] bg-black shadow-sm">
                            {duration && duration <= 0.25 && (
                              <svg className="absolute left-[1px]" style={{ bottom: 0 }} width="14" height="32" viewBox="0 0 14 32">
                                <path d="M0,32 Q14,28 10,8 Q6,20 0,16 Z" fill="black" />
                              </svg>
                            )}
                            {duration && duration <= 0.125 && (
                              <svg className="absolute left-[1px]" style={{ bottom: 10 }} width="14" height="32" viewBox="0 0 14 32">
                                <path d="M0,32 Q14,28 10,8 Q6,20 0,16 Z" fill="black" />
                              </svg>
                            )}
                          </div>
                        )
                      )}

                      {dotted ? (
                        <div className="absolute w-[6px] h-[6px] bg-black rounded-full" style={{ right: '-12px', top: '10px' }}></div>
                      ) : null}

                      {tiedToNext ? (
                        <svg className="absolute z-10 pointer-events-none overflow-visible" style={{ left: 18, top: dv >= 0 ? 25 : -10, width: 90, height: 20 }}>
                          <path d={dv >= 0 ? "M 0 0 Q 30 15 65 0" : "M 0 20 Q 30 5 65 20"} fill="none" stroke="black" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      ) : null}
                    </motion.div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>
      
      {innerWidth > 700 && (
        <p className="text-sm text-orange-500/80 font-bold animate-pulse mt-4 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>
          Scroll sideways to view full sequence
        </p>
      )}
      
      <p className="mt-8 text-orange-400 font-bold tracking-wide text-lg">{caption}</p>
    </div>
  );
}
