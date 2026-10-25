#!/bin/bash
set -e

# Deploys the pre-built images from GHCR (ghcr.io/fishkob/<name>; public by
# default). The chart reads imageOwner from values.yaml — no registry auth.

echo "=== Deploying Visual Regression ==="

# Ensure we're in the right directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

if grep -q "CHANGE_ME" charts/vrt/values.yaml; then
  echo ""
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo "WARNING: charts/vrt/values.yaml still contains CHANGE_ME placeholders."
  echo "Override secrets.postgres_password and secrets.rustfs_secret_key (via"
  echo "values.local.yaml or --set) before exposing this deployment."
  echo "Continuing with the tracked defaults..."
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo ""
fi

# Deploy using Helm
echo "Deploying Helm chart..."
helm upgrade --install vrt charts/vrt --namespace vrt --create-namespace

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
