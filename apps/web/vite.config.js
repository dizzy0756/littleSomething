import { defineConfig } from "vite";
import { resolve } from "path";

// Multi-page static site: every HTML file at the project root is an entry.
const root = __dirname;
const pages = {
  index: resolve(root, "index.html"),
  builder: resolve(root, "builder.html"),
  checkout: resolve(root, "checkout.html"),
  dashboard: resolve(root, "dashboard.html"),
  admin: resolve(root, "admin.html"),
  preview: resolve(root, "preview.html"),
  templates: resolve(root, "templates.html"),
  "how-it-works": resolve(root, "how-it-works.html"),
  terms: resolve(root, "terms.html"),
  privacy: resolve(root, "privacy.html"),
  contact: resolve(root, "contact.html"),
  refund: resolve(root, "refund.html"),
  "payment-failed": resolve(root, "payment-failed.html"),
  success: resolve(root, "success.html"),
};

export default defineConfig({
  root,
  publicDir: "public",
  base: "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: pages,
    },
  },
  // Inject deploy-time config. These are PUBLIC (safe to expose to the browser):
  // the API origin, the Razorpay publishable key, and the CDN base.
  define: {
    __API_BASE__: JSON.stringify(process.env.VITE_API_BASE_URL || ""),
    __RZP_KEY__: JSON.stringify(process.env.VITE_RAZORPAY_KEY_ID || ""),
    __CDN_BASE__: JSON.stringify(process.env.VITE_CDN_BASE_URL || ""),
  },
  server: {
    port: 5173,
    // Proxy API calls to the Render backend during local development so the
    // browser talks to a single origin (no CORS headaches in dev).
    proxy: {
      "/api": process.env.VITE_PROXY_API || "http://localhost:3001",
      // Only proxy real surprise pages (/s/<slug>), not /success.html etc.
      "^/s/.+": process.env.VITE_PROXY_API || "http://localhost:3001",
      "/uploads": process.env.VITE_PROXY_API || "http://localhost:3001",
      // Only proxy template assets (/templates/<id>/...), not the local
      // /templates.html marketing page. The trailing slash is required so the
      // prefix match doesn't also capture /templates.html.
      "^/templates/": process.env.VITE_PROXY_API || "http://localhost:3001",
    },
  },
});
