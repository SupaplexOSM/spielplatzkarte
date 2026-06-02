## Context

After v0.2.0 shipped, the federation code is production-ready (hub mode, registry, deep-links) and two of the three doc deliverables originally scoped in this change are already in-repo:

- `docs/reference/federation.md` — conceptual reference (shipped via PR #183)
- `docs/reference/registry-json.md` — schema reference (shipped via PR #183)

The third and largest deliverable — a step-by-step walkthrough for standing up a Hub + N × data-node topology — is still missing, as are five smaller doc/config additions (`configuration.md` row, `architecture.md` matrix, `.env.example` Hub block, `federation.md` cross-link, MkDocs nav entry).

The operator persona is **"someone standing up their first federated deployment"** — not "someone who already has two standalone instances and wants to federate them". This changes the doc's centre of gravity from "Hub wiring" toward "infrastructure bootstrap, then Hub wiring".

## Goals / Non-Goals

**Goals:**
- A single page an operator can read top-to-bottom and end up with a working Hub + 2 data-nodes.
- Copy-pasteable commands against the repo's existing `compose.yml` profiles (`data-node`, `ui`).
- Five small companion edits that close the "how did I discover this variable / this combination exists" gaps.

**Non-Goals:**
- TLS / reverse-proxy choice (Caddy vs nginx vs Traefik) — operator's decision, out of scope.
- DNS and certificate bootstrap — generic infrastructure, not federation-specific.
- Multi-hub / nested federation (a hub federating another hub).
- Authn/authz across backends — every `/api/` is public today; a separate change.
- Backup, monitoring, log aggregation — not federation-specific.
- Non-Docker deployment paths (bare-metal systemd, k8s, swarm).
- Documentation of the already-shipped `federation.md` / `registry-json.md` (they stand).

## Decisions

### D1 — Audience is "first-time federation operator"

The walkthrough is written as if the reader owns three fresh Linux hosts and nothing else. Every command appears in full; no "you know where this goes" gaps. Readers who already have running standalone instances can skim §1 (data-node setup) and land at §2 (write the registry).

### D2 — 150-line copy-paste recipe over a 500-line guide

A sharp persona tolerates an opinionated recipe. Offering variations ("if you use k8s…", "if you already have a reverse proxy…") triples the page length and serves the *second* federation deployment, not the first. Variations belong in follow-up pages or linked third-party material.

### D3 — Topology assumption: Hub + ≥ 1 data-node (no UI on backends)

The walkthrough assumes `DEPLOY_MODE=ui` + `APP_MODE=hub` on the Hub and `DEPLOY_MODE=data-node` on each backend. Technically the registry accepts any URL exposing `/api/rpc/get_meta`, including `data-node-ui` instances — but documenting that possibility in the walkthrough forces the reader to resolve ambiguity they don't have context for. The `registry-json.md` reference page already notes the broader truth; the walkthrough picks the canonical path.

### D4 — Opinionated infrastructure choices baked in

- **Docker Compose directly** (no swarm, no k8s, no Nomad).
- **Single VPS per node** (three hosts for two backends + one hub). Co-location is possible but complicates the CORS story needlessly for a first read.
- **Public DNS hostnames** (not IP-only). TLS termination assumed but not prescribed.
- **Repo's compose profiles verbatim** — `--profile data-node` and `--profile ui`.

These are stated up front in §0 so an operator on a different stack knows within 10 seconds that this page isn't for them.

### D5 — Matrix shape in `architecture.md`: 2×2, not 3×2

A 3×2 matrix with an entire `data-node` row reading "N/A — no UI" is noise. Collapse to a 2×2:

|              | `standalone` | `hub` |
|--------------|--------------|-------|
| `ui`         | Regional map | Federated map |
| `data-node-ui` | Single-region | Hub + local backend¹ |

¹ Legal but not recommended — the hub UI reads from the registry, so the local data-node is only reached if it appears in the registry. Run hub and data-nodes as separate deployments.

`data-node` doesn't appear because it has no UI to configure an `APP_MODE` against.

### D6 — Doc file placement

| File | Role | Why here |
|---|---|---|
| `docs/ops/federated-deployment.md` | Walkthrough (new) | Action, not concept → `ops/` |
| `docs/reference/federation.md` | Conceptual reference (shipped, +See also) | Already the conceptual home |
| `docs/reference/registry-json.md` | Schema reference (shipped, no change) | Schema lives in `reference/` |
| `docs/reference/architecture.md` | + Mode matrix + caption | Matrix is architecture, not ops |
| `docs/ops/configuration.md` | + `REGISTRY_URL` row, amend `APP_MODE` row | Env-var table already lives here |
| `.env.example` | + Commented Hub block + pointer comment | Discoverable by operators grepping `.env` |
| `mkdocs.yml` | + Walkthrough nav entry under Operations | MkDocs nav must include it |

## Risks / Trade-offs

- **Walkthrough rots if compose profile names change.** Mitigation: link specific profile flags to `compose.yml` in-repo via the GitHub `edit_uri` so readers notice drift; CI `mkdocs build --strict` catches broken internal links but won't catch stale shell commands.
- **Opinionated recipe alienates non-Docker operators.** Accepted — a federation walkthrough for every deployment style is a book, not a page. Non-Docker operators have the `federation.md` + `registry-json.md` references and can translate.
- **Matrix footnote on `data-node-ui × hub`.** Readers may read the footnote as "you can't do this" when the reality is "you can, but it's weird." The footnote wording matters.

## Open Questions

(none — decisions made during explore session)
