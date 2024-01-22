#!/bin/bash

set -e

cd "$PROJECT_ROOT_DIR"

echo "Starting Python setup.."

function get_highest_version {
    printf "%s\n" "$@" | sort -V | tail -n 1
}

# Select compatible Python version
if [ -z "$PYTHON_VERSION" ]; then

    # Get a list of installed Python versions
    installed_versions=""
    for pybin in $(compgen -c python | grep -E '^python[0-9]+\.[0-9]+$'); do
        installed_version=${pybin//python/}
        if [ "$(get_highest_version $installed_version $MIN_PYTHON_VERSION)" == "$installed_version" ]; then
        installed_versions="$installed_versions $installed_version"
        fi
    done

    # Find the highest version >= MIN_PYTHON_VERSION
    highest_python_version=""
    if [ ! -z "$installed_versions" ]; then
        highest_python_version=$(get_highest_version $installed_versions)
    fi

    # Use found version or fall back to the default
    if [ ! -z "$highest_python_version" ]; then
        PYTHON_VERSION=$highest_python_version
        echo "Highest suitable Python version found: Python $PYTHON_VERSION"
    else
        echo "No suitable Python version found. Falling back to the default version $DEFAULT_PYTHON_VERSION."
        PYTHON_VERSION=$DEFAULT_PYTHON_VERSION
    fi
fi

echo "Using Python version ${PYTHON_VERSION}.."

# Install selected Python version
PYTHON_BIN=python${PYTHON_VERSION}
if ! command -v $PYTHON_BIN &>/dev/null; then
    echo "Installing Python $PYTHON_VERSION..."
    sudo add-apt-repository -y ppa:deadsnakes/ppa
    sudo apt-get update -qq
    sudo apt-get install -yqq $PYTHON_BIN
fi

PYTHON_DISTUTILS=python${PYTHON_VERSION}-distutils
if ! dpkg -l | grep -qw $PYTHON_DISTUTILS; then
    echo "Installing Python-distutils for python${PYTHON_VERSION}"
    sudo apt-get install -yqq $PYTHON_DISTUTILS
fi

PYTHON_DEV=python${PYTHON_VERSION}-dev
if ! dpkg -l | grep -qw $PYTHON_DEV; then
    echo "Installing Python-dev for python${PYTHON_VERSION}"
    sudo apt-get install -yqq $PYTHON_DEV
fi

# Install pip for selected Python version
PIP_BIN=pip${PYTHON_VERSION}
if ! command -v $PIP_BIN &>/dev/null; then
    echo "Installing pip for Python $PYTHON_VERSION..."
    curl https://bootstrap.pypa.io/get-pip.py -o get-pip.py -sS
    sudo $PYTHON_BIN get-pip.py
    rm get-pip.py
fi

export PYTHON_VERSION PYTHON_BIN PIP_BIN

echo "Python setup complete."