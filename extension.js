import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import UPower from 'gi://UPowerGlib'

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Clutter from 'gi://Clutter';

const UPOWER_BUS_NAME = 'org.freedesktop.UPower';
const UPOWER_DEVICE_IFACE = 'org.freedesktop.UPower.Device';

const getBatteryPercentage = async (device) => {
    try {
        const proxy = new Gio.DBusProxy({
            g_connection: Gio.DBus.system,
            g_name: UPOWER_BUS_NAME,
            g_object_path: `/org/freedesktop/UPower/devices/${device}`,
            g_interface_name: UPOWER_DEVICE_IFACE,
        });

        await new Promise((resolve, reject) => {
            proxy.init_async(GLib.PRIORITY_DEFAULT, null, (source, res) => {
                try {
                    proxy.init_finish(res);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        });

        const percentage = proxy.get_cached_property('Percentage').unpack();
        return Math.round(percentage);
    } catch (e) {
        log(`Failed to get percentage for ${device}: ${e}`);
        return null;
    }
};

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, _('Battery Indicator'));

        this._indicator = new St.BoxLayout({ style_class: 'panel-button' });


        this._label = new St.Label({
            text: '--/-- %',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'battery-label',
        });

        this.add_child(this._label);
        
        this._update();
        this._timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () => {
            this._update();
            return GLib.SOURCE_CONTINUE;
        });
    }

    async _update() {
        const bat0 = await getBatteryPercentage('battery_BAT0');
        const bat1 = await getBatteryPercentage('battery_BAT1');

        if (bat0 !== null && bat1 !== null) {
            this._label.text = `${bat0} %/${bat1} %`;
        } else {
            this._label.text = 'N/A';
        }
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
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;  
    }
}
