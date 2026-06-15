# newapi-dc-oauth-bridge

OAuth bridge for integrating `dc.hhhl.cc` Misskey/Sharkey MiAuth login with New API custom OAuth.

This project exposes OAuth-like endpoints for New API and translates the login flow to Misskey/Sharkey MiAuth.

## Features

- Supports New API custom OAuth provider configuration.
- Converts MiAuth authorization into OAuth-style `code`, `access_token`, and `userinfo` flow.
- Uses Node.js built-in modules only, with no npm dependencies.
- Supports separate-domain preview deployment and same-domain reverse proxy deployment.
- Keeps short-lived state in memory and avoids exposing the raw MiAuth token to New API.

## Endpoints

The bridge serves these endpoints under `/dc-oauth`:

```text
/dc-oauth/authorize
/dc-oauth/callback
/dc-oauth/token
/dc-oauth/userinfo
/dc-oauth/health
```

## Requirements

- Node.js 18 or newer.
- A running New API instance.
- A public URL for this bridge service.

## Quick Start

```bash
# Copy and edit environment variables
cp env.example .env

# Start the bridge
./start.sh
```

The service listens on `PORT`, defaulting to `3001`.

## Environment Variables

```text
HOST=0.0.0.0
PORT=3001
PUBLIC_BASE_URL=https://api.example.com/dc-oauth
NEWAPI_BASE_URL=https://api.example.com
MISSKEY_ORIGIN=https://dc.hhhl.cc
SERVICE_NAME=New API
STATE_TTL_MS=600000
```

Field descriptions:

```text
HOST              Bind address.
PORT              Local service port.
PUBLIC_BASE_URL   Public bridge URL, including /dc-oauth.
NEWAPI_BASE_URL   Public New API URL.
MISSKEY_ORIGIN    Misskey/Sharkey instance URL.
SERVICE_NAME      Display name shown on MiAuth authorization page.
STATE_TTL_MS      Temporary state/code/token TTL in milliseconds.
```

## New API Configuration

Add a custom OAuth provider in New API:

```text
Provider name: dc.hhhl.cc
Slug: dc-hhhl-cc
Client ID: placeholder
Client Secret: placeholder
Scopes: read:account
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
Email field:         leave empty
```

Set New API `ServerAddress` to the public New API URL:

```text
https://api.example.com
```

## Deployment Modes

### Separate Port

Use this mode for preview environments.

```text
New API:       https://3000-example.preview
OAuth Bridge:  https://3001-example.preview/dc-oauth
```

Set:

```text
PUBLIC_BASE_URL=https://3001-example.preview/dc-oauth
NEWAPI_BASE_URL=https://3000-example.preview
```

### Same Domain With Reverse Proxy

Use this mode for production deployments.

```text
https://api.example.com/          -> New API
https://api.example.com/dc-oauth/ -> OAuth Bridge
```

Set:

```text
PUBLIC_BASE_URL=https://api.example.com/dc-oauth
NEWAPI_BASE_URL=https://api.example.com
```

See `nginx.conf.example` for an example reverse proxy configuration.

## Health Check

```bash
curl -fsS https://api.example.com/dc-oauth/health
```

Expected response:

```json
{
  "ok": true,
  "service": "dc-oauth",
  "misskey": "https://dc.hhhl.cc"
}
```

## How It Works

1. New API redirects the user to `/dc-oauth/authorize`.
2. The bridge creates a MiAuth session and redirects the user to `dc.hhhl.cc`.
3. `dc.hhhl.cc` redirects back to `/dc-oauth/callback` after authorization.
4. The bridge validates the MiAuth session, creates a temporary OAuth `code`, and redirects back to New API.
5. New API exchanges the `code` at `/dc-oauth/token`.
6. New API fetches profile data from `/dc-oauth/userinfo`.

## Notes

- This bridge stores temporary login state in memory. Running multiple bridge instances requires shared state or sticky sessions.
- Restarting the bridge clears active login sessions.
- New API may cache custom OAuth providers. Restart New API after direct database updates.
- Configure HTTPS in production.

## License

MIT
