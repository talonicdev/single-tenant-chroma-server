#!/bin/bash

set -e

cd "$PROJECT_ROOT_DIR"

echo "Starting Docker setup.."

if [ ! -f "Dockerfile" ]; then
    echo "Error: Dockerfile not found. Aborting setup."
    exit 1
fi

# ensure certificates can be properly checked
if ! dpkg -l | grep -qw 'ca-certificates'; then
    echo "Installing ca-certificates.."
    sudo apt-get install -yqq ca-certificates
fi

# install lsb_release CLI
if ! command -v lsb_release &> /dev/null; then
echo "Installing lsb-release.."
sudo apt-get install -yqq lsb-release
fi

# Add Docker’s official GPG key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -

# Set up the stable repository
sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"

# Update the apt package index
sudo apt-get update -qq

# Install the latest version of Docker CE
sudo apt-get install -yqq docker-ce

docker rm -f $DOCKER_CONTAINER_NAME || true

echo "Docket setup complete."