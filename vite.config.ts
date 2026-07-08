import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // Modèles face-api (~6.7 Mo) + polices : cachés au runtime, pas dans le
      // precache pour rester léger à l'installation.
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,ico,png,webmanifest}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api/, /^\/trpc/, /^\/webhooks/, /^\/health/],
        runtimeCaching: [
          {
            urlPattern: /\/models\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "face-api-models",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts" },
          },
        ],
      },
      includeAssets: ["logo.svg"],
      manifest: {
        name:            "LabFT — Plateforme KYC/AML",
        short_name:      "LabFT",
        description:     "Vérification d'identité et conformité BAM / loi 43-05",
        theme_color:     "#0f766e",
        background_color: "#0b1220",
        display:         "standalone",
        start_url:       "/",
        scope:           "/",
        lang:            "fr",
        // Le SVG suffit pour installer la PWA sur Chrome/Edge/Android moderne.
        // Pour iOS, ajouter des PNG 192/512 quand un design final sera choisi.
        icons: [
          { src: "/logo.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
        ],
      },
      devOptions: {
        // Désactivé en dev pour éviter les problèmes de cache pendant le développement
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client/src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  root: "./client",
  build: {
    outDir: "../dist/public",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true },
      "/trpc": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
});
