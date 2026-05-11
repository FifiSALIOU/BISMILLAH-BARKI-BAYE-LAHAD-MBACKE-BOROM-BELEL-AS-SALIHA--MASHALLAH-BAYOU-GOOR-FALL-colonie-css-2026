# syntax=docker/dockerfile:1
# Image applicative frontend — build Vite + nginx statique (aucune modification du code métier)

# --- Build ---
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Valeur par défaut = même repli que src/lib/api.ts ; surcharger en prod via --build-arg ou CI
ARG VITE_API_BASE_URL=http://127.0.0.1:8000
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build

# --- Runtime ---
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.docker.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
