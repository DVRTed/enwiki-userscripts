/* declutter user talk pages.
adds a button at the top of user talk pages that, when clicked,
gets rid of all the clutter, retaining only the ACTUAL talk sections and the table of contents;

also fixes the talk messages getting hidden behind "about this page" on mobile view.
*/

/* global mw, $ */
mw.loader.using("mediawiki.ui.button").then(() => {
  if (mw.config.get("wgNamespaceNumber") !== 3) return;
  const main_wrapper = $("#mw-content-text .mw-parser-output");

  function declutter_talk_page() {
    const toc = main_wrapper.find("#toc").detach();
    const first_section = main_wrapper
      .find("div.ext-discussiontools-init-section.mw-heading")
      .first();
    if (!first_section.length) return;

    const talk_messages = first_section.add(first_section.nextAll()).detach();
    main_wrapper.empty().append(toc, talk_messages);
  }

  const button = $("<button>")
    .addClass("mw-ui-button mw-ui-progressive")
    .text("Declutter this talk page")
    .on("click", declutter_talk_page);

  main_wrapper.prepend(button);
});
