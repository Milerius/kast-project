FROM node:20.17-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages packages
COPY integration-tests/package.json integration-tests/
COPY scenario-tests/package.json scenario-tests/
RUN pnpm install --frozen-lockfile

FROM deps AS build
# Next.js 15.5 statically prerenders routes at build time. The app's env guard
# throws at module eval when NEXT_PUBLIC_PRIVY_APP_ID is missing, so we need
# something (anything) set during the build. Real values are injected via the
# runtime `environment:` block in docker-compose.
ARG NEXT_PUBLIC_PRIVY_APP_ID=clpkbuildplaceholder00000
ARG NEXT_PUBLIC_SOLANA_RPC_URL=https://build.invalid
ARG NEXT_PUBLIC_BASE_RPC_URL=https://build.invalid
ENV NEXT_PUBLIC_PRIVY_APP_ID=${NEXT_PUBLIC_PRIVY_APP_ID} \
    NEXT_PUBLIC_SOLANA_RPC_URL=${NEXT_PUBLIC_SOLANA_RPC_URL} \
    NEXT_PUBLIC_BASE_RPC_URL=${NEXT_PUBLIC_BASE_RPC_URL}
COPY . .
RUN pnpm --filter @kast/web build

FROM node:20.17-alpine AS runner
WORKDIR /app
COPY --from=build /repo /app
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
