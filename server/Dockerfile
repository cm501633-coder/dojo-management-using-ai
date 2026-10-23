FROM node:22-alpine
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src ./src
COPY migrations ./migrations
RUN npm run build && npm prune --omit=dev
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate && npm start"]
