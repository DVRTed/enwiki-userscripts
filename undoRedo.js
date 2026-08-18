// adds Undo and Redo buttons to the source editor's toolbar
// (tested w/ codemirror 6)
(async () => {
    const require = await mw.loader.using([
        'ext.wikiEditor',
        'ext.CodeMirror.lib',
        'oojs-ui.styles.icons-editing-core'
    ])

    const cm_commands = require('ext.CodeMirror.lib');
    let cm;

    mw.hook('ext.CodeMirror.ready').add(instance => {
        cm = instance;
    });

    function undo_or_redo(command, $textarea) {
        if (cm) {
            if (command === "redo") cm_commands.redo(cm.view);
            else cm_commands.undo(cm.view)
        } else {
            // fallback if cm not found
            const textarea = $textarea.get(0);
            textarea.focus();
            document.execCommand(command);
        }
    }

    mw.hook('wikiEditor.toolbarReady').add($textarea => {
        $textarea.wikiEditor('addToToolbar', {
            section: 'main',
            group: 'insert',
            tools: {
                custom_undo: {
                    label: 'Undo',
                    type: 'button',
                    oouiIcon: 'undo',
                    action: {
                        type: 'callback',
                        execute: () => undo_or_redo("undo", $textarea)
                    }
                },
                custom_redo: {
                    label: 'Redo',
                    type: 'button',
                    oouiIcon: 'redo',
                    action: {
                        type: 'callback',
                        execute: () => undo_or_redo("redo", $textarea)
                    }
                }
            }
        });
    });
})();