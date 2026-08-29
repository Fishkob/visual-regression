#!/bin/bash
set -e

# Requires: GHCR_TOKEN (if pulling images from GHCR)
#   export GHCR_TOKEN=ghp_xxx && ./deploy/scripts/deploy.sh
#   Optional: GHCR_USER (defaults to the git remote's repository owner)

echo "=== Deploying Visual Regression ==="

# Ensure we're in the right directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Build the Helm command
HELM_OPTS=()
GHCR_USER="${GHCR_USER:-$(git remote get-url origin 2>/dev/null | sed -nE 's#.*github.com[:/]([^/]+)/.*#\1#p')}"
GHCR_USER="${GHCR_USER:-Fishkob}"
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
