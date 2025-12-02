/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Modified by Konstantin Saltuk. All modifications licensed under the MIT License.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { EditorHighlights } from '../highlights';
import { Navigation } from '../navigation';
import { SymbolItemDragAndDrop, SymbolTreeInput, SymbolTreeModel } from './model';
import { ContextKey, tryGetSearchTerm, WordAnchor } from '../utils';
import { TabsViewProvider } from './tabs';


interface SearchTab {
	readonly id: string;
	readonly input: SymbolTreeInput<unknown>;
	readonly title: string;
	model?: SymbolTreeModel<unknown>;
	modelPromise?: Promise<SymbolTreeModel<unknown> | undefined>;
	highlights?: EditorHighlights<unknown>;
	sessionDisposable?: vscode.Disposable;
}

export class SymbolsTree {

	readonly viewId = 'better-navigation.tree';

	private readonly _ctxIsActive = new ContextKey<boolean>('reference-list.isActive');
	private readonly _ctxHasResult = new ContextKey<boolean>('reference-list.hasResult');
	private readonly _ctxInputSource = new ContextKey<string>('reference-list.source');
	private readonly _ctxActiveTabId = new ContextKey<string>('reference-list.activeTabId');

	private readonly _history = new TreeInputHistory(this);
	private readonly _provider = new TreeDataProviderDelegate();
	private readonly _dnd = new TreeDndDelegate();
	private readonly _tree: vscode.TreeView<unknown>;
	private readonly _navigation: Navigation;

	private _tabs = new Map<string, SearchTab>();
	private _activeTabId?: string;
	private _tabCounter = 0;
	private _tabsViewProvider?: TabsViewProvider;

