#!/usr/bin/env node
// tsc preserves the specifiers it is given, and @hey-api/openapi-ts writes them
// extensionless (`./sdk.gen`, `./client`). Node's ESM resolver neither infers
// extensions nor resolves a directory's `index.js`, so the emitted package
// would only load through a bundler. This rewrites every relative specifier in
// the build output to an explicit path under `dist/`.
//
// Idempotent: specifiers that already carry an extension are left alone.
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const DIST = path.resolve(import.meta.dirname, "..", "dist");

const SPECIFIER_PATTERNS = [
  // import x from './y'; export * from './y'
  /(\bfrom\s*)(["'])(\.[^"']*)\2/g,
  // import './y'
  /(\bimport\s+)(["'])(\.[^"']*)\2/g,
  // import('./y')
  /(\bimport\s*\(\s*)(["'])(\.[^"']*)\2/g,
];

const hasExtension = (specifier) => /\.[cm]?jsx?$|\.json$/.test(specifier);

async function exists(target) {
  try {
    return (await stat(target)).isFile();
  } catch {
    return false;
  }
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (/\.js$|\.d\.ts$/.test(entry.name)) {
      yield full;
    }
  }
}

// Resolves a relative specifier to its emitted file, as an ESM path.
async function resolveSpecifier(file, specifier) {
  const target = path.resolve(path.dirname(file), specifier);
  const candidates = [
    [`${target}.js`, `${specifier}.js`],
    [path.join(target, "index.js"), `${specifier.replace(/\/$/, "")}/index.js`],
    // A declaration file may name a module that emits no runtime file; the
    // `.js` form still resolves back to the `.d.ts` for TypeScript.
    [`${target}.d.ts`, `${specifier}.js`],
    [
      path.join(target, "index.d.ts"),
      `${specifier.replace(/\/$/, "")}/index.js`,
    ],
  ];
  for (const [absolute, rewritten] of candidates) {
    if (await exists(absolute)) {
      return rewritten;
    }
  }
  return null;
}

async function rewrite(file) {
  const source = await readFile(file, "utf8");
  let output = source;
  const unresolved = new Set();

  for (const pattern of SPECIFIER_PATTERNS) {
    const matches = [...source.matchAll(pattern)];
    for (const match of matches) {
      const [whole, prefix, quote, specifier] = match;
      if (!specifier.startsWith(".") || hasExtension(specifier)) {
        continue;
      }
      const rewritten = await resolveSpecifier(file, specifier);
      if (rewritten === null) {
        unresolved.add(specifier);
        continue;
      }
      output = output.replace(whole, `${prefix}${quote}${rewritten}${quote}`);
    }
  }

  if (unresolved.size > 0) {
    throw new Error(
      `${path.relative(DIST, file)}: no emitted file for ${[...unresolved].join(", ")}`,
    );
  }
  if (output !== source) {
    await writeFile(file, output);
    return true;
  }
  return false;
}

const rewritten = [];
for await (const file of walk(DIST)) {
  if (await rewrite(file)) {
    rewritten.push(path.relative(DIST, file));
  }
}
console.log(`fix-esm-specifiers: rewrote ${rewritten.length} file(s)`);
