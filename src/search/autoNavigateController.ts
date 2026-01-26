import * as vscode from 'vscode';

export class AutoNavigateController implements vscode.Disposable {
    private readonly _statusBarItem: vscode.StatusBarItem;
    private _inProgress: boolean = false;

    constructor() {
        this._statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            1000000
        );
    }

    /**
     * Attempts to auto-navigate to a single search result.
     * Returns true if navigation occurred, false otherwise.
     */
    public async tryAutoNavigate(
        locationsPromise: Promise<vscode.Location[]>
    ): Promise<boolean> {
        if (this._inProgress) {
            return false;
        }

        const config = vscode.workspace.getConfiguration('better-navigation');
        const timeout = config.get<number>('autoNavigateTimeout', 1500);

        if (timeout <= 0) {
            return false;
        }

        this._inProgress = true;
        this.showStatusBar();

        try {
            const result = await Promise.race([
                locationsPromise,
                new Promise<null>(resolve => setTimeout(() => resolve(null), timeout))
            ]);

            if (result === null) {
                return false;
            }

            if (result.length === 1) {
                await this.navigateToLocation(result[0]);
                return true;
            }

            return false;
        } catch (error) {
            return false;
        } finally {
            this._inProgress = false;
            this._statusBarItem.hide();
        }
    }

    private showStatusBar(): void {
        const config = vscode.workspace.getConfiguration('better-navigation');
        const shouldShow = config.get<boolean>('showAutoNavigateCountdown', true);

        if (shouldShow) {
            this._statusBarItem.text = `Waiting for single result $(loading~spin)`;
            // navigate to a setting by click:
            this._statusBarItem.command = {title: 'Open Settings', command: 'workbench.action.openSettings', arguments: ['better-navigation.autoNavigateTimeout']};
            this._statusBarItem.show();
        }
    }

    private async navigateToLocation(location: vscode.Location): Promise<void> {
        await vscode.commands.executeCommand(
            'vscode.open',
            location.uri,
            { selection: location.range }
        );
    }

    public dispose(): void {
        this._statusBarItem.dispose();
    }
}

