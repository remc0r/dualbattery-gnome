import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import UPower from 'gi://UPowerGlib'
import Gio from 'gi://Gio';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Clutter from 'gi://Clutter';

//Get the right icon name based on battery percentage and charging state
function getBatteryIconName(percent, isCharging) {
    
    if (percent >= 90)
        return (isCharging
            ? 'battery-full-charging-symbolic'
            : 'battery-full-symbolic');

    const lvl = Math.floor(percent / 10) * 10;
    return (isCharging
        ? `battery-level-${lvl}-charging-symbolic`
        : `battery-level-${lvl}-symbolic`);

}

// Create a battery icon and label based on percentage, name, charging state, and whether to show the name
function makeBatteryIconAndLabel(percent, name, isCharging, showName) {
    
    const iconName = getBatteryIconName(percent, isCharging);
    const icon = new St.Icon({
        icon_name: iconName,
        style_class: 'system-status-icon',
    });
    const label = new St.Label({
        text: showName ? `${name}: ${percent}%` : `${percent}%`,
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'panel-label',
    });
    return { icon, label };
}

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(settings, extension) {
        super._init(0.5, _('Battery Indicator'));
        
        this._settings = settings;
        this._extension = extension; 
        this._upower = UPower.Client.new();

        this._indicator = new St.BoxLayout({ style_class: 'panel-button' });

        
        //Default values
        this._label = new St.Label({
            text: '--/-- %',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'panel-label',
        });

        // Add box to the panel
        this.add_child(this._indicator);

        // Add default icon and label in case on no batteries
        this._icon = new St.Icon({
            icon_name: 'battery-missing-symbolic',
            style_class: 'system-status-icon',
        });
        this._indicator.add_child(this._icon);
        this._indicator.add_child(this._label);

        // Add Settings line
        this._preferencesRow = new PopupMenu.PopupMenuItem(_('Settings'));
        this._preferencesRow.connect('activate', () => {
            this._extension.openPreferences();
        });
        this.menu.addMenuItem(this._preferencesRow);

        this._update();
        this._timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () => {
            this._update();
            return GLib.SOURCE_CONTINUE;
        });
        
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

        // Get battery names
        const batteryNames = batteries.map(b => {
            // Extract 'BAT0' ou 'BAT1' from native_path
            if (b.native_path) {
                const parts = b.native_path.split('/');
                return parts[parts.length - 1];
            }
            // Fallback if no native_path
            return b.model || b.get_object_path();
        });

        if (batteries.length === 0) {
            this._label.text = 'No battery';
            this._icon.icon_name = 'battery-missing-symbolic';
            return;
        }

        // Calculate percentage for each battery
        const percentages = batteries.map(b => Math.round(b.percentage));
        
        //clean indicator
        this._indicator.remove_all_children();
        
        this._batteryIcons = [];

        // browse through batteries and create icons/labels
        batteries.forEach((b, i) => {
            const percent = percentages[i];

            // Horizontal container for label and icon
            const labelIconBox = new St.BoxLayout({
                vertical: false,
                style_class: 'battery-label-icon-box',
                y_expand: false,
                height: 25, // optionnel, pour forcer la hauteur
            });
            const { icon: barIcon, label: barLabel } = makeBatteryIconAndLabel(percent, batteryNames[i], b.state === UPower.DeviceState.CHARGING, true);
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

            // Panel icon and label
            const { icon: panelIcon, label: panelLabel } = makeBatteryIconAndLabel(percent, batteryNames[i], b.state === UPower.DeviceState.CHARGING, showName);
            if (showIcon) this._indicator.add_child(panelIcon);
            this._indicator.add_child(panelLabel);

            // Separator between batteries
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


export default class DualBatteryExtension extends Extension {
    enable() {
        this._stylesheet = Gio.File.new_for_path(`${this.path}/stylesheet.css`);
        this._settings = this.getSettings();
        this._indicator = new Indicator(this._settings, this);

        // Add the indicator to the panel
        Main.panel.addToStatusArea(this.uuid, this._indicator);
         
        // Watch for changes to a specific setting
        this._settings.connect('changed', () => {
            this._indicator._update();
        });
       
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
        this._settings = null;  
    }
}
