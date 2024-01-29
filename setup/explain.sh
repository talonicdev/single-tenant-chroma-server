#!/bin/bash

set -e

cd "$PROJECT_ROOT_DIR"

function explain_web_server_setup() {
    case "$WEB_SERVER_TYPE" in
        "apache")
            if ! apache2 -v > /dev/null 2>&1; then
                echo "- Apache will be installed on the host server."
            fi
            if [ "$ENABLE_SSL" = true ]; then
                echo "- SSL will be enabled for secure HTTPS connections."
                echo "- HTTP traffic will be redirected to HTTPS."
                echo "- A valid SSL certificate file is required at $SSL_CERT_FILE."
                echo "- A valid private key file for the SSL certificate is required at $SSL_CERT_KEY_FILE."
                echo "- An Apache virtual host will be configured at $WEB_SERVER_HOST:443."
            else
                echo "- An Apache virtual host will be configured at $WEB_SERVER_HOST:80."
            fi
                echo "- Existing configurations for the host will be overwritten."
            ;;
        "nginx")
            if ! nginx -v > /dev/null 2>&1; then
                echo "- Nginx will be installed on the server."
            fi
            if [ "$ENABLE_SSL" = true ]; then
                echo "- SSL will be enabled for secure HTTPS connections."
                echo "- HTTP traffic will be redirected to HTTPS."
                echo "- A valid SSL certificate file is required at $SSL_CERT_FILE."
                echo "- A valid private key file for the SSL certificate is required at $SSL_CERT_KEY_FILE."
                echo "- An Nginx server block will be configured at $WEB_SERVER_HOST:443."
            else
                echo "- An Nginx server block will be configured at $WEB_SERVER_HOST:80."
            fi
                echo "- Existing configurations for the host will be overwritten."
            ;;
        "")
            echo " - No web server configuration will be performed."
            return
            ;;
        *)
            echo " - Unknown web server type. No web server configuration will be performed."
            return
            ;;
    esac
}

function explain_host_setup() {
    if [ ! -d "$DB_PATH" ]; then
    echo "- The directory '$DB_PATH' will be created on the host server."
    fi
    if [ "$USE_DOCKER" = true ]; then
        if ! docker -v > /dev/null 2>&1; then
            echo "- Docker will be installed on the host server."
        fi
        echo "- Docker will be used to containerize the application."
        echo "- A Docker image using Ubuntu 20.04 LTS named '$DOCKER_IMAGE_NAME' will be created."
        echo "- NodeJS version $NODE_VERSION and Python version $PYTHON_VERSION will be installed on the image."
        echo "- SQLite version $MIN_SQLITE_VERSION, ChromaDB and PM2 will also be installed on the image"
        if [ "$COMPILE_FROM_SOURCE" = true ]; then
            echo "- Typescript will be installed on the image."
            echo "- The app will be directly compiled from source on the image."
        else
            echo "- The app will be run from the shipped dist."
        fi
        echo "- A Docker container named '$DOCKER_CONTAINER_NAME' will be started from the image."
        echo "- The container will mount '$DB_PATH' for persistent databases."
        [ -n "$LOG_FILE" ] && echo " - The container will mount $LOG_FILE for persistent log files."
    else
        echo "- Docker will not be used."
        if ! nvm -v > /dev/null 2>&1; then
            echo "- NVM will be installed on the host server."
        fi
        echo "- NodeJS version $NODE_VERSION will be installed via NVM on the host server."
        if ! pm2 -v > /dev/null 2>&1; then
            echo "- PM2 will be installed on the host server."
        fi
        if ! command -v python$PYTHON_VERSION &>/dev/null; then
            echo "- Python version $PYTHON_VERSION  with pip will be installed on the host server."
        fi
        if ! command -v chroma &>/dev/null; then
            echo "- ChromaDB will be installed on the host server."
        fi
        echo "- Python binaries for SQLite version $MIN_SQLITE_VERSION will be installed on the host server"
        echo "- Chroma CLI will be modified to use the new SQLite binaries."
        if [ "$COMPILE_FROM_SOURCE" = true ]; then
            if ! command -v tsc &> /dev/null; then
                echo "- Typescript will be installed on the host server"
            fi
            echo "- The app will be directly compiled from source."
        else
            echo "- The app will be run from the shipped dist."
        fi
    fi
}

