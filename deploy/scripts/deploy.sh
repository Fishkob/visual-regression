#!/bin/bash
set -e

# Requires: GHCR_TOKEN (if pulling images from GHCR)
#   export GHCR_TOKEN=ghp_xxx && ./deploy/scripts/deploy.sh
#   Optional: GHCR_USER (overrides the owner for one run). Otherwise the owner
#   is read from deploy/charts/vrt/values.local.yaml, derived from the git
#   remote, or prompted once and stored there.

echo "=== Deploying Visual Regression ==="

# Ensure we're in the right directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

HELM_OPTS=()
VALUES_LOCAL="charts/vrt/values.local.yaml"

# Persist the GHCR owner into values.local.yaml (idempotent).
persist_ghcr_owner() {
  local owner="$1"
  if [ -f "$VALUES_LOCAL" ] && grep -qE '^imageOwner:' "$VALUES_LOCAL"; then
    sed -i.bak -E "s|^imageOwner:.*|imageOwner: ${owner}|" "$VALUES_LOCAL"
    rm -f "$VALUES_LOCAL.bak"
  else
    printf '\nimageOwner: %s\n' "$owner" >> "$VALUES_LOCAL"
  fi
}

# Resolve the GHCR owner. Priority: GHCR_USER env -> values.local.yaml ->
# git remote owner -> interactive prompt (persisted). Non-interactive with no
# source -> hard error.
resolve_ghcr_owner() {
  if [ -n "$GHCR_USER" ]; then
    echo "$GHCR_USER"
    return
  fi
  if [ -f "$VALUES_LOCAL" ]; then
    local from_file
    from_file="$(sed -nE 's/^imageOwner:[[:space:]]*(.*)$/\1/p' "$VALUES_LOCAL" | head -n1)"
    if [ -n "$from_file" ]; then
      echo "$from_file"
      return
    fi
  fi
  local from_git
  from_git="$(git remote get-url origin 2>/dev/null | sed -nE 's#.*github.com[:/]([^/]+)/.*#\1#p')"
  if [ -n "$from_git" ]; then
    echo "$from_git"
    return
  fi
  if [ -t 0 ]; then
    local owner
    read -r -p "GHCR owner publishing the images (ghcr.io/<owner>/...): " owner
    if [ -z "$owner" ]; then
      echo "ERROR: GHCR owner is required." >&2
      exit 1
    fi
    persist_ghcr_owner "$owner"
    echo "$owner"
    return
  fi
  echo "ERROR: Cannot determine GHCR owner. Export GHCR_USER, set imageOwner in values.local.yaml, or run interactively." >&2
  exit 1
}

GHCR_USER="$(resolve_ghcr_owner)"

# Build the Helm command
# Point the chart at the images published under this owner (ghcr.io/<owner>/<name>).
HELM_OPTS+=(--set "imageOwner=$GHCR_USER")
if [ -n "$GHCR_TOKEN" ]; then
  DOCKER_AUTH=$(echo -n "${GHCR_USER}:${GHCR_TOKEN}" | base64)
  DOCKER_CONFIG=$(echo "{\"auths\":{\"ghcr.io\":{\"auth\":\"${DOCKER_AUTH}\"}}}" | base64)
  HELM_OPTS+=(--set "secrets.ghcr_pull_secret=$DOCKER_CONFIG")
fi

# Deploy using Helm
echo "Deploying Helm chart..."
helm upgrade --install vrt charts/vrt --namespace vrt --create-namespace "${HELM_OPTS[@]}"

echo ""
echo "=== Waiting for pods to be ready ==="
kubectl wait --for=condition=ready pod -l app=postgres -n vrt --timeout=120s || echo "Postgres timeout, continuing..."
kubectl wait --for=condition=ready pod -l app=rustfs -n vrt --timeout=60s || echo "Storage (RustFS) timeout, continuing..."
kubectl wait --for=condition=ready pod -l app=backend -n vrt --timeout=120s || echo "Backend timeout, continuing..."
kubectl wait --for=condition=ready pod -l app=frontend -n vrt --timeout=60s || echo "Frontend timeout, continuing..."

echo ""
echo "=== Deployment complete ==="
echo "Access:"
echo "  Frontend: http://vrt.local"
echo "  Backend:  http://vrt.local/api/v1/health"
echo "  Storage images: http://rustfs.vrt.local (ingress route — images load in the browser)"
echo ""
echo "Check status: kubectl get pods -n vrt"
