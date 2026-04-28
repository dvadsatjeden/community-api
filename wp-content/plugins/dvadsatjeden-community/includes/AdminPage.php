<?php

namespace DvadsatjedenCommunity;

if (!defined('ABSPATH')) {
    exit;
}

final class AdminPage
{
    public static function register(): void
    {
        add_action('admin_menu', [self::class, 'registerPage']);
    }

    public static function registerPage(): void
    {
        add_menu_page(
            'Dvadsatjeden App',
            'Dvadsatjeden App',
            'manage_options',
            'dvadsatjeden-community',
            [self::class, 'render'],
            'dashicons-location-alt'
        );
    }

    public static function render(): void
    {
        if (!current_user_can('manage_options')) {
            return;
        }
        $settings = Settings::get();
        ?>
        <div class="wrap">
            <h1>Dvadsatjeden Community</h1>
            <p>Konfiguracia API pre komunitnu appku (events, mapa, RSVP, seed-flow klient).</p>
            <form method="post" action="options.php">
                <?php settings_fields('dvadsatjeden_community'); ?>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="api_base_url">API Base URL</label></th>
                        <td><input name="dvadsatjeden_community_settings[api_base_url]" id="api_base_url" type="url" class="regular-text" value="<?php echo esc_attr($settings['api_base_url']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="import_secret">Import Secret</label></th>
                        <td>
                            <input name="dvadsatjeden_community_settings[import_secret]" id="import_secret" type="password" class="regular-text" value="<?php echo esc_attr($settings['import_secret']); ?>" autocomplete="new-password">
                            <p class="description">Bearer token pre <code>POST /v1/import/run</code>. Musí sa zhodovať s <code>IMPORT_SECRET</code> v <code>.env</code> na API serveri. Nechaj prázdne ak API secret nepoužíva.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="events_source_url">Events Source URL</label></th>
                        <td><input name="dvadsatjeden_community_settings[events_source_url]" id="events_source_url" type="url" class="regular-text" value="<?php echo esc_attr($settings['events_source_url']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="venues_source_url">Venues Source URL</label></th>
                        <td><input name="dvadsatjeden_community_settings[venues_source_url]" id="venues_source_url" type="url" class="regular-text" value="<?php echo esc_attr($settings['venues_source_url']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="sync_interval_minutes">Sync interval (minutes)</label></th>
                        <td><input name="dvadsatjeden_community_settings[sync_interval_minutes]" id="sync_interval_minutes" type="number" min="5" class="small-text" value="<?php echo esc_attr((string) $settings['sync_interval_minutes']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row">Features</th>
                        <td>
                            <input type="hidden" name="dvadsatjeden_community_settings[enable_events]" value="0" />
                            <input type="hidden" name="dvadsatjeden_community_settings[enable_map]" value="0" />
                            <input type="hidden" name="dvadsatjeden_community_settings[enable_push]" value="0" />
                            <label><input name="dvadsatjeden_community_settings[enable_events]" type="checkbox" value="1" <?php checked($settings['enable_events']); ?>> Events</label><br>
                            <label><input name="dvadsatjeden_community_settings[enable_map]" type="checkbox" value="1" <?php checked($settings['enable_map']); ?>> Mapa</label><br>
                            <label><input name="dvadsatjeden_community_settings[enable_push]" type="checkbox" value="1" <?php checked($settings['enable_push']); ?>> Push</label>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">Troubleshooting</th>
                        <td>
                            <input type="hidden" name="dvadsatjeden_community_settings[force_enqueue_assets]" value="0" />
                            <label>
                                <input
                                    name="dvadsatjeden_community_settings[force_enqueue_assets]"
                                    type="checkbox"
                                    value="1"
                                    <?php checked(!empty($settings['force_enqueue_assets'])); ?>
                                />
                                Vynutit nacitavanie <code>community-app.js</code> na cely front (debug)
                            </label>
                            <p class="description">
                                Ak shortcode nebezi (napr. vlozeny v HTML bloku) alebo Kadence nespusti <code>do_shortcode</code>, appka sa nenacita.
                                Toto docasne nacita bundly globalne, aby islo rychlo odlisit problem s enqueue od problemu s obsahom.
                            </p>
                        </td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>
            <p><strong>Tip:</strong> shortcode na embed appky: <code>[dvadsatjeden_community_app]</code></p>
        </div>
        <?php
    }
}
