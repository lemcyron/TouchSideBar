/**
 * TouchSideBar – GNOME Shell Extension
 * Compatible with GNOME Shell 45–51
 *
 * A touch-friendly sidebar that can be toggled to the left or right
 * side of the screen. Supports fully customizable action buttons.
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import Pango from 'gi://Pango';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const SCHEMA_KEY = 'org.gnome.shell.extensions.touchsidebar';
const SIDEBAR_MIN_WIDTH = 48;
const SIDEBAR_MAX_WIDTH = 400;
const LONG_PRESS_MS = 500; // panel icon long-press duration

// Horizontal space the sidebar chrome takes around the icon: sidebar
// padding (8) + border (2) + button-box padding (4) + button border (2),
// see stylesheet.css.
const SIDEBAR_CHROME_X = 16;

// Default spacing around each icon inside its button (matches the schema).
const DEFAULT_PADDING = { top: 10, bottom: 10, left: 6, right: 6 };

/** True if the active workspace has at least one normal window open. */
function activeWorkspaceHasWindow() {
    const wsManager = global.workspace_manager ?? global.workspaceManager;
    const workspace = wsManager?.get_active_workspace?.();
    if (!workspace) return false;
    return global.display.get_tab_list(Meta.TabList.NORMAL, workspace).length > 0;
}

/**
 * Derive icon/label sizes from the sidebar width so the content scales with
 * it (28 px icon / 10 px label at the default 80 px width). The icon is also
 * limited so it still fits between the user's left/right padding.
 */
