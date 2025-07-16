import React, { useState, useEffect, useRef } from "react"
import hotkeys from "hotkeys-js"
import { SearchRequests } from "../../bindings/github.com/D-Elbel/curlew/requestcrudservice.js"
import {
    Command,
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandShortcut,
} from "@/components/ui/command"
import { methodColourMap } from "../utils/constants.js"
import { useHotkeys } from "@/services/HotkeysContext.jsx"

hotkeys.filter = () => true

export default function CommandMenu({ onSelect }) {
    const { hotkeysMap } = useHotkeys()
    const [open, setOpen] = useState(false)
    const [searchResults, setSearchResults] = useState([])
    const [searchActive, setSearchActive] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")
    const searchTimeout = useRef(null)
    const isMounted = useRef(true)

    const openSearchCombo = hotkeysMap.OPEN_SEARCH_COMMAND

    useEffect(() => {
        isMounted.current = true
        const fn = (e) => {
            e.preventDefault()
            setOpen(o => !o)
        }
        hotkeys(openSearchCombo, fn)
        return () => {
            hotkeys.unbind(openSearchCombo, fn)
            isMounted.current = false
        }
    }, [openSearchCombo])

    const searchRequests = (term) => {
        setSearchTerm(term)
        if (searchTimeout.current) {
            clearTimeout(searchTimeout.current)
        }

        searchTimeout.current = setTimeout(async () => {
            if (!term.trim()) {
                if (isMounted.current) {
                    setSearchResults([])
                    setSearchActive(false)
                }
                return
            }
            try {
                const results = await SearchRequests(term)
                console.log(results)
                if (isMounted.current) {
                    setSearchResults(results)
                    setSearchActive(true)
                }
            } catch (error) {
                console.error("Error searching requests", error)
            }
        }, 100)
    }

    function highlightMatch(text, query) {
        if (!query) return text
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
        const parts = text.split(regex)
        return parts.map((part, i) =>
            regex.test(part)
                ? <mark key={i} className="bg-red-300 rounded px-1">{part}</mark>
                : part
        )
    }


    return (
        <CommandDialog open={open} onOpenChange={setOpen}>

                <Command shouldFilter={false}>
                    <CommandInput
                        onValueChange={searchRequests}
                        placeholder="Start typing to search."
                    />
                    <CommandList>
                        {searchActive && searchResults.length === 0 && (
                            <CommandEmpty>No results found.</CommandEmpty>
                        )}
                        <CommandGroup heading="Suggestions">
                            {searchResults.map(req => (
                                <CommandItem
                                    key={req.id}
                                    onSelect={() => {
                                        onSelect(req)
                                        setSearchActive(false)
                                        setSearchResults([])
                                        setOpen(false)
                                    }}
                                    className="flex flex-col items-start gap-1 py-2"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className={`text-sm font-medium ${methodColourMap.get(req.method)}`}>{req.method}
                                        </span><span className="text-xs text-gray-500">{highlightMatch(req.name || '', searchTerm)}</span>
                                    </div>
                                    <div className="text-sm font-semibold">{highlightMatch(req.url || '', searchTerm)}</div>
                                    {req.description && (
                                        <div className="text-xs text-gray-500 italic">{highlightMatch(req.description, searchTerm)}</div>
                                    )}
                                    {req.body && searchTerm && req.body.toLowerCase().includes(searchTerm.toLowerCase()) && (
                                        <div className="text-xs text-gray-400 truncate w-full">
                                            {highlightMatch(req.body, searchTerm)}
                                        </div>
                                    )}
                                    <CommandShortcut>Enter</CommandShortcut>
                                </CommandItem>
                            ))}

                        </CommandGroup>
                    </CommandList>
                </Command>
        </CommandDialog>
    )
}
