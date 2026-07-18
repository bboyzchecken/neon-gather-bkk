# ---------- build ----------
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/game/package.json apps/game/
RUN pnpm install --no-frozen-lockfile
COPY packages/shared-types packages/shared-types
COPY apps/game apps/game
ARG VITE_API_URL=http://localhost:5000
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @neon/shared-types build && pnpm --filter @neon/game build

# ---------- serve ----------
FROM nginx:alpine
COPY apps/game/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/game/dist /usr/share/nginx/html
EXPOSE 80
