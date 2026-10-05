/*
 * Booking widget loader. Placed on a customer's site:
 *
 *   <script src="https://<app>/widget.js" data-key="wk_..." data-api="https://<ref>.supabase.co/functions/v1"
 *           data-app="https://<app>" async></script>
 *
 * 1. Asks validate_widget whether THIS page's origin (set by the browser, not by
 *    us) is allowed for the key. A refusal is silent: nothing is rendered.
 * 2. Injects an iframe of the public booking page with the signed, 1-hour embed
 *    token. Real "only allowed domains may frame" enforcement is the
 *    frame-ancestors header on the booking page (host layer, launch blocker).
 */
(function () {
  const script = document.currentScript;
  if (!script) return;
  const key = script.getAttribute('data-key');
  const api = (script.getAttribute('data-api') || '').replace(/\/+$/, '');
  const app = (script.getAttribute('data-app') || '').replace(/\/+$/, '');
  if (!key || !api || !app) return;

  fetch(api + '/validate_widget', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'validate', key: key }),
  })
    .then(function (res) {
      return res.ok ? res.json() : null;
    })
    .then(function (body) {
      if (!body || !body.ok || !body.data) return;
      const frame = document.createElement('iframe');
      frame.src =
        app +
        '/' +
        encodeURIComponent(body.data.slug) +
        '/book?embed=' +
        encodeURIComponent(body.data.embed_token);
      frame.title = 'Booking';
      frame.loading = 'lazy';
      frame.setAttribute('allow', 'payment=()');
      frame.style.cssText = 'width:100%;min-height:720px;border:0';
      const target = script.getAttribute('data-target');
      const host = target ? document.querySelector(target) : null;
      if (host) host.appendChild(frame);
      else script.parentNode.insertBefore(frame, script.nextSibling);
    })
    .catch(function () {});
})();
