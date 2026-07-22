import * as vscode from 'vscode';
import { registerCommands } from './commands';

export interface BacktrailApi {
	globalState: vscode.Memento;
}

export function activate(context: vscode.ExtensionContext): BacktrailApi {
	registerCommands(context);
	return { globalState: context.globalState };
}

export function deactivate() {}
