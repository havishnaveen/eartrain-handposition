import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "./ui/button";
import { X, ChevronRight, Check } from "lucide-react";
import { createPortal } from "react-dom";

export type TourStep = {
  target: string; // CSS selector
  title: string;
  content: React.ReactNode;
  onBeforeShow?: () => Promise<void> | void;
};

interface AppTourProps {
  steps: TourStep[];
  onComplete: () => void;
  onSkip: () => void;
}

export function AppTour({ steps, onComplete, onSkip }: AppTourProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<(DOMRect & { borderRadius?: number }) | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(true);
  const prevRectRef = useRef<{ top: number; left: number; width: number; height: number } | null>(null);

  const currentStep = steps[currentStepIndex];

  // Allow scroll during tour so smooth scrolling works, but prevent horizontal overflow
  useEffect(() => {
    document.body.style.overflowX = "hidden";
    return () => {
      document.body.style.overflowX = "";
    };
  }, []);

  // Measure and track the target element
  useEffect(() => {
    let active = true;
    let frameId: number;
    let attempts = 0;

    const trackElement = () => {
      if (!active) return;
      if (currentStep.target === "center") {
        const rect = new DOMRect(window.innerWidth / 2, window.innerHeight / 2, 0, 0) as any;
        setTargetRect(rect);
        setIsTransitioning(false);
      } else {
        const el = document.querySelector(currentStep.target);
        if (el) {
          const rect = el.getBoundingClientRect();
          const computed = window.getComputedStyle(el);
          let radius = parseInt(computed.borderRadius);
          const rectWithRadius = Object.assign({}, rect.toJSON(), { borderRadius: isNaN(radius) ? 12 : radius });
          
          setTargetRect(prev => {
            if (!prev || prev.top !== rectWithRadius.top || prev.left !== rectWithRadius.left || prev.width !== rectWithRadius.width || prev.height !== rectWithRadius.height) {
              return rectWithRadius;
            }
            return prev;
          });
          setIsTransitioning(false);
        }
      }
      frameId = requestAnimationFrame(trackElement);
    };

    const measure = async () => {
      setIsTransitioning(true);
      if (currentStep.onBeforeShow) {
        await currentStep.onBeforeShow();
      }

      const initScroll = () => {
        if (!active) return;
        if (currentStep.target !== "center") {
          const el = document.querySelector(currentStep.target);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Wait for smooth scroll to settle before tracking
            setTimeout(() => {
              if (active) trackElement();
            }, 500);
          } else {
            attempts++;
            if (attempts > 15) {
               console.warn(`Tour target ${currentStep.target} not found, defaulting to center.`);
               setTargetRect(new DOMRect(window.innerWidth / 2, window.innerHeight / 2, 0, 0) as any);
               setIsTransitioning(false);
            } else {
               setTimeout(initScroll, 100);
            }
          }
        } else {
           trackElement();
        }
      };
      
      initScroll();
    };

    measure();

    return () => {
      active = false;
      cancelAnimationFrame(frameId);
    };
  }, [currentStepIndex, currentStep]);

  // Save previous rect for animation
  useEffect(() => {
    if (targetRect) {
      prevRectRef.current = {
        top: targetRect.top,
        left: targetRect.left,
        width: targetRect.width,
        height: targetRect.height,
      };
    }
  }, [targetRect]);

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(i => i + 1);
    } else {
      onComplete();
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(i => i - 1);
    }
  };

  if (!targetRect) return null;

  const TOOLTIP_WIDTH = 340;
  const TOOLTIP_HEIGHT = 200;
  const padding = 12;
  
  let roomTop = targetRect.top;
  let roomBottom = window.innerHeight - targetRect.bottom;
  let roomLeft = targetRect.left;
  let roomRight = window.innerWidth - targetRect.right;

  let tooltipTop = 0;
  let tooltipLeft = 0;

  if (currentStep.target === "center") {
    tooltipTop = window.innerHeight / 2 - TOOLTIP_HEIGHT / 2;
    tooltipLeft = window.innerWidth / 2 - TOOLTIP_WIDTH / 2;
  } else {
    const maxRoom = Math.max(roomTop, roomBottom, roomLeft, roomRight);

    if (maxRoom === roomBottom && roomBottom >= TOOLTIP_HEIGHT) {
      tooltipTop = targetRect.bottom + padding + 10;
      tooltipLeft = Math.max(16, Math.min(targetRect.left, window.innerWidth - TOOLTIP_WIDTH - 16));
    } else if (maxRoom === roomTop && roomTop >= TOOLTIP_HEIGHT) {
      tooltipTop = targetRect.top - padding - TOOLTIP_HEIGHT - 10;
      tooltipLeft = Math.max(16, Math.min(targetRect.left, window.innerWidth - TOOLTIP_WIDTH - 16));
    } else if (maxRoom === roomRight && roomRight >= TOOLTIP_WIDTH) {
      tooltipLeft = targetRect.right + padding + 10;
      tooltipTop = Math.max(16, Math.min(targetRect.top, window.innerHeight - TOOLTIP_HEIGHT - 16));
    } else if (maxRoom === roomLeft && roomLeft >= TOOLTIP_WIDTH) {
      tooltipLeft = targetRect.left - padding - TOOLTIP_WIDTH - 10;
      tooltipTop = Math.max(16, Math.min(targetRect.top, window.innerHeight - TOOLTIP_HEIGHT - 16));
    } else {
      tooltipTop = window.innerHeight - TOOLTIP_HEIGHT - 16;
      tooltipLeft = window.innerWidth / 2 - (TOOLTIP_WIDTH / 2);
    }
  }

  const isCenter = currentStep.target === "center";

  return createPortal(
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      {/* Overlay with cutout - uses CSS clip-path for smooth animated hole */}
      {!isTransitioning && (
        <>
          {/* Dark overlay background - pointer events enabled to block clicks */}
          <motion.div
            className="fixed inset-0 pointer-events-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          />

          {/* Animated highlight cutout */}
          <motion.div
            key="highlight"
            className="absolute pointer-events-none border-2 border-orange-500 z-10"
            initial={prevRectRef.current ? {
              top: prevRectRef.current.top,
              left: prevRectRef.current.left,
              width: prevRectRef.current.width,
              height: prevRectRef.current.height,
              opacity: 0.5,
            } : { opacity: 0 }}
            animate={{
              top: targetRect.top,
              left: targetRect.left,
              width: targetRect.width,
              height: targetRect.height,
              opacity: 1,
              borderRadius: targetRect.borderRadius || 12,
            }}
            transition={{ 
              type: "spring", 
              stiffness: 200, 
              damping: 30,
              mass: 0.8,
            }}
            style={{
              boxShadow: isCenter ? "none" : "0 0 0 9999px rgba(0,0,0,0.4), 0 0 30px 5px rgba(249,115,22,0.3)",
            }}
          />
        </>
      )}

      {/* Tooltip */}
      <AnimatePresence mode="wait">
        {!isTransitioning && (
          <motion.div
            key={`tooltip-${currentStepIndex}`}
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            className="absolute bg-card border-2 border-border shadow-2xl rounded-2xl p-6 pointer-events-auto flex flex-col z-20"
            style={{ 
              left: tooltipLeft, 
              top: tooltipTop,
              width: TOOLTIP_WIDTH,
              minHeight: TOOLTIP_HEIGHT
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-lg text-orange-600 dark:text-orange-400 flex items-center gap-2">
                {currentStep.title}
              </h3>
              <button 
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSkip(); }}
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
                aria-label="Skip tour"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <p className="text-sm text-foreground/80 mb-6 leading-relaxed flex-grow">
              {currentStep.content}
            </p>

            <div className="flex items-center justify-between mt-auto">
              <div className="flex gap-1">
                {steps.map((_, i) => (
                  <div 
                    key={i} 
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === currentStepIndex ? "w-5 bg-orange-500" : i < currentStepIndex ? "w-1.5 bg-orange-500/40" : "w-1.5 bg-border"
                    }`} 
                  />
                ))}
              </div>
              
              <div className="flex gap-2 items-center">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSkip(); }}
                  className="text-xs hover:bg-transparent hover:underline px-2 text-muted-foreground"
                >
                  Skip
                </Button>
                {currentStepIndex > 0 && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleBack(); }}
                    className="text-xs px-3"
                  >
                    Back
                  </Button>
                )}
                <Button 
                  size="sm" 
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleNext(); }} 
                  className="bg-orange-600 hover:bg-orange-700 text-white gap-1 pl-4 pr-3 text-xs"
                >
                  {currentStepIndex < steps.length - 1 ? (
                    <>Next <ChevronRight className="w-3.5 h-3.5" /></>
                  ) : (
                    <>Done <Check className="w-3.5 h-3.5" /></>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body
  );
}