	constructor(context: vscode.ExtensionContext) {
		this._tree = vscode.window.createTreeView<unknown>(this.viewId, {
			treeDataProvider: this._provider,
			showCollapseAll: true,
			dragAndDropController: this._dnd
		});
		this._navigation = new Navigation(this._tree);
		
		// Register tabs view
		const tabsProvider = new TabsViewProvider(context.extensionUri);
		context.subscriptions.push(
			vscode.window.registerWebviewViewProvider(TabsViewProvider.viewType, tabsProvider)
		);
		this._tabsViewProvider = tabsProvider;
		
		// Handle tab events
		tabsProvider.onTabSwitch(tabId => this._switchToTab(tabId));
		tabsProvider.onTabClose(tabId => this._closeTab(tabId));
		
		// Listen for configuration changes
		context.subscriptions.push(
			vscode.workspace.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration('better-navigation.tabViewType')) {
					this._updateTabButtons();
				}
			})
		);
		
		this._registerTabCommands();
	}

	dispose(): void {
		this._history.dispose();
		this._tree.dispose();
		for (const tab of this._tabs.values()) {
			tab.sessionDisposable?.dispose();
			tab.highlights?.dispose();
		}
		this._tabs.clear();
	}

	getInput(): SymbolTreeInput<unknown> | undefined {
		const tab = this._activeTabId ? this._tabs.get(this._activeTabId) : undefined;
		return tab?.input;
	}

	getActiveTab(): SearchTab | undefined {
		return this._activeTabId ? this._tabs.get(this._activeTabId) : undefined;
	}

	getTabs(): SearchTab[] {
		return Array.from(this._tabs.values());
	}

	async setInput(input: SymbolTreeInput<unknown>) {
		const word = await tryGetSearchTerm(input.location.uri, input.location.range.start);
		if (!word) {
			return;
		}
		
		// Format title as 'word' title (lowercased)
		const formattedTitle = `'${word}' ${input.title.toLocaleLowerCase()}`;

		// Create a new tab for this search
		const tabId = `tab-${++this._tabCounter}`;
		const tab: SearchTab = {
			id: tabId,
			input,
			title: formattedTitle
		};

		// Add tab immediately - it should appear right away
		this._tabs.set(tabId, tab);
		this._activeTabId = tabId;
		this._ctxActiveTabId.set(tabId);
		this._ctxInputSource.set(input.contextValue);
		this._ctxIsActive.set(true);
		this._ctxHasResult.set(true);
		
		// Update tabs view immediately so the new tab appears
		this._updateTabButtons();
		
		// Focus the tree view
		vscode.commands.executeCommand(`${this.viewId}.focus`);

		// Set initial UI state
		this._tree.title = formattedTitle;
		this._tree.message = undefined;

		// Start loading the model in the background (don't await here)
		this._loadModelForTab(tabId);
	}

	private async _loadModelForTab(tabId: string): Promise<void> {
		const tab = this._tabs.get(tabId);
		if (!tab) {
			return;
		}

		// Start resolving the model - store the promise so we can track loading state
		const modelPromise = Promise.resolve(tab.input.resolve()).then(model => model ?? undefined);
		tab.modelPromise = modelPromise;

		// Update tree data provider if this is the active tab (to show loading state)
		const isActive = this._activeTabId === tabId;
		if (isActive) {
			this._provider.update(modelPromise.then(model => model?.provider ?? this._history));
			this._dnd.update(modelPromise.then(model => model?.dnd));
		}

		// Wait for model to resolve (this continues even if we switch tabs)
		const model = await modelPromise;
		
		// Check if tab still exists (might have been closed)
		if (!this._tabs.has(tabId)) {
			// Tab was closed, dispose model if it exists
			if (model && typeof model.dispose === 'function') {
				model.dispose();
			}
			return;
		}
		
		if (!model) {
			// Model resolution failed
			tab.modelPromise = undefined;
			// Only close if this is the active tab
			if (this._activeTabId === tabId) {
				this._closeTab(tabId);
			}
			return;
		}

		// Store the model
		tab.model = model;
		tab.modelPromise = undefined;
		this._history.add(tab.input);

		// Set up highlights and listeners
		const disposables: vscode.Disposable[] = [];

		// editor highlights - always set up, even if tab is not active
		let highlights: EditorHighlights<unknown> | undefined;
		if (model.highlights) {
			highlights = new EditorHighlights(this._tree, model.highlights);
			disposables.push(highlights);
			tab.highlights = highlights;
		}

		// listener - always set up, even if tab is not active
		if (model.provider.onDidChangeTreeData) {
			disposables.push(model.provider.onDidChangeTreeData(() => {
				if (this._activeTabId === tabId) {
					this._tree.title = tab.title;
					this._tree.message = model.message;
					highlights?.update();
				}
			}));
		}
		if (typeof model.dispose === 'function') {
			disposables.push(new vscode.Disposable(() => model.dispose!()));
		}
		tab.sessionDisposable = vscode.Disposable.from(...disposables);

		// Update UI if this is the active tab
		if (this._activeTabId === tabId) {
			await this._showTabContent(tabId);
		}
	}

	private async _showTabContent(tabId: string): Promise<void> {
		const tab = this._tabs.get(tabId);
		if (!tab || !tab.model) {
			return;
		}

		this._tree.message = tab.model.message;

		// navigation - update the main navigation instance
		this._navigation.update(tab.model.navigation);

		// Update tree data provider
		this._provider.update(Promise.resolve(tab.model.provider));
		this._dnd.update(Promise.resolve(tab.model.dnd));

		// reveal & select
		const selection = tab.model.navigation?.nearest(tab.input.location.uri, tab.input.location.range.start);
		if (selection && this._tree.visible) {
			await this._tree.reveal(selection, { select: true, focus: true, expand: true });
		}

		// Update highlights
		tab.highlights?.update();

		// Update tabs view
		this._updateTabButtons();
	}

	clearInput(): void {
		// Clear the active tab
		if (this._activeTabId) {
			this._closeTab(this._activeTabId);
		}
	}

	private _closeTab(tabId: string): void {
		const tab = this._tabs.get(tabId);
		if (!tab) {
			return;
		}

		tab.sessionDisposable?.dispose();
		tab.highlights?.dispose();
		this._tabs.delete(tabId);

		if (this._activeTabId === tabId) {
			// Switch to another tab or clear
			const remainingTabs = Array.from(this._tabs.keys());
			if (remainingTabs.length > 0) {
				this._switchToTab(remainingTabs[remainingTabs.length - 1]);
			} else {
				this._activeTabId = undefined;
				this._ctxActiveTabId.reset();
				this._ctxHasResult.set(false);
				this._ctxInputSource.reset();
				this._tree.title = vscode.l10n.t('References');
				this._tree.message = this._history.size === 0
					? vscode.l10n.t('No results.')
					: vscode.l10n.t('No results. Try running a previous search again:');
				this._provider.update(Promise.resolve(this._history));
				this._navigation.update(undefined);
			}
		}
		this._updateTabButtons();
	}

	private async _switchToTab(tabId: string): Promise<void> {
		const tab = this._tabs.get(tabId);
		if (!tab) {
			return;
		}

		this._activeTabId = tabId;
		this._ctxActiveTabId.set(tabId);
		this._ctxInputSource.set(tab.input.contextValue);
		this._ctxIsActive.set(true);
		this._ctxHasResult.set(true);

		// Update title immediately
		this._tree.title = tab.title;

		// If model is still loading, show loading state and wait for it
		if (tab.modelPromise && !tab.model) {
			this._tree.message = undefined;
			// Show loading state
			this._provider.update(tab.modelPromise.then(model => model?.provider ?? this._history));
			this._dnd.update(tab.modelPromise.then(model => model?.dnd));
			
			// Wait for the model to finish loading
			await tab.modelPromise;
			
			// Check if we're still on this tab and tab still exists
			if (this._activeTabId !== tabId || !this._tabs.has(tabId)) {
				return;
			}
			
			// If model failed to load, close the tab
			if (!tab.model) {
				this._closeTab(tabId);
				return;
			}
		}

		// Show the tab content (model exists or was just loaded)
		if (tab.model) {
			await this._showTabContent(tabId);
		} else {
			// No model and no promise - this shouldn't happen, but handle gracefully
			this._tree.message = vscode.l10n.t('No results.');
			this._provider.update(Promise.resolve(this._history));
			this._navigation.update(undefined);
			this._updateTabButtons();
		}

		vscode.commands.executeCommand(`${this.viewId}.focus`);
	}

	closeActiveTab(): void {
		if (this._activeTabId) {
			this._closeTab(this._activeTabId);
		}
	}

	private async _refreshTab(tabId: string): Promise<void> {
		const tab = this._tabs.get(tabId);
		if (!tab) {
			return;
		}

		// Dispose old model and highlights
		tab.sessionDisposable?.dispose();
		tab.highlights?.dispose();
		if (tab.model && typeof tab.model.dispose === 'function') {
			tab.model.dispose();
		}
		tab.model = undefined;
		tab.modelPromise = undefined;
		tab.highlights = undefined;
		tab.sessionDisposable = undefined;

		// Update UI if this is the active tab
		const isActive = this._activeTabId === tabId;
		if (isActive) {
			this._tree.title = tab.title;
			this._tree.message = undefined;
		}

		// Reload the model in the background
		this._loadModelForTab(tabId);
	}

	private _updateTabButtons(): void {
		// Update view title to show active tab and count
		const activeTab = this.getActiveTab();
		if (activeTab && this._tabs.size > 1) {
			this._tree.title = `${activeTab.title} (${this._tabs.size} tabs)`;
		} else if (activeTab) {
			this._tree.title = activeTab.title;
		}
		// Update context for view title buttons
		vscode.commands.executeCommand('setContext', 'better-navigation.tabCount', this._tabs.size);
		vscode.commands.executeCommand('setContext', 'better-navigation.hasMultipleTabs', this._tabs.size > 1);
		
		// Update tabs view based on setting
		const config = vscode.workspace.getConfiguration('better-navigation');
		const tabViewType = config.get<string>('tabViewType', 'visual');
		const showVisualTabs = tabViewType === 'visual';
		
		vscode.commands.executeCommand('setContext', 'better-navigation.showVisualTabs', showVisualTabs);
		
		// Update tabs view if visual tabs are enabled
		if (this._tabsViewProvider && this._tabs.size > 0 && showVisualTabs) {
			const tabs = Array.from(this._tabs.values()).map(tab => ({
				id: tab.id,
				title: tab.title,
				active: tab.id === this._activeTabId
			}));
			this._tabsViewProvider.updateTabs(tabs);
		}
	}

	private _registerTabCommands(): void {
		vscode.commands.registerCommand('better-navigation.switchTab', (tabId: string) => {
			this._switchToTab(tabId);
		});

		vscode.commands.registerCommand('better-navigation.closeTab', (tabId: string) => {
			this._closeTab(tabId);
		});

		vscode.commands.registerCommand('better-navigation.closeAllTabs', () => {
			const tabIds = Array.from(this._tabs.keys());
			for (const tabId of tabIds) {
				this._closeTab(tabId);
			}
		});

		vscode.commands.registerCommand('better-navigation.switchToTab', async () => {
			const tabs = Array.from(this._tabs.values());
			if (tabs.length === 0) {
				return;
			}
			interface TabPick extends vscode.QuickPickItem {
				tab: SearchTab;
			}
			const picks = tabs.map((tab): TabPick => ({
				label: tab.title,
				description: vscode.workspace.asRelativePath(tab.input.location.uri),
				detail: tab.model ? tab.model.message : undefined,
				picked: tab.id === this._activeTabId,
				tab
			}));
			const pick = await vscode.window.showQuickPick(picks, { 
				placeHolder: vscode.l10n.t('Select tab to switch to'),
				canPickMany: false
			});
			if (pick) {
				this._switchToTab(pick.tab.id);
			}
		});

		// Override refresh to refresh active tab
		vscode.commands.registerCommand('better-navigation.refresh', async () => {
			const activeTab = this.getActiveTab();
			if (activeTab) {
				await this._refreshTab(activeTab.id);
			}
		});

		vscode.commands.registerCommand('better-navigation.closeActiveTab', () => {
			this.closeActiveTab();
		});

		vscode.commands.registerCommand('better-navigation.showTabsQuickPick', () => {
			// This is the same as switchToTab, but with a different name for the context menu
			vscode.commands.executeCommand('better-navigation.switchToTab');
		});
	}
}

