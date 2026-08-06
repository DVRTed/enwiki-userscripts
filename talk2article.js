// for "Talk:Xyz" entries in watchlist, makes [[:mw:Page Previews]]
// show a preview of the corresponding "Xyz" page instead of ignoring it as a talk page

mw.hook("wikipage.content").add(function ($content) {
  if (mw.config.get("wgCanonicalSpecialPageName") !== "Watchlist") return;
  $content
    .find("li.mw-changeslist-ns-1 .mw-changeslist-title")
    .each(function () {
      const elem = $(this);
      if (elem.data("talkPeekDone")) return;
      elem.data("talkPeekDone", true);

      const original_url = elem.attr("href");

      const new_url = elem
        .closest(".mw-changeslist-line-inner")
        .data("target-page")
        .replace(/^Talk:/, "");

      // set new href that points to the article page
      elem.attr("href", mw.util.getUrl(new_url));

      // add click event to open the actual talk page
      elem.on("click", function (e) {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          window.open(original_url, "_blank");
        } else {
          window.location.href = original_url;
        }
      });
    });
});
