import * as vscode from 'vscode';
import { SearchController, SearchInstance, TreeNode } from './searchManager';

class LoadingTreeNode implements TreeNode {
    public static readonly instance = new LoadingTreeNode();

    public readonly hasChildren = false;
    public readonly label = 'Loading results...';
    public readonly icon = new vscode.ThemeIcon('loading~spin');

    async getChildren(): Promise<TreeNode[]> {
        return [];
    }
}

enum LoadingNodeDisplayState {
    PendingDisplayLoadingNode,
    PendingDisplayEmptyTree,
    LoadingNodeDisplayIsNotNeeded
}

export class SearchView implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable {
    private static readonly treeViewId = 'better-navigation.tree';

    private readonly _disposable: vscode.Disposable;
    private readonly _treeView: vscode.TreeView<TreeNode>;
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | void>();

    private _currentLoadingNodeDisplayState: LoadingNodeDisplayState = LoadingNodeDisplayState.LoadingNodeDisplayIsNotNeeded;
    private _currentDisplayingSearch: SearchInstance | undefined;

    constructor(private readonly _manager: SearchController) {
        this._disposable = vscode.Disposable.from(
            this._onDidChangeTreeData,
            this._treeView = vscode.window.createTreeView(SearchView.treeViewId, { treeDataProvider: this, showCollapseAll: true }),
            this._manager.onDidChangeActiveSearch(() => this.onActiveSearchChanged()),
        );
    }

    public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private async onActiveSearchChanged() {
        const activeSearch = this._manager.activeSearch;
        this._currentDisplayingSearch = activeSearch;

        let nodeToReveal: TreeNode;
        if (activeSearch?.resultPromise.isCompleted && activeSearch.resultPromise.getSyncResult().tree.length > 0) {
            this._currentLoadingNodeDisplayState = LoadingNodeDisplayState.LoadingNodeDisplayIsNotNeeded;
            nodeToReveal = activeSearch.resultPromise.getSyncResult().tree[0];
        }
        else {
            this._currentLoadingNodeDisplayState = LoadingNodeDisplayState.PendingDisplayLoadingNode;
            nodeToReveal = LoadingTreeNode.instance;
        }

        this._onDidChangeTreeData.fire();
        this._treeView.reveal(nodeToReveal, { focus: true });
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
        if (element) {
            return await element.getChildren();
        }

        if (!this._currentDisplayingSearch) {
            return [];
        }

        if (this._currentLoadingNodeDisplayState === LoadingNodeDisplayState.PendingDisplayLoadingNode) {
            // Note: show loading node, it's required to be able to focus the view (we rely on 'reveal' for this node)
            this._currentLoadingNodeDisplayState = LoadingNodeDisplayState.PendingDisplayEmptyTree;
            this._onDidChangeTreeData.fire();
            return [LoadingTreeNode.instance];
        }

        if (this._currentLoadingNodeDisplayState === LoadingNodeDisplayState.PendingDisplayEmptyTree) {
            // Note: if we return the result promise right now, tree view can be not updated yet (depends
            //       on how fast view is shown and rendered, can be ~5-100ms based on local testing),
            //       which leads to the old data being displayed. The only reliable solution I found
            //       is to display an empty tree temporarily (which triggers 'viewsWelcome' display).
            //       So we use 'viewsWelcome' to display a loading state and right after this we will
            //       invalidate the tree once more and then return the actual promise.
            this._currentLoadingNodeDisplayState = LoadingNodeDisplayState.LoadingNodeDisplayIsNotNeeded;
            this._onDidChangeTreeData.fire();
            return [];
        }

        const searchResult = await this._manager.activeSearch?.resultPromise;
        return searchResult?.tree;
    }

    public dispose() {
        this._disposable.dispose();
    }
}
