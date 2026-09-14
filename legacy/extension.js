const GObject = imports.gi.GObject;
const St = imports.gi.St;
const GLib = imports.gi.GLib;
const UPower = imports.gi.UPowerGlib;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Clutter = imports.gi.Clutter;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Gettext = imports.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const _ = Gettext.domain(Me.metadata['gettext-domain'] || Me.metadata.uuid).gettext;

// The native_path of the reactor that should be treated as the Primary Core.
// Everything else reporting is the Auxiliary Reactor.
const PRIMARY_REACTOR_NATIVE_PATH = 'BAT1';

// Reactor drops below this percentage while discharging -> critical alert.
const CRITICAL_THRESHOLD = 15;

function getNativePath(battery) {
    if (battery.native_path) {
        const parts = battery.native_path.split('/');
        return parts[parts.length - 1];
    }
    return battery.model || battery.get_object_path();
}

function getReactorRole(nativePath) {
    return nativePath === PRIMARY_REACTOR_NATIVE_PATH
        ? { full: 'PRIMARY CORE REACTOR', short: 'CORE' }
        : { full: 'AUXILIARY REACTOR', short: 'AUX' };
}

// Bucket a percentage + charging state into one of our reactor icon names.
function getReactorIconName(percent, isCharging) {
    let level;
    if (percent >= 90)
        level = 'full';
    else if (percent >= 70)
        level = 'high';
    else if (percent >= 40)
        level = 'medium';
    else if (percent >= 20)
        level = 'low';
    else
        level = 'critical';

    return isCharging ? `reactor-${level}-charging-symbolic` : `reactor-${level}-symbolic`;
}

