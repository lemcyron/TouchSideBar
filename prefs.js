/**
 * TouchSideBar – Preferences
 *
 * Full GTK4 + libadwaita preferences window.
 * Users can:
 *   • Toggle sidebar side (left / right)
 *   • Set sidebar width, button alignment, labels and background color
 *   • Add, remove, reorder, and edit action buttons
 *   • Set the icon spacing (top / bottom / left / right) used by every button
 *   • Choose action type, label, icon (popup picker), and icon color for each button
 */

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Pango from 'gi://Pango';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const SCHEMA_KEY = 'org.gnome.shell.extensions.touchsidebar';

const ACTION_TYPES = [
    { id: 'prev-workspace',  label: 'Previous Workspace',     icon: 'go-previous-symbolic' },
    { id: 'next-workspace',  label: 'Next Workspace',         icon: 'go-next-symbolic' },
    { id: 'overview',        label: 'Show Overview',          icon: 'view-grid-symbolic' },
    { id: 'fullscreen',      label: 'Toggle Fullscreen',      icon: 'view-fullscreen-symbolic' },
    { id: 'media-play-pause',label: 'Media: Play / Pause',    icon: 'media-playback-start-symbolic' },
    { id: 'media-next',      label: 'Media: Next Track',      icon: 'media-skip-forward-symbolic' },
    { id: 'media-prev',      label: 'Media: Previous Track',  icon: 'media-skip-backward-symbolic' },
    { id: 'media-stop',      label: 'Media: Stop',            icon: 'media-playback-stop-symbolic' },
    { id: 'media-volume-up', label: 'Volume: Up',             icon: 'audio-volume-high-symbolic' },
    { id: 'media-volume-down', label: 'Volume: Down',         icon: 'audio-volume-low-symbolic' },
    { id: 'media-volume-mute', label: 'Volume: Mute',         icon: 'audio-volume-muted-symbolic' },
    { id: 'power-shutdown',  label: 'Power Off',              icon: 'system-shutdown-symbolic' },
    { id: 'power-reboot',    label: 'Reboot',                 icon: 'system-reboot-symbolic' },
    { id: 'power-suspend',   label: 'Suspend',                icon: 'weather-clear-night-symbolic' },
    { id: 'power-logout',    label: 'Log Out',                icon: 'system-log-out-symbolic' },
    { id: 'power-lock',      label: 'Lock Screen',            icon: 'system-lock-screen-symbolic' },
    { id: 'terminal-command',label: 'Terminal Command',       icon: 'utilities-terminal-symbolic' },
    { id: 'system-command',  label: 'System Command',         icon: 'system-run-symbolic' },
    { id: 'copy',            label: 'Copy (Clipboard)',       icon: 'edit-copy-symbolic' },
    { id: 'paste',           label: 'Paste (Clipboard)',      icon: 'edit-paste-symbolic' },
    { id: 'app-shortcut',    label: 'App Shortcut',           icon: 'application-x-executable-symbolic' },
    { id: 'keyboard-shortcut', label: 'Keyboard Shortcut',    icon: 'input-keyboard-symbolic' },
    { id: 'spacer',          label: 'Spacer (empty gap)',     icon: '' },
    { id: 'separator',       label: 'Horizontal Line',        icon: '' },
];

// Selectable icons shown in the icon picker popup
const ICON_CHOICES = [
    'go-previous-symbolic', 'go-next-symbolic', 'go-up-symbolic', 'go-down-symbolic',
    'go-home-symbolic', 'view-grid-symbolic', 'view-fullscreen-symbolic', 'view-restore-symbolic',
    'view-sidebar-symbolic', 'view-refresh-symbolic', 'window-close-symbolic', 'window-new-symbolic',
    'media-playback-start-symbolic', 'media-playback-pause-symbolic', 'media-playback-stop-symbolic',
    'media-skip-forward-symbolic', 'media-skip-backward-symbolic', 'media-seek-forward-symbolic',
    'media-seek-backward-symbolic', 'media-record-symbolic', 'media-eject-symbolic',
    'audio-volume-high-symbolic', 'audio-volume-medium-symbolic', 'audio-volume-low-symbolic',
    'audio-volume-muted-symbolic', 'microphone-sensitivity-high-symbolic',
    'system-shutdown-symbolic', 'system-reboot-symbolic', 'weather-clear-night-symbolic',
    'system-log-out-symbolic', 'system-lock-screen-symbolic', 'system-run-symbolic',
    'system-search-symbolic', 'preferences-system-symbolic', 'utilities-terminal-symbolic',
    'edit-copy-symbolic', 'edit-paste-symbolic', 'edit-cut-symbolic', 'edit-undo-symbolic',
    'edit-redo-symbolic', 'edit-delete-symbolic', 'edit-find-symbolic', 'edit-select-all-symbolic',
    'document-save-symbolic', 'document-open-symbolic', 'document-new-symbolic',
    'folder-symbolic', 'user-home-symbolic', 'input-keyboard-symbolic', 'input-mouse-symbolic',
    'application-x-executable-symbolic', 'applications-system-symbolic', 'web-browser-symbolic',
    'camera-photo-symbolic', 'camera-video-symbolic', 'accessories-screenshot-symbolic',
    'display-brightness-symbolic', 'night-light-symbolic', 'network-wireless-symbolic',
    'bluetooth-active-symbolic', 'airplane-mode-symbolic', 'battery-full-symbolic',
    'emblem-favorite-symbolic', 'starred-symbolic', 'list-add-symbolic', 'list-remove-symbolic',
    'zoom-in-symbolic', 'zoom-out-symbolic', 'dialog-information-symbolic', 'dialog-warning-symbolic',
];

