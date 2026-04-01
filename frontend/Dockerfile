# STAGE 1: Build the React app
FROM node:20-alpine3.21 AS builder

WORKDIR /app

# Install dependencies first (separate layer for better cache reuse)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source code
COPY . .

# Declare VITE env vars with hardcoded defaults so they are always baked
# into the bundle. /api is the correct value for this single-origin deployment
# where Nginx proxies /api/ to the FastAPI backend.
#
# VITE_API_BASE_URL: used by src/lib/api.ts (Axios base URL)
# VITE_API_URL:      used by src/pages/Explore.tsx (SSE EventSource URL)
ARG VITE_API_BASE_URL=/api
ARG VITE_API_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# STAGE 2: Serve with Nginx
FROM nginx:1.27-alpine

# Remove default Nginx config and replace with ours
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built React app from stage 1
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost/ > /dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
