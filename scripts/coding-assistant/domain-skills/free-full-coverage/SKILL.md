---
name: free-full-coverage
description: Use every free local tool to test an app across browsers, devices, and OS guests. Trigger when asked to fully test, cover all platforms, or run the free emulator stack.
---

# Free full-coverage testing

Run the free local stack. Do not call paid cloud grids. Report what ran and what was skipped because the tool is missing.

## 1. Browser engines (Playwright)

Install once:
```
pnpm exec playwright install chromium firefox webkit
```

Projects to run:
- Chromium (Chrome / Edge engine)
- Firefox
- WebKit (Safari approximation)
- Edge channel if `msedge` is installed: `channel: "msedge"`
- Device presets: `iPhone 15`, `Pixel 7`, `iPad Pro 11`

Config pattern:
```js
projects: [
  { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  { name: "webkit", use: { ...devices["Desktop Safari"] } },
  { name: "edge", use: { ...devices["Desktop Edge"], channel: "msedge" } },
  { name: "iphone", use: { ...devices["iPhone 15"] } },
  { name: "pixel", use: { ...devices["Pixel 7"] } },
  { name: "ipad", use: { ...devices["iPad Pro 11"] } },
]
```

Capture per target: pass/fail, failing locator, console errors, one screenshot on fail.

## 2. Android (free, local)

- Android Studio AVD (free)
- System image: API 34 or 35, Google APIs
- Boot: `emulator -avd <name> -no-snapshot-load`
- Drive Chrome on the device with Playwright Android or ADB
- Skip if `emulator` or `adb` is not on PATH; say so

## 3. Windows / Mac guests (free VMs)

- Windows host: Hyper-V (Pro) or VirtualBox
- Mac host: UTM (free) or VMware Fusion
- Linux host: KVM/QEMU or VirtualBox
- Use a guest only when the test needs the real OS shell (fonts, drivers, IE mode)
- IE itself is retired; test Edge instead

## 4. Accessibility (free)

- `@axe-core/playwright` on the changed page
- Keyboard path and contrast
- Reduced motion

## 5. Canvas and mini-web (when present)

If the app has a canvas or mini-web test harness:
- Run the harness after the Playwright projects
- Capture its report and attach it to the summary
- Do not invent a harness that is not in the repo

## 6. Report

One table:
- Target | Tool | Result | Note
- List skipped targets and the missing binary
- Never claim "all platforms" if a tool was skipped

## Limits

- WebKit is not real iOS Safari
- Device presets are not the phone OS
- Real iOS Safari needs a Mac or a paid cloud; do not pretend otherwise
- No paid BrowserStack / Sauce / Appetize calls
