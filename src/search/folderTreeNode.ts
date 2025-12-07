import * as vscode from 'vscode';
import { TreeNode } from './searchManager';

export class FolderTreeNode implements TreeNode {
    public readonly hasChildren = true;
    public readonly icon = vscode.ThemeIcon.Folder;
    public readonly label: string;
    public readonly resourceUri: vscode.Uri;
    
    constructor(
        resourceUri: vscode.Uri,
        label: string,
        private readonly children: TreeNode[]
    ) {
        this.resourceUri = resourceUri;
        this.label = label;
        // Sort children: folders first, then files.
        // We can't easily distinguish types here without instance checks, or we assume caller sorts.
        // Let's sort by label for now to be safe, though usually folders come first.
        // For now, let's assume the caller constructs the children list in the desired order or we sort by label.
        // Standard VSCode behavior: Folders first, alphabetical.
    }

    async getChildren(): Promise<TreeNode[]> {
        return this.children;
    }
}
