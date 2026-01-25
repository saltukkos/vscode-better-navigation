import * as vscode from 'vscode';
import * as utils from '../utils';
import { TreeNode } from './treeNode';
import { NodeId } from './nodeId';

export class FolderTreeNode implements TreeNode {
    public readonly hasChildren = true;
    public readonly icon = vscode.ThemeIcon.Folder;
    public readonly label: string;
    public readonly resourceUri: vscode.Uri;
    public readonly description: string;
    public readonly matchCount: number;
    public readonly nodeId: NodeId;

    constructor(
        resourceUri: vscode.Uri,
        label: string,
        private readonly children: TreeNode[]
    ) {
        this.resourceUri = resourceUri;
        this.label = label;
        this.nodeId = new NodeId('folder', this.resourceUri);

        this.matchCount = children.reduce((sum, child) => sum + (child.matchCount ?? 0), 0);
        this.description = utils.getMatchDescription(this.matchCount);
    }

    async getChildren(): Promise<TreeNode[]> {
        return this.children;
    }
}
