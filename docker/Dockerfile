# ─── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ─── Stage 2: Builder ─────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build frontend (Vite)
RUN pnpm build

# ─── Stage 3: Runner ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

# Sécurité : utilisateur non-root
RUN addgroup -g 1001 -S nodejs && adduser -S kyc -u 1001

# Copier uniquement les artifacts de build
COPY --from=builder --chown=kyc:nodejs /app/dist ./dist
COPY --from=builder --chown=kyc:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=kyc:nodejs /app/package.json ./package.json
COPY --from=builder --chown=kyc:nodejs /app/drizzle ./drizzle

# Copier pnpm et drizzle-kit pour les migrations
COPY --from=builder --chown=kyc:nodejs /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=kyc:nodejs /app/pnpm-lock.yaml ./pnpm-lock.yaml

USER kyc

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1))"

# Démarrer directement — les migrations sont lancées séparément par le workflow CI/CD
CMD ["node", "dist/index.js"]
