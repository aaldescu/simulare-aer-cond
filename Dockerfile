# Node 22 pentru modulul built-in node:sqlite (fără dependințe native)
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# instalăm doar dependințele de producție (express), cache-friendly
COPY package*.json ./
RUN npm ci --omit=dev

# restul aplicației
COPY . .

ENV PORT=3000
ENV DATA_DIR=/app/data
EXPOSE 3000

# baza SQLite trăiește în /app/data (montat ca volum -> persistă între redeploy-uri)
CMD ["npm", "start"]
