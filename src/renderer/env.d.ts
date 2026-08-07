/// <reference types="vite/client" />

import type { PwToolApi } from '../preload/api';

declare global {
  interface Window {
    pwTool: PwToolApi;
  }
}

export {};