const SHOW_WHEN_OPTIONS = [
    { id: 'always',     label: 'Always' },
    { id: 'has-window', label: 'Window open' },
    { id: 'no-window',  label: 'No window open' },
];

function _defaultActions() {
    return [
        { type: 'prev-workspace',  label: 'Prev WS',    icon: 'go-previous-symbolic',         iconColor: '', enabled: true },
        { type: 'next-workspace',  label: 'Next WS',    icon: 'go-next-symbolic',              iconColor: '', enabled: true },
        { type: 'overview',        label: 'Overview',   icon: 'view-grid-symbolic',            iconColor: '', enabled: true },
        { type: 'fullscreen',      label: 'Fullscreen', icon: 'view-fullscreen-symbolic',      iconColor: '', enabled: true },
        { type: 'power-lock',      label: 'Lock',       icon: 'system-lock-screen-symbolic',   iconColor: '', enabled: true },
        { type: 'power-logout',    label: 'Logout',     icon: 'system-log-out-symbolic',       iconColor: '', enabled: true },
        { type: 'power-suspend',   label: 'Suspend',    icon: 'weather-clear-night-symbolic',  iconColor: '', enabled: true },
        { type: 'power-reboot',    label: 'Reboot',     icon: 'system-reboot-symbolic',        iconColor: '', enabled: true },
        { type: 'power-shutdown',  label: 'Shutdown',   icon: 'system-shutdown-symbolic',      iconColor: '#cc3333', enabled: true },
        { type: 'copy',            label: 'Copy',       icon: 'edit-copy-symbolic',            iconColor: '', enabled: true },
        { type: 'paste',           label: 'Paste',      icon: 'edit-paste-symbolic',           iconColor: '', enabled: true },
    ];
}

// ─── Action Row Widget ─────────────────────────────────────────────────────────

/**
 * A single expandable row in the Actions list.
 * Shows a summary title and expands to show all editable fields.
 */
