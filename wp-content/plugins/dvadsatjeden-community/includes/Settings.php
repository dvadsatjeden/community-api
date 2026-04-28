<?php

namespace DvadsatjedenCommunity;

if (!defined('ABSPATH')) {
    exit;
}

final class Settings
{
    private const OPTION_KEY = 'dvadsatjeden_community_settings';

    public static function register(): void
    {
        add_action('admin_init', [self::class, 'registerSettings']);
    }

    public static function registerSettings(): void
    {
        register_setting('dvadsatjeden_community', self::OPTION_KEY, [
            'type' => 'array',
            'sanitize_callback' => [self::class, 'sanitize'],
            'default' => self::defaults(),
        ]);
    }

    public static function defaults(): array
    {
        return [
            'api_base_url' => '',
            'import_secret' => '',
            'events_source_url' => 'https://prevadzky.dvadsatjeden.org/wp-json/dvadsatjeden-events/v1/list?country=sk',
            'venues_source_url' => 'https://prevadzky.dvadsatjeden.org',
            'sync_interval_minutes' => 30,
            'enable_events' => true,
            'enable_map' => true,
            'enable_push' => false,
            'force_enqueue_assets' => false,
        ];
    }

    public static function get(): array
    {
        return wp_parse_args(get_option(self::OPTION_KEY, []), self::defaults());
    }

    public static function sanitize($input): array
    {
        $values = wp_parse_args(is_array($input) ? $input : [], self::defaults());

        return [
            'api_base_url' => esc_url_raw($values['api_base_url']),
            'import_secret' => sanitize_text_field($values['import_secret']),
            'events_source_url' => esc_url_raw($values['events_source_url']),
            'venues_source_url' => esc_url_raw($values['venues_source_url']),
            'sync_interval_minutes' => max(5, (int) $values['sync_interval_minutes']),
            'enable_events' => (bool) $values['enable_events'],
            'enable_map' => (bool) $values['enable_map'],
            'enable_push' => (bool) $values['enable_push'],
            'force_enqueue_assets' => (bool) $values['force_enqueue_assets'],
        ];
    }
}
