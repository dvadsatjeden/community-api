FROM node:24-alpine AS build
WORKDIR /web
COPY community-web/package*.json ./
RUN npm ci
COPY community-web/ ./
ARG VITE_API_BASE_URL=https://api.dvadsatjeden.org
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:alpine
COPY nginx/standalone.conf /etc/nginx/conf.d/default.conf
COPY --from=build /web/dist /usr/share/nginx/html
HEALTHCHECK --interval=30s --timeout=5s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
