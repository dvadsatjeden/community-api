<?php

namespace DvadsatjedenCommunity;

if (!defined('ABSPATH')) {
    exit;
}

final class Diagnostics
{
    public static function register(): void
    {
        add_action('init', [self::class, 'maybeRespond'], 0);
        add_action('admin_notices', [self::class, 'adminNoticeIfAssetsMissing']);
    }

    public static function adminNoticeIfAssetsMissing(): void
    {
        if (!current_user_can('manage_options')) {
            return;
        }

        $jsPath = DVC_COMMUNITY_DIR . 'assets/community-app.js';
        if (is_readable($jsPath)) {
            return;
        }

        echo '<div class="notice notice-error"><p><strong>Dvadsatjeden Community:</strong> chýba <code>assets/community-app.js</code> v plugine. UI sa nenačíta, kým nezbuildujete web app: <code>cd apps/community-web &amp;&amp; npm run build:wp</code> a nahráte <code>assets/</code> do <code>wp-content/plugins/dvadsatjeden-community/assets/</code>.</p></div>';
    }

    public static function maybeRespond(): void
    {
        if (!isset($_GET['dvc_community_diag'])) {
            return;
        }
        if (!is_user_logged_in() || !current_user_can('manage_options')) {
            return;
        }

        $jsPath = DVC_COMMUNITY_DIR . 'assets/community-app.js';
        $cssPath = DVC_COMMUNITY_DIR . 'assets/community-app.css';

        $settings = Settings::get();

        wp_send_json(
            [
                'plugin' => [
                    'version' => DVC_COMMUNITY_VERSION,
                    'dir' => DVC_COMMUNITY_DIR,
                    'url' => DVC_COMMUNITY_URL,
                ],
                'assets' => [
                    'js' => [
                        'path' => $jsPath,
                        'exists' => is_readable($jsPath),
                        'size' => is_readable($jsPath) ? (int) @filesize($jsPath) : null,
                        'url' => DVC_COMMUNITY_URL . 'assets/community-app.js',
                    ],
                    'css' => [
                        'path' => $cssPath,
                        'exists' => is_readable($cssPath),
                        'size' => is_readable($cssPath) ? (int) @filesize($cssPath) : null,
                        'url' => DVC_COMMUNITY_URL . 'assets/community-app.css',
                    ],
                ],
                'settings' => $settings,
            ],
            200
        );
    }
}
