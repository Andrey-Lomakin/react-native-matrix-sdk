# Mobile app Matrix SDK fork
Verified: 2026-09-24 — checked against `fork/0.10.0` source and the mobile app's build and device journal; the final iOS generator post-process was not rerun from clean after its script fix.

This fork starts from upstream `react-native-matrix-sdk` 0.10.0 and uses `matrix-rust-sdk` 0.18.0 (`ubrn.yaml`, `crate.rev`). The mobile app ships `@unomed/react-native-matrix-sdk` as a prebuilt archive in `mobile_app/vendor/`. The current package is `0.10.0-fork.11`. The installed archive and app build, rather than this checkout alone, determine runtime behavior. The app's acceptance and measurement records live in `mobile_app/docs/matrix-sdk-slimming.md` and `mobile_app/docs/matrix-sdk-slimming-measurements.md`.

## What changed

`package.json` (`ubrn:checkout`) applies the Rust patches below in order whenever native bindings are generated. `ubrn.yaml` pins the upstream Rust revision. Keep the patches separate so a failure can be attributed to one change.

| Patch | Removed or changed | Reason and boundary |
| --- | --- | --- |
| `matrix-rust-sdk-ffi-pruning.patch` | Unused FFI for QR login, widgets, spaces, session verification, room directory search, live locations, identity status, and selected client/room methods | Shrinks the binding surface while retaining the APIs used by the app. |
| `matrix-rust-sdk-optional-encryption-sync.patch` | Adds `with_encryption_sync` to the sync service; default stays enabled | The app disables this extra sync when its E2EE setting is off. This does not remove the encryption feature or encrypted-room support from the SDK. |
| `matrix-rust-sdk-disable-search.patch` | `experimental-search` | The app does not use SDK search. |
| `matrix-rust-sdk-disable-recent-emojis.patch` | `experimental-element-recent-emojis` | The app does not use the SDK's recent-emoji feature. |
| `matrix-rust-sdk-disable-widgets.patch` | `experimental-widgets` | The app does not embed Matrix widgets. |
| `matrix-rust-sdk-disable-socks.patch` | `socks` | The app does not configure a SOCKS proxy. |
| `matrix-rust-sdk-disable-federation-api.patch` | `federation-api` and unused `server_vendor_info` FFI | The app uses client-server messaging, not this federation API. |
| `matrix-rust-sdk-disable-markdown.patch` | Rust `markdown` feature and unused Markdown message constructors | Plain text and media captions remain; automatic Markdown formatting is removed. |

`unstable-msc4274` stays enabled for the app's gallery upload path. `e2e-encryption` remains because the 0.18.0 FFI still depends on it. `experimental-push-secrets` remains in the FFI defaults. The app also applies `SqliteStoreBuilder.systemIsMemoryConstrained()` in its own Matrix client construction; that policy is not part of this SDK package. Its measured total PSS effect was within noise, so no RAM reduction is claimed from it. The Android build command in `package.json` renames the weak `sdallocx` reference to avoid an RN native symbol collision.

## Local release build on macOS

Use this checkout (`react-native-matrix-sdk-0.10.0`, branch `fork/0.10.0`) and the matching toolchain. The earlier `react-native-matrix-sdk` checkout contains an experimental fork and is not the source of the shipped package. `ubrn.yaml` currently builds Android arm64 and iOS device plus arm64/x86_64 simulator slices. Build Android first: the iOS generator also regenerates the shared TypeScript bindings. `ubrn:checkout` resets the generated Rust checkout and reapplies the committed patches, so do not put uncommitted edits there.

```sh
cd /path/to/allo/react-native-matrix-sdk-0.10.0
yarn install --frozen-lockfile
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_NDK_HOME="$ANDROID_HOME/ndk/27.1.12297006"
RNMS_SKIP_BINARY_DOWNLOAD=1 yarn generate:release:android
RNMS_SKIP_BINARY_DOWNLOAD=1 CARGO_FEATURE_NO_NEON=1 yarn generate:release:ios
yarn prepare
yarn typecheck
npm pack --ignore-scripts --pack-destination /private/tmp
```

Use the installed NDK version if it differs from the example. The iOS generator creates `build/RnMatrixRustSdk.xcframework` and generated Swift. Its post-process deliberately does not run Pods for the SDK example; the consuming app installs its own Pods. `scripts/trim-generated-swift.js` removes trailing whitespace from generated Swift. If a native build fails, stop before packing; an older binary may still exist locally.

Use `npm pack`, not `yarn pack`: in this checkout `yarn pack` omits the ignored `build/` directory even though `package.json` lists the framework. Verify the archive before copying it into the app:

```sh
archive=/private/tmp/unomed-react-native-matrix-sdk-0.10.0-fork.11.tgz
tar -tzf "$archive" | rg 'package/(android/src/main/jniLibs/arm64-v8a/libmatrix_sdk_ffi.so|build/RnMatrixRustSdk.xcframework/.*/libmatrix_sdk_ffi.a|swift/matrix_sdk_ffi.swift)'
shasum -a 256 "$archive"
cp "$archive" ../mobile_app/vendor/react-native-matrix-sdk-0.10.0-fork.11.tgz
```

Check that the archive lists the Android library, iOS device and simulator framework slices, and Swift binding. For a new build, increment `package.json`'s `fork.N` version and use a new archive name; update the app's exact `file:vendor/...` dependency and lockfile. Keep the prior working archive until the new app build passes. The `postinstall` binary downloader is not a build verifier: it can exit successfully after a download failure, so inspect the archive itself.

In `mobile_app`, install the local package, run `npm run check -- --force`, build Android DevRelease and iOS DevRelease, then verify the installed builds on devices. The Android and iOS commands, binary hashes, smoke results, regression gates, and remaining A/B performance work are recorded in `docs/matrix-sdk-slimming.md` there. For Xcode 27, use CocoaPods 1.16.2 from Ruby 3.3.6 when installing the app's Pods; the system CocoaPods 1.15.2 failed on the synchronized Xcode project group. Do not infer CPU, FPS, APK size, or RAM gains from a smaller Rust feature set: run the app's performance protocol after functional acceptance.
