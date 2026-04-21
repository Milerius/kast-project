FROM node:20.17-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages packages
COPY integration-tests/package.json integration-tests/
COPY scenario-tests/package.json scenario-tests/
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
COPY . .
RUN pnpm --filter @kast/web build

FROM node:20.17-alpine AS runner
WORKDIR /app
COPY --from=build /repo /app
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
