# Scoreline — Football Analytics & Betting Intelligence

Expo web app for football fixtures, custom stats (72-table engine), and betting intelligence.

## Local development

```bash
npm install
npm run web
```

Open [http://localhost:8081](http://localhost:8081) (or the URL shown in the terminal).

## Build for production (web)

```bash
npm run build
```

Static files are written to `dist/`.

Preview the production build locally:

```bash
npx serve dist
```

## Deploy to Vercel

This project is configured for [Vercel](https://vercel.com) static hosting.

### One-click deploy

1. Push this repo to GitHub, GitLab, or Bitbucket.
2. Import the project in [Vercel Dashboard](https://vercel.com/new).
3. Vercel reads `vercel.json` automatically:
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
   - **Install command:** `npm install`
4. Click **Deploy**.

### CLI deploy

```bash
npm install -g vercel
vercel login
vercel
```

Follow prompts. For production:

```bash
vercel --prod
```

### Requirements

- **Node.js 20+** (see `.nvmrc`)
- No environment variables required for the current mock-data build

### Routes

Static pages are pre-rendered at build time for all leagues and fixtures:

- `/` — home
- `/league/:id` — e.g. `/league/epl`
- `/match/:id` — e.g. `/match/epl_001`
- `/analytics` — analytics hub

## Tech stack

- [Expo](https://expo.dev) SDK 54
- [Expo Router](https://docs.expo.dev/router/introduction/) (static web export)
- React Native Web

## Learn more

- [Expo web docs](https://docs.expo.dev/workflow/web/)
- [Deploy Expo web on Vercel](https://docs.expo.dev/distribution/publishing-websites/)
"# Football-Analytics-" 
