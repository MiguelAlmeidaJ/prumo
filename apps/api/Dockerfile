# syntax=docker/dockerfile:1.7
FROM node:22.20.0-alpine3.22 AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.16.0 --activate
WORKDIR /workspace

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM dependencies AS build
ARG DATABASE_URL=postgresql://prumo:prumo@localhost:5432/prumo_build?schema=public
ENV DATABASE_URL=$DATABASE_URL
COPY apps/api apps/api
COPY packages/contracts packages/contracts
COPY packages/database packages/database
RUN pnpm --filter @prumo/database prisma:generate \
    && pnpm --filter @prumo/contracts build \
    && pnpm --filter @prumo/database build \
    && pnpm --filter @prumo/api build \
    && pnpm --filter @prumo/api deploy --prod /opt/prumo/api

FROM node:22.20.0-alpine3.22 AS runtime
ENV NODE_ENV=production \
    APP_ENV=production \
    API_PORT=3333 \
    NODE_OPTIONS=--max-old-space-size=384
WORKDIR /app
COPY --from=build --chown=node:node /opt/prumo/api ./
USER node
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||3333)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/src/main.js"]
