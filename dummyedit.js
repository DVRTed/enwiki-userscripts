// {{Wikipedia:USync |repo=https://github.com/DVRTed/enwiki-userscripts |ref=refs/heads/prod |path=dummyedit.js}}
/* 
Adds an option in the toolbar to make a dummy edit in the current page (see [[WP:DUMMY]]).
It also prompts you for a custom edit summary.
*/

/* global mw, $ */

mw.loader.using(["mediawiki.util", "mediawiki.api"], function () {
  const node = mw.util.addPortletLink(
    "p-tb",
    "#",
    "Dummy edit",
    "tb-dummyedit",
    "Make a dummy edit to this page",
  );

  $(node).on("click", function (e) {
    e.preventDefault();
    const api = new mw.Api();
    const page_title = mw.config.get("wgPageName");

    api
      .get({
        action: "query",
        titles: page_title,
        prop: "revisions",
        rvprop: "content|ids",
        rvslots: "main",
        formatversion: 2,
      })
      .then(function (data) {
        const page = data.query.pages[0];

        if (page.missing || !page.revisions?.length) {
          mw.notify("Could not retrieve page content.", { type: "error" });
          return;
        }

        const rev = page.revisions[0];
        const old_text = rev.slots.main.content;
        const base_rev_id = rev.revid; // to silently fail on edit conflicts

        const lines = old_text.split("\n");
        lines[0] = lines[0].endsWith(" ")
          ? lines[0].slice(0, -1)
          : lines[0] + " ";

        const new_text = lines.join("\n");

        const edit_summary = prompt(
          "Edit summary for the dummy edit (leave blank to cancel):",
          "[[WP:DUMMY|Dummy edit]]",
        );
        if (edit_summary === null || edit_summary.trim() === "") return;

        api
          .postWithEditToken({
            action: "edit",
            title: page_title,
            text: new_text,
            summary: edit_summary,
            baserevid: base_rev_id,
          })
          .then(() => {
            mw.notify("Dummy edit successful!", { type: "success" });
          })
          .catch(function (err) {
            mw.notify("Could not save page: " + err, { type: "error" });
          });
      })
      .catch(function (err) {
        mw.notify("Could not fetch page content: " + err, { type: "error" });
      });
  });
});
