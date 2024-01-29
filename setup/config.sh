#!/bin/bash

set -e

cd "$PROJECT_ROOT_DIR"

# Load configuration settings
CONFIG_FILE="./config.yml"

# Web server configs
WEB_SERVER_TYPE=$(yq e '.webServerType' "$CONFIG_FILE")
WEB_SERVER_HOST=$(yq e '.webServerHost' "$CONFIG_FILE")

ENABLE_SSL=$(yq e '.enableSSL' "$CONFIG_FILE")
SSL_CERT_FILE=$(yq e '.sslCertFile' "$CONFIG_FILE")
SSL_CERT_KEY_FILE=$(yq e '.sslCertKeyFile' "$CONFIG_FILE")

# NodeJS args
APP_NAME=$(yq e '.appName' "$CONFIG_FILE")
APP_PORT=$(yq e '.appPort' "$CONFIG_FILE")
BIND_LOCALHOST=$(yq e '.bindToLocalhost' "$CONFIG_FILE")
AUTH_SERVER_ENDPOINT=$(yq e '.authServerEndpoint' "$CONFIG_FILE")
AUTH_SERVER_APIKEY=$(yq e '.authServerAPIKey' "$CONFIG_FILE")
DB_PATH=$(yq e '.dbPath' "$CONFIG_FILE")
DB_TTL=$(yq e '.dbTTL' "$CONFIG_FILE")
COMPILE_FROM_SOURCE=$(yq e '.compileFromSource' "$CONFIG_FILE")
DB_MAX_INSTANCES=$(yq e '.dbMaxInstances' "$CONFIG_FILE")
DB_MAX_RETRIES=$(yq e '.dbMaxRetries' "$CONFIG_FILE")
QUEUE_TIMEOUT=$(yq e '.queueTimeout' "$CONFIG_FILE")
LOG_FILE=$(yq e '.logFile' "$CONFIG_FILE")
LOG_LEVEL=$(yq e '.logLevel' "$CONFIG_FILE")
ADMIN_API_KEY=$(yq e '.adminAPIKey' "$CONFIG_FILE")

# Docker config
USE_DOCKER=$(yq e '.useDocker' "$CONFIG_FILE")
DOCKER_IMAGE_NAME=$(yq e '.dockerImageName' "$CONFIG_FILE")
DOCKER_CONTAINER_NAME=$(yq e '.dockerContainerName' "$CONFIG_FILE")

# Frameworks
NODE_VERSION=$(yq e '.nodeVersion' "$CONFIG_FILE")
PYTHON_VERSION=$(yq e '.pythonVersion' "$CONFIG_FILE")

# Defaults
MIN_PYTHON_VERSION="3.8"
MIN_SQLITE_VERSION="3.35"
DEFAULT_PYTHON_VERSION="3.12"
DEFAULT_NVM_VERSION="0.39.7"