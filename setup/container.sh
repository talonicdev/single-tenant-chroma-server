#!/bin/bash

set -e

cd "$PROJECT_ROOT_DIR"

echo "Starting In-Container setup.."

export DEBIAN_FRONTEND=noninteractive 
export TZ=Etc/UTC

# Install sudo, curl, software-properties-common and yq 
source ./setup/basics.sh

# Install Python
source ./setup/python.sh

# Install ChromaDB
source ./setup/chromadb.sh

# Install NodeJS
source ./setup/nodejs.sh