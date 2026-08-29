// src/App.tsx
import { useEffect, useState } from "react";

import { CanvasScene } from "./CanvasScene";

type WebGPUSupport = "checking" | "supported" | "unsupported";

export function App() {
  const [support, setSupport] = useState<WebGPUSupport>("checking");

  useEffect(() => {
    let cancelled = false;

    const probe = async () => {
      // `navigator.gpu` existing doesn't mean a device is actually available —
      // some Android Chrome builds expose the object but fail to hand back an
      // adapter (blocklisted GPU/driver, WebGPU flag partially enabled), which
      // otherwise left CanvasScene rendering an empty black canvas instead of
      // falling back. Requesting the adapter mirrors what the renderer's
      // `init()` does, so a failure here means it would fail there too.
      if (typeof navigator === "undefined" || !navigator.gpu) return false;
      try {
        const adapter = await navigator.gpu.requestAdapter();
        return !!adapter;
      } catch {
        return false;
      }
    };

    probe().then((hasWebGPU) => {
      if (cancelled) return;
      setSupport(hasWebGPU ? "supported" : "unsupported");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      {support === "checking" ? null : support === "unsupported" ? (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontFamily: "sans-serif",
          }}
        >
          WebGPU isn&apos;t available on this device/browser.
        </div>
      ) : (
        <CanvasScene />
      )}
    </div>
  );
}
