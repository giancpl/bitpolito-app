import type { ComponentType, ReactNode } from "react";
import type { NavigateFunction } from "react-router-dom";

export interface ModuleRoute {
  path: string;
  title: string;
  element: ComponentType;
}

export interface ModuleProfileSetting {
  view: string;
  title: string;
  label: string;
  detail: string;
  icon: ReactNode;
  Component: ComponentType;
}

export interface ModuleHelpTopic {
  id: string;
  title: string;
  label: string;
  detail: string;
  icon: ReactNode;
  steps: ReadonlyArray<readonly [string, string]>;
  action: string;
  destination: string;
}

export interface ModuleHelpLink {
  id: string;
  label: string;
  detail: string;
  icon: ReactNode;
  to: string;
}

export interface ModuleNativeEvent {
  event: string;
  handle: (detail: unknown, navigate: NavigateFunction) => void;
}

export interface LaunchPayload {
  request?: string;
  invite?: string;
}

/**
 * Contract implemented by every first-party tool module hosted inside BitPolito Hub.
 * Registering a module in `src/modules/registry.ts` automatically wires its routes,
 * Home dashboard widget, global live banner, Tools card, Profile settings, Help guides,
 * and Android deep-link handlers into the platform shell.
 */
export interface AppModule {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  route: string;
  routes: ModuleRoute[];
  HomeWidget?: ComponentType;
  GlobalBanner?: ComponentType;
  profileSettings?: ModuleProfileSetting[];
  helpTopics?: ModuleHelpTopic[];
  helpLinks?: ModuleHelpLink[];
  nativeEvents?: ModuleNativeEvent[];
  onLaunch?: (launch: LaunchPayload, navigate: NavigateFunction) => void;
}
