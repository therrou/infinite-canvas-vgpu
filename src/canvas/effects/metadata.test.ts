import { describe, expect, it } from "vitest";

import { CARD_EFFECT_METADATA } from "./metadata";

describe("card editorial metadata", () => {
  it("defines fourteen distinct editorial stories", () => {
    expect(CARD_EFFECT_METADATA.map(({ title }) => title)).toEqual([
      "Latent Space",
      "Cold Start",
      "Edge Compute",
      "Async Queue",
      "Sharded State",
      "Gradient Descent",
      "Token Stream",
      "Merkle Proof",
      "Kernel Trick",
      "Backpressure",
      "Cache Miss",
      "Consensus",
      "Attention Head",
      "Rolling Deploy",
    ]);
  });
});
