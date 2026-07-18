# ---------- build ----------
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/web/package.json apps/web/
RUN pnpm install --no-frozen-lockfile
COPY packages/shared-types packages/shared-types
COPY apps/web apps/web
ARG NEXT_PUBLIC_API_URL=http://localhost:5000
ARG NEXT_PUBLIC_GAME_URL=http://localhost:5173
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_GAME_URL=$NEXT_PUBLIC_GAME_URL
RUN pnpm --filter @neon/shared-types build && pnpm --filter @neon/web build

# ---------- runtime ----------
FROM node:22-alpine AS runtime
RUN corepack enable
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo ./
WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
