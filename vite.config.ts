import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      // Never silently reload out from under a live recording session -
      // show an "update available" toast and let the user pick when to reload.
      registerType: "prompt",
      devOptions: {
        enabled: true,
      },
      manifest: {
        name: "Live Looper",
        short_name: "Looper",
        description:
          "A live looper pedal for guitar and other instruments, running entirely in your browser.",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        scope: "/",
        theme_color: "#11141a",
        background_color: "#11141a",
        categories: ["music"],
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Precache only the static app shell. There is no runtimeCaching
        // config at all: mic input is a local device stream, never fetched,
        // so there is nothing audio-related that could ever be cached here.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff2}"],
        navigateFallback: "index.html",
      },
    }),
  ],
  worker: {
    format: "es",
  },
});
