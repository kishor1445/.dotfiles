#!/bin/bash

set -euo pipefail

RESTART_REQ=false

is_root() {
    [ "$EUID" -eq 0 ]
}

is_paru_installed() {
    command -v paru >/dev/null 2>&1
}

is_sudo_installed() {
    command -v sudo >/dev/null 2>&1
}


create_user() {
    groupadd sudo || true
    useradd -m -G sudo "$USERNAME"
    echo "$USERNAME:$PASSWORD" || chpasswd # BUG: Password didn't set properly
}

install_sudo() {
    if ! is_sudo_installed; then
        echo "Sudo not installed. Installing..."
	pacman -Sy --noconfirm
	pacman -S --noconfirm sudo-rs

	cat > /etc/pam.d/sudo << 'EOF'
#%PAM-1.0
auth    sufficient pam_rootok.so
auth    required   pam_unix.so
account required   pam_unix.so
session required   pam_unix.so
EOF
        cp /etc/pam.d/sudo /etc/pam.d/sudo-i
	ln -sf /usr/bin/sudo-rs /usr/local/bin/sudo
	cat > /etc/sudoers << 'EOF'
Defaults secure_path="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

root    ALL=(ALL:ALL) ALL
%sudo   ALL=(ALL:ALL) ALL
EOF
    fi
}

install_paru() {
    if ! pacman -Qi base-devel git rustup >/dev/null 2>&1; then
        echo "Installing base-devel, git, and rustup..."
        sudo pacman -S --needed --noconfirm base-devel git rustup
    fi

    if [ ! -d "paru" ]; then
        git clone https://aur.archlinux.org/paru.git
    fi
    cd paru || return 1
    rustup default stable
    makepkg -si --noconfirm
    cd .. || return 1

    echo "paru installed successfully!"
    rm -rf paru
}


install_nvidia_driver() {
    install_package linux-headers
    install_package nvidia-580xx-dkms nvidia-580xx-utils lib32-nvidia-580xx-utils

    echo 'options nvidia_drm modeset=1' | sudo tee /etc/modprobe.d/nvidia.conf >/dev/null
    
    if grep -q '^MODULES=\([^)]*\)' /etc/mkinitcpio.conf; then
	sudo sed -i "s|\(MODULES=(.*\))|\1 nvidia nvidia_modeset nvidia_uvm nvidia_drm )|" /etc/mkinitcpio.conf
    else
        sudo sed -i "s/^MODULES=()/MODULES=(nvidia nvidia_modeset nvidia_uvm nvidia_drm)/" /etc/mkinitcpio.conf
    fi

    if ! grep -q "^IgnorePkg.*nvidia-dkms" /etc/pacman.conf; then
        if grep -q "^IgnorePkg" /etc/pacman.conf; then
            sudo sed -i '/^IgnorePkg/s/$/ nvidia-dkms nvidia-utils lib32-nvidia-utils/' /etc/pacman.conf
	else
            echo 'IgnorePkg = nvidia-dkms nvidia-tuils lib32-nvidia-utils' | sudo tee -a /etc/pacman.conf
	fi
    fi

    sudo mkinitcpio -P
    RESTART_REQ=true
}

enable_multilib() {
    sed -i '/^#\[multilib\]/{s/^#//;n;/^#Include/s/^#//}' /etc/pacman.conf
    pacman -Sy
}

install_hyprland() {
    install_package base-devel git
    install_package hyprland-meta-git kitty imagemagick
    install_package ttf-firacode-nerd noto-fonts-emoji noto-fonts-cjk
}

install_spotify() {
  install_package spotify-launcher
  curl -fsSL https://raw.githubusercontent.com/spicetify/cli/main/install.sh | sh
  export PATH="$PATH:$HOME/.spicetify/"
  spicetify backup apply
  rm install.log 2>/dev/null
}

install_package() {
    local packages=("$@")

    for pkg in "${packages[@]}"; do
        if pacman -Q "$pkg" &>/dev/null 2>&1; then
	    echo "Found: $pkg"
	else
	    echo "Installing $pkg..."
	    paru -S --needed --noconfirm "$pkg" || { echo "Failed to install $pkg"; return 1; }
	fi
    done
}

