# OpenCut AI

An open-source desktop video editor with AI storyboards, screen recording, editable subtitles, effects, transitions and persistent sound assets.

**[Website](https://bennix.github.io/OpenCutAI/) · [Download](https://github.com/bennix/OpenCutAI/releases/latest)**

- macOS Apple Silicon: signed and Apple-notarized DMG.
- Windows x64: NSIS installer, unsigned.
- Linux x64: DEB and RPM built on GitHub Actions.
- Local editing needs no subscription. AI generation requires your own provider/API credentials.
- Screen/system-audio capture support depends on the operating system; Linux Wayland/portal support varies.

## Reliability and balance controls (0.1.9)

AI Settings includes a separate [ZenMux Management API Key](https://zenmux.ai/platform/management), balance/monthly PAYG queries, low-balance alerts and client submission budgets. Version 0.1.9 also adds persistent recording recovery, a generation task journal, safe storage cleanup and selectable continuity frames. Desktop credentials use OS-protected storage and main-process requests. [Setup and practical limits](docs/RELIABILITY.md). These features are included in the 0.1.9 installers.

0.1.9 新增：余额监控与预算设置、录屏持久化恢复、生成任务中心、素材空间与备份、系统保护凭据和续接选帧。[配置与限制说明](docs/RELIABILITY.md)。0.1.9 安装包已包含这些改动。

## AI integration and limits

The current application connects through **[ZenMux](https://zenmux.ai)** (`https://zenmux.ai/api/v1`). Save a **ZenMux API Key** in Settings → ZenMux AI; separate provider keys are not required. Model calls are billed to your ZenMux account. Prompts and reference media leave your device; keys are stored locally and excluded from project exports.

| Use | Preset model IDs | Application behavior |
| --- | --- | --- |
| Video | `minimax/minimax-h3-max` | `/videos`; 5–15 seconds per shot; 480p or 768p (default) |
| Video | `google/gemini-omni-1.1-flash-preview` | `/interactions`; duration and aspect ratio are creative preferences, not guaranteed output constraints |
| Image | `openai/gpt-image-2.5-flare`, `openai/gpt-image-2.5-sunburst`, `google/gemini-3.1-flash-image` | Image generation / Google generateContent routes; dimensions depend on the model |
| Planning | `openai/gpt-6.1-sol`, `anthropic/claude-sonnet-5.5` | `/chat/completions`; editable storyboards and edit plans |

These are presets in the code, **not guaranteed model availability**: check the ZenMux catalog, permissions and balance. You can edit the model list. Storyboard shots span 1–30 seconds and split at configured model limits. Standard video requests validate 1–120 seconds; providers may impose stricter limits. Other models have no universal resolution guarantee. AI output resolution is separate from project/export resolution. Optional last-frame references require a compatible route and do not guarantee continuity.

## Downloads and product focus

- [macOS Apple Silicon DMG](https://github.com/bennix/OpenCutAI/releases/download/v0.1.9/OpenCut-AI-0.1.9-arm64.dmg) — Developer ID signed and Apple notarized.
- [Windows x64 installer](https://github.com/bennix/OpenCutAI/releases/download/v0.1.9/OpenCut-AI-0.1.9-x64-Setup.exe) — unsigned; SmartScreen may warn. Verify the release source and SHA256 checksum.
- Linux x64: [DEB](https://github.com/bennix/OpenCutAI/releases/download/v0.1.9/OpenCut-AI-0.1.9-amd64.deb) / [RPM](https://github.com/bennix/OpenCutAI/releases/download/v0.1.9/OpenCut-AI-0.1.9-x86_64.rpm).
- Landing page: [English](https://bennix.github.io/OpenCutAI/en.html) / [中文](https://bennix.github.io/OpenCutAI/).

OpenCut AI focuses on **screen recording → AI storyboards → timeline editing**, with placeholders, retries and optional frame continuity. It extends OpenCut Classic's editor foundation. CapCut targets broad creator editing/template workflows; Resolve is a stronger fit for professional grading and VFX. This is workflow positioning, not a benchmark or exhaustive feature comparison.

## Development

```sh
bun install
bun run dev:web
bun run dev:desktop
```

## Desktop packaging

```sh
bun run package:desktop
```

Build on the target platform to bundle the correct native dependencies. GitHub's **Desktop release** workflow builds Windows and Linux packages and uploads to an existing release. macOS release signing/notarization happens on the authorized developer's machine; credentials are never committed.

Landing page source lives in `site/` and deploys through GitHub Pages. The application is based on OpenCut Classic and retains its MIT license and notices.

---

# OpenCut (Legacy)

This is the original OpenCut codebase. It's archived and no longer maintained.

The rewrite is happening at [opencut-app/opencut](https://github.com/opencut-app/opencut).

## Sponsors

Thanks to [Vercel](https://vercel.com?utm_source=github-opencut&utm_campaign=oss) and [fal.ai](https://fal.ai?utm_source=github-opencut&utm_campaign=oss) for their support of open-source software.

<a href="https://vercel.com/oss">
  <img alt="Vercel OSS Program" src="https://vercel.com/oss/program-badge.svg" />
</a>

<a href="https://fal.ai">
  <img alt="Powered by fal.ai" src="https://img.shields.io/badge/Powered%20by-fal.ai-000000?style=flat&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMTMuMDkgOC4yNkwyMCAxMEwxMy4wOSAxNS43NEwxMiAyMkwxMC45MSAxNS43NEw0IDEwTDEwLjkxIDguMjZMMTIgMloiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPgo=" />
</a>

## Why?

- **Privacy**: Your videos stay on your device
- **Free features**: Most basic CapCut features are now paywalled 
- **Simple**: People want editors that are easy to use - CapCut proved that

## Project Structure

- `apps/web/`: Next.js web application
- `apps/desktop/`: Native desktop app built with GPUI (in progress)
- `rust/`: Platform-agnostic core: GPU compositor, effects, masks, and WASM bindings. We're actively migrating business logic here from TypeScript.
- `docs/`: Architecture and subsystem documentation

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/docs/installation)
- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

> **Note:** Docker is optional but recommended for running the local database and Redis. If you only want to work on frontend features, you can skip it.

### Setup

1. Fork and clone the repository

2. Copy the environment file:

   ```bash
   # Unix/Linux/Mac
   cp apps/web/.env.example apps/web/.env.local

   # Windows PowerShell
   Copy-Item apps/web/.env.example apps/web/.env.local
   ```

3. Start the database and Redis:

   ```bash
   docker compose up -d db redis serverless-redis-http
   ```

4. Install dependencies and start the dev server:

   ```bash
   bun install
   bun dev:web
   ```

The application will be available at [http://localhost:3000](http://localhost:3000).

The `.env.example` has sensible defaults that match the Docker Compose config — it should work out of the box.

### Desktop setup

Desktop is opt-in. If you're only working on the web app, skip this entirely.

If you want to get ready for `apps/desktop`, see [`apps/desktop/README.md`](apps/desktop/README.md). It's a two-step setup: Rust toolchain first, then desktop native dependencies.

### Local WASM development

Only needed if you're editing `rust/wasm` and want the web app to use your local build instead of the published package.

**Prerequisites** — install these once before anything else:

```bash
# Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# build the WASM package
cargo install wasm-pack

# reruns the build on file changes, used by bun dev:wasm
cargo install cargo-watch
```

1. Build the package once from the repo root:

   ```bash
   bun run build:wasm
   ```

2. Register the generated package for linking:

   ```bash
   cd rust/wasm/pkg
   bun link
   ```

3. Link `apps/web` to the local package:

   ```bash
   cd apps/web
   bun link opencut-wasm
   ```

4. Rebuild on changes while you work:

   ```bash
   bun dev:wasm
   ```

To switch `apps/web` back to the published package, run:

```bash
cd apps/web
bun add opencut-wasm
```

### Self-Hosting with Docker

To run everything (including a production build of the app) in Docker:

```bash
docker compose up -d
```

The app will be available at [http://localhost:3100](http://localhost:3100).

## Contributing

We welcome contributions! While we're actively developing and refactoring certain areas, there are plenty of opportunities to contribute effectively.

**🎯 Focus areas:** Timeline functionality, project management, performance, bug fixes, and UI improvements outside the preview panel.

**⚠️ Avoid for now:** Preview panel enhancements (fonts, stickers, effects) and export functionality - we're refactoring these with a new binary rendering approach.

See our [Contributing Guide](.github/CONTRIBUTING.md) for detailed setup instructions, development guidelines, and complete focus area guidance.

**Quick start for contributors:**

- Fork the repo and clone locally
- Follow the setup instructions in CONTRIBUTING.md
- Working on `apps/desktop`? See [`apps/desktop/README.md`](apps/desktop/README.md) for setup
- Create a feature branch and submit a PR

## License

[MIT LICENSE](LICENSE)

---

![Star History Chart](https://api.star-history.com/svg?repos=opencut-app/opencut&type=Date)