// --- tree data

interface ActiveTreeDataProviderWrapper {
	provider: Promise<vscode.TreeDataProvider<any>>;
}

class TreeDataProviderDelegate implements vscode.TreeDataProvider<undefined> {

	provider?: Promise<vscode.TreeDataProvider<any>>;

	private _sessionDispoables?: vscode.Disposable;
	private _onDidChange = new vscode.EventEmitter<any>();

	readonly onDidChangeTreeData = this._onDidChange.event;

	update(provider: Promise<vscode.TreeDataProvider<any>>) {

		this._sessionDispoables?.dispose();
		this._sessionDispoables = undefined;

		this._onDidChange.fire(undefined);

		this.provider = provider;

		provider.then(value => {
			if (this.provider === provider && value.onDidChangeTreeData) {
				this._sessionDispoables = value.onDidChangeTreeData(this._onDidChange.fire, this._onDidChange);
			}
		}).catch(err => {
			this.provider = undefined;
			console.error(err);
		});
	}

	async getTreeItem(element: unknown) {
		this._assertProvider();
		return (await this.provider).getTreeItem(element);
	}

	async getChildren(parent?: unknown | undefined) {
		this._assertProvider();
		return (await this.provider).getChildren(parent);
	}

	async getParent(element: unknown) {
		this._assertProvider();
		const provider = await this.provider;
		return provider.getParent ? provider.getParent(element) : undefined;
	}

