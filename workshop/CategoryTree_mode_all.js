/* adds a button in category pages to display 
the output of {{Category tree all|mode=all}} for the current category */

/* global mw, $ */

mw.loader.using(["mediawiki.api", "mediawiki.ui.button"], () => {
  if (mw.config.get("wgNamespaceNumber") !== 14) return;

  const pagename = mw.config.get("wgPageName");
  const container = $("<div>").css({ margin: "12px 4px" });

  const button = $("<button>")
    .addClass("mw-ui-button mw-ui-progressive")
    .html("Display {{Category tree all}} (mode=all)")
    .on("click", () => {
      button.prop("disabled", true);

      new mw.Api()
        .get({
          action: "parse",
          prop: "text",
          contentmodel: "wikitext",
          text: `{{Category tree all|${pagename}|mode=all}}`,
        })
        .done((data) => {
          container.html(data?.parse?.text?.["*"] || "<em>(no output)</em>");
          mw.hook("wikipage.content").fire(container);
        })
        .fail(() => {
          container.html("<em>Failed to load.</em>");
          button.prop("disabled", false);
        });
    });

  $("#mw-content-text").prepend(container).prepend(button);
});
