---
name: Mobile publish build
description: Module-system and Metro-port constraints for the Expo artifact's production web export.
---

Keep the mobile artifact's production build script in ES module syntax because its package declares `"type": "module"`. Select an available Metro port for each build and use that same port for health checks, bundles, manifests, and assets.

**Why:** Publishing runs the mobile artifact build alongside other workspace services. CommonJS `require` fails under this package mode, and fixed port 8081 may be occupied by the component preview server.

**How to apply:** Preserve the ESM imports and dynamic port wiring when editing the build script; verify with `pnpm --filter @workspace/cgpa-target-mobile-app run build`.
