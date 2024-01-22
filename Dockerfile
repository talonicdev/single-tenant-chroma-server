# syntax=docker/dockerfile:1

FROM ubuntu:20.04

# Populate args
ARG APP_NAME
ARG APP_PORT
ARG AUTH_SERVER_ENDPOINT
ARG AUTH_SERVER_APIKEY
ARG DB_PATH
ARG DB_TTL
ARG COMPILE_FROM_SOURCE

ARG NODE_VERSION
ARG PYTHON_VERSION

ARG MIN_PYTHON_VERSION
ARG MIN_SQLITE_VERSION
ARG DEFAULT_PYTHON_VERSION
ARG DEFAULT_NVM_VERSION

# Set args as environment vars
ENV APP_NAME=${APP_NAME}
ENV APP_PORT=${APP_PORT}
ENV AUTH_SERVER_ENDPOINT=${AUTH_SERVER_ENDPOINT}
ENV AUTH_SERVER_APIKEY=${AUTH_SERVER_APIKEY}
ENV DB_PATH=${DB_PATH}
ENV DB_TTL=${DB_TTL}
ENV COMPILE_FROM_SOURCE=${COMPILE_FROM_SOURCE}

ENV NODE_VERSION=${NODE_VERSION}
ENV PYTHON_VERSION=${PYTHON_VERSION}
ENV USE_DOCKER=true

ENV MIN_PYTHON_VERSION=${MIN_PYTHON_VERSION}
ENV MIN_SQLITE_VERSION=${MIN_SQLITE_VERSION}
ENV DEFAULT_PYTHON_VERSION=${DEFAULT_PYTHON_VERSION}
ENV DEFAULT_NVM_VERSION=${DEFAULT_NVM_VERSION}


# Set non-interactive timezone environment for builds
ENV DEBIAN_FRONTEND=noninteractive TZ=Etc/UTC

# Update packages
RUN apt-get update --fix-missing

# Preconfigure tzdata
RUN ln -fs /usr/share/zoneinfo/$TZ /etc/localtime 
RUN apt-get install -y tzdata && dpkg-reconfigure --frontend noninteractive tzdata

RUN apt-get update --fix-missing && apt-get install -y \
    build-essential \
    libffi-dev \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Copy files to the container
COPY ./setup /usr/app/setup
COPY ./src /usr/app/src
COPY ./dist /usr/app/dist
COPY tsconfig.json /usr/app
COPY package.json /usr/app

WORKDIR /usr/app

ENV PROJECT_ROOT_DIR=/usr/app

# Copy and run container.sh to install Python, ChromaDB and NodeJS inside the container
RUN chmod +x ./setup/container.sh
RUN bash ./setup/container.sh

# Set exposed port
EXPOSE ${APP_PORT}

# Set the entrypoint/script that configures and runs index.js when the container starts
ENTRYPOINT pm2-runtime start dist/index.js --name $APP_NAME -- \
  --port $APP_PORT \
  --authServerEndpoint $AUTH_SERVER_ENDPOINT \
  --authServerAPIKey $AUTH_SERVER_APIKEY \
  --dbPath $DB_PATH \
  --chromaDbTTL $DB_TTL