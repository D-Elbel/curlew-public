import React, { useEffect, useState, useRef } from "react";
import {
    CreateCollection,
    SetRequestCollection,
    UpdateCollectionParent,
    SetRequestSortOrder
} from "../../bindings/github.com/D-Elbel/curlew/requestcrudservice.js";
import { ImportPostmanCollection } from "../../bindings/github.com/D-Elbel/curlew/fileservice.js";
import { Button } from "@/components/ui/button";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
    Upload,
    FileText,
} from "lucide-react";
import hotkeys from "hotkeys-js";
import { useHotkeys } from "@/services/HotkeysContext.jsx";
import { useRequestStore } from "@/stores/requestStore.js";
import { methodColourMap} from "@/utils/constants.js";
import { buildCollectionTree } from "@/utils/collections.js";

const validUUIDRegex =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;



const DraggableRequest = ({ req, onDelete, onRequestSelect, activeDragId, index }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        isDragging,
        setActivatorNodeRef,
    } = useDraggable({
        id: `request-${req.id}`,
        data: {
            type: "request",
            name: req.name || `${req.method} ${req.url}`,
            requestId: req.id,
            collectionId: req.collectionId,
            currentIndex: index
        },
    });

    const style = transform
        ? { transform: CSS.Translate.toString(transform) }
        : undefined;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`group flex items-center h-6 text-sm hover:bg-slate-700/50 transition-colors ${
                isDragging ? "opacity-50" : ""
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
                        className={`mr-1.5 font-mono text-[10px] font-semibold flex-shrink-0 ${methodColourMap.get(
                            req.method
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

const RequestDropZone = ({ collectionId, index, isLast = false }) => {
    const { isOver, setNodeRef } = useDroppable({
        id: `drop-zone-${collectionId}-${index}`,
        data: {
            type: "request-drop-zone",
            collectionId,
            targetIndex: index
        }
    });

    return (
        <div
            ref={setNodeRef}
            className={`h-1 transition-all duration-200 ${
                isOver ? "h-2 bg-blue-500/50 rounded" : ""
            }`}
        />
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
        data: { type: "collection" }
    });
    const {
        attributes,
        listeners,
        setNodeRef: draggableRef,
        transform,
        setActivatorNodeRef,
    } = useDraggable({
        id: `collection-${collection.id}`,
        data: { type: "collection", name: collection.name, collectionId: collection.id },
    });

    const [isOpen, setIsOpen] = useState(true);
    const style = {
        transform: CSS.Translate.toString(transform),
        paddingLeft: `${level * 16}px`,
    };

    const requestsInThisCollection = allRequests
        .filter((r) => r.collectionId === collection.id)
        .sort((a, b) => {
            const aOrder = a.sortOrder ?? a.id;
            const bOrder = b.sortOrder ?? b.id;
            return aOrder - bOrder;
        });

    const hasChildren = collection.children?.length > 0 || requestsInThisCollection.length > 0;

    return (
        <div
            ref={draggableRef}
            style={style}
            className={`transition-opacity ${
                activeDragId === `collection-${collection.id}` ? "opacity-50" : ""
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

                        {/* Render requests with drop zones */}
                        {requestsInThisCollection.length > 0 && (
                            <>
                                <RequestDropZone collectionId={collection.id} index={0} />
                                {requestsInThisCollection.map((req, index) => (
                                    <React.Fragment key={req.id}>
                                        <DraggableRequest
                                            req={req}
                                            index={index}
                                            onDelete={onDeleteRequest}
                                            onRequestSelect={onRequestSelect}
                                            activeDragId={activeDragId}
                                        />
                                        <RequestDropZone
                                            collectionId={collection.id}
                                            index={index + 1}
                                            isLast={index === requestsInThisCollection.length - 1}
                                        />
                                    </React.Fragment>
                                ))}
                            </>
                        )}
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
};

const UncategorizedDroppable = ({ requests, ...props }) => {
    const { isOver, setNodeRef } = useDroppable({ id: "__UNCATEGORIZED__" });
    const [isOpen, setIsOpen] = useState(true);

    const sortedRequests = requests.sort((a, b) => {
        const aOrder = a.sortOrder ?? a.id;
        const bOrder = b.sortOrder ?? b.id;
        return aOrder - bOrder;
    });

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
                    {sortedRequests.length > 0 && (
                        <>
                            <RequestDropZone collectionId={null} index={0} />
                            {sortedRequests.map((req, index) => (
                                <React.Fragment key={req.id}>
                                    <DraggableRequest
                                        req={req}
                                        index={index}
                                        {...props}
                                    />
                                    <RequestDropZone
                                        collectionId={null}
                                        index={index + 1}
                                        isLast={index === sortedRequests.length - 1}
                                    />
                                </React.Fragment>
                            ))}
                        </>
                    )}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
};

// Import Modal Component
const ImportModal = ({ isOpen, onClose, onImport }) => {
    //TODO: enum file/string
    const [importMethod, setImportMethod] = useState("file");
    const [jsonText, setJsonText] = useState("");
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef(null);

    //TODO: native warnings instead of alerts
    const handleFileSelect = (file) => {
        if (file && file.type === "application/json") {
            const reader = new FileReader();
            reader.onload = (e) => {
                setJsonText(e.target.result);
            };
            reader.readAsText(file);
        } else {
            alert("Please select a valid JSON file");
        }
    };

    const handleImport = async () => {
        if (!jsonText.trim()) {
            alert("Please provide JSON content to import");
            return;
        }

        setIsImporting(true);
        try {
            await onImport(jsonText);
            setJsonText("");
            onClose();
        } catch (error) {
            console.error("Import failed:", error);
            alert(`Import failed: ${error.message || "Unknown error"}`);
        } finally {
            setIsImporting(false);
        }
    };

    const resetModal = () => {
        setJsonText("");
        setImportMethod("file");
        setIsImporting(false);
    };

    useEffect(() => {
        if (!isOpen) {
            resetModal();
        }
    }, [isOpen]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Import Postman Collection</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="flex space-x-2">
                        <Button
                            variant={importMethod === "file" ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                                setImportMethod("file");
                                setJsonText("");
                            }}
                            className="flex items-center space-x-1"
                        >
                            <Upload className="w-3 h-3" />
                            <span>File Upload</span>
                        </Button>
                        <Button
                            variant={importMethod === "text" ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                                setImportMethod("text");
                                setJsonText("");
                            }}
                            className="flex items-center space-x-1"
                        >
                            <FileText className="w-3 h-3" />
                            <span>Paste JSON</span>
                        </Button>
                    </div>
                    <div className="flex items-center space-x-2"></div>
                    {importMethod === "file" && (
                        <div className="rounded-lg">
                            <div className="flex items-center gap-2">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".json,application/json"
                                    onChange={(e) => {
                                        if (e.target.files?.[0]) {
                                            handleFileSelect(e.target.files[0]);
                                        }
                                    }}
                                    className="flex-1 block w-full text-sm file:mr-4 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:opacity-90"
                                />
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        if (fileInputRef.current?.files?.length) {
                                            fileInputRef.current.value = "";
                                        }
                                        setJsonText("");
                                    }}
                                    className="shrink-0"
                                >
                                    Clear
                                </Button>
                            </div>
                            {fileInputRef.current?.files?.[0] && (
                                <p className="text-sm mt-2">
                                    File selected:{" "}
                                    <span className="font-semibold">
                {fileInputRef.current.files[0].name}
              </span>
                                </p>
                            )}
                        </div>
                    )}

                    {/* Text Area */}
                    {importMethod === "text" && (
                        <div>
                            <label className="block text-sm font-medium mb-2">
                                Paste your Postman collection JSON:
                            </label>
                            <Textarea
                                className="min-h-[200px] max-h-[360px] overflow-auto font-mono text-sm"
                                placeholder="Paste your Postman collection JSON here..."
                                value={jsonText}
                                onChange={(e) => setJsonText(e.target.value)}
                            />
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isImporting}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleImport}
                        disabled={!jsonText.trim() || isImporting}
                    >
                        {isImporting ? "Importing..." : "Import Collection"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>    );
};

const Toolbar = ({ onNewCollection, onRefresh, onImport }) => (
    <div className="flex items-center justify-between px-3 py-1.5 border-b ">
        <div className="flex items-center space-x-1">
            <span className="text-sm font-medium ">Collections</span>
        </div>
        <div className="flex items-center space-x-1">
            <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 hover:bg-slate-700"
                onClick={onImport}
                title="Import Collection"
            >
                <Upload className="w-3 h-3" />
            </Button>
            <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 hover:bg-slate-700"
                onClick={onNewCollection}
                title="New Collection"
            >
                <Plus className="w-3 h-3" />
            </Button>
            <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 hover:bg-slate-700"
                onClick={onRefresh}
                title="Refresh"
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
    const [isImportOpen, setImportOpen] = useState(false);
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

    const handleDragEnd = async ({ active, over }) => {
        setActiveDragId(null);
        setActiveDragItem(null);
        if (!over || active.id === over.id) return;

        const draggedItemType = active.data.current?.type;
        const targetData = over.data.current;

        if (draggedItemType === "request") {
            const requestId = active.data.current.requestId;
            const currentCollectionId = active.data.current.collectionId;

            if (targetData?.type === "collection" && over.id !== currentCollectionId) {
                const newColId = over.id === "__UNCATEGORIZED__" ? null : over.id;
                try {
                    await SetRequestCollection(requestId, newColId);
                    await loadAll();
                } catch (error) {
                    console.error("Failed to move request to collection:", error);
                }
            }
            else if (targetData?.type === "request-drop-zone") {
                const targetCollectionId = targetData.collectionId;
                const targetIndex = targetData.targetIndex;

                if (currentCollectionId === targetCollectionId) {
                    try {
                        await SetRequestSortOrder(requestId, targetIndex);
                        await loadAll();
                    } catch (error) {
                        console.error("Failed to reorder request:", error);
                    }
                }
            }
        } else if (draggedItemType === "collection") {
            const collectionId = active.data.current.collectionId;
            const newParentId = over.id === "__UNCATEGORIZED__" ? null : over.id;
            if (newParentId && newParentId === collectionId) {
                return;
            }
            try {
                await UpdateCollectionParent(collectionId, newParentId);
                await loadAll();
            } catch (error) {
                console.error("Failed to move collection:", error);
            }
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

    const handleImportCollection = async (jsonContent) => {
        try {
            await ImportPostmanCollection(jsonContent);
            await loadAll(); // Refresh the collections list
            console.log("Collection imported successfully");
        } catch (error) {
            console.error("Failed to import collection:", error);
            throw error; // Re-throw to be handled by the modal
        }
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
                    onImport={() => setImportOpen(true)}
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

                {/* Create Collection Dialog */}
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

                {/* Import Collection Modal */}
                <ImportModal
                    isOpen={isImportOpen}
                    onClose={() => setImportOpen(false)}
                    onImport={handleImportCollection}
                />
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
