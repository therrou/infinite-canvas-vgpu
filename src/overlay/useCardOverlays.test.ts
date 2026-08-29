import { describe, expect, it } from "vitest";

import { sameCardKeys } from "./useCardOverlays";

describe("sameCardKeys", () => {
  it("ignores per-frame position changes when the visible card set is stable", () => {
    const before = [{ key: "0:1", screenX: 10 }];
    const after = [{ key: "0:1", screenX: 42 }];

    expect(sameCardKeys(before, after)).toBe(true);
  });

  it("detects cards entering or leaving the viewport", () => {
    expect(sameCardKeys([{ key: "0:1" }], [{ key: "0:2" }])).toBe(false);
  });
});
