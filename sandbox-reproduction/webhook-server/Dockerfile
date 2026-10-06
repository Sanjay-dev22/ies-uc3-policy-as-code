# Build context is this repository's root (see docker-compose.yml's `build:`
# block), so this can pull in src/ alongside sandbox-reproduction/webhook-server/.
FROM node:22-alpine
WORKDIR /app
COPY src ./src
COPY sandbox-reproduction/webhook-server/server.js ./server.js
COPY sandbox-reproduction/webhook-server/package.json ./package.json
EXPOSE 3002
CMD ["node", "server.js"]
