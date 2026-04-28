<?php

namespace DvadsatjedenCommunity;

if (!defined('ABSPATH')) {
    exit;
}

final class Assets
{
    public const HANDLE = 'dvadsatjeden_community_app';
    public const STYLE_HANDLE = 'dvadsatjeden_community_app_style';

    /** @var bool */
    private static $bundlePrinted = false;

    /** @var bool */
    private static $includeOnAllPublicPages = false;

    public static function register(): void
    {
        // "Force" mode: print direct tags in `wp_head` on all public pages (bypasses wp_enqueue / some optimizers).
        add_action('template_redirect', [self::class, 'maybeSetAutoloadFromSettings'], 1);
        add_action('wp_head', [self::class, 'printHeadBundleIfAutoloaded'], 50);
    }

    public static function maybeSetAutoloadFromSettings(): void
    {
        if (is_admin() || is_feed() || (defined('DOING_AJAX') && DOING_AJAX)) {
            return;
        }

        $settings = Settings::get();
        if (empty($settings['force_enqueue_assets'])) {
            return;
        }

        self::$includeOnAllPublicPages = true;
    }

    public static function printForShortcode(): void
    {
        if (is_admin() || is_feed() || (defined('DOING_AJAX') && DOING_AJAX)) {
            return;
        }
        if (self::$includeOnAllPublicPages) {
            // Already (or will be) printed in `wp_head` for this request.
            return;
        }

        self::printBundleTagBlock();
    }

    public static function printHeadBundleIfAutoloaded(): void
    {
        if (is_admin() || is_feed() || (defined('DOING_AJAX') && DOING_AJAX)) {
            return;
        }

        if (!self::$includeOnAllPublicPages) {
            return;
        }

        self::printBundleTagBlock();
    }

    private static function printBundleTagBlock(): void
    {
        if (self::$bundlePrinted) {
            return;
        }

        $jsPath = DVC_COMMUNITY_DIR . 'assets/community-app.js';
        $cssPath = DVC_COMMUNITY_DIR . 'assets/community-app.css';
        if (!is_readable($jsPath)) {
            if (current_user_can('edit_theme_options')) {
                // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
                echo "\n" . '<!-- DVC: missing assets/community-app.js (run apps/community-web npm run build:wp) -->' . "\n";
            }
            return;
        }

        $jsVer = (string) @filemtime($jsPath) ?: DVC_COMMUNITY_VERSION;
        $jsUrl = esc_url(DVC_COMMUNITY_URL . 'assets/community-app.js?ver=' . rawurlencode($jsVer));

        $cssUrl = null;
        if (is_readable($cssPath)) {
            $cssVer = (string) @filemtime($cssPath) ?: DVC_COMMUNITY_VERSION;
            $cssUrl = esc_url(DVC_COMMUNITY_URL . 'assets/community-app.css?ver=' . rawurlencode($cssVer));
        }

        // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
        echo "\n" . '<!-- DVC:community-app begin -->' . "\n";
        if ($cssUrl) {
            // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
            echo '<link rel="stylesheet" id="dvc-community-app-css" href="' . $cssUrl . '" media="all" />' . "\n";
        }
        // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
        echo '<script type="module" id="dvc-community-app-js" src="' . $jsUrl . '"></script>' . "\n";
        // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
        echo '<!-- DVC:community-app end -->' . "\n";

        self::$bundlePrinted = true;
    }
}
