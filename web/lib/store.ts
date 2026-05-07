"use client";

import { create } from "zustand";
import type { Application, MasterResume, TailorQuota } from "./types";

interface AppState {
  authed: boolean;
  setAuthed: (b: boolean) => void;

  master: MasterResume | null;
  setMaster: (m: MasterResume | null) => void;

  applications: Application[];
  setApplications: (apps: Application[]) => void;
  addApplication: (app: Application) => void;
  patchApplication: (id: string, patch: Partial<Application>) => void;
  removeApplication: (id: string) => void;

  quota: TailorQuota | null;
  setQuota: (q: TailorQuota | null) => void;
}

export const useStore = create<AppState>((set) => ({
  authed: false,
  setAuthed: (b) => set({ authed: b }),

  master: null,
  setMaster: (m) => set({ master: m }),

  applications: [],
  setApplications: (apps) => set({ applications: apps }),
  addApplication: (app) =>
    set((state) => ({ applications: [app, ...state.applications] })),
  patchApplication: (id, patch) =>
    set((state) => ({
      applications: state.applications.map((a) =>
        a.id === id ? { ...a, ...patch } : a,
      ),
    })),
  removeApplication: (id) =>
    set((state) => ({
      applications: state.applications.filter((a) => a.id !== id),
    })),

  quota: null,
  setQuota: (q) => set({ quota: q }),
}));
