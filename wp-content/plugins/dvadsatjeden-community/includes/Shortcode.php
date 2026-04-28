<?php

namespace DvadsatjedenCommunity;

if (!defined('ABSPATH')) {
    exit;
}

final class Shortcode
{
    public static function register(): void
    {
        add_shortcode('dvadsatjeden_community_app', [self::class, 'render']);
        add_shortcode('dvadsatjeden_remote_calendar', [self::class, 'renderRemoteCalendar']);
    }

    public static function render(): string
    {
        ob_start();
        // Shortcodes usually render after `wp_head`, so enqueueing here won't appear in the head HTML.
        // We print a direct <link> + <script type="module"> in-place (see Assets).
        Assets::printForShortcode();
        $settings = Settings::get();
        $apiBase = esc_attr($settings['api_base_url']);
        $configUrl = esc_url_raw(rest_url('dvadsatjeden/v1/config'));
        $configUrlAttr = esc_attr($configUrl);
        $inner = <<<HTML
<div class="dvc" id="dvadsatjeden-community-app" data-api-base-url="{$apiBase}" data-config-url="{$configUrlAttr}" style="min-height: 120px;">
  <p style="margin: 0; padding: 12px 0; color: currentColor; opacity: 0.75;">
    Načítavam appku…
  </p>
  <noscript>Na pouzitie komunitnej appky treba zapnuty JavaScript.</noscript>
</div>
HTML;
        // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
        return (string) ob_get_clean() . $inner;
    }

