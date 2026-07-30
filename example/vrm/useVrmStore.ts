import { create } from "zustand";

export interface VrmStoreState {
  vrmUrl: string;
  vrmName: string;
  setVrm: (url: string, name: string) => void;
}

export const useVrmStore = /* @__PURE__ */ create<VrmStoreState>((set) => ({
  vrmUrl: "/sample.vrm",
  vrmName: "sample.vrm",
  setVrm: (url, name) =>
    set((state) => {
      if (state.vrmUrl !== url && state.vrmUrl.startsWith("blob:")) {
        URL.revokeObjectURL(state.vrmUrl);
      }
      return { vrmUrl: url, vrmName: name };
    }),
}));
