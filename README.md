# SiteScope

Website quality inspection without a traditional backend. The UI is a static Next.js export on GitHub Pages; background analysis runs in GitHub Actions with Playwright, Lighthouse, and axe-core.

**Live site:** https://meowdule.github.io/SiteScope/  
**Repository:** https://github.com/meowdule/SiteScope

## How it works

1. User enters a URL and clicks **Analyze** (instant DNS/URL checks run in the browser).
2. The app triggers a **repository_dispatch** event (production) or opens a prefilled GitHub issue (fallback).
3. **`queue-request.yml`** creates `requests/{id}.json` and `public/reports/{id}/status.json`, then pushes.
4. **`analyze-and-publish.yml`** runs on `requests/**` push: crawls the site, generates the report, commits artifacts, builds, and deploys Pages.
5. The UI polls `reports/{id}/status.json` and redirects to `/report?id={id}` when complete.

## GitHub secrets (required)

In **Settings → Secrets and variables → Actions → Secrets**:

| Secret | Purpose |
|--------|---------|
| `GH_PAT` | Commits queue files and report artifacts from Actions (contents write). |
| `QUEUE_DISPATCH_TOKEN` | Classic PAT with `repo` scope (or fine-grained with metadata + contents). Injected at build so the static app can call `repository_dispatch` — **not** shown in the UI. |

Optional **Variables**:

| Variable | Default |
|----------|---------|
| `NEXT_PUBLIC_GITHUB_REPO` | `github.repository` |
| `NEXT_PUBLIC_BASE_PATH` | `/SiteScope` |

Enable **GitHub Pages** with source **GitHub Actions**. Enable **Issues** on the repo for the fallback queue flow.

## Workflows

| Workflow | Trigger | Role |
|----------|---------|------|
| `queue-request.yml` | `repository_dispatch` / `workflow_dispatch` | Create request + initial status |
| `queue-from-issue.yml` | Issue opened `[SiteScope] …` | Fallback queue (no dispatch token) |
| `analyze-and-publish.yml` | Push to `requests/**` | Crawl, report, deploy |
| `pages.yml` | Push to `main` (except `requests/**`) | Deploy app only |

## Local development

```bash
cp .env.example .env.local
npm install
npx playwright install chromium
npm run dev
```

```bash
npm run analyze:local -- --report-id=test-1 --target-url=https://example.com
npm run build
```

## Security notes

- No PAT or tokens in the browser UI or `localStorage`.
- `GH_PAT` is used only inside GitHub Actions.
- `QUEUE_DISPATCH_TOKEN` is embedded in the static bundle at build time (required for one-click Analyze on GitHub Pages). Rotate it if exposed.
