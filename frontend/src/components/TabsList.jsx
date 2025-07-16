import React from 'react';
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from "@/components/ui/select";
import { useEnvarStore } from "@/stores/envarStore";
import { Button } from "@/components/ui/button";
import { FileText, Plus, Code } from "lucide-react";

function TabsList({ tabs, activeTabIds, onTabSelect, onCloseTab, onNewTab, onNewEnv, onOpenEnv }) {
    const envs = useEnvarStore((state) => state.environmentVariables);
    const activeEnv = useEnvarStore((state) => state.activeEnvironment);
    const setActiveEnv = useEnvarStore((state) => state.setActiveEnvironment);

    const handleTabClick = (e, tab) => {
        onTabSelect(tab, e.ctrlKey);
    };

    const getTabIcon = (tab) => {
        if (tab.type === 'env') {
            return <FileText className="h-4 w-4 mr-1" />;
        } else {
            return <Code className="h-4 w-4 mr-1" />;
        }
    };

    const getTabLabel = (tab) => {
        if (tab.type === 'env') {
            return tab.isNew ? 'New Environment' : tab.filename;
        } else {
            return tab.name || `${tab.method} ${tab.url}`;
        }
    };

    return (
        <div className="flex flex-row justify-between items-stretch">
            <div className="overflow-x-auto w-full">
                <div className="flex items-center flex-nowrap border-b">
                    {tabs.map((tab) => {
                        const isActive = activeTabIds.includes(tab.id);
                        return (
                            <div
                                key={tab.id}
                                className={`tab flex select-none justify-between items-center px-2 cursor-pointer border-r hover:bg-gray-300 
                                    ${isActive ? "border-b-2 border-slate-400" : ""}`}
                                onClick={(e) => handleTabClick(e, tab)}
                            >
                                <div className="flex items-center min-w-0 max-w-48 flex-1 truncate m-1 text-sm">
                                    {getTabIcon(tab)}
                                    <span className="truncate">
                                        {getTabLabel(tab)}
                                    </span>
                                </div>
                                <button
                                    className="ml-2 text-red-500"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onCloseTab(tab.id);
                                    }}
                                >
                                    ×
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="flex border-b items-center">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onNewTab}
                    className="px-2 py-2 h-full hover:bg-gray-300 border-l"
                    title="New Request"
                >
                    <Plus className="h-4 w-4" />
                </Button>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onNewEnv}
                    className="px-2 py-2 h-full hover:bg-gray-300 border-l"
                    title="New Environment"
                >
                    <FileText className="h-4 w-4" />
                </Button>
            </div>

        </div>
    );
}

export default TabsList;