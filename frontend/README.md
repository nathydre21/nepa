# NEPA Frontend

The single, canonical frontend for the NEPA platform. Built with React, TypeScript, and Vite.

## Stack

- **React 18** + **TypeScript**
- **Vite** — dev server and bundler
- **Tailwind CSS** — utility-first styling
- **React Router** — client-side routing
- **Lucide React** — icon library

## Getting Started

```bash
cd frontend
npm install
npm run dev
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |
| `npm test` | Run Jest unit tests |

## Project Structure

```
src/
  components/   # Reusable UI components
  contexts/     # React context providers (Auth, Theme, Notifications, etc.)
  hooks/        # Custom React hooks
  pages/        # Page-level components
  routes/       # App routing configuration
  services/     # API and external service integrations
  styles/       # Global CSS and design tokens
  types/        # Shared TypeScript types
  utils/        # Utility functions
```

## Testing

Unit tests live alongside components (`*.test.tsx`) and in `src/tests/`.
E2E tests are in `tests/e2e/` (Playwright) and `cypress/e2e/` (Cypress).

```bash
npm test                  # Jest unit tests
npx playwright test       # Playwright e2e
npx cypress run           # Cypress e2e
```
