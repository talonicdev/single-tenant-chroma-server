#!/bin/bash

set -e

echo "Starting setup.."

# set CWD to root dir
PROJECT_ROOT_DIR=$(pwd)
export PROJECT_ROOT_DIR

# Install sudo, curl, software-properties-common and yq 
source ./setup/basics.sh

# Load config
source ./setup/config.sh

# Explain and ask for confirmation
source ./setup/explain.sh

# Setup Apache VirtualHost
source ./setup/apache.sh

# Setup web server host
if [ "$WEB_SERVER_TYPE" = "apache" ]; then
    source ./setup/apache.sh
elif [ "$WEB_SERVER_TYPE" = "nginx" ]; then
    source ./setup/nginx.sh
else
    echo "Skipping web server setup.."
fi

# Create database directory if it doesn't exist
if [ ! -d "$DB_PATH" ]; then
  echo "Creating database directory ${DB_PATH}.."
  mkdir -p "$DB_PATH"
fi

if [ -n "$LOG_FILE" ]; then
  LOG_DIR=$(dirname "$LOG_FILE")
  if [ ! -d "$LOG_DIR" ]; then
    echo "Creating log dir and file ${LOG_FILE}.."
  fi
  ABS_LOG_DIR=$(mkdir -p "$LOG_DIR" && realpath -m "$LOG_DIR")
  touch "$ABS_LOG_DIR/$(basename "$LOG_FILE")"
fi

if [ "$USE_DOCKER" = true ]; then

  # Everything else runs in Docker, so set that one up
  source ./setup/docker.sh

  echo "Building Docker image.."

  docker build  --build-arg APP_NAME=$APP_NAME \
                --build-arg APP_PORT=$APP_PORT \
                --progress=plain \
                --tag $DOCKER_IMAGE_NAME .

  echo "Starting Docker container.."

  if [ -n "$ABS_LOG_DIR" ]; then
    LOG_FILE_VOLUME="-v $ABS_LOG_DIR:$ABS_LOG_DIR"
  fi
  if [ "$BIND_LOCALHOST" = true ]; then
    PORT_BINDING="127.0.0.1:$APP_PORT:$APP_PORT"
  else
    PORT_BINDING="$APP_PORT:$APP_PORT"
  fi
  
  docker run -dp $PORT_BINDING -v $DB_PATH:$DB_PATH $LOG_FILE_VOLUME --name $DOCKER_CONTAINER_NAME $DOCKER_IMAGE_NAME

else

  # We're installing on the host server
  source ./setup/python.sh
  source ./setup/chromadb.sh
  source ./setup/nodejs.sh
  source ./setup/app.sh

fi