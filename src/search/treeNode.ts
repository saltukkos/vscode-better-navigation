import * as vscode from 'vscode';

export interface TreeNode {
    hasChildren: boolean;
    getChildren(): Promise<TreeNode[]>;

    id: string | undefined;
    label: vscode.TreeItemLabel | string;
    description?: string;
    matchCount?: number;
    icon?: vscode.ThemeIcon;

    uri?: vscode.Uri;
    location?: vscode.Location;
}
