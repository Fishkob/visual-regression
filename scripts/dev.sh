#!/bin/bash

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

load_env() {
    if [ -f .env ]; then
        set -a && source .env && set +a
    fi
    
    if [ -f backend/.env ]; then
        set -a && source backend/.env && set +a
    fi

    # Local dev keeps secrets in backend/.env.local, which the backend runtime
    # and the Prisma CLI read directly. This script sources it too so its own
    # commands (seed, migrate, docker) see the same values.
    if [ -f backend/.env.local ]; then
        set -a && source backend/.env.local && set +a
    fi
}

POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-vrt}"

RUSTFS_ENDPOINT="${RUSTFS_ENDPOINT:-localhost}"
RUSTFS_PORT="${RUSTFS_PORT:-9000}"
RUSTFS_ACCESS_KEY="${RUSTFS_ACCESS_KEY:-rustfsadmin}"
RUSTFS_SECRET_KEY="${RUSTFS_SECRET_KEY:-rustfsadmin}"
RUSTFS_BUCKET="${RUSTFS_BUCKET:-vrt}"

BACKEND_PORT="${BACKEND_PORT:-3000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

log() { echo -e "${CYAN}==>${NC} $1"; }
warn() { echo -e "${YELLOW}==> Warning:${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }

require_docker() {
    if ! command -v docker &> /dev/null; then
        warn "Docker is required but was not found. Install it: https://docs.docker.com/get-docker/"
        exit 1
    fi
    if ! docker info &> /dev/null; then
        warn "Docker is installed but the daemon is not reachable. Start Docker and retry."
        exit 1
    fi
    if ! docker compose version &> /dev/null; then
        warn "Docker Compose v2 is required (the 'docker compose' plugin)."
        exit 1
    fi
}

require_node() {
    if ! command -v node &> /dev/null; then
        warn "Node.js >= 24.15 is required but was not found. Install it: https://nodejs.org/"
        exit 1
    fi
}

cmd_infra() {
    require_docker

    log "Starting infrastructure services..."
    docker compose -f docker-compose.yml up -d postgres rustfs pdf-sidecar

    log "Waiting for postgres..."
    for i in {1..30}; do
        docker compose -f docker-compose.yml exec -T postgres pg_isready -U postgres >/dev/null 2>&1 && break
        sleep 2
    done
    
    log "Waiting for RustFS..."
    for i in {1..30}; do
        curl -sf http://localhost:9000/health >/dev/null 2>&1 && break
        sleep 2
    done

    log "Waiting for pdf-sidecar..."
    for i in {1..30}; do
        curl -sf http://localhost:3001/health >/dev/null 2>&1 && break
        sleep 2
    done
    
    success "Infrastructure ready!"
    echo ""
    echo "  PostgreSQL: localhost:5432"
    echo "  RustFS:     http://localhost:9000"
    echo "  RustFS UI:  http://localhost:9001"
    echo "  PDF sidecar: http://localhost:3001"
}

cmd_docker() {
    require_docker

    log "Building and starting all services..."
    docker compose build
    docker compose up -d
    
    log "Waiting for postgres..."
    for i in {1..30}; do
        docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1 && break
        sleep 2
    done
    
    log "Waiting for RustFS..."
    for i in {1..30}; do
        curl -sf http://localhost:9000/health >/dev/null 2>&1 && break
        sleep 2
    done
    
    success "Docker services ready!"
    echo ""
    echo "  Backend:  http://localhost:$BACKEND_PORT"
    echo "  Frontend: http://localhost"
    echo ""
    echo "  Admin login: ${BOOTSTRAP_ADMIN_USERNAME:-admin} / ${BOOTSTRAP_ADMIN_PASSWORD:-<see .env>}"
}

cmd_local() {
    load_env
    require_node
    
    if ! command -v pnpm &> /dev/null; then
        warn "pnpm not found. Installing..."
        npm install -g pnpm
    fi
    
    log "Installing dependencies..."
    pnpm install
    
    if [ ! -f backend/.env.local ]; then
        log "Creating backend/.env.local..."
        cp backend/.env.local.example backend/.env.local
    fi
    if [ ! -f frontend/.env.local ]; then
        log "Creating frontend/.env.local..."
        cp frontend/.env.local.example frontend/.env.local
    fi
    
    log "Generating Prisma client..."
    cd "$PROJECT_ROOT/backend"
    pnpm exec prisma generate
    
    # Onboarding applies the committed migrations non-interactively; use
    # `cd backend && pnpm run db:migrate` when authoring a schema change.
    log "Applying database schema..."
    pnpm exec prisma migrate deploy
    
    if [ ! -f "$PROJECT_ROOT/client-sdk/index.ts" ] || [ "$PROJECT_ROOT/backend/prisma/schema.prisma" -nt "$PROJECT_ROOT/client-sdk/index.ts" ]; then
        log "Generating SDK..."
        cd "$PROJECT_ROOT"
        pnpm run sdk:generate
        pnpm run sdk:build
    fi
    
    cd "$PROJECT_ROOT"
    load_env

    success "Local environment ready!"
    echo ""
    echo "  Run: pnpm run dev"
    echo ""
    echo "  Backend:  http://localhost:$BACKEND_PORT"
    echo "  Frontend: http://localhost:$FRONTEND_PORT"
    echo "  Login:    ${BOOTSTRAP_ADMIN_USERNAME:-admin} / ${BOOTSTRAP_ADMIN_PASSWORD:-<see backend/.env.local>}"
}

cmd_seed() {
    load_env

    # /api/v1/health/live is public; /api/v1/projects now needs auth (401), so
    # it is no longer a usable readiness probe.
    if ! curl -sf "http://localhost:$BACKEND_PORT/api/v1/health/live" >/dev/null 2>&1; then
        warn "Backend not running on port $BACKEND_PORT. Seed scripts use REST API."
        warn "Start the backend first:  pnpm run dev:backend"
        echo ""
        if [ -t 0 ]; then
            read -r -p "Start backend automatically (pnpm run dev:backend)? [Y/n] " reply
            case "${reply:-Y}" in
                [Yy]|[Yy][Ee][Ss])
                    reply_yes=1
                    ;;
                *)
                    exit 1
                    ;;
            esac
        else
            warn "Non-interactive shell — start backend manually."
            exit 1
        fi
        if [ "${reply_yes:-0}" = "1" ]; then
            log "Starting backend..."
            cd "$PROJECT_ROOT"
            pnpm run dev:backend &
            BACKEND_PID=$!
            trap "kill $BACKEND_PID 2>/dev/null" EXIT
            log "Waiting for backend to be ready..."
            for i in {1..30}; do
                curl -sf "http://localhost:$BACKEND_PORT/api/v1/health/live" >/dev/null 2>&1 && break
                sleep 2
            done
        fi
    fi
    
    # Seeds hit the REST API with an api key header, and the backend only
    # accepts keys that exist in its DB. On a fresh clone no key exists yet, so
    # provision one via the admin endpoint when ADMIN_API_KEY is configured.
    if [ -z "$SEED_API_KEY" ]; then
        if [ -n "$ADMIN_API_KEY" ]; then
            log "Provisioning a seed API key via the admin endpoint..."
            ADMIN_RESPONSE=$(curl -sf -X POST "http://localhost:$BACKEND_PORT/api/v1/admin/api-keys" \
                -H 'Content-Type: application/json' \
                -H "x-admin-key: $ADMIN_API_KEY" \
                -d '{"name":"dev-seed","scopes":["upload","read","approve","admin"]}') || {
                warn "Could not provision a seed API key (bad ADMIN_API_KEY, or the admin endpoint is disabled)."
                warn "Fix ADMIN_API_KEY in backend/.env.local, or create a key and set SEED_API_KEY instead."
                exit 1
            }
            SEED_API_KEY=$(printf '%s' "$ADMIN_RESPONSE" | sed -n 's/.*"rawKey":"\([^"]*\)".*/\1/p')
            if [ -z "$SEED_API_KEY" ]; then
                warn "Admin endpoint returned an unexpected response — could not extract rawKey."
                exit 1
            fi
            PROVISIONED_SEED_KEY=1
        else
            warn "The seed scripts require an API key (the API is now authenticated)."
            warn "Either set ADMIN_API_KEY in backend/.env.local so a key can be provisioned"
            warn "automatically, or create a key via POST /api/v1/admin/api-keys and set SEED_API_KEY."
            exit 1
        fi
    fi

    # Persist a freshly provisioned key so later runs reuse it instead of
    # minting another "dev-seed" key each time.
    if [ "${PROVISIONED_SEED_KEY:-0}" = "1" ] && [ -f backend/.env.local ] && grep -q '^SEED_API_KEY=' backend/.env.local; then
        ESCAPED_SEED_KEY=$(printf '%s' "$SEED_API_KEY" | sed 's/[&|\\]/\\&/g')
        SEED_ENV_TMP=$(mktemp)
        sed "s|^SEED_API_KEY=.*|SEED_API_KEY=${ESCAPED_SEED_KEY}|" backend/.env.local > "$SEED_ENV_TMP"
        mv "$SEED_ENV_TMP" backend/.env.local
        log "Saved SEED_API_KEY to backend/.env.local (reused on the next seed run)."
    fi

    log "Seeding database..."
    cd "$PROJECT_ROOT"
    SEED_API_KEY="$SEED_API_KEY" \
    POSTGRES_HOST="$POSTGRES_HOST" \
    POSTGRES_PORT="$POSTGRES_PORT" \
    POSTGRES_USER="$POSTGRES_USER" \
    POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    POSTGRES_DB="$POSTGRES_DB" \
    RUSTFS_ENDPOINT="$RUSTFS_ENDPOINT" \
    RUSTFS_PORT="$RUSTFS_PORT" \
    RUSTFS_ACCESS_KEY="$RUSTFS_ACCESS_KEY" \
    RUSTFS_SECRET_KEY="$RUSTFS_SECRET_KEY" \
    RUSTFS_BUCKET="$RUSTFS_BUCKET" \
    RUSTFS_USE_SSL=false \
    RUSTFS_PUBLIC_URL="http://localhost:$RUSTFS_PORT" \
    pnpm run seed
    
    success "Database seeded!"
}