function explain_app_setup() {
    echo "- The NodeJS app will be named '$APP_NAME' in PM2."
    echo "- The app will listen on port $APP_PORT."
    if [ -z "$AUTH_SERVER_ENDPOINT" ]; then
        echo "- User tokens will not be validated."
        echo "- Provided chroma_client_auth_credentials will be expected to be RFC 4122 compliant UUID."
    else
        echo "- User tokens will be validated externally."
        echo "- The app will GET '$AUTH_SERVER_ENDPOINT' with chroma_client_auth_credentials as Bearer tokens."
        echo "- The auth endpoint is expected to return JSON containing the property 'userId', optionally as a sub-property of 'data'."
        [ -n "$AUTH_SERVER_APIKEY" ] && echo " - An 'x-api-key' header will be set to '$AUTH_SERVER_APIKEY' when validating tokens."
    fi
    echo "- User databases will be stored at '$DB_PATH'."
    echo "- ChromaDB server instances will shutdown after $DB_TTL ms of inactivity."
    echo "- The app will keep a maximum of $DB_MAX_INSTANCES ChromaDB instances running."
    echo "- The app will retry to start instances $DB_MAX_RETRIES times before giving up."
    echo "- Requests will be rejected after $QUEUE_TIMEOUT ms of waiting in the queue."
    if [ -n "$LOG_FILE" ]; then
        echo "- Logs will be written to $LOG_FILE."
    else
        echo "- Logs will be written to stdout/stderr."
    fi
    echo "- The log level will be '$LOG_LEVEL'."
    if [ -n "$ADMIN_API_KEY" ]; then
        echo "- The app will provide an admin and monitoring endpoint accessible with the specified 'x-api-key'."
    else
        echo "- The app will not provide an admin and monitoring endpoint."
    fi
    if [ "$BIND_LOCALHOST" = true ]; then
        echo "- The app will only be directly available from localhost."
    else
        echo "- The app can be directly accessed remotely."
    fi
    if [ "$ENABLE_SSL" = true ]; then
        case "$WEB_SERVER_TYPE" in
            "apache") 
                echo "- SSL handshakes will be handled by Apache"
                ;;
            "nginx") 
                echo "- SSL handshakes will be handled by Nginx"
                ;;
            "") 
                echo "- SSL will be enabled for secure HTTPS connections."
                echo "- A valid SSL certificate file is required at '$SSL_CERT_FILE'."
                echo "- A valid private key file for the SSL certificate is required at '$SSL_CERT_KEY_FILE'."
                ;;
            *) 
                echo "- SSL will be enabled for secure HTTPS connections."
                echo "- A valid SSL certificate file is required at '$SSL_CERT_FILE'."
                echo "- A valid private key file for the SSL certificate is required at '$SSL_CERT_KEY_FILE'."
                ;;
        esac
    fi
}


# show config summary
echo "Configuration:"
echo "------------"
echo "# Web Server Config:"
echo "Web Server Type: $WEB_SERVER_TYPE"
echo "Web Server Host: $WEB_SERVER_HOST"
echo "------------"
echo "# SSL Config:"
echo "Enable SSL: $ENABLE_SSL"
echo "SSL Certificate File: $SSL_CERT_FILE"
echo "SSL Certificate Key File: $SSL_CERT_KEY_FILE"
echo "------------"
echo "# App Config:"
echo "App Name: $APP_NAME"
echo "App Port: $APP_PORT"
echo "Auth Server Endpoint: $AUTH_SERVER_ENDPOINT"
echo "Auth Server API Key: $AUTH_SERVER_APIKEY"
echo "Admin API Key: (not shown)"
echo "Database Path: $DB_PATH"
echo "Database TTL: $DB_TTL"
echo "Compile from source: $COMPILE_FROM_SOURCE"
echo "Maximum Database Instances: $DB_MAX_INSTANCES"
echo "Maximum Database Retries: $DB_MAX_RETRIES"
echo "Queue Timeout: $QUEUE_TIMEOUT"
echo "Bind to Localhost: $BIND_LOCALHOST"
echo "Log File: $LOG_FILE"
echo "Log Level: $LOG_LEVEL"
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
echo ""
echo ""

explain_web_server_setup
echo "------------"
explain_host_setup
echo "------------"
explain_app_setup
echo ""

read -p "Are you sure you wish to proceed with these settings? (Y/N): " CONFIRMATION

if [[ "$CONFIRMATION" =~ ^[yY]([eE][sS])?$ ]]; then
    echo "Proceeding with installation.."
else
    echo "Setup aborted."
    exit 1
fi