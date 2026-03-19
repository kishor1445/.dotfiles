#!/bin/bash 

if ! hyprctl clients -j | jq -e '.[] | select(.class == "spotify")' > /dev/null; then
  spotify-launcher &
fi
