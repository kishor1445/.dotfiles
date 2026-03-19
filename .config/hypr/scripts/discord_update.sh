#!/bin/bash

set -euo pipefail

INSTALL_DIR="/opt/discord"

if [ -d "$INSTALL_DIR" ]; then
  CURRENT_VERSION=$(cat "$INSTALL_DIR/resources/build_info.json" 2>/dev/null | jq -r '.version' || echo "0.0.0")
else
  CURRENT_VERSION="0.0.0"
fi

discord_update_available() {
  local remote_json
  remote_json=$(curl -s "https://discord.com/api/updates/stable?platform=linux")

  local remote_version
  remote_version=$(echo "$remote_json" | jq -r '.name')

  if [[ "$CURRENT_VERSION" != "$remote_version" ]]; then
    echo "$remote_version"
  else
    echo "false"
  fi
}

update_discord() {
  local new_version=$1
  local url="https://discord.com/api/download?platform=linux&format=tar.gz"
  local tmp_archive="/tmp/discord-$new_version.tar.gz"

  echo "Update found: $new_version (Current: $CURRENT_VERSION)"
  echo "Downloading discord tarball..."
  curl -L "$url" -o "$tmp_archive"

  echo "Extracting to $INSTALL_DIR..."
  sudo mkdir -p "$INSTALL_DIR" # Create dir if doesn't exist

  sudo tar -xzf "$tmp_archive" -C "$INSTALL_DIR" --strip-components=1

  echo "Symlinking..."
  sudo ln -sf "$INSTALL_DIR/Discord" "/usr/bin/discord"

  rm "$tmp_archive"
  echo "Discord successfully updated to $new_version!"
}

patch_discord() {
  if command -v bdcli >/dev/null 2>&1; then
    echo "Installing betterdiscord..."
    bdcli install --channel stable
  fi
}

main() {
  echo "Checking Discord version..."
  NEW_VER=$(discord_update_available)

  case "$NEW_VER" in
    "false")
      echo "Discord is up to date ($CURRENT_VERSION)."
      ;;
    *)
      update_discord "$NEW_VER"
      patch_discord
      ;;
  esac
}

main
