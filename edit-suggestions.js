// experimenting w/ [[:mw:VisualEditor/Suggestion Mode/Model-generated editing suggestions]]
// shows list of suggestions in a dialog when available
// (ONLY for enwiki)

(async () => {
    const page_id = mw.config.get('wgArticleId');
    const namespace = mw.config.get('wgNamespaceNumber');
    if (!page_id || namespace !== 0) return;

    mw.util.addCSS(`
.es-experiment-item { margin: 5px 0 9px 0; padding-bottom: 12px; border-bottom: 1px solid #f0f2f6ff; }
.es-experiment-title { font-weight: bold; color: #202122; margin-bottom: 4px; }
.es-experiment-desc { color: #333638ff; }
.es-experiment-meta { font-size: 0.8em; color: #72777d; margin-top: 4px; }
.es-experiment-s-btn { margin-left: 12px; font-size: 0.6em; }
`);

    const res = await fetch('https://api.wikimedia.org/service/lw/inference/v1/models/editing-suggestions:predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wiki_id: 'enwiki', page_id: page_id })
    });
    const { suggestions = [] } = await res.json();
    if (!suggestions.length) return;

    await mw.loader.using([
        'oojs-ui-core',
        'oojs-ui-windows',
        'oojs-ui.styles.icons-interactions',
    ]);

    const $content = $('<div>');

    suggestions.forEach((s) => {
        const $title = $('<div>').addClass('es-experiment-title').text(s.title);
        const $desc = $('<div>').addClass('es-experiment-desc').text(s.description);
        const $meta = $('<div>').addClass('es-experiment-meta').text(
            `ID: ${s.suggestion_id} | Type: ${s.suggestion_type} | Revision: ${s.revision_id}`
        );

        $('<div>').addClass('es-experiment-item').append($title, $desc, $meta).appendTo($content);
    });

    const btn = new OO.ui.ButtonWidget({
        label: `${suggestions.length} edit suggestions`,
        icon: 'lightbulb',
        framed: false,
        flags: ['progressive']
    });

    const wm = new OO.ui.WindowManager();
    $(document.body).append(wm.$element);

    btn.on('click', () => {
        const dialog = new OO.ui.MessageDialog();
        wm.addWindows([dialog]);
        wm.openWindow(dialog, {
            title: 'Edit Suggestions',
            message: $content,
            size: 'medium',
            actions: [{ action: 'accept', label: 'Close', flags: 'primary' }]
        });
    });

    $('#firstHeading').append(btn.$element.addClass('es-experiment-s-btn'));
})();