FROM node:18-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# --- Production stage ---
FROM node:18-alpine

RUN apk add --no-cache tini

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV DB_PATH=/data/wallet_monitor.db

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