    public static function renderRemoteCalendar(): string
    {
        if (is_admin()) {
            return '';
        }

        wp_enqueue_script(
            'dvc-popper-js',
            'https://unpkg.com/@popperjs/core@2.11.8/dist/umd/popper.min.js',
            [],
            '2.11.8',
            true
        );
        wp_enqueue_script(
            'dvc-tippy-js',
            'https://unpkg.com/tippy.js@6.3.7/dist/tippy.umd.min.js',
            ['dvc-popper-js'],
            '6.3.7',
            true
        );
        wp_enqueue_style(
            'dvc-tippy-css',
            'https://unpkg.com/tippy.js@6.3.7/dist/tippy.css',
            [],
            '6.3.7'
        );
        wp_enqueue_script(
            'dvc-fullcalendar-js',
            'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.js',
            ['dvc-tippy-js'],
            '6.1.15',
            true
        );

        $calendarEndpoint = esc_url_raw(rest_url('dvadsatjeden/v1/calendar-events'));
        $calendarEndpointJs = wp_json_encode($calendarEndpoint);
        $addEventUrlJs = wp_json_encode('https://prevadzky.dvadsatjeden.org/pridat/?listing_type=event');
        $icsUrl = 'https://prevadzky.dvadsatjeden.org/export-ical';
        $icsUrlJs = wp_json_encode($icsUrl);
        $instanceId = 'dvc-remote-calendar-' . wp_generate_password(8, false, false);
        $selectId = $instanceId . '-country';
        $copyId = $instanceId . '-copy';
        $downloadId = $instanceId . '-download';
        $copyFeedbackId = $instanceId . '-copy-feedback';

        $html = <<<HTML
<div class="dvc-remote-calendar-toolbar" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:0 0 12px;">
  <label for="{$selectId}" style="font-weight:600;">Krajina:</label>
  <select id="{$selectId}" style="min-width:160px;padding:6px 8px;">
    <option value="sk">Slovensko</option>
    <option value="cz">Česko</option>
    <option value="">Všetky</option>
  </select>
</div>
<div id="{$instanceId}" class="dvc-remote-calendar" style="min-height: 360px;"></div>
<div class="dvc-remote-calendar-export" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:14px;">
  <button type="button" id="{$copyId}" style="padding:8px 12px;cursor:pointer;">Skopírovať link kalendára</button>
  <a id="{$downloadId}" href="{$icsUrl}" target="_blank" rel="noreferrer" style="padding:8px 12px;border:1px solid currentColor;text-decoration:none;">Stiahnuť ICS</a>
  <span id="{$copyFeedbackId}" style="opacity:0.75;"></span>
</div>
<script>
document.addEventListener('DOMContentLoaded', function () {
  var calendarEl = document.getElementById('{$instanceId}');
  var countryEl = document.getElementById('{$selectId}');
  var copyEl = document.getElementById('{$copyId}');
  var copyFeedbackEl = document.getElementById('{$copyFeedbackId}');
  if (!calendarEl || typeof FullCalendar === 'undefined') {
    return;
  }

  var calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        height: 'auto',
        contentHeight: 'auto',
        expandRows: true,
        locale: 'sk',
        firstDay: 1,
        eventTimeFormat: {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        },
        customButtons: {
          myCustomButton: {
            text: 'Pridať',
            click: function () {
              window.open({$addEventUrlJs}, '_blank');
            }
          }
        },
        headerToolbar: {
          left: 'dayGridMonth,listMonth,timeGridWeek,listWeek',
          center: 'title',
          right: 'myCustomButton today prev,next'
        },
        buttonText: {
          today: 'Dnes',
          month: 'Mesiac',
          week: 'Týždeň',
          day: 'Deň',
          list: 'Zoznam'
        },
        eventClick: function (info) {
          var link = info.event.extendedProps.custom_link || info.event.url || '#';
          info.jsEvent.preventDefault();
          if (link && link !== '#') {
            window.open(link, '_blank');
          }
        },
        eventMouseEnter: function (info) {
          if (typeof tippy === 'undefined') {
            return;
          }
          var eventTitle = info.event.title || '';
          var eventStart = info.event.start ? info.event.start.toLocaleString('sk-SK') : '';
          var tagline = info.event.extendedProps.tagline || '';
          var eventCover = info.event.extendedProps.featured_image || '';
          var address = info.event.extendedProps.address || '';

          var wrap = document.createElement('div');
          wrap.style.maxWidth = '220px';

          var strong = document.createElement('strong');
          strong.textContent = eventTitle;
          wrap.appendChild(strong);
          wrap.appendChild(document.createElement('br'));

          var small = document.createElement('small');
          small.textContent = eventStart;
          wrap.appendChild(small);
          wrap.appendChild(document.createElement('br'));

          if (tagline) {
            var em = document.createElement('em');
            em.textContent = tagline;
            wrap.appendChild(em);
            wrap.appendChild(document.createElement('br'));
          }

          if (eventCover && /^https?:\/\//.test(eventCover)) {
            var imgWrap = document.createElement('div');
            imgWrap.style.marginTop = '5px';
            var img = document.createElement('img');
            img.src = eventCover;
            img.alt = '';
            img.style.maxWidth = '100%';
            imgWrap.appendChild(img);
            wrap.appendChild(imgWrap);
          }

          if (address) {
            var addrDiv = document.createElement('div');
            addrDiv.textContent = address;
            wrap.appendChild(addrDiv);
          }

          tippy(info.el, {
            content: wrap,
            allowHTML: false,
            theme: 'light',
            animation: 'shift-away',
            trigger: 'mouseenter focus'
          });
        }
      });

  var loadEvents = function () {
    var country = countryEl && countryEl.value ? String(countryEl.value) : '';
    var url = new URL({$calendarEndpointJs}, window.location.origin);
    if (country.length > 0) {
      url.searchParams.set('country', country);
    }
    return fetch(url.toString())
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Calendar endpoint HTTP ' + response.status);
        }
        return response.json();
      })
      .then(function (eventsData) {
        var nextEvents = Array.isArray(eventsData) ? eventsData : (eventsData.items || []);
        calendar.removeAllEvents();
        nextEvents.forEach(function (eventItem) {
          calendar.addEvent(eventItem);
        });
      });
  };

  calendar.render();
  loadEvents().catch(function (error) {
    console.error('Chyba pri načítaní udalostí kalendára:', error);
    calendarEl.innerHTML = '<p>Nepodarilo sa načítať kalendár udalostí.</p>';
  });

  if (countryEl) {
    countryEl.addEventListener('change', function () {
      loadEvents().catch(function (error) {
        console.error('Chyba pri filtrovaní udalostí:', error);
      });
    });
  }

  if (copyEl) {
    copyEl.addEventListener('click', function () {
      var icsUrl = {$icsUrlJs};
      var onSuccess = function () {
        if (copyFeedbackEl) copyFeedbackEl.textContent = 'Skopírované';
        window.setTimeout(function () {
          if (copyFeedbackEl) copyFeedbackEl.textContent = '';
        }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(icsUrl).then(onSuccess).catch(function () {});
        return;
      }
      var ta = document.createElement('textarea');
      ta.value = icsUrl;
      ta.setAttribute('readonly', '');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      onSuccess();
    });
  }
});
</script>
HTML;

        return $html;
    }
}
