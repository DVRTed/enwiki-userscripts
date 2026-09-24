/*
shows the preview-only warnings you'd see when previewing a page;
these are typically warnings about deprecated/unknown parameters in infoboxes,
(e.g., "Preview warning: Page using Template:Infobox college coach with unknown parameter 'upright'")

look for an option labeled "Check preview errors" in the Tools section to use it. 
*/

(() => {
  const api = new mw.Api();
  const page_title = mw.config.get("wgPageName");
  const namespace = mw.config.get("wgNamespaceNumber");

  if (namespace !== 0) return;

  async function check_preview_errors(e) {
    await mw.loader.using("oojs-ui-core");

    let $panel = $("#preview_error_panel");
    if ($panel.length < 1) {
      $panel = $('<div id="preview_error_panel">').css("margin", "1em 0");
      $("#mw-content-text").before($panel);
    }

    $panel.empty().append(
      new OO.ui.MessageWidget({
        type: "notice",
        label: "Checking for preview errors...",
      }).$element,
    );

    const cur_res = await api.get({
      action: "query",
      prop: "revisions",
      rvslots: "main",
      rvprop: "content",
      titles: page_title,
      formatversion: 2,
    });

    const wikitext = cur_res.query.pages[0].revisions[0].slots.main.content;

    // re-parse the current wikitext without rev details
    // which triggers the preview-only warnings to show up
    const parse_res = await api.post({
      action: "parse",
      text: wikitext,
      title: page_title,
      contentmodel: "wikitext",
      prop: "text",
      formatversion: 2,
    });

    const $parsed_html = $("<div>").html(parse_res.parse.text);
    const warning_texts = [];

    $parsed_html.find(".preview-warning").each(function () {
      warning_texts.push($(this).text().trim());
    });

    $panel.empty();

    if (warning_texts.length === 0) {
      $panel.append(
        new OO.ui.MessageWidget({
          type: "success",
          label: `No preview warnings found on "${page_title}".`,
        }).$element,
      );
      return;
    }

    const $list = $("<ul>");
    for (const warning_text of warning_texts) {
      $list.append($("<li>").text(warning_text));
    }

    $panel.append(
      new OO.ui.MessageWidget({
        type: "error",
        label: $("<div>")
          .append(
            $("<div>").text(
              `${warning_texts.length} warning(s) found on "${page_title}":`,
            ),
            $list,
          )
          .contents(),
      }).$element,
    );
  }

  const link = mw.util.addPortletLink(
    "p-tb",
    "#",
    "Check preview errors",
    "t-checkpreviewerrors",
  );
  link.addEventListener("click", check_preview_errors);
})();