function scaleMetrics(sidebarWidth, pad = DEFAULT_PADDING) {
    const available = Math.max(16, sidebarWidth - SIDEBAR_CHROME_X);
    let iconSize = Math.max(16, Math.min(128, Math.round(available * 0.44)));
    iconSize = Math.max(12, Math.min(iconSize, available - pad.left - pad.right));
    return {
        iconSize,
        fontSize: Math.max(8, Math.min(28, Math.round(iconSize * 0.36))),
        pad,
    };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Only allow characters that can appear in a CSS colour value, so the
 * user-supplied setting can never inject extra CSS declarations.
 */
function isSafeCssColor(value) {
    return typeof value === 'string' && value.length <= 64 &&
        /^[#a-zA-Z0-9(),.%\s]+$/.test(value);
}

/**
 * Find the default Clutter seat (exposes `touch-mode`, which mutter turns on
 * when the device is folded into tablet mode / touchscreen-only use).
 */
function getSeat() {
    const getters = [
        () => global.stage.context.get_backend().get_default_seat(),
        () => global.backend.get_default_seat(),
        () => Clutter.get_default_backend().get_default_seat(),
    ];
    for (const get of getters) {
        try {
            const seat = get();
            if (seat) return seat;
        } catch (_e) { /* try next */ }
    }
    return null;
}

/**
 * Create a themed icon, falling back to a symbolic name.
 */
function makeIcon(iconName, iconColor, iconSize = 24) {
    const name = (iconName && typeof iconName === 'string' && iconName.trim() !== '')
        ? iconName.trim()
        : 'application-x-executable-symbolic';

    let gicon = null;
    try {
        if (name.startsWith('/') || name.startsWith('file://')) {
            const file = name.startsWith('file://')
                ? Gio.File.new_for_uri(name)
                : Gio.File.new_for_path(name);
            if (file.query_exists(null))
                gicon = new Gio.FileIcon({ file });
        }
        if (!gicon) {
            gicon = Gio.ThemedIcon.new_with_default_fallbacks(name);
        }
    } catch (_e) {
        gicon = null;
    }

    const iconProps = {
        icon_size: iconSize,
        style_class: 'touch-sidebar-icon',
        fallback_icon_name: 'application-x-executable-symbolic',
    };
    if (gicon)
        iconProps.gicon = gicon;
    else
        iconProps.icon_name = name;

    const icon = new St.Icon(iconProps);
    if (iconColor && typeof iconColor === 'string' && iconColor.trim() !== '' && isSafeCssColor(iconColor.trim())) {
        icon.set_style(`color: ${iconColor.trim()};`);
    }
    return icon;
}

/**
 * Spawn a command without blocking the shell.
 */
function spawnCommand(cmd) {
    try {
        const proc = Gio.Subprocess.new(
            ['/bin/sh', '-c', cmd],
            Gio.SubprocessFlags.NONE
        );
        proc.wait_async(null, null);
    } catch (e) {
        console.error(`TouchSideBar: failed to run command: ${cmd}`, e);
    }
}

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────
//
// Shortcuts are written like "Ctrl+Shift+T", "Alt+Left", "Super+D", "F11".
// They are injected through a Clutter virtual keyboard, which works on
// Wayland (GNOME 50+ is Wayland-only, so xdotool cannot be used).

const MODIFIER_KEYSYMS = {
    ctrl: 0xffe3, control: 0xffe3,
    shift: 0xffe1,
    alt: 0xffe9,
    super: 0xffeb, win: 0xffeb,
};

const NAMED_KEYSYMS = {
    return: 0xff0d, enter: 0xff0d, tab: 0xff09, escape: 0xff1b, esc: 0xff1b,
    space: 0x20, backspace: 0xff08, delete: 0xffff, del: 0xffff,
    insert: 0xff63, home: 0xff50, end: 0xff57, pageup: 0xff55, pagedown: 0xff56,
    left: 0xff51, up: 0xff52, right: 0xff53, down: 0xff54,
    print: 0xff61, menu: 0xff67,
    plus: 0x2b, minus: 0x2d, comma: 0x2c, period: 0x2e, slash: 0x2f,
    backslash: 0x5c, semicolon: 0x3b, apostrophe: 0x27, grave: 0x60,
    equal: 0x3d, bracketleft: 0x5b, bracketright: 0x5d,
    volumeup: 0x1008ff13, volumedown: 0x1008ff11, mute: 0x1008ff12,
    audioplay: 0x1008ff14, audiopause: 0x1008ff31, audiostop: 0x1008ff15,
    audioprev: 0x1008ff16, audionext: 0x1008ff17,
};

function keysymForToken(token) {
    if ([...token].length === 1) {
        const cp = token.toLowerCase().codePointAt(0);
        return cp < 0x100 ? cp : 0x01000000 + cp;
    }
    const name = token.toLowerCase().replace(/[_\-\s]/g, '');
    if (name in NAMED_KEYSYMS)
        return NAMED_KEYSYMS[name];
    const fn = /^f([1-9]|1[0-2])$/.exec(name);
    if (fn)
        return 0xffbd + parseInt(fn[1], 10);
    return null;
}

/**
 * Parse "Ctrl+Shift+T" into { modifiers: [keysym...], key: keysym } or null.
 */
function parseKeyCombo(combo) {
    if (typeof combo !== 'string' || combo.trim() === '' || combo.length > 64)
        return null;

    const s = combo.trim();
    let keyToken;
    let modTokens;
    if (s.endsWith('+')) {
        keyToken = '+';
        modTokens = s.slice(0, -1).split('+').map(t => t.trim()).filter(Boolean);
    } else {
        const parts = s.split('+').map(t => t.trim()).filter(Boolean);
        keyToken = parts.pop();
        modTokens = parts;
    }
    if (!keyToken)
        return null;

    const modifiers = [];
    for (const m of modTokens) {
        const sym = MODIFIER_KEYSYMS[m.toLowerCase()];
        if (sym === undefined)
            return null;
        if (!modifiers.includes(sym))
            modifiers.push(sym);
    }

    const key = keysymForToken(keyToken);
    if (key === null)
        return null;
    return { modifiers, key };
}

let _virtualKeyboard = null;

function sendKeyCombo(combo) {
    const parsed = parseKeyCombo(combo);
    if (!parsed) {
        console.warn('TouchSideBar: invalid keyboard shortcut, nothing sent');
        return;
    }
    try {
        if (!_virtualKeyboard) {
            const seat = getSeat();
            if (!seat)
                throw new Error('no input seat available');
            _virtualKeyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        }
        const send = (keyval, state) =>
            _virtualKeyboard.notify_keyval(GLib.get_monotonic_time(), keyval, state);

        for (const mod of parsed.modifiers)
            send(mod, Clutter.KeyState.PRESSED);
        send(parsed.key, Clutter.KeyState.PRESSED);
        send(parsed.key, Clutter.KeyState.RELEASED);
        for (const mod of [...parsed.modifiers].reverse())
            send(mod, Clutter.KeyState.RELEASED);
    } catch (e) {
        console.error('TouchSideBar: failed to send keyboard shortcut', e);
    }
}

function destroyVirtualKeyboard() {
    if (_virtualKeyboard) {
        _virtualKeyboard.run_dispose();
        _virtualKeyboard = null;
    }
}

function mprisAction(methodName, fallbackKey) {
    try {
        Gio.DBus.session.call(
            'org.freedesktop.DBus',
            '/org/freedesktop/DBus',
            'org.freedesktop.DBus',
            'ListNames',
            null,
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null,
            (conn, res) => {
                try {
                    const result = conn.call_finish(res);
                    const [names] = result.deepUnpack();
                    const mprisNames = names.filter(n => n.startsWith('org.mpris.MediaPlayer2.'));
                    if (mprisNames.length > 0) {
                        for (const name of mprisNames) {
                            conn.call(
                                name,
                                '/org/mpris/MediaPlayer2',
                                'org.mpris.MediaPlayer2.Player',
                                methodName,
                                null,
                                null,
                                Gio.DBusCallFlags.NONE,
                                -1,
                                null,
                                null
                            );
                        }
                    } else if (fallbackKey) {
                        sendKeyCombo(fallbackKey);
                    }
                } catch (_e) {
                    if (fallbackKey) sendKeyCombo(fallbackKey);
                }
            }
        );
    } catch (_e) {
        if (fallbackKey) sendKeyCombo(fallbackKey);
    }
}

// ─── Action Executor ──────────────────────────────────────────────────────────

/**
 * Central dispatcher: given an action definition object, perform the action.
 */
function executeAction(action, extensionObject) {
    switch (action.type) {
        case 'prev-workspace': {
            const ws = global.workspace_manager ?? global.workspaceManager;
            if (ws) {
                const idx = ws.get_active_workspace_index();
                if (idx > 0) ws.get_workspace_by_index(idx - 1).activate(global.get_current_time());
            }
            break;
        }
        case 'next-workspace': {
            const ws = global.workspace_manager ?? global.workspaceManager;
            if (ws) {
                const idx = ws.get_active_workspace_index();
                const last = ws.get_n_workspaces() - 1;
                if (idx < last) ws.get_workspace_by_index(idx + 1).activate(global.get_current_time());
            }
            break;
        }
        case 'overview':
            if (Main.overview.visible) Main.overview.hide();
            else Main.overview.show();
            break;
        case 'fullscreen':
            extensionObject?.toggleSidebarFullscreen();
            break;
        case 'power-shutdown':
            spawnCommand('gnome-session-quit --power-off');
            break;
        case 'power-reboot':
            spawnCommand('gnome-session-quit --reboot');
            break;
        case 'power-suspend':
            spawnCommand('systemctl suspend');
            break;
        case 'power-logout':
            spawnCommand('gnome-session-quit --logout');
            break;
        case 'power-lock':
            spawnCommand('loginctl lock-session');
            break;
        case 'terminal-command':
            if (action.command && action.command.trim() !== '')
                spawnCommand(`bash -c ${GLib.shell_quote(action.command)}`);
            break;
        case 'system-command':
            if (action.command && action.command.trim() !== '')
                spawnCommand(action.command);
            break;
        // Copy / paste send the standard shortcuts to the focused app through
        // the virtual keyboard, which works on Wayland (xdotool does not).
        case 'copy':
            sendKeyCombo('Ctrl+C');
            break;
        case 'paste':
            sendKeyCombo('Ctrl+V');
            break;
        case 'media-play-pause':
            mprisAction('PlayPause', 'audioplay');
            break;
        case 'media-next':
            mprisAction('Next', 'audionext');
            break;
        case 'media-prev':
            mprisAction('Previous', 'audioprev');
            break;
        case 'media-stop':
            mprisAction('Stop', 'audiostop');
            break;
        case 'media-volume-up':
            sendKeyCombo('volumeup');
            break;
        case 'media-volume-down':
            sendKeyCombo('volumedown');
            break;
        case 'media-volume-mute':
            sendKeyCombo('mute');
            break;
        case 'keyboard-shortcut':
            sendKeyCombo(action.shortcut);
            break;
        case 'app-shortcut':
            if (action.appId) {
                const app = Shell.AppSystem.get_default().lookup_app(action.appId);
                if (app) app.activate();
            }
            break;
        default:
            console.warn(`TouchSideBar: unknown action type "${action.type}"`);
    }
}

// ─── Action Button ─────────────────────────────────────────────────────────────

const TouchActionButton = GObject.registerClass(
class TouchActionButton extends St.Button {
    _init(action, extensionObject, showLabel = true, metrics = scaleMetrics(80)) {
        super._init({
            style_class: 'touch-sidebar-btn',
            // Must not take key focus: the target app window has to stay
            // focused for fullscreen / keyboard-shortcut actions to reach it.
            can_focus: false,
            track_hover: true,
            accessible_name: action.label || action.type,
            reactive: true,
            x_expand: true,
        });

        this._action = action;
        this._ext = extensionObject;

        // Only the padding is set inline; background, border and radius come
        // from the stylesheet so hover/active states keep working.
        const p = metrics.pad;
        this.set_style(
            `padding: ${p.top}px ${p.right}px ${p.bottom}px ${p.left}px;`
        );

        const box = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });

        const iconName = (action.icon && typeof action.icon === 'string' && action.icon.trim() !== '')
            ? action.icon.trim()
            : _defaultIconForType(action.type);

        let icon = null;
        if (action.type === 'app-shortcut' && action.appId && (!action.icon || action.icon.trim() === '')) {
            try {
                const app = Shell.AppSystem.get_default().lookup_app(action.appId);
                const appIcon = app?.get_app_info()?.get_icon?.();
                if (appIcon) {
                    icon = new St.Icon({
                        gicon: appIcon,
                        icon_size: metrics.iconSize,
                        style_class: 'touch-sidebar-icon',
                        fallback_icon_name: 'application-x-executable-symbolic',
                    });
                    if (action.iconColor && typeof action.iconColor === 'string' && action.iconColor.trim() !== '' && isSafeCssColor(action.iconColor.trim()))
                        icon.set_style(`color: ${action.iconColor.trim()};`);
                }
            } catch (_e) {
                icon = null;
            }
        }

        if (!icon) {
            icon = makeIcon(iconName, action.iconColor || '', metrics.iconSize);
        }

        icon.x_align = Clutter.ActorAlign.CENTER;
        box.add_child(icon);

        if (showLabel && action.label && action.label.trim() !== '') {
            const label = new St.Label({
                text: action.label,
                style_class: 'touch-sidebar-btn-label',
                x_align: Clutter.ActorAlign.CENTER,
            });
            label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            label.set_style(
                `font-size: ${metrics.fontSize}px;` +
                (action.iconColor && typeof action.iconColor === 'string' && action.iconColor.trim() !== '' && isSafeCssColor(action.iconColor.trim()) ? ` color: ${action.iconColor.trim()};` : '')
            );
            box.add_child(label);
        }

        this.set_child(box);

        this.connect('clicked', () => executeAction(this._action, this._ext));
    }
});

