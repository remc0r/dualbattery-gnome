import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import UPower from 'gi://UPowerGlib'

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Clutter from 'gi://Clutter';



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

        // Affiche les noms et pourcentages des batteries
        const percentages = batteries.map(b => Math.round(b.percentage));
        const labelParts = showName
            ? batteries.map((b, i) => `${batteryNames[i]}: ${percentages[i]}%`)
            : percentages.map(p => `${p}%`);
        this._label.text = labelParts.join(' / ');

        // Ajoute une icône par niveau de batterie
        // D'abord, retire les anciennes icônes (sauf le label)
        this._indicator.remove_all_children();
        this._batteryIcons = [];

        // Ajoute une icône pour chaque batterie
        batteries.forEach((b, i) => {
            let iconName = 'battery-full-symbolic';
            const percent = percentages[i];
            if (percent < 10) iconName = 'battery-level-10-symbolic';
            else if (percent < 30) iconName = 'battery-caution-symbolic';
            else if (percent < 60) iconName = 'battery-good-symbolic';
            else if (percent < 90) iconName = 'battery-level-90-symbolic';

            const icon = new St.Icon({
                icon_name: iconName,
                style_class: 'system-status-icon',
            });
            this._indicator.add_child(icon);
            this._batteryIcons.push(icon);
        });

        // Ajoute le label à la fin
        this._indicator.add_child(this._label);
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
