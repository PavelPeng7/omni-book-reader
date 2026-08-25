import { normalizePath } from "obsidian";

interface PluginManifestIdentity {
  id?: unknown;
}

export interface LegacyPluginData {
  path: string;
  value: unknown;
}

export interface LegacyDataAdapter {
  exists(normalizedPath: string): Promise<boolean>;
  list(normalizedPath: string): Promise<{ files: string[]; folders: string[] }>;
  read(normalizedPath: string): Promise<string>;
}

export async function loadLegacyPluginData(
  adapter: LegacyDataAdapter,
  pluginsDirectory: string,
  currentPluginDirectory: string,
  pluginId: string,
): Promise<LegacyPluginData[]> {
  const pluginsPath = normalizePath(pluginsDirectory);
  const currentPath = normalizePath(currentPluginDirectory);
  const listing = await adapter.list(pluginsPath);
  const results: LegacyPluginData[] = [];
  for (const directory of listing.folders) {
    const normalizedDirectory = normalizePath(directory);
    if (normalizedDirectory === currentPath) continue;
    try {
      const manifest = JSON.parse(await adapter.read(normalizePath(`${normalizedDirectory}/manifest.json`))) as PluginManifestIdentity;
      if (manifest.id !== pluginId) continue;
      const dataPath = normalizePath(`${normalizedDirectory}/data.json`);
      if (!await adapter.exists(dataPath)) continue;
      results.push({ path: dataPath, value: JSON.parse(await adapter.read(dataPath)) as unknown });
    } catch {
      // Ignore incomplete, invalid, or inaccessible plugin folders.
    }
  }
  return results;
}
