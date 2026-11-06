---
name: Video audio generation
description: Environment-specific behavior when generating audio for video artifacts.
---

Music-generation callbacks may be unavailable when the environment cannot confirm paid-mode access. In that case, use only a fallback allowed by the current video skill and be transparent about the audio source.

**Why:** The music callback was blocked by a paid-mode check during this project's film build, so the video used a locally synthesized instrumental bed instead.

**How to apply:** Check the current media-generation guidance when a callback is blocked; do not claim callback-generated audio if a fallback was used.
