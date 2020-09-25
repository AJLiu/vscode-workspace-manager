import * as vscode from 'vscode';
import { HiddenFileExplorerProvider, HiddenFileNode } from './hiddenFileTreeProvider';
import { ProfileListProvider } from './profileListProvider';

export class HiddenFileManager {
    constructor(
        private context: vscode.ExtensionContext,
        private hiddenFileExplorerProvider: HiddenFileExplorerProvider,
        private profileListProvider: ProfileListProvider
    ) {
        const { globs, paths } = this.splitGlobsAndPaths();
        hiddenFileExplorerProvider.setHiddenFiles(paths);
    }
    /**************************************
     * Data handling
     **************************************/
    async showFile(nodeOrUri: HiddenFileNode | vscode.Uri) {
        const node = this.getNode(nodeOrUri);
        const update: Record<string, boolean> = {};
        const excludes = this.getExcludes();

        const path = node.getPath();
        // Case: the file we want to show is explicitly defined in config.
        if (path in excludes) {
            update[path] = false;
        } else {
            // Case: the file we want to show is a child of a hidden directory
            // we need to unhide the directory and hide all siblings
            const stack = [node];
            while (stack.length > 0) {
                const node = stack.pop();
                if (node === undefined) { break; }
                // path found, remove it.
                const path = node.getPath();
                if (path in excludes) {
                    update[path] = false;
                    break;
                }
                // Otherwise, add siblings and add parent to the stack
                if (node.parent !== undefined) {
                    stack.push(node.parent);
                    const siblings = this.getSiblings(node);
                    for (const sibling of siblings) {
                        update[sibling.getPath()] = true;
                    }
                }
            }
        }
        await this.updateExcludes(update);
        await this.refreshFiles();
    }

    async hideFile(nodeOrUri: HiddenFileNode | vscode.Uri) {
        const node = this.getNode(nodeOrUri);
        const path = node.getPath();
        const update: Record<string, boolean> = {[path]: true};
        console.log(node, update);
        // Case: the node being hidden is a parent of other nodes that are hidden
        if (node.isFolder) {
            const excludes = this.getExcludes();
            for (const excluded of Object.keys(excludes)) {
                if (excluded.startsWith(path)) {
                    update[excluded] = false;
                }
            }
        }
        console.log(update);
        await this.updateExcludes(update);
        await this.refreshFiles();
    }

    async hideSiblings(nodeOrUri: HiddenFileNode | vscode.Uri) {
        const node = this.getNode(nodeOrUri);
        const update: Record<string, boolean> = {};
        const excludes = this.getExcludes();

        const siblings = this.getSiblings(node);
        for (const sibling of siblings) {
            const path = sibling.getPath();
            update[path] = true;
            if (sibling.isFolder) {
                for (const excluded of Object.keys(excludes)) {
                    if (excluded.startsWith(path)) {
                        update[excluded] = false;
                    }
                }
            }
        }
        await this.updateExcludes(update);
        await this.refreshFiles();
    }

    async reset() {
        const {globs, paths} = this.splitGlobsAndPaths();
        const update: Record<string, boolean> = {};
        for (const path of paths) {
            update[path] = false;
        }
        await this.updateExcludes(update);
        await this.refreshFiles();
    }

    async refreshFiles() {
        const {globs, paths} = this.splitGlobsAndPaths();
        this.hiddenFileExplorerProvider.setHiddenFiles(paths);
        this.hiddenFileExplorerProvider.refresh();
    }

    /**************************************
     * Config saving and loading
     **************************************/
    splitGlobsAndPaths(excludes: Record<string, boolean> | undefined = undefined) {
        const globs: string[] = [];
        const paths: string[] = [];
        for (const [path, hide] of Object.entries(excludes || this.getExcludes())) {
            if (hide) {
                if (this.isPath(path)) {
                    paths.push(path);
                } else {
                    globs.push(path);
                }
            }
        }
        return { globs, paths };
    }

    getExcludes(): Record<string, boolean | undefined> {
        const filesConfig = vscode.workspace.getConfiguration('files');
        return filesConfig.get('exclude') || {};
    }

    async updateExcludes(excludes: Record<string, boolean>) {
        const filesConfig = vscode.workspace.getConfiguration('files');
        const target = vscode.ConfigurationTarget.Workspace;
        const allExcludes = this.getExcludes();
        for (const [path, hide] of Object.entries(excludes)) {
            if (!hide && path in allExcludes) {
                allExcludes[path] = undefined;
            } else if (hide) {
                allExcludes[path] = hide;
            }
        }
        await Promise.all([
            filesConfig.update('exclude', allExcludes, target),
            this.syncProfile(allExcludes)
        ]);
    }

    async getProfile(profileId: string | undefined = undefined) {
        const config = vscode.workspace.getConfiguration('workspace-manager');
        const profiles = config.get<Record<string, Record<string, boolean>>>('profiles') || {};
        if (profileId === undefined) {
            const selectedProfileId = config.get<string>('selected-profile') || '';
            return profiles[selectedProfileId];
        }
        return profiles[profileId];
    }

    async syncProfile(excludes: Record<string, boolean | undefined>) {
        const config = vscode.workspace.getConfiguration('workspace-manager');
        const selectedProfileId = config.get<string>('selected-profile');
        if (selectedProfileId === undefined) {
            return;
        }
        await this.saveProfile(selectedProfileId, excludes);
    }

    async saveProfile(profileId: string, excludes: Record<string, boolean | undefined>) {
        const config = vscode.workspace.getConfiguration('workspace-manager');
        const profiles = config.get<Record<string, Record<string, boolean | undefined>>>('profiles') || {};
        profiles[profileId] = excludes;
        const target = vscode.ConfigurationTarget.Workspace;
        await config.update('profiles', profiles, target);
    }

    async deleteProfile(profileId: string) {
        const config = vscode.workspace.getConfiguration('workspace-manager');
        const profiles = config.get<Record<string, Record<string, boolean | undefined> | undefined>>('profiles') || {};
        profiles[profileId] = undefined;
        const target = vscode.ConfigurationTarget.Workspace;
        await config.update('profiles', profiles, target);
        this.profileListProvider.refresh();
    }

    async switchProfile(profileId: string) {
        const config = vscode.workspace.getConfiguration('workspace-manager');
        const filesConfig = vscode.workspace.getConfiguration('files');
        const profiles = config.get<Record<string, Record<string, boolean | undefined>>>('profiles') || {};
        const target = vscode.ConfigurationTarget.Workspace;
        if (profileId in profiles) {
            await Promise.all([
                config.update('selected-profile', profileId, target),
                filesConfig.update('exclude', profiles[profileId], target)
            ]);
        } else {
            await Promise.all([
                config.update('selected-profile', profileId, target),
                filesConfig.update('exclude', {}, target),
                this.saveProfile(profileId, {})
            ]);
        }
        this.profileListProvider.refresh();
        await this.refreshFiles();
    }

    private isPath(path: string) {
        // Any file containing '*' is a glob.
        return !path.includes('*');
    }

    private getNode(nodeOrUri: HiddenFileNode | vscode.Uri) {
        if (nodeOrUri instanceof HiddenFileNode) {
            return nodeOrUri;
        }
        return this.hiddenFileExplorerProvider.getNode(nodeOrUri);
    }

    private getSiblings(node: HiddenFileNode) {
        const parent = node.parent;
        if (parent === undefined) {
            return [];
        }
        const children = node.children || [];
        return children.filter((child) => child !== node);
    }
}
