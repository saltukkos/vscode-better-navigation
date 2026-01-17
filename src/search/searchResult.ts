import * as vscode from 'vscode';
import * as utils from '../utils';
import type { TreeNode } from './searchManager';
import { GroupNode, groupPaths } from './grouping';
import { FileTreeNode } from './fileTreeNode';
import { FolderTreeNode } from './folderTreeNode';
import { NoResultsTreeNode } from './noResultsTreeNode';

export class SearchResult {
    private _resultsByFile: Map<string, vscode.Range[]> | undefined;
    private _originalUri: Map<string, vscode.Uri> | undefined;
    private _treeCache: TreeNode[] | undefined;

    constructor(
        private readonly _locations: vscode.Location[],
        private readonly _icon: vscode.ThemeIcon | undefined
    ) {}

    public clearTreeCache(): void {
        this._treeCache = undefined;
    }

    public get resultsByFile(): Map<string, vscode.Range[]> {
        this.ensureResultsByFile();
        return this._resultsByFile!;
    }

    public get tree(): TreeNode[] {
        if (!this._treeCache) {
            this._treeCache = this.buildTree();
        }

        return this._treeCache;
    }

    private ensureResultsByFile(): void {
        if (this._resultsByFile) {
            return;
        }

        const resultsByFile = new Map<string, vscode.Range[]>();
        const originalUri = new Map<string, vscode.Uri>();

        for (const result of this._locations) {
            originalUri.set(result.uri.toString(), result.uri);
            utils.getOrCreate(resultsByFile, result.uri.toString(), () => []).push(result.range);
        }

        this._resultsByFile = resultsByFile;
        this._originalUri = originalUri;
    }

    private buildTree(): TreeNode[] {

        this.ensureResultsByFile();
        const resultsByFile = this._resultsByFile!;
        const originalUri = this._originalUri!;

        if (resultsByFile.size === 0) {
            return [new NoResultsTreeNode()];
        }

        const shouldGroup = vscode.workspace.getConfiguration('better-navigation').get<boolean>('groupByDirectory', true);

        if (!shouldGroup) {
            const sortedEntries = Array.from(resultsByFile.entries()).sort((a, b) => {
                return a[0].localeCompare(b[0]);
            });

            return sortedEntries.map(([fileUriStr, ranges]) => {
                const uri = originalUri.get(fileUriStr)!;
                const label = vscode.workspace.asRelativePath(uri);
                return new FileTreeNode(uri, ranges, this._icon, label);
            });
        }

        const fileUriStrings = Array.from(resultsByFile.keys());
        const relativeToUri = new Map<string, string>();
        const paths: string[] = [];

        for (const uriStr of fileUriStrings) {
            const uri = originalUri.get(uriStr)!;
            const relative = vscode.workspace.asRelativePath(uri);
            relativeToUri.set(relative, uriStr);
            paths.push(relative);
        }

        const rootGroup = groupPaths(paths);
        return this.convertGroupToNodes(rootGroup, relativeToUri, resultsByFile, originalUri);
    }

    private convertGroupToNodes(
        group: GroupNode,
        relativeToUri: Map<string, string>,
        resultsByFile: Map<string, vscode.Range[]>,
        originalUri: Map<string, vscode.Uri>
    ): TreeNode[] {
        const nodes: TreeNode[] = [];

        const sortedChildren = Array.from(group.children.values()).sort((a, b) => a.name.localeCompare(b.name));
        for (const childGroup of sortedChildren) {
            const childrenNodes = this.convertGroupToNodes(childGroup, relativeToUri, resultsByFile, originalUri);
            const firstFile = this.findFirstFileInGroup(childGroup);

            let folderUri = vscode.Uri.file('');
            if (firstFile) {
                const uriStr = relativeToUri.get(firstFile);
                if (uriStr) {
                    const fileUri = originalUri.get(uriStr)!;
                    folderUri = vscode.Uri.joinPath(fileUri, '..');
                }
            }

            nodes.push(new FolderTreeNode(folderUri, childGroup.name, childrenNodes));
        }

        const sortedFiles = [...group.files].sort((a, b) => {
            const nameA = a.split('/').pop()!;
            const nameB = b.split('/').pop()!;
            return nameA.localeCompare(nameB);
        });

        for (const relativePath of sortedFiles) {
            const uriStr = relativeToUri.get(relativePath)!;
            const uri = originalUri.get(uriStr)!;
            const ranges = resultsByFile.get(uriStr)!;
            const fileName = utils.getFileName(uri);
            nodes.push(new FileTreeNode(uri, ranges, this._icon, fileName));
        }

        return nodes;
    }

    private findFirstFileInGroup(group: GroupNode): string | undefined {
        if (group.files.length > 0) {
            return group.files[0];
        }
        for (const child of group.children.values()) {
            const f = this.findFirstFileInGroup(child);
            if (f) {
                return f;
            }
        }

        return undefined;
    }
}
