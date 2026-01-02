import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import hotkeys from 'hotkeys-js'
import { fetchUserKeybinds } from '@/services/keybinds.js'

const HotkeysContext = createContext(null)

const defaultHotkeysMap = {
    OPEN_SEARCH_COMMAND: 'ctrl+k',
    OPEN_TAB_MENU:        'ctrl+tab',
    NEW_ENV:              'ctrl+n+e',
    NEW_REQUEST:          'ctrl+n+r',
    OPEN_ENV:             'ctrl+e',
    OPEN_SIDEBAR:         'ctrl+b',
    HANDLE_ENTITY_SAVE:   'ctrl+s',
    SEND_REQUEST:         'ctrl+enter',
}

export const HotkeysProvider = ({ children }) => {
    const [hotkeysMap, setHotkeysMap] = useState(defaultHotkeysMap)
    const defs = useRef(new Map())

    // Function to load keybinds from DB
    const loadKeybinds = async () => {
        try {
            const dbHotkeys = await fetchUserKeybinds()
            if (Array.isArray(dbHotkeys) && dbHotkeys.length) {
                setHotkeysMap(prev => {
                    const merged = { ...prev }
                    for (const { command, bind } of dbHotkeys) {
                        if (merged.hasOwnProperty(command)) {
                            merged[command] = bind
                        }
                    }
                    return merged
                })
            }
        } catch (err) {
            console.error("Failed to fetch hotkeys:", err)
        }
    }

    // Initial load
    useEffect(() => {
        loadKeybinds()
    }, [])

    // Public reload function
    const reloadHotkeys = async () => {
        await loadKeybinds()
    }

    const register = ({ id, combo, handler }) => {
        if (defs.current.has(id)) {
            hotkeys.unbind(defs.current.get(id).combo)
        }
        defs.current.set(id, { combo, handler })
        hotkeys(combo, handler)
    }

    const unregister = id => {
        const def = defs.current.get(id)
        if (!def) return
        hotkeys.unbind(def.combo)
        defs.current.delete(id)
    }

    const remap = (id, newCombo) => {
        const def = defs.current.get(id)
        if (!def) return
        unregister(id)
        register({ id, combo: newCombo, handler: def.handler })
    }

    useEffect(() => {
        return () => {
            defs.current.forEach(d => hotkeys.unbind(d.combo))
        }
    }, [])

    return (
        <HotkeysContext.Provider
            value={{ hotkeysMap, register, unregister, remap, reloadHotkeys }}
        >
            {children}
        </HotkeysContext.Provider>
    )
}

export const useHotkeys = () => {
    const ctx = useContext(HotkeysContext)
    if (!ctx) throw new Error('useHotkeys must be inside HotkeysProvider')
    return ctx
}