const ActionRow = GObject.registerClass({
    GTypeName: 'TouchSideBarActionRow',
    Signals: {
        'removed': {},
        'changed': {},
    },
}, class ActionRow extends Adw.ExpanderRow {
    _init(action) {
        super._init({
            title: _actionSummary(action),
            show_enable_switch: true,
            enable_expansion: action.enabled !== false,
        });

        this._action = { ...action };

        this._dragHandle = new Gtk.Image({
            icon_name: 'list-drag-handle-symbolic',
            css_classes: ['dim-label'],
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Drag to reorder'),
        });
        this.add_prefix(this._dragHandle);

        this._buildContent();

        this.connect('notify::enable-expansion', () => {
            this._action.enabled = this.enable_expansion;
            this.emit('changed');
        });
    }

    _buildContent() {
        // ── Label ─────────────────────────────────────────────
        const labelRow = new Adw.EntryRow({ title: _('Button Label') });
        labelRow.set_text(this._action.label || '');
        labelRow.connect('notify::text', () => {
            this._action.label = labelRow.get_text();
            this.set_title(_actionSummary(this._action));
            this.emit('changed');
        });

        // ── Icon (popup picker with previews) ─────────────────
        const iconRow = new Adw.ActionRow({ title: _('Icon') });
        const setIcon = (name, notify = true) => {
            this._action.icon = name;
            iconRow.set_subtitle(name || _('None'));
            iconPreview.set_from_icon_name(name || null);
            if (notify)
                this.emit('changed');
        };
        const iconPreview = new Gtk.Image({ pixel_size: 24 });
        const iconMenuBtn = new Gtk.MenuButton({
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Choose icon'),
            popover: this._buildIconPopover(name => setIcon(name)),
        });
        const iconBtnBox = new Gtk.Box({ spacing: 8 });
        iconBtnBox.append(iconPreview);
        iconBtnBox.append(new Gtk.Image({ icon_name: 'pan-down-symbolic' }));
        iconMenuBtn.set_child(iconBtnBox);
        iconRow.add_suffix(iconMenuBtn);
        iconRow.set_activatable_widget(iconMenuBtn);
        setIcon(this._action.icon || '', false);

        // ── Action Type ───────────────────────────────────────
        const typeRow = new Adw.ComboRow({ title: _('Action Type') });
        const typeModel = new Gtk.StringList();
        ACTION_TYPES.forEach(t => typeModel.append(t.label));
        typeRow.set_model(typeModel);
        const currentTypeIdx = ACTION_TYPES.findIndex(t => t.id === this._action.type);
        typeRow.set_selected(currentTypeIdx >= 0 ? currentTypeIdx : 0);
        typeRow.connect('notify::selected', () => {
            const idx = typeRow.get_selected();
            this._action.type = ACTION_TYPES[idx]?.id || 'overview';
            // Auto-fill icon if empty
            if (!this._action.icon || this._action.icon === '')
                setIcon(ACTION_TYPES[idx]?.icon || '', false);
            this.set_title(_actionSummary(this._action));
            this.emit('changed');
        });

        // ── Visibility (depends on windows in the focused workspace) ──
        const showWhenRow = new Adw.ComboRow({
            title: _('Show When'),
            tooltip_text: _('Show this item depending on whether the focused workspace has a window open'),
        });
        const showWhenModel = new Gtk.StringList();
        SHOW_WHEN_OPTIONS.forEach(o => showWhenModel.append(_(o.label)));
        showWhenRow.set_model(showWhenModel);
        const showWhenIdx = SHOW_WHEN_OPTIONS.findIndex(o => o.id === this._action.showWhen);
        showWhenRow.set_selected(showWhenIdx >= 0 ? showWhenIdx : 0);
        showWhenRow.connect('notify::selected', () => {
            this._action.showWhen = SHOW_WHEN_OPTIONS[showWhenRow.get_selected()]?.id || 'always';
            this.emit('changed');
        });

        this.add_row(typeRow);
        this.add_row(showWhenRow);
        this.add_row(labelRow);
        this.add_row(iconRow);

        // ── Icon Color ────────────────────────────────────────
        const colorRow = new Adw.ActionRow({ title: _('Icon Color') });
        const colorEntry = new Gtk.Entry({
            placeholder_text: _('e.g. #ff0000 or red'),
            text: this._action.iconColor || '',
            valign: Gtk.Align.CENTER,
            hexpand: true,
        });
        colorEntry.connect('changed', () => {
            this._action.iconColor = colorEntry.get_text();
            this.emit('changed');
        });
        const colorDialog = new Gtk.ColorDialog({ title: _('Pick a color'), with_alpha: false });
        const colorButton = new Gtk.ColorDialogButton({
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Pick a color'),
            dialog: colorDialog,
        });
        // Sync color button → entry
        colorButton.connect('notify::rgba', () => {
            const rgba = colorButton.get_rgba();
            const hex = _rgbaToHex(rgba);
            colorEntry.set_text(hex);
        });
        const colorBox = new Gtk.Box({ spacing: 8 });
        colorBox.append(colorEntry);
        colorBox.append(colorButton);
        colorRow.add_suffix(colorBox);
        this.add_row(colorRow);

        // ── Command (for terminal-command / system-command) ───
        const cmdRow = new Adw.EntryRow({ title: _('Command') });
        cmdRow.set_text(this._action.command || '');
        cmdRow.connect('notify::text', () => {
            this._action.command = cmdRow.get_text();
            this.emit('changed');
        });
        this.add_row(cmdRow);

        // ── Keyboard shortcut (for keyboard-shortcut) ─────────
        const shortcutRow = new Adw.EntryRow({ title: _('Keyboard Shortcut (e.g. Ctrl+Shift+T, Alt+Left, Super+D, F11)') });
        shortcutRow.set_text(this._action.shortcut || '');
        shortcutRow.connect('notify::text', () => {
            this._action.shortcut = shortcutRow.get_text();
            this.emit('changed');
        });
        this.add_row(shortcutRow);

        // ── Spacer height (for spacer) ────────────────────────
        const sizeRow = new Adw.SpinRow({
            title: _('Spacer Height (px)'),
            adjustment: new Gtk.Adjustment({
                lower: 4, upper: 400, step_increment: 4, page_increment: 20,
                value: parseInt(this._action.size, 10) || 24,
            }),
        });
        sizeRow.connect('notify::value', () => {
            this._action.size = Math.round(sizeRow.get_value());
            this.emit('changed');
        });
        this.add_row(sizeRow);

        // ── App ID (for app-shortcut) ─────────────────────────
        const appRow = new Adw.EntryRow({ title: _('App Desktop ID (e.g. org.gnome.Files.desktop)') });
        appRow.set_text(this._action.appId || '');
        appRow.connect('notify::text', () => {
            this._action.appId = appRow.get_text();
            this.emit('changed');
        });
        this.add_row(appRow);

        // ── Remove Button ────────────────────────────────────
        const actionsBar = new Adw.ActionRow({ title: '' });
        const removeBtn = new Gtk.Button({
            icon_name: 'user-trash-symbolic',
            label: _('Delete Action'),
            tooltip_text: _('Remove Action'),
            valign: Gtk.Align.CENTER,
            css_classes: ['destructive-action'],
        });
        removeBtn.connect('clicked', () => this.emit('removed'));
        actionsBar.add_suffix(removeBtn);
        this.add_row(actionsBar);
    }

    /**
     * Build a popover with a searchable grid of icons, each shown with a
     * preview and its name. Calls onSelect(iconName) when one is picked.
     */
    _buildIconPopover(onSelect) {
        const popover = new Gtk.Popover();

        const content = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 6,
            margin_end: 6,
        });

        const search = new Gtk.SearchEntry({
            placeholder_text: _('Search icons…'),
        });
        content.append(search);

        const flow = new Gtk.FlowBox({
            selection_mode: Gtk.SelectionMode.NONE,
            homogeneous: true,
            min_children_per_line: 3,
            max_children_per_line: 4,
            row_spacing: 4,
            column_spacing: 4,
        });

        ICON_CHOICES.forEach(name => {
            const box = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 4,
                margin_top: 6,
                margin_bottom: 6,
                margin_start: 4,
                margin_end: 4,
            });
            box.append(new Gtk.Image({ icon_name: name, pixel_size: 32 }));
            box.append(new Gtk.Label({
                label: name.replace(/-symbolic$/, ''),
                css_classes: ['caption'],
                ellipsize: Pango.EllipsizeMode.END,
                max_width_chars: 14,
            }));
            const btn = new Gtk.Button({
                child: box,
                css_classes: ['flat'],
                tooltip_text: name,
            });
            btn.connect('clicked', () => {
                onSelect(name);
                popover.popdown();
            });
            flow.append(btn);
        });

        flow.set_filter_func(child => {
            const q = search.get_text().trim().toLowerCase();
            return q === '' || ICON_CHOICES[child.get_index()].includes(q);
        });
        search.connect('search-changed', () => flow.invalidate_filter());
        // Enter with a query matching no listed icon uses it as a custom icon name
        search.connect('activate', () => {
            const q = search.get_text().trim();
            if (q === '' || ICON_CHOICES.some(n => n.includes(q.toLowerCase())))
                return;
            onSelect(q);
            popover.popdown();
        });

        const scrolled = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            min_content_width: 380,
            min_content_height: 320,
            max_content_height: 320,
        });
        scrolled.set_child(flow);
        content.append(scrolled);
        popover.set_child(content);

        popover.connect('closed', () => {
            search.set_text('');
        });

        return popover;
    }

    setupDragAndDrop(index, onReorder) {
        // Drag Source attached to the handle
        const dragSource = new Gtk.DragSource({
            actions: Gdk.DragAction.MOVE,
        });
        dragSource.connect('prepare', (_source, _x, _y) => {
            const val = new GObject.Value();
            val.init(GObject.TYPE_STRING);
            val.set_string(String(index));
            return Gdk.ContentProvider.new_for_value(val);
        });
        dragSource.connect('drag-begin', (_source, _drag) => {
            const paintable = Gtk.WidgetPaintable.new(this);
            dragSource.set_icon(paintable, 0, 0);
        });
        this._dragHandle.add_controller(dragSource);

        // Drop Target attached to the row
        const dropTarget = Gtk.DropTarget.new(GObject.TYPE_STRING, Gdk.DragAction.MOVE);
        dropTarget.connect('enter', () => {
            this.add_css_class('drag-hover');
            return Gdk.DragAction.MOVE;
        });
        dropTarget.connect('leave', () => {
            this.remove_css_class('drag-hover');
        });
        dropTarget.connect('drop', (_target, value, _x, _y) => {
            this.remove_css_class('drag-hover');
            const srcIdx = parseInt(value, 10);
            if (!isNaN(srcIdx) && srcIdx !== index) {
                onReorder(srcIdx, index);
                return true;
            }
            return false;
        });
        this.add_controller(dropTarget);
    }

    getAction() {
        return { ...this._action };
    }
});

