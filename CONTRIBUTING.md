# Contributing to NEPA

Thank you for your interest in contributing to NEPA! This guide will help you get started.

## Prerequisites

- Node.js 18+
- Docker & Docker Compose
- PostgreSQL 14+
- Redis 6+
- Git

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/nepa.git
cd nepa
```

### 2. Install Dependencies

```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install

# Install contract dependencies
cd ../contract && npm install
```

### 3. Set Up Environment

```bash
# Backend
cd backend
cp .env.example .env
# Configure database URLs, Stellar keys, Redis connection, etc.

# Frontend
cd ../frontend
cp .env.example .env
# Configure API endpoints
```

### 4. Start Services

```bash
# Start databases
cd backend && npm run db:docker-up

# Run migrations
npm run db:migrate

# Start backend (from backend directory)
npm run dev

# Start frontend (from frontend directory)
cd ../frontend && npm run dev
```

## Running Tests

```bash
# Backend tests
cd backend
npm test                    # All tests
npm run test:unit           # Unit tests
npm run test:integration    # Integration tests
npm run test:e2e            # End-to-end tests

# Frontend tests
cd frontend
npm test                    # Unit tests
npm run test:e2e            # E2E tests

# Linting
npm run lint                # Lint code
npm run type-check          # TypeScript checking
```

## Submitting Changes

### 1. Create a Branch

Use descriptive branch names with prefixes:

```bash
git checkout -b feat/add-payment-history
git checkout -b fix/login-redirect-bug
git checkout -b docs/update-readme
git checkout -b chore/update-dependencies
```

**Branch naming conventions:**
- `feat/` — New features
- `fix/` — Bug fixes
- `docs/` — Documentation changes
- `chore/` — Maintenance tasks
- `test/` — Adding or updating tests
- `refactor/` — Code refactoring

### 2. Make Changes

- Follow the code style guidelines below
- Write tests for new functionality
- Update documentation if needed

### 3. Commit

Write clear, concise commit messages:

```bash
git commit -m "feat: add payment history page"
git commit -m "fix: resolve login redirect loop"
git commit -m "docs: update API documentation"
```

### 4. Push and Create PR

```bash
git push origin your-branch-name
```

Then create a Pull Request on GitHub with:
- Clear description of changes
- Link to related issues
- Screenshots (if UI changes)

## Code Style Guidelines

### General

- Use TypeScript for all new code
- Write self-documenting code with meaningful names
- Keep functions small and focused
- Add comments for complex logic

### TypeScript/JavaScript

- Follow ESLint rules (`npm run lint`)
- Use Prettier for formatting (`npm run format`)
- Prefer `const` over `let`
- Use async/await over callbacks

### React

- Use functional components with hooks
- Keep components small and reusable
- Use proper prop typing with TypeScript interfaces

### Git

- One logical change per commit
- Never commit directly to `main`
- Keep PRs focused on a single feature or fix

## Need Help?

- Check existing issues for something to work on
- Open a discussion for questions
- Review the [README](./README.md) for architecture overview
