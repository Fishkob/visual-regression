#!/bin/bash
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

log()   { echo -e "${CYAN}==>${NC} $1"; }
warn()  { echo -e "${YELLOW}==> Warning:${NC} $1"; }
success(){ echo -e "${GREEN}✓${NC} $1"; }

gen_secret() {
    local secret
    secret="$(openssl rand -hex 24 2>/dev/null || head -c 48 /dev/urandom | od -An -tx1 | tr -d ' \n')"
    if [ -z "$secret" ]; then
        echo "Failed to generate a secret. Aborting." >&2
        exit 1
    fi
    printf '%s' "$secret"
}

check_docker() {
    if ! command -v docker >/dev/null 2>&1; then
        echo "Docker is not installed."
        echo "  macOS: https://docs.docker.com/desktop/install/mac/"
        echo "  Linux: https://docs.docker.com/engine/install/"
        exit 1
    fi
    if ! docker info >/dev/null 2>&1; then
        echo "Docker is installed but the daemon is not running."
        echo "  Start Docker Desktop (or: systemctl start docker) and retry."
        exit 1
    fi
    if ! docker compose version >/dev/null 2>&1; then
        echo "Docker Compose v2 is required. Update Docker and retry."
        exit 1
    fi
    if ! command -v curl >/dev/null 2>&1; then
        echo "curl is required but not installed."
        echo "  macOS: curl ships with the OS.  Linux: install via your package manager (e.g. apt install curl)."
        exit 1
    fi
}

ensure_env() {
    if [ -f .env ]; then
        log "Using existing .env (not overwriting)."
        return 0
    fi
    if [ ! -f .env.example ]; then
        warn ".env.example not found — cannot generate .env."
        exit 1
    fi
    log "Creating .env with generated secrets..."
    cp .env.example .env.tmp
    sed -i.bak \
        -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(gen_secret)|" \
        -e "s|^RUSTFS_ROOT_PASSWORD=.*|RUSTFS_ROOT_PASSWORD=$(gen_secret)|" \
        -e "s|^BOOTSTRAP_ADMIN_PASSWORD=.*|BOOTSTRAP_ADMIN_PASSWORD=$(gen_secret)|" \
        -e "s|^ADMIN_API_KEY=.*|ADMIN_API_KEY=$(gen_secret)|" \
        .env.tmp
    rm -f .env.tmp.bak
    mv .env.tmp .env
    success "Secrets generated into .env"
}

source_env() {
    set -a
    # shellcheck disable=SC1091 # .env is generated at runtime, not present for shellcheck
    [ -f .env ] && source .env
    set +a
    BACKEND_PORT="${BACKEND_PORT:-3000}"
    FRONTEND_PORT="${FRONTEND_PORT:-80}"
}

wait_for() {
    local url="$1" name="$2" tries="${3:-60}"
    log "Waiting for $name..."
    for _ in $(seq 1 "$tries"); do
        if curl -sf "$url" >/dev/null 2>&1; then
            success "$name ready"
            return 0
        fi
        sleep 2
    done
    warn "$name did not become ready."
    echo "--- docker compose ps ---"
    docker compose ps || true
    echo "--- backend/db-migrate logs (tail) ---"
    docker compose logs --tail=100 backend db-migrate 2>/dev/null || true
    return 1
}

hint_db_mismatch() {
    if docker compose logs db-migrate 2>/dev/null | grep -q "P1000"; then
        warn "The database rejected the credentials from .env (P1000)."
        warn "This usually means .env was regenerated but the postgres volume still holds an older password."
        warn "Recover with:  ./install.sh --fresh   (wipes the database volume and starts clean)"
    fi
}

cmd_install() {
    check_docker
    ensure_env
    source_env
    log "Building and starting the stack (first build takes a few minutes)..."
    if [ "${NO_BUILD:-0}" = "1" ]; then
        docker compose up -d
    else
        docker compose up -d --build
    fi
    if ! wait_for "http://localhost:${BACKEND_PORT}/api/v1/health/live" "backend"; then
        hint_db_mismatch
        exit 1
    fi
    wait_for "http://localhost:${FRONTEND_PORT}/" "frontend" || exit 1

    local admin_user admin_pw
    admin_user="$(sed -n 's/^BOOTSTRAP_ADMIN_USERNAME=//p' .env)"
    admin_pw="$(sed -n 's/^BOOTSTRAP_ADMIN_PASSWORD=//p' .env)"

    echo ""
    echo "=============================================="
    echo "  Visual Regression is running!"
    echo ""
    echo "  Frontend: http://localhost:${FRONTEND_PORT}"
    echo "  Backend:  http://localhost:${BACKEND_PORT}"
    echo "  RustFS:   http://localhost:9000  (console: :9001)"
    echo ""
    echo "  Admin login:  ${admin_user:-admin} / ${admin_pw:-<unset>}"
    echo "  Remove BOOTSTRAP_ADMIN_* from .env after first login."
    echo ""
    echo "  Next:"
    echo "    ./install.sh --seed   (demo data, needs pnpm)"
    echo "    ./install.sh --fresh  (wipe all data + start clean)"
    echo "    ./install.sh logs     (follow logs)"
    echo "    ./install.sh down     (stop)"
    echo "=============================================="
}

cmd_seed() {
    if ! command -v pnpm >/dev/null 2>&1; then
        warn "Seeding needs pnpm (Node >= 20.19) on the host."
        warn "The seed scripts are not shipped in the Docker images. Install pnpm, or create a project via the web UI instead."
        return 0
    fi
    if [ ! -d node_modules ]; then
        log "Installing workspace deps (needed by the seed scripts)..."
        pnpm install
    fi
    ./scripts/dev.sh seed
}

SEED=0
NO_BUILD=0
FRESH=0
for arg in "$@"; do
    case "$arg" in
        --seed)     SEED=1 ;;
        --no-build) NO_BUILD=1 ;;
        --fresh)    FRESH=1 ;;
    esac
done

case "${1:-install}" in
    up)
        check_docker
        if [ "$FRESH" = "1" ]; then
            log "Wiping all data (database + storage volumes)..."
            docker compose down -v
        fi
        ensure_env
        source_env
        docker compose up -d --build
        if ! wait_for "http://localhost:${BACKEND_PORT}/api/v1/health/live" "backend"; then
            hint_db_mismatch
            exit 1
        fi
        ;;
    down)
        check_docker
        docker compose down
        ;;
    logs)
        shift
        check_docker
        docker compose logs -f --tail=100 "$@"
        ;;
    install|""|-*)
        if [ "$FRESH" = "1" ]; then
            check_docker
            log "Wiping all data (database + storage volumes)..."
            docker compose down -v
        fi
        cmd_install
        if [ "$SEED" = "1" ]; then
            cmd_seed
        fi
        ;;
    *)
        echo "Unknown command: $1"
        echo "Usage: $0 [up|down|logs|--seed|--no-build]"
        exit 1
        ;;
esac
