---
name: canvas-mini-web
description: Run canvas and mini-web test harnesses when the app ships them. Trigger when those harnesses exist or the user says they are coming in.
---

# Canvas and mini-web

When the app includes a canvas test or a mini-web harness:

1. Locate the harness (`canvas.test`, `mini-web`, or the path the user names).
2. Run it after the free browser projects.
3. Capture its exit code, the assertion that failed, and any screenshot it writes.
4. Add a row to the free-full-coverage report.
5. If the harness is not present yet, say "canvas/mini-web not in this build" and continue.

Do not stub a fake harness. Wait for the real one.
