# syntax=docker/dockerfile:1.7

FROM node:22.12.0-alpine3.20 AS builder

WORKDIR /project

ARG APP_ENV=prod

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY src/public ./public

RUN --mount=type=secret,id=backend_env,target=/run/secrets/backend_env,required=true \
    cp /run/secrets/backend_env .env

RUN npm run build

FROM node:22.12.0-alpine3.20

WORKDIR /project

ARG APP_ENV=prod
ENV NODE_ENV=production
ENV APP_ENV=$APP_ENV

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src/public ./public
COPY --from=builder /project/.env ./.env
COPY --from=builder /project/dist ./dist

EXPOSE 8080

CMD ["node", "dist/app.js"]
