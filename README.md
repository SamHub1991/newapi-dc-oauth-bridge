# New API + dc.hhhl.cc OAuth Bridge

Integrated deployment of [New API](https://github.com/QuantumNous/new-api) with a custom OAuth bridge for `dc.hhhl.cc` (Misskey/Sharkey MiAuth) login.

## Repository Structure

```text
/
├── README.md               ← This file: system overview and deployment guide
├── dc-oauth/               ← OAuth bridge project
│   ├── server.js           ← Main entry (Node.js, no npm dependencies)
│   ├── README.md           ← Bridge-specific documentation
│   ├── mysql-upsert.sql    ← Database configuration SQL
│   ├── nginx.conf.example  ← Reverse proxy example
│   ├── env.example         ← Environment variable template
│   └── start.sh            ← Quick start script
└── ...                     ← New API source code
```

## Quick Start

### 1. Deploy New API

```bash
docker run --name new-api -d --restart always \
  -p 3000:3000 \
  -e SQL_DSN="newapi:NewApi2024!@tcp(mysql:3306)/newapi" \
  -e TZ=Asia/Shanghai \
  calciumion/new-api:latest
```

### 2. Configure the Database

Connect to the MySQL database and run:

```bash
mysql -u newapi -p'NewApi2024!' newapi < dc-oauth/mysql-upsert.sql
```

Edit the SQL file first to replace `https://api.example.com` with your actual New API public URL.

### 3. Start the OAuth Bridge

```bash
cd dc-oauth
cp env.example .env
# Edit .env with your actual URLs
./start.sh
```

The bridge listens on port 3001 by default.

## Architecture

```text
User ──► New API (port 3000) ──► /dc-oauth/authorize
                                    │
                                    ▼
                          dc-oauth Bridge (port 3001)
                                    │
                                    ▼
                          dc.hhhl.cc (Misskey/Sharkey MiAuth)
                                    │
                                    ▼
                          dc-oauth Bridge ──► New API callback
```

Flow:
1. User clicks "Login with dc.hhhl.cc" on New API
2. New API redirects to `/dc-oauth/authorize`
3. Bridge creates a MiAuth session, redirects user to `dc.hhhl.cc`
4. User authorizes on `dc.hhhl.cc`
5. `dc.hhhl.cc` redirects back to `/dc-oauth/callback`
6. Bridge validates session, creates OAuth code, redirects to New API
7. New API exchanges code at `/dc-oauth/token` and fetches profile at `/dc-oauth/userinfo`
8. User is logged in

## Environment Variables

See `dc-oauth/env.example` for the full list. Key fields:

| Variable | Description | Example |
|----------|-------------|---------|
| `PUBLIC_BASE_URL` | Public URL of the bridge (include `/dc-oauth`) | `https://api.example.com/dc-oauth` |
| `NEWAPI_BASE_URL` | Public URL of New API | `https://api.example.com` |
| `MISSKEY_ORIGIN` | Misskey/Sharkey instance URL | `https://dc.hhhl.cc` |
| `SERVICE_NAME` | Display name on MiAuth page | `New API` |

## Deployment Modes

### Mode A: Separate Domains (Preview)

```text
New API:       https://3000-example.preview
OAuth Bridge:  https://3001-example.preview/dc-oauth
```

Set `PUBLIC_BASE_URL` and `NEWAPI_BASE_URL` accordingly. No reverse proxy needed.

### Mode B: Same Domain with Reverse Proxy (Production)

```text
https://api.example.com/          → New API (port 3000)
https://api.example.com/dc-oauth/ → OAuth Bridge (port 3001)
```

Use the Nginx configuration in `dc-oauth/nginx.conf.example`. Both services share one domain.

## New API OAuth Provider Configuration

After running `mysql-upsert.sql`, configure a custom OAuth provider in New API:

```text
Provider name:     dc.hhhl.cc
Slug:              dc-hhhl-cc
Client ID:         placeholder
Client Secret:     placeholder
Scopes:            read:account
```

Endpoint configuration:

```text
Authorization Endpoint: https://api.example.com/dc-oauth/authorize
Token Endpoint:         https://api.example.com/dc-oauth/token
User Info Endpoint:     https://api.example.com/dc-oauth/userinfo
```

Field mapping:

```text
User ID field:       id
Username field:      usernyame
Display name field:  display_nyame
Email field:         (leave empty)
```

Set New API `ServerAddress` to your public New API URL in the Admin Settings.

## Health Check

```bash
curl -fsS https://api.example.com/dc-oauth/health
```

Expected response:

```json
{"ok": true, "service": "dc-oauth", "misskey": "https://dc.hhhl.cc"}
```

## For More Details

- Bridge-specific details: [dc-oauth/README.md](./dc-oauth/README.md)
- New API documentation: [Official Docs](https://docs.newapi.pro/en/docs)
