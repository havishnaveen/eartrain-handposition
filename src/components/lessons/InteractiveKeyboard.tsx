import { useRef, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { AnimatedPointer } from "../AnimatedPointer";

export const PIANO_KEYS_2_OCT = [
  { note: "C4", isBlack: false }, { note: "C#4", isBlack: true },
  { note: "D4", isBlack: false }, { note: "D#4", isBlack: true },
  { note: "E4", isBlack: false },
  { note: "F4", isBlack: false }, { note: "F#4", isBlack: true },
  { note: "G4", isBlack: false }, { note: "G#4", isBlack: true },
  { note: "A4", isBlack: false }, { note: "A#4", isBlack: true },
  { note: "B4", isBlack: false },
  { note: "C5", isBlack: false }, { note: "C#5", isBlack: true },
  { note: "D5", isBlack: false }, { note: "D#5", isBlack: true },
  { note: "E5", isBlack: false },
  { note: "F5", isBlack: false }, { note: "F#5", isBlack: true },
  { note: "G5", isBlack: false }, { note: "G#5", isBlack: true },
  { note: "A5", isBlack: false }, { note: "A#5", isBlack: true },
  { note: "B5", isBlack: false },
  { note: "C6", isBlack: false },
];

export type HandShape = {
  rootNote: string;
  fingerOffsets: number[]; // Array of 5 numbers representing half-steps from root
};

interface Props {
  shape: HandShape;
  onChangeShape?: (shape: HandShape) => void;
  isLocked?: boolean;
  pointAtFinger?: number;
  pointAtKeys?: string[];
  pointAtDragHandle?: boolean;
  disableMove?: boolean;
}

export function InteractiveKeyboard({ shape, onChangeShape, isLocked = false, disableMove = false, pointAtFinger, pointAtKeys, pointAtDragHandle }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const whiteKeys = PIANO_KEYS_2_OCT.filter(k => !k.isBlack);
  
  const [isDraggingBlock, setIsDraggingBlock] = useState(false);
  const [activeDragFinger, setActiveDragFinger] = useState<number | null>(null);
  const [hasDragged, setHasDragged] = useState(false);
  const dragRef = useRef({ startX: 0, moved: false });

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isLocked || disableMove || !onChangeShape || !containerRef.current) return;
    
    if (isDraggingBlock) {
      if (Math.abs(e.clientX - dragRef.current.startX) > 5) {
        dragRef.current.moved = true;
        if (!hasDragged) setHasDragged(true);
      }
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const keyWidth = rect.width / whiteKeys.length;
      let index = Math.floor(x / keyWidth);
      index = Math.max(0, Math.min(index, whiteKeys.length - 1));
      const newRoot = whiteKeys[index].note;
      if (newRoot !== shape.rootNote) {
        onChangeShape({ ...shape, rootNote: newRoot });
      }
    } else if (activeDragFinger !== null) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      
      let closestKeyIndex = -1;
      let minDistance = Infinity;
      
      PIANO_KEYS_2_OCT.forEach((k, idx) => {
        let leftPct = 0;
        if (!k.isBlack) {
          const wIdx = whiteKeys.findIndex(wk => wk.note === k.note);
          leftPct = (wIdx + 0.5) * (100 / whiteKeys.length);
        } else {
          const prevWhiteKeyIndex = whiteKeys.findIndex(wk => wk.note[0] === k.note[0] && wk.note.slice(-1) === k.note.slice(-1));
          leftPct = (prevWhiteKeyIndex + 1) * (100 / whiteKeys.length);
        }
        
        const keyPixelX = (leftPct / 100) * rect.width;
        const dist = Math.abs(x - keyPixelX);
        if (dist < minDistance) {
          minDistance = dist;
          closestKeyIndex = idx;
        }
      });
      
      const rootIndex = PIANO_KEYS_2_OCT.findIndex(k => k.note === shape.rootNote);
      if (closestKeyIndex !== -1 && rootIndex !== -1) {
        const newOffset = closestKeyIndex - rootIndex;
        if (newOffset !== shape.fingerOffsets[activeDragFinger]) {
          const newOffsets = [...shape.fingerOffsets];
          newOffsets[activeDragFinger] = newOffset;
          onChangeShape({ ...shape, fingerOffsets: newOffsets });
        }
      }
    }
  };

  const handlePointerUp = () => {
    setIsDraggingBlock(false);
    setActiveDragFinger(null);
  };

  const rootIndex = PIANO_KEYS_2_OCT.findIndex(k => k.note === shape.rootNote);
  
  return (
    <div className="flex flex-col items-center w-full">
      <div className="relative flex justify-center w-full max-w-3xl mx-auto pt-10 select-none touch-none">
        <div 
          ref={containerRef} 
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="relative flex bg-stone-900 p-2 rounded-t-xl rounded-b-md shadow-2xl border-b-8 border-stone-800 w-full"
        >
        
        {/* White Keys */}
        {whiteKeys.map((wk) => {
          return (
            <div 
              key={wk.note}
              onPointerDown={(e) => {
                if (!isLocked && !disableMove && onChangeShape) {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  dragRef.current = { startX: e.clientX, moved: false };
                  onChangeShape({ ...shape, rootNote: wk.note });
                  setIsDraggingBlock(true);
                }
              }}
              onPointerUp={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }
              }}
              className="relative flex-1 h-40 sm:h-48 rounded-b-md border border-stone-300 mx-[1px] shadow-sm bg-white cursor-pointer active:bg-stone-200"
            >
              {wk.note.startsWith("C") && (
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-bold text-stone-300 pointer-events-none">
                  {wk.note}
                </span>
              )}
              {pointAtKeys?.includes(wk.note) && <AnimatedPointer className="bottom-6 left-1/2 -translate-x-full z-[70]" />}
            </div>
          );
        })}
        
        {/* Black Keys */}
        <div className="absolute top-2 left-2 right-2 h-24 sm:h-32 pointer-events-none">
          {PIANO_KEYS_2_OCT.map((k) => {
            if (!k.isBlack) return null;
            const prevWhiteKeyIndex = whiteKeys.findIndex(wk => wk.note[0] === k.note[0] && wk.note.slice(-1) === k.note.slice(-1));
            const totalWhiteKeys = whiteKeys.length;
            const keyWidthPct = 100 / totalWhiteKeys;
            const leftPct = (prevWhiteKeyIndex + 1) * keyWidthPct;
            
            return (
              <div 
                key={k.note}
                className="absolute w-[4%] max-w-[24px] h-24 sm:h-32 rounded-b-md border border-black bg-stone-900 transform -translate-x-1/2"
                style={{ left: `${leftPct}%` }}
              >
                {pointAtKeys?.includes(k.note) && <AnimatedPointer className="-top-4 left-1/2 -translate-x-full z-[70]" />}
              </div>
            );
          })}
        </div>

        {/* The Hand Block Overlay */}
        {rootIndex !== -1 && (
          <div 
            className="absolute top-2 bottom-2 z-10 pointer-events-none" 
            style={{ left: '8px', right: '8px' }}
          >
            {shape.fingerOffsets.map((offset, i) => {
              const targetKey = PIANO_KEYS_2_OCT[rootIndex + offset];
              if (!targetKey) return null;
              
              // Calculate horizontal position of this finger
              let leftPct = 0;
              let isBlackTarget = targetKey.isBlack;
              
              if (!isBlackTarget) {
                const wIdx = whiteKeys.findIndex(wk => wk.note === targetKey.note);
                leftPct = (wIdx + 0.5) * (100 / whiteKeys.length);
              } else {
                const prevWhiteKeyIndex = whiteKeys.findIndex(wk => wk.note[0] === targetKey.note[0] && wk.note.slice(-1) === targetKey.note.slice(-1));
                leftPct = (prevWhiteKeyIndex + 1) * (100 / whiteKeys.length);
              }

              return (
                <div
                  key={i}
                  className={`absolute top-0 flex flex-col items-center justify-end transition-all duration-100 ease-linear ${
                    isBlackTarget ? 'h-24 sm:h-32 pb-2' : 'bottom-0 pb-4'
                  }`}
                  style={{ 
                    left: `${leftPct}%`, 
                    width: isBlackTarget ? '4%' : `${100 / whiteKeys.length}%`, 
                    maxWidth: isBlackTarget ? '24px' : 'none',
                    transform: 'translateX(-50%)',
                    zIndex: isBlackTarget ? 30 : 20
                  }}
                >
                  <div className={`absolute inset-0 rounded-md border-x border-orange-400/20 ${
                    isBlackTarget ? 'bg-orange-500/40' : 'bg-orange-500/20'
                  }`} />
                  {i === 2 && !isLocked && !disableMove && (
                    <div 
                      onPointerDown={(e) => {
                        if (!isLocked && onChangeShape) {
                          e.currentTarget.setPointerCapture(e.pointerId);
                          dragRef.current = { startX: e.clientX, moved: false };
                          setIsDraggingBlock(true);
                        }
                      }}
                      onPointerUp={(e) => {
                        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                          e.currentTarget.releasePointerCapture(e.pointerId);
                        }
                        setIsDraggingBlock(false);
                      }}
                      className="absolute -top-16 bg-white dark:bg-stone-800 text-orange-600 dark:text-orange-400 px-4 py-1.5 rounded-full flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest shadow-lg border border-orange-200 dark:border-stone-700 whitespace-nowrap z-50 cursor-grab active:cursor-grabbing hover:bg-orange-50 transition-colors pointer-events-auto"
                      style={{ touchAction: "none" }}
                    >
                      <ArrowLeftRight className="w-3 h-3" /> Move Shape
                      {pointAtDragHandle && <AnimatedPointer className="-top-12 left-1/2 -translate-x-full" />}
                    </div>
                  )}
                  {pointAtFinger === i && !isLocked && (
                    <AnimatedPointer className="bottom-[5.5rem] left-1/2 -translate-x-full" />
                  )}
                  <div
                    onPointerDown={(e) => {
                      if (!isLocked && onChangeShape) {
                        e.currentTarget.setPointerCapture(e.pointerId);
                        dragRef.current = { startX: e.clientX, moved: false };
                        setActiveDragFinger(i);
                      }
                    }}
                    onPointerUp={(e) => {
                      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                        e.currentTarget.releasePointerCapture(e.pointerId);
                      }
                      setActiveDragFinger(null);
                    }}
                    className={`pointer-events-auto relative z-20 rounded-full flex items-center justify-center font-black text-white shadow-xl transition-all border-2 border-white/50 cursor-grab active:cursor-grabbing
                      ${activeDragFinger === i ? 'bg-blue-500 scale-110' : 'bg-orange-500'}
                      ${isBlackTarget ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-lg'}
                      ${isLocked ? 'opacity-80' : 'hover:scale-110 active:scale-95 drop-shadow-md'}`}
                  >
                    {i + 1}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
