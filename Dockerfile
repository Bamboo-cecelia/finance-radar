FROM node:24-alpine

WORKDIR /app

COPY package.json ./
COPY server.mjs ./
COPY public ./public

ENV PORT=4173
EXPOSE 4173

CMD ["node", "server.mjs"]
