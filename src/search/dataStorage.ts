
export class DataKey<T> {
    constructor(public readonly key: string) {}
}

export class DataStorage {
    private readonly _storage = new Map<string, any>();

    public getOrCreate<T>(key: DataKey<T>, discriminator: string, factory: () => T): T {
        const fullKey = `${key.key}:${discriminator}`;
        if (!this._storage.has(fullKey)) {
            this._storage.set(fullKey, factory());
        }
        return this._storage.get(fullKey);
    }

    public clear(): void {
        this._storage.clear();
    }
}
