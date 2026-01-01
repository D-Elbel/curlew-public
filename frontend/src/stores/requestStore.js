// src/stores/requestStore.js
import { create } from "zustand"
import { exec as execDb, query as queryDb } from "@/services/database.js"
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

async function nextSortOrderForCollection(collectionId) {
    const res = await queryDb({
        sql: requestQueries.getMaxSortOrder,
        params: [collectionId, collectionId],
    })
    const max = res?.rows?.[0]?.maxSortOrder
    const parsed = toNumberSafe(max)
    return parsed === null ? 0 : parsed + 1
}

async function insertResponseHistory({ statusCode, headers, body, runtimeMS, requestId, createdAt }) {
    const created = createdAt || new Date().toISOString()
    const headersValue =
        headers && typeof headers === "object" ? JSON.stringify(headers) : headers ?? ""
    const bodyValue =
        body && typeof body === "object" ? JSON.stringify(body) : body ?? ""

    await execDb({
        sql: requestQueries.insertResponse,
        params: [statusCode, headersValue, bodyValue, runtimeMS, requestId, created],
    })

    const ttlRes = await queryDb({ sql: requestQueries.responseHistoryTTL })
    const ttlRaw = ttlRes?.rows?.[0]?.value
    const ttl = toNumberSafe(ttlRaw) ?? 5
    if (ttl <= 0) {
        return
    }
    await execDb({
        sql: requestQueries.trimResponseHistory,
        params: [requestId, requestId, ttl],
    })
}

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
        const sortOrder = id ? null : await nextSortOrderForCollection(collectionId)

        if (id) {
            const current = get().requests.find((r) => r.id === id)
            await execDb({
                sql: requestQueries.updateRequest,
                params: [
                    collectionId,
                    name,
                    description,
                    method,
                    requestUrl,
                    headers,
                    body,
                    bodyType,
                    bodyFormat,
                    auth,
                    id,
                ],
            })
            saved = {
                id,
                collectionId,
                name,
                description,
                method,
                url: requestUrl,
                headers,
                body,
                bodyType,
                bodyFormat,
                auth,
                sortOrder: current?.sortOrder ?? null,
            }
        } else {
            const insertRes = await execDb({
                sql: requestQueries.insertRequest,
                params: [
                    collectionId,
                    name,
                    description,
                    method,
                    requestUrl,
                    headers,
                    body,
                    bodyType,
                    bodyFormat,
                    auth,
                    sortOrder,
                ],
            })
            const newId = toNumberSafe(insertRes.lastInsertId)
            saved = {
                id: newId,
                collectionId,
                name,
                description,
                method,
                url: requestUrl,
                headers,
                body,
                bodyType,
                bodyFormat,
                auth,
                sortOrder,
            }
        }

        if (response && saved?.id) {
            const createdAt = response.createdAt || new Date().toISOString()
            await insertResponseHistory({
                statusCode: response.statusCode,
                headers: response.headers,
                body: response.body,
                runtimeMS: response.runtimeMS,
                requestId: saved.id,
                createdAt,
            })
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
        await execDb({
            sql: requestQueries.deleteRequest,
            params: [id],
        })
        set(state => ({
            requests: state.requests.filter(r => r.id !== id)
        }))
    },

    duplicateRequest: async (id) => {
        const sourceRes = await queryDb({
            sql: requestQueries.duplicateSource,
            params: [id],
        })
        const source = sourceRes?.rows?.[0]
        if (!source) return null

        const baseName = (source.name || "Untitled Request").trim()
        const duplicateName = `${baseName} (Copy)`
        const nextSort = await nextSortOrderForCollection(source.collectionId || null)

        const insertRes = await execDb({
            sql: requestQueries.insertRequest,
            params: [
                source.collectionId || null,
                duplicateName,
                source.description || null,
                source.method || null,
                source.url || null,
                source.headers || null,
                source.body || null,
                source.bodyType || null,
                source.bodyFormat || null,
                source.auth || null,
                nextSort,
            ],
        })
        const newId = toNumberSafe(insertRes.lastInsertId)

        const respRes = await queryDb({
            sql: requestQueries.duplicateResponses,
            params: [id],
        })
        const responses = Array.isArray(respRes?.rows) ? respRes.rows : []
        for (const resp of responses) {
            await insertResponseHistory({
                statusCode: resp.statusCode ?? null,
                headers: resp.headers ?? null,
                body: resp.body ?? null,
                runtimeMS: toNumberSafe(resp.runtimeMS) ?? null,
                requestId: newId,
                createdAt: resp.createdAt || null,
            })
        }

        const duplicated = {
            id: newId,
            collectionId: source.collectionId || null,
            collectionName: source.collectionName || null,
            name: duplicateName,
            description: source.description || null,
            method: source.method || null,
            url: source.url || null,
            headers: source.headers || null,
            body: source.body || null,
            bodyType: source.bodyType || null,
            bodyFormat: source.bodyFormat || null,
            auth: source.auth || null,
            sortOrder: nextSort,
            response: responses.length ? responses[responses.length - 1] : null,
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
        await execDb({
            sql: collectionQueries.delete,
            params: [id],
        })
        await get().loadAll()
    },

    createCollection: async (name, description = "", parentId = null) => {
        const id =
            (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function")
                ? globalThis.crypto.randomUUID()
                : Math.random().toString(36).slice(2, 10)
        await execDb({
            sql: collectionQueries.insert,
            params: [id, name, description, parentId],
        })
        await get().loadAll()
        return { id, name, description, parentCollectionId: parentId }
    },

    updateCollectionParent: async (collectionId, parentId) => {
        if (parentId && parentId === collectionId) {
            throw new Error("A collection cannot be its own parent")
        }
        await execDb({
            sql: collectionQueries.updateParent,
            params: [parentId, collectionId],
        })
        await get().loadAll()
    },

    setRequestCollection: async (requestId, newCollectionId) => {
        const sortOrder = await nextSortOrderForCollection(newCollectionId || null)
        await execDb({
            sql: requestQueries.setCollection,
            params: [newCollectionId, requestId],
        })
        await execDb({
            sql: requestQueries.updateSortOrder,
            params: [sortOrder, requestId],
        })
        await get().loadAll()
    },

    reorderRequestInCollection: async (requestId, collectionId, targetIndex) => {
        const state = get()
        const current = state.requests.filter(
            (r) => (r.collectionId || null) === (collectionId || null),
        )
        const sorted = current
            .slice()
            .sort((a, b) => {
                const ao = a.sortOrder ?? a.id
                const bo = b.sortOrder ?? b.id
                return ao - bo
            })

        const fromIndex = sorted.findIndex((r) => r.id === requestId)
        if (fromIndex === -1) {
            return
        }
        const [moved] = sorted.splice(fromIndex, 1)
        const clampedIndex = Math.max(0, Math.min(targetIndex, sorted.length))
        sorted.splice(clampedIndex, 0, moved)

        for (let i = 0; i < sorted.length; i++) {
            const req = sorted[i]
            await execDb({
                sql: requestQueries.updateSortOrder,
                params: [i, req.id],
            })
        }
        await get().loadAll()
    },

    searchRequests: async (term) => {
        if (!term || !term.trim()) {
            return []
        }
        const like = `%${term}%`
        const res = await queryDb({
            sql: requestQueries.search,
            params: [term, term, like, like, like],
        })
        return Array.isArray(res?.rows) ? res.rows.map(normalizeRequestRow) : []
    },

    getResponseHistory: async (requestId) => {
        const res = await queryDb({
            sql: requestQueries.responseHistory,
            params: [requestId],
        })
        return Array.isArray(res?.rows) ? res.rows : []
    },

}))
