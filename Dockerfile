# Use Node 22 (matches your local Node v22.x)
FROM node:22-bullseye-slim

WORKDIR /app

# Install tools required for native modules if any (kept small)
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates build-essential python3 && \
    rm -rf /var/lib/apt/lists/*

# copy package manifests first for layer caching
COPY package*.json ./

# install runtime deps (omit dev to keep image smaller)
RUN npm ci --omit=dev

# copy project files
COPY . .

# create uploads dir and give permissions
RUN mkdir -p /app/backend/uploads && chown -R node:node /app/backend/uploads

EXPOSE 5000

# healthcheck against your health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

# run server (uses ESM "type": "module")
CMD ["node", "backend/server.js"]