import { describe, expect, it } from "vitest";

import { createInputController } from "./inputController";

describe("createInputController", () => {
  it("does not attach wheel zoom behavior", () => {
    const attached: string[] = [];
    const element = {
      addEventListener(type: string) {
        attached.push(type);
      },
      removeEventListener() {},
    } as unknown as HTMLElement;

    createInputController().attach(element);

    expect(attached).not.toContain("wheel");
  });

  it("reports navigation without a mutable zoom distance", () => {
    const controller = createInputController();
    const snapshot = controller.tick(0);

    expect(snapshot).not.toHaveProperty("distance");
    expect(controller).toHaveProperty("setZoom");
  });
});
