// src/CanvasScene.tsx
"use client";

import { useEffect, useRef, useState } from "react";

import { createInfiniteCanvasRenderer, type InfiniteCanvasRenderer } from "./canvas/renderer";
import { CardOverlay } from "./overlay/CardOverlay";
import { useCardOverlays } from "./overlay/useCardOverlays";

import "./CanvasScene.css";

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
    <div ref={containerRef} className="canvas-scene">
      <canvas ref={canvasRef} className="canvas-scene__canvas" />
      {projectedCards.map((card) => (
        <CardOverlay key={card.key} card={card} />
      ))}
    </div>
  );
}
