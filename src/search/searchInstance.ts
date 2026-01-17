import * as vscode from 'vscode';
import { TrackedPromise } from '../common/trackedPromise';
import { SearchModel } from '../searchProviders/model';
import { SearchResult } from './searchResult';

export interface SearchInstance {
    title: string;
    resultPromise: TrackedPromise<SearchResult>;

    readonly resolvePromise: Promise<vscode.Location[]>;
    readonly model: SearchModel;
}
