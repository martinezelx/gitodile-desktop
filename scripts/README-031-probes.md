# Desktop measurement probes

These drive a packaged GitOdile build over the Chrome DevTools Protocol to
collect the numbers in
[`docs/architecture/023-performance-baseline.md`](../docs/architecture/023-performance-baseline.md).
They are development tooling and are deliberately **not** wired into
`pnpm run check:frontend` or CI: they need a release build, a real window and a
fixture repository.

## Dependency

`playwright-core` is not a project dependency, because nothing in the shipped
app or the normal test suite needs it. Install it ad hoc outside the repository
and run the probes with it on `NODE_PATH`:

```bash
mkdir -p /tmp/gitodile-probe && cd /tmp/gitodile-probe && npm init -y && npm install playwright-core
```

No browser download is required: the probes attach to the app's own WebView2
over CDP rather than launching a browser.

## Running

Build and launch with remote debugging and Git process tracing enabled:

```bash
pnpm tauri build --no-bundle
```

Then launch `src-tauri/target/release/gitodile.exe` with
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` and
`GIT_TRACE2_EVENT=<absolute path to a .jsonl file>`. Git writes one
`"event":"version"` line per process it starts, which is how the probes count
native process cost without instrumenting the app.

| Probe | Reports |
| --- | --- |
| `031-cdp-probe.cjs <endpoint> <projectPath> <tracePath>` | first-diff latency, 60 warm switch samples, visible DOM counts, console errors |
| `031-ipc-process-probe.cjs <endpoint> <projectPath> <tracePath>` | Git processes started per IPC command |
| `031-memory-probe.cjs <endpoint> <projectPath> <mode> <treeScript>` | settled process-tree memory; `mode` is `overview-only` or `all-screens` |

`031-process-tree.ps1` is the scoped sampler the memory probe shells out to. It
walks `Win32_Process` parent links from `gitodile.exe`, because a machine-wide
`msedgewebview2` query also captures unrelated WebView2 hosts — during the task
031 audit that inflated a reading from 405 MiB to 720 MiB.

## Two traps

- **Pass the project path in Windows backslash form.** The app stores and renders
  `C:\Users\...`; a forward-slash argument makes the probe's readiness wait time
  out against a perfectly healthy app.
- **`browser.close()` terminates the app**, because the CDP session owns the
  WebView. The memory and IPC probes deliberately leave the connection open so a
  second measurement can run against the same launch.
