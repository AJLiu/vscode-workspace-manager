// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { HiddenFileExplorerProvider, HiddenFileNode } from './hiddenFileTreeProvider';
import { HiddenFileManager } from './hiddenFileManager';
import { ProfileListProvider } from './profileListProvider';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

	await vscode.commands.executeCommand('setContext', 'workspace-manager.browser.showAll', true);

	const hiddenFileExplorerProvider = new HiddenFileExplorerProvider();
	const profileListProvider = new ProfileListProvider();
	const hiddenFileManager = new HiddenFileManager(context, hiddenFileExplorerProvider, profileListProvider);
	hiddenFileExplorerProvider.register();
	profileListProvider.register();

    /**************************************
     * File Browser commands
     **************************************/
	context.subscriptions.push(vscode.commands.registerCommand(
		'workspace-manager.browser.showFile',
		(input) => hiddenFileManager.showFile(input)
	));
	context.subscriptions.push(vscode.commands.registerCommand(
		'workspace-manager.browser.hideFile',
		(input) => hiddenFileManager.hideFile(input)
	));
	context.subscriptions.push(vscode.commands.registerCommand(
		'workspace-manager.browser.hideSiblings',
		(input) => hiddenFileManager.hideSiblings(input)
	));
	context.subscriptions.push(vscode.commands.registerCommand(
		'workspace-manager.browser.refresh',
		() => hiddenFileManager.refreshFiles()
	));
	context.subscriptions.push(vscode.commands.registerCommand(
		'workspace-manager.browser.resetFiles',
		() => hiddenFileManager.reset()
	));
	context.subscriptions.push(vscode.commands.registerCommand(
		'workspace-manager.browser.toggleHiddenOff',
		async () => {
			hiddenFileExplorerProvider.showHidden = false;
			await vscode.commands.executeCommand('setContext', 'workspace-manager.browser.showAll', false);
			hiddenFileExplorerProvider.refresh();
		}
	));
	context.subscriptions.push(vscode.commands.registerCommand(
		'workspace-manager.browser.toggleHiddenOn',
		async () => {
			hiddenFileExplorerProvider.showHidden = true;
			await vscode.commands.executeCommand('setContext', 'workspace-manager.browser.showAll', true);
			hiddenFileExplorerProvider.refresh();
		}
	));

    /**************************************
     * Profile Switcher commands
     **************************************/
	context.subscriptions.push(vscode.commands.registerCommand(
		'workspace-manager.profiles.create',
		async () => {
			const id = await vscode.window.showInputBox({
				prompt: "Id of the new profile to create"
			});
			if (id !== undefined) {
				await hiddenFileManager.switchProfile(id);
			}
		}
	));
	context.subscriptions.push(vscode.commands.registerCommand(
		'workspace-manager.profiles.switch',
		async (profileId: string | undefined) => {
			if (profileId === undefined) {
				const config = vscode.workspace.getConfiguration('workspace-manager');
				profileId = await vscode.window.showQuickPick(
					Object.keys(config.get<Record<string, any>>('profiles') || {}),
				);
			}
			if (profileId !== undefined) {
				await hiddenFileManager.switchProfile(profileId);
			}
		}
	));
	context.subscriptions.push(vscode.commands.registerCommand(
		'workspace-manager.profiles.delete',
		async (profileId: string | undefined) => {
			if (profileId === undefined) {
				const config = vscode.workspace.getConfiguration('workspace-manager');
				profileId = await vscode.window.showQuickPick(
					Object.keys(config.get<Record<string, any>>('profiles') || {}),
				);
			}
			if (profileId !== undefined) {
				await hiddenFileManager.deleteProfile(profileId);
			}
		}
	));
	context.subscriptions.push(vscode.commands.registerCommand(
		'workspace-manager.profiles.copy',
		async (profileId: string) => {
			const config = vscode.workspace.getConfiguration('workspace-manager');
			const newProfileId = await vscode.window.showInputBox({
				prompt: "Id of the new profile to create"
			});
			if (newProfileId === undefined || profileId === undefined) {
				return;
			}
			await hiddenFileManager.saveProfile(
				newProfileId,
				await hiddenFileManager.getProfile(profileId)
			);
			profileListProvider.refresh();
		}
	));
}

// this method is called when your extension is deactivated
export function deactivate() { }
