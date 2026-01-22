import * as vscode from 'vscode';
import { DataStorage } from './dataStorage';

export interface TreeNode {
    hasChildren: boolean;
    getChildren(dataStorage: DataStorage): Promise<TreeNode[]>;

    id: string;
    label: vscode.TreeItemLabel | string;
    description?: string;
    matchCount?: number;
    icon?: vscode.ThemeIcon;

    uri?: vscode.Uri;
    location?: vscode.Location;
}
