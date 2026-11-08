// Connects to the guarded site and finds the PoC_ lists.
import { Graph } from './graph.ts';
import { LISTS, pocName } from './schema.ts';

export interface PocList {
  id: string;
  displayName: string;
  driveId?: string;
}

export interface Ctx {
  g: Graph;
  siteId: string;
  lists: Record<string, PocList>; // keyed by logical name (without PoC_)
  itemsUrl: (list: string) => string;
}

export async function connect(): Promise<Ctx> {
  const g = new Graph();
  const site = await g.resolveSite();
  const { items } = await g.getAll<{ id: string; displayName: string }>(`/sites/${site.id}/lists?$select=id,displayName&$top=200`);
  const lists: Record<string, PocList> = {};
  for (const def of LISTS) {
    const found = items.find((l) => l.displayName === pocName(def.name));
    if (!found) continue;
    let driveId: string | undefined;
    if (def.template === 'documentLibrary') {
      const d = await g.request<{ id: string }>('GET', `/sites/${site.id}/lists/${found.id}/drive?$select=id`);
      driveId = d.id;
    }
    g.registerPocList(found.id, found.displayName, driveId);
    lists[def.name] = { id: found.id, displayName: found.displayName, driveId };
  }
  return {
    g,
    siteId: site.id,
    lists,
    itemsUrl: (list: string) => {
      const l = lists[list];
      if (!l) throw new Error(`List ${pocName(list)} not found - run npm run setup first.`);
      return `/sites/${site.id}/lists/${l.id}/items`;
    },
  };
}
