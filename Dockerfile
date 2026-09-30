FROM node:20-alpine
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
COPY data/db.seed.json ./data/db.seed.json
ENV HOST=0.0.0.0 PORT=3000 DATA_DIR=/data
EXPOSE 3000
CMD ["node", "server.js"]
