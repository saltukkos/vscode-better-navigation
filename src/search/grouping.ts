export interface GroupNode {
    name: string; // The folder name or flattened path (e.g. "src" or "src/search")
    children: Map<string, GroupNode>;
    files: string[]; // Relative paths or identifiers for files in this folder
}

export function groupPaths(paths: string[]): GroupNode {
    const root: GroupNode = { name: "", children: new Map(), files: [] };

    for (const path of paths) {
        const segments = path.split('/');
        const fileName = segments.pop()!;
        
        let current = root;
        for (const segment of segments) {
            let next = current.children.get(segment);
            if (!next) {
                next = { name: segment, children: new Map(), files: [] };
                current.children.set(segment, next);
            }
            current = next;
        }
        // Store full path so we can look it up later, or store filename if strictly for structure
        // Storing full path (the input string) is safest for lookup in the caller's map.
        current.files.push(path);
    }

    flattenSingleChildFolders(root);

    return root;
}

function flattenSingleChildFolders(node: GroupNode) {
    // Process children first (bottom-up? or top-down? Top-down is easier for merging names)
    // Actually, we need to process children recursively.

    for (const child of node.children.values()) {
        flattenSingleChildFolders(child);
    }

    // Now check if WE are a single child of our parent? No, we transform ourselves if we have single child.
    // Iterating map entries to modify them is tricky.
    // Better approach: Post-process the structure.
    
    // Actually, the previous implementation did it well:
    // When converting to nodes, we looked ahead.
    // Here, let's modify the graph in place?
    // Or just do it like before: The "Node" we return might represent a collapsed chain.
    
    // Let's stick to the previous logic: "flattening" happens when we read the structure, 
    // OR we can compress the graph here.
    // Compressing the graph here:
    
    for (const [name, child] of node.children) {
        // While the child has 0 files and exactly 1 sub-child
        let currentChild = child;
        while (currentChild.files.length === 0 && currentChild.children.size === 1) {
            const nextEntry = currentChild.children.entries().next();
            if(nextEntry.done) {
                 break;
            }
            const [subName, subChild] = nextEntry.value;
            // Merge
            currentChild.name = `${currentChild.name}/${subName}`;
            currentChild.children = subChild.children;
            currentChild.files = subChild.files;
            // Continue checking this same child (now transformed)
            // But wait, we need to update the parent's map?
            // "node.children" still points to "child" object. We just mutated "child".
            // So "child" is now the merged node.
            // Loop continues.
        }
        
        // After flattening this child, ensure we flattened its children too (we did that at start of loop).
    }
}
