# syntax=docker/dockerfile:1

# Base MySQL image
FROM mysql:latest

# Copy your SQL or shell scripts to MySQL’s init directory
# These scripts run automatically on first container startup
COPY ./scripts/ /docker-entrypoint-initdb.d/

