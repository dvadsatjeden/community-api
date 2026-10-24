<?php
/**
 * Plugin Name: Dvadsatjeden Community Map API
 * Description: Read-only export of community-map data. No app, assets, settings or authentication.
 * Version: 1.0.0
 *
 * Install as wp-content/mu-plugins/community-source.php BEFORE deactivating the old Community app plugin.
 */
if (!defined('ABSPATH')) {
    exit;
}
add_action('rest_api_init', static function (): void {
    register_rest_route('community-map/v1', '/communities', [
        'methods' => 'GET',
        'permission_callback' => '__return_true',
        'callback' => static function () {
            $file = WP_PLUGIN_DIR . '/community-map/includes/import-data.php';
            if (!is_readable($file)) {
                return new WP_Error('community_source_unavailable', 'Community map data is unavailable.', ['status' => 503]);
            }
            $data = include $file;
            if (!is_array($data)) {
                return new WP_Error('invalid_community_source', 'Community map data is invalid.', ['status' => 502]);
            }
            $items = [];
            foreach ($data as $item) {
                if (!is_array($item) || !isset($item['name'], $item['url'], $item['lat'], $item['lng'])) {
                    return new WP_Error('invalid_community_source', 'Community map item is invalid.', ['status' => 502]);
                }
                $entry = [
                    'name' => (string) $item['name'],
                    'url' => (string) $item['url'],
                    'lat' => (float) $item['lat'],
                    'lng' => (float) $item['lng'],
                    'marker_image' => (string) ($item['marker_image'] ?? ''),
                ];
                if (isset($item['id'])) {
                    $entry['id'] = (string) $item['id'];
                }
                $items[] = $entry;
            }
            $response = rest_ensure_response(['items' => $items]);
            $response->header('Cache-Control', 'no-store');
            return $response;
        },
    ]);
});
