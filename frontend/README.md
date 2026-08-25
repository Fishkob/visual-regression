# Visual Regression Frontend

Vue 3 + Vite + Tailwind + TanStack Query + Reka UI frontend for the Visual Regression Platform.

UI components use shadcn/vue (reka-ui primitives) with Tailwind CSS v4 oklch custom properties and dark mode via `.dark` class.

---

## Development

In the root directory:

```bash
pnpm run dev:frontend
```

Starts at http://localhost:5173

---

## Build

```bash
pnpm run build
```

Output: `frontend/dist/`

---

## Configuration

Environment variables in `.env.local` (if needed):

```
VITE_API_BASE_URL=http://localhost:3000
```

In dev, Vite proxies `/api/*` to `localhost:3000`, so the variable is only needed when the backend is served from a different origin.

---

## Testing

### E2E (Playwright)

The e2e specs (`tests/e2e/*.spec.ts`) drive a browser against the full stack and log in through the UI. This requires a backend admin user:

- The backend creates one on startup from `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` when no user exists yet — set both in `backend/.env.local` (or the compose env) before booting the stack.
- The specs read the same credentials from `E2E_ADMIN_USERNAME` / `E2E_ADMIN_PASSWORD` (defaulting to `admin` / `admin-secret`). Set them when the credentials differ:

```bash
E2E_ADMIN_USERNAME=admin E2E_ADMIN_PASSWORD=admin-secret pnpm test-e2e
```
