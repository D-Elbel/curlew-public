// src/stores/requestStore.js
import { create } from "zustand"
import {
    GetAllRequestsList,
    GetAllCollections,
    SaveRequest,
    UpdateRequest,
    DeleteRequest,
    DeleteCollection
} from "../../bindings/github.com/D-Elbel/curlew/requestcrudservice.js"

export const useRequestStore = create((set, get) => ({
    requests: [],
    collections: [],

    // Load both collections & requests
    loadAll: async () => {
        const [requests, collections] = await Promise.all([
            GetAllRequestsList(),
            GetAllCollections()
        ])
        set({ requests, collections })
    },

    // Save or update a request, then inject into state
    saveRequest: async ({id, collectionId, name, description, method, requestUrl, headers, body, bodyType, bodyFormat, auth}) => {
        let saved
        console.log(id, collectionId, name, description, method, requestUrl)
        if (id) {
            // UpdateRequest(id, collectionId, name, description, method, requestUrl, headers, body, bodyType, bodyFormat, auth)
            saved = await UpdateRequest(id, collectionId, name, description, method, requestUrl, headers, body, bodyType, bodyFormat, auth)
        } else {
            // SaveRequest(collectionId, name, description, method, requestUrl, headers, body, bodyType, bodyFormat, auth)
            saved = await SaveRequest(collectionId, name, description, method, requestUrl, headers, body, bodyType, bodyFormat, auth)
        }

        set(state => {
            const exists = state.requests.some(r => r.id === saved.id)
            return {
                requests: exists
                    ? state.requests.map(r => (r.id === saved.id ? saved : r))
                    : [...state.requests, saved]
            }
        })

        return saved
    },

    deleteRequest: async (id) => {
        await DeleteRequest(id)
        set(state => ({
            requests: state.requests.filter(r => r.id !== id)
        }))
    },

    deleteCollection: async (id) => {
        await DeleteCollection(id)
        await get().loadAll()
    }


}))
