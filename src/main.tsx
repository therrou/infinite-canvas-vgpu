import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Example } from "./index";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div style={{ height: "100vh", width: "100vw" }}>
      <Example />
    </div>
  </StrictMode>
);
