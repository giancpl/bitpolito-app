import { officeModule } from "./office";
import type {
  AppModule,
  ModuleHelpLink,
  ModuleHelpTopic,
  ModuleProfileSetting,
  ModuleRoute,
} from "./types";

/**
 * Registered first-party tool modules hosted in BitPolito Hub.
 * Add new modules here to expose them across Home, Tools, Profile, Help, and routing.
 */
export const modules: readonly AppModule[] = [officeModule];

export const allModuleRoutes = (): ModuleRoute[] => modules.flatMap((m) => m.routes);

export const isModuleRoute = (pathname: string, mod: AppModule): boolean =>
  mod.routes.some((r) => r.path === pathname);

export const isAnyModuleRoute = (pathname: string): boolean =>
  modules.some((m) => isModuleRoute(pathname, m));

export const findModuleTitle = (pathname: string): string | undefined => {
  for (const mod of modules) {
    const match = mod.routes.find((r) => r.path === pathname);
    if (match) return match.title;
  }
  return undefined;
};

export const getProfileSettings = (): ModuleProfileSetting[] =>
  modules.flatMap((m) => m.profileSettings ?? []);

export const getModuleHelpTopics = (): ModuleHelpTopic[] =>
  modules.flatMap((m) => m.helpTopics ?? []);

export const getModuleHelpLinks = (): ModuleHelpLink[] => modules.flatMap((m) => m.helpLinks ?? []);
