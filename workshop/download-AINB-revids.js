async function download_revids() {
  const page = mw.config.get("wgPageName");
  const api = new mw.Api();

  if (!page.startsWith("Wikipedia:AI_noticeboard/")) return;

  const { parse } = await api.get({
    action: "parse",
    page,
    prop: "wikitext",
  });
  const wikitext = parse.wikitext["*"];

  const RE =
    /\[\[Special:Diff\/(?<rev_id>\d+)\|\((?<bytes_changed>[+-]?\d+)\)\]\]/gi;

  const rev_ids = [...wikitext.matchAll(RE)].map((match) => {
    const { rev_id, bytes_changed } = match.groups;

    return { rev_id, bytes_changed };
  });
  if (!rev_ids.length) return;

  const json = JSON.stringify(rev_ids, null, 2);
  const blob = new Blob([json], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);

  const $a = $("<a>")
    .attr({
      href: url,
      download: `revids.json`,
    })
    .appendTo("body");
  $a[0].click();
  $a.remove();

  URL.revokeObjectURL(url);
}

const portlet_link = mw.util.addPortletLink(
  "p-tb",
  "#",
  "Download revids",
  "t-ainb-download-revids",
  "Download diff revids as JSON",
);

$(portlet_link).on("click", function (e) {
  e.preventDefault();
  download_revids();
});