function _defaultIconForType(type) {
    const map = {
        'prev-workspace':    'go-previous-symbolic',
        'next-workspace':    'go-next-symbolic',
        'overview':          'view-grid-symbolic',
        'fullscreen':        'view-fullscreen-symbolic',
        'media-play-pause':  'media-playback-start-symbolic',
        'media-next':        'media-skip-forward-symbolic',
        'media-prev':        'media-skip-backward-symbolic',
        'media-stop':        'media-playback-stop-symbolic',
        'media-volume-up':   'audio-volume-high-symbolic',
        'media-volume-down': 'audio-volume-low-symbolic',
        'media-volume-mute': 'audio-volume-muted-symbolic',
        'power-shutdown':    'system-shutdown-symbolic',
        'power-reboot':      'system-reboot-symbolic',
        'power-suspend':     'weather-clear-night-symbolic',
        'power-logout':      'system-log-out-symbolic',
        'power-lock':        'system-lock-screen-symbolic',
        'terminal-command':  'utilities-terminal-symbolic',
        'system-command':    'system-run-symbolic',
        'copy':              'edit-copy-symbolic',
        'paste':              'edit-paste-symbolic',
        'app-shortcut':      'application-x-executable-symbolic',
        'keyboard-shortcut': 'input-keyboard-symbolic',
    };
    return map[type] || 'application-x-executable-symbolic';
}

// ─── Floating Fullscreen-Exit Button ───────────────────────────────────────────

const FS_EXIT_SIZE = 56;
const FS_EXIT_MARGIN = 16;

