FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY . .
RUN npm ci --offline --ignore-scripts && npm run build
FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/data
WORKDIR /app
COPY --from=builder --chown=node:node /app/dist/ ./
RUN mkdir -p /app/data && chown node:node /app/data
USER node
VOLUME /app/data
EXPOSE 3000
CMD ["node","server.mjs"]
