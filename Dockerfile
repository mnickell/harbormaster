FROM node:20-alpine AS builder

RUN apk add --no-cache util-linux git

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts ./
COPY src/ ./src/
RUN npm run build

FROM node:20-alpine

RUN apk add --no-cache util-linux git

WORKDIR /app
COPY --from=builder /app/.output ./.output

EXPOSE 8585
CMD ["node", ".output/server/index.mjs"]
