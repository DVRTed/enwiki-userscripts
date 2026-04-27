/* auto redirects files to commons.

to avoid this redirect, set "?noredirect" in the url.
example: https://en.wikipedia.org/wiki/File:Example.jpg?noredirect
*/

/* global mw, $ */
(() => {
  const namespace = mw.config.get("wgNamespaceNumber");
  if (namespace !== 6) return;

  // check if there's "noredirect" parameter in the URL
  const params = new URLSearchParams(window.location.search);
  if (params.has("noredirect")) return;

  // check if there's a "view on commons" button
  const commons_button = $("#ca-view-foreign a");
  if (commons_button.length === 0) return;

  const commons_url = commons_button.attr("href");
  if (!commons_url || !commons_url.startsWith("https://commons.wikimedia.org")) return;

  window.location.replace(commons_url);
})();