cmd_stop() {
    log "Stopping Docker services..."
    docker compose down 2>/dev/null || true
    docker network prune -f 2>/dev/null || true
    success "Stopped!"
}

cmd_delete() {
    log "Stopping and removing containers..."
    docker compose down -v 2>/dev/null || true
    docker network prune -f 2>/dev/null || true
    
    log "Removing builds..."
    rm -rf backend/dist frontend/dist client-sdk/dist
    
    success "Cleaned!"
}

cmd_reset() {
    cmd_delete
    cmd_infra
    cmd_local
    success "Full reset complete!"
    echo ""
    echo "  Run: pnpm run dev"
    echo ""
    echo "  Backend:  http://localhost:$BACKEND_PORT"
    echo "  Frontend: http://localhost:$FRONTEND_PORT"
}

show_help() {
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  local       Local development with hot-reload (requires pnpm)"
    echo "  infra       Start infrastructure only (postgres, rustfs, pdf-sidecar)"
    echo "  docker      Start all services in Docker (production-like)"
    echo "  seed        Seed database with test data"
    echo "  stop        Stop all services"
    echo "  reset       Full reset: delete + infra + local (one-command restart)"
    echo "  delete      Stop and remove all data"
    echo ""
    echo "Examples:"
    echo "  $0 local       # Start local dev with hot-reload"
    echo "  $0 infra      # Start only DB and storage"
    echo "  $0 docker     # Full Docker stack"
}

case "${1:-help}" in
    local)    cmd_local ;;
    infra)    cmd_infra ;;
    docker)   cmd_docker ;;
    seed)     cmd_seed ;;
    stop)     cmd_stop ;;
    delete)   cmd_delete ;;
    reset)    cmd_reset ;;
    help|--help|-h) show_help ;;
    *)        echo "Unknown command: $1"; show_help; exit 1 ;;
esac
