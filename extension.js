import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import UPower from 'gi://UPowerGlib'

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Clutter from 'gi://Clutter';

function getBatteryIconName(percent, isCharging) {
    if (isCharging) {
        if (percent < 10) return 'battery-level-10-charging-symbolic';
        if (percent < 30) return 'battery-caution-charging-symbolic';
        if (percent < 60) return 'battery-good-charging-symbolic';
        if (percent < 90) return 'battery-level-90-charging-symbolic';
        return 'battery-full-charging-symbolic';
    } else {
        if (percent < 10) return 'battery-level-10-symbolic';
        if (percent < 30) return 'battery-caution-symbolic';
        if (percent < 60) return 'battery-good-symbolic';
        if (percent < 90) return 'battery-level-90-symbolic';
        return 'battery-full-symbolic';
    }
}

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, _('Battery Indicator'));

        this._settings = this._settings || null;

        this._upower = UPower.Client.new();

        this._indicator = new St.BoxLayout({ style_class: 'panel-button' });

        this._label = new St.Label({
            text: '--/-- %',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'panel-label',
        });

        // Ajoute la box à l'actor principal
        this.add_child(this._indicator);

        // Ajoute l'icône et le label à la box (ordre: icône puis label)
        this._icon = new St.Icon({
            icon_name: 'battery-missing-symbolic',
            style_class: 'system-status-icon',
        });
        this._indicator.add_child(this._icon);
        this._indicator.add_child(this._label);

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

        // Get battery names (device.get_object_path() or device.get_property('model'))
        const batteryNames = batteries.map(b => {
            // Extrait 'BAT0' ou 'BAT1' depuis le native_path
            if (b.native_path) {
                const parts = b.native_path.split('/');
                return parts[parts.length - 1];
            }
            // Fallback si pas de native_path
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

            if (showIcon) {
                const iconName = getBatteryIconName(percent, b.state === UPower.DeviceState.CHARGING);

                const icon = new St.Icon({
                    icon_name: iconName,
                    style_class: 'system-status-icon',
                });
                
                this._indicator.add_child(icon);
                this._batteryIcons.push(icon);
            }
            // Ajoute le pourcentage juste après l'icône
            const percentLabel = new St.Label({
                text: showName ? `${batteryNames[i]}: ${percent}%` : `${percent}%`,
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'panel-label',
            });
            this._indicator.add_child(percentLabel);
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
        this._indicator = new Indicator();

        // Add the indicator to the panel
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        // Add a menu item to open the preferences window
        this._indicator.menu.addAction(_('Preferences'),
            () => this.openPreferences());

        // setting to the "visible" property.
        this._settings = this.getSettings();
        
        
        // Watch for changes to a specific setting
        this._settings.connect('changed', () => {
            this._indicator._update();
        });

        this._indicator._settings = this._settings;

       
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
        this._settings = null;  
    }
}
