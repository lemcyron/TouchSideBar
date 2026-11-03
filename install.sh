#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# TouchSideBar – Install Script
#
# Copies all extension files to the correct location, compiles
# the GSettings schema, and guides you through reloading GNOME.
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

# ── Disable the extension first if it is currently enabled ──────────────────
# This avoids GNOME Shell running stale JS while the files are being replaced.
if gnome-extensions list --enabled 2>/dev/null | grep -q "^${UUID}$"; then
    echo "→ Disabling extension before update…"
    gnome-extensions disable "$UUID" 2>/dev/null || true
fi

# ── Create directories ───────────────────────────────────────────────────────
echo "→ Creating install directory: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
mkdir -p "$SCHEMA_DIR"
mkdir -p "$INSTALL_DIR/icons"

# ── Copy all extension files ─────────────────────────────────────────────────
echo "→ Copying extension files…"
cp -f metadata.json  "$INSTALL_DIR/"
cp -f extension.js   "$INSTALL_DIR/"
cp -f prefs.js       "$INSTALL_DIR/"
cp -f stylesheet.css "$INSTALL_DIR/"
cp -f icons/*.svg    "$INSTALL_DIR/icons/"
cp -f schemas/org.gnome.shell.extensions.touchsidebar.gschema.xml "$SCHEMA_DIR/"

# ── Compile GSettings schema ─────────────────────────────────────────────────
echo "→ Compiling GSettings schema…"
glib-compile-schemas "$SCHEMA_DIR"

echo ""
echo "✔ Files installed to: $INSTALL_DIR"
echo ""
echo "══════════════════════════════════════════════════════════"
echo "  REQUIRED: Restart GNOME Shell to load the new files"
echo "══════════════════════════════════════════════════════════"
echo ""
echo "  ┌─ On X11 (GNOME on Xorg):"
echo "  │   Press Alt+F2, type  r  and press Enter."
echo "  │   Then run:  gnome-extensions enable $UUID"
echo "  │"
echo "  └─ On Wayland (most modern installs):"
echo "      Log out and log back in."
echo "      Then run:  gnome-extensions enable $UUID"
echo ""
echo "  After enabling, open Preferences:"
echo "      gnome-extensions prefs $UUID"
echo ""
echo "  Verify it loaded:"
echo "      gnome-extensions list --enabled | grep $UUID"
echo ""

# ── Attempt to enable immediately ───────────────────────────────────────────
# Only succeeds if GNOME Shell was already restarted (e.g. re-running after
# a session reload). Silently skipped otherwise.
if gnome-extensions enable "$UUID" 2>/dev/null; then
    echo "  ✔ Extension enabled in the current session."
    echo "     If it shows an error, restart GNOME Shell first (see above)."
fi
