import * as vscode from 'vscode';
import { TrackedPromise } from '../common/trackedPromise';
import { SearchModel } from '../searchProviders/model';
import { SearchExecutor } from './searchExecutor';
import { tryGetSearchTerm } from '../utils';

export interface TreeNode {
    hasChildren: boolean;
    getChildren(): Promise<TreeNode[]>;

    label: vscode.TreeItemLabel | string;
    description?: string;
    icon?: vscode.ThemeIcon;

    uri?: vscode.Uri;
    location?: vscode.Location;
}

export interface SearchInstance {
    title: string;
    resultPromise: TrackedPromise<SearchResult>;
}

export interface SearchResult {
    resultsByFile: Map<string, vscode.Range[]>;
    tree: TreeNode[];
}

export class SearchController implements vscode.Disposable {
    private readonly _searches: SearchInstance[] = [];
    private _activeSearch?: SearchInstance;

    private readonly _onDidChangeActiveSearch = new vscode.EventEmitter<SearchInstance | undefined>();
    readonly onDidChangeActiveSearch = this._onDidChangeActiveSearch.event;

    private readonly _onDidUpdateSearchList = new vscode.EventEmitter<void>();
    readonly onDidUpdateSearchList = this._onDidUpdateSearchList.event;

    private readonly _searchExecutor = new SearchExecutor();

    public get activeSearch(): SearchInstance | undefined {
        return this._activeSearch;
    }

    public get searches(): ReadonlyArray<SearchInstance> {
        return this._searches;
    }

    public async runSearch(search: SearchModel) {
        const location = this.getTargetLocation();
        if (!location) {
            return;
        }
        
        const searchTerm = await tryGetSearchTerm(location.uri, location.selection.active);
        if (!searchTerm) {
            return;
        }

        const searchInstance: SearchInstance = {
            title: `'${searchTerm}' ${search.title.toLowerCase()}`,
            resultPromise: new TrackedPromise(this._searchExecutor.runSearch(search, location.uri, location.selection)),
        };

        this._searches.push(searchInstance);
        this._onDidUpdateSearchList.fire();
        this.setActiveSearch(searchInstance);
        this.updateVisibility();
    }

    private getTargetLocation(): { uri: vscode.Uri, selection: vscode.Selection } | undefined {
        if (vscode.window.activeTextEditor) {
            return {
                uri: vscode.window.activeTextEditor.document.uri,
                selection: vscode.window.activeTextEditor.selection
            };
        }

        return undefined;
    }

    public removeSearch(search: SearchInstance) {
        const index = this._searches.indexOf(search);
        if (index === -1) {
            return;
        }

        this._searches.splice(index, 1);
        this._onDidUpdateSearchList.fire();

        if (this._activeSearch === search) {
            const next = this._searches[this._searches.length - 1];
            this.setActiveSearch(next);
        }

        this.updateVisibility();
    }

    public setActiveSearch(search: SearchInstance) {
        if (search && !this._searches.includes(search)) {
            throw new Error("Can't set search as active since it is not in the list of searches");
        }

        this._activeSearch = search;
        this._onDidChangeActiveSearch.fire(search);
    }

    private updateVisibility() {
        const hasSearches = this._searches.length > 0;
        vscode.commands.executeCommand('setContext', 'better-navigation.hasSearches', hasSearches);
    }

    public dispose() {
        this._searches.length = 0;
        this._onDidChangeActiveSearch.dispose();
        this._onDidUpdateSearchList.dispose();
        this.updateVisibility();
    }
}
