import * as vscode from 'vscode';
import * as utils from '../utils';
import { SearchResult, TreeNode } from './searchManager';
import { SearchModel } from '../searchProviders/model';
import { FileTreeNode } from './fileTreeNode';

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export class SearchExecutor {
    async runSearch(search: SearchModel, uri: vscode.Uri, selection: vscode.Selection): Promise<SearchResult> {
        const searchResults = await search.resolve(uri, selection);
        var resultsByFile = new Map<string, vscode.Range[]>();
        var originalUri = new Map<string, vscode.Uri>();
    
        for (const result of searchResults) {
            originalUri.set(result.uri.toString(), result.uri);
            utils.getOrCreate(resultsByFile, result.uri.toString(), () => []).push(result.range);
        }

        const sortedEntries = Array.from(resultsByFile.entries()).sort((a, b) => {
            return a[0].localeCompare(b[0]);
        });

        const tree: TreeNode[] = [];
        for (const [fileUri, ranges] of sortedEntries) {
            tree.push(new FileTreeNode(originalUri.get(fileUri)!, ranges, search.itemsIcon));
        }

        return {
            resultsByFile: resultsByFile,
            tree: tree
        }
    }
}

