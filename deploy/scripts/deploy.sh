#!/bin/bash
set -e

# Deploys the pre-built images from GHCR (ghcr.io/fishkob/<name>; public by
# default). The chart reads imageOwner from values.yaml — no registry auth.

echo "=== Deploying Visual Regression ==="

# Ensure we're in the right directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# The chart refuses to render while a password is still the tracked placeholder,
# so this fails here with the fix instead of inside a Helm render.
if grep -q "CHANGE_ME" charts/vrt/values.yaml; then
  echo ""
  echo "!! charts/vrt/values.yaml still contains CHANGE_ME placeholders." >&2
  echo "!! Set secrets.postgres_password and secrets.rustfs_secret_key first —" >&2
  echo "!! via a local values file (values.local.yaml is gitignored) or --set." >&2
  echo "" >&2
  exit 1
fi

# Deploy using Helm. The local overrides file is what the docs point at for
# secrets, so it has to be loaded — otherwise the chart renders the tracked
# placeholder passwords that the guard above just rejected.
echo "Deploying Helm chart..."
HELM_ARGS=()
if [ -f charts/vrt/values.local.yaml ]; then
  echo "  using charts/vrt/values.local.yaml"
  HELM_ARGS+=(-f charts/vrt/values.local.yaml)
fi
helm upgrade --install vrt charts/vrt "${HELM_ARGS[@]}" --namespace vrt --create-namespace

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
echo "  Backend:  http://vrt.local/api/v1/health/ready  (detail: /api/v1/health with x-metrics-key)"
echo "  Storage images: http://rustfs.vrt.local (ingress route — images load in the browser)"
echo ""
echo "Check status: kubectl get pods -n vrt"
