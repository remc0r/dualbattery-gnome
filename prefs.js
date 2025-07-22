import Gio from 'gi://Gio';
import Adw from 'gi://Adw';

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

        // Create a settings object and bind the row to the `show-name` key
        window._settings = this.getSettings('org.gnome.shell.extensions.dualbattery');
        window._settings.bind('show-name', row, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        window._settings.bind('show-icon', row2, 'active',
            Gio.SettingsBindFlags.DEFAULT);
    }
}