#!/bin/bash

set -e

cd "$PROJECT_ROOT_DIR"

# sudo may not be available in virtual environments, install if necessary
if ! command -v sudo &> /dev/null; then
  echo "Installing sudo.."
  apt-get update -qq
  apt-get install -yqq sudo
fi

# update system packages
echo "Updating packages.."
sudo apt-get update -qq

# curl may not be available in virtual environments, install if necessary
if ! command -v curl &> /dev/null; then
  echo "Installing curl.."
  sudo apt-get install -yqq curl
fi

# realpath may not be available in virtual environments, install if necessary
if ! command -v realpath &> /dev/null; then
  echo "Installing realpath.."
  sudo apt-get install -yqq realpath
fi

# we need to be able to add repos to the system, so install software-properties-common for the add-apt-repository command
if ! command -v add-apt-repository &> /dev/null; then
  echo "Installing software-properties-common.."
  sudo apt-get install -yqq software-properties-common
fi

# install yq, so we can read the config
if ! command -v yq &> /dev/null; then
  echo "Installing yq.."
  sudo add-apt-repository -y ppa:rmescandon/yq
  sudo apt-get update -qq
  sudo apt-get install -yqq yq
fi