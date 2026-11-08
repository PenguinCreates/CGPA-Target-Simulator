---
name: Mobile publish build
description: Module-system and Metro-port constraints for the Expo artifact's production web export.
---

Keep both the mobile artifact's production build script and production server in ES module syntax because its package declares `"type": "module"`. Select an available Metro port for each build and use that same port for health checks, bundles, manifests, and assets.

**Why:** Publishing runs the mobile artifact build alongside other workspace services. CommonJS `require` fails under this package mode, and fixed port 8081 may be occupied by the component preview server. A successful bundle build alone does not prove the production server can start.

**How to apply:** Preserve ESM imports in `scripts/build.js` and `server/serve.js`, keep the dynamic Metro port wiring, and verify both the build and `/cgpa-target-mobile/` startup route.
