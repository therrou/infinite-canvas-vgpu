// src/overlay/useCardOverlays.ts
import { useCallback, useEffect, useRef, useState } from "react";

import { CARD_HEIGHT, CARD_WIDTH } from "../canvas/layout";
import type { InfiniteCanvasRenderer, VisibleCard } from "../canvas/renderer";
import { worldCardToScreenFrame } from "../canvas/projection";

export interface ProjectedCard extends VisibleCard {
  readonly screenX: number;
  readonly screenY: number;
  readonly width: number;
  readonly height: number;
  readonly rotationDeg: number;
}

export function sameCardKeys(
  a: readonly { readonly key: string }[],
  b: readonly { readonly key: string }[]
): boolean {
  return a.length === b.length && a.every((card, index) => card.key === b[index]?.key);
}

export function useCardOverlays(
  renderer: InfiniteCanvasRenderer | undefined,
  containerRef: React.RefObject<HTMLElement>
): {
  readonly cards: readonly ProjectedCard[];
  registerElement(key: string, element: HTMLElement | null): void;
} {
  const [projected, setProjected] = useState<readonly ProjectedCard[]>([]);
  const projectedRef = useRef<readonly ProjectedCard[]>([]);
  const elementsRef = useRef(new Map<string, HTMLElement>());
  const frameRef = useRef<number>();
  const registerElement = useCallback((key: string, element: HTMLElement | null) => {
    if (element) elementsRef.current.set(key, element);
    else elementsRef.current.delete(key);
  }, []);

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
            const screen = worldCardToScreenFrame(
              viewProjection,
              card.worldX,
              card.worldZ,
              CARD_WIDTH,
              CARD_HEIGHT,
              width,
              height
            );
            if (
              !screen.visible ||
              screen.centerX + screen.width / 2 <= 0 ||
              screen.centerX - screen.width / 2 >= width ||
              screen.centerY + screen.height / 2 <= 0 ||
              screen.centerY - screen.height / 2 >= height
            ) {
              return [];
            }
            return [
              {
                ...card,
                screenX: screen.centerX,
                screenY: screen.centerY,
                width: screen.width,
                height: screen.height,
                rotationDeg: screen.rotationDeg,
              },
            ];
          });
        for (const card of next) {
          const element = elementsRef.current.get(card.key);
          if (!element) continue;
          element.style.width = `${card.width}px`;
          element.style.height = `${card.height}px`;
          element.style.transform = `translate3d(${card.screenX}px, ${card.screenY}px, 0) translate(-50%, -50%) rotate(${card.rotationDeg}deg)`;
        }
        if (!sameCardKeys(projectedRef.current, next)) {
          setProjected(next);
        }
        projectedRef.current = next;
      }
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [renderer, containerRef]);

  return { cards: projected, registerElement };
}
