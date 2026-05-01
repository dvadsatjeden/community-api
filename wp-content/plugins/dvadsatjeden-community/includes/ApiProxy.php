<?php

namespace DvadsatjedenCommunity;

if (!defined('ABSPATH')) {
    exit;
}

final class ApiProxy
{
    public static function register(): void
    {
        add_action('rest_api_init', [self::class, 'registerRoutes']);
    }

    public static function registerRoutes(): void
    {
        register_rest_route('dvadsatjeden/v1', '/config', [
            'methods' => 'GET',
            'permission_callback' => '__return_true',
            'callback' => static function () {
                $settings = Settings::get();
                $payload = [
                    'apiBaseUrl' => $settings['api_base_url'],
                    'features' => [
                        'events' => (bool) $settings['enable_events'],
                        'map' => (bool) $settings['enable_map'],
                        'push' => (bool) $settings['enable_push'],
                    ],
                    'sources' => [
                        'events' => $settings['events_source_url'],
                        'venues' => $settings['venues_source_url'],
                    ],
                ];

                $apiBase = rtrim((string) ($settings['api_base_url'] ?? ''), '/');
                if ($apiBase !== '' && !empty($settings['enable_push'])) {
                    $upstream = wp_remote_get($apiBase . '/v1/config', ['timeout' => 5]);
                    if (!is_wp_error($upstream)) {
                        $code = (int) wp_remote_retrieve_response_code($upstream);
                        if ($code >= 200 && $code < 300) {
                            $decoded = json_decode((string) wp_remote_retrieve_body($upstream), true);
                            if (is_array($decoded) && isset($decoded['vapidPublicKey']) && is_string($decoded['vapidPublicKey'])) {
                                $key = trim($decoded['vapidPublicKey']);
                                if ($key !== '') {
                                    $payload['vapidPublicKey'] = $key;
                                }
                            }
                        }
                    }
                }

                return rest_ensure_response($payload);
            },
        ]);

        register_rest_route('dvadsatjeden/v1', '/import-run', [
            'methods' => 'POST',
            'permission_callback' => static fn() => current_user_can('manage_options'),
            'callback' => static function () {
                $settings = Settings::get();
                $apiBaseUrl = rtrim((string) $settings['api_base_url'], '/');
                if ($apiBaseUrl === '') {
                    return new \WP_Error('missing_api_base_url', 'API base URL is not configured.', ['status' => 400]);
                }

                $importSecret = trim((string) ($settings['import_secret'] ?? ''));
                $importHeaders = ['Content-Type' => 'application/json'];
                if ($importSecret !== '') {
                    $importHeaders['Authorization'] = 'Bearer ' . $importSecret;
                }
                $response = wp_remote_post("{$apiBaseUrl}/v1/import/run", [
                    'headers' => $importHeaders,
                    'body' => wp_json_encode([
                        'sourceUrl' => $settings['events_source_url'],
                    ]),
                    'timeout' => 20,
                ]);

                if (is_wp_error($response)) {
                    return new \WP_Error('import_request_failed', $response->get_error_message(), ['status' => 502]);
                }

                $statusCode = wp_remote_retrieve_response_code($response);
                $body = json_decode((string) wp_remote_retrieve_body($response), true);

                return rest_ensure_response([
                    'statusCode' => $statusCode,
                    'upstream' => $body,
                ]);
            },
        ]);

        register_rest_route('dvadsatjeden/v1', '/communities', [
            'methods' => 'GET',
            'permission_callback' => '__return_true',
            'callback' => static function () {
                $file = WP_PLUGIN_DIR . '/community-map/includes/import-data.php';
                if (!file_exists($file)) {
                    return rest_ensure_response(['items' => []]);
                }
                $data = include $file;
                if (!is_array($data)) {
                    return rest_ensure_response(['items' => []]);
                }
                $items = array_values(array_map(static function (array $item): array {
                    return [
                        'name'         => (string) ($item['name'] ?? ''),
                        'url'          => (string) ($item['url'] ?? ''),
                        'lat'          => (float) ($item['lat'] ?? 0),
                        'lng'          => (float) ($item['lng'] ?? 0),
                        'marker_image' => (string) ($item['marker_image'] ?? ''),
                    ];
                }, $data));
                return rest_ensure_response(['items' => $items]);
            },
        ]);

        register_rest_route('dvadsatjeden/v1', '/calendar-events', [
            'methods' => 'GET',
            'permission_callback' => '__return_true',
            'callback' => static function (\WP_REST_Request $request) {
                $settings = Settings::get();
                $sourceUrl = trim((string) ($settings['events_source_url'] ?? ''));
                if ($sourceUrl === '') {
                    return new \WP_Error('missing_events_source_url', 'Events source URL is not configured.', ['status' => 400]);
                }

                $country = trim((string) $request->get_param('country'));
                if ($country !== '') {
                    $sourceUrl = add_query_arg('country', $country, $sourceUrl);
                }

                $response = wp_remote_get($sourceUrl, ['timeout' => 20]);
                if (is_wp_error($response)) {
                    return new \WP_Error('calendar_events_fetch_failed', $response->get_error_message(), ['status' => 502]);
                }

                $statusCode = (int) wp_remote_retrieve_response_code($response);
                $bodyRaw = (string) wp_remote_retrieve_body($response);
                $body = json_decode($bodyRaw, true);
                if (!is_array($body)) {
                    return new \WP_Error('calendar_events_invalid_json', 'Upstream did not return valid JSON.', ['status' => 502]);
                }
                if ($statusCode < 200 || $statusCode >= 300) {
                    return new \WP_Error('calendar_events_upstream_error', 'Upstream calendar endpoint returned an error.', [
                        'status' => 502,
                        'upstreamStatusCode' => $statusCode,
                    ]);
                }

                return rest_ensure_response($body);
            },
        ]);
    }
}
