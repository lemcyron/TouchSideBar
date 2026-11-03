# TouchSideBar – GNOME Shell Extension

A **touch-friendly sidebar** for GNOME Shell 45–51. Designed to be
useful on touchscreen devices where reaching the top panel or corners is
inconvenient.

---

## Features

| Feature | Detail |
|---|---|
| **Left / Right placement** | Toggle the sidebar to either edge from the panel menu or Preferences |
| **Adjustable width** | Set the width (48–400 px) in Preferences; it cannot be dragged |
| **Scales with width** | Icons, labels and buttons resize automatically with the sidebar width |
| **Icon spacing** | Top / bottom / left / right padding around the icons is configurable (applies to every button) |
| **One-click toggle** | Clicking / tapping the panel icon immediately shows or hides the sidebar (right-click opens the menu) |
| **Long-press to switch side** | Holding the panel icon for half a second moves the sidebar from left to right and back |
| **Hides in fullscreen** | The sidebar hides while any app (e.g. a video player) is fullscreen on the primary monitor and returns afterwards |
| **Same plane as windows** | While visible, the sidebar reserves screen space so app windows sit beside it, never above or below it |
| **Sidebar fullscreen** | The Fullscreen button fullscreens the focused window, hides the sidebar, and shows a small floating button at the lower-left to exit fullscreen |
| **Tablet mode** | The sidebar appears automatically when the device enters touch/tablet mode (e.g. a convertible Chromebook folded to tablet) and hides when it leaves |
| **Button alignment** | Align the buttons to the top, middle, or bottom of the sidebar |
| **Sidebar color** | Pick any sidebar background color (including transparency) |
| **Toggle button labels** | Show or hide text labels beneath action button icons |
| **Customizable buttons** | Add, remove, reorder, and fully edit every action button from Preferences |
| **Export / Import** | Save every customization (layout, appearance, all actions) to a text file and load it back from Preferences |
| **Icon customization** | Each button has its own icon, chosen from a popup with previews (or typed by name), and an independent CSS color value |
| **Preferences window** | Full GTK4 + libadwaita preferences window accessible from the panel menu |

---

## Built-in Action Types

| Action | Description |
|---|---|
| **Previous Workspace** | Activates the previous workspace |
| **Next Workspace** | Activates the next workspace |
| **Show Overview** | Toggles the GNOME Activities Overview |
| **Toggle Fullscreen** | Makes / unsets the focused window fullscreen |
| **Media: Play / Pause** | Toggles playback of active media players (MPRIS) |
| **Media: Next Track** | Skips to next media track |
| **Media: Previous Track** | Skips to previous media track |
| **Media: Stop** | Stops media playback |
| **Volume: Up** | Increases system audio volume |
| **Volume: Down** | Decreases system audio volume |
| **Volume: Mute** | Toggles system audio mute |
| **Power Off** | `gnome-session-quit --power-off` |
| **Reboot** | `gnome-session-quit --reboot` |
| **Suspend** | `systemctl suspend` |
| **Log Out** | `gnome-session-quit --logout` |
| **Lock Screen** | `loginctl lock-session` |
| **Terminal Command** | Runs any shell command via `bash -c` |
| **System Command** | Runs any command directly (for non-interactive commands) |
| **Copy** | Sends `Ctrl+C` to the focused app. Works on Wayland |
| **Paste** | Sends `Ctrl+V` to the focused app. Works on Wayland |
| **App Shortcut** | Launches any installed application by its `.desktop` ID |
| **Keyboard Shortcut** | Sends a key combination (e.g. `Ctrl+Shift+T`, `Alt+Left`, `Super+D`, `F11`) to the focused app. Works on Wayland |
| **Spacer** | Empty gap of configurable height, for grouping buttons |
| **Horizontal Line** | A thin divider line (optionally colored via the Icon Color field) |


---

## Requirements

