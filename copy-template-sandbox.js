// sync template and module codes w/ sandbox subpage
//
// "Template:Test"          ->  "Template:Test/sandbox"
// "Template:Test/sandbox"  ->  "Template:Test"
//
// "Module:Test"          ->  "Module:Test/sandbox"
// "Module:Test/sandbox"  ->  "Module:Test"
//
// inspired by [[User:Enterprisey/sync-template-sandbox.js]]
// <nowiki>

(async () => {
  const AD =
    " (using [[User:DVRTed/copy-template-sandbox.js|copy-template-sandbox.js]])";
  var ns = mw.config.get("wgNamespaceNumber");
  var current_page = mw.config.get("wgPageName");
  var main_page = current_page.replace("/sandbox", "");

  await mw.loader.using(["mediawiki.api", "oojs-ui-windows"]);

  async function get_page_text(page) {
    const data = await new mw.Api().get({
      action: "query",
      prop: "revisions",
      rvprop: "content",
      rvslots: "main",
      rvlimit: 1,
      titles: page,
      formatversion: 2,
    });
    const p = data.query.pages[0];
    return p.missing ? null : p.revisions[0].slots.main.content;
  }

  async function sync_pages(from, to, get_summary) {
    const source = from;

    if (
      !(await OO.ui.confirm(
        `Overwrite "${to}" with the code from "${source}"?`,
      ))
    )
      return;

    try {
      mw.notify("Syncing...");

      const source_text = await get_page_text(source);
      if (source_text === null)
        throw new Error(`Page "${source}" does not exist.`);

      await new mw.Api().postWithEditToken({
        action: "edit",
        title: to,
        summary: get_summary(source) + AD,
        text: source_text,
      });

      await OO.ui.alert(
        `Synced successfully! "${to}" now has the code from "${source}".`,
      );
      location.href = mw.util.getUrl(to);
    } catch (err) {
      OO.ui.alert(`Sync failed: ${err.message ?? err}`);
    }
  }

  // template and module
  if (ns === 10 || ns === 828) {
    const link = mw.util.addPortletLink(
      "p-cactions",
      "#",
      "Copy main to sandbox",
      "ca-copy-to-sandbox",
      "Overwrite the sandbox with the code from the main template",
    );
    link.addEventListener("click", () =>
      sync_pages(
        main_page,
        main_page + "/sandbox",
        () => "Syncing sandbox code with main template",
      ),
    );

    const push_link = mw.util.addPortletLink(
      "p-cactions",
      "#",
      "Copy sandbox to main",
      "ca-copy-to-main",
      "Overwrite the main template with the code from the sandbox",
    );
    push_link.addEventListener("click", () =>
      sync_pages(
        main_page + "/sandbox",
        main_page,
        (source) => `Syncing main template with [[${source}]]`,
      ),
    );
  }
})();

// </nowiki>
