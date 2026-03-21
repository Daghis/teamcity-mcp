FROM node:20-slim AS builder

WORKDIR /app

# Copy package files and .npmrc for Artifactory registry
COPY package.json package-lock.json .npmrc ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY tsconfig.json tsconfig.build.json ./
COPY scripts/ scripts/
COPY src/ src/

# Build
RUN node scripts/build.cjs

# --- Production stage ---
FROM node:20-slim

WORKDIR /app

# Copy package files and .npmrc, then install production deps only
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev && rm -rf /root/.npm

# Copy the built artifact
COPY --from=builder /app/dist/index.js ./dist/index.js

ENV NODE_ENV=production
ENV TRANSPORT_MODE=http
ENV HTTP_PORT=3000

EXPOSE 3000

CMD ["node", "dist/index.js"]
