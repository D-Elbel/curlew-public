// src/stores/requestStore.js
import { create } from "zustand"
import {
    SaveRequest,
    UpdateRequest,
    DeleteRequest,
    DeleteCollection,
    DuplicateRequest
} from "../../bindings/github.com/D-Elbel/curlew/requestcrudservice.js"
import { query as queryDb } from "@/services/database.js"
import { requestQueries, collectionQueries } from "@/services/queries.js"

const toNumberSafe = (value) => {
    if (typeof value === "number") return value
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value)
        if (!Number.isNaN(parsed)) {
            return parsed
        }
    }
    return null
}

const normalizeRequestRow = (row) => ({
    id: toNumberSafe(row.id),
    collectionId: row.collectionId ?? null,
    name: row.name ?? null,
    description: row.description ?? null,
    method: row.method ?? null,
    url: row.url ?? null,
    sortOrder: row.sortOrder !== undefined && row.sortOrder !== null
        ? toNumberSafe(row.sortOrder)
        : null,
})

const normalizeCollectionRow = (row) => ({
    id: row.id,
    name: row.name ?? "",
    description: row.description ?? "",
    parentCollectionId: row.parentCollectionId ?? null,
})

export const useRequestStore = create((set, get) => ({
    requests: [],
    collections: [],

    // Load both collections & requests
    loadAll: async () => {
        const [requestsRes, collectionsRes] = await Promise.all([
            queryDb({ sql: requestQueries.getAllList }),
            queryDb({ sql: collectionQueries.getAll })
        ])
        const requests = Array.isArray(requestsRes?.rows)
            ? requestsRes.rows.map(normalizeRequestRow)
            : []
        const collections = Array.isArray(collectionsRes?.rows)
            ? collectionsRes.rows.map(normalizeCollectionRow)
            : []
        set({ requests, collections })
    },

    // Save or update a request, then inject into state
    saveRequest: async ({id, collectionId, name, description, method, requestUrl, headers, body, bodyType, bodyFormat, auth, response}) => {
        let saved
        console.log(id, collectionId, name, description, method, requestUrl)
        if (id) {
            // UpdateRequest(id, collectionId, name, description, method, requestUrl, headers, body, bodyType, bodyFormat, auth, response)
            saved = await UpdateRequest(id, collectionId, name, description, method, requestUrl, headers, body, bodyType, bodyFormat, auth, response)
        } else {
            // SaveRequest(collectionId, name, description, method, requestUrl, headers, body, bodyType, bodyFormat, auth, response)
            saved = await SaveRequest(collectionId, name, description, method, requestUrl, headers, body, bodyType, bodyFormat, auth, response)
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

    duplicateRequest: async (id) => {
        const duplicated = await DuplicateRequest(id)
        if (!duplicated || !duplicated.id) {
            return null
        }

        set(state => {
            const exists = state.requests.some(r => r.id === duplicated.id)
            return {
                requests: exists
                    ? state.requests.map(r => (r.id === duplicated.id ? duplicated : r))
                    : [...state.requests, duplicated]
            }
        })

        return duplicated
    },

    deleteCollection: async (id) => {
        await DeleteCollection(id)
        await get().loadAll()
    }


}))
