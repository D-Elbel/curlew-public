import React from "react";
import { useEnvarStore } from "@/stores/envarStore";
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
import { Menu } from "lucide-react";

function TopToolbar({ onTriggerCommand, onTriggerTabMenu }) {
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
                    <DropdownMenuItem onClick={() => console.log("Settings clicked")}>
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

            <div className="text-gray-400 text-sm flex items-center gap-6">
                <button
                    onClick={onTriggerCommand}
                    className="px-3 py-1 rounded border border-gray-600 hover:bg-gray-800"
                >
                    Search Ctrl + K
                </button>
                <button
                    onClick={onTriggerTabMenu}
                    className="px-3 py-1 rounded border border-gray-600 hover:bg-gray-800"
                >
                    Command Ctrl + Tab
                </button>
            </div>

            <div className="w-[200px]">
                <Select value={activeEnv || ""} onValueChange={(value) => setActiveEnv(value)}>
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select an environment" />
                    </SelectTrigger>
                    <SelectContent>
                        {envs.map((env) => (
                            <SelectItem key={env.env} value={env.env}>
                                {env.env}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}

export default TopToolbar;
