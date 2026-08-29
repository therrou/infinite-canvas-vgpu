// src/overlay/CardOverlay.tsx
import type { CSSProperties, Ref } from "react";

import { CARD_EFFECTS } from "../canvas/effects/registry";
import type { ProjectedCard } from "./useCardOverlays";

import "./CardOverlay.css";

export function CardOverlay({
  card,
  elementRef,
}: {
  card: ProjectedCard;
  elementRef?: Ref<HTMLElement>;
}) {
  const effect = CARD_EFFECTS[card.effectIndex];
  const style: CSSProperties = {
    width: card.width,
    height: card.height,
    transform: `translate3d(${card.screenX}px, ${card.screenY}px, 0) translate(-50%, -50%) rotate(${card.rotationDeg}deg)`,
  };

  return (
    <article ref={elementRef} className="card-overlay" style={style}>
      <div className="card-overlay__content">
        <div className="card-overlay__copy">
          <div className="card-overlay__rule" />
          <h2 className="card-overlay__title">{effect.title}</h2>
          <p className="card-overlay__tagline">{effect.tagline}</p>
        </div>
      </div>
    </article>
  );
}
