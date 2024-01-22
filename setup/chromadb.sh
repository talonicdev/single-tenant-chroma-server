#!/bin/bash

set -e

cd "$PROJECT_ROOT_DIR"

echo "Starting ChromaDB setup.."

function get_highest_version {
    printf "%s\n" "$@" | sort -V | tail -n 1
}

# Create database directory if it doesn't exist
if [ ! -d "$DB_PATH" ]; then
  echo "Creating database directory ${DB_PATH}.."
  sudo mkdir -p "$DB_PATH"
fi

SQLITE_VERSION=$($PYTHON_BIN -c "import sqlite3; print(sqlite3.sqlite_version)")

# ChromaDB needs SQLite version $MIN_SQLITE_VERSION or higher. Install if necessary
if [ "$(get_highest_version $SQLITE_VERSION $MIN_SQLITE_VERSION)" != "$SQLITE_VERSION" ]; then
  echo "Installing pysqlite3-binary as installed SQLite version $SQLITE_VERSION is lower than $MIN_SQLITE_VERSION.."
  $PIP_BIN install -q pysqlite3-binary
fi

# Install ChromaDB CLI
if ! $PIP_BIN list | grep -F chromadb &>/dev/null; then
  echo "Installing ChromaDB CLI..."
  $PIP_BIN install -q chromadb
fi

CHROMA_CLI_PATH=$(which chroma)
if [ -z "$CHROMA_CLI_PATH" ]; then
  echo "Chroma CLI not found. Please install chromadb manually and try again."
  exit 1
fi

# Modify the chroma CLI script
if ! grep -F "sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')" "$CHROMA_CLI_PATH" &>/dev/null; then
  echo "Applying workaround to the ChromaDB CLI..."

  # Update the shebang line to use the specified Python version
  sed -i "1s|#!.*python3\.[0-9]*|#!$(which $PYTHON_BIN)|" "$CHROMA_CLI_PATH"

  # Insert import and sys.modules override after the chromadb.cli.cli import
  sed -i "/import sys/a __import__('pysqlite3')\nsys.modules['sqlite3'] = sys.modules.pop('pysqlite3')" "$CHROMA_CLI_PATH"
fi

echo "ChromaDB setup complete."