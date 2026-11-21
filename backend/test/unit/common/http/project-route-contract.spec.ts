import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryModule, DiscoveryService } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '@/app.module';
import {
  PROJECT_ROUTE_KEY,
  type ProjectRouteKind,
} from '@common/http/project-route.decorator';

// The contract behind ADR-082: every route declares what it is, and the
// declaration is checked against the shape of the route. A missing declaration
// is the dangerous case — the API-key allowlist used to fall through to "no
// check at all", and the guard now fails closed instead, but a route that fails
// closed at runtime is still a route nobody wrote down. This test names it at
// build time.
//
// The routes come from the real application graph (`DiscoveryService`), and the
// set is cross-checked against the committed `swagger.json`, so a route that
// escapes discovery shows up as a gap instead of silently escaping the rule.
interface DeclaredRoute {
  controller: string;
  handler: string;
  /** Nest's own path, `:projectName` and all. */
  path: string;
  method: string;
  kind: ProjectRouteKind | undefined;
}

// A scoped route whose project is named by the row it acts on, not by its path.
// Each entry names what checks the scope instead of the guard.
const SCOPED_FROM_RESOURCE: Record<string, string> = {
  'ShareLinkRevokeController.revoke':
    'the project comes from the link row, and ShareLinkService.revoke asserts the caller scope against it',
  'AssignmentController.complete':
    'the row is the caller’s own assignment (complete filters by assignee id), which is narrower than the project scope',
};

// Routes deliberately outside the published OpenAPI contract: the DLQ operator
// surface, the container liveness probe and log ingestion. Named here instead of
// being quietly exempt from the route rule.
const OUTSIDE_THE_CONTRACT = [
  'GET /admin/dlq',
  'POST /admin/dlq/{id}/retry',
  'GET /health/live',
  'POST /log',
];

function joinPaths(base: string, child: string): string {
  const segments = [base, child]
    .join('/')
    .split('/')
    .filter((segment) => segment.length > 0);
  return `/${segments.join('/')}`;
}

function routesOf(metatype: unknown): DeclaredRoute[] {
  if (typeof metatype !== 'function') return [];
  const controllerPath = Reflect.getMetadata(PATH_METADATA, metatype) as
    string | undefined;
  if (controllerPath === undefined) return [];
  const classKind = Reflect.getMetadata(PROJECT_ROUTE_KEY, metatype) as
    ProjectRouteKind | undefined;
  const prototype = (metatype as { prototype: Record<string, unknown> })
    .prototype;
  const routes: DeclaredRoute[] = [];
  for (const handlerName of Object.getOwnPropertyNames(prototype)) {
    if (handlerName === 'constructor') continue;
    const handler = prototype[handlerName];
    if (typeof handler !== 'function') continue;
    const methodIndex = Reflect.getMetadata(METHOD_METADATA, handler) as
      number | undefined;
    if (methodIndex === undefined) continue;
    const handlerPath = Reflect.getMetadata(PATH_METADATA, handler) as
      string | undefined;
    routes.push({
      controller: (metatype as { name: string }).name,
      handler: handlerName,
      path: joinPaths(controllerPath, handlerPath ?? ''),
      // Nest's own enum: DELETE is 3 and PATCH is 4, so a hand-written array
      // would silently relabel them.
      method: RequestMethod[methodIndex] ?? String(methodIndex),
      kind:
        (Reflect.getMetadata(PROJECT_ROUTE_KEY, handler) as
          ProjectRouteKind | undefined) ?? classKind,
    });
  }
  return routes;
}

function publishedKeys(): Set<string> {
  const swagger = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../../../swagger.json'), 'utf-8'),
  ) as { paths: Record<string, Record<string, unknown>> };
  const keys = new Set<string>();
  for (const [url, methods] of Object.entries(swagger.paths)) {
    for (const method of Object.keys(methods)) {
      if (method === 'parameters') continue;
      keys.add(`${method.toUpperCase()} ${url}`);
    }
  }
  return keys;
}

