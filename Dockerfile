# Multi-stage build: the build stage needs devDependencies (typescript, tsx)
# to compile src/ and the two local `bindings/*` workspace packages; the
# runtime stage only needs the compiled output and production deps, keeping
# the final image small.

FROM node:22-slim AS build
WORKDIR /app

# Copy manifests first so `npm install` is cached across source-only changes.
COPY package.json package-lock.json ./
COPY bindings/device-registry/package.json bindings/device-registry/package.json
COPY bindings/submission-validator/package.json bindings/submission-validator/package.json
RUN npm install --no-fund --no-audit

COPY . .
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY bindings/device-registry/package.json bindings/device-registry/package.json
COPY bindings/submission-validator/package.json bindings/submission-validator/package.json
RUN npm install --no-fund --no-audit --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/bindings/device-registry/dist ./bindings/device-registry/dist
COPY --from=build /app/bindings/submission-validator/dist ./bindings/submission-validator/dist

# Configuration is supplied entirely via environment variables at `docker run`
# time (DEVICE_REGISTRY_CONTRACT_ID, SUBMISSION_VALIDATOR_CONTRACT_ID, etc.)
# — see README.md for the full list. No .env file is baked into the image.
ENTRYPOINT ["node", "dist/index.js"]
