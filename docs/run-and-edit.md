# Run or edit MistaRecorda

You can use an installer for everyday recording and keep a separate source checkout for editing. Installing the app does not prevent you from changing the source or building your own version. The source remains in this repository under the existing AGPL license.

## Install and run

Use the [ready-to-download installers on the repository home page](../README.md#download-mistarecorda) for everyday use. You do not need developer tools to run them.

To build a fresh set, use the **Build Electron App** GitHub Actions workflow:

1. Open [Actions → Build Electron App](https://github.com/nikooo11/MistaRecorda/actions/workflows/build.yml).
2. Click **Run workflow**, choose `main`, and leave **Installers to build** set to `desktop` for Windows and both Mac architectures. You can also choose just `windows` or `macos`.
3. Wait for the requested jobs to succeed. Open that run and download the relevant **Artifact** at the bottom. GitHub requires a signed-in account to download Actions artifacts. Unzip the artifact first.

| Computer | Artifact | Installer inside |
| --- | --- | --- |
| Windows 10 build 19041+ / Windows 11, Intel or AMD 64-bit | `windows-x64-release` | `MistaRecorda-windows-x64.exe` |
| Apple Silicon Mac (M1/M2/M3/M4 and later), macOS 14+ | `macos-arm64-release` | `MistaRecorda-arm64.dmg` |
| Intel Mac, macOS 14+ | `macos-x64-release` | `MistaRecorda-x64.dmg` |

On Windows, run the `.exe` installer and launch **MistaRecorda** from Start. On Mac, open the `.dmg`, drag **MistaRecorda** into Applications, then launch it from Applications. Windows ARM is not a native build target here.

These development builds are unsigned on Windows and ad-hoc signed on Mac; they are not Apple-notarized. The operating system may ask you to approve an app from an unidentified developer. For a Mac download you trust, try opening it once, then use System Settings → Privacy & Security → **Open Anyway** if offered. On Windows, inspect the source of the download before using SmartScreen's **More info → Run anyway** if offered. Managed computers may require administrator approval. Do not disable system-wide protection.

Allow screen/system-audio and microphone access when prompted. On Mac, the zoom hotkey also needs Accessibility/Input Monitoring permission. Supply your ElevenLabs key in Voice Change on your own machine; installer builds do not include your key. Basic recording/editing does not require ElevenLabs.

Artifacts are retained for 30 days; run the workflow again to create a fresh build. It does not automatically publish a GitHub Release or update an installed app. For wider distribution, use the existing signed release workflow after configuring the required signing credentials.

## Edit the application

Install these prerequisites once on the computer where you will edit/build:

- **Both systems:** Git, Node.js 22 or newer (Node 22 is used by the installer workflow), Python 3.11, and CMake.
- **Mac:** Xcode Command Line Tools (`xcode-select --install`). Install CMake using your preferred package manager or the CMake installer.
- **Windows:** Visual Studio 2022 Build Tools with **Desktop development with C++**, the Windows SDK, and CMake tools. Reopen your terminal after installation so the tools are on PATH.

Clone the source, install its dependencies and launch the development app:

```sh
git clone https://github.com/nikooo11/MistaRecorda.git
cd MistaRecorda
npm ci
npm run dev
```

The first `npm ci` also builds the native capture, keyboard and caption helpers, so it takes longer than later starts. Use a separate checkout/dependency install on each operating system; do not copy `node_modules` between Mac and Windows. After setup, only `npm run dev` is needed to start editing. Stop it with Ctrl+C.

Open the folder in VS Code or another editor. Useful starting points:

- `src/components/`: interface, recorder and video editor.
- `electron/ipc/zoom/`: held/tapped zoom behavior and target window.
- `electron/ipc/voice/`: microphone-only voice processing and presets.
- `src/components/board/`: desktop/tablet drawing interface.
- `electron/board/`: persistent scenes, companion pairing and MCP tools.
- `docs/skills/mistarecorda-board/`: instructions that teach Codex to prepare diagrams.
- `electron/native/`: native Mac/Windows capture helpers.
- `electron-builder.json5`: installer names and packaging.

The development interface reloads during editing; restart or rebuild native helpers after changing native code. Save changes in Git so they can be reviewed and rebuilt. To validate code changes, run `npm run typecheck` and `npm test`.

## Build an installer locally

Build on the matching operating system after `npm ci`:

```sh
# Windows x64
npm run build:win -- --x64 --publish never

# Apple Silicon Mac (development signing)
npm run build:mac -- --arm64 --config.mac.identity=- --publish never

# Intel Mac (development signing)
npm run build:mac -- --x64 --config.mac.identity=- --publish never
```

The files appear in `release/`. Use **Build Electron App** if you do not have both operating systems available. The workflow runs each platform's native build and checks packaged executables, FFmpeg and native helper files; it does not replace a real recording/playback/export test on your computer.

See the illustrated [drawing board, iPad and Codex guide](drawing-board.md), [recording zoom guide](hold-to-zoom.md) and [Voice Change guide](voice-change.md) for usage and the remaining native-platform acceptance checks.
