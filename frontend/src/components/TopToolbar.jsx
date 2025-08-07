import { useEnvarStore } from "@/stores/envarStore";
import SettingsModal from "@/components/SettingsModal.jsx"
import React, { useState } from "react";
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from "@/components/ui/command";
import { Check, Plus, Menu } from "lucide-react";

function TopToolbar({ onTriggerCommand, onTriggerTabMenu }) {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const envs = useEnvarStore((state) => state.environmentVariables);
    const activeEnv = useEnvarStore((state) => state.activeEnvironment);
    const setActiveEnv = useEnvarStore((state) => state.setActiveEnvironment);

    return (
        <div className="w-full  py-1 flex justify-between items-center border-b bg-black/50 backdrop-blur-sm">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button className="p-2 rounded hover:bg-gray-800">
                        <Menu className="w-5 h-5 text-white" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-48">
                    <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                        Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => console.log("Help clicked")}>
                        Help
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => console.log("About clicked")}>
                        About
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>


            <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

            <div className="w-[10%]">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="flex items-center justify-between text-xs w-full px-3 py-2 rounded bg-black/30 border border-gray-700 text-white hover:bg-black/50 transition">
                            <span className="truncate">
                                {activeEnv || "No environment"}
                            </span>
                            <svg className="ml-2 w-4 h-4" viewBox="0 0 20 20" fill="none"><path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-[120%] p-0">
                        <Command>
                            <div className="flex items-center px-2 pt-2 pb-1 border-b border-gray-700">
                                <CommandInput placeholder="Search environments..." className="flex-1" />
                            
                            </div>
                            <CommandList>
                                <CommandItem
                                    key="no-env"
                                    value=""
                                    onSelect={() => setActiveEnv("")}
                                    className="flex items-center justify-between"
                                >
                                    <span>No environment</span>
                                    {!activeEnv && <Check className="w-4 h-4 text-green-500" />}
                                </CommandItem>
                                {envs.map((env) => (
                                    <CommandItem
                                        key={env.env}
                                        value={env.env}
                                        onSelect={() => setActiveEnv(env.env)}
                                        className="flex items-center justify-between"
                                    >
                                        <span>{env.env}</span>
                                        {activeEnv === env.env && <Check className="w-4 h-4 text-green-500" />}
                                    </CommandItem>
                                ))}
                                <CommandEmpty>No environments found.</CommandEmpty>
                            </CommandList>
                        </Command>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
}

export default TopToolbar;
