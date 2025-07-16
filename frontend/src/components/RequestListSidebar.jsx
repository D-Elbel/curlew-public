import React, { useEffect, useState } from "react";
import {
    GetAllRequestsList,
    GetAllCollections,
    CreateCollection,
    SetRequestCollection,
    UpdateCollectionParent,
} from "../../bindings/github.com/D-Elbel/curlew/requestcrudservice.js";
import { Button } from "@/components/ui/button";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useEnvarStore } from "@/stores/envarStore";
import {
    DndContext,
    useSensor,
    useSensors,
    PointerSensor,
    closestCenter,
    useDraggable,
    useDroppable,
    DragOverlay,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
    ChevronRight,
    ChevronDown,
    FolderClosed,
    FolderOpen,
    File,
    Plus,
    Search,
    MoreHorizontal,
    Trash2,
    Settings,
    Globe,
    Variable,
} from "lucide-react";
import hotkeys from "hotkeys-js";
import { useHotkeys } from "@/services/HotkeysContext.jsx";
import { useRequestStore } from "@/stores/requestStore.js";

const validUUIDRegex =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const buildCollectionTree = (collections) => {
    const collectionMap = {};
    const tree = [];

    collections.forEach((col) => {
        collectionMap[col.id] = { ...col, children: [] };
    });

    collections.forEach((col) => {
        if (col.parentCollectionId && collectionMap[col.parentCollectionId]) {
            collectionMap[col.parentCollectionId].children.push(
                collectionMap[col.id],
            );
        } else {
            tree.push(collectionMap[col.id]);
        }
    });

    return tree;
};

const getMethodColor = (method) => {
    const colors = {
        GET: "text-green-400",
        POST: "text-blue-400",
        PUT: "text-orange-400",
        DELETE: "text-red-400",
        PATCH: "text-yellow-400",
        HEAD: "text-purple-400",
        OPTIONS: "text-gray-400",
    };
    return colors[method?.toUpperCase()] || "text-gray-400";
};

const DraggableRequest = ({ req, onDelete, onRequestSelect, activeDragId }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        setActivatorNodeRef,
    } = useDraggable({
        id: req.id,
        data: { type: "request", name: req.name || `${req.method} ${req.url}` },
    });

    const style = transform
        ? { transform: CSS.Translate.toString(transform) }
        : undefined;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`group flex items-center h-6 text-sm hover:bg-slate-700/50 transition-colors ${
                activeDragId === req.id ? "opacity-50" : ""
            }`}
            onPointerDown={(e) => e.stopPropagation()}
        >
            <div
                className="flex-1 flex items-center cursor-pointer min-w-0"
                onClick={(e) => {
                    e.stopPropagation();
                    onRequestSelect(req, e.ctrlKey);
                }}
            >
                <div className="flex items-center min-w-0 flex-1">
                    <File className="w-3 h-3 mr-1.5 text-slate-400 flex-shrink-0" />
                    <span
                        className={`mr-1.5 font-mono text-[10px] font-semibold flex-shrink-0 ${getMethodColor(
                            req.method,
                        )}`}
                    >
                        {req.method?.toUpperCase() || "GET"}
                    </span>
                    <span className="truncate text-slate-200">
                        {req.name || req.url || "Untitled Request"}
                    </span>
                </div>
            </div>
            <div className="opacity-0 group-hover:opacity-100 flex items-center">
                <Trash2
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(req.id, req.name);
                    }}
                    className="w-3 h-3 ml-1 text-slate-400 hover:text-red-400 cursor-pointer"
                />
                <div
                    ref={setActivatorNodeRef}
                    {...listeners}
                    {...attributes}
                    className="w-3 h-3 ml-1 cursor-move text-slate-500 hover:text-slate-300"
                >
                    <MoreHorizontal className="w-3 h-3" />
                </div>
            </div>
        </div>
    );
};

