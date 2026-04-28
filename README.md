# dvadsatjeden.org community solution skeleton

This repository contains implementation skeleton for:
- WordPress plugin (`wp-content/plugins/dvadsatjeden-community`)
- API service (`services/community-api`)
- Web app (`apps/community-web`)

## Quick start

### API service
```bash
cd services/community-api
npm install
npm run dev
```

### Web app
```bash
cd apps/community-web
npm install
npm run build:wp
```

### WordPress plugin
Copy `wp-content/plugins/dvadsatjeden-community` into WordPress, activate plugin, then configure:
- API Base URL
- source URLs
- feature flags

## Contracts and flows
- API contracts: `docs/API_CONTRACTS.md`
- Seed account flow: `docs/SEED_ACCOUNT_FLOW.md`
- Rollout phases: `docs/ROLLOUT_PHASES.md`
