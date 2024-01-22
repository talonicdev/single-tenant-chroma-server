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
  sudo mkdir -p "$DB_PATH"
fi

if [ "$USE_DOCKER" = true ]; then

  # Everything else runs in Docker, so set that one up
  source ./setup/docker.sh

  echo "Building Docker image.."

  docker build  --build-arg APP_NAME=$APP_NAME \
                --build-arg NODE_VERSION=$NODE_VERSION \
                --build-arg PYTHON_VERSION=$PYTHON_VERSION \
                --build-arg APP_PORT=$APP_PORT \
                --build-arg DB_TTL=$DB_TTL \
                --build-arg DB_PATH=$DB_PATH \
                --build-arg AUTH_SERVER_ENDPOINT=$AUTH_SERVER_ENDPOINT \
                --build-arg AUTH_SERVER_APIKEY=$AUTH_SERVER_APIKEY \
                --build-arg COMPILE_FROM_SOURCE=$COMPILE_FROM_SOURCE \
                --build-arg MIN_PYTHON_VERSION=$MIN_PYTHON_VERSION \
                --build-arg MIN_SQLITE_VERSION=$MIN_SQLITE_VERSION \
                --build-arg DEFAULT_PYTHON_VERSION=$DEFAULT_PYTHON_VERSION \
                --build-arg DEFAULT_NVM_VERSION=$DEFAULT_NVM_VERSION \
                --progress=plain \
                --tag $DOCKER_IMAGE_NAME .

  echo "Starting Docker container.."
  docker run -dp $APP_PORT:$APP_PORT -v $DB_PATH:$DB_PATH --name $DOCKER_CONTAINER_NAME $DOCKER_IMAGE_NAME

else

  # We're installing on the host server
  source ./setup/python.sh
  source ./setup/chromadb.sh
  source ./setup/nodejs.sh
  source ./setup/app.sh

fi