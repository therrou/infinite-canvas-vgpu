// src/overlay/CardOverlay.tsx
import { CARD_EFFECTS } from "../canvas/effects/registry";
import type { ProjectedCard } from "./useCardOverlays";

import "./CardOverlay.css";

export function CardOverlay({ card }: { card: ProjectedCard }) {
  const effect = CARD_EFFECTS[card.effectIndex];
  return (
    <div
      className="card-overlay"
      style={{ transform: `translate(${card.screenX}px, ${card.screenY}px)` }}
    >
      <div className="card-overlay__kicker">
        <span className="card-overlay__id">{effect.id}</span>
        <span className="card-overlay__category">{effect.category}</span>
        <span className="card-overlay__tag">WEBGPU · 2026</span>
      </div>
      <div className="card-overlay__title">{effect.title}</div>
      <div className="card-overlay__tagline">{effect.tagline}</div>
    </div>
  );
}
