import * as vscode from 'vscode';
import { TreeNode } from './treeNode';
import { NodeId } from './nodeId';


export class NoResultsTreeNode implements TreeNode {
    description?: string | undefined;
    uri?: vscode.Uri | undefined;
    location?: vscode.Location | undefined;
    public readonly nodeId = new NodeId('noResults', undefined);
    public readonly hasChildren = false;
    public readonly icon = new vscode.ThemeIcon('search-stop');
    public readonly label = 'No results found';
    public readonly matchCount = 0;
    getChildren(): Promise<TreeNode[]> {
        return Promise.resolve([]);
    }
}
