import * as vscode from 'vscode';
import { SearchController } from './searchManager';
import { TreeNode } from './treeNode';
import { NodeId } from './nodeId';
import { SearchInstance } from './searchInstance';

class LoadingTreeNode implements TreeNode {
    public static readonly instance = new LoadingTreeNode();

    public readonly hasChildren = false;
    public readonly label = 'Loading results...';
    public readonly nodeId = new NodeId('loading', undefined);
    public readonly icon = new vscode.ThemeIcon('loading~spin');

    async getChildren(): Promise<TreeNode[]> {
        return [];
    }
}

class TreeNodeWrapper {
    constructor(
        public readonly parent: TreeNodeWrapper | undefined,
        public readonly node: TreeNode,
        public readonly searchInstance: SearchInstance,
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
    private _currentDisplayingSearchSequenceNumber = 0;

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
        this._currentDisplayingSearchSequenceNumber++;

        let nodeToReveal: TreeNodeWrapper;
        if (activeSearch?.resultPromise.isCompleted && activeSearch.resultPromise.getSyncResult().tree.length > 0) {
            this._currentLoadingNodeDisplayState = LoadingNodeDisplayState.LoadingNodeDisplayIsNotNeeded;
            nodeToReveal = new TreeNodeWrapper(undefined, activeSearch.resultPromise.getSyncResult().tree[0], activeSearch);
        }
        else
        {
            this._currentLoadingNodeDisplayState = LoadingNodeDisplayState.PendingDisplayLoadingNode;
            nodeToReveal = new TreeNodeWrapper(undefined, LoadingTreeNode.instance, activeSearch);
        }

        this._onDidChangeTreeData.fire();
        // Note: this reveal is only to focus the tree view, actual reveal
        //       of the required node (asynchronous) will be done later
        this._treeView.reveal(nodeToReveal, { focus: true });
    }

    public getParent(element: TreeNodeWrapper): vscode.ProviderResult<TreeNodeWrapper> {
        return element.parent;
    }

    public getTreeItem(element: TreeNodeWrapper): vscode.TreeItem {
        const node = element.node;
        const item = new vscode.TreeItem(node.label);
        // Note: append search instance id to the node id in order to disable vsCode's
        //       tree state (expansion and selection) restore when switching between searches.
        item.id = `${element.searchInstance.id}:${node.nodeId.toString()}`;

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
        return searchResult?.isNodeExpanded(element.node.nodeId) ?? false;
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
            return [new TreeNodeWrapper(undefined, LoadingTreeNode.instance, this._currentDisplayingSearch)];
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
        const lastSelectedNodeId = searchResult?.getLastSelectedNode();
        if (lastSelectedNodeId != null) {
            void this.revealNodeWithId(lastSelectedNodeId);
        }
        else {
            void this.revealFirstNode(this._currentDisplayingSearch);
        }

        return searchResult?.tree ? this.wrapNodes(undefined, this._currentDisplayingSearch, searchResult.tree) : undefined;
    }

    private wrapNodes(parent: TreeNodeWrapper | undefined, searchInstance: SearchInstance, nodes: TreeNode[]): TreeNodeWrapper[] {
        return nodes.map((node) => new TreeNodeWrapper(parent, node, searchInstance));
    }

    private onElementExpansionChanged(element: TreeNode, expanded: boolean): void {
        const nodeId = element.nodeId;
        const searchResult = this._currentDisplayingSearch?.resultPromise.getSyncResultOrUndefined();
        searchResult?.setNodeExpanded(nodeId, expanded);
    }

    private onSelectionChanged(selection: readonly TreeNodeWrapper[]): void {
        if (selection.length !== 1) {
            return;
        }

        const nodeId = selection[0].node.nodeId;
        if (nodeId.toString() === LoadingTreeNode.instance.nodeId.toString()) {
            // Note: do not save the selection for 'Loading' node
            return;
        }

        const searchResult = this._currentDisplayingSearch?.resultPromise.getSyncResultOrUndefined();
        searchResult?.setLastSelectedNode(nodeId);
    }

