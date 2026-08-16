# ============================================================
# HELIOS CORE v2.1.0 — Dockerfile Multi-Stage
# Build ligero + Runtime optimizado
# Integra: BudgetManager, CloneCommunicator, CAPTCHASolver, TokenEstimator
# ============================================================

# --- STAGE 1: Builder ---
FROM node:22-alpine AS builder

WORKDIR /app

# Instalar dependencias de build
RUN apk add --no-cache python3 make g++

# Copiar manifests primero (cache de layers)
COPY package.json package-lock.json* tsconfig.json ./
RUN npm ci --only=production && npm cache clean --force

# Copiar fuente y compilar
COPY src/ ./src/
RUN npx tsc --outDir dist

# --- STAGE 2: Runtime ---
FROM node:22-alpine AS runtime

WORKDIR /app

# Crear usuario no-root
RUN addgroup -g 1001 -S helios && \
    adduser -S helios -u 1001

# Instalar solo dependencias de runtime
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force && \
    npm install -g pm2

# Copiar artefactos compilados
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/ui ./ui

# Crear directorio de datos con permisos correctos
RUN mkdir -p /app/.helios && chown -R helios:helios /app

USER helios

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

EXPOSE 3000 3001

CMD ["node", "dist/main.js"]
