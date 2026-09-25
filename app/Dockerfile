FROM node:24-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

EXPOSE 8081
CMD ["npm", "run", "web", "--", "--host", "lan", "--port", "8081"]
