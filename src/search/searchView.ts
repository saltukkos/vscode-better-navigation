import * as vscode from 'vscode';
import { SearchController } from './searchManager';
import { TreeNode } from './treeNode';
import { SearchInstance } from './searchInstance';

class LoadingTreeNode implements TreeNode {
    public static readonly instance = new LoadingTreeNode();

    public readonly hasChildren = false;
    public readonly label = 'Loading results...';
    public readonly id = 'loadingTreeNode';
    public readonly icon = new vscode.ThemeIcon('loading~spin');

    async getChildren(): Promise<TreeNode[]> {
        return [];
    }
}

class TreeNodeWrapper {
    constructor(
        public readonly node: TreeNode,
        public readonly isFirst: boolean,
        public readonly searchInstance: SearchInstance,
        // TODO: we can store parent here for 'reveal' to work
    ) {}
}

enum LoadingNodeDisplayState {
    PendingDisplayLoadingNode,
    PendingDisplayEmptyTree,
    LoadingNodeDisplayIsNotNeeded
}

export class SearchView implements vscode.TreeDataProvider<TreeNodeWrapper>, vscode.Disposable {
    private static readonly treeViewId = 'better-navigation.tree';

    private readonly _disposable: vscode.Disposable;
    private readonly _treeView: vscode.TreeView<TreeNodeWrapper>;
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeNodeWrapper | undefined | void>();

    private _currentLoadingNodeDisplayState: LoadingNodeDisplayState = LoadingNodeDisplayState.LoadingNodeDisplayIsNotNeeded;
    private _currentDisplayingSearch: SearchInstance | undefined;

    constructor(searchController: SearchController) {
        this._disposable = vscode.Disposable.from(
            this._onDidChangeTreeData,
            this._treeView = vscode.window.createTreeView(SearchView.treeViewId, { treeDataProvider: this, showCollapseAll: true }),
            this._treeView.onDidExpandElement(e => this.onElementExpansionChanged(e.element.node, true)),
            this._treeView.onDidCollapseElement(e => this.onElementExpansionChanged(e.element.node, false)),
            this._treeView.onDidChangeSelection(e => this.onSelectionChanged(e.selection)),
            searchController.onDidChangeActiveSearch(({ searchInstance, isNewSearch }) => this.onActiveSearchChanged(searchInstance, isNewSearch)),
        );
    }

    public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private async onActiveSearchChanged(activeSearch: SearchInstance, isNewSearch: boolean) {
        this._currentDisplayingSearch = activeSearch;

        let nodeToReveal: TreeNodeWrapper;
        if (activeSearch?.resultPromise.isCompleted && activeSearch.resultPromise.getSyncResult().tree.length > 0) {
            this._currentLoadingNodeDisplayState = LoadingNodeDisplayState.LoadingNodeDisplayIsNotNeeded;
            nodeToReveal = new TreeNodeWrapper(activeSearch.resultPromise.getSyncResult().tree[0], true, activeSearch);
        }
        else
        {
            this._currentLoadingNodeDisplayState = LoadingNodeDisplayState.PendingDisplayLoadingNode;
            nodeToReveal = new TreeNodeWrapper(LoadingTreeNode.instance, false, activeSearch);
        }

        this._onDidChangeTreeData.fire();
        // Note: this reveal is only to focus the tree view, actual reveal
        //       of the required node (asynchronous) will be done later
        this._treeView.reveal(nodeToReveal, { focus: true });
    }

    public getParent(element: TreeNodeWrapper): vscode.ProviderResult<TreeNodeWrapper> {
        return undefined;
    }

    public getTreeItem(element: TreeNodeWrapper): vscode.TreeItem {
        const node = element.node;
        const item = new vscode.TreeItem(node.label);
        // Note: append search instance id to the node id in order to disable vsCode's
        //       tree state (expansion and selection) restore when switching between searches.
        item.id = `${element.searchInstance.id}:${node.id}`;

        if (node.description !== undefined) {
            item.description = node.description;
        }
        if (node.icon) {
            item.iconPath = node.icon;
        }
        
        if (node.location) {
            item.command = {
                command: 'vscode.open',
                title: 'Open',
                arguments: [node.location.uri, { selection: node.location.range }]
            };
        } else if (node.uri) {
            item.command = {
                command: 'vscode.open',
                title: 'Open',
                arguments: [node.uri]
            };
            item.resourceUri = node.uri;
        }

        if (!node.hasChildren) {
            item.collapsibleState = vscode.TreeItemCollapsibleState.None;
        } else {
            item.collapsibleState = this.shouldExpandNode(element)
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.Collapsed;
        }

        return item;
    }

    private shouldExpandNode(element: TreeNodeWrapper): boolean {
        // TODO: expand if the only child (but avoid problems when loading is asynchronous,
        //       in this case old tree will be displayed, unless all children are loaded)
        const searchResult = this._currentDisplayingSearch?.resultPromise.getSyncResultOrUndefined();
        return searchResult?.isNodeExpanded(element.node.id) ?? false;
    }

    public async getChildren(element?: TreeNodeWrapper): Promise<TreeNodeWrapper[] | null | undefined> {
        if (element) {
            const searchResult = await element.searchInstance.resultPromise;
            const children = await searchResult.getChildren(element.node);
            return this.wrapNodes(element, element.searchInstance, children);
        }

        if (!this._currentDisplayingSearch) {
            return [];
        }

        if (this._currentLoadingNodeDisplayState === LoadingNodeDisplayState.PendingDisplayLoadingNode) {
            // Note: show loading node, it's required to be able to focus the view (we rely on 'reveal' for this node)
            this._currentLoadingNodeDisplayState = LoadingNodeDisplayState.PendingDisplayEmptyTree;
            this._onDidChangeTreeData.fire();
            return [new TreeNodeWrapper(LoadingTreeNode.instance, false, this._currentDisplayingSearch)];
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

        const searchResult = await this._currentDisplayingSearch.resultPromise;
        return searchResult?.tree ? this.wrapNodes(undefined, this._currentDisplayingSearch, searchResult.tree) : undefined;
    }

    private wrapNodes(element: TreeNodeWrapper | undefined, searchInstance: SearchInstance, nodes: TreeNode[]): TreeNodeWrapper[] {
        return nodes.map((node, index) => new TreeNodeWrapper(node, index === 0 && (element == null || element.isFirst), searchInstance));
    }

    private onElementExpansionChanged(element: TreeNode, expanded: boolean): void {
        const nodeId = element.id;
        if (nodeId == null) {
            return;
        }

        const searchResult = this._currentDisplayingSearch?.resultPromise.getSyncResultOrUndefined();
        searchResult?.setNodeExpanded(nodeId, expanded);
    }

    private onSelectionChanged(selection: readonly TreeNodeWrapper[]): void {
        if (selection.length !== 1) {
            return;
        }

        const nodeId = selection[0].node.id;
        if (nodeId == null) {
            return;
        }

        const searchResult = this._currentDisplayingSearch?.resultPromise.getSyncResultOrUndefined();
        searchResult?.setLastSelectedNode(nodeId);
    }

    public dispose() {
        this._disposable.dispose();
    }
}
