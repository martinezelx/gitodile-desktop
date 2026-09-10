# App-update signature fixtures

These fixtures use the public test key from the official
`tauri-plugin-updater` 2.11.0 integration test. They contain no GitOdile
production secret and cannot sign a production release. `payload.txt.sig` is
valid for `payload.txt`; `payload-invalid.sig` is deliberately altered.
