# Stage 1: Builder
FROM node:20-alpine AS builder

RUN npm install -g pnpm@8

WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml ./
COPY pnpm-lock.yaml* ./

# Copy shared package
COPY packages/shared/ packages/shared/

# Copy service
COPY services/contract-broker/ services/contract-broker/

# Install dependencies and build
RUN pnpm install --frozen-lockfile
RUN pnpm -r run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Copy workspace configuration for pnpm
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules/ node_modules/

# Copy shared package dist and node_modules
COPY --from=builder /app/packages/shared/dist/ packages/shared/dist/
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/node_modules/ packages/shared/node_modules/

# Copy service dist and node_modules
COPY --from=builder /app/services/contract-broker/dist/ services/contract-broker/dist/
COPY --from=builder /app/services/contract-broker/package.json services/contract-broker/
COPY --from=builder /app/services/contract-broker/node_modules/ services/contract-broker/node_modules/

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

USER appuser

EXPOSE 4000

WORKDIR /app/services/contract-broker

CMD ["node", "dist/server.js"]
