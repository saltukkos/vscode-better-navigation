import * as vscode from 'vscode';
import * as utils from '../utils';
import { SearchResult, TreeNode } from './searchManager';
import { SearchModel } from '../searchProviders/model';
import { GroupNode, groupPaths } from './grouping';
import { FileTreeNode } from './fileTreeNode';
import { FolderTreeNode } from './folderTreeNode';

export class SearchExecutor {
    async resolveSearch(search: SearchModel, uri: vscode.Uri, selection: vscode.Selection): Promise<vscode.Location[]> {
        return search.resolve(uri, selection);
    }

    public buildTree(searchResults: vscode.Location[], icon: vscode.ThemeIcon | undefined): { tree: TreeNode[], resultsByFile: Map<string, vscode.Range[]> } {
        var resultsByFile = new Map<string, vscode.Range[]>();
        var originalUri = new Map<string, vscode.Uri>();
    
        for (const result of searchResults) {
            originalUri.set(result.uri.toString(), result.uri);
            utils.getOrCreate(resultsByFile, result.uri.toString(), () => []).push(result.range);
        }

        const shouldGroup = vscode.workspace.getConfiguration('better-navigation').get<boolean>('groupByDirectory', true);

        let tree: TreeNode[];

        if (!shouldGroup) {
            const sortedEntries = Array.from(resultsByFile.entries()).sort((a, b) => {
                return a[0].localeCompare(b[0]);
            });
            tree = sortedEntries.map(([fileUriStr, ranges]) => {
                const uri = originalUri.get(fileUriStr)!;
                const label = vscode.workspace.asRelativePath(uri);
                return new FileTreeNode(uri, ranges, icon, label);
            });
        } else {
            // Get all paths relative to workspace to group them
            // We need a map back from relative path to full URI string or just use the map we have.
            // But grouping works on strings.
            const fileUriStrings = Array.from(resultsByFile.keys());
            // We need relative paths for grouping logic?
            // Yes, grouping logic expects "src/search/foo.ts".
            
            // 1. Create mapping from relative path to UriString (for lookup)
            const relativeToUri = new Map<string, string>();
            const paths: string[] = [];
            
            for (const uriStr of fileUriStrings) {
                const uri = originalUri.get(uriStr)!;
                const relative = vscode.workspace.asRelativePath(uri);
                relativeToUri.set(relative, uriStr);
                paths.push(relative);
            }

            const rootGroup = groupPaths(paths);
            tree = this.convertGroupToNodes(rootGroup, relativeToUri, resultsByFile, originalUri, icon);
        }

        return {
            resultsByFile: resultsByFile,
            tree: tree
        }
    }

    private convertGroupToNodes(
        group: GroupNode,
        relativeToUri: Map<string, string>,
        resultsByFile: Map<string, vscode.Range[]>,
        originalUri: Map<string, vscode.Uri>,
        icon: vscode.ThemeIcon | undefined
    ): TreeNode[] {
        const nodes: TreeNode[] = [];

        // 1. Folders first
        // Sort children by name
        const sortedChildren = Array.from(group.children.values()).sort((a, b) => a.name.localeCompare(b.name));
        
        for (const childGroup of sortedChildren) {
            const childrenNodes = this.convertGroupToNodes(childGroup, relativeToUri, resultsByFile, originalUri, icon);
            // We need a URI for the folder.
            // We can pick any file in it and find its parent?
            // Or just use a dummy one?
            // We need it for context menu (copy path etc)? 
            // Previous logic: deepUri = parent of first file.
            
            const firstFile = this.findFirstFileInGroup(childGroup);
            let folderUri = vscode.Uri.file(''); // Fallback
            if (firstFile) {
                const uriStr = relativeToUri.get(firstFile);
                if (uriStr) {
                   const fileUri = originalUri.get(uriStr)!;
                   // Use the name to determine how many levels up?
                   // No, that's brittle with flattening.
                   // Actually, FolderTreeNode just needs *A* uri?
                   // If we have "src/search", and file is "src/search/foo.ts", we want "src/search".
                   // But "foo.ts" is just a child.
                   // Let's reconstruct the URI from relative path? 
                   // Or just `joinPath`?
                   // We don't have the workspace folder easily here without more context.
                   // But we have the file URI.
                   // A flattened folder "search/test" (under src) 
                   // If file is ".../src/search/test/file.ts"
                   // We want ".../src/search/test".
                   // If we know the file URI, and we know the file's name... 
                   // We can assume the structure matches.
                   
                   // Simplest: Find a file, get its dir. 
                   // If flattened, we might need to go up multiple levels? 
                   // No, the group structure reflects the actual folder structure (compressed).
                   // Wait, if we have "src/search" as one node. 
                   // And we have file ".../src/search/file.ts". 
                   // The parent of file is ".../src/search". Matches.
                   
                   folderUri = vscode.Uri.joinPath(fileUri, '..');
                }
            }

            nodes.push(new FolderTreeNode(folderUri, childGroup.name, childrenNodes));
        }

        // 2. Files second
        // Sort files by name
        const sortedFiles = group.files.sort((a, b) => {
             // a and b are relative paths. Get filenames.
             const nameA = a.split('/').pop()!;
             const nameB = b.split('/').pop()!;
             return nameA.localeCompare(nameB);
        });

        for (const relativePath of sortedFiles) {
             const uriStr = relativeToUri.get(relativePath)!;
             const uri = originalUri.get(uriStr)!;
             const ranges = resultsByFile.get(uriStr)!;
             const fileName = utils.getFileName(uri);
             nodes.push(new FileTreeNode(uri, ranges, icon, fileName));
        }

        return nodes;
    }

    private findFirstFileInGroup(group: GroupNode): string | undefined {
        if (group.files.length > 0) {
            return group.files[0];
        }
        for (const child of group.children.values()) {
            const f = this.findFirstFileInGroup(child);
            if (f) return f;
        }

        return undefined;
    }
}

