#!/bin/bash
set -e

echo "=== k3s Setup for Visual Regression ==="

# Install k3s
if command -v k3s &> /dev/null; then
  echo "k3s already installed, skipping..."
else
  echo "Installing k3s..."
  curl -sfL https://get.k3s.io | sh -
fi

# Wait for k3s to be ready
echo "Waiting for k3s to be ready..."
sleep 5

# Configure kubectl
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
chmod 644 /etc/rancher/k3s/k3s.yaml

# Create namespace
echo "Creating namespace..."
kubectl create namespace vrt --dry-run=client -o yaml | kubectl apply -f -

# Create secrets
echo "Creating secrets..."
read -p "Postgres User (default: postgres): " POSTGRES_USER
POSTGRES_USER=${POSTGRES_USER:-postgres}
read -sp "Postgres Password (default: postgres): " POSTGRES_PASSWORD
echo ""
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-postgres}
read -sp "MinIO Access Key (default: minioadmin): " MINIO_ACCESS_KEY
echo ""
MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY:-minioadmin}
read -sp "MinIO Secret Key (default: minioadmin): " MINIO_SECRET_KEY
echo ""
MINIO_SECRET_KEY=${MINIO_SECRET_KEY:-minioadmin}

kubectl create secret generic vrt-secrets -n vrt \
  --from-literal=db-url="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/vrt" \
  --from-literal=postgres-user="${POSTGRES_USER}" \
  --from-literal=postgres-password="${POSTGRES_PASSWORD}" \
  --from-literal=rustfs-access-key="${MINIO_ACCESS_KEY}" \
  --from-literal=rustfs-secret-key="${MINIO_SECRET_KEY}" \
  --dry-run=client -o yaml | kubectl apply -f -

# Create image pull secret for ghcr.io
read -p "GitHub username for ghcr.io: " GH_USER
read -sp "GitHub Personal Access Token (with read:packages scope): " GH_TOKEN
echo ""

kubectl create secret docker-registry ghcr-secret -n vrt \
  --docker-server=ghcr.io \
  --docker-username="${GH_USER}" \
  --docker-password="${GH_TOKEN}" \
  --dry-run=client -o yaml | kubectl apply -f -

# Add /etc/hosts entry hint
echo ""
echo "=== Setup complete ==="
echo "Add this to your /etc/hosts (or a wildcard entry):"
echo "  <your-server-ip> vrt.local rustfs.vrt.local"
echo ""
echo "Next steps:"
echo "  1. Install ArgoCD: ./deploy/scripts/install-argocd.sh"
echo "  2. Deploy the chart: ./deploy/scripts/deploy.sh (or apply deploy/argocd/app.yaml)"
echo "  3. Access: http://vrt.local"