    private async revealNodeWithId(id: NodeId): Promise<void> {
        const searchSequenceNumberBeforeRevealStarted = this._currentDisplayingSearchSequenceNumber;
        const searchInstance = this._currentDisplayingSearch;
        const searchResult = await searchInstance?.resultPromise;

        const nodes = await searchResult?.getPathFromRoot(id);
        if (nodes == null || this._currentDisplayingSearchSequenceNumber !== searchSequenceNumberBeforeRevealStarted) {
            return;
        }

        let lastParent: TreeNodeWrapper | undefined;
        for (const node of nodes) {
            lastParent = new TreeNodeWrapper(lastParent, node, searchInstance!);
        }

        if (lastParent != null) {
            this._treeView.reveal(lastParent, { focus: true });
        }
    }

    private async revealFirstNode(searchInstance: SearchInstance): Promise<void> {
        const nextNode = await this.navigate(undefined, searchInstance, true);
        if (nextNode) {
            this._treeView.reveal(nextNode, { focus: true });
        }
    }

    public async expandAll(): Promise<void> {
        if (!this._currentDisplayingSearch) {
            return;
        }

        const result = this._currentDisplayingSearch.resultPromise.getSyncResultOrUndefined();
        if (!result) {
            return;
        }

        await result.expandAll();
        this._currentLoadingNodeDisplayState = LoadingNodeDisplayState.PendingDisplayLoadingNode;
        this._onDidChangeTreeData.fire();
    }

    public async goToFollowingResult(forward: boolean): Promise<void> {
        if (!this._currentDisplayingSearch) {
            return;
        }

        const selection = this._treeView.selection.length === 1 ? this._treeView.selection[0] : undefined;
        const nextNode = await this.navigate(selection, this._currentDisplayingSearch, forward);
        if (nextNode) {
             this._treeView.reveal(nextNode, { select: true });

             const treeItem = this.getTreeItem(nextNode);
             if (treeItem.command) {
                 await vscode.commands.executeCommand(treeItem.command.command, ...(treeItem.command.arguments || []));
             }
        }
    }

    private async navigate(currentNode: TreeNodeWrapper | undefined, searchInstance: SearchInstance, forward: boolean): Promise<TreeNodeWrapper | undefined> {
        const searchResult = await searchInstance.resultPromise;

        if (!searchResult) {
            return undefined;
        }

        if (!currentNode) {
            const roots = searchResult.tree;
            if (roots.length > 0) {
                const root = forward ? roots[0] : roots[roots.length - 1];
                return this.getDeepestNode(new TreeNodeWrapper(undefined, root, searchInstance), forward);
            }

            return undefined;
        }

        if (forward && currentNode.node.hasChildren) {
            const children = await searchResult.getChildren(currentNode.node);
            if (children.length > 0) {
                return this.getDeepestNode(currentNode, true);
            }
        }

        let current: TreeNodeWrapper | undefined = currentNode;
        while (current) {
            const parent: TreeNodeWrapper | undefined = current.parent;
            const siblings = parent ? await searchResult.getChildren(parent.node) : searchResult.tree;

            const index = siblings.findIndex(s => s.nodeId.toString() === current!.node.nodeId.toString());
            
            if (index !== -1) {
                if (forward) {
                     if (index + 1 < siblings.length) {
                        return this.getDeepestNode(new TreeNodeWrapper(parent, siblings[index + 1], searchInstance), true);
                    }
                } else {
                    if (index - 1 >= 0) {
                        return this.getDeepestNode(new TreeNodeWrapper(parent, siblings[index - 1], searchInstance), false);
                    }
                }
            }

            current = parent;
        }

        return undefined;
    }

    private async getDeepestNode(node: TreeNodeWrapper, start: boolean): Promise<TreeNodeWrapper> {
        const searchResult = await node.searchInstance.resultPromise;

        let current = node;
        while (current.node.hasChildren) {
            const children = await searchResult.getChildren(current.node);
            if (!children || children.length === 0) {
                return current;
            }
            const nextNode = start ? children[0] : children[children.length - 1];
            current = new TreeNodeWrapper(current, nextNode, node.searchInstance);
        }

        return current;
    }


    public dispose() {
        this._disposable.dispose();
    }
}