const discoveredKeys = (routes: DeclaredRoute[]) =>
  routes.map(
    (route) =>
      `${route.method} ${route.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}')}`,
  );

const label = (route: DeclaredRoute) =>
  `${route.controller}.${route.handler} (${route.path})`;

describe('project-route contract', () => {
  let routes: DeclaredRoute[] = [];
  let moduleRef: TestingModule | undefined;

  beforeAll(async () => {
    process.env.POSTGRES_USER = 'test';
    process.env.POSTGRES_PASSWORD = 'test';
    process.env.POSTGRES_DB = 'test';
    process.env.RUSTFS_ENDPOINT = 'localhost';
    process.env.RUSTFS_ACCESS_KEY = 'test';
    process.env.RUSTFS_SECRET_KEY = 'test';
    process.env.RUSTFS_BUCKET = 'test';
    process.env.RUSTFS_PUBLIC_URL = 'http://localhost:9000';
    process.env.CORS_ORIGIN = '*';
    process.env.DATABASE_URL = `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@localhost:5432/${process.env.POSTGRES_DB}`;

    moduleRef = await Test.createTestingModule({
      imports: [AppModule, DiscoveryModule],
    }).compile();
    const discovery = moduleRef.get(DiscoveryService);
    routes = discovery
      .getControllers()
      .flatMap((wrapper) => routesOf(wrapper.metatype));
  }, 60_000);

  afterAll(async () => {
    await moduleRef?.close();
  });

  it('finds every controller, so the rule below cannot be vacuous', () => {
    expect(routes.length).toBeGreaterThan(80);
  });

  it('declares exactly one project-route kind on every route', () => {
    const undeclared = routes
      .filter((route) => route.kind === undefined)
      .map(label);

    expect(undeclared).toEqual([]);
  });

  it('only uses known kinds', () => {
    const unknown = routes
      .filter(
        (route) =>
          route.kind !== undefined &&
          !['scoped', 'spanning', 'global'].includes(route.kind),
      )
      .map(label);

    expect(unknown).toEqual([]);
  });

  it('marks every route that names a project as scoped', () => {
    const mismatched = routes
      .filter(
        (route) =>
          route.path.includes(':projectName') && route.kind !== 'scoped',
      )
      .map((route) => `${label(route)} is ${String(route.kind)}`);

    expect(mismatched).toEqual([]);
  });

  it('gives every scoped route a project to name, or a documented owner', () => {
    const nameless = routes
      .filter(
        (route) =>
          route.kind === 'scoped' &&
          !route.path.includes(':projectName') &&
          !Object.hasOwn(
            SCOPED_FROM_RESOURCE,
            `${route.controller}.${route.handler}`,
          ),
      )
      .map(label);

    expect(nameless).toEqual([]);
  });

  it('keeps the resource-scoped exception list accurate', () => {
    const keys = routes.map((route) => `${route.controller}.${route.handler}`);

    for (const [key, reason] of Object.entries(SCOPED_FROM_RESOURCE)) {
      expect(keys, key).toContain(key);
      expect(reason.length, key).toBeGreaterThan(20);
    }
  });

  it('never declares a cross-project route with a project in its path', () => {
    const contradictory = routes
      .filter(
        (route) =>
          route.kind !== 'scoped' && route.path.includes(':projectName'),
      )
      .map((route) => `${label(route)} is ${String(route.kind)}`);

    expect(contradictory).toEqual([]);
  });

  it('covers the routes the published contract exposes', () => {
    const published = publishedKeys();
    const undocumented = discoveredKeys(routes).filter(
      (key) => !published.has(key),
    );

    expect([...undocumented].sort()).toEqual([...OUTSIDE_THE_CONTRACT].sort());
  });

  it('does not carry a gap for a route that no longer exists', () => {
    const discovered = new Set(discoveredKeys(routes));

    for (const key of OUTSIDE_THE_CONTRACT) {
      expect(discovered, key).toContain(key);
    }
  });
});
