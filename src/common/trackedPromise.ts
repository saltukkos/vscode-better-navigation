/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Konstantin Saltuk. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class TrackedPromise<T> implements Promise<T> {
    
    private _isCompleted: boolean = false;
    private _result: T | undefined;
    private _error: any;

    readonly [Symbol.toStringTag]: string = 'PromiseWrapper';

    constructor(private readonly _promise: Promise<T>) {
        this._promise.then(
            result => {
                this._isCompleted = true;
                this._result = result;
            },
            err => {
                this._isCompleted = true;
                this._error = err;
            }
        );
    }

    public get isCompleted(): boolean {
        return this._isCompleted;
    }

    public getSyncResult(): T {
        if (!this._isCompleted) {
            throw new Error('Promise is not yet completed');
        }
        if (this._error) {
            throw this._error;
        }
        return this._result!;
    }

    public then<TResult1 = T, TResult2 = never>(
        onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null, 
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
    ): Promise<TResult1 | TResult2> {
        return this._promise.then(onfulfilled, onrejected);
    }

    public catch<TResult = never>(
        onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
    ): Promise<T | TResult> {
        return this._promise.catch(onrejected);
    }

    public finally(onfinally?: (() => void) | null): Promise<T> {
        return this._promise.finally(onfinally);
    }
}
