# ESS portal + Redis in one image, for Cloudflare Containers.
# Built by wrangler with the repo root as context (see wrangler.jsonc).
# The data is in D1 and R2, reached through the Worker (see ess-box.sh).

# --- Build the app ---
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Runtime: Node 20 + Redis + curl (bridge health check) ---
FROM node:20-slim AS production

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      redis-server curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

ENV NODE_ENV=production

COPY --from=build /app/build ./build
COPY --from=build /app/migrations ./migrations
# start.sh's migrate/seed scripts (they import the schema, the password hash
# and the D1 bridge client from here).
COPY --from=build /app/src/lib/server ./src/lib/server
COPY start.sh ./start.sh
COPY cloudflare/ess-box.sh /usr/local/bin/ess-box
RUN chmod +x ./start.sh /usr/local/bin/ess-box

EXPOSE 3000
ENV PORT=3000
ENV HOST=0.0.0.0

ENTRYPOINT ["/usr/local/bin/ess-box"]
CMD []
