# Historický WordPress plugin

Pôvodný app plugin je archivovaný a nie je súčasťou buildu ani nasadenia. Miestne rozpracované zmeny boli zachované.

Pred jeho deaktiváciou na externom WP hostingu nainštaluj `integrations/wordpress/community-source.php` do `wp-content/mu-plugins/`, over nový zdroj komunít a zmeň `COMMUNITIES_SOURCE_URL` na `/wp-json/community-map/v1/communities`.

Samostatná PWA používa `/v1/config` z API. WordPress zostáva redakčným systémom a môže zostať aj zdrojom komunít, ale nenačítava ani nekonfiguruje aplikáciu.