	private _assertProvider(): asserts this is ActiveTreeDataProviderWrapper {
		if (!this.provider) {
			throw new Error('MISSING provider');
		}
	}
}

// --- tree dnd

class TreeDndDelegate implements vscode.TreeDragAndDropController<undefined> {

	private _delegate: SymbolItemDragAndDrop<undefined> | undefined;

	readonly dropMimeTypes: string[] = [];

	readonly dragMimeTypes: string[] = ['text/uri-list'];

	update(delegate: Promise<SymbolItemDragAndDrop<unknown> | undefined>) {
		this._delegate = undefined;
		delegate.then(value => this._delegate = value);
	}

	handleDrag(source: undefined[], data: vscode.DataTransfer) {
		if (this._delegate) {
			const urls: string[] = [];
			for (const item of source) {
				const uri = this._delegate.getDragUri(item);
				if (uri) {
					urls.push(uri.toString());
				}
			}
			if (urls.length > 0) {
				data.set('text/uri-list', new vscode.DataTransferItem(urls.join('\r\n')));
			}
		}
	}

	handleDrop(): void | Thenable<void> {
		throw new Error('Method not implemented.');
	}
}

// --- history

class HistoryItem {

	readonly description: string;

	constructor(
		readonly key: string,
		readonly word: string,
		readonly anchor: WordAnchor,
		readonly input: SymbolTreeInput<unknown>,
	) {
		this.description = `${vscode.workspace.asRelativePath(input.location.uri)} • ${input.title.toLocaleLowerCase()}`;
	}
}

