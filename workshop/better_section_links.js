/*
Adds a menu button in section headers to copy section link.
Primary features: 
- supports diff view and specific revision, 
- allows copying permalink,
- multiple formats: plain url, wikilink, wrapped in [[Template:Section link]]

This is inspired by [[en:User:Polygnotus]]'s more than one "sectionlink" scripts.
*/

/* global $, mw, OO */
// <nowiki>

mw.loader
  .using([
    "oojs-ui",
    "oojs-ui.styles.icons-interactions", // has "ellipsis"
    "oojs-ui.styles.icons-editing-core", // has "linkExternal"
    "oojs-ui.styles.icons-editing-advanced", // has "wikiText" and "templateAdd"
  ])
  .then(() => {
    const current_page = mw.config.get("wgPageName");
    const headings = $(".mw-heading :is(h1,h2,h3,h4)[id]").not(
      ".mw-toc-heading *",
    );
    const is_current_revision =
      mw.config.get("wgRevisionId") === mw.config.get("wgCurRevisionId");

    const copy_to_clipboard = (text) => {
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        copy_to_clipboard_fallback(text);
        return;
      }

      navigator.clipboard
        .writeText(text)
        .then(() => {
          const message = $("<div>")
            .text("Copied to clipboard: ")
            .append($("<code>").text(text));
          mw.notify(message, { type: "success" });
        })
        .catch(() => {
          mw.notify("Failed to copy to clipboard.", { type: "error" });
          copy_to_clipboard_fallback(text);
        });
    };

    const copy_to_clipboard_fallback = (text) => {
      prompt("Failed to copy to clipboard. Here is the text:", text);
    };

    const available_options = [
      {
        data: "copy-link",
        label: "Copy link as URL",
        icon: "linkExternal",
        action: (header) => {
          const section_url = mw.util.getUrl(`${current_page}#${header.id}`);
          const full_url = location.origin + section_url;

          copy_to_clipboard(full_url);
        },
      },
      {
        data: "copy-permalink",
        label: is_current_revision
          ? "Copy permalink as URL"
          : "Copy this revision permalink as URL",
        icon: "linkExternal",
        action: (header) => {
          const current_id = mw.config.get("wgRevisionId");
          const permalink_url = mw.util.getUrl(`${current_page}#${header.id}`, {
            oldid: current_id,
          });
          const full_url = location.origin + permalink_url;

          copy_to_clipboard(full_url);
        },
      },
      {
        data: "copy-wikilink",
        label: "Copy as wikilink (e.g., [[Page#Section]])",
        icon: "wikiText",
        action: (header) => {
          const wikilink = `[[${current_page}#${header.id}]]`;

          copy_to_clipboard(wikilink);
        },
      },

      {
        data: "copy-wikilink-template",
        label: "Copy as template (e.g., {{Section link|...}})",
        icon: "templateAdd",
        action: (header) => {
          const wikilink_template = `{{Section link|${current_page}|${header.id}}}`;

          copy_to_clipboard(wikilink_template);
        },
      },
    ];

    headings.each((_, header) => {
      const menu_items = available_options.map(
        (opt) =>
          new OO.ui.MenuOptionWidget({
            data: opt.data,
            label: opt.label,
            icon: opt.icon,
          }),
      );

      const button = new OO.ui.ButtonMenuSelectWidget({
        icon: "ellipsis",
        framed: false,
        title: "Section options",
        menu: { items: menu_items },
      });

      // if we don't do this, the entire thing inherits font-size from the heading
      button.$element.css("font-size", "1rem");

      button.getMenu().on("select", (item) => {
        if (!item) return;
        const opt = available_options.find((o) => o.data === item.getData());
        if (opt) opt.action(header);
        // technically the ooui menu is more like a <select> input than it is a context menu;
        // its value needs to be reset, so an option can be selected next time.
        button.getMenu().selectItem(null);
      });

      header.parentElement.insertBefore(
        button.$element[0],
        header.parentElement.firstChild,
      );
    });
  });

// </nowiki>
