/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Konstantin Saltuk. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class TabsViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'better-navigation.tabs';

	private _view?: vscode.WebviewView;
	private _tabs: Array<{ id: string; title: string; active: boolean }> = [];
	private _onTabSwitch = new vscode.EventEmitter<string>();
	private _onTabClose = new vscode.EventEmitter<string>();

	public readonly onTabSwitch = this._onTabSwitch.event;
	public readonly onTabClose = this._onTabClose.event;

	constructor(private readonly _extensionUri: vscode.Uri) {
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(data => {
			switch (data.type) {
				case 'switchTab':
					this._onTabSwitch.fire(data.tabId);
					break;
				case 'closeTab':
					this._onTabClose.fire(data.tabId);
					break;
			}
		});
	}

	public updateTabs(tabs: Array<{ id: string; title: string; active: boolean }>) {
		this._tabs = tabs;
		if (this._view) {
			this._view.webview.html = this._getHtmlForWebview(this._view.webview);
		}
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const tabsHtml = this._tabs.map(tab => {
			const activeClass = tab.active ? 'active' : '';
			const closeButton = `<button class="close-btn" data-tab-id="${tab.id}" title="Close tab">×</button>`;
			return `
				<div class="tab ${activeClass}" data-tab-id="${tab.id}">
					<div class="tab-content">
						<span class="tab-title">${this._escapeHtml(tab.title)}</span>
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
							const tabId = tab.dataset.tabId;
							vscode.postMessage({ type: 'switchTab', tabId });
						});
					});
					document.querySelectorAll('.close-btn').forEach(btn => {
						btn.addEventListener('click', (e) => {
							e.stopPropagation();
							const tabId = btn.dataset.tabId;
							vscode.postMessage({ type: 'closeTab', tabId });
						});
					});
				</script>
			</body>
			</html>`;
	}

	private _escapeHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}
}

