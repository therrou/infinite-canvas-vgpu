import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { wgslVitePlugin } from "@vgpu/wgsl/loader-vite";

export default defineConfig({
  plugins: [react(), wgslVitePlugin()],
});
