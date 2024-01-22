#!/bin/bash

set -e

cd "$PROJECT_ROOT_DIR"

echo "Starting Apache setup.."

# Install Apache if necessary
if ! apache2 -v > /dev/null 2>&1; then
  echo "Installing Apache2..."
  sudo apt-get install -yqq apache2
fi

# Check if Apache is running, if not, start it and enable to start on boot
echo "Starting Apache2.."
#httpd -k start >/dev/null 2>&1 || sudo service apache2 start

# Enable Apache mods for proxy
echo "Enabling Apache2 mods..."
sudo a2enmod proxy
sudo a2enmod proxy_http

# Configure Apache VirtualHost
APACHE_CONF="/etc/apache2/sites-available/${WEB_SERVER_HOST}.conf"
echo "Configuring Apache VirtualHost"


sudo bash -c "cat > $APACHE_CONF << EOF
<VirtualHost *:$WEB_SERVER_PORT>
    ServerName $WEB_SERVER_HOST

    ProxyRequests Off
    ProxyPreserveHost On

    <Location '/'>
        ProxyPass 'http://127.0.0.1:$APP_PORT/'
        ProxyPassReverse 'http://127.0.0.1:$APP_PORT/'
    </Location>

</VirtualHost>
EOF"

# Check and enable SSL if required
if [ "$WEB_SERVER_ENABLE_SSL" = true ]; then

  echo "Adding Apache SSL configuration..."

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

  sudo a2enmod ssl

  sudo bash -c "cat >> $APACHE_CONF << EOF
  <VirtualHost *:$WEB_SERVER_SSL_PORT>
    SSLEngine on
    SSLCertificateFile $WEB_SERVER_CERT_FILE
    SSLCertificateKeyFile $WEB_SERVER_CERT_KEY_FILE

    ServerName $WEB_SERVER_HOST

    ProxyRequests Off
    ProxyPreserveHost On

    <Location '/'>
        ProxyPass 'http://127.0.0.1:$APP_PORT/'
        ProxyPassReverse 'http://127.0.0.1:$APP_PORT/'
    </Location>

</VirtualHost>
EOF"
fi

# Enable new site configuration and restart Apache

echo "Enabling site ${WEB_SERVER_HOST} and restarting Apache2.."

sudo a2ensite "${WEB_SERVER_HOST}"
sudo service apache2 restart

echo "Apache setup complete."