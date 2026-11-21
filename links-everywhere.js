// adds [edit|hist] links to all wikilinks

mw.hook("wikipage.content").add(function ($content) {
  $content
    .find('a[rel~="mw:WikiLink"]')
    .not(".new, .mw-selflink, .userlink, .levwhr-done")
    .each(function () {
      try {
        if (this.search) return;

        const title = this.pathname.replace(/^\/wiki\//, "");
        const decoded = decodeURIComponent(title);

        const parsed = mw.Title.newFromText(decoded);
        if (!parsed || parsed.getNamespaceId() < 0) return;

        $(this).after(
          $('<span style="font-size:80%"> [</span>').append(
            $("<a>")
              .attr("href", parsed.getUrl({ action: "edit" }))
              .text("edit"),
            "|",
            $("<a>")
              .attr("href", parsed.getUrl({ action: "history" }))
              .text("hist"),
            "]",
          ),
        );
      } catch (e) {
        console.error(e);
      } finally {
        $(this).addClass("levwhr-done");
      }
    });
});