const CollectionItem = ({
                            collection,
                            allRequests,
                            level = 0,
                            onDeleteCollection,
                            onDeleteRequest,
                            onRequestSelect,
                            activeDragId,
                        }) => {
    const { isOver, setNodeRef: droppableRef } = useDroppable({
        id: collection.id,
    });
    const {
        attributes,
        listeners,
        setNodeRef: draggableRef,
        transform,
        setActivatorNodeRef,
    } = useDraggable({
        id: collection.id,
        data: { type: "collection", name: collection.name },
    });

    const [isOpen, setIsOpen] = useState(true);
    const style = {
        transform: CSS.Translate.toString(transform),
        paddingLeft: `${level * 16}px`,
    };

    const requestsInThisCollection = allRequests.filter(
        (r) => r.collectionId === collection.id,
    );

    const hasChildren = collection.children?.length > 0 || requestsInThisCollection.length > 0;

    return (
        <div
            ref={draggableRef}
            style={style}
            className={`transition-opacity ${
                activeDragId === collection.id ? "opacity-50" : ""
            }`}
        >
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                <div
                    ref={droppableRef}
                    className={`group flex items-center h-6 text-sm hover:bg-slate-700/50 transition-colors ${
                        isOver ? "bg-blue-900/30 ring-1 ring-blue-500/50" : ""
                    }`}
                >
                    <CollapsibleTrigger
                        asChild
                        className="flex-1 flex items-center cursor-pointer"
                        onClick={(e) => {
                            e.preventDefault();
                            if (hasChildren) setIsOpen(!isOpen);
                        }}
                    >
                        <div className="flex items-center min-w-0 flex-1">
                            <div className="w-3 h-3 mr-1 flex items-center justify-center">
                                {hasChildren ? (
                                    isOpen ? (
                                        <ChevronDown className="w-2.5 h-2.5 text-slate-400" />
                                    ) : (
                                        <ChevronRight className="w-2.5 h-2.5 text-slate-400" />
                                    )
                                ) : null}
                            </div>
                            {isOpen ? (
                                <FolderOpen className="w-3 h-3 mr-1.5 text-blue-400 flex-shrink-0" />
                            ) : (
                                <FolderClosed className="w-3 h-3 mr-1.5 text-blue-400 flex-shrink-0" />
                            )}
                            <span className="font-medium text-slate-200 truncate">
                                {collection.name}
                            </span>
                        </div>
                    </CollapsibleTrigger>
                    <div className="opacity-0 group-hover:opacity-100 flex items-center">
                        <Trash2
                            onClick={(e) => {
                                e.stopPropagation();
                                onDeleteCollection(collection.id, collection.name);
                            }}
                            className="w-3 h-3 ml-1 text-slate-400 hover:text-red-400 cursor-pointer"
                        />
                        <div
                            ref={setActivatorNodeRef}
                            {...listeners}
                            {...attributes}
                            className="w-3 h-3 ml-1 cursor-move text-slate-500 hover:text-slate-300"
                        >
                            <MoreHorizontal className="w-3 h-3" />
                        </div>
                    </div>
                </div>
                <CollapsibleContent className="space-y-0">
                    <div style={{ paddingLeft: "16px" }}>
                        {collection.children?.map((child) => (
                            <CollectionItem
                                key={child.id}
                                collection={child}
                                allRequests={allRequests}
                                level={level + 1}
                                onDeleteCollection={onDeleteCollection}
                                onDeleteRequest={onDeleteRequest}
                                onRequestSelect={onRequestSelect}
                                activeDragId={activeDragId}
                            />
                        ))}
                        {requestsInThisCollection.map((req) => (
                            <DraggableRequest
                                key={req.id}
                                req={req}
                                onDelete={onDeleteRequest}
                                onRequestSelect={onRequestSelect}
                                activeDragId={activeDragId}
                            />
                        ))}
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
};

const UncategorizedDroppable = ({ requests, ...props }) => {
    const { isOver, setNodeRef } = useDroppable({ id: "__UNCATEGORIZED__" });
    const [isOpen, setIsOpen] = useState(true);

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <div className="group flex items-center h-6 text-sm hover:bg-slate-700/50 transition-colors cursor-pointer">
                <CollapsibleTrigger asChild className="flex-1 flex items-center">
                    <div className="flex items-center">
                        <div className="w-3 h-3 mr-1 flex items-center justify-center">
                            {isOpen ? (
                                <ChevronDown className="w-2.5 h-2.5 text-slate-400" />
                            ) : (
                                <ChevronRight className="w-2.5 h-2.5 text-slate-400" />
                            )}
                        </div>
                        <FolderClosed className="w-3 h-3 mr-1.5 text-slate-500 flex-shrink-0" />
                        <span className="font-medium text-slate-300">
                            Uncategorized ({requests.length})
                        </span>
                    </div>
                </CollapsibleTrigger>
            </div>
            <CollapsibleContent
                ref={setNodeRef}
                className={`space-y-0 transition-colors ${
                    isOver ? "bg-blue-900/30 ring-1 ring-blue-500/50 rounded" : ""
                }`}
            >
                <div style={{ paddingLeft: "16px" }}>
                    {requests.map((r) => (
                        <DraggableRequest key={r.id} req={r} {...props} />
                    ))}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
};

const Toolbar = ({ onNewCollection, onRefresh }) => (
    <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700">
        <div className="flex items-center space-x-1">
            <span className="text-sm font-medium text-slate-300">Collections</span>
        </div>
        <div className="flex items-center space-x-1">
            <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 hover:bg-slate-700"
                onClick={onNewCollection}
            >
                <Plus className="w-3 h-3" />
            </Button>
            <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 hover:bg-slate-700"
                onClick={onRefresh}
            >
                <Settings className="w-3 h-3" />
            </Button>
        </div>
    </div>
);

const SearchBar = ({ value, onChange }) => (
    <div className="relative px-3 py-2">
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-3 h-3 text-slate-400" />
        <Input
            className="h-7 pl-6 text-sm bg-slate-800 border-slate-600 focus:border-blue-500"
            placeholder="Search..."
            value={value}
            onChange={(e) => onChange(e.target.value)}
        />
    </div>
);

function Sidebar({ selectedTab, setSelectedTab, collapsed, setCollapsed }) {
    const { hotkeysMap } = useHotkeys();
    const openSidebarHotkey = hotkeysMap.OPEN_SIDEBAR;

    const handleToggle = (tab) => {
        if (selectedTab === tab) {
            setCollapsed(!collapsed);
        } else {
            setCollapsed(false);
            setSelectedTab(tab);
        }
    };

    useEffect(() => {
        const fn = (e) => {
            e.preventDefault();
            setCollapsed(!collapsed);
        };
        hotkeys(openSidebarHotkey, fn);
        return () => hotkeys.unbind(openSidebarHotkey, fn);
    }, [collapsed, openSidebarHotkey, setCollapsed]);

    return (
        <div className="flex flex-col items-center p-1">
            <Button
                className={`mb-2 w-12 h-12 ${
                    selectedTab === "collections" ? "ring-3" : ""
                }`}
                onClick={() => handleToggle("collections")}
            >
                <FolderClosed className="w-6 h-6" />
            </Button>
            <Button
                className={`w-12 h-12 ${
                    selectedTab === "environments" ? "ring-3" : ""
                }`}
                onClick={() => handleToggle("environments")}
            >
                <Variable className="w-6 h-6" />
            </Button>
        </div>
    );
}

export default function RequestListSidebar({
                                               onRequestSelect,
                                               onEnvSelect,
                                               collapsed,
                                               setCollapsed,
                                               selectedTab,
                                               setSelectedTab,
                                           }) {
    const requests = useRequestStore((state) => state.requests);
    const collections = useRequestStore((state) => state.collections);
    const loadAll = useRequestStore((state) => state.loadAll);
    const deleteRequest = useRequestStore((state) => state.deleteRequest);
    const deleteCollection = useRequestStore((state) => state.deleteCollection);

    const [isDialogOpen, setDialogOpen] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState("");
    const [activeDragId, setActiveDragId] = useState(null);
    const [activeDragItem, setActiveDragItem] = useState(null);
    const [collectionSearch, setCollectionSearch] = useState("");
    const [isNewFileOpen, setIsNewFileOpen] = useState(false);
    const [newFileName, setNewFileName] = useState("");

    useEffect(() => {
        if (selectedTab === "collections") {
            loadAll().catch(console.error);
        }
    }, [selectedTab, loadAll]);

    const envs = useEnvarStore((state) => state.environmentVariables);
    const sensors = useSensors(useSensor(PointerSensor));

    const handleDragStart = ({ active }) => {
        setActiveDragId(active.id);
        setActiveDragItem(active.data.current);
    };

    const handleDragEnd = ({ active, over }) => {
        setActiveDragId(null);
        setActiveDragItem(null);
        if (!over || active.id === over.id) return;

        const draggedItemType = active.data.current?.type;
        const targetId = over.id;

        if (draggedItemType === "request") {
            const newColId = targetId === "__UNCATEGORIZED__" ? null : targetId;
            SetRequestCollection(active.id, newColId)
                .then(loadAll)
                .catch(console.error);
        } else if (draggedItemType === "collection") {
            const newParentId = targetId === "__UNCATEGORIZED__" ? null : targetId;
            UpdateCollectionParent(active.id, newParentId)
                .then(loadAll)
                .catch(console.error);
        }
    };

    const handleCreateCollection = () => {
        if (!newCollectionName.trim()) return;
        CreateCollection(newCollectionName.trim(), "", null)
            .then(() => {
                setNewCollectionName("");
                setDialogOpen(false);
                loadAll();
            })
            .catch(console.error);
    };

    const handleDeleteRequest = async (id, name) => {
        if (
            window.confirm(
                `Delete request "${name || "this unnamed request"}"?`,
            )
        ) {
            await deleteRequest(id);
        }
    };

    const handleDeleteCollection = async (id, name) => {
        if (
            window.confirm(
                `Delete collection "${name}"? This will orphan its requests and sub-collections.`,
            )
        ) {
            await deleteCollection(id);
        }
    };

    const renderCollectionsTab = () => {
        const collectionTree = buildCollectionTree(collections);
        const uncategorizedRequests = requests.filter(
            (req) => !req.collectionId || !validUUIDRegex.test(req.collectionId),
        );

        return (
            <div className="flex flex-col h-full">
                <Toolbar
                    onNewCollection={() => setDialogOpen(true)}
                    onRefresh={loadAll}
                />
                <SearchBar
                    value={collectionSearch}
                    onChange={setCollectionSearch}
                />
                <div className="flex-1 overflow-auto px-1">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                    >
                        <div className="space-y-0">
                            {collectionTree.map((collection) => (
                                <CollectionItem
                                    key={collection.id}
                                    collection={collection}
                                    allRequests={requests}
                                    onDeleteCollection={handleDeleteCollection}
                                    onDeleteRequest={handleDeleteRequest}
                                    onRequestSelect={onRequestSelect}
                                    activeDragId={activeDragId}
                                />
                            ))}
                            {uncategorizedRequests.length > 0 && (
                                <UncategorizedDroppable
                                    requests={uncategorizedRequests}
                                    onDelete={handleDeleteRequest}
                                    onRequestSelect={onRequestSelect}
                                    activeDragId={activeDragId}
                                />
                            )}
                        </div>
                        <DragOverlay>
                            {activeDragId && (
                                <div className="flex items-center h-6 px-2 bg-slate-800 rounded shadow-lg border border-slate-600">
                                    <File className="w-3 h-3 mr-1.5 text-slate-400" />
                                    <span className="text-sm text-slate-200">
                                        {activeDragItem?.name}
                                    </span>
                                </div>
                            )}
                        </DragOverlay>
                    </DndContext>
                </div>

                <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
                    <DialogContent className="bg-slate-800 border-slate-600">
                        <DialogHeader>
                            <DialogTitle className="text-slate-200">
                                Create Collection
                            </DialogTitle>
                        </DialogHeader>
                        <div className="pt-2">
                            <Input
                                className="bg-slate-700 border-slate-600 text-slate-200"
                                placeholder="Collection Name"
                                value={newCollectionName}
                                onChange={(e) => setNewCollectionName(e.target.value)}
                            />
                        </div>
                        <DialogFooter>
                            <Button onClick={handleCreateCollection}>Create</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        );
    };

    const renderEnvironmentsTab = () => (
        <div className="flex flex-col h-full ">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700">
                <span className="text-sm font-medium text-slate-300">
                    Environments
                </span>
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 hover:bg-slate-700"
                    onClick={() => setIsNewFileOpen(true)}
                >
                    <Plus className="w-3 h-3" />
                </Button>
            </div>
            <div className="flex-1 overflow-auto px-1 py-2">
                {envs.map((env) => (
                    <div
                        key={env.env}
                        className="flex items-center justify-between h-6 px-2 text-sm hover:bg-slate-700/50 rounded cursor-pointer"
                        onClick={() => onEnvSelect(env.env, false)}
                    >
                        <div className="flex items-center min-w-0 flex-1">
                            <Globe className="w-3 h-3 mr-1.5 text-green-400 flex-shrink-0" />
                            <span className="truncate">{env.env}</span>
                        </div>
                        <span className="text-slate-400 ml-2">
                            {Object.keys(env.variables).length}
                        </span>
                    </div>
                ))}
            </div>

            <Dialog open={isNewFileOpen} onOpenChange={setIsNewFileOpen}>
                <DialogContent className="bg-slate-800 border-slate-600">
                    <DialogHeader>
                        <DialogTitle className="text-slate-200">
                            Create Environment File
                        </DialogTitle>
                    </DialogHeader>
                    <div className="pt-2">
                        <Input
                            className="bg-slate-700 border-slate-600 text-slate-200"
                            placeholder="Filename"
                            value={newFileName}
                            onChange={(e) => setNewFileName(e.target.value)}
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            onClick={() => {
                                if (newFileName.trim()) {
                                    onEnvSelect(newFileName.trim(), true);
                                    setNewFileName("");
                                    setIsNewFileOpen(false);
                                }
                            }}
                        >
                            Create
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );

    return (
        <div className="flex h-screen">
            <Sidebar
                selectedTab={selectedTab}
                setSelectedTab={setSelectedTab}
                collapsed={collapsed}
                setCollapsed={setCollapsed}
            />
            {!collapsed && (
                <div className="flex-1 min-w-0">
                    {selectedTab === "collections"
                        ? renderCollectionsTab()
                        : renderEnvironmentsTab()}
                </div>
            )}
        </div>
    );
}