- GNOME Shell **45 – 51** (developed for 51.1)
- `glib-compile-schemas` (part of `glib2` / `libglib2.0-dev`)
- `gnome-session` — for power/logout actions (standard on most distros)
- `systemd` — for suspend/lock actions (standard on most distros)

---

## Installation

```bash
# Clone or extract the extension files, then:
chmod +x install.sh
./install.sh
```

> **Important:** GNOME Shell must be **restarted** before the extension can be
> enabled. The install script copies and compiles all files, but cannot activate
> the extension in the same session.

After restarting the shell:
```bash
gnome-extensions enable touchsidebar@gnome-extension
```

On **X11**: press `Alt+F2`, type `r`, press `Enter` to restart the shell.
On **Wayland**: log out and back in.

### Manual installation

```bash
UUID="touchsidebar@gnome-extension"
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"
mkdir -p "$DEST/schemas" "$DEST/icons"
cp metadata.json extension.js prefs.js stylesheet.css "$DEST/"
cp icons/*.svg "$DEST/icons/"
cp schemas/*.xml "$DEST/schemas/"
glib-compile-schemas "$DEST/schemas/"
gnome-extensions enable "$UUID"
```

---

## Uninstalling

```bash
gnome-extensions disable touchsidebar@gnome-extension
rm -rf ~/.local/share/gnome-shell/extensions/touchsidebar@gnome-extension
```

---

## File Structure

```
touchsidebar@gnome-extension/
├── metadata.json        Extension manifest
├── extension.js         Main shell code (sidebar, actions, panel button)
├── prefs.js             GTK4 preferences window
├── stylesheet.css       GNOME Shell CSS styling
├── icons/               Panel icon (page with a list)
├── install.sh           One-step install helper
├── README.md            This file
└── schemas/
    └── org.gnome.shell.extensions.touchsidebar.gschema.xml
```

---

## Customizing from Preferences

Open Preferences from the panel menu or run:

```bash
gnome-extensions prefs touchsidebar@gnome-extension
```

### General tab
- **Sidebar Side** – toggle between Left and Right
- **Sidebar Width** – numeric spin button (48–400 px)
- **Button Alignment** – Top / Middle / Bottom
- **Show Button Labels** – toggle text labels under action icons on/off
- **Sidebar Color** – background color picker
- **Icon Spacing** – top / bottom / left / right padding inside every action button
- **Backup** – **Export** all customizations to a JSON text file, or **Import** them back. Imports are validated (unknown fields are dropped, values are range-checked), and you are asked to confirm if the file contains shell-command actions. Settings missing from a file are left unchanged.


### Actions tab
Every button in the sidebar corresponds to one row here:
- **Enable/disable** the button with the switch on the row. A disabled button stays editable and deletable: the row can still be expanded
- **Expand** the row to edit:
  - Action type (dropdown)
  - Show When: Always, only when the focused workspace has a window open, or only when it has none (the sidebar updates as you switch workspaces and open/close windows)
  - Button label
  - Icon (popup picker with previews and search; type a name and press Enter for any other icon in the system theme)
  - Icon color (text entry or color picker)
  - Command (for Terminal Command / System Command types)
  - App desktop ID (for App Shortcut type)
- **Drag and drop** by the handle on the left of any row to reorder actions
- **Delete Action** removes the button

Use **Add New Action Button** at the bottom to append a new button of any type.  
**Reset Actions to Defaults** restores the factory button list (Overview, Previous Workspace and Next Workspace), which is also what a fresh install starts with.

---

## Security Notes

- Terminal and System commands are run through `/bin/sh -c` (Terminal Command
  is quoted and run through `bash -c`) — they run as your user, not as root.
  Only configure commands you trust: anyone who can change the extension's
  settings can make the sidebar run them.
- Colors from settings are validated before being used in styles.
- No network access is performed by the extension.
- No credentials, tokens, or personal data are stored.

---

## License

MIT License — see individual source files for copyright headers.


