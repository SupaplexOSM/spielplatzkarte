# HTTPS setup (Traefik + Let's Encrypt)

The spieli Docker stack listens on port 8080 over plain HTTP. To serve it publicly over HTTPS, use the `deploy/traefik` stack — a single Traefik v3 container that terminates TLS and reverse-proxies to port 8080. Traefik handles certificate issuance and renewal automatically — no certbot container, no manual cert steps.

## Prerequisites

- A VM with a public IP address
- Docker Engine 20.10+ and Docker Compose v2 (`docker compose version`)
- A DNS A record pointing your domain to the server IP (e.g. `spieli.example.com → 1.2.3.4`)
- Ports 80 and 443 open in the firewall (see [Firewall](#firewall))

## 1. Download and run the installer

```bash
curl -fsSL https://raw.githubusercontent.com/mfuhrmann/spieli/main/deploy/traefik/install-traefik.sh -o install-traefik.sh
bash install-traefik.sh
```

The installer prompts for your domain, email address, and deployment mode, then:

1. Downloads the Compose file
2. Generates `traefik.yml` with your email for Let's Encrypt
3. Generates `dynamic/app.yml` with your domain and routing rules
4. Starts Traefik

Traefik issues the TLS certificate on the first HTTPS request (takes ~10 seconds). If your browser shows a certificate error immediately after startup, wait a moment and reload.

## 2. Install spieli

If you haven't installed the spieli app stack yet:

```bash
curl -fsSL https://raw.githubusercontent.com/mfuhrmann/spieli/main/install.sh -o install.sh
bash install.sh
```

When the installer asks for the public URL, enter `https://yourdomain.example.com`.

## Renewal

Traefik renews certificates automatically before they expire. No cron jobs or manual steps needed.

## Stopping and starting

```bash
cd spieli-traefik
docker compose down   # stop
docker compose up -d  # start (cert is stored in the letsencrypt volume — no re-issue needed)
```

## Firewall

Open ports 80 (ACME challenge) and 443 (HTTPS). Block 8080 from public access — traffic should only reach it through Traefik.

```bash
ufw allow 80/tcp
ufw allow 443/tcp
ufw deny 8080/tcp
```

!!! note "Cloud provider firewalls"
    Many VPS providers (Hetzner, DigitalOcean, etc.) have a separate firewall in their control panel that acts before UFW. If the ACME challenge fails with "connection refused", check that ports 80 and 443 are open there too.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `502 Bad Gateway` | spieli stack not running on port 8080 — run `docker compose ps` from the spieli directory |
| Certificate not issued | Port 80 blocked (cloud firewall or UFW), or DNS not yet pointing to this server |
| `host.docker.internal` not resolved | Docker Engine < 20.10 — upgrade Docker |
| Mixed-content warnings | `SITE_URL` not set to `https://` — re-run the spieli installer or edit `.env` |
| Logs | `docker compose logs -f` from the `spieli-traefik/` directory |
