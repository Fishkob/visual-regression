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
