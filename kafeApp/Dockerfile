# syntax=docker/dockerfile:1

ARG NODE_VERSION=22.20.0

################################################################################
# Stage 1: Build the Ionic/Angular application
FROM node:${NODE_VERSION}-alpine AS builder

# Set working directory
WORKDIR /usr/src/app

# Install build tools required for native packages
RUN apk add --no-cache python3 make g++

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source code
COPY . .

# Build the application for production
RUN npm run build -- --configuration=production

################################################################################
# Stage 2: Serve with nginx
FROM nginx:stable-alpine AS runner

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy built application from builder stage
# Ionic/Angular typically outputs to ./www - adjust if your build outputs to ./dist
COPY --from=builder /usr/src/app/www/ /usr/share/nginx/html/

# Optional: Copy custom nginx configuration if you have one
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD wget -q -O- http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
