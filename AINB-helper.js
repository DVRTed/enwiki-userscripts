// {{Wikipedia:USync |repo=https://github.com/DVRTed/enwiki-userscripts |ref=refs/heads/prod |path=AINB-helper.js}}
// Userscript to help generating tracking subpages at [[WP:AINB]]

/* globals mw, $ */
// <nowiki>
$(() => {
  const APP_ID = "ainb-helper";
  const APP_AD = "(using [[User:DVRTed/AINB-helper.js|AINB-helper]])";

  const DEBUG_MODE = false;
  const DEBUG_PAGE = "User:DVRTed/sandbox2";

  let currentApp = null;

  function init() {
    mw.loader
      .using(["vue", "@wikimedia/codex", "mediawiki.api", "mediawiki.util"])
      .then((require) => {
        const Vue = require("vue");
        const { createMwApp, ref, computed, nextTick } = Vue;
        const {
          CdxButton,
          CdxTextInput,
          CdxDialog,
          CdxAccordion,
          CdxCheckbox,
          CdxIcon,
          CdxProgressBar,
        } = require("@wikimedia/codex");

        const App = {
          name: APP_ID,
          components: {
            CdxButton,
            CdxTextInput,
            CdxDialog,
            CdxAccordion,
            CdxCheckbox,
            CdxIcon,
            CdxProgressBar,
          },
          template: `
<cdx-dialog class="ainb-helper" v-model:open="isOpen" :title="dialogTitle" @update:open="handleDialogClose"
    :use-close-button="true">
    <div v-if="step === 1" class="ainb-step">
        <div v-if="!loading">
            <p>Enter the username (contribs since Dec 1, 2022)</p>
            <cdx-text-input v-model="username" autocomplete="off" data-bwignore="true" data-lpignore="true" data-1p-ignore placeholder="User:ExampleUser or ExampleUser"
                @keydown.enter="fetchContributions" />
        </div>
        <div v-if="error" class="ainb-error">{{ error }}</div>
        <div v-if="loading" class="ainb-loading">
            <p>
                Fetching contributions... {{ progress > 0 ? progress + ' found' : '' }}
            </p>
            <cdx-progress-bar inline></cdx-progress-bar>
        </div>
    </div>

    <div v-if="step === 2" class="ainb-step">
        <div class="ainb-controls">
            <cdx-checkbox :model-value="allSelected" :indeterminate="someSelected && !allSelected"
                @update:model-value="toggleAll">
                Select All
            </cdx-checkbox>
            <span><b>{{ totalSelectedDiffs }} diff(s)</b> selected</span>
        </div>

        <div class="ainb-list">
            <div v-for="group in articleGroups" :key="group.title" class="ainb-article-card">
              <div class="ainb-article-header">
                    <cdx-checkbox
                        :model-value="group.allSelected"
                        :indeterminate="group.someSelected && !group.allSelected"
                        @update:model-value="toggleArticle(group)"
                    >
                        <strong>{{ group.title }}</strong>
                        <span class="ainb-count">({{ group.selectedCount }}/{{ group.edits.length }} selected)</span>
                    </cdx-checkbox>
                </div>

                <cdx-accordion>
                    <template #title>
                        <span>Details</span>
                    </template>
                    <div class="ainb-diffs" v-show="group.expanded">
                        <div v-for="edit in group.edits" :key="edit.revid" class="ainb-diff-item">
                            <div class="ainb-diff-header">
                                <cdx-checkbox v-model="edit.selected" @update:model-value="updateGroupSelection(group)"
                                    class="ainb-diff-checkbox">
                                    <span class="ainb-comment" :title="edit.comment" v-if="edit.comment">({{
                                        truncate(edit.comment, 60) }})</span>
                                    <span :class="getSizeClass(edit.sizediff)" class="ainb-diff-size">
                                        {{ formatBytes(edit.sizediff) }}
                                    </span>
                                    <span class="ainb-time">{{ edit.timestamp }}</span>
                                </cdx-checkbox>
                                <a :href="getDiffUrl(edit.revid)" target="_blank" class="ainb-diff-link">
                                    [diff link]
                                </a>
                            </div>

                            <div class="ainb-custom-accordion">
                                <button class="ainb-accordion-header" @click="toggleDiff(edit)">
                                    <cdx-icon :icon="edit.expanded ? ICON_COLLAPSE : ICON_EXPAND"
                                        class="ainb-accordion-icon"></cdx-icon>
                                    <span class="ainb-accordion-title">View Diff Content</span>
                                </button>
                                <div v-if="edit.expanded" class="ainb-accordion-content">
                                    <div v-if="edit.diffLoading" class="ainb-diff-loading">
                                        Loading...
                                    </div>
                                    <div v-else-if="edit.diffContent" class="ainb-diff-content"
                                        v-html="edit.diffContent">
                                    </div>
                                    <div v-else class="ainb-diff-loading">No content loaded.</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </cdx-accordion>
            </div>
        </div>
    </div>

    <div v-if="step === 3" class="ainb-step">
        <div v-if="creating" class="ainb-loading">
            <p>Creating page...</p>
            <cdx-progress-bar inline></cdx-progress-bar>
        </div>
        <div v-else-if="createError" class="ainb-error">{{ createError }}</div>
        <div v-else>
            <p>Page created successfully!</p>
            <p><a :href="targetPageUrl" target="_blank">{{ targetPageTitle }}</a></p>
        </div>
    </div>

    <template #footer>
        <div class="ainb-dialog-footer">
            <div v-if="step === 1"></div><!-- spacer ~ this goes to left -->
            <cdx-button v-if="step === 1" action="progressive" weight="primary" @click="fetchContributions"
                :disabled="loading || !username">
                {{ loading ? 'Fetching...' : 'Fetch contributions' }}
            </cdx-button>
            <template v-if="step === 2">
                <div class="ainb-subpage-info">
                    Target:
                    <strong>{{ targetPageTitle }}</strong>
                </div>
                <div>
                    <cdx-button @click="step = 1">Back</cdx-button>
                    <cdx-button action="progressive" weight="primary" @click="generateReport"
                        :disabled="totalSelectedDiffs === 0">
                        Create Page
                    </cdx-button>
                </div>
            </template>
            <template v-if="step === 3">
                <div></div><!-- spacer ~ this goes to left -->
                <div>
                    <cdx-button @click="handleDialogClose">Close</cdx-button>
                    <cdx-button @click="reset" action="progressive" :disabled="creating">Start Over</cdx-button>
                </div>
            </template>
        </div>
    </template>
</cdx-dialog>          
          `,
          setup() {
            const isOpen = ref(true);
            const step = ref(1);
            const username = ref("");
            const normalizedUsername = ref("");
            const loading = ref(false);
            const progress = ref(0);
            const error = ref("");
            const articleGroups = ref([]);
            const creating = ref(false);
            const createError = ref("");
            const targetPageTitle = ref("");
            const targetPageUrl = ref("");

            const api = new mw.Api();

            const dialogTitle = computed(() => {
              if (step.value === 1) return "Generate tracking subpage for AINB";
              if (step.value === 2) return "Select diffs to include";
              return "Page Created";
            });

            const totalSelectedDiffs = computed(() =>
              articleGroups.value.reduce((sum, g) => sum + g.selectedCount, 0)
            );

            const allSelected = computed(
              () =>
                articleGroups.value.length > 0 &&
                articleGroups.value.every((g) => g.allSelected)
            );

            const someSelected = computed(() =>
              articleGroups.value.some((g) => g.someSelected || g.allSelected)
            );

            const currentDate = computed(
              () => new Date().toISOString().split("T")[0]
            );

            const handleDialogClose = () => {
              setTimeout(() => {
                if (currentApp) {
                  currentApp.unmount();
                  currentApp = null;
                  document.getElementById(APP_ID)?.remove();
                }
              }, 100);
            };

            const reset = () => {
              step.value = 1;
              username.value = "";
              articleGroups.value = [];
              error.value = "";
              creating.value = false;
              createError.value = "";
              targetPageTitle.value = "";
              targetPageUrl.value = "";
            };

            const updateGroupSelection = (group) => {
              const selected = group.edits.filter((e) => e.selected).length;
              group.selectedCount = selected;
              group.allSelected = selected === group.edits.length;
              group.someSelected =
                selected > 0 && selected < group.edits.length;
            };

            const toggleArticle = (group) => {
              const newValue = !group.allSelected;
              group.edits.forEach((e) => (e.selected = newValue));
              updateGroupSelection(group);
            };

            const toggleAll = () => {
              const newValue = !allSelected.value;
              articleGroups.value.forEach((g) => {
                g.edits.forEach((e) => (e.selected = newValue));
                updateGroupSelection(g);
              });
            };

            const fetchContributions = async () => {
              loading.value = true;
              error.value = "";
              progress.value = 0;

              try {
                const edits = [];
                let cont = null;

                // check for users w/ too many edits
                const info = await api.get({
                  action: "query",
                  list: "usercontribs",
                  ucnamespace: 0,
                  ucuser: username.value,
                  ucend: "2022-12-01T00:00:00Z",
                  uclimit: 1,
                });

                const count = info.continue?.uccontinue ?? 0;

                if (count > 20000) {
                  if (
                    !confirm(
                      `User has over 20k edits (${count}). Are you sure you want to continue?`
                    )
                  )
                    error.value =
                      "Manually cancelled: User has too many edits.";
                  return;
                } else if (!count) {
                  error.value =
                    "No edits found in the timeframe. Note: the username is case-sensitive.";
                  return;
                }
                normalizedUsername.value = info.query.usercontribs[0].user;
                do {
                  const params = {
                    action: "query",
                    list: "usercontribs",
                    ucnamespace: 0,
                    ucuser: username.value,
                    ucend: "2022-12-01T00:00:00Z",
                    uclimit: "max",
                    ucprop: "ids|title|timestamp|comment|sizediff|tags",
                    ucdir: "older",
                    ...cont,
                  };

                  const res = await api.get(params);
                  if (res.error) throw new Error(res.error.info);

                  edits.push(...res.query.usercontribs);
                  progress.value = edits.length;
                  cont = res.continue;
                } while (cont);

                const validEdits = edits.filter(
                  (e) => !e.tags?.includes("mw-reverted")
                );
                const groups = {};

                validEdits.forEach((e) => {
                  if (!groups[e.title]) {
                    groups[e.title] = {
                      title: e.title,
                      edits: [],
                      allSelected: true,
                      someSelected: false,
                      selectedCount: 0,
                      expanded: true,
                    };
                  }
                  groups[e.title].edits.push({
                    ...e,
                    selected: true,
                    diffLoading: false,
                    diffContent: "",
                    expanded: false,
                  });
                });

                articleGroups.value = Object.values(groups);

                articleGroups.value.forEach((g) => updateGroupSelection(g));

                if (articleGroups.value.length === 0) {
                  error.value =
                    "No contributions found in the specified period.";
                } else {
                  step.value = 2;
                  const pageTitle = DEBUG_MODE
                    ? DEBUG_PAGE
                    : `Wikipedia:WikiProject AI Cleanup/Noticeboard/${currentDate.value} ${normalizedUsername.value}`;
                  targetPageTitle.value = pageTitle;
                  targetPageUrl.value = mw.util.getUrl(pageTitle);
                  nextTick(() => {
                    // enable popups, etc on the diff link
                    const content = document.querySelector(
                      ".ainb-helper .ainb-list"
                    );
                    if (content) {
                      mw.hook("wikipage.content").fire($(content));
                    }
                  });
                }
              } catch (e) {
                error.value = "Error fetching contributions: " + e.message;
                console.error(e);
              } finally {
                loading.value = false;
              }
            };

            const toggleDiff = (edit) => {
              edit.expanded = !edit.expanded;
              if (edit.expanded) {
                loadDiff(edit);
              }
            };

            const loadDiff = async (edit) => {
              if (edit.diffContent || edit.diffLoading) return;

              console.log("Loading diff for revid:", edit.revid);
              edit.diffLoading = true;
              try {
                const res = await api.get({
                  action: "compare",
                  fromrev: edit.revid,
                  torelative: "prev",
                  prop: "diff",
                });
                if (res.compare?.["*"]) {
                  edit.diffContent = `<table class="diff">${res.compare["*"]}</table>`;
                } else {
                  edit.diffContent = "<p>Could not load diff.</p>";
                }
              } catch (e) {
                console.error("Error loading diff:", e);
                edit.diffContent =
                  "<p>Error loading diff: " + e.message + "</p>";
              } finally {
                edit.diffLoading = false;
              }
            };

            const generateReport = async () => {
              const selectedGroups = articleGroups.value
                .map((g) => ({
                  ...g,
                  edits: g.edits.filter((e) => e.selected),
                }))
                .filter((g) => g.edits.length > 0);

              let wikitext = `Relevant report and discussion may be viewable on the talk page.\n\n== Tracking list ==\n{{AIC article list|\n`;

              selectedGroups.forEach((group) => {
                const links = group.edits
                  .map(
                    (e) =>
                      `[[Special:Diff/${e.revid}|(${formatBytes(e.sizediff)})]]`
                  )
                  .join(" ");
                const edit_count = group.edits.length;
                const edit_str = edit_count > 1 ? "edits" : "edit";
                wikitext += `{{AIC article row|article=${group.title}|status=requested|notes=${edit_count} ${edit_str}: ${links}}}\n`;
              });

              wikitext += `}}\n`;
              creating.value = true;
              createError.value = "";
              step.value = 3;

              try {
                await api.postWithEditToken({
                  action: "edit",
                  title: targetPageTitle.value,
                  text: wikitext,
                  summary: `Creating tracking subpage ${APP_AD}`,
                });
              } catch (e) {
                createError.value = "Error creating page: " + e.message;
                console.error(e);
              } finally {
                creating.value = false;
              }
            };

            const getDiffUrl = (revid) =>
              mw.util.getUrl(`Special:Diff/${revid}`);
            const formatBytes = (bytes) =>
              (bytes > 0 ? "+" : "") + (bytes || 0);
            const getSizeClass = (bytes) =>
              bytes > 0 ? "ainb-pos" : bytes < 0 ? "ainb-neg" : "ainb-neu";
            const truncate = (str, n) =>
              str?.length > n ? str.substr(0, n - 1) + "..." : str || "";

            return {
              isOpen,
              step,
              username,
              normalizedUsername,
              loading,
              progress,
              error,
              articleGroups,
              creating,
              createError,
              targetPageTitle,
              targetPageUrl,
              dialogTitle,
              totalSelectedDiffs,
              allSelected,
              someSelected,
              currentDate,
              handleDialogClose,
              reset,
              fetchContributions,
              toggleAll,
              toggleArticle,
              updateGroupSelection,
              generateReport,
              getDiffUrl,
              loadDiff,
              toggleDiff,
              formatBytes,
              getSizeClass,
              truncate,
              ICON_EXPAND,
              ICON_COLLAPSE,
            };
          },
        };

        if (currentApp) {
          currentApp.unmount();
        }
        document.getElementById(APP_ID)?.remove();

        const mountPoint = document.createElement("div");
        mountPoint.id = APP_ID;
        document.body.appendChild(mountPoint);

        currentApp = createMwApp(App);
        currentApp.mount(mountPoint);
      });
  }

  const portletLink = mw.util.addPortletLink(
    "p-tb",
    "#",
    "New AINB tracking",
    "t-ainb-tracking",
    "Generate tracking subpage for AINB"
  );
  $(portletLink).on("click", function (e) {
    e.preventDefault();
    init();
  });

  // icons:
  // workaround to use codex icons in user scripts
  // see [[User:JSherman (WMF)/revertrisk.js#L-102]]

  const ICON_EXPAND = {
    path: "m17.5 4.75-7.5 7.5-7.5-7.5L1 6.25l9 9 9-9z",
    viewBox: "0 0 20 20",
  };

  const ICON_COLLAPSE = {
    path: "m2.5 15.25 7.5-7.5 7.5 7.5 1.5-1.5-9-9-9 9z",
    viewBox: "0 0 20 20",
  };
  // end icons

  // for nicely formatted CSS, see [[User:DVRTed/AINB-helper.css]]
  mw.util.addCSS(
    " .ainb-controls .cdx-checkbox {margin: 0;}.ainb-helper.cdx-dialog__window, .ainb-helper .cdx-dialog__window, .ainb-helper {width: 900px !important;max-width: 90vw !important;}.ainb-dialog-footer .cdx-button {margin: 0 4px;}.ainb-dialog-footer {display: flex;align-items: center;justify-content: space-between;}.ainb-step {padding: 1em 0;max-height: 65vh;overflow-y: auto;}.ainb-subpage-info {padding: 0.75em;background: #f8f9fa;border-left: 3px solid #36c;}.ainb-error {color: #d33;margin-top: 0.5em;padding: 0.5em;background: #fee;border-radius: 2px;}.ainb-loading {text-align: center;}.ainb-controls {display: flex;justify-content: space-between;align-items: center;padding: 0.75em;background: #fbfbfb;margin-bottom: 1em;}.ainb-article-card {border: 2px solid #f7f7f7;border-radius: 4px;margin: 20px 0;overflow: hidden;}.ainb-article-header {padding: 0.75em 1em;background: #fbfbfb;border-bottom: 2px solid #d3d3d3;}.ainb-article-title-row {display: flex;align-items: center;justify-content: space-between;}.ainb-count {color: #858585;font-size: 0.9em;margin: 0 4px;font-weight: normal;}.ainb-diffs {padding: 0.5em;}.ainb-diff-item {border-bottom: 1px solid #d3d3d3;padding: 0.9em 0;}.ainb-diff-header {display: flex;justify-content: space-between;margin-bottom: 0.5em;}.ainb-diff-size {font-weight: bold;margin: 0 1em;}.ainb-diff-link {font-weight: bold;font-size: 1em;}.ainb-pos {color: #027202;}.ainb-neg {color: #830101;}.ainb-neu {color: #4b4f53;}.ainb-time {color: #747980;font-size: 0.85em;}.ainb-comment {color: #202122;font-style: italic;margin-left: 1em;overflow: hidden;text-overflow: ellipsis;}.ainb-custom-accordion {margin-left: 2em;margin-top: 0.5em;border: 1px solid #c8ccd1;border-radius: 2px;}.ainb-accordion-header {display: flex;align-items: center;width: 100%;padding: 8px 12px;background: #f9fbfc;border: none;border-bottom: 1px solid #cbd1d8;cursor: pointer;text-align: left;font-weight: bold;font-size: 0.9em;}.ainb-accordion-header:hover {background: #e8eaee;}.ainb-accordion-icon {margin-right: 0.5em;font-size: 1.2em;}.ainb-accordion-content {padding: 0;}.ainb-diff-loading {padding: 1em;color: #72777d;font-style: italic;text-align: center;}.ainb-diff-content {padding: 0.5em;background: #fff;overflow-x: auto;max-height: 300px;overflow-y: auto;}.ainb-diff-content .diff {width: 100%;border-collapse: collapse;font-size: 0.85em;font-family: monospace;}.ainb-diff-content .diff td {padding: 2px 6px;vertical-align: top;}.ainb-diff-content .diff-addedline {background: #7ef09c;}.ainb-diff-content .diff-deletedline {background: #faa1ac;}.ainb-diff-content .diff-context {background: #f8f9fa;color: #72777d;}.ainb-preview {background: #f8f9fa;padding: 1em;border: 1px solid #eaecf0;border-radius: 2px;max-height: 300px;overflow: auto;font-size: 0.85em;white-space: pre-wrap;}.skin-theme-clientpref-night .ainb-controls, .skin-theme-clientpref-night .ainb-article-header, .skin-theme-clientpref-night .ainb-accordion-header, .skin-theme-clientpref-night .ainb-diff-content, .skin-theme-clientpref-night .ainb-subpage-info {background: #2a2a2a;color: #fff;}.skin-theme-clientpref-night .diff-context {background: #363636;color: #fff;}.skin-theme-clientpref-night .diff-deletedline {background: #a51729;color: #fff;}.skin-theme-clientpref-night .diff-addedline {background: #087c26;color: #fff;}.skin-theme-clientpref-night .ainb-accordion-header:hover {background: #606060;}.skin-theme-clientpref-night .ainb-comment {color: #ffffff;}"
  );
});

//</nowiki>
