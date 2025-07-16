import { create } from "zustand"

export const useEnvarStore = create((set) => ({
    environmentVariables: [],
    activeEnvironment: null,
    setEnvironmentVariables: (envs) => set({ environmentVariables: envs }),
    setActiveEnvironment: (env) => set({activeEnvironment: env})
}))
