import { create } from "zustand";
import type { Application, MasterResume, TailorQuota } from "./types";
import {
  readCachedApplications,
  writeCachedApplications,
  patchCachedApplication,
  addCachedApplication,
  removeCachedApplication,
} from "./sync";

interface AppState {
  authed: boolean;
  setAuthed: (b: boolean) => void;

  master: MasterResume | null;
  setMaster: (m: MasterResume | null) => void;

  applications: Application[];
  /** Replace full list in memory + MMKV cache */
  setApplications: (apps: Application[]) => void;
  /** Prepend a new application */
  addApplication: (app: Application) => void;
  /** Partial update in memory + MMKV cache */
  patchApplication: (id: string, patch: Partial<Application>) => void;
  /** Remove from memory + MMKV cache */
  removeApplication: (id: string) => void;
  /** Hydrate from MMKV on boot — call once before first API fetch */
  hydrateFromCache: () => void;

  quota: TailorQuota | null;
  setQuota: (q: TailorQuota | null) => void;
}

export const useStore = create<AppState>((set) => ({
  authed: false,
  setAuthed: (b) => set({ authed: b }),

  master: null,
  setMaster: (m) => set({ master: m }),

  applications: [],

  hydrateFromCache: () => {
    const cached = readCachedApplications();
    if (cached && cached.length > 0) set({ applications: cached });
  },

  setApplications: (apps) => {
    writeCachedApplications(apps);
    set({ applications: apps });
  },

  addApplication: (app) => {
    addCachedApplication(app);
    set((state) => ({ applications: [app, ...state.applications] }));
  },

  patchApplication: (id, patch) => {
    patchCachedApplication(id, patch);
    set((state) => ({
      applications: state.applications.map((a) =>
        a.id === id ? { ...a, ...patch } : a,
      ),
    }));
  },

  removeApplication: (id) => {
    removeCachedApplication(id);
    set((state) => ({
      applications: state.applications.filter((a) => a.id !== id),
    }));
  },

  quota: null,
  setQuota: (q) => set({ quota: q }),
}));
