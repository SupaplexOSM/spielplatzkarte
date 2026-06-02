# Uninstall

Steps to completely remove a spieli deployment from a server.

## 1. Remove the Traefik stack

If you set up the Traefik reverse proxy:

```bash
cd spieli-traefik

# Stop containers and delete certificate volumes
docker compose down -v

cd ..
rm -rf spieli-traefik/ install-traefik.sh
```

## 2. Remove the spieli stack

```bash
cd spieli

# Stop all containers (all profiles), delete volumes and networks
docker compose down -v --remove-orphans

cd ..
rm -rf spieli/ install.sh
```

No `--profile` flag needed — `down` stops all containers in the project regardless of which profile started them (including watchtower if auto-update was enabled). `--remove-orphans` cleans up dangling networks.

If a volume removal fails with "volume is in use", a stopped container is still referencing it. Prune stopped containers first, then remove the volumes manually:

```bash
docker container prune -f
docker volume rm spieli_pgdata spieli_pgdata2 spieli_pbf_cache 2>/dev/null || true
```

## 3. Remove Docker images (optional)

```bash
docker image prune -a
```

!!! warning "This removes all unused images"
    `docker image prune -a` removes every image not referenced by a running container — not just spieli images. Skip this step if other Docker workloads are running on the same host.
