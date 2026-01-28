import * as vscode from 'vscode';
import { SearchController } from './searchController';

export class TabView implements vscode.WebviewViewProvider, vscode.Disposable {
    private readonly _disposable: vscode.Disposable;
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _manager: SearchController
    ) {
        this._disposable = vscode.Disposable.from(
            this._manager.onDidUpdateSearchList(() => this.updateView()),
            this._manager.onDidChangeActiveSearch(() => this.updateView()),
            vscode.window.registerWebviewViewProvider('better-navigation.tabs', this),
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('better-navigation.showVisualTabs')) {
                    this.updateShowTabsContextValue();
                }
            })
        );

        this.updateShowTabsContextValue();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'switchTab':
                    {
                        const search = this._manager.searches[data.index];
                        if (search) {
                            this._manager.setActiveSearch(search);
                        }
                        break;
                    }
                case 'closeTab':
                    {
                        const search = this._manager.searches[data.index];
                        if (search) {
                            this._manager.removeSearch(search);
                        }
                        break;
                    }
            }
        });

        this.updateView();
    }

    private updateView() {
        if (this._view) {
            this._view.webview.html = this.getHtmlForWebview(this._view.webview);
        }
    }

    private getHtmlForWebview(webview: vscode.Webview) {
        const tabsHtml = this._manager.searches.map((search, index) => {
            const activeClass = search === this._manager.activeSearch ? 'active' : '';
            const closeButton = `<button class="close-btn" data-index="${index}" title="Close tab">×</button>`;
            return `
                <div class="tab ${activeClass}" data-index="${index}">
                    <div class="tab-content">
                        <span class="tab-title">${this.escapeHtml(search.title)}</span>
                    </div>
                    ${closeButton}
                </div>
            `;
        }).join('');

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Tabs</title>
                <style>
                    body {
                        margin: 0;
                        padding: 0;
                        font-family: var(--vscode-font-family);
                        font-size: var(--vscode-font-size);
                        background-color: var(--vscode-editor-background);
                    }
                    .tabs-container {
                        display: flex;
                        flex-direction: column;
                        overflow-y: auto;
                        background-color: var(--vscode-editor-background);
                        width: 100%;
                        box-sizing: border-box;
                    }
                    .tab {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 8px 12px;
                        cursor: pointer;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        background-color: var(--vscode-sideBar-background);
                        user-select: none;
                        min-width: 0;
                        width: 100%;
                        box-sizing: border-box;
                    }
                    .tab:hover {
                        background-color: var(--vscode-list-hoverBackground);
                    }
                    .tab.active {
                        background-color: var(--vscode-editor-background);
                        border-left: 3px solid var(--vscode-textLink-foreground);
                    }
                    .tab-content {
                        display: flex;
                        align-items: center;
                        flex: 1;
                        min-width: 0;
                    }
                    .tab-title {
                        flex: 1;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        margin-right: 8px;
                    }
                    .close-btn {
                        background: none;
                        border: none;
                        color: var(--vscode-icon-foreground);
                        cursor: pointer;
                        font-size: 18px;
                        line-height: 1;
                        padding: 0 4px;
                        opacity: 0.7;
                        flex-shrink: 0;
                    }
                    .close-btn:hover {
                        opacity: 1;
                        background-color: var(--vscode-button-hoverBackground);
                    }
                </style>
            </head>
            <body>
                <div class="tabs-container">
                    ${tabsHtml}
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    document.querySelectorAll('.tab').forEach(tab => {
                        tab.addEventListener('click', (e) => {
                            if (e.target.classList.contains('close-btn')) {
                                return;
                            }
                            const index = parseInt(tab.dataset.index);
                            vscode.postMessage({ type: 'switchTab', index });
                        });
                    });
                    document.querySelectorAll('.close-btn').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const index = parseInt(btn.dataset.index);
                            vscode.postMessage({ type: 'closeTab', index });
                        });
                    });
                    
                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.type === 'update') {
                            // Update logic here if needed
                        }
                    });
                </script>
            </body>
            </html>`;
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    private updateShowTabsContextValue() {
        const tabViewType = vscode.workspace.getConfiguration('better-navigation').get<string>('tabViewType');
        vscode.commands.executeCommand('setContext', 'better-navigation.showVisualTabs', tabViewType === 'visual');
    }

    public dispose() {
        this._disposable.dispose();
    }
}
