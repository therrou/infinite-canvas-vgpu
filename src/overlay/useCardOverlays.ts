// src/overlay/useCardOverlays.ts
import { useEffect, useRef, useState } from "react";

import type { InfiniteCanvasRenderer, VisibleCard } from "../canvas/renderer";
import { worldToScreen } from "../canvas/projection";

export interface ProjectedCard extends VisibleCard {
  readonly screenX: number;
  readonly screenY: number;
}

export function useCardOverlays(
  renderer: InfiniteCanvasRenderer | undefined,
  containerRef: React.RefObject<HTMLElement>
): readonly ProjectedCard[] {
  const [projected, setProjected] = useState<readonly ProjectedCard[]>([]);
  const frameRef = useRef<number>();

  useEffect(() => {
    if (!renderer) return;

    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const container = containerRef.current;
      const viewProjection = renderer.getViewProjection();
      if (container && viewProjection) {
        const { width, height } = container.getBoundingClientRect();
        const next = renderer
          .getVisibleCards()
          .map((card) => {
            const screen = worldToScreen(viewProjection, card.worldX, card.worldZ, width, height);
            return { ...card, screenX: screen.x, screenY: screen.y, visible: screen.visible };
          })
          .filter((card) => card.visible && card.screenX > -200 && card.screenX < width + 200 && card.screenY > -200 && card.screenY < height + 200);
        setProjected(next);
      }
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [renderer, containerRef]);

  return projected;
}