class TreeInputHistory implements vscode.TreeDataProvider<HistoryItem> {

	private readonly _onDidChangeTreeData = new vscode.EventEmitter<HistoryItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private readonly _disposables: vscode.Disposable[] = [];
	private readonly _ctxHasHistory = new ContextKey<boolean>('reference-list.hasHistory');
	private readonly _inputs = new Map<string, HistoryItem>();

	constructor(private readonly _tree: SymbolsTree) {

		this._disposables.push(
			vscode.commands.registerCommand('better-navigation.clear', () => _tree.clearInput()),
			vscode.commands.registerCommand('better-navigation.clearHistory', () => {
				this.clear();
				_tree.clearInput();
			}),
			vscode.commands.registerCommand('better-navigation.refind', (item) => {
				if (item instanceof HistoryItem) {
					this._reRunHistoryItem(item);
				}
			}),
			// vscode.commands.registerCommand('better-navigation.refresh', () => {
			// 	const item = Array.from(this._inputs.values()).pop();
			// 	if (item) {
			// 		this._reRunHistoryItem(item);
			// 	}
			// }),
			vscode.commands.registerCommand('_better-navigation.showHistoryItem', async (item) => {
				if (item instanceof HistoryItem) {
					const position = item.anchor.guessedTrackedPosition() ?? item.input.location.range.start;
					await vscode.commands.executeCommand('vscode.open', item.input.location.uri, { selection: new vscode.Range(position, position) });
				}
			}),
			vscode.commands.registerCommand('better-navigation.pickFromHistory', async () => {
				interface HistoryPick extends vscode.QuickPickItem {
					item: HistoryItem;
				}
				const entries = await this.getChildren();
				const picks = entries.map((item): HistoryPick => ({
					label: item.word,
					description: item.description,
					item
				}));
				const pick = await vscode.window.showQuickPick(picks, { placeHolder: vscode.l10n.t('Select previous reference search') });
				if (pick) {
					this._reRunHistoryItem(pick.item);
				}
			}),
		);
	}

	dispose(): void {
		vscode.Disposable.from(...this._disposables).dispose();
		this._onDidChangeTreeData.dispose();
	}

	private _reRunHistoryItem(item: HistoryItem): void {
		this._inputs.delete(item.key);
		const newPosition = item.anchor.guessedTrackedPosition();
		let newInput = item.input;
		// create a new input when having a tracked position which is
		// different than the original position.
		if (newPosition && !item.input.location.range.start.isEqual(newPosition)) {
			newInput = item.input.with(new vscode.Location(item.input.location.uri, newPosition));
		}
		this._tree.setInput(newInput);
	}

	async add(input: SymbolTreeInput<unknown>) {

		const doc = await vscode.workspace.openTextDocument(input.location.uri);

		const anchor = new WordAnchor(doc, input.location.range.start);
		const range = doc.getWordRangeAtPosition(input.location.range.start) ?? doc.getWordRangeAtPosition(input.location.range.start, /[^\s]+/);
		const word = range ? doc.getText(range) : '???';

		const item = new HistoryItem(JSON.stringify([range?.start ?? input.location.range.start, input.location.uri, input.title]), word, anchor, input);
		// use filo-ordering of native maps
		this._inputs.delete(item.key);
		this._inputs.set(item.key, item);
		this._ctxHasHistory.set(true);
	}

	clear(): void {
		this._inputs.clear();
		this._ctxHasHistory.set(false);
		this._onDidChangeTreeData.fire(undefined);
	}

	get size() {
		return this._inputs.size;
	}

	// --- tree data provider

	getTreeItem(item: HistoryItem): vscode.TreeItem {
		const result = new vscode.TreeItem(item.word);
		result.description = item.description;
		result.command = { command: '_better-navigation.showHistoryItem', arguments: [item], title: vscode.l10n.t('Rerun') };
		result.collapsibleState = vscode.TreeItemCollapsibleState.None;
		result.contextValue = 'history-item';
		return result;
	}

	getChildren() {
		return Promise.all([...this._inputs.values()].reverse());
	}

	getParent() {
		return undefined;
	}
}
