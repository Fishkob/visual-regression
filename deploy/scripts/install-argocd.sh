#!/bin/bash
set -e

echo "=== Installing ArgoCD ==="

# Install ArgoCD
kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

echo "Waiting for ArgoCD server to be ready..."
kubectl wait --for=condition=available deployment/argocd-server -n argocd --timeout=300s

# Get initial admin password
echo ""
echo "=== ArgoCD Admin Password ==="
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
echo ""
echo ""

# Apply the application manifest
echo "Applying Visual Regression Application..."
kubectl apply -f deploy/argocd/app.yaml

echo ""
echo "=== ArgoCD UI ==="
echo "Port-forward: kubectl port-forward svc/argocd-server -n argocd 8080:443"
echo "Open: https://localhost:8080"
echo "User: admin"
