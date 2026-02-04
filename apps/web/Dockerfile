# =============================================================================
# Chat-Pilot Web UI - Cloud Run
# =============================================================================

FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install

# Copy source
COPY . .

# Build args - these get baked in at build time
ARG VITE_API_URL
ARG VITE_WS_URL
ARG VITE_BRIDGE_API_KEY

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_BRIDGE_API_KEY=$VITE_BRIDGE_API_KEY

# Build
RUN pnpm build

# =============================================================================
# Production - nginx
# =============================================================================

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
