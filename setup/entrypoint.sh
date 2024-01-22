#!/bin/sh

# Launch the application with environment variables resolved
pm2-runtime start dist/index.js --name "$APP_NAME" -- \
  --port $SERVER_PORT \
  --authServerEndpoint $AUTH_SERVER_ENDPOINT \
  --authServerAPIKey $AUTH_SERVER_APIKEY \
  --dbPath $DB_PATH \
  --dbTTL $DB_TTL