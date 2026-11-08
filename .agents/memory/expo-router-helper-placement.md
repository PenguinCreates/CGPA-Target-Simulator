---
name: Expo Router helper placement
description: Keep shared logic and other non-screen modules outside Expo Router's route directory.
---

Place shared calculation and helper modules outside the Expo Router `app/` directory. Files in `app/` are treated as routes; a helper without a default component can produce route-validation warnings and an empty preview.

**Why:** Expo Router registered a pure calculation module as a route and the browser preview rendered blank.

**How to apply:** Put reusable non-screen code in a sibling directory such as `lib/`, then import it from route components.
