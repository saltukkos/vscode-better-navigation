import * as vscode from 'vscode';
import { TrackedPromise } from '../common/trackedPromise';
import { SearchModel } from '../searchProviders/model';
import { SearchResult } from './searchResult';
import { tryGetSearchTerm } from '../utils';
import { SearchInstance } from './searchInstance';
import { AutoNavigateController } from './autoNavigateController';

export class SearchController implements vscode.Disposable {
    private readonly _searches: SearchInstance[] = [];
    private _activeSearch?: SearchInstance;
    private _searchIdCounter = 0;

    private readonly _onDidChangeActiveSearch = new vscode.EventEmitter<{ searchInstance: SearchInstance, isNewSearch: boolean }>();
    readonly onDidChangeActiveSearch = this._onDidChangeActiveSearch.event;

    private readonly _onDidUpdateSearchList = new vscode.EventEmitter<void>();
    readonly onDidUpdateSearchList = this._onDidUpdateSearchList.event;

    constructor(private readonly _autoNavigateController: AutoNavigateController) {
        this.updateVisibility();
    }

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

        const resolvePromise = search.resolve(location.uri, location.selection);
        const resultPromise = resolvePromise.then(locations => {
            return new SearchResult(locations, search.itemsIcon);
        });

        if (await this._autoNavigateController.tryAutoNavigate(resolvePromise)) {
            return;
        }

        const searchInstance: SearchInstance = {
            id: `${this._searchIdCounter++}`,
            title: `'${searchTerm}' ${search.title.toLowerCase()}`,
            resultPromise: new TrackedPromise(resultPromise),
            model: search
        };

        this._searches.push(searchInstance);
        this._onDidUpdateSearchList.fire();
        this.setActiveSearchInternal(searchInstance, true);
        this.updateVisibility();
    }

    public async rebuildActiveSearchTree() {
        for (const search of this._searches) {
            if (search.resultPromise.isCompleted) {
                search.resultPromise.getSyncResult().clearTreeCache();
            }
        }

        if (!this._activeSearch) {
            return;
        }

        this._onDidChangeActiveSearch.fire({ searchInstance: this._activeSearch, isNewSearch: false });
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
            this.setActiveSearchInternal(next, false);
        }

        this.updateVisibility();
    }

    public setActiveSearch(search: SearchInstance) {
        this.setActiveSearchInternal(search, false);
    }

    private setActiveSearchInternal(search: SearchInstance, isNewSearch: boolean) {
        if (search && !this._searches.includes(search)) {
            throw new Error("Can't set search as active since it is not in the list of searches");
        }

        this._activeSearch = search;
        this._onDidChangeActiveSearch.fire({ searchInstance: search, isNewSearch: isNewSearch });
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
