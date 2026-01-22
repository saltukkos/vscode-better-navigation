import { TrackedPromise } from '../common/trackedPromise';
import { SearchModel } from '../searchProviders/model';
import { SearchResult } from './searchResult';

export interface SearchInstance {
    readonly id: string;
    title: string;
    resultPromise: TrackedPromise<SearchResult>;
    readonly model: SearchModel;
}
