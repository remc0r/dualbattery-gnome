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

        this._upower = UPower.Client.new();

        this._indicator = new St.BoxLayout({ style_class: 'panel-button' });


        this._label = new St.Label({
            text: '--/-- %',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'panel-label',
        });

        this.add_child(this._label);
        
        this._update();
        this._timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () => {
            this._update();
            return GLib.SOURCE_CONTINUE;
        });
    }

    async _update() {

        const devices = this._upower.get_devices();
        const batteries = devices.filter(d => d.kind === UPower.DeviceKind.BATTERY);

        if (batteries.length === 0) {
            this._label.text = 'No battery';
            return;
        }

        const percentages = batteries.map(b => Math.round(b.percentage));
        this._label.text = percentages.join(' % / ') + ' %';

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
