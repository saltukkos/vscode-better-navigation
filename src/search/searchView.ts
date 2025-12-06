import * as vscode from 'vscode';
import { SearchController, TreeNode } from './searchManager';

export class SearchView implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable {
    private static readonly treeViewId = 'better-navigation.tree';

    private readonly _disposable: vscode.Disposable;
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | void>();
    public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private readonly _treeView: vscode.TreeView<TreeNode>;

    constructor(private readonly _manager: SearchController) {
        this._disposable = vscode.Disposable.from(
            this._onDidChangeTreeData,
            this._treeView = vscode.window.createTreeView(SearchView.treeViewId, { treeDataProvider: this, showCollapseAll: true }),
            this._manager.onDidChangeActiveSearch(() => this.onActiveSearchChanged()),
        );
    }

    private async onActiveSearchChanged() {
        this._onDidChangeTreeData.fire();
        // const searchResult = await this._manager.activeSearch?.resultPromise;
        // this._treeView.reveal(searchResult!.tree[0], { focus: true });
    }

    public getParent(element: TreeNode): vscode.ProviderResult<TreeNode> {
        return undefined;
    }

    public getTreeItem(element: TreeNode): vscode.TreeItem {
        const item = new vscode.TreeItem(element.label);

        if (element.description !== undefined) {
            item.description = element.description;
        }
        if (element.icon) {
            item.iconPath = element.icon;
        }
        
        if (element.location) {
            item.command = {
                command: 'vscode.open',
                title: 'Open',
                arguments: [element.location.uri, { selection: element.location.range }]
            };
        } else if (element.uri) {
            item.command = {
                command: 'vscode.open',
                title: 'Open',
                arguments: [element.uri]
            };
        }

        // TODO: expand first item after search is completed
        // TODO: keep expanded state when switching between tabs
        item.collapsibleState = element.hasChildren 
            ? vscode.TreeItemCollapsibleState.Collapsed 
            : vscode.TreeItemCollapsibleState.None;

        return item;
    }

    public async getChildren(element?: TreeNode): Promise<TreeNode[] | null | undefined> {
        if (!element) {
            const searchResult = await this._manager.activeSearch?.resultPromise;
            return searchResult?.tree;
        }

        return await element.getChildren();
    }

    public dispose() {
        this._disposable.dispose();
    }
}
