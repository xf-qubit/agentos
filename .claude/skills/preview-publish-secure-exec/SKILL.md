---
name: preview-publish-secure-exec
description: Preview-publish secure-exec, then pin agent-os (a6) to that exact published version and preview-publish a6. Use when the user wants to cut a secure-exec preview and roll it through agent-os end-to-end.
---

# Preview-publish secure-exec → auto-update agent-os → preview-publish agent-os

End-to-end loop that publishes a secure-exec preview, pins this repo (a6) to the
version that secure-exec just published, and previews a6 against it. Both halves
use the unified `.github/workflows/publish.yaml` (workflow_dispatch, no `version`
input = preview = debug build, npm-only, dist-tag = sanitized branch name).

The agent-os side is driven by `scripts/secure-exec-dep.mjs` (see
`just secure-exec-status`), which keeps the secure-exec version in ONE place:
the `catalog:` block in `pnpm-workspace.yaml` (npm) plus `[workspace.dependencies]`
in `Cargo.toml` (crates).

## Prerequisites (one-time / per-run)

1. **secure-exec must be pushed** to its GitHub remote on a branch that contains
   `.github/workflows/publish.yaml`. The local `~/secure-exec` checkout is jj
   colocated; large pyodide/sandbox assets exceed jj's snapshot limit, so commit
   with `jj --config snapshot.max-new-file-size=16777216 ...` (or gitignore them).
   Confirm the target repo/branch with the user before the first push — the
   remote may be a live repo.
2. **NPM_TOKEN / CARGO_REGISTRY_TOKEN** secrets set on both repos (preview only
   needs NPM_TOKEN; crates is dry-run on preview).

## Procedure

### 1. Preview-publish secure-exec

```bash
# from the secure-exec checkout, on the branch you pushed:
gh workflow run publish.yaml -R <owner>/secure-exec --ref <branch>
```

Watch it and require success:

```bash
run=$(gh run list -R <owner>/secure-exec --workflow=publish.yaml -L1 --json databaseId --jq '.[0].databaseId')
gh run watch -R <owner>/secure-exec "$run" --exit-status
```

### 2. Read the version secure-exec just published

The preview dist-tag is the sanitized branch name. Resolve the concrete version:

```bash
TAG=$(echo "<branch>" | tr '/_' '--' | tr '[:upper:]' '[:lower:]')
VER=$(npm view @secure-exec/core@"$TAG" version)
echo "secure-exec preview version: $VER"
```

If the dist-tag lookup is unavailable, read it from the workflow `context` job
output via `gh run view "$run" --json jobs`.

### 3. Pin agent-os (a6) to that version

```bash
cd ~/a6
just secure-exec-set-version "$VER"   # writes catalog + Cargo workspace deps
just secure-exec-pinned               # switch off local link:/path overrides
pnpm install --lockfile-only          # refresh pnpm-lock for the pinned versions
cargo update -p secure-exec-sidecar --precise "$VER" || true   # refresh Cargo.lock
```

Sanity-check the pin resolves before pushing:

```bash
pnpm install --frozen-lockfile        # must pass against the just-published version
```

### 4. Push + preview-publish agent-os

```bash
cd ~/a6
forklift submit                       # push the pinned branch (never raw git push / main)
gh workflow run publish.yaml -R rivet-dev/agent-os --ref <a6-branch>
run=$(gh run list -R rivet-dev/agent-os --workflow=publish.yaml -L1 --json databaseId --jq '.[0].databaseId')
gh run watch -R rivet-dev/agent-os "$run" --exit-status
```

## Loop-until-green

On any failure: pull the failing job logs (`gh run view <run> --log-failed`),
fix the root cause (workflow YAML, version pin, lockfile drift, missing secret,
build break), re-dispatch that repo's workflow, and re-watch. Do not advance to
the a6 half until the secure-exec half is green; both must succeed end-to-end.

## Revert to local development

```bash
just secure-exec-local && pnpm install   # back to ../secure-exec link:/path deps
```
