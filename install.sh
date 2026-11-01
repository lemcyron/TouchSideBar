#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# TouchSideBar – Install Script
#
# Compiles the GSettings schema and installs the extension into
# ~/.local/share/gnome-shell/extensions/touchsidebar@gnome-extension
#
# Usage:
#   chmod +x install.sh
#   ./install.sh
#
# To uninstall:
#   gnome-extensions disable touchsidebar@gnome-extension
#   rm -rf ~/.local/share/gnome-shell/extensions/touchsidebar@gnome-extension
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

UUID="touchsidebar@gnome-extension"
INSTALL_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"
SCHEMA_DIR="$INSTALL_DIR/schemas"

echo "→ Creating install directory: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
mkdir -p "$SCHEMA_DIR"

echo "→ Copying extension files…"
cp metadata.json   "$INSTALL_DIR/"
cp extension.js    "$INSTALL_DIR/"
cp prefs.js        "$INSTALL_DIR/"
cp stylesheet.css  "$INSTALL_DIR/"
cp schemas/org.gnome.shell.extensions.touchsidebar.gschema.xml "$SCHEMA_DIR/"

echo "→ Compiling GSettings schema…"
glib-compile-schemas "$SCHEMA_DIR"

echo "→ Enabling extension…"
gnome-extensions enable "$UUID" 2>/dev/null || true

echo ""
echo "✔ TouchSideBar installed successfully."
echo ""
echo "  If GNOME Shell is already running, press Alt+F2, type 'r', and press"
echo "  Enter to restart the shell (X11 only). On Wayland, log out and back in."
echo ""
echo "  To open Preferences:"
echo "    gnome-extensions prefs $UUID"
