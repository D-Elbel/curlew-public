import React, { useState, useEffect } from "react";
import {
    Command,
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";

/**
 * TabMenu props:
 * - onSelect(tab): select an existing tab
 * - tabs: array of tab objects with { id, method, name }
 * - activeTabIds: array of active tab IDs
 * - onNewTab(): create a new request tab
 * - onNewEnv(): create a new environment
 * - onOpenEnv(): open existing environment selector
 */
function TabMenu({ onSelect, tabs, activeTabIds, onNewTab, onNewEnv, onOpenEnv }) {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const down = (e) => {
            if (e.key === "Tab" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((o) => !o);
            }
        };
        document.addEventListener("keydown", down);
        return () => document.removeEventListener("keydown", down);
    }, []);

    return (
        <CommandDialog open={open} onOpenChange={setOpen}>
            <Command shouldFilter>
                <CommandInput placeholder="Pick an action or a tab..." />
                <CommandList>
                    <CommandGroup heading="Actions">
                        <CommandItem
                            onSelect={() => {
                                onNewTab();
                                setOpen(false);
                            }}
                        >
                            + New Request
                        </CommandItem>
                        <CommandItem
                            onSelect={() => {
                                onNewEnv();
                                setOpen(false);
                            }}
                        >
                            + New Environment
                        </CommandItem>
                        <CommandItem
                            onSelect={() => {
                                onOpenEnv();
                                setOpen(false);
                            }}
                        >
                            ↗ Open Environment
                        </CommandItem>
                    </CommandGroup>

                    <CommandGroup heading="Active Tabs">
                        {tabs.map((tab) => (
                            <CommandItem
                                key={tab.id}
                                onSelect={() => {
                                    onSelect(tab);
                                    setOpen(false);
                                }}
                            >
                                <span className={tab.method || ""}>{tab.method}</span> {tab.name}
                            </CommandItem>
                        ))}
                    </CommandGroup>

                    <CommandEmpty>No matches found.</CommandEmpty>
                </CommandList>
            </Command>
        </CommandDialog>
    );
}

export default TabMenu;