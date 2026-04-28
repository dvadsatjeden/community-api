<?php
/**
 * Plugin Name: Dvadsatjeden Community
 * Description: Integracia komunitnej PWA aplikacie pre dvadsatjeden.org.
 * Version: 0.5.0
 * Author: Dvadsatjeden
 */
if (!defined('ABSPATH')) {
    exit;
}

if (!defined('DVC_COMMUNITY_VERSION')) {
    define('DVC_COMMUNITY_VERSION', '0.5.0');
}

if (!defined('DVC_COMMUNITY_DIR')) {
    define('DVC_COMMUNITY_DIR', trailingslashit(plugin_dir_path(__FILE__)));
}

if (!defined('DVC_COMMUNITY_URL')) {
    // Avoid mixed-content: `plugins_url()` can be http even when the site is served over https behind proxies
    // (Kinsta/DevKinsta/tunnels). Browsers will block an http module on an https page.
    $rawPluginUrl = trailingslashit(plugins_url('', __FILE__));
    $homeScheme = function_exists('home_url') ? wp_parse_url(home_url(), PHP_URL_SCHEME) : null;
    $scheme = is_string($homeScheme) && $homeScheme !== ''
        ? $homeScheme
        : (is_ssl() ? 'https' : 'http');
    define('DVC_COMMUNITY_URL', set_url_scheme($rawPluginUrl, $scheme));
}

require_once __DIR__ . '/includes/Settings.php';
require_once __DIR__ . '/includes/AdminPage.php';
require_once __DIR__ . '/includes/ApiProxy.php';
require_once __DIR__ . '/includes/Shortcode.php';
require_once __DIR__ . '/includes/Assets.php';
require_once __DIR__ . '/includes/Diagnostics.php';

use DvadsatjedenCommunity\AdminPage;
use DvadsatjedenCommunity\ApiProxy;
use DvadsatjedenCommunity\Assets;
use DvadsatjedenCommunity\Diagnostics;
use DvadsatjedenCommunity\Settings;
use DvadsatjedenCommunity\Shortcode;

add_action('plugins_loaded', static function () {
    Settings::register();
    AdminPage::register();
    ApiProxy::register();
    Shortcode::register();
    Assets::register();
    Diagnostics::register();
});
