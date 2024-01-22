#!/bin/bash

set -e

cd "$PROJECT_ROOT_DIR"

# Load configuration settings
CONFIG_FILE="./config.yml"

# Web server configs
WEB_SERVER_TYPE=$(yq e '.webServerType' "$CONFIG_FILE")
WEB_SERVER_HOST=$(yq e '.webServerHost' "$CONFIG_FILE")
WEB_SERVER_PORT=$(yq e '.webServerPort' "$CONFIG_FILE")
WEB_SERVER_ENABLE_SSL=$(yq e '.webServerEnableSSL' "$CONFIG_FILE")
WEB_SERVER_SSL_PORT=$(yq e '.webServerSSLPort' "$CONFIG_FILE")
WEB_SERVER_CERT_FILE=$(yq e '.webServerSSLCertificateFile' "$CONFIG_FILE")
WEB_SERVER_CERT_KEY_FILE=$(yq e '.webServerSSLCertificateKeyFile' "$CONFIG_FILE")

# NodeJS args
APP_NAME=$(yq e '.appName' "$CONFIG_FILE")
APP_PORT=$(yq e '.appPort' "$CONFIG_FILE")
AUTH_SERVER_ENDPOINT=$(yq e '.authServerEndpoint' "$CONFIG_FILE")
AUTH_SERVER_APIKEY=$(yq e '.authServerAPIKey' "$CONFIG_FILE")
DB_PATH=$(yq e '.dbPath' "$CONFIG_FILE")
DB_TTL=$(yq e '.dbTTL' "$CONFIG_FILE")
COMPILE_FROM_SOURCE=$(yq e '.compileFromSource' "$CONFIG_FILE")

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

# show config summary
echo "Configuration"
echo "------------"
echo "# Web Server Config:"
echo "Web Server Type: $WEB_SERVER_TYPE"
echo "Web Server Host: $WEB_SERVER_HOST"
echo "Web Server Port: $WEB_SERVER_PORT"
echo "Enable SSL: $WEB_SERVER_ENABLE_SSL"
echo "SSL Certificate File: $WEB_SERVER_CERT_FILE"
echo "SSL Certificate Key File: $WEB_SERVER_CERT_KEY_FILE"
echo "------------"
echo "# App Config:"
echo "App Name: $APP_NAME"
echo "App Port: $APP_PORT"
echo "Auth Server Endpoint: $AUTH_SERVER_ENDPOINT"
echo "Auth Server API Key: $AUTH_SERVER_APIKEY"
echo "Database Path: $DB_PATH"
echo "Database TTL: $DB_TTL"
echo "Compile from source: $COMPILE_FROM_SOURCE"
echo "------------"
echo "# Docker Config:"
echo "Use Docker: $USE_DOCKER"
echo "Docker Image Name: $DOCKER_IMAGE_NAME"
echo "Docker Container Name: $DOCKER_CONTAINER_NAME"
echo "------------"
echo "# Frameworks:"
echo "NodeJS Version: $NODE_VERSION"
echo "Python Version: $PYTHON_VERSION"
echo ""

read -p "Are you sure you wish to proceed with these settings? (Y/N): " CONFIRMATION

if [[ "$CONFIRMATION" =~ ^[yY]([eE][sS])?$ ]]; then
    echo "Proceeding with installation.."
else
    echo "Setup aborted."
    exit 1
fi

export WEB_SERVER_TYPE WEB_SERVER_HOST WEB_SERVER_PORT WEB_SERVER_ENABLE_SSL WEB_SERVER_SSL_PORT WEB_SERVER_CERT_FILE WEB_SERVER_CERT_KEY_FILE APP_NAME APP_PORT AUTH_SERVER_ENDPOINT AUTH_SERVER_APIKEY DB_PATH DB_TTL COMPILE_FROM_SOURCE USE_DOCKER DOCKER_IMAGE_NAME DOCKER_CONTAINER_NAME NODE_VERSION PYTHON_VERSION
