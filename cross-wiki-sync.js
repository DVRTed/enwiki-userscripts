// {{Wikipedia:USync |repo=https://github.com/DVRTed/enwiki-userscripts |ref=refs/heads/prod |path=cross-wiki-sync.js}}
/*
   Syncs current page content from another wiki.
   Only active on User:YourName/[script].js
*/

/* global mw, $, OO */

(() => {
  const SOURCE_WIKI = "https://test.wikipedia.org";

  const page = mw.config.get("wgPageName");
  const user = mw.config.get("wgUserName");

  // matches `User:[CURRENT_USER]/[ANYTHING].(js|css)`
  const is_own_script =
    page.startsWith(`User:${user}/`) &&
    (page.endsWith(".js") || page.endsWith(".css"));
  if (!is_own_script) return;
  const source_name = new URL(SOURCE_WIKI).hostname;

  mw.loader.using(
    ["mediawiki.util", "mediawiki.api", "oojs-ui-core", "oojs-ui-windows"],
    function () {
      const link = mw.util.addPortletLink(
        "p-cactions",
        "#",
        `Sync from ${source_name}`,
        "sync-link"
      );

      $(link).on("click", function (e) {
        e.preventDefault();
        show_input_dialog();
      });

      function show_input_dialog() {
        OO.ui
          .prompt("Enter page name to sync from:", {
            textInput: { value: page },
          })
          .then(function (page_name) {
            if (page_name) {
              fetch_page(page_name);
            }
          });
      }

      async function fetch_page(page_name) {
        mw.notify(`Fetching ${page_name} from ${source_name}...`, {
          type: "info",
        });

        const api_url = `${SOURCE_WIKI}/w/api.php?action=query&titles=${encodeURIComponent(
          page_name
        )}&prop=revisions&rvprop=content&format=json&origin=*&rvslots=*`;

        const response = await fetch(api_url).then((r) => r.json());
        const pages = Object.values(response.query.pages || {});
        const page_data = pages[0];

        if (!page_data || page_data.missing) {
          mw.notify(`Error: page not found on ${source_name}`, {
            type: "error",
          });
          return;
        }

        const content = page_data.revisions[0].slots.main["*"];
        await edit_page(content, page_name);
      }

      async function edit_page(content, page_name) {
        const api = new mw.Api();

        const confirmed = await OO.ui.confirm($("<pre>").text(content), {
          title: `Sync from ${source_name}`,
        });

        if (!confirmed) return;

        const response = await api.postWithEditToken({
          action: "edit",
          title: page,
          text: content,
          summary: `Synced from [[:testwiki:${page_name}]] using [[User:DVRTed/cross-wiki-sync.js|cross-wiki-sync]]`,
        });

        if (response.edit && response.edit.result === "Success") {
          mw.notify("Synced!", { type: "success" });
          setTimeout(() => location.reload(), 1000);
        } else {
          mw.notify(`Edit failed: ${JSON.stringify(response.edit)}`, {
            type: "error",
          });
        }
      }
    }
  );
})();
