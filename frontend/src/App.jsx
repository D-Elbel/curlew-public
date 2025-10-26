import React, { useEffect, useState } from 'react';
import RequestListSidebar from './components/RequestListSidebar';
import TabsList from './components/TabsList';
import RequestView from './components/RequestView';
import EnvFileView from './components/EnvFileView.jsx';
import './App.css';
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from "@/components/ui/resizable";
import CommandMenu from '@/components/CommandMenu.jsx';
import TabMenu from '@/components/TabMenu.jsx';
import { ScanEnvars } from '../bindings/github.com/D-Elbel/curlew/envarservice.js';
import { useEnvarStore } from '@/stores/envarStore.js';
import {
    CommandDialog,
    Command,
    CommandInput,
    CommandList,
    CommandItem,
    CommandEmpty,
} from "@/components/ui/command";
import { useHotkeys} from "@/services/HotkeysContext.jsx";
import hotkeys from "hotkeys-js";
import { AcknowledgeShutdown, LoadState, SaveState } from '../bindings/github.com/D-Elbel/curlew/appstateservice.js';
import {Events} from "@wailsio/runtime";
import TopToolbar from "@/components/TopToolbar.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx"
import { useUserSettings } from "@/services/UserSettingsContext.jsx";

function App() {
    const { hotkeysMap } = useHotkeys();
    const { settings: userSettings } = useUserSettings();
    const [tabs, setTabs] = useState([]);
    const [activeViews, setActiveViews] = useState([]);
    const [selectedTab, setSelectedTab] = useState('collections');
    const [openEnvSelect, setOpenEnvSelect] = useState(false);
    const envs = useEnvarStore(state => state.environmentVariables);
    const activeEnv = useEnvarStore(state => state.activeEnvironment);
    const setActiveEnv = useEnvarStore(state => state.setActiveEnvironment);
    const setEnvironmentVariables = useEnvarStore(state => state.setEnvironmentVariables);
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        async function loadState() {
            try {
                const stateJson = await LoadState();
                if (stateJson) {
                    const {
                        tabs: savedTabs = [],
                        activeViews: savedActiveViews = [],
                        activeEnv: savedActiveEnv = null
                    } = JSON.parse(stateJson);
                    setTabs(savedTabs);
                    setActiveViews(savedActiveViews);
                    if (savedActiveEnv != null) {
                        setActiveEnv(savedActiveEnv);
                    }
                }
            } catch (err) {
                console.error("Failed to load saved UI state:", err);
            }
        }
        loadState();
    }, [setActiveEnv]);

    useEffect(() => {
        const off = Events.On('SHUTDOWN', async () => {
            console.log("Shutting down (JS) – saving UI state…");
            await SaveState(JSON.stringify({ tabs, activeViews, activeEnv }));
            await AcknowledgeShutdown();
        });
        return () => {
            off();
        };
    }, [tabs, activeViews, activeEnv]);

    useEffect(() => {
        if (typeof document === "undefined") {
            return;
        }
        const root = document.documentElement;
        if (!root) {
            return;
        }
        const theme = (userSettings?.theme || "dark").toLowerCase();
        root.classList.remove("dark", "light");
        root.classList.add(theme === "light" ? "light" : "dark");
    }, [userSettings?.theme]);

    useEffect(() => {
        async function fetchEnvars() {
            const envs = await ScanEnvars();
            setEnvironmentVariables(envs);
        }
        fetchEnvars();
    }, [setEnvironmentVariables]);

    const handleTabSelect = (tab, ctrlClick) => {
        if (!tabs.find((t) => t.id === tab.id)) {
            setTabs([...tabs, tab]);
        }
        if (ctrlClick) {
            setActiveViews((prev) => [...prev, tab]);
        } else {
            setActiveViews([tab]);
        }
    };

    const handleRequestSelect = (req, ctrlClick) => {
        const requestTab = {
            ...req,
            type: 'request'
        };
        handleTabSelect(requestTab, ctrlClick);
    };

    const handleCloseTab = (tabId) => {
        setTabs(tabs.filter((t) => t.id !== tabId));
        setActiveViews(activeViews.filter((v) => v.id !== tabId));
    };

    const handleNewTab = () => {
        const newRequest = {
            id: Date.now().toString(),
            name: 'Untitled Request',
            method: 'GET',
            url: '',
            headers: '', 
            body: '',
            isNew: true,
            type: 'request'
        };
        setTabs([...tabs, newRequest]);
        setActiveViews([newRequest]);
    };

    const openEnvPanel = (filename, isNew = false) => {
        const envTab = {
            id: Date.now().toString(),
            filename,
            isNew,
            name: isNew ? 'New Environment' : filename,
            type: 'env'
        };
        setTabs((prev) => [...prev, envTab]);
        setActiveViews([envTab]);
    };

    const handleNewEnv = () => {
        openEnvPanel('', true);
    };

    const handleOpenEnv = () => {
        setOpenEnvSelect(true);
    };

    const handleEnvSelect = (envName) => {
        openEnvPanel(envName, false);
        setOpenEnvSelect(false);
    };

    const newEnvHotkey = hotkeysMap.NEW_ENV;
    const openEnvHotkey = hotkeysMap.OPEN_ENV;
    const newRequestHotkey = hotkeysMap.NEW_REQUEST;

    useEffect(() => {
        const fn = (e) => {
            e.preventDefault();
            openEnvPanel('', true);
        };
        hotkeys(newEnvHotkey, fn);
        return () => hotkeys.unbind(newEnvHotkey, fn);
    }, [newEnvHotkey]);

    useEffect(() => {
        const fn = (e) => {
            e.preventDefault();
            setOpenEnvSelect(true);
        };
        hotkeys(openEnvHotkey, fn);
        return () => hotkeys.unbind(openEnvHotkey, fn);
    }, [openEnvHotkey]);

    useEffect(() => {
        const fn = (e) => {
            e.preventDefault();
            const newRequest = {
                id: Date.now().toString(),
                name: "Untitled Request",
                method: "GET",
                url: "",
                headers: '', // No default Content-Type
                body: "",
                isNew: true,
                type: 'request'
            };
            setTabs(prev => [...prev, newRequest]);
            setActiveViews([newRequest]);
        };
        hotkeys(newRequestHotkey, fn);
        return () => hotkeys.unbind(newRequestHotkey, fn);
    }, [newRequestHotkey]);

    return (
        <div className="flex flex-col  h-screen w-screen overflow-hidden">
            <TopToolbar></TopToolbar>
            <div className="app-container flex">

                <CommandMenu onSelect={handleRequestSelect}/>
                <TabMenu
                    onSelect={handleRequestSelect}
                    tabs={tabs}
                    activeTabIds={activeViews.map(v => v.id)}
                    onNewTab={handleNewTab}
                    onNewEnv={handleNewEnv}
                    onOpenEnv={handleOpenEnv}
                />
                <CommandDialog open={openEnvSelect} onOpenChange={setOpenEnvSelect}>
                    <Command shouldFilter={false}>
                        <CommandInput placeholder="Select an environment…"/>
                        <CommandList>
                            {envs.map(envFile => (
                                <CommandItem
                                    key={envFile.env}
                                    onSelect={() => handleEnvSelect(envFile.env)}
                                >
                                    {envFile.env}
                                </CommandItem>
                            ))}
                            <CommandEmpty>No environments found.</CommandEmpty>
                        </CommandList>
                    </Command>
                </CommandDialog>
                <div
                    className={`sidebar-wrapper transition-all duration-300 ease-in-out ${collapsed ? 'w-12 mr-1' : 'w-1/4'}`}>
                    <RequestListSidebar
                        onRequestSelect={handleRequestSelect}
                        onEnvSelect={openEnvPanel}
                        collapsed={collapsed}
                        setCollapsed={setCollapsed}
                        selectedTab={selectedTab}
                        setSelectedTab={setSelectedTab}
                    />
                </div>
                <div className="main-content flex flex-col flex-1 min-w-0">
                    <TabsList
                        tabs={tabs}
                        activeTabIds={activeViews.map((v) => v.id)}
                        onTabSelect={handleTabSelect}
                        onCloseTab={handleCloseTab}
                        onNewTab={handleNewTab}
                        onNewEnv={handleNewEnv}
                        onOpenEnv={handleOpenEnv}
                    />

                    {activeViews.length > 0 ? (
                        <div className="request-views-container flex flex-grow overflow-hidden p-1">
                            <ResizablePanelGroup direction="horizontal">
                                {activeViews.map((view) => (
                                    <React.Fragment key={view.id}>
                                        <ResizablePanel className="flex-1 min-w-0 overflow-auto">
                                            {view.type === 'request' ? (
                                                <ErrorBoundary>
                                                    <RequestView  request={view}/>
                                                </ErrorBoundary>

                                            ) : (
                                                <EnvFileView
                                                    filename={view.filename}
                                                    isNew={view.isNew}
                                                    onClose={() => handleCloseTab(view.id)}
                                                />
                                            )}
                                        </ResizablePanel>
                                        <ResizableHandle withHandle/>
                                    </React.Fragment>
                                ))}
                            </ResizablePanelGroup>
                        </div>
                    ) : (
                        <div className="flex w-full h-full items-center justify-center">
                            <div>You have no open requests or files</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default App;
