#!/bin/bash

set -e

cd "$PROJECT_ROOT_DIR"

echo "Starting Nginx setup.."

# Install Nginx if necessary
if ! nginx -v > /dev/null 2>&1; then
  echo "Installing Nginx..."
  sudo apt-get update
  sudo apt-get install -yqq nginx
fi

# Check if Nginx is running, if not, start it and enable to start on boot
echo "Starting Nginx.."
sudo systemctl enable nginx
sudo systemctl start nginx

# Configure Nginx server block
NGINX_CONF="/etc/nginx/sites-available/${WEB_SERVER_HOST}.conf"
echo "Configuring Nginx Server Block"

sudo bash -c "cat > $NGINX_CONF << EOF
server {
    listen $WEB_SERVER_PORT;
    server_name $WEB_SERVER_HOST;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF"

# Check and enable SSL if required
if [ "$WEB_SERVER_ENABLE_SSL" = true ]; then

  echo "Adding Nginx SSL configuration..."

  # ensure certificates can be properly checked
  if ! dpkg -l | grep -qw 'ca-certificates'; then
    echo "Installing ca-certificates.."
    sudo apt-get install -yqq ca-certificates
  fi

  # Check if SSL certificates are available
  if [ ! -f "$WEB_SERVER_CERT_FILE" ] || [ ! -f "$WEB_SERVER_CERT_KEY_FILE" ]; then
    echo "SSL certificate files not found. Please make sure the SSL certificate and key exist."
    exit 1
  fi

  sudo bash -c "cat >> $NGINX_CONF << EOF
server {
    listen $WEB_SERVER_SSL_PORT ssl;
    server_name $WEB_SERVER_HOST;

    ssl_certificate $WEB_SERVER_CERT_FILE;
    ssl_certificate_key $WEB_SERVER_CERT_KEY_FILE;

    ssl_session_timeout 5m;
    ssl_protocols TLSv1 TLSv1.1 TLSv1.2; # Adjust if you need more/less support
    ssl_ciphers 'HIGH:!aNULL:!MD5 or HIGH:!aNULL:!MD5:!3DES'; # This is an example
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF"
fi

# Enable new server block and restart Nginx
echo "Enabling Nginx site ${WEB_SERVER_HOST} and testing configuration.."

sudo ln -s /etc/nginx/sites-available/"${WEB_SERVER_HOST}.conf" /etc/nginx/sites-enabled/
sudo nginx -t

echo "Reloading Nginx.."
sudo systemctl reload nginx

echo "Nginx setup complete."