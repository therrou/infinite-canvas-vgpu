// src/overlay/CardOverlay.tsx
import type { CSSProperties, Ref } from "react";

import { CARD_EFFECTS } from "../canvas/effects/registry";
import type { ProjectedCard } from "./useCardOverlays";
import TextType from "./TextType";

import "./CardOverlay.css";

const TITLE_TYPING_SPEED = 60;
const TAGLINE_TYPING_SPEED = 18;
const TAGLINE_START_BUFFER = 400;

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
          <TextType
            as="h2"
            className="card-overlay__title"
            text={effect.title}
            loop={true}
            typingSpeed={TITLE_TYPING_SPEED}
            initialDelay={300}
          />
          <TextType
            as="p"
            className="card-overlay__tagline"
            text={effect.tagline}
            loop={true}
            showCursor={true}
            typingSpeed={TAGLINE_TYPING_SPEED}
            initialDelay={300 + effect.title.length * TITLE_TYPING_SPEED + TAGLINE_START_BUFFER}
          />
        </div>
      </div>
    </article>
  );
}
