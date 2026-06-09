# ─── Stage 1: Install dependencies ───────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Copy only package files first (better layer caching)
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# ─── Stage 2: Production image ────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Remove any .env files baked into image (use env vars at runtime)
RUN rm -f .env

# Set ownership
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 4000

# Use node directly (not nodemon) in production
CMD ["node", "server.js"]
