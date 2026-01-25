import * as assert from 'assert';
import * as vscode from 'vscode';
import { SearchResult } from '../../search/searchResult';
import { FolderTreeNode } from '../../search/folderTreeNode';

suite('SearchResult Test Suite', () => {
	vscode.window.showInformationMessage('Start all SearchResult tests.');

	test('should currently group nested directories without infinite recursion', async () => {
        // Ensure grouping is enabled
        await vscode.workspace.getConfiguration('better-navigation').update('groupByDirectory', true, vscode.ConfigurationTarget.Global);

        // Mock locations representing a deep structure
        // Structure:
        // /root/Folder1/Folder2/Folder4/Folder6/File1.txt
        // /root/Folder1/Folder2/Folder4/Folder7/File2.txt
        
        // We use a common root to simulate a workspace-like structure if running without an open folder
        const rootPath = vscode.Uri.file('/root');
        const file1Uri = vscode.Uri.joinPath(rootPath, 'Folder1/Folder2/Folder4/Folder6/File1.txt');
        const file2Uri = vscode.Uri.joinPath(rootPath, 'Folder1/Folder2/Folder4/Folder7/File2.txt');

        const locations = [
            new vscode.Location(file1Uri, new vscode.Range(0, 0, 0, 0)),
            new vscode.Location(file2Uri, new vscode.Range(0, 0, 0, 0))
        ];

        // Mock asRelativePath to return relative path from /root
        const originalAsRelativePath = vscode.workspace.asRelativePath;
        (vscode.workspace as any).asRelativePath = (uri: vscode.Uri) => {
            if (uri.path.startsWith(rootPath.path)) {
                // Remove /root/ prefix
                // rootPath.path is /root
                // uri.path is /root/Folder1...
                return uri.path.substring(rootPath.path.length + 1);
            }
            return uri.path;
        };

        const searchResult = new SearchResult(locations, undefined);
        const tree = searchResult.tree;
        
        // Top level should be "root" or direct folders if paths are relative. 
        // If asRelativePath returns full path, we expect /root/...
        // But let's verify logic regardless of the absolute root.
        
        // We expect to find Folder1 -> Folder2 -> Folder4 -> [Folder6, Folder7]
        
        // Helper to find child by label
        function findChild(nodes: any[], label: string) {
            return nodes.find(n => n.label === label || n.label.endsWith(label) || n.label === label.replace(/\\/g, '/'));
        }

        // Navigate down
        // Note: The exact root node depends on how asRelativePath behaves in the test environment without workspace.
        // It likely returns the full path. So "root" might be the first folder.
        
        let currentLevel = tree;
        
        // Should traverse down to Folder4
        // Logic might group "root/Folder1/Folder2/Folder4" if they differ? 
        // No, groupPaths logic groups segments.
        
        // Let's traverse recursively to ensure no duplicates and correct structure
        const visitedIds = new Set<string>();
        
        function validateNode(node: any) {
            const id = node.nodeId.toString();
            assert.ok(!visitedIds.has(id), `Duplicate Node ID found: ${id}`);
            visitedIds.add(id);

            if (node instanceof FolderTreeNode) {
                // Check children
                // Access private children via 'children' property which used in constructor but exposed normally via getChildren
                // But in the test we can inspect the array passed to constructor or simulate recursive check
                // searchResult.tree returns constructed nodes. FolderTreeNode stores children.
                // We need to cast or access 'children' which might be private in TS but accessible in JS runtime or via getChildren
                
                // Inspecting via 'children' property if accessible, or we can assume it's passed 
                // The class definition has 'private readonly children: TreeNode[]'
                // We can use (node as any).children
                
                const children = (node as any).children;
                assert.ok(children, `Folder node ${node.label} has no children`);
                for (const child of children) {
                    validateNode(child);
                }
            }
        }

        for (const node of tree) {
            validateNode(node);
        }
        
        // Check specific structure exists basically
        // Since we don't know exact 'asRelativePath' output, we search for 'Folder6'
        
        // Flatten all nodes
        const allNodes: any[] = [];
        function collect(nodes: any[]) {
            for (const n of nodes) {
                allNodes.push(n);
                if ((n as any).children) {
                    collect((n as any).children);
                }
            }
        }
        collect(tree);
        
        const folder6 = allNodes.find(n => n.label === 'Folder6');
        assert.ok(folder6, 'Folder6 not found in tree');
        
        const folder7 = allNodes.find(n => n.label === 'Folder7');
        assert.ok(folder7, 'Folder7 not found in tree');
        
        // Assert their parents are strictly different URIs
        // In the bug, they might have shared same parent URI causing issues?
        // Actually the bug was that Folder4 and Folder6 might get same ID or something.
        
        // Verify Folder6 parent is Folder4
        // We can't easily check parent pointer, but we checked visitedIds -> so IDs are unique.
        
        // Ensure IDs are correct URI based
        // Folder6 URI should end in Folder6
        assert.ok(folder6.resourceUri.toString().endsWith('Folder6'), `Folder6 URI incorrect: ${folder6.resourceUri.toString()}`);
        assert.ok(folder7.resourceUri.toString().endsWith('Folder7'), `Folder7 URI incorrect: ${folder7.resourceUri.toString()}`);
	});
});
