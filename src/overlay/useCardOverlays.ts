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
          .flatMap((card): ProjectedCard[] => {
            const screen = worldToScreen(viewProjection, card.worldX, card.worldZ, width, height);
            if (
              !screen.visible ||
              screen.x <= -200 ||
              screen.x >= width + 200 ||
              screen.y <= -200 ||
              screen.y >= height + 200
            ) {
              return [];
            }
            return [{ ...card, screenX: screen.x, screenY: screen.y }];
          });
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
