import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';


export default class ExamplePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        // Create a preferences page, with a single group
        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'dialog-information-symbolic',
        });
        window.add(page);

        const group = new Adw.PreferencesGroup({
            title: _('Appearance'),
            description: _('Configure the appearance of the extension'),
        });
        page.add(group);

        // Create a new preferences row
        const row = new Adw.SwitchRow({
            title: _('Show Battery Names'),
            subtitle: _('Whether to show the batteries names'),
        });
        group.add(row);

        // Create a new preferences row
        const row2 = new Adw.SwitchRow({
            title: _('Show Battery Icons'),
            subtitle: _('Whether to show the batteries icons'),
        });
        group.add(row2);

        // Create a new preferences row
        const positionOptions = ['Far Left', 'Left', 'Center', 'Right', 'Far Right'];
        const row3 = new Adw.ComboRow({
            title: _('Position in panel'),
            subtitle: _('Where to place this extension in the GNOME top panel'),
            model: Gtk.StringList.new(positionOptions),
        });
        group.add(row3);

        const settings = this.getSettings('org.gnome.shell.extensions.dualbattery');
        settings.bind('show-name', row, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        settings.bind('show-icon', row2, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        const updatePositionRow = () => {
            const position = settings.get_string('position-in-panel');
            const selected = positionOptions.indexOf(position);
            row3.selected = selected >= 0 ? selected : positionOptions.indexOf('Right');
        };

        settings.connect('changed::position-in-panel', updatePositionRow);
        row3.connect('notify::selected', () => {
            settings.set_string('position-in-panel', positionOptions[row3.selected]);
        });
        updatePositionRow();
    }
}