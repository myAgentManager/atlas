# myAgent — cloud image. Runs the whole platform (app + admin) in one container.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY web/package*.json web/
RUN npm ci --prefix web
COPY . .
RUN npm run build --prefix web && rm -rf web/node_modules web/src

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 8787 8788
CMD ["node", "server/index.js"]
