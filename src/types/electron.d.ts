// Type definitions for Electron IPC exposed via preload script

export interface ElectronAPI {
  httpRequest: (options: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
  }) => Promise<{
    status: number;
    statusText: string;
    headers: Record<string, string>;
    data: string;
  }>;
  getAppVersion: () => Promise<string>;
  isElectron: () => Promise<boolean>;
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}

export {};
