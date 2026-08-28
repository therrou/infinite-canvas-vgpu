// src/CanvasScene.tsx
"use client";

import { useEffect, useRef, useState } from "react";

import { createInfiniteCanvasRenderer, type InfiniteCanvasRenderer } from "./canvas/renderer";
import { CardOverlay } from "./overlay/CardOverlay";
import { useCardOverlays } from "./overlay/useCardOverlays";

export function CanvasScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderer, setRenderer] = useState<InfiniteCanvasRenderer>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const nextRenderer = createInfiniteCanvasRenderer(canvas);
    setRenderer(nextRenderer);
    return () => nextRenderer.dispose();
  }, []);

  const projectedCards = useCardOverlays(renderer, containerRef);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block h-full w-full touch-none" />
      {projectedCards.map((card) => (
        <CardOverlay key={card.key} card={card} />
      ))}
    </div>
  );
}
