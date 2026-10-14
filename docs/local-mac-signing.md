# Persistent identity for local Mac builds

MistaRecorda's ad-hoc development builds have a code requirement tied to a specific build hash. Replacing one with another can invalidate Screen Recording, Accessibility and Microphone approvals, even while System Settings still shows an enabled entry. Rebooting or Full Disk Access does not repair the identity mismatch.

For local development, create a **MistaRecorda Local Development** code-signing identity using Keychain Access → Certificate Assistant → Create a Certificate. Use Self Signed Root and Code Signing, and keep its private key in the login Keychain. This is a one-time, user-approved Keychain change. It is for local testing, not public distribution. If trust is needed, scope it to Code Signing; leave other certificate trust policies at their defaults.

After the renderer, main process and native helpers have been built, run:

```sh
npm run package:local:mac
npm run smoke:packaged-binaries
```

The packaging command requires that exact identity (or an existing identity explicitly selected with `CSC_NAME`). It fails instead of silently using an ad-hoc signature. It verifies the resulting bundle and refuses a hash-only designated requirement. It does not install the app, reset permissions, change Keychain trust, or modify operating-system security settings.

Use the same certificate and bundle identifier for subsequent updates. Switching from the current ad-hoc identity to this identity still requires a fresh approval. Verify continuity with a second signed build before claiming the repeated-update prompt is resolved. Keep the certificate; replacing it recreates the same problem. Public releases should use an Apple Developer ID certificate and notarization.

References: [Apple code-signing requirements](https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements), [Apple's self-signed development identity procedure](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/Procedures/Procedures.html), [electron-builder v26 signing options](https://www.electron.build/v26/docs/mac/).
