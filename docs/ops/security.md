# Security Hardening

This page covers steps to harden a spieli deployment for production. The default configuration is designed for getting started quickly — some defaults should be changed before exposing an instance to the internet.

## Checklist

- [ ] Change the database password
- [ ] Enable HTTPS with a reverse proxy
- [ ] Restrict database network exposure
- [ ] Review nginx security headers
- [ ] Keep images up to date

---

## Database password

The default `POSTGRES_PASSWORD` in `.env.example` is `change-me`. Set a strong random password before starting the stack for the first time:

```bash
openssl rand -base64 32   # generate a strong password
```

Edit `.env`:

```env
POSTGRES_PASSWORD=your-generated-password
```

The password is used only internally between PostgREST and PostgreSQL — it never leaves the Docker network. Still, a default password is a risk if the database port is accidentally exposed.

## HTTPS with a reverse proxy

The Docker stack listens on plain HTTP (port `APP_PORT`, default 8080). In production, put an HTTPS-terminating reverse proxy in front of it.

### Traefik (recommended)

Use the bundled installer — it configures Traefik with Let's Encrypt and handles certificate issuance and renewal automatically:

```bash
curl -fsSL https://raw.githubusercontent.com/mfuhrmann/spieli/main/deploy/traefik/install-traefik.sh -o install-traefik.sh
bash install-traefik.sh
```

See [HTTPS setup](https-setup.md) for the full walkthrough.

### Caddy (alternative)

```caddyfile
playground.example.com {
    reverse_proxy localhost:8080
}
```

Caddy handles HTTPS automatically with Let's Encrypt.

## Restrict database port exposure

The `compose.yml` does not publish the PostgreSQL or PostgREST ports to the host — only the app container's `APP_PORT` is published. Verify with:

```bash
docker compose ps
```

The `db` and `postgrest` services should show no host port bindings. If you see `0.0.0.0:5432->5432/tcp`, your database is accessible from the network. Remove the `ports:` entry for the `db` service from your compose file.

## nginx security headers

The bundled `oci/app/nginx.conf` includes a Content Security Policy and several other security headers:

```
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(self)
Content-Security-Policy: default-src 'self'; script-src 'self'; …
```

Review these headers against your deployment's needs. The CSP allows:
- `img-src: self data: https:` — required for OpenLayers tile loading and wiki images
- `connect-src: self https:` — required for Overpass, Nominatim, Panoramax, Mangrove
- `frame-src panoramax.xyz api.panoramax.xyz` — required for Panoramax photo embedding
- `frame-ancestors: self https:` — allows the app to be embedded in a Hub over HTTPS

## External service dependencies

spieli calls several third-party services at runtime. Your users' browsers make direct requests to:

| Service | What is sent |
|---|---|
| Nominatim | Search query text, IP address |
| CartoDB | Map tile coordinates, IP address |
| Panoramax | Photo UUID, IP address (if photos viewed) |
| Mangrove.reviews | Playground osm_id (if reviews opened) |
| Geofabrik | Nothing — server-side download only |

No personal data, user accounts, or tracking pixels are added by spieli itself. See [External Services](../reference/external-services.md) for the full list.

## CORS for Hub data-nodes

Data-nodes (`data-node-ui` mode) respond with `Access-Control-Allow-Origin: *` on all `/api/` endpoints. This is intentional — the Hub's browser must be able to query data-nodes cross-origin. If you want to restrict CORS to specific Hub origins, edit the `add_header Access-Control-Allow-Origin` lines in `oci/app/nginx.conf` before building your image.

## Keeping images up to date

Pin a specific version tag in `compose.yml` and update regularly:

```yaml
image: ghcr.io/mfuhrmann/spieli:0.4.1   # pin a version
```

Subscribe to [GitHub Releases](https://github.com/mfuhrmann/spieli/releases) to be notified of new versions.

## See also

- [Configuration reference](configuration.md) — `POSTGRES_PASSWORD` and all env vars
- [Upgrading](upgrade.md) — how to update to a new release
- [Monitoring](monitoring.md) — observability for production instances
