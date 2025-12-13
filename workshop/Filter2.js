// Adds advanced filters to Contribution and Page History pages
// ([[Special:Contributions]], [[Special:History]])

/* global mw, OO, $ */

(function () {
  "use strict";

  const CONFIG = {
    DEBOUNCE_TIME: 300,
    PAGES: {
      CONTRIB: {
        listSelector: ".mw-contributions-list:first",
        itemSelector: ".mw-contributions-list li",
        titleSelector: ".mw-contributions-title",
      },
      HISTORY: {
        listSelector: "#pagehistory",
        itemSelector: "#pagehistory li",
        titleSelector: "N/A",
      },
    },
  };

  const NAMESPACES = mw.config.get("wgFormattedNamespaces");

  const pageType = $(CONFIG.PAGES.HISTORY.listSelector).length
    ? "HISTORY"
    : $(CONFIG.PAGES.CONTRIB.listSelector).length
      ? "CONTRIB"
      : null;
  if (!pageType) return;

  const isContrib = pageType === "CONTRIB";

  const selectors = CONFIG.PAGES[pageType];
  let items = [];
  let namespaces = new Set();
  let tags = new Set();
  let widgets = {};

  // this is used for debouncing summary filtering to
  // avoid re-filtering on every keystroke
  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  function getNamespace(title) {
    const titleObj = new mw.Title(title);
    return NAMESPACES[titleObj.getNamespaceId()] || "Main";
  }

  function extractTags($item) {
    return $item
      .find(".mw-tag-marker")
      .map((_, tag) => $(tag).text().replace(/[[\]]/g, "").trim())
      .get();
  }

  function getItemData($item) {
    const $title = isContrib ? $item.find(selectors.titleSelector) : "";
    const $summary = $item.find(".comment");

    const title = $title.length ? $title.text().trim() : "";
    const summary = $summary.text().trim();
    const itemTags = extractTags($item);
    const namespace = title ? getNamespace(title) : "";

    return { title, summary, tags: itemTags, namespace };
  }

  function initializeData() {
    $(selectors.itemSelector).each((_, item) => {
      const $item = $(item);
      const data = getItemData($item);

      namespaces.add(data.namespace);
      data.tags.forEach((tag) => tags.add(tag));

      items.push({ element: item, data });
    });
  }

  function createMultiSelectFilter(label, placeholder, optionsArray, onChange) {
    const selector = new OO.ui.MenuTagMultiselectWidget({
      placeholder,
      options: optionsArray.map((item) =>
        typeof item === "string" ? { data: item, label: item } : item
      ),
      input: { autocomplete: "off" },
    });

    selector.on("change", onChange);

    return new OO.ui.FieldLayout(selector, { label, align: "top" });
  }

  function createNamespaceFilter() {
    const sortedNs = Array.from(namespaces).sort((a, b) =>
      a === "Main" ? -1 : b === "Main" ? 1 : a.localeCompare(b)
    );

    return createMultiSelectFilter(
      "Namespaces",
      "Select namespaces...",
      sortedNs,
      applyFilters
    );
  }

  function createTagFilter() {
    if (tags.size === 0) return null;

    const options = [
      { data: "none", label: "None (untagged)" },
      ...Array.from(tags).sort(),
    ];

    return createMultiSelectFilter(
      "Tags",
      "Select tags...",
      options,
      applyFilters
    );
  }

  function createSummaryFilter() {
    const input = new OO.ui.TextInputWidget({
      placeholder: "Filter by edit summary...",
      icon: "search",
    });

    const regexToggle = new OO.ui.ToggleSwitchWidget();

    const errorMessage = new OO.ui.MessageWidget({
      type: "error",
      inline: true,
    });
    errorMessage.$element.css({
      display: "none",
      marginTop: "1em",
    });

    input.on("change", debounce(applyFilters, CONFIG.DEBOUNCE_TIME));
    regexToggle.on("change", applyFilters);

    const $container = $("<div>")
      .append(
        $("<div>")
          .css("marginTop", "1em")
          .append(
            new OO.ui.FieldLayout(input, {
              label: "Edit summary",
              align: "top",
            }).$element
          )
          .append(errorMessage.$element)
      )
      .append(
        $("<div>")
          .css("marginTop", "1em")
          .append(
            new OO.ui.FieldLayout(regexToggle, {
              label: "Use regex",
              align: "inline",
            }).$element
          )
      );

    return { container: $container, input, regexToggle, errorMessage };
  }

  function createUI() {
    const nsFilter = isContrib ? createNamespaceFilter() : null;
    const tagFilter = createTagFilter();
    const summaryFilter = createSummaryFilter();

    widgets = {
      nsSelector: nsFilter?.fieldWidget,
      tagSelector: tagFilter?.fieldWidget,
      summaryInput: summaryFilter.input,
      regexToggle: summaryFilter.regexToggle,
      regexError: summaryFilter.errorMessage,
      statsLabel: new OO.ui.LabelWidget({ label: "" }),
    };

    const fieldset = new OO.ui.FieldsetLayout({
      label: "Advanced filters",
    });

    if (nsFilter) fieldset.addItems([nsFilter]);
    if (tagFilter) fieldset.addItems([tagFilter]);
    fieldset.$element.append(summaryFilter.container);

    const resetButton = new OO.ui.ButtonWidget({
      label: "Reset all filters",
      flags: ["progressive", "secondary"],
    });

    resetButton.on("click", resetFilters);

    const $footer = $("<div>")
      .css({
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: "1em",
        paddingTop: "1em",
        borderTop: "1px solid #BEBEBE",
      })
      .append(widgets.statsLabel.$element, resetButton.$element);

    fieldset.$element.append($footer);

    const panel = new OO.ui.PanelLayout({
      expanded: false,
      framed: true,
      padded: true,
    });

    panel.$element.append(fieldset.$element);
    $(selectors.listSelector).before(panel.$element);
  }

  // summary match with regex support;
  // throws "REGEX_ERROR" error if invalid regex
  function matchesSummary(summary, filter, useRegex) {
    if (!filter) return true;
    try {
      return useRegex
        ? new RegExp(filter, "i").test(summary)
        : summary.toLowerCase().includes(filter.toLowerCase());
    } catch (e) {
      const err = new Error(e.message);
      err.code = "REGEX_ERROR";
      throw err;
    }
  }

  function itemPassesFilters(data, filters) {
    const { selectedNs, selectedTags, summaryFilter, useRegex } = filters;

    // namespace filter
    if (selectedNs.length > 0 && !selectedNs.includes(data.namespace)) {
      return false;
    }

    // tag filter
    if (selectedTags.length > 0) {
      const hasNoTags = data.tags.length === 0;
      const matchesTag = data.tags.some((tag) => selectedTags.includes(tag));

      if (hasNoTags ? !selectedTags.includes("none") : !matchesTag) {
        return false;
      }
    }

    // summary filter w/out regex
    if (
      summaryFilter &&
      !matchesSummary(data.summary, summaryFilter, useRegex)
    ) {
      return false;
    }

    return true;
  }

  function applyFilters() {
    const filters = {
      selectedNs: widgets.nsSelector?.getValue() || [],
      selectedTags: widgets.tagSelector?.getValue() || [],
      summaryFilter: widgets.summaryInput.getValue() || "",
      useRegex: widgets.regexToggle.getValue(),
    };

    let visibleCount = 0;
    let hasRegexError = false;

    for (const { element, data } of items) {
      try {
        const show = itemPassesFilters(data, filters);
        element.style.display = show ? "" : "none";
        if (show) visibleCount++;
      } catch (e) {
        if (e.code === "REGEX_ERROR") {
          hasRegexError = true;
          // hide all elements if regex is invalid
          for (const { element: el } of items) {
            el.style.display = "none";
          }
          widgets.regexError.setLabel(
            `Invalid regular expression: ${e.message}`
          );
          console.log("Regex error in filter:", e.message);
          break;
        } else {
          throw e;
        }
      }
    }

    widgets.regexError.$element.css("display", hasRegexError ? "" : "none");

    let text;
    if (visibleCount === items.length) {
      text = `Showing all ${items.length} items`;
    } else {
      text = `Showing ${visibleCount} of ${items.length} items`;
    }
    widgets.statsLabel.setLabel(text);
  }

  function resetFilters() {
    widgets.nsSelector.setValue([]);
    widgets.tagSelector?.setValue([]);
    widgets.summaryInput.setValue("");
    widgets.regexToggle.setValue(false);
    applyFilters();
  }

  function init() {
    mw.loader.using(["oojs-ui-core", "oojs-ui-widgets"], () => {
      initializeData();
      createUI();
      applyFilters();
    });
  }

  $(init);
})();
