# SiteScope

Website quality inspection without a traditional backend. The UI is a static Next.js export on GitHub Pages; background analysis runs in GitHub Actions with Playwright, Lighthouse, and axe-core.

**Repository:** [meowdule/SiteScope](https://github.com/meowdule/SiteScope)

## How it works

1. User enters a URL and clicks **Analyze**.
2. The browser runs instant checks (DNS via Cloudflare DNS-over-HTTPS, URL validation).
3. A request JSON file is created in `requests/{report-id}.json` via the GitHub Contents API (token stored locally in the browser).
4. Pushing that file triggers the **SiteScope analyze and publish** workflow.
5. The workflow crawls the site (real Chromium, `networkidle`, post-render link extraction, depth 2, max 30 pages), runs Lighthouse and axe per page, captures screenshots at three viewports, and writes `public/reports/{id}/`.
6. The workflow builds the static site, commits report artifacts, and deploys `out/` to GitHub Pages.
7. The UI polls `reports/{id}/status.json` and redirects to the report when `phase` is `complete`.

## GitHub configuration

### Pages

Enable **GitHub Pages** with source **GitHub Actions**.

### Repository variables (recommended)

In **Settings → Secrets and variables → Actions → Variables**, add:

| Variable | Value | Notes |
|----------|--------|--------|
| `NEXT_PUBLIC_GITHUB_REPO` | `meowdule/SiteScope` | Optional; defaults to `github.repository` in workflows |
| `NEXT_PUBLIC_BASE_PATH` | `/SiteScope` | Optional; defaults to `/{repository.name}` |

These are injected at build time in `.github/workflows/pages.yml` and `analyze-and-publish.yml`. They are **not** secrets (they are embedded in the static client bundle).

### User token (browser)

Each visitor stores a **personal access token** in Settings (localStorage only) with **Contents: write** on `meowdule/SiteScope` so analyses can be queued. This is separate from Actions variables.

## Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `pages.yml` | Push to `main` (except `requests/**`) | Build with env vars and deploy the app |
| `analyze-and-publish.yml` | Push to `requests/**` | Run crawler, commit reports, build, deploy |

## Local development

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
npm install
npx playwright install chromium
npm run dev
```

Run a full analysis locally:

```bash
npm run analyze:local -- --report-id=test-1 --target-url=https://example.com
npm run build
```

## Project layout

- `app/` — Next.js pages (static export)
- `components/` — UI (analyze form, report dashboard)
- `lib/` — client helpers (config, queue, poll, validation)
- `scripts/analysis/` — crawler, Lighthouse, axe, UI rules, HTML generator
- `requests/` — analysis queue (JSON, triggers workflow on push)
- `public/reports/` — generated reports (served as static files)

## Notes

- Default repository in code: `meowdule/SiteScope` (`lib/config.ts`).
- Production builds use GitHub Actions variables; local dev uses `.env.local`.
- The crawler waits for `networkidle`, scrolls the page, and re-extracts links after JavaScript runs so SPAs are included.
- No GitHub Issues, Actions UI, or repository chrome is shown in the product UI.
