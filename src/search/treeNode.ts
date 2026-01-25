import * as vscode from 'vscode';
import { DataStorage } from './dataStorage';
import { NodeId } from './nodeId';

export interface TreeNode {
    hasChildren: boolean;
    getChildren(dataStorage: DataStorage): Promise<TreeNode[]>;

    nodeId: NodeId;
    label: vscode.TreeItemLabel | string;
    description?: string;
    matchCount?: number;
    icon?: vscode.ThemeIcon;

    uri?: vscode.Uri;
    location?: vscode.Location;
}