// Create a reactor icon and label based on percentage, role, charging state, and whether to show the role name
function makeReactorIconAndLabel(percent, roleLabel, isCharging, showName) {

    const iconName = getReactorIconName(percent, isCharging);
    const icon = new St.Icon({
        icon_name: iconName,
        style_class: 'system-status-icon',
    });
    const label = new St.Label({
        text: showName ? `${roleLabel}: ${percent}%` : `${percent}%`,
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'panel-label',
    });
    return { icon, label };
}

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(settings) {
        super._init(0.5, _('USS-ROMULUS Reactor Monitor'));

        this._settings = settings;
        this._upower = UPower.Client.new();

        // Tracks the native_path of whichever reactor is currently DISCHARGING,
        // so we can detect a genuine power-source handoff between updates.
        this._lastDischargingPath = null;
        this._hasRunOnce = false;
        // native_paths we've already fired a critical alert for, cleared once
        // that reactor climbs back above the threshold.
        this._criticalNotified = new Set();

        this._indicator = new St.BoxLayout({ style_class: 'panel-button' });


        //Default values
        this._label = new St.Label({
            text: '--/-- %',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'panel-label',
        });

        // Add box to the panel
        this.add_child(this._indicator);

        // Add default icon and label in case on no reactors detected
        this._icon = new St.Icon({
            icon_name: 'reactor-offline-symbolic',
            style_class: 'system-status-icon',
        });
        this._indicator.add_child(this._icon);
        this._indicator.add_child(this._label);

        // Add Settings line
        this._preferencesRow = new PopupMenu.PopupMenuItem(_('Settings'));
        this._preferencesRow.connect('activate', () => {
            ExtensionUtils.openPrefs();
        });
        this.menu.addMenuItem(this._preferencesRow);

        this._update();
        this._timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () => {
            this._update();
            return GLib.SOURCE_CONTINUE;
        });

    }

    // Fires the ship's-computer style notification when the actively-discharging
    // reactor changes from one unit to another.
    _notifyReactorSwitch(fromPath, toPath) {
        const fromRole = getReactorRole(fromPath);
        const toRole = getReactorRole(toPath);

        if (toPath === PRIMARY_REACTOR_NATIVE_PATH) {
            Main.notify(
                _('\u2713 CORE ONLINE'),
                _('%s restored. %s returning to standby.').format(toRole.full, fromRole.full)
            );
        } else {
            Main.notify(
                _('\u26a0 POWER TRANSFER'),
                _('%s depleted or removed. %s now supplying ship power.').format(fromRole.full, toRole.full)
            );
        }
    }

    _notifyReactorCritical(nativePath, percent) {
        const role = getReactorRole(nativePath);
        Main.notify(
            _('\u26a0 REACTOR CRITICAL'),
            _('%s integrity at %d%%. Refuel immediately.').format(role.full, percent)
        );
    }

    async _update() {
        const devices = this._upower.get_devices();
        const batteries = devices.filter(d => d.kind === UPower.DeviceKind.BATTERY);
        const showName = this._settings ? this._settings.get_boolean('show-name') : true;
        const showIcon = this._settings ? this._settings.get_boolean('show-icon') : true;

        if (this._batteryMenuItems) {
            this._batteryMenuItems.forEach(item => item.destroy());
        }
        this._batteryMenuItems = [];

        const nativePaths = batteries.map(getNativePath);

        if (batteries.length === 0) {
            this._label.text = _('NO REACTOR DETECTED');
            this._icon.icon_name = 'reactor-offline-symbolic';
            return;
        }

        // Calculate percentage for each reactor
        const percentages = batteries.map(b => Math.round(b.percentage));

        // --- Power-source handoff + critical-integrity detection ---
        const dischargingIndex = batteries.findIndex(b => b.state === UPower.DeviceState.DISCHARGING);
        const dischargingPath = dischargingIndex >= 0 ? nativePaths[dischargingIndex] : null;

        if (this._hasRunOnce && dischargingPath &&
            this._lastDischargingPath && dischargingPath !== this._lastDischargingPath) {
            this._notifyReactorSwitch(this._lastDischargingPath, dischargingPath);
        }
        if (dischargingPath)
            this._lastDischargingPath = dischargingPath;

        batteries.forEach((b, i) => {
            const path = nativePaths[i];
            const percent = percentages[i];
            const isCritical = b.state === UPower.DeviceState.DISCHARGING && percent <= CRITICAL_THRESHOLD;

            if (isCritical && !this._criticalNotified.has(path)) {
                this._criticalNotified.add(path);
                this._notifyReactorCritical(path, percent);
            } else if (!isCritical && this._criticalNotified.has(path)) {
                this._criticalNotified.delete(path);
            }
        });

        this._hasRunOnce = true;
        // --- end detection ---

        //clean indicator
        this._indicator.remove_all_children();

        this._batteryIcons = [];

        // browse through reactors and create icons/labels
        batteries.forEach((b, i) => {
            const percent = percentages[i];
            const role = getReactorRole(nativePaths[i]);

            // Horizontal container for label and icon
            const labelIconBox = new St.BoxLayout({
                vertical: false,
                style_class: 'battery-label-icon-box',
                y_expand: false,
                height: 25, // optionnel, pour forcer la hauteur
            });
            const { icon: barIcon, label: barLabel } = makeReactorIconAndLabel(percent, role.full, b.state === UPower.DeviceState.CHARGING, true);
            labelIconBox.add_child(barIcon);
            labelIconBox.add_child(barLabel);

            // Percentage bars in popup menu
            const menuWidth = 315;
            const barContainer = new St.Widget({
                style_class: 'battery-bar-container',
                width: menuWidth,
                height: 10,
                x_expand: false,
                y_expand: false,
                reactive: false,
                y_align: Clutter.ActorAlign.CENTER, // <-- centrer verticalement
            });
            const barWidth = Math.round((percent / 100) * menuWidth);
            const barFill = new St.Widget({
                style_class: 'battery-bar-fill',
                width: barWidth,
                height: 10,
                x_expand: false,
                y_expand: false,
                reactive: false,
            });
            // Bar color based on percentage
            barFill.style_class = 'battery-bar-fill';
            if (percent < 20)
                barFill.add_style_class_name('battery-bar-low');
            else if (percent < 50)
                barFill.add_style_class_name('battery-bar-medium');
            else
                barFill.add_style_class_name('battery-bar-high');
            barContainer.add_child(barFill);

            // Add label icon and bar on the same line
            const lineBox = new St.BoxLayout({ vertical: false, y_expand: false });
            lineBox.add_child(labelIconBox);
            lineBox.add_child(barContainer);

            // Add line to the popup menu
            const row = new PopupMenu.PopupBaseMenuItem({ activate: false });
            row.actor.add_child(lineBox);

            // Add row before the preferences row
            const items = this.menu._getMenuItems();
            const prefIndex = items.indexOf(this._preferencesRow);
            this.menu.addMenuItem(row, prefIndex);
            this._batteryMenuItems.push(row);

            // Panel icon and label (short role tag so the top bar stays compact)
            const { icon: panelIcon, label: panelLabel } = makeReactorIconAndLabel(percent, role.short, b.state === UPower.DeviceState.CHARGING, showName);
            if (showIcon) this._indicator.add_child(panelIcon);
            this._indicator.add_child(panelLabel);

            // Separator between reactors
            if (i < batteries.length - 1) {
                const sep = new St.Label({
                    text: '  ',
                    y_align: Clutter.ActorAlign.CENTER,
                    style_class: 'panel-label',
                });
                this._indicator.add_child(sep);
            }

        });

    }

    destroy() {
        if (this._timeout) {
            GLib.source_remove(this._timeout);
            this._timeout = null;
        }
        super.destroy();
    }
});

let indicator = null;
let settings = null;
let settingsChangedId = null;

function init() {
    ExtensionUtils.initTranslations();
}

function enable() {
    // Register our custom reactor icon set with the icon theme so
    // icon_name: 'reactor-*-symbolic' resolves and gets themed like any
    // other panel symbolic icon.
    const iconTheme = Gtk.IconTheme.get_default();
    iconTheme.append_search_path(`${Me.path}/icons`);

    settings = ExtensionUtils.getSettings();
    indicator = new Indicator(settings);

    // Add the indicator to the panel
    Main.panel.addToStatusArea(Me.uuid, indicator);

    // Watch for changes to a specific setting
    settingsChangedId = settings.connect('changed', () => {
        indicator._update();
    });
}

function disable() {
    if (settings && settingsChangedId) {
        settings.disconnect(settingsChangedId);
        settingsChangedId = null;
    }
    if (indicator) {
        indicator.destroy();
        indicator = null;
    }
    settings = null;
}
