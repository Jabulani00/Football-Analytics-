# Playwright production acceptance tests

This suite automates the repeatable parts of the Stream C production checklist
against `https://football-analytics-rose.vercel.app`.

## Efficient defaults

- Uses the Microsoft Edge already installed on Windows; no Playwright browser
  download is required.
- Runs one worker serially to limit CPU, network traffic, and provider requests.
- Keeps video off and creates screenshots and traces only when a test fails.
- Writes a small machine-readable summary to `e2e-results/summary.json` and a
  browsable report to `e2e-results/html/`. The whole folder is gitignored.
- Marks live-data shortages as `data-dependent` annotations instead of hiding
  them or inventing data.

## Run

From the repository root:

```powershell
npm.cmd run test:e2e:production
```

Watch the browser if diagnosing a failure:

```powershell
npm.cmd run test:e2e:production:headed
```

Open the latest HTML report:

```powershell
npm.cmd run test:e2e:report
```

To test another deployment without changing code:

```powershell
$env:E2E_BASE_URL = 'https://your-preview.example'
npm.cmd run test:e2e:production
```

## Covered

- Production page, navigation, bundle configuration, and frontend secret scan.
- Public no-key Hunt GET, CORS preflight, and rejected secretless crawler POST.
- Hollywood Hunt database/crawler status and live navigation controls.
- Odds Fusion evidence, edge, opinion, and bookmaker-comparison presentation.
- Strategy validation, save/remove, and same-browser persistence.
- Shared bet-slip persistence, accumulator/singles arithmetic, and export gating.
- Hollywood proxy reachability and a mobile-width smoke test.

The suite intentionally does not place a bet or create an external Hollywoodbets
booking reservation. Those are external side effects and remain a short manual
review step.
