import * as vscode from 'vscode';
import * as utils from '../utils';
import { TreeNode } from './searchManager';

export class FileTreeNode implements TreeNode {
    public readonly hasChildren = true;
    public readonly icon = vscode.ThemeIcon.File;

    private _childrenPromise: Promise<TreeNode[]> | undefined;

    constructor(
        readonly uri: vscode.Uri,
        private readonly ranges: vscode.Range[],
        private readonly itemsIcon: vscode.ThemeIcon | undefined,
        public readonly label: string
    ) {
        ranges.sort((a, b) => a.start.compareTo(b.start));
    }

    async getChildren(): Promise<TreeNode[]> {
        if (this._childrenPromise !== undefined) {
            return this._childrenPromise;
        }

        this._childrenPromise = this.loadChildren();
        return this._childrenPromise;
    }

    private async loadChildren(): Promise<TreeNode[]> {
        const document = await vscode.workspace.openTextDocument(this.uri);
        return this.ranges.map((range) => this.loadChild(document, range));
    }

    private loadChild(document: vscode.TextDocument, range: vscode.Range): TreeNode {
        const { before, inside, after } = utils.getPreviewChunks(document, range);

        const label: vscode.TreeItemLabel = {
            label: before + inside + after,
            highlights: [[before.length, before.length + inside.length]]
        };

        return {
            hasChildren: false,
            getChildren: async () => [],
            location: {
                uri: this.uri,
                range: range
            },
            label,
            description: `${range.start.line + 1}:${range.start.character + 1}`,
            icon: this.itemsIcon
        };
    }
}
