#!/bin/bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

usage() {
    echo "Usage: ./scripts/quality.sh [visual|a11y] [--update] [--no-build]"
}

MODE="${1:-}"
case "$MODE" in
    visual|a11y) ;;
    *)
        usage
        exit 1
        ;;
esac
shift

UPDATE=0
NO_BUILD=0
for arg in "$@"; do
    case "$arg" in
        --update) UPDATE=1 ;;
        --no-build) NO_BUILD=1 ;;
        *)
            echo "Unknown option: $arg"
            usage
            exit 1
            ;;
    esac
done

if [ "$UPDATE" -eq 1 ] && [ "$MODE" != "visual" ]; then
    echo "--update is only supported for the visual suite"
    exit 1
fi

IMAGE="${QUALITY_IMAGE:-visual-regression-frontend-quality:local}"
# Committed baselines are Linux amd64 and CI runs on an x86_64 runner.
PLATFORM="${QUALITY_PLATFORM:-linux/amd64}"

if [ "$NO_BUILD" -eq 0 ]; then
    docker build --platform "$PLATFORM" -f frontend/Dockerfile.quality -t "$IMAGE" .
fi

mkdir -p frontend/test-results frontend/playwright-report
chmod a+rwX frontend/test-results frontend/playwright-report
DOCKER_ARGS=(
    --platform "$PLATFORM"
    --rm
    --shm-size=1g
    -e "CI=${CI:-}"
    -v "$PROJECT_ROOT/frontend/test-results:/app/frontend/test-results"
    -v "$PROJECT_ROOT/frontend/playwright-report:/app/frontend/playwright-report"
)

mkdir -p frontend/tests/quality/__screenshots__

if [ "$UPDATE" -eq 1 ]; then
    chmod -R a+rwX frontend/tests/quality/__screenshots__
    DOCKER_ARGS+=(
        -v "$PROJECT_ROOT/frontend/tests/quality/__screenshots__:/app/frontend/tests/quality/__screenshots__"
    )
    docker run "${DOCKER_ARGS[@]}" "$IMAGE" pnpm "test-$MODE" --update-snapshots=all
else
    DOCKER_ARGS+=(
        -v "$PROJECT_ROOT/frontend/tests/quality/__screenshots__:/app/frontend/tests/quality/__screenshots__:ro"
    )
    docker run "${DOCKER_ARGS[@]}" "$IMAGE" pnpm "test-$MODE"
fi
