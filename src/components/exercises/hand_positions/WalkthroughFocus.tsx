import React from "react";
import { AnimatedPointer } from "../../AnimatedPointer";

interface WalkthroughFocusProps {
  isActive: boolean;
  pointerPosition?: string; // Default: "-top-12 left-1/2 -translate-x-1/2"
  className?: string;       // Default: "relative"
  children: React.ReactNode;
}

export function WalkthroughFocus({ 
  isActive, 
  pointerPosition = "-top-12 left-1/2 -translate-x-1/2",
  className = "",
  children 
}: WalkthroughFocusProps) {
  const hasPosition = className.includes("absolute") || className.includes("fixed") || className.includes("relative");
  return (
    <div className={`${hasPosition ? '' : 'relative'} ${className} ${isActive ? 'z-50' : 'z-10'}`}>
      {isActive && (
        <AnimatedPointer className={pointerPosition} />
      )}
      {children}
    </div>
  );
}
