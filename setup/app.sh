#!/bin/bash

set -e

cd "$PROJECT_ROOT_DIR/dist"

echo "Starting App setup.."

# Install npm packages
if [ "$COMPILE_FROM_SOURCE" = true ]; then
  npm install --quiet --no-progress
else
  npm install --only=prod --quiet --no-progress
fi

#Start app via PM2
pm2 start index.js --name "$APP_NAME" --update-env -- \
  --port "$APP_PORT" \
  --authServerEndpoint "$AUTH_SERVER_ENDPOINT" \
  --authServerAPIKey "$AUTH_SERVER_APIKEY" \
  --dbPath "$DB_PATH" \
  --chromaDbTTL "$DB_TTL"

# Set up PM2 to auto-start the app on system reboot
pm2 startup systemd -u "$USER" --hp "$HOME"
pm2 save

echo "App setup complete."