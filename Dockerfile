# One image per service, from one build of the whole workspace:
#
#   docker build --target api .       the API, which also runs migrations and club:create
#   docker build --target website .   the reference website
#
# docker-compose.yml builds both. See docs/SELF-HOSTING.md.

# Any Node 22 or later on Alpine; a mirror of the official image works too.
ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./
COPY packages/schema/package.json packages/schema/
COPY packages/engine/package.json packages/engine/
COPY packages/db/package.json packages/db/
COPY packages/api/package.json packages/api/
COPY adapters/website/package.json adapters/website/
RUN npm ci --ignore-scripts
COPY packages packages
COPY adapters adapters
RUN npx tsc --build && npm prune --omit=dev --ignore-scripts

# What running needs: the built code, production dependencies and the
# migrations. Tests, sources and compilers stay behind.
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/schema/package.json packages/schema/
COPY --from=build /app/packages/schema/dist packages/schema/dist
COPY --from=build /app/packages/engine/package.json packages/engine/
COPY --from=build /app/packages/engine/dist packages/engine/dist
COPY --from=build /app/packages/db/package.json packages/db/
COPY --from=build /app/packages/db/dist packages/db/dist
COPY --from=build /app/packages/db/migrations packages/db/migrations
COPY --from=build /app/packages/api/package.json packages/api/
COPY --from=build /app/packages/api/dist packages/api/dist
COPY --from=build /app/adapters/website/package.json adapters/website/
COPY --from=build /app/adapters/website/dist adapters/website/dist
USER node

# The API. The same image runs the one-off commands:
#   node packages/db/dist/migrate.js
#   node packages/api/dist/cli/club-create.js --slug … --name "…"
#   node packages/api/dist/cli/demo-seed.js
FROM runtime AS api
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "packages/api/dist/server.js"]

FROM runtime AS website
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "adapters/website/dist/server.js"]
