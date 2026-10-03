FROM node:24-slim
WORKDIR /app
COPY server.mjs ./
ENV NODE_ENV=production
USER node
CMD ["node", "server.mjs"]
