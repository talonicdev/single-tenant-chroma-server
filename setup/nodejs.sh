#!/bin/bash

set -e

cd "$PROJECT_ROOT_DIR"

echo "Starting NodeJS setup.."

if [ "$USE_DOCKER" = true ]; then

  NODE_MAJOR=$(echo ${NODE_VERSION} | cut -d. -f1)
  echo "Installing Node version ${NODE_MAJOR}.x.."
  curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash
  apt-get install -yqq nodejs
  rm -rf /var/lib/apt/lists/*

else

  export NVM_DIR="$HOME/.nvm"

  # Install NVM if it isn't already installed
  if [ ! -f "$NVM_DIR/nvm.sh" ]; then
    echo "Installing NVM (Node Version Manager)..."
    NVM_URL="https://raw.githubusercontent.com/nvm-sh/nvm/v${DEFAULT_NVM_VERSION}/install.sh"
    curl -o- $NVM_URL | bash
  fi

  # Source nvm script to be able to use nvm command
  export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

  # Set NODE_VERSION to installed or latest version if none is specified
  if [ -z "$NODE_VERSION" ]; then
    echo "No specific Node.js version provided, using existing or latest stable version..."
    NODE_VERSION='node'
  fi

  # Install Node.js using nvm or use it if the selected version is already installed
  if ! nvm ls "$NODE_VERSION" > /dev/null; then
    echo "Installing Node.js version $NODE_VERSION..."
    #nvm install "$NODE_VERSION" --no-progress
    nvm install "$NODE_VERSION"
  fi

  echo "Using Node.js version $NODE_VERSION..."
  #nvm use "$NODE_VERSION" --silent
  nvm use "$NODE_VERSION"

  NVM_PATH=$NVM_DIR/versions/node/v$NODE_VERSION/bin
  echo "Exporting ${NVM_PATH} to \$PATH"
  export PATH=$NVM_PATH:$PATH

fi

# Install PM2 if not already installed
if ! pm2 -v > /dev/null 2>&1; then
  echo "Installing PM2..."
  #npm install pm2@latest -g --quiet --no-progress
  npm install pm2@latest -g
fi

# Navigate to the app directory
cd "$(dirname "$0")" || exit 1

if [ "$COMPILE_FROM_SOURCE" = true ]; then
  if ! command -v tsc &> /dev/null; then
    echo "Installing Typescript.."
    npm install -g typescript --quiet --no-progress
  fi
  echo "Installing npm packages.."
  npm install --quiet --no-progress
  echo "Building NodeJS app from source.."
  tsc
else
  echo "Installing npm packages.."
  npm install --only=prod --quiet --no-progress
fi

echo "NodeJS setup complete."