const { Gtk, Gio } = imports.gi;
const Gettext = imports.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const _ = Gettext.domain(Me.metadata['gettext-domain'] || Me.metadata.uuid).gettext;

function init() {
    ExtensionUtils.initTranslations();
}

function buildPrefsWidget() {
    const settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.dualbattery');

    const widget = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
        margin_top: 20,
        margin_bottom: 20,
        margin_start: 20,
        margin_end: 20,
    });

    // "Show Battery Names" row
    const row1 = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 12,
    });
    const label1 = new Gtk.Label({
        label: _('Show Battery Names'),
        hexpand: true,
        xalign: 0,
    });
    const switch1 = new Gtk.Switch({ valign: Gtk.Align.CENTER });
    row1.append(label1);
    row1.append(switch1);
    widget.append(row1);

    // "Show Battery Icons" row
    const row2 = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 12,
    });
    const label2 = new Gtk.Label({
        label: _('Show Battery Icons'),
        hexpand: true,
        xalign: 0,
    });
    const switch2 = new Gtk.Switch({ valign: Gtk.Align.CENTER });
    row2.append(label2);
    row2.append(switch2);
    widget.append(row2);

    settings.bind('show-name', switch1, 'active', Gio.SettingsBindFlags.DEFAULT);
    settings.bind('show-icon', switch2, 'active', Gio.SettingsBindFlags.DEFAULT);

    return widget;
}
