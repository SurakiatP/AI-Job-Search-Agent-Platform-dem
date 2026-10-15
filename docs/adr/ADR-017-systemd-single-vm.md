# ADR-017 — Production runs on one VM with systemd and Compose, not Kubernetes

Date: 2026-10-15
Status: Accepted. The owner approved it with the spec `docs/superpowers/specs/2026-10-15-iac-single-vm-design.md` on 2026-10-15.

## Context

TOR §7 lists "Kubernetes หรือ systemd (prod) เลือกใน ADR" for deployment. ADR-015 recorded that no production deploy had been chosen yet.

The app is one Python process. It runs Hermes natively on the host and starts per-run sandboxes with the Docker CLI. Its infrastructure (PostgreSQL, MinIO, LiteLLM, Meilisearch, Prometheus, Grafana, optional Langfuse) already runs as a pinned Compose stack. There is no server yet, and the client has not picked a cloud.

## Decision

Production is one Ubuntu 24.04 LTS VM:
- the app runs as a systemd service under a dedicated user `jsp`;
- the infrastructure runs with Docker Compose, the dev `compose.yaml` plus a production override;
- Caddy terminates TLS; only ports 22, 80 and 443 are public;
- ingest and backup run as systemd timers;
- cloud-init, `bootstrap.sh` and `deploy.sh` in `infra/deploy/` make the setup repeatable on any cloud or bare host.

Kubernetes is not used.

## Why not Kubernetes

- The app controls Docker directly to run sandboxes. In Kubernetes that needs a privileged pod with the host Docker socket, or a rewrite of the sandbox layer onto Kubernetes Jobs. The first gives up the isolation Kubernetes would add; the second is a large change with no TOR requirement behind it.
- One process and one database do not need scheduling across nodes. A cluster would add a control plane, an ingress controller, a certificate manager and storage classes to operate and patch, all subject to the same CVE gate.
- The dev stack already is Compose, so production differs from dev only by a small override.

## Consequences

- `jsp` is in the `docker` group, which is equivalent to root on the host. This is accepted because the app already needs to start containers; it is the reason the VM must run nothing else and SSH must be key-only.
- There is one machine: no high availability. A host failure means restoring from backup onto a new VM with the same scripts. Off-site backup is an owner TODO.
- A deploy restarts the app; in-flight runs follow the existing interruption handling.
- Rollback across a schema migration needs a restore from the pre-deploy backup; `deploy.sh` refuses to roll back code alone in that case.

## Revisit when

- the platform needs more than one app instance or high availability;
- the client mandates Kubernetes or a managed container platform;
- the sandbox layer moves off the Docker CLI.
