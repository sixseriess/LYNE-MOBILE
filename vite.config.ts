import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages project-site path. The PWA manifest and service worker use the same scope.
export default defineConfig({ plugins: [react()], base: "/LYNE-MOBILE/" });
