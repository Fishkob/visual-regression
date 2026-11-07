#!/usr/bin/env bash
# Packs `client-sdk` the way a release does and proves the tarball works for a
# consumer: installs it into an empty project, imports every subpath in Node ESM
# and type-checks a consumer under both `nodenext` and `bundler` resolution.
#
# The dist that tsc emits is only loadable when this check passes: the generated
# sources use extensionless imports, which Node's ESM resolver does not infer
# (see client-sdk/scripts/fix-esm-specifiers.mjs).
#
#   ./scripts/check-client-sdk-package.sh
#
# Environment:
#   PACKAGE_VERSION   version to stamp into the tarball (defaults to the
#                     committed client-sdk/package.json version, which the
#                     client release line owns — the workflow does not pass it).
#   PACKAGE_OUT_DIR   copy the finished tarball here before the work directory
#                     is removed (the release workflow publishes and uploads it).
#
# Prints the tarball path on success. Requires node, npm and pnpm on PATH; no
# network access and no registry login.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

fail() {
  printf '\033[0;31m✗ %s\033[0m\n' "$1" >&2
  exit 1
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
export npm_config_cache="$WORK/npm-cache"
export npm_config_audit=false
export npm_config_fund=false
export npm_config_update_notifier=false

printf '\033[1;36m==> Build client-sdk\033[0m\n'
pnpm --filter ./client-sdk build

# Stage the package the way npm sees it: dist plus the files npm always
# includes. The MIT licence lives at the repo root, so it is copied in here
# instead of being duplicated as a tracked file; `prepack` does the same for an
# actual `npm publish`.
printf '\033[1;36m==> Pack tarball\033[0m\n'
mkdir -p "$WORK/pkg"
cp -R client-sdk/dist "$WORK/pkg/dist"
cp client-sdk/package.json client-sdk/README.md "$WORK/pkg/"
cp LICENSE "$WORK/pkg/LICENSE"

if [ -n "${PACKAGE_VERSION:-}" ]; then
  PACKAGE_VERSION="${PACKAGE_VERSION#v}" node -e '
const fs = require("node:fs");
const file = process.argv[1];
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
manifest.version = process.env.PACKAGE_VERSION;
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
' "$WORK/pkg/package.json"
fi
VERSION="$(node -p 'require(process.argv[1]).version' "$WORK/pkg/package.json")"

(
  cd "$WORK/pkg"
  npm pack --ignore-scripts --pack-destination "$WORK" --silent
) >/dev/null
TARBALL="$(find "$WORK" -maxdepth 1 -name '*.tgz' -print -quit)"
[ -n "$TARBALL" ] || fail 'npm pack produced no tarball'
[ "$(basename "$TARBALL")" = "fishkob-vrt-$VERSION.tgz" ] ||
  fail "unexpected tarball name: $(basename "$TARBALL") (version $VERSION)"
# npm publishes what the manifest declares; a missing licence or a scoped
# package left on the default (restricted) access is a release-time surprise.
# The listing goes to a file: `grep -q` closes the pipe early, and under
# `pipefail` tar's SIGPIPE would read as a failed assertion.
tar -tzf "$TARBALL" >"$WORK/contents.txt"
grep -qx 'package/LICENSE' "$WORK/contents.txt" ||
  fail 'the tarball carries no LICENSE'
ACCESS="$(node -p 'require(process.argv[1]).publishConfig?.access ?? ""' "$WORK/pkg/package.json")"
[ "$ACCESS" = "public" ] || fail "publishConfig.access is '$ACCESS', expected 'public'"

printf '\033[1;36m==> Install into an empty consumer project\033[0m\n'
mkdir -p "$WORK/consumer"
cd "$WORK/consumer"
printf '{"name":"vrt-consumer","private":true,"type":"module"}\n' >package.json
npm install --no-audit --no-fund --no-progress --silent "$TARBALL"

printf '\033[1;36m==> Import every subpath in Node ESM\033[0m\n'
node --input-type=module -e '
const root = await import("@fishkob/vrt");
const client = await import("@fishkob/vrt/client");
const uploadMany = await import("@fishkob/vrt/upload-many");
const playwright = await import("@fishkob/vrt/playwright");

const expect = (label, actual, expected) => {
  if (typeof actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${typeof actual}`);
  }
};

expect("@fishkob/vrt uploadControllerUpload", root.uploadControllerUpload, "function");
expect("@fishkob/vrt ComparisonOutcome", root.ComparisonOutcome, "object");
expect("@fishkob/vrt/client createClient", client.createClient, "function");
expect("@fishkob/vrt/client createConfig", client.createConfig, "function");
expect("@fishkob/vrt/upload-many uploadMany", uploadMany.uploadMany, "function");
expect("@fishkob/vrt/playwright createVrtReporter", playwright.createVrtReporter, "function");
expect("@fishkob/vrt/playwright default export", playwright.default, "function");
process.stdout.write(`  ${Object.keys(root).length} runtime exports\n`);
'

printf '\033[1;36m==> Type-check a consumer (nodenext + bundler)\033[0m\n'
cat >consumer.ts <<'TS'
import { uploadControllerUpload, type ClientOptions, type UploadControllerUploadResponse } from '@fishkob/vrt';
import { createClient, createConfig } from '@fishkob/vrt/client';
import { uploadMany, type CaptureUpload, type CaptureUploadResult } from '@fishkob/vrt/upload-many';
import { createVrtReporter, type PlaywrightReporterOptions } from '@fishkob/vrt/playwright';

export const consumers: [
  typeof uploadControllerUpload,
  typeof createClient,
  typeof createConfig,
  typeof uploadMany,
  typeof createVrtReporter,
] = [uploadControllerUpload, createClient, createConfig, uploadMany, createVrtReporter];

export type ConsumerTypes = [
  ClientOptions,
  UploadControllerUploadResponse,
  CaptureUpload,
  CaptureUploadResult,
  PlaywrightReporterOptions,
];
TS
TSC="$PROJECT_ROOT/client-sdk/node_modules/.bin/tsc"
for resolution in nodenext bundler; do
  module=esnext
  [ "$resolution" = nodenext ] && module=nodenext
  "$TSC" --noEmit --strict --lib es2022,dom --target es2022 \
    --module "$module" --moduleResolution "$resolution" consumer.ts ||
    fail "type check failed with moduleResolution=$resolution"
  printf '  %s ok\n' "$resolution"
done

SIZE="$(du -h "$TARBALL" | cut -f1)"
if [ -n "${PACKAGE_OUT_DIR:-}" ]; then
  mkdir -p "$PACKAGE_OUT_DIR"
  cp "$TARBALL" "$PACKAGE_OUT_DIR/"
  TARBALL="$PACKAGE_OUT_DIR/$(basename "$TARBALL")"
fi

printf '\n\033[0;32m✓ client-sdk packages cleanly: %s (%s)\033[0m\n' "$TARBALL" "$SIZE"
printf '  install: npm i %s\n' "$(basename "$TARBALL")"