function _actionSummary(action) {
    const typeMeta = ACTION_TYPES.find(t => t.id === action.type);
    const typeLabel = typeMeta ? typeMeta.label : action.type;
    return action.label ? `${action.label} (${typeLabel})` : typeLabel;
}

function _rgbaToHex(rgba) {
    const r = Math.round(rgba.red * 255).toString(16).padStart(2, '0');
    const g = Math.round(rgba.green * 255).toString(16).padStart(2, '0');
    const b = Math.round(rgba.blue * 255).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
}

// ─── Export / Import ────────────────────────────────────────────────────────────

const EXPORT_FORMAT = 'touchsidebar-settings';
const EXPORT_VERSION = 1;
const MAX_IMPORT_BYTES = 1024 * 1024;
const MAX_IMPORT_ACTIONS = 200;
const ALIGNMENT_IDS = ['top', 'middle', 'bottom'];
const SAFE_COLOR_RE = /^[#a-zA-Z0-9(),.%\s]+$/;
const SAFE_ICON_RE = /^[A-Za-z0-9._-]*$/;

// Simple settings: key -> validator returning true when the value is acceptable.
const SIMPLE_SETTINGS = {
    'sidebar-on-right':   { type: 'b', valid: v => typeof v === 'boolean' },
    'show-action-labels': { type: 'b', valid: v => typeof v === 'boolean' },
    'sidebar-width':      { type: 'i', valid: v => Number.isInteger(v) && v >= 48 && v <= 400 },
    'icon-padding-top':    { type: 'i', valid: v => Number.isInteger(v) && v >= 0 && v <= 64 },
    'icon-padding-bottom': { type: 'i', valid: v => Number.isInteger(v) && v >= 0 && v <= 64 },
    'icon-padding-left':   { type: 'i', valid: v => Number.isInteger(v) && v >= 0 && v <= 64 },
    'icon-padding-right':  { type: 'i', valid: v => Number.isInteger(v) && v >= 0 && v <= 64 },
    'button-alignment':   { type: 's', valid: v => ALIGNMENT_IDS.includes(v) },
    'sidebar-color':      { type: 's', valid: v => typeof v === 'string' && v.length > 0 && v.length <= 64 && SAFE_COLOR_RE.test(v) },
};

function _boundedString(v, max) {
    return typeof v === 'string' ? v.slice(0, max) : '';
}

/** Returns a clean copy of an imported action (only known fields), or null. */
function _sanitizeAction(a) {
    if (!a || typeof a !== 'object' || Array.isArray(a))
        return null;
    if (!ACTION_TYPES.some(t => t.id === a.type))
        return null;
    const size = Number.isFinite(Number(a.size)) ? Math.round(Number(a.size)) : 24;
    const color = _boundedString(a.iconColor, 64);
    const icon = _boundedString(a.icon, 128);
    return {
        type: a.type,
        label: _boundedString(a.label, 64),
        icon: SAFE_ICON_RE.test(icon) ? icon : '',
        iconColor: color === '' || SAFE_COLOR_RE.test(color) ? color : '',
        enabled: a.enabled !== false,
        showWhen: SHOW_WHEN_OPTIONS.some(o => o.id === a.showWhen) ? a.showWhen : 'always',
        command: _boundedString(a.command, 1024),
        appId: _boundedString(a.appId, 256),
        shortcut: _boundedString(a.shortcut, 64),
        size: Math.max(4, Math.min(400, size)),
    };
}

/** Collect every customization into a plain object ready to be serialised. */
function _collectSettings(settings) {
    const values = {};
    for (const [key, meta] of Object.entries(SIMPLE_SETTINGS)) {
        if (meta.type === 'b') values[key] = settings.get_boolean(key);
        else if (meta.type === 'i') values[key] = settings.get_int(key);
        else values[key] = settings.get_string(key);
    }
    let actions;
    try {
        actions = JSON.parse(settings.get_string('actions'));
    } catch (_e) {
        actions = [];
    }
    if (!Array.isArray(actions) || actions.length === 0)
        actions = _defaultActions();
    values.actions = actions;
    return { format: EXPORT_FORMAT, version: EXPORT_VERSION, settings: values };
}

/**
 * Parse and validate imported text. Returns the clean settings to apply;
 * throws an Error (message safe to show) when the file is not usable.
 * Keys that are missing are left unchanged.
 */
function _parseImport(text) {
    let data;
    try {
        data = JSON.parse(text);
    } catch (_e) {
        throw new Error(_('The file is not valid JSON text.'));
    }
    if (!data || data.format !== EXPORT_FORMAT || typeof data.settings !== 'object' || data.settings === null)
        throw new Error(_('This is not a TouchSideBar settings file.'));
    if (data.version !== EXPORT_VERSION)
        throw new Error(_('Unsupported settings file version.'));

    const clean = {};
    for (const [key, meta] of Object.entries(SIMPLE_SETTINGS)) {
        if (!(key in data.settings))
            continue;
        if (!meta.valid(data.settings[key]))
            throw new Error(_('Invalid value for "%s".').replace('%s', key));
        clean[key] = data.settings[key];
    }
    if ('actions' in data.settings) {
        const list = data.settings.actions;
        if (!Array.isArray(list) || list.length === 0 || list.length > MAX_IMPORT_ACTIONS)
            throw new Error(_('Invalid action list.'));
        const actions = list.map(_sanitizeAction);
        if (actions.some(a => a === null))
            throw new Error(_('The action list contains an unknown action type.'));
        clean.actions = actions;
    }
    if (Object.keys(clean).length === 0)
        throw new Error(_('The file contains no settings.'));
    return clean;
}

function _applyImport(settings, clean) {
    for (const [key, value] of Object.entries(clean)) {
        if (key === 'actions') settings.set_string('actions', JSON.stringify(value));
        else if (SIMPLE_SETTINGS[key].type === 'b') settings.set_boolean(key, value);
        else if (SIMPLE_SETTINGS[key].type === 'i') settings.set_int(key, value);
        else settings.set_string(key, value);
    }
}

function _isDialogDismissed(e) {
    return e.matches?.(Gtk.DialogError, Gtk.DialogError.DISMISSED) ||
        e.matches?.(Gtk.DialogError, Gtk.DialogError.CANCELLED) ||
        e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
}

// ─── Preferences Window ─────────────────────────────────────────────────────────

export default class TouchSideBarPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings(SCHEMA_KEY);
        window.set_default_size(680, 720);
        window.set_title(_('TouchSideBar Preferences'));

        // ═══════════════════════════════════════════════════════
        // PAGE 1 – General
        // ═══════════════════════════════════════════════════════
        const generalPage = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(generalPage);

        const layoutGroup = new Adw.PreferencesGroup({ title: _('Layout') });
        generalPage.add(layoutGroup);

        // Sidebar side
        const sideRow = new Adw.ActionRow({ title: _('Sidebar Side') });
        const sideSwitch = new Gtk.Switch({
            active: settings.get_boolean('sidebar-on-right'),
            valign: Gtk.Align.CENTER,
            tooltip_text: _('ON = Right  |  OFF = Left'),
        });
        const sideLabel = new Gtk.Label({
            label: settings.get_boolean('sidebar-on-right') ? _('Right') : _('Left'),
            valign: Gtk.Align.CENTER,
        });
        sideSwitch.connect('notify::active', () => {
            settings.set_boolean('sidebar-on-right', sideSwitch.active);
            sideLabel.set_label(sideSwitch.active ? _('Right') : _('Left'));
        });
        const sideBox = new Gtk.Box({ spacing: 8 });
        sideBox.append(sideLabel);
        sideBox.append(sideSwitch);
        sideRow.add_suffix(sideBox);
        layoutGroup.add(sideRow);

        // Sidebar width
        const widthRow = new Adw.ActionRow({ title: _('Sidebar Width'), subtitle: _('48 – 400 px') });
        const widthSpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 48, upper: 400, step_increment: 4, page_increment: 20,
                value: settings.get_int('sidebar-width'),
            }),
            valign: Gtk.Align.CENTER,
            numeric: true,
        });
        widthSpin.connect('value-changed', () => {
            settings.set_int('sidebar-width', widthSpin.get_value_as_int());
        });
        widthRow.add_suffix(widthSpin);
        layoutGroup.add(widthRow);

        // Button alignment
        const ALIGNMENTS = [
            { id: 'top', label: _('Top') },
            { id: 'middle', label: _('Middle') },
            { id: 'bottom', label: _('Bottom') },
        ];
        const alignRow = new Adw.ComboRow({
            title: _('Button Alignment'),
            subtitle: _('Where the buttons sit inside the sidebar'),
        });
        const alignModel = new Gtk.StringList();
        ALIGNMENTS.forEach(a => alignModel.append(a.label));
        alignRow.set_model(alignModel);
        const currentAlign = ALIGNMENTS.findIndex(a => a.id === settings.get_string('button-alignment'));
        alignRow.set_selected(currentAlign >= 0 ? currentAlign : 0);
        alignRow.connect('notify::selected', () => {
            const a = ALIGNMENTS[alignRow.get_selected()];
            if (a) settings.set_string('button-alignment', a.id);
        });
        layoutGroup.add(alignRow);

        // Show button labels
        const showLabelsRow = new Adw.ActionRow({
            title: _('Show Button Labels'),
            subtitle: _('Display text labels below action icons'),
        });
        const showLabelsSwitch = new Gtk.Switch({
            active: settings.get_boolean('show-action-labels'),
            valign: Gtk.Align.CENTER,
        });
        showLabelsSwitch.connect('notify::active', () => {
            settings.set_boolean('show-action-labels', showLabelsSwitch.active);
        });
        showLabelsRow.add_suffix(showLabelsSwitch);
        showLabelsRow.set_activatable_widget(showLabelsSwitch);
        layoutGroup.add(showLabelsRow);

        // Sidebar color
        const sbColorRow = new Adw.ActionRow({
            title: _('Sidebar Color'),
            subtitle: _('Background color of the sidebar'),
        });
        const sbColorDialog = new Gtk.ColorDialog({ title: _('Sidebar color'), with_alpha: true });
        const sbColorButton = new Gtk.ColorDialogButton({
            valign: Gtk.Align.CENTER,
            dialog: sbColorDialog,
        });
        const initialRgba = new Gdk.RGBA();
        if (!initialRgba.parse(settings.get_string('sidebar-color')))
            initialRgba.parse('rgba(30, 30, 30, 0.92)');
        sbColorButton.set_rgba(initialRgba);
        sbColorButton.connect('notify::rgba', () => {
            settings.set_string('sidebar-color', sbColorButton.get_rgba().to_string());
        });
        sbColorRow.add_suffix(sbColorButton);
        layoutGroup.add(sbColorRow);

        // Icon spacing (applies to every action button)
        const spacingGroup = new Adw.PreferencesGroup({
            title: _('Icon Spacing'),
            description: _('Space around the icon inside every action button, in pixels.'),
        });
        generalPage.add(spacingGroup);

        const SPACING_KEYS = [
            { key: 'icon-padding-top', title: _('Top') },
            { key: 'icon-padding-bottom', title: _('Bottom') },
            { key: 'icon-padding-left', title: _('Left') },
            { key: 'icon-padding-right', title: _('Right') },
        ];
        for (const { key, title } of SPACING_KEYS) {
            const spinRow = new Adw.SpinRow({
                title,
                adjustment: new Gtk.Adjustment({
                    lower: 0, upper: 64, step_increment: 1, page_increment: 4,
                    value: settings.get_int(key),
                }),
            });
            spinRow.connect('notify::value', () => {
                settings.set_int(key, Math.round(spinRow.get_value()));
            });
            spacingGroup.add(spinRow);
        }

        // ═══════════════════════════════════════════════════════
        // PAGE 2 – Actions
        // ═══════════════════════════════════════════════════════
        const actionsPage = new Adw.PreferencesPage({
            title: _('Actions'),
            icon_name: 'view-list-symbolic',
        });
        window.add(actionsPage);

        const actionsGroup = new Adw.PreferencesGroup({
            title: _('Sidebar Buttons'),
            description: _('Add, remove, and drag to reorder the buttons shown in the sidebar. Changes are applied immediately.'),
        });
        actionsPage.add(actionsGroup);

        // ── Load actions from settings ────────────────────────
        let actions = [];
        try {
            actions = JSON.parse(settings.get_string('actions'));
            if (!Array.isArray(actions) || actions.length === 0) actions = _defaultActions();
        } catch (_e) {
            actions = _defaultActions();
        }

        this._actionRows = [];

        const saveActions = () => {
            const list = this._actionRows.map(r => r.getAction());
            settings.set_string('actions', JSON.stringify(list));
        };

        const buildRows = () => {
            // Remove all existing children
            for (const row of this._actionRows) {
                actionsGroup.remove(row);
            }
            this._actionRows = [];

            for (let i = 0; i < actions.length; i++) {
                // Capture i in a block-scoped const so closures below are correct
                const idx = i;
                const row = new ActionRow(actions[idx]);
                row.setupDragAndDrop(idx, (fromIdx, toIdx) => {
                    const [movedItem] = actions.splice(fromIdx, 1);
                    actions.splice(toIdx, 0, movedItem);
                    buildRows();
                    saveActions();
                });
                this._actionRows.push(row);
                actionsGroup.add(row);

                row.connect('changed', () => {
                    actions[idx] = row.getAction();
                    saveActions();
                });

                row.connect('removed', () => {
                    actions.splice(idx, 1);
                    buildRows();
                    saveActions();
                });
            }
        };

        buildRows();

        // ── Add action button ─────────────────────────────────
        const addActionRow = new Adw.ActionRow({ title: _('Add New Action Button') });
        const typeModel = new Gtk.StringList();
        ACTION_TYPES.forEach(t => typeModel.append(t.label));

        const typeCombo = new Gtk.DropDown({
            model: typeModel,
            selected: 0,
            valign: Gtk.Align.CENTER,
        });

        const addBtn = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            label: _('Add'),
            css_classes: ['suggested-action'],
            valign: Gtk.Align.CENTER,
        });
        addBtn.connect('clicked', () => {
            const idx = typeCombo.get_selected();
            const meta = ACTION_TYPES[idx];
            const layoutOnly = meta.id === 'spacer' || meta.id === 'separator';
            actions.push({
                type: meta.id,
                label: layoutOnly ? '' : meta.label,
                icon: meta.icon,
                iconColor: '',
                enabled: true,
                command: '',
                appId: '',
                shortcut: '',
                size: 24,
            });
            buildRows();
            saveActions();
        });

        const addBox = new Gtk.Box({ spacing: 8 });
        addBox.append(typeCombo);
        addBox.append(addBtn);
        addActionRow.add_suffix(addBox);

        const addGroup = new Adw.PreferencesGroup();
        actionsPage.add(addGroup);
        addGroup.add(addActionRow);

        // Reset to defaults button
        const resetRow = new Adw.ActionRow({ title: _('Reset Actions to Defaults') });
        const resetBtn = new Gtk.Button({
            label: _('Reset'),
            css_classes: ['destructive-action'],
            valign: Gtk.Align.CENTER,
        });
        resetBtn.connect('clicked', () => {
            actions = _defaultActions();
            buildRows();
            saveActions();
        });
        resetRow.add_suffix(resetBtn);
        addGroup.add(resetRow);

        // ═══════════════════════════════════════════════════════
        // Backup – export / import every customization
        // ═══════════════════════════════════════════════════════
        const backupGroup = new Adw.PreferencesGroup({
            title: _('Backup'),
            description: _('Export all customizations (layout, appearance and actions) to a text file, or import them from one.'),
        });
        generalPage.add(backupGroup);

        const toast = message => window.add_toast(new Adw.Toast({ title: message }));

        const exportRow = new Adw.ActionRow({ title: _('Export Settings') });
        const exportBtn = new Gtk.Button({ label: _('Export…'), valign: Gtk.Align.CENTER });
        exportBtn.connect('clicked', () => {
            const dialog = new Gtk.FileDialog({
                title: _('Export settings'),
                initial_name: 'touchsidebar-settings.json',
            });
            dialog.save(window, null, (_d, res) => {
                let file;
                try {
                    file = dialog.save_finish(res);
                } catch (e) {
                    if (!_isDialogDismissed(e)) {
                        console.error('TouchSideBar: export dialog failed', e);
                        toast(_('Could not export settings.'));
                    }
                    return;
                }
                try {
                    const text = JSON.stringify(_collectSettings(settings), null, 2) + '\n';
                    file.replace_contents(new TextEncoder().encode(text), null, false,
                        Gio.FileCreateFlags.REPLACE_DESTINATION, null);
                    toast(_('Settings exported.'));
                } catch (e) {
                    console.error('TouchSideBar: export failed', e);
                    toast(_('Could not export settings.'));
                }
            });
        });
        exportRow.add_suffix(exportBtn);
        backupGroup.add(exportRow);

        const reloadWindow = () => {
            window.remove(generalPage);
            window.remove(actionsPage);
            this.fillPreferencesWindow(window);
        };

        const importFile = file => {
            let clean;
            try {
                const info = file.query_info('standard::size', Gio.FileQueryInfoFlags.NONE, null);
                if (info.get_size() > MAX_IMPORT_BYTES)
                    throw new Error(_('The file is too large.'));
                const [, bytes] = file.load_contents(null);
                clean = _parseImport(new TextDecoder('utf-8').decode(bytes));
            } catch (e) {
                console.error('TouchSideBar: import rejected', e);
                toast(e.message || _('Could not read the file.'));
                return;
            }

            const apply = () => {
                _applyImport(settings, clean);
                reloadWindow();
                window.add_toast(new Adw.Toast({ title: _('Settings imported.') }));
            };

            // Imported actions may run shell commands: ask before applying them.
            const commandCount = (clean.actions ?? []).filter(a =>
                (a.type === 'terminal-command' || a.type === 'system-command') && a.command !== '').length;
            if (commandCount === 0) {
                apply();
                return;
            }
            const confirm = new Adw.MessageDialog({
                transient_for: window,
                modal: true,
                heading: _('Import settings?'),
                body: _('This file contains %d action(s) that run shell commands as your user. Only import files you trust.')
                    .replace('%d', String(commandCount)),
            });
            confirm.add_response('cancel', _('Cancel'));
            confirm.add_response('import', _('Import'));
            confirm.set_response_appearance('import', Adw.ResponseAppearance.DESTRUCTIVE);
            confirm.set_default_response('cancel');
            confirm.set_close_response('cancel');
            confirm.connect('response', (_dlg, id) => {
                if (id === 'import')
                    apply();
            });
            confirm.present();
        };

        const importRow = new Adw.ActionRow({
            title: _('Import Settings'),
            subtitle: _('Replaces the current customizations contained in the file'),
        });
        const importBtn = new Gtk.Button({ label: _('Import…'), valign: Gtk.Align.CENTER });
        importBtn.connect('clicked', () => {
            const dialog = new Gtk.FileDialog({ title: _('Import settings') });
            dialog.open(window, null, (_d, res) => {
                let file;
                try {
                    file = dialog.open_finish(res);
                } catch (e) {
                    if (!_isDialogDismissed(e)) {
                        console.error('TouchSideBar: import dialog failed', e);
                        toast(_('Could not open the file.'));
                    }
                    return;
                }
                importFile(file);
            });
        });
        importRow.add_suffix(importBtn);
        backupGroup.add(importRow);
    }
}
