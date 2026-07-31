import { create } from "zustand";
import { assetUrl } from "../assetUrl";

export interface VrmStoreState {
  vrmUrl: string;
  vrmName: string;
  setVrm: (url: string, name: string) => void;
}

export const useVrmStore = /* @__PURE__ */ create<VrmStoreState>((set) => ({
  vrmUrl: assetUrl("AvatarSample_L.vrm"),
  vrmName: "AvatarSample_L.vrm",
  setVrm: (url, name) =>
    set((state) => {
      if (state.vrmUrl !== url && state.vrmUrl.startsWith("blob:")) {
        URL.revokeObjectURL(state.vrmUrl);
      }
      return { vrmUrl: url, vrmName: name };
    }),
}));
