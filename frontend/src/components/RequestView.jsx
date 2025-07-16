import React, { useState, useEffect, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { ExecuteRequest, SaveRequest, GetRequest, UpdateRequest } from "../../bindings/github.com/D-Elbel/curlew/requestcrudservice.js";
import { githubDark } from "@uiw/codemirror-theme-github";
import { Input } from "@/components/ui/input.js";
import { EnvarSupportedInput } from "@/components/EnvarSupportedInput.jsx";
import { useEnvarStore } from "@/stores/envarStore.js";
import { methodColourMap } from "../utils/constants.js";
import { useRequestStore } from "@/stores/requestStore.js"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog.js";
import { Button } from "@/components/ui/button.js";
import { Separator } from "@/components/ui/separator"
import { HotkeysProvider, useHotkeys } from "@/services/HotkeysContext.jsx";
import hotkeys from "hotkeys-js";

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

const CollectionItem = ({
                            collection,
                            level = 0,
                            handleSaveRequestToCollection
                        }) => {
    const style = {
        paddingLeft: `${level * 1.25}rem`,
    };
    console.log(collection)
    return (
        <div
            style={style}
            className={`rounded mt-1`}
        >
            <div className="flex flex-row justify-between">
                <div>
                    <p>| {collection.name}</p>
                </div>
                <Button onClick={() => handleSaveRequestToCollection(collection.id)}>+</Button>
            </div>
            {collection.children?.map((child) => (
                <CollectionItem
                    handleSaveRequestToCollection={handleSaveRequestToCollection}
                    collection={child}
                    level={level + 1}
                />
            ))}
        </div>
    );
};

function RequestView({ request }) {
    const { hotkeysMap } = useHotkeys();
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [method, setMethod] = useState(request?.method || "GET");
    const [collectionName, setCollectionName] = useState(request?.collectionName || "");
    const [url, setUrl] = useState(request?.url || "");
    const [auth, setAuth] = useState(request?.auth || "");
    const [name, setName] = useState(request?.name || "Untitled Request");
    const [bodyFormat, setBodyFormat] = useState(request?.bodyFormat || "JSON");
    const [description, setDescription] = useState(request?.description || "");
    const [activeTab, setActiveTab] = useState("body");
    const [headerType, setHeaderType] = useState("raw");
    const [headersKV, setHeadersKV] = useState([{ key: "", value: "" }]);
    const [headersRaw, setHeadersRaw] = useState(request?.headers || '{"Content-Type":"application/json"}');
    const [headersExpanded, setHeadersExpanded] = useState(false);
    const [bodyType, setBodyType] = useState(request?.bodyType || "none");
    const [bodyRaw, setBodyRaw] = useState(request?.body || "");
    const [graphqlQuery, setGraphqlQuery] = useState("");
    const [graphqlVariables, setGraphqlVariables] = useState("{}");
    const [responseData, setResponseData] = useState(null);
    const [responseHeaders, setResponseHeaders] = useState("");
    const [responseBody, setResponseBody] = useState("");
    const [fullRequest, setFullRequest] = useState(null);
    const [responseTab, setResponseTab] = useState("body");
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const envs = useEnvarStore(state => state.environmentVariables);
    const activeEnv = useEnvarStore(state => state.activeEnvironment);
    const collections = useRequestStore((state) => state.collections);
    const collectionTree = buildCollectionTree(collections)
    console.log("collection tree")
    console.log(collectionTree)

    const isInitialAutosave = useRef(true);
    const saveTimeout = useRef(null);
    const isSyncingFromSave = useRef(false);

    useEffect(() => {
        const fn = (e) => {
            e.preventDefault();
            setIsDialogOpen(true)
        };
        hotkeys(hotkeysMap.HANDLE_ENTITY_SAVE, fn);
        return () => hotkeys.unbind(hotkeysMap.HANDLE_ENTITY_SAVE, fn);
    }, [hotkeysMap.HANDLE_ENTITY_SAVE]);

    useEffect(() => {
        if (!request?.id || request.isNew) return;
        (async () => {
            try {
                const fetched = await GetRequest(request.id);
                setFullRequest(fetched);
            } catch (e) {
                console.error(e);
                setErrorMessage("Failed to fetch request details.");
            }
        })();
    }, [request?.id, request.isNew]);

    useEffect(() => {
        if (!fullRequest) return;
        if (isSyncingFromSave.current) {
            isSyncingFromSave.current = false;
            return;
        }
        setMethod(fullRequest.method || "GET");
        setUrl(fullRequest.url || "");
        setAuth(fullRequest.auth || "");
        setName(fullRequest.name || "Untitled Request");
        setDescription(fullRequest.description || "");
        setBodyFormat(fullRequest.bodyFormat || "JSON");
        setCollectionName(fullRequest.collectionName || "");
        try {
            const parsed = JSON.parse(fullRequest.headers);
            if (Array.isArray(parsed) && parsed.every(h => "key" in h && "value" in h)) {
                setHeaderType("keyvalue");
                setHeadersKV(parsed.length ? parsed : [{ key: "", value: "" }]);
            } else {
                setHeaderType("raw");
                setHeadersRaw(fullRequest.headers);
            }
        } catch {
            setHeaderType("keyvalue");
            setHeadersKV([{ key: "", value: "" }]);
        }
        const bt = fullRequest.bodyType || "none";
        setBodyType(bt);
        switch (bt) {
            case "raw":
                setBodyRaw(fullRequest.body || "");
                break;
            case "graphql":
                try {
                    const { query, variables } = JSON.parse(fullRequest.body);
                    setGraphqlQuery(query || "");
                    setGraphqlVariables(JSON.stringify(variables || {}, null, 2));
                } catch {
                    setGraphqlQuery("");
                    setGraphqlVariables("{}");
                }
                break;
            default:
                setBodyRaw("");
        }
        setResponseData(null);
        setResponseHeaders("");
        setResponseBody("");
        setErrorMessage("");
    }, [fullRequest]);

    const renderCollectionsTab = () => {
        const collectionTree = buildCollectionTree(collections);
        console.log(collectionTree)
        return (
            <div className="p-1 overflow-auto selectable">
                <Separator className={`mb-2`}/>
                {collectionTree.map((collection) => (
                    <CollectionItem
                        handleSaveRequestToCollection={handleSaveRequestToCollection}
                        collection={collection}
                    />
                ))}
            </div>
        );
    };

    const buildSavePayload = () => {
        let headers = "";
        let saveBody = "";
        JSON.parse(headerType === "raw" ? headersRaw : JSON.stringify(headersKV.filter(h => h.key.trim())));
        if (headerType === "raw") {
            headers = headersRaw;
        } else {
            headers = JSON.stringify(headersKV.filter(h => h.key.trim()));
        }
        switch (bodyType) {
            case "raw":
                saveBody = bodyRaw;
                break;
            case "graphql":
                JSON.parse(graphqlVariables);
                saveBody = JSON.stringify({
                    query: graphqlQuery,
                    variables: JSON.parse(graphqlVariables),
                });
                break;
            default:
                saveBody = "";
        }
        return { headers, saveBody };
    };

    const saveRequest = useRequestStore(state => state.saveRequest)

    const handleSaveRequest = async () => {
        setIsLoading(true)
        console.log(fullRequest)
        console.log(url)
        try {
            const saved = await saveRequest({
                id:        fullRequest?.id,
                collectionId: request.collectionId,
                name,
                description: description,
                method,
                requestUrl: url,
                headers: headersRaw,
                body:    bodyRaw,
                bodyType: bodyType,
                bodyFormat: bodyFormat,
                auth: auth
            })
        } catch (e) {
            console.error(e)
            setErrorMessage("Save failed.")
        } finally {
            setIsLoading(false)
        }
    }

    const handleSaveRequestToCollection = async (collectionId) => {
        setIsLoading(true)
        setIsDialogOpen(true)
        try {
            const saved = await saveRequest({
                id:        fullRequest?.id,
                collectionId: collectionId,
                name,
                description: description,
                method,
                requestUrl: url,
                headers: headersRaw,
                body:    bodyRaw,
                bodyType: bodyType,
                bodyFormat: bodyFormat,
                auth: auth
            })
            setIsDialogOpen(false)
        } catch (e) {
            console.error(e)
            setErrorMessage("Save failed.")
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        if (!fullRequest?.id) return;
        if (isInitialAutosave.current) {
            isInitialAutosave.current = false;
            return;
        }
        clearTimeout(saveTimeout.current);
        saveTimeout.current = setTimeout(handleSaveRequest, 1000);
        return () => clearTimeout(saveTimeout.current);
    }, [
        fullRequest?.id,
        method,
        url,
        auth,
        name,
        description,
        bodyFormat,
        headerType,
        headersRaw,
        headersKV,
        bodyType,
        bodyRaw,
        graphqlQuery,
        graphqlVariables,
    ]);

    const handleExecute = async () => {
        setIsLoading(true);
        setErrorMessage("");
        setResponseData(null);
        let finalHeaders = '';
        try {
            if (headerType === "raw") {
                JSON.parse(headersRaw);
                finalHeaders = headersRaw;
            } else if (headerType === "keyvalue") {
                finalHeaders = JSON.stringify(
                    headersKV.filter(h => h.key.trim() !== '')
                );
            } else {
                finalHeaders = '[]';
            }
        } catch (e) {
            setIsLoading(false);
            setErrorMessage("Invalid headers format: " + e.message);
            return;
        }
        let finalBody = '';
        try {
            switch (bodyType) {
                case "none":
                    finalBody = '';
                    break;
                case "raw":
                    finalBody = bodyRaw;
                    break;
                case "graphql":
                    try {
                        const variables = JSON.parse(graphqlVariables);
                        finalBody = JSON.stringify({
                            query: graphqlQuery,
                            variables: variables
                        });
                    } catch (e) {
                        setErrorMessage("Error in GraphQL variables: " + e.message);
                        setIsLoading(false);
                        return;
                    }
                    break;
                default:
                    finalBody = '';
            }
            const result = await ExecuteRequest(
                method,
                url,
                finalHeaders,
                finalBody,
                bodyType,
                bodyFormat,
                auth
            );
            handleResponse(result);
        } catch (error) {
            console.error("Error executing request:", error);
            setErrorMessage(error.toString());
            setResponseData({ error: error.toString() });
        } finally {
            setIsLoading(false);
        }
    };

    const handleResponse = (result) => {
        setResponseData(result);
        setResponseHeaders(
            typeof result.headers === "object"
                ? JSON.stringify(result.headers, null, 2)
                : result.headers?.toString() || ""
        );
        if (typeof result.body === "string") {
            try {
                const jsonBody = JSON.parse(result.body);
                setResponseBody(JSON.stringify(jsonBody, null, 2));
            } catch {
                setResponseBody(result.body || "");
            }
        } else if (typeof result.body === "object") {
            setResponseBody(JSON.stringify(result.body, null, 2));
        } else {
            setResponseBody(result.body?.toString() || "");
        }
    };

    const renderKeyValueTable = (dataArray, setDataArray) => {
        const handleChange = (index, field, value) => {
            const newData = [...dataArray];
            newData[index][field] = value;
            setDataArray(newData);
        };
        const addRow = () => setDataArray([...dataArray, { key: "", value: "" }]);
        const removeRow = (index) => {
            const newData = [...dataArray];
            newData.splice(index, 1);
            setDataArray(newData.length ? newData : [{ key: "", value: "" }]);
        };
        return (
            <div>
                <table className="w-full text-sm mb-2">
                    <thead>
                    <tr>
                        <th className="border-b border-gray-700 p-2 text-left">Key</th>
                        <th className="border-b border-gray-700 p-2 text-left">Value</th>
                        <th className="border-b border-gray-700 p-2"></th>
                    </tr>
                    </thead>
                    <tbody>
                    {dataArray.map((row, i) => (
                        <tr key={i}>
                            <td className="border-b border-gray-700 p-2">
                                <Input
                                    type="text"
                                    value={row.key}
                                    onChange={e => handleChange(i, "key", e.target.value)}
                                    className="bg-gray-800 border-gray-700 text-white"
                                />
                            </td>
                            <td className="border-b border-gray-700 p-2">
                                <Input
                                    type="text"
                                    value={row.value}
                                    onChange={e => handleChange(i, "value", e.target.value)}
                                    className="bg-gray-800 border-gray-700 text-white"
                                />
                            </td>
                            <td className="border-b border-gray-700 p-2">
                                <button
                                    onClick={() => removeRow(i)}
                                    className="text-red-400 hover:text-red-500"
                                >
                                    Remove
                                </button>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
                <button
                    onClick={addRow}
                    className="bg-gray-700 px-2 py-1 rounded hover:bg-gray-600 transition"
                >
                    + Add
                </button>
            </div>
        );
    };

    return (
        <div className="request-view flex flex-col max-h-[90vh] overflow-hidden p-2 rounded-lg shadow-lg w-full">
            {errorMessage && (
                <div className="bg-red-900 text-white p-2 mb-4 rounded">
                    {errorMessage}
                </div>
            )}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <div className="m-4 text-left">
                        <Button onClick={() => handleSaveRequestToCollection(null)} className="m-1 font-medium w-full text-left ">No Folder</Button>
                        {renderCollectionsTab()}
                    </div>
                    <DialogFooter>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <div className="flex-none flex justify-between items-center">
                <div className="flex flex-row">
                    <h2 className="text-sm mb-4 text-slate-400">{collectionName}</h2>
                    <span className="mr-1 ml-1 mb-4 text-slate-200">/</span>
                    <h2
                        className="text-sm mb-4"
                        contentEditable
                        autoCorrect="off"
                        spellCheck="false"
                        onBlur={e => setName(e.target.textContent || name)}
                    >
                        {name}
                    </h2>
                </div>
                <div className="flex-none flex flex-row justify-between mb-1">
                    <button
                        onClick={handleSaveRequest}
                        disabled={isLoading}
                        className="bg-gray-700 px-3 mr-1 py-1 rounded hover:bg-gray-600 transition disabled:opacity-50"
                    >
                        {isLoading ? "Saving..." : "Save"}
                    </button>
                    <button
                        onClick={handleSaveRequestToCollection}
                        disabled={isLoading}
                        className="bg-gray-700 px-3 mr-1 py-1 rounded hover:bg-gray-600 transition disabled:opacity-50"
                    >
                        {isLoading ? "Saving..." : "Save"}
                    </button>
                </div>
            </div>
            <div className="flex-none flex flex-row">
                <div className="flex space-x-3 mb-4 w-full mt-1">
                    <select
                        value={method}
                        onChange={e => setMethod(e.target.value)}
                        className={`border border-gray-700 rounded px-2 py-1 ${
                            methodColourMap.get(method) || "text-white"
                        }`}
                    >
                        {["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"].map(m => (
                            <option key={m} value={m} className={methodColourMap.get(m)}>
                                {m}
                            </option>
                        ))}
                    </select>
                    <EnvarSupportedInput
                        type="text"
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        placeholder="Enter request URL"
                        className="flex-grow border border-gray-700 rounded px-3 py-1"
                    />
                </div>
                <button
                    className="text-white px-3 rounded transition"
                    onClick={handleExecute}
                    disabled={isLoading}
                >
                    {isLoading ? "Sending..." : "Send"}
                </button>
            </div>
            <div className="flex-none mb-4 border-b border-gray-700">
                <button
                    onClick={() => setActiveTab("headers")}
                    className={`px-4 py-2 mr-2 focus:outline-none ${
                        activeTab === "headers" ? "border-b-2 border-blue-500" : "text-gray-400"
                    }`}
                >
                    Headers
                </button>
                <button
                    onClick={() => setActiveTab("body")}
                    className={`px-4 py-2 focus:outline-none ${
                        activeTab === "body" ? "border-b-2 border-blue-500" : "text-gray-400"
                    }`}
                >
                    Body
                </button>
            </div>
            {activeTab === "headers" && (
                <div className="flex-none mb-4 p-3 rounded-lg shadow-md">
                    <h3 className="font-semibold mb-2">Headers</h3>
                    <div className="flex justify-between items-center mb-2">
                        <select
                            value={headerType}
                            onChange={e => setHeaderType(e.target.value)}
                            className="border border-gray-700 text-white rounded px-2 py-1"
                        >
                            <option value="none">None</option>
                            <option value="keyvalue">Key/Value</option>
                            <option value="raw">Raw (JSON)</option>
                        </select>
                        <button
                            onClick={() => setHeadersExpanded(!headersExpanded)}
                            className="px-2 py-1 rounded hover:bg-gray-600 transition"
                        >
                            {headersExpanded ? "Collapse" : "Expand"}
                        </button>
                    </div>
                    {headerType === "raw" && (
                        <CodeMirror
                            value={headersRaw}
                            height={headersExpanded ? "150px" : "75px"}
                            extensions={[json()]}
                            theme={githubDark}
                            className="border border-gray-700 rounded w-full"
                            onChange={value => setHeadersRaw(value)}
                        />
                    )}
                    {headerType === "keyvalue" && renderKeyValueTable(headersKV, setHeadersKV)}
                </div>
            )}
            {activeTab === "body" && (
                <div className="flex-none mb-4 p-3 rounded-lg shadow-md">
                    <h3 className="font-semibold mb-2">Body</h3>
                    <div className="flex flex-wrap gap-4 mb-4">
                        {[
                            { label: "None", value: "none" },
                            { label: "Raw (JSON)", value: "raw" },
                            { label: "GraphQL", value: "graphql" }
                        ].map(option => (
                            <label key={option.value} className="flex items-center space-x-1">
                                <input
                                    type="radio"
                                    value={option.value}
                                    checked={bodyType === option.value}
                                    onChange={() => setBodyType(option.value)}
                                    className="text-blue-500"
                                />
                                <span>{option.label}</span>
                            </label>
                        ))}
                    </div>
                    {bodyType === "raw" && (
                        <div>
                            <div className="flex items-center mb-2 space-x-2">
                                <span>Language:</span>
                                <select
                                    value={bodyFormat}
                                    onChange={e => setBodyFormat(e.target.value)}
                                    className="bg-gray-800 text-white rounded px-2 py-1"
                                >
                                    {["Text", "JavaScript", "JSON", "HTML", "XML"].map(lang => (
                                        <option key={lang} value={lang}>
                                            {lang}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="max-h-96 overflow-auto">
                                <CodeMirror
                                    value={bodyRaw}
                                    height="350px"
                                    extensions={[json()]}
                                    theme={githubDark}
                                    className="border border-gray-700 rounded w-full"
                                    onChange={setBodyRaw}
                                    basicSetup={{
                                        lineNumbers: true,
                                        foldGutter: true,
                                        scrollPastEnd: false,
                                    }}
                                />
                            </div>
                        </div>
                    )}
                    {bodyType === "graphql" && (
                        <div className="space-y-4">
                            <div>
                                <p className="text-sm text-gray-300 mb-2">Query</p>
                                <div className="max-h-48 overflow-auto">
                                    <CodeMirror
                                        value={graphqlQuery}
                                        height="180px"
                                        extensions={[]}
                                        theme={githubDark}
                                        className="border border-gray-700 rounded w-full"
                                        onChange={value => setGraphqlQuery(value)}
                                        basicSetup={{
                                            lineNumbers: true,
                                            foldGutter: false,
                                            scrollPastEnd: false,
                                        }}
                                    />
                                </div>
                            </div>
                            <div>
                                <p className="text-sm text-gray-300 mb-2">Variables (JSON)</p>
                                <div className="max-h-48 overflow-auto">
                                    <CodeMirror
                                        value={graphqlVariables}
                                        height="180px"
                                        extensions={[json()]}
                                        theme={githubDark}
                                        className="border border-gray-700 rounded w-full"
                                        onChange={value => setGraphqlVariables(value)}
                                        basicSetup={{
                                            lineNumbers: true,
                                            foldGutter: false,
                                            scrollPastEnd: false,
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
            {responseData && (
                <div className="flex flex-col mt-4 rounded-lg shadow-md w-full flex-1 overflow-hidden">
                    <div className="flex-none border-b border-gray-700 flex">
                        <button
                            onClick={() => setResponseTab("body")}
                            className={`px-4 py-2 -mb-px ${
                                responseTab === "body" ? "border-b-2 border-blue-500" : "text-gray-400"
                            }`}
                        >
                            Body
                        </button>
                        <button
                            onClick={() => setResponseTab("headers")}
                            className={`px-4 py-2 -mb-px ${
                                responseTab === "headers" ? "border-b-2 border-blue-500" : "text-gray-400"
                            }`}
                        >
                            Headers
                        </button>
                    </div>
                    {responseTab === "body" ? (
                        <div className="flex-1 p-3 overflow-auto">
                            <CodeMirror
                                value={responseBody}
                                height="100%"
                                extensions={[json()]}
                                theme={githubDark}
                                className="h-full w-full"
                                readOnly
                                basicSetup={{
                                    lineNumbers: true,
                                    foldGutter: true,
                                    scrollPastEnd: false,
                                }}
                            />
                        </div>
                    ) : (
                        <div className="flex-1 p-3 overflow-auto">
                            <CodeMirror
                                value={responseHeaders}
                                height="100%"
                                extensions={[json()]}
                                theme={githubDark}
                                className="h-full w-full"
                                readOnly
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default RequestView;