# syntax=docker/dockerfile:1

ARG NODE_VERSION=22.20.0

################################################################################
# Use Node.js Alpine for production build
FROM node:${NODE_VERSION}-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY package.json package-lock.json* ./

# Install ALL dependencies (including devDependencies for Angular CLI)
RUN npm ci

# Install Ionic CLI and Angular CLI globally
RUN npm install -g @ionic/cli @angular/cli

# Copy the rest of the application source
COPY . .

# Expose port 80
EXPOSE 80

# Run ionic serve on port 80
CMD ["ionic", "serve", "--external", "--host", "0.0.0.0", "--port", "80", "--disable-host-check"]