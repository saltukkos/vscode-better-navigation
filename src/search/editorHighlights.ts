// TODO: rewrite it. Should track active editor
// import * as vscode from 'vscode';
// import { SearchController } from './searchManager';

// export class EditorHighlights implements vscode.Disposable {

//     private readonly _decorationType = vscode.window.createTextEditorDecorationType({
//         backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
//         rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
//         overviewRulerLane: vscode.OverviewRulerLane.Center,
//         overviewRulerColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
//     });

//     private readonly disposables: vscode.Disposable[] = [];
//     private readonly _ignore = new Set<string>();

//     constructor(private readonly _view: vscode.TreeView<any>, private readonly _manager: SearchController) {
//         this.disposables.push(
//             vscode.workspace.onDidChangeTextDocument(e => this._ignore.add(e.document.uri.toString())),
//             vscode.window.onDidChangeActiveTextEditor(() => _view.visible && this.update()),
//             _view.onDidChangeVisibility(e => e.visible ? this._show() : this._hide()),
//             _view.onDidChangeSelection(() => {
//                 if (_view.visible) {
//                     this.update();
//                 }
//             })
//         );
//         this._show();
//     }

//     dispose() {
//         vscode.Disposable.from(...this.disposables).dispose();
//         for (const editor of vscode.window.visibleTextEditors) {
//             editor.setDecorations(this._decorationType, []);
//         }
//     }

//     private _show(): void {
//         const { activeTextEditor: editor } = vscode.window;
//         if (!editor || !editor.viewColumn) {
//             return;
//         }
//         if (this._ignore.has(editor.document.uri.toString())) {
//             return;
//         }
        
//         const state = this._manager.activeState;
//         if (!state) {
//             return;
//         }

//         const ranges = state.results
//             .filter(r => r.location.uri.toString() === editor.document.uri.toString())
//             .map(r => r.location.range);

//         if (ranges) {
//             editor.setDecorations(this._decorationType, ranges);
//         }
//     }

//     private _hide(): void {
//         for (const editor of vscode.window.visibleTextEditors) {
//             editor.setDecorations(this._decorationType, []);
//         }
//     }

//     update(): void {
//         this._hide();
//         this._show();
//     }
// }