enable_darkmode() {
    install_package gnome-themes-extra qt5ct qt6ct adwaita-qt5 adwaita-qt6 nwg-look
    gsettings set org.gnome.desktop.interface gtk-theme 'Adwaita:dark'
    gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark'
}

hyprland_essentials() {
    install_package pipewire pipewire-alsa pipewire-jack pipewire-pulse wireplumber pavucontrol sddm-git zsh zsh-completions clang resvg yazi poppler jq
    if [ "$SHELL" != "/bin/zsh" ]; then
       chsh -s /bin/zsh
    fi
    systemctl --user enable --now pipewire wireplumber
    sudo systemctl enable sddm
    install_package mako qt5-wayland qt6-wayland adobe-source-sans-fonts cliphist 
    install_package zen-browser-bin
    if ! command -v zoxide >/dev/null 2>&1; then
        cargo install zoxide --locked
    else
        echo "Found: zoxide"
    fi
}

extra_setups() {
    install_package btop ripgrep discord quickshell catppuccin-cursors-mocha bat unzip udiskie eza unixodbc zip qt6-5compat lazygit visual-studio-code-bin
    if ! command -v bun >/dev/null 2>&1; then
      curl -fsSL https://bun.sh/install | bash
    fi
    if ! command -v tldr >/dev/null 2>&1; then
        cargo install tlrc --locked
    else
        echo "Found: tldr"
    fi
    if ! command -v tree-sitter >/dev/null 2>&1; then
        cargo install tree-sitter-cli --locked
    else
        echo "Found: tree-sitter"
    fi
    if ! command -v ani-cli >/dev/null 2>&1; then
        install_package ani-cli-git
    fi
    if ! command -v bdcli >/dev/null 2>&1; then
	install_package nodejs npm
        sudo npm install -g @betterdiscord/cli
    else
        echo "Found: bdcli"
    fi
    if [ ! -d ~/.config/BetterDiscord ]; then
        bdcli install --channel stable
    else
        echo "Discord is already patched by BetterDiscord"
    fi
    if ! command -v uv >/dev/null 2>&1; then
      curl -LsSf https://astral.sh/uv/install.sh | sh
    else
      echo "Found: uv"
    fi
    if ! command -v spotify-launcher >/dev/null 2>&1; then
      install_spotify
    fi
}

main() {
    if is_root; then
        echo "=== ROOT MODE: FULL SETUP ==="
        echo "WARNING: Only run the script as root on fresh arch"
        
        if [ $# -eq 0 ]; then
            read -p "Enter username for new user: " USERNAME
            [ -n "$USERNAME" ] || { echo "Username required!"; exit 1; }
        else
            USERNAME="$1"
        fi
        
        echo -n "Enter password for $USERNAME: "
        read -s PASSWORD
        echo
        [ -n "$PASSWORD" ] || { echo "Password required!"; exit 1; }
        
	create_user
	install_sudo
	enable_multilib
	echo "Copying this script to home dir of $USERNAME"
	cp "$0" "/home/$USERNAME/arch.sh"
	chown "$USERNAME:$USERNAME" "/home/$USERNAME/arch.sh"
	chmod +x "/home/$USERNAME/arch.sh"
	echo "This script is copied to $USERNAME home directory. Please login as $USERNAME and run the script without root"
	return 0
    fi
    
    if is_paru_installed; then
        echo "Found: paru"
    else
        echo "paru is not found. Installing paru..."
        install_paru
    fi

    if command -v nvidia-smi >/dev/null 2>&1; then
        echo "Found: nvidia driver"
    else
	echo "Installing nvidia driver..."
	install_nvidia_driver
    fi

    if command -v start-hyprland >/dev/null 2>&1; then
        echo "Found: hyprland"
    else
        echo "Installing Hyprland..."
        install_hyprland
	enable_darkmode
    fi

    hyprland_essentials

    extra_setups

    if [ "$RESTART_REQ" = true ]; then
        echo "Done. Please restart your system"
    else
        echo "Done."
    fi
}

main