const FullscreenExitButton = GObject.registerClass(
class FullscreenExitButton extends St.Button {
    _init(onClicked) {
        super._init({
            style_class: 'touch-sidebar-fs-exit',
            reactive: true,
            can_focus: true,
            track_hover: true,
            accessible_name: _('Exit Fullscreen'),
            child: new St.Icon({
                icon_name: 'view-restore-symbolic',
                icon_size: 28,
                style_class: 'touch-sidebar-icon',
            }),
        });
        this.connect('clicked', () => onClicked());
        this.hide();
    }

    placeOn(monitor) {
        this.set_size(FS_EXIT_SIZE, FS_EXIT_SIZE);
        this.set_position(
            monitor.x + FS_EXIT_MARGIN,
            monitor.y + monitor.height - FS_EXIT_SIZE - FS_EXIT_MARGIN
        );
    }
});

// ─── Sidebar Panel ──────────────────────────────────────────────────────────────

const DISMISS_THRESHOLD = 20; // px outward travel on sidebar to dismiss

const TouchSideBar = GObject.registerClass(
class TouchSideBar extends St.BoxLayout {
    _init(settings, extensionObject) {
        super._init({
            style_class: 'touch-sidebar',
            orientation: Clutter.Orientation.VERTICAL,
            reactive: true,
            track_hover: true,
            clip_to_allocation: true,
        });

        this._settings = settings;
        this._ext = extensionObject;
        this._visible = false;
        this._suppressed = false; // true while a window is fullscreened by the sidebar
        this._strutsTracked = false;
        this._currentWidth = settings.get_int('sidebar-width');

        // ── Fillers: absorb free space to align the buttons ───
        this._topFiller = new St.Widget({ y_expand: false });
        this._bottomFiller = new St.Widget({ y_expand: false });

        // ── Scroll container for buttons ──────────────────────
        // Not y_expand: it takes only the height the buttons need (shrinking
        // and scrolling when they don't fit); the fillers take the rest.
        this._scrollView = new St.ScrollView({
            style_class: 'touch-sidebar-scroll',
            y_expand: false,
            x_expand: true,
        });
        this._scrollView.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        this._scrollView.set_overlay_scrollbars(true);

        this._buttonBox = new St.BoxLayout({
            style_class: 'touch-sidebar-button-box',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
        });
        this._scrollView.set_child(this._buttonBox);

        this._rebuildLayout();
        this._applyAppearance();

        // ── Start hidden ───────────────────────────────────────
        this.hide();
        this.set_opacity(0);

        // ── Dismiss swipe: drag outward toward screen edge ────
        this._dismissDragging = false;
        this._dismissStartX = 0;
        this._dismissTriggered = false;
        this.connect('button-press-event', this._onDismissPress.bind(this));
        this.connect('button-release-event', this._onDismissRelease.bind(this));
        this.connect('motion-event', this._onDismissMotion.bind(this));
        this.connect('touch-event', this._onDismissTouch.bind(this));

        // ── Settings listeners ────────────────────────────────
        this._settingsChangedId = settings.connect('changed', (_s, key) => {
            // Width is only ever changed through the settings; read it first so
            // the rebuild below positions the sidebar using the new value.
            if (key === 'sidebar-width')
                this._currentWidth = settings.get_int('sidebar-width');
            if (key === 'sidebar-on-right' || key === 'sidebar-width' || key === 'actions' ||
                key === 'show-action-labels' || key.startsWith('icon-padding-')) {
                this._rebuildLayout();
            }
            if (key === 'button-alignment' || key === 'sidebar-color') {
                this._applyAppearance();
            }
        });
    }

    // ── Dismiss swipe handlers ────────────────────────────────────────────────

    _onDismissPress(actor, event) {
        this._dismissDragging = true;
        this._dismissTriggered = false;
        this._dismissStartX = event.get_coords()[0];
        return Clutter.EVENT_PROPAGATE;
    }

    _onDismissRelease() {
        this._dismissDragging = false;
        return Clutter.EVENT_PROPAGATE;
    }

    _onDismissMotion(actor, event) {
        if (!this._dismissDragging || this._dismissTriggered)
            return Clutter.EVENT_PROPAGATE;
        const [cx] = event.get_coords();
        const onRight = this._settings.get_boolean('sidebar-on-right');
        // outward = toward the screen edge where the sidebar lives
        const delta = onRight ? cx - this._dismissStartX : this._dismissStartX - cx;
        if (delta >= DISMISS_THRESHOLD) {
            this._dismissTriggered = true;
            this._hideSidebar();
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _onDismissTouch(actor, event) {
        const type = event.type();
        if (type === Clutter.EventType.TOUCH_BEGIN) {
            this._dismissDragging = true;
            this._dismissTriggered = false;
            this._dismissStartX = event.get_coords()[0];
            return Clutter.EVENT_PROPAGATE;
        }
        if (type === Clutter.EventType.TOUCH_END || type === Clutter.EventType.TOUCH_CANCEL) {
            this._dismissDragging = false;
            return Clutter.EVENT_PROPAGATE;
        }
        if (type === Clutter.EventType.TOUCH_UPDATE && this._dismissDragging && !this._dismissTriggered) {
            const [cx] = event.get_coords();
            const onRight = this._settings.get_boolean('sidebar-on-right');
            const delta = onRight ? cx - this._dismissStartX : this._dismissStartX - cx;
            if (delta >= DISMISS_THRESHOLD) {
                this._dismissTriggered = true;
                this._hideSidebar();
            }
            return Clutter.EVENT_PROPAGATE;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    // ── Layout ────────────────────────────────────────────────────────────────

    _rebuildLayout() {
        // Remove existing children
        this.remove_all_children();
        this._buttonBox.destroy_all_children();
        this._buildButtons();
        this.add_child(this._topFiller);
        this.add_child(this._scrollView);
        this.add_child(this._bottomFiller);

        this._applyWidth();
        this._positionSidebar();
    }

    // Whether an item should be visible given its `showWhen` setting and
    // whether the focused workspace currently has a window.
    _isItemVisible(mode, hasWindow) {
        if (mode === 'has-window') return hasWindow;
        if (mode === 'no-window') return !hasWindow;
        return true;
    }

    // Re-evaluate every conditional item against the active workspace.
    refreshWindowVisibility() {
        if (!this._conditionalItems || this._conditionalItems.length === 0)
            return;
        const hasWindow = activeWorkspaceHasWindow();
        for (const { widget, mode } of this._conditionalItems)
            widget.visible = this._isItemVisible(mode, hasWindow);
    }

    _buildButtons() {
        this._conditionalItems = [];
        const actionsJson = this._settings.get_string('actions');
        let actions = [];
        try {
            actions = JSON.parse(actionsJson);
        } catch (_e) {
            actions = _defaultActions();
        }
        if (!Array.isArray(actions) || actions.length === 0) {
            actions = _defaultActions();
        }

        const showLabels = this._settings.get_boolean('show-action-labels');
        const s = this._settings;
        const metrics = scaleMetrics(this._currentWidth, {
            top: s.get_int('icon-padding-top'),
            bottom: s.get_int('icon-padding-bottom'),
            left: s.get_int('icon-padding-left'),
            right: s.get_int('icon-padding-right'),
        });

        const addItem = (widget, action) => {
            this._buttonBox.add_child(widget);
            if (action.showWhen === 'has-window' || action.showWhen === 'no-window')
                this._conditionalItems.push({ widget, mode: action.showWhen });
        };

        for (const action of actions) {
            if (!action.enabled && action.enabled !== undefined) continue;

            // Layout-only items: not clickable, just organise the look.
            if (action.type === 'spacer') {
                const size = Math.max(4, Math.min(400, parseInt(action.size, 10) || 24));
                addItem(new St.Widget({
                    style_class: 'touch-sidebar-spacer',
                    height: size,
                }), action);
                continue;
            }
            if (action.type === 'separator') {
                const line = new St.Widget({
                    style_class: 'touch-sidebar-separator',
                    x_expand: true,
                    height: 2,
                });
                if (isSafeCssColor(action.iconColor))
                    line.set_style(`background-color: ${action.iconColor};`);
                addItem(line, action);
                continue;
            }

            const btn = new TouchActionButton(action, this._ext, showLabels, metrics);
            addItem(btn, action);
        }

        this.refreshWindowVisibility();
    }

    _applyAppearance() {
        // Background colour (validated so it can't inject extra CSS)
        const color = this._settings.get_string('sidebar-color');
        this.set_style(isSafeCssColor(color) ? `background-color: ${color};` : '');

        // Vertical alignment of the button group. The free space (sidebar
        // height minus the buttons' height) is handed to the filler widgets
        // above/below the button list, so it adapts to the number of buttons
        // and the display height automatically:
        //   top    -> only the bottom filler grows
        //   middle -> both fillers grow equally
        //   bottom -> only the top filler grows
        // When the buttons overflow there is no free space and the list scrolls.
        const align = this._settings.get_string('button-alignment');
        this._topFiller.y_expand = align === 'middle' || align === 'bottom';
        this._bottomFiller.y_expand = align === 'middle' || align === 'top';
    }

    _applyWidth() {
        const w = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, this._currentWidth));
        this.set_width(w);
    }

    _positionSidebar() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor) return;

        const onRight = this._settings.get_boolean('sidebar-on-right');
        const w = this._currentWidth;
        const panelHeight = Main.panel.height || (typeof Main.panel.get_height === 'function' ? Main.panel.get_height() : 32) || 32;

        // Mirrors the shadow direction (see stylesheet.css)
        if (onRight)
            this.add_style_class_name('sidebar-right');
        else
            this.remove_style_class_name('sidebar-right');

        this.set_position(
            onRight ? monitor.x + monitor.width - w : monitor.x,
            monitor.y + panelHeight
        );
        this.set_height(monitor.height - panelHeight);
    }

    // ── Show / Hide ───────────────────────────────────────────────────────────

    // While the sidebar is visible it reserves screen space (struts) so windows
    // sit beside it on the same plane instead of underneath / on top of it.
    _setStruts(enabled) {
        if (enabled === this._strutsTracked) return;
        this._strutsTracked = enabled;
        Main.layoutManager.untrackChrome(this);
        Main.layoutManager.trackChrome(this, {
            affectsStruts: enabled,
            trackFullscreen: false,
        });
    }

    setSuppressed(suppressed) {
        this._suppressed = suppressed;
    }

    _hideSidebar() {
        if (!this._visible) return;
        this._visible = false;
        this._setStruts(false);
        this.ease({
            opacity: 0,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => { if (!this._visible) this.hide(); },
        });
    }

    _showSidebar() {
        if (this._suppressed) return;
        if (this._visible && this.visible && this.opacity === 255) return;
        this._visible = true;
        this._positionSidebar();
        this.show();
        this._setStruts(true);
        this.ease({
            opacity: 255,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
        });
    }

    // ── Public toggle (called from panel button) ──────────────────────────────

    toggleVisibility() {
        if (this._visible)
            this._hideSidebar();
        else
            this._showSidebar();
    }

    updatePosition() {
        this._positionSidebar();
    }

    get isShown() {
        return this._visible;
    }

    destroy() {
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        super.destroy();
    }
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

function _defaultActions() {
    return [
        { type: 'overview',         label: 'Overview',  icon: 'view-grid-symbolic',             iconColor: '', enabled: true },
        { type: 'prev-workspace',   label: 'Prev WS',   icon: 'go-previous-symbolic',           iconColor: '', enabled: true },
        { type: 'next-workspace',   label: 'Next WS',   icon: 'go-next-symbolic',               iconColor: '', enabled: true },
    ];
}

// ─── Panel Indicator ───────────────────────────────────────────────────────────

const TouchSideBarIndicator = GObject.registerClass(
class TouchSideBarIndicator extends PanelMenu.Button {
    _init(sidebar, settings, iconFile) {
        super._init(0.0, 'TouchSideBar');
        this._sidebar = sidebar;
        this._settings = settings;

        // Page-with-a-list icon shipped with the extension; falls back to a
        // themed icon if the file is missing.
        const icon = new St.Icon({
            style_class: 'system-status-icon',
            fallback_icon_name: 'view-list-symbolic',
        });
        if (iconFile && typeof iconFile.query_exists === 'function' && iconFile.query_exists(null))
            icon.gicon = new Gio.FileIcon({ file: iconFile });
        else
            icon.gicon = Gio.ThemedIcon.new_with_default_fallbacks('view-list-symbolic');
        this.add_child(icon);

        // Primary click / tap toggles the sidebar immediately (see vfunc_event).
        // The menu below is opened with a secondary (right) click.

        // ── Switch side ───────────────────────────────────────
        // A long press on the panel icon does the same (see vfunc_event).
        const switchSide = new PopupMenu.PopupMenuItem('');
        const updateSwitchLabel = () => {
            switchSide.label.set_text(
                settings.get_boolean('sidebar-on-right') ? _('Move to Left') : _('Move to Right'));
        };
        updateSwitchLabel();
        switchSide.connect('activate', () => this._toggleSide());
        this.menu.addMenuItem(switchSide);
        this._sideChangedId = settings.connect('changed::sidebar-on-right', updateSwitchLabel);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // ── Preferences ───────────────────────────────────────
        const prefsItem = new PopupMenu.PopupMenuItem(_('Preferences…'));
        prefsItem.connect('activate', () => {
            this._ext?.openPreferences();
        });
        this.menu.addMenuItem(prefsItem);
    }

    _toggleSide() {
        this._settings.set_boolean('sidebar-on-right', !this._settings.get_boolean('sidebar-on-right'));
    }

    // Press starts a long-press timer. Releasing before it fires is a tap
    // (toggle visibility); if it fires, the sidebar switches sides instead.
    _startPress() {
        this._cancelPress();
        this._longPressFired = false;
        this._pressActive = true;
        this._longPressId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, LONG_PRESS_MS, () => {
            this._longPressId = 0;
            this._longPressFired = true;
            this._toggleSide();
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(this._longPressId, '[touchsidebar] long press');
    }

    _endPress(cancelled = false) {
        if (!this._pressActive)
            return;
        this._pressActive = false;
        const fired = this._longPressFired;
        this._cancelPress();
        if (!fired && !cancelled)
            this._sidebar.toggleVisibility();
    }

    _cancelPress() {
        if (this._longPressId) {
            GLib.source_remove(this._longPressId);
            this._longPressId = 0;
        }
    }

    vfunc_event(event) {
        const type = event.type();
        if (type === Clutter.EventType.BUTTON_PRESS) {
            // Touch is handled via TOUCH_* events; skip the emulated duplicates.
            if (event.get_flags() & Clutter.EventFlags.POINTER_EMULATED)
                return Clutter.EVENT_STOP;
            if (event.get_button() === Clutter.BUTTON_SECONDARY) {
                this.menu.toggle();
            } else {
                this.menu.close();
                this._startPress();
            }
            return Clutter.EVENT_STOP;
        }
        if (type === Clutter.EventType.BUTTON_RELEASE) {
            if (event.get_flags() & Clutter.EventFlags.POINTER_EMULATED)
                return Clutter.EVENT_STOP;
            this._endPress();
            return Clutter.EVENT_STOP;
        }
        if (type === Clutter.EventType.TOUCH_BEGIN) {
            this.menu.close();
            this._startPress();
            return Clutter.EVENT_STOP;
        }
        if (type === Clutter.EventType.TOUCH_END) {
            this._endPress();
            return Clutter.EVENT_STOP;
        }
        if (type === Clutter.EventType.TOUCH_CANCEL) {
            this._endPress(true);
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    destroy() {
        this._cancelPress();
        if (this._sideChangedId) {
            this._settings.disconnect(this._sideChangedId);
            this._sideChangedId = null;
        }
        super.destroy();
    }

    setExtension(ext) {
        this._ext = ext;
    }
});

// ─── Edge Swipe Zone ───────────────────────────────────────────────────────────
//
// An invisible 8 px strip anchored to the screen edge (same side as the
// sidebar). Dragging / swiping inward from this strip shows the sidebar.
// Works with both mouse pointer-press/motion and touch TOUCH_BEGIN/UPDATE events.

const SWIPE_THRESHOLD = 20; // px inward travel needed to trigger reveal

const EdgeSwipeZone = GObject.registerClass(
class EdgeSwipeZone extends St.Button {
    _init(settings, sidebar) {
        super._init({
            style_class: 'touch-sidebar-swipe-zone',
            reactive: true,
            can_focus: false,
            opacity: 0,          // fully transparent — invisible but interactive
            width: 8,
        });

        this._settings = settings;
        this._sidebar = sidebar;
        this._dragging = false;
        this._startX = 0;
        this._triggered = false;

        this.connect('button-press-event', this._onPress.bind(this));
        this.connect('button-release-event', this._onRelease.bind(this));
        this.connect('motion-event', this._onMotion.bind(this));
        this.connect('touch-event', this._onTouch.bind(this));

        this._sideChangedId = settings.connect('changed::sidebar-on-right', () => this._reposition());
    }

    destroy() {
        if (this._sideChangedId) {
            this._settings.disconnect(this._sideChangedId);
            this._sideChangedId = null;
        }
        super.destroy();
    }

    _reposition() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor) return;
        const onRight = this._settings.get_boolean('sidebar-on-right');
        const panelHeight = Main.panel.height || (typeof Main.panel.get_height === 'function' ? Main.panel.get_height() : 32) || 32;
        this.set_size(8, monitor.height - panelHeight);
        this.set_position(
            onRight ? monitor.x + monitor.width - 8 : monitor.x,
            monitor.y + panelHeight
        );
    }

    _onPress(actor, event) {
        this._dragging = true;
        this._triggered = false;
        this._startX = event.get_coords()[0];
        return Clutter.EVENT_STOP;
    }

    _onRelease() {
        this._dragging = false;
        return Clutter.EVENT_STOP;
    }

    _onMotion(actor, event) {
        if (!this._dragging || this._triggered) return Clutter.EVENT_PROPAGATE;
        const [cx] = event.get_coords();
        const onRight = this._settings.get_boolean('sidebar-on-right');
        const delta = onRight ? this._startX - cx : cx - this._startX;
        if (delta >= SWIPE_THRESHOLD) {
            this._triggered = true;
            this._revealSidebar();
        }
        return Clutter.EVENT_STOP;
    }

    _onTouch(actor, event) {
        const type = event.type();
        if (type === Clutter.EventType.TOUCH_BEGIN) {
            this._dragging = true;
            this._triggered = false;
            this._startX = event.get_coords()[0];
            return Clutter.EVENT_STOP;
        }
        if (type === Clutter.EventType.TOUCH_END || type === Clutter.EventType.TOUCH_CANCEL) {
            this._dragging = false;
            return Clutter.EVENT_STOP;
        }
        if (type === Clutter.EventType.TOUCH_UPDATE && this._dragging && !this._triggered) {
            const [cx] = event.get_coords();
            const onRight = this._settings.get_boolean('sidebar-on-right');
            const delta = onRight ? this._startX - cx : cx - this._startX;
            if (delta >= SWIPE_THRESHOLD) {
                this._triggered = true;
                this._revealSidebar();
            }
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _revealSidebar() {
        // Show the sidebar if it's currently hidden
        if (!this._sidebar.visible || this._sidebar.opacity === 0) {
            this._sidebar._visible = false; // force showSidebar to run
            this._sidebar._showSidebar();
        }
    }
});

// ─── Extension Entry Point ─────────────────────────────────────────────────────

export default class TouchSideBarExtension extends Extension {
    // ── Sidebar-driven fullscreen ─────────────────────────────────────────────
    // The sidebar's Fullscreen button fullscreens the target window, hides the
    // sidebar, and shows a small floating button at the lower-left of the screen
    // that undoes it.

    /**
     * The window the user was working in. The focus window can be null while
     * the shell UI has focus, so fall back to the most-recently-used window
     * on the active workspace.
     */
    _getTargetWindow() {
        const focus = global.display.get_focus_window();
        if (focus && focus.get_window_type() === Meta.WindowType.NORMAL)
            return focus;

        const wsManager = global.workspace_manager ?? global.workspaceManager;
        const workspace = wsManager?.get_active_workspace?.();
        const windows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace);
        return windows.find(w => !w.minimized) ?? null;
    }

    toggleSidebarFullscreen() {
        if (this._fsWindow) {
            this._exitSidebarFullscreen();
            return;
        }

        const win = this._getTargetWindow();
        if (!win) {
            console.warn('TouchSideBar: no window available to fullscreen');
            return;
        }

        const isFullscreen = typeof win.is_fullscreen === 'function' ? win.is_fullscreen() : win.fullscreen;
        if (isFullscreen) {
            win.unmake_fullscreen();
            return;
        }

        win.make_fullscreen();
        const nowFs = typeof win.is_fullscreen === 'function' ? win.is_fullscreen() : win.fullscreen;
        if (!nowFs) {
            console.warn('TouchSideBar: window refused to enter fullscreen');
            return;
        }

        this._fsWindow = win;
        this._fsRestoreSidebar = this._sidebar.isShown;
        this._fsSignalIds = [
            win.connect('notify::fullscreen', () => {
                const fs = typeof win.is_fullscreen === 'function' ? win.is_fullscreen() : win.fullscreen;
                if (!fs)
                    this._exitSidebarFullscreen(false);
            }),
            win.connect('unmanaged', () => this._exitSidebarFullscreen(false)),
        ];

        this._sidebar._hideSidebar();
        this._sidebar.setSuppressed(true);
        this._swipeZone?.hide();

        const monitor = Main.layoutManager.monitors[win.get_monitor()] ??
            Main.layoutManager.primaryMonitor;
        this._fsExitButton.placeOn(monitor);
        this._fsExitButton.show();
    }

    _exitSidebarFullscreen(unmake = true) {
        const win = this._fsWindow;
        if (!win)
            return;
        this._fsWindow = null;

        for (const id of this._fsSignalIds ?? [])
            win.disconnect(id);
        this._fsSignalIds = null;

        const isFs = typeof win.is_fullscreen === 'function' ? win.is_fullscreen() : win.fullscreen;
        if (unmake && isFs)
            win.unmake_fullscreen();

        this._fsExitButton?.hide();
        this._swipeZone?.show();
        if (this._sidebar) {
            this._sidebar.setSuppressed(false);
            const isTouchActive = Boolean((this._seat || getSeat())?.touch_mode);
            if (this._fsRestoreSidebar || isTouchActive)
                this._sidebar._showSidebar();
        }
    }

    // ── Any-app fullscreen (e.g. a video player) ──────────────────────────────
    // The sidebar is not tracked as fullscreen-aware chrome, so it would stay
    // on top of (and reserve space beside) a fullscreen window. Hide it while
    // the primary monitor is in fullscreen and bring it back afterwards.
    // Sidebar-driven fullscreen (_fsWindow) manages the sidebar itself.

    _syncAppFullscreen() {
        if (!this._sidebar || this._fsWindow)
            return;
        const primaryIdx = Main.layoutManager.primaryIndex ?? 0;
        const inFs = primaryIdx >= 0 && global.display.get_monitor_in_fullscreen(primaryIdx);

        if (inFs && !this._appFsActive) {
            this._appFsActive = true;
            this._appFsRestore = this._sidebar.isShown;
            this._sidebar._hideSidebar();
            this._sidebar.setSuppressed(true);
            this._swipeZone?.hide();
        } else if (!inFs && this._appFsActive) {
            this._appFsActive = false;
            this._swipeZone?.show();
            this._sidebar.setSuppressed(false);
            const isTouchActive = Boolean((this._seat || getSeat())?.touch_mode);
            if (this._appFsRestore || isTouchActive)
                this._sidebar._showSidebar();
            this._appFsRestore = false;
        }
    }

    // ── Touch / tablet mode ───────────────────────────────────────────────────
    // mutter flips the seat's `touch-mode` when the device is folded into tablet
    // mode (or is used with only a touchscreen).

    _syncTouchMode() {
        if (!this._seat || !this._sidebar)
            return;
        if (this._seat.touch_mode) {
            if (!this._appFsActive && !this._fsWindow)
                this._sidebar._showSidebar();
        } else {
            this._sidebar._hideSidebar();
        }
    }

    enable() {
        this._settings = this.getSettings(SCHEMA_KEY);

        // ── Sidebar widget ────────────────────────────────────
        this._sidebar = new TouchSideBar(this._settings, this);
        Main.layoutManager.addChrome(this._sidebar, {
            affectsStruts: false,
            trackFullscreen: false,
        });
        this._sidebar._positionSidebar();

        // ── Edge swipe zone ───────────────────────────────────
        // Placed above sidebar in the chrome stack so it catches
        // touches/drags that start from the very edge of the screen.
        this._swipeZone = new EdgeSwipeZone(this._settings, this._sidebar);
        Main.layoutManager.addChrome(this._swipeZone, {
            affectsStruts: false,
            trackFullscreen: false,
        });
        this._swipeZone._reposition();

        // ── Hide the sidebar while any app is fullscreen ──────
        this._appFsActive = false;
        this._appFsRestore = false;
        this._fullscreenChangedId = global.display.connect(
            'in-fullscreen-changed', () => this._syncAppFullscreen());

        // ── Floating "exit fullscreen" button ─────────────────
        this._fsExitButton = new FullscreenExitButton(() => this._exitSidebarFullscreen());
        Main.layoutManager.addChrome(this._fsExitButton, {
            affectsStruts: false,
            trackFullscreen: false,
        });

        // ── Touch / tablet mode ───────────────────────────────
        this._seat = getSeat();
        if (this._seat) {
            this._touchModeId = this._seat.connect('notify::touch-mode', () => this._syncTouchMode());
            this._syncTouchMode();
        }

        // ── Panel indicator ───────────────────────────────────
        this._indicator = new TouchSideBarIndicator(this._sidebar, this._settings,
            Gio.File.new_for_path(GLib.build_filenamev([this.path, 'icons', 'touchsidebar-list-symbolic.svg'])));
        this._indicator.setExtension(this);
        Main.panel.addToStatusArea('touchsidebar', this._indicator);

        this._syncAppFullscreen();

        // ── Show/hide actions depending on windows on the active workspace ─
        this._wmSignalIds = ['switch-workspace', 'map', 'destroy', 'minimize', 'unminimize']
            .map(name => global.window_manager.connect(name, () => this._queueWindowRefresh()));
        // 'restacked' also covers windows moved to another workspace.
        this._displaySignalIds = ['notify::focus-window', 'restacked']
            .map(name => global.display.connect(name, () => this._queueWindowRefresh()));

        // ── Reposition on monitor change ──────────────────────
        this._monitorsChangedId = Main.layoutManager.connect(
            'monitors-changed', () => {
                this._sidebar._positionSidebar();
                this._swipeZone._reposition();
            }
        );

    }

    // Deferred so the window list already reflects the change that fired the signal.
    _queueWindowRefresh() {
        if (this._refreshIdleId)
            return;
        this._refreshIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._refreshIdleId = 0;
            this._sidebar?.refreshWindowVisibility();
            return GLib.SOURCE_REMOVE;
        });
    }

    disable() {
        if (this._refreshIdleId) {
            GLib.source_remove(this._refreshIdleId);
            this._refreshIdleId = 0;
        }
        for (const id of this._wmSignalIds ?? [])
            global.window_manager.disconnect(id);
        this._wmSignalIds = null;
        for (const id of this._displaySignalIds ?? [])
            global.display.disconnect(id);
        this._displaySignalIds = null;
        this._exitSidebarFullscreen();
        if (this._seat && this._touchModeId)
            this._seat.disconnect(this._touchModeId);
        this._touchModeId = null;
        this._seat = null;
        destroyVirtualKeyboard();
        if (this._fsExitButton) {
            this._fsExitButton.destroy();
            this._fsExitButton = null;
        }
        if (this._fullscreenChangedId) {
            global.display.disconnect(this._fullscreenChangedId);
            this._fullscreenChangedId = null;
        }
        this._appFsActive = false;
        this._appFsRestore = false;
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = null;
        }
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        if (this._swipeZone) {
            this._swipeZone.destroy();
            this._swipeZone = null;
        }
        if (this._sidebar) {
            this._sidebar.destroy();
            this._sidebar = null;
        }
        this._settings = null;
    }

    openPreferences() {
        super.openPreferences();
    }
}
