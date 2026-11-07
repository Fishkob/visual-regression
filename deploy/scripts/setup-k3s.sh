#!/bin/bash
set -e

echo "=== k3s Setup for Visual Regression ==="

# The installer runs as root on the operator's machine, so it may not change
# underneath this script: it is downloaded, checked against the hash below and
# only then executed. A mismatch means the upstream installer changed — review
# it, then update the constant deliberately.
K3S_INSTALL_URL="https://get.k3s.io"
K3S_INSTALL_SHA256="c2a2643dd7c259121a876d16538844c60928de3d38ae98f22f7b95a7ffcfab9d"

install_k3s() {
  local script
  local actual
  script="$(mktemp)"
  curl -sfL "$K3S_INSTALL_URL" -o "$script"
  if ! printf '%s  %s\n' "$K3S_INSTALL_SHA256" "$script" | sha256sum -c --quiet -; then
    actual="$(sha256sum "$script" | cut -d' ' -f1)"
    rm -f "$script"
    echo "ERROR: the k3s installer does not match the pinned SHA-256." >&2
    echo "       pinned: $K3S_INSTALL_SHA256" >&2
    echo "       actual: $actual" >&2
    echo "       Review the new installer, then set K3S_INSTALL_SHA256 to the actual value." >&2
    exit 1
  fi
  sh "$script"
  rm -f "$script"
}

# Install k3s
if command -v k3s &> /dev/null; then
  echo "k3s already installed, skipping..."
else
  echo "Installing k3s..."
  install_k3s
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
read -sp "RustFS Access Key (default: rustfsadmin): " RUSTFS_ACCESS_KEY
echo ""
RUSTFS_ACCESS_KEY=${RUSTFS_ACCESS_KEY:-rustfsadmin}
read -sp "RustFS Secret Key (default: rustfsadmin): " RUSTFS_SECRET_KEY
echo ""
RUSTFS_SECRET_KEY=${RUSTFS_SECRET_KEY:-rustfsadmin}

kubectl create secret generic vrt-secrets -n vrt \
  --from-literal=db-url="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/vrt" \
  --from-literal=postgres-user="${POSTGRES_USER}" \
  --from-literal=postgres-password="${POSTGRES_PASSWORD}" \
  --from-literal=rustfs-access-key="${RUSTFS_ACCESS_KEY}" \
  --from-literal=rustfs-secret-key="${RUSTFS_SECRET_KEY}" \
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
