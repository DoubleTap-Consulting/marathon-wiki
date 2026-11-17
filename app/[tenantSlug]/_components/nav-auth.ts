"use server";

import { getAuthMode, getCurrentWikiActor, wikiNavAuthFromActor } from "@/src/auth/wiki-auth";
import type { WikiNavAuth } from "@/src/auth/wiki-nav";

export async function getWikiNavAuthAction(): Promise<WikiNavAuth> {
  return wikiNavAuthFromActor(await getCurrentWikiActor(), getAuthMode());
}
