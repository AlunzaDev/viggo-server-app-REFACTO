# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
COPY public ./public
RUN npm run build

# One-shot image that applies pending migrations (`docker compose run migrate`).
FROM builder AS migrate
ENV NODE_ENV=production
ENV PRISMA_HIDE_UPDATE_MESSAGE=1
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV APP_ENV=prod
COPY package.json package-lock.json ./
# Prisma 7 pulls its CLI, engines and Studio in as optional peers of @prisma/client;
# they are only needed to build and migrate, not at runtime.
RUN npm ci --omit=dev --omit=optional
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
EXPOSE 8080
CMD ["node", "dist/app.js"]
