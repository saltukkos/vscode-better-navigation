import * as vscode from 'vscode';
import { SearchModel } from '../searchProviders/model';

export class AutoNavigateController implements vscode.Disposable {
    private readonly _statusBarItem: vscode.StatusBarItem;
    private _inProgress: boolean = false;
    private _currentDecorationType: vscode.TextEditorDecorationType | undefined;
    private _notificationTimeout: NodeJS.Timeout | undefined;
    private readonly _disposables: vscode.Disposable[] = [];

    constructor() {
        this._statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            1000000
        );
        this._disposables.push(this._statusBarItem);
        this._disposables.push(vscode.commands.registerCommand('better-navigation.hideAutoNavigateNotification', () => this.hideNotification()));
    }

    /**
     * Attempts to auto-navigate to a single search result.
     * Returns true if navigation occurred, false otherwise.
     */
    public async tryAutoNavigate(search: SearchModel, locationsPromise: Promise<vscode.Location[]>, originalLocation: { uri: vscode.Uri, selection: vscode.Selection }): Promise<boolean> {
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

            if (result.length === 0) {
                this.showNotification(`No ${search.title.toLowerCase()} found`, originalLocation);
                return true;
            }

            if (result.length === 1) {
                const location = result[0];
                const isSameLocation = location.uri.toString() === originalLocation.uri.toString() && location.range.contains(originalLocation.selection.active);
                
                if (isSameLocation) {
                    this.showNotification(`No other ${search.title.toLowerCase()} found`, originalLocation);
                    return true;
                }

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

    private showNotification(message: string, originalLocation: { uri: vscode.Uri, selection: vscode.Selection }): void {
        this.hideNotification();

        // Do not show anything if active editor has changed
        if (vscode.window.activeTextEditor?.document.uri.toString() !== originalLocation.uri.toString()) {
            return;
        }

        const range: vscode.Range = originalLocation.selection;
        const doc = vscode.window.activeTextEditor?.document;
        let end = range.end;
        let isEndOfLine = false;

        const wordRange = doc?.getWordRangeAtPosition(range.start);
        if (wordRange) {
            const lineText = doc.lineAt(end.line).text;

            // text after the word end on the same line
            const after = lineText.slice(wordRange.end.character);

            // distance to next whitespace; if none, distance to end-of-line
            const ws = after.match(/\s/);
            const distanceToStop = ws?.index ?? after.length;

            if (distanceToStop > 0 && distanceToStop <= 2) {
                end = wordRange.end.translate(0, distanceToStop);
                isEndOfLine = distanceToStop === after.length;
            } else {
                end = wordRange.end;
            }
        }

        const decoration = {
            contentText: ` ${message} ​`,
            color: new vscode.ThemeColor('editorHoverWidget.foreground'),
            backgroundColor: new vscode.ThemeColor('editorHoverWidget.background'),
            border: '1px solid',
            borderColor: new vscode.ThemeColor('inputValidation.infoBorder'),
            margin: '10px',
        };

        this._currentDecorationType = vscode.window.createTextEditorDecorationType({
            before: isEndOfLine ? decoration : undefined,
            after: isEndOfLine ? undefined : decoration,
        });
        
        vscode.window.activeTextEditor?.setDecorations(this._currentDecorationType, [{
            range: new vscode.Range(end, end),
        }]);

        vscode.commands.executeCommand('setContext', 'better-navigation.isAutoNavigateNotificationVisible', true);

        this._notificationTimeout = setTimeout(() => {
            this.hideNotification();
        }, 2000);
    }

    private hideNotification(): void {
        if (this._currentDecorationType) {
            this._currentDecorationType.dispose();
            this._currentDecorationType = undefined;
        }
        if (this._notificationTimeout) {
            clearTimeout(this._notificationTimeout);
            this._notificationTimeout = undefined;
        }
        vscode.commands.executeCommand('setContext', 'better-navigation.isAutoNavigateNotificationVisible', false);
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
        this.hideNotification();
        this._disposables.forEach(d => d.dispose());
    }
}

