// adds a button at the bottom of talk pages to jump to the corresponding article page
mw.loader.using(["oojs-ui-core", "oojs-ui.styles.icons-movement"], () => {
  const ns = mw.config.get("wgNamespaceNumber");
  if (ns < 0 || ns % 2 === 0) return;

  const href = $('#p-associated-pages [id^="ca-nstab-"] a').attr("href");
  if (!href) return;

  const button = new OO.ui.ButtonWidget({
    href,
    label: "Jump to article",
    icon: "arrowPrevious",
    flags: ["progressive"],
  });

  $("#mw-content-text").append(
    $("<div>", {
      css: {
        margin: "2em 0",
        paddingTop: "1em",
        borderTop: "1px solid #a2a9b1",
      },
    }).append(button.$element),
  );
});
