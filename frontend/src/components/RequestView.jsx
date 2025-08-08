import React, { useState, useEffect, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { xml } from "@codemirror/lang-xml";
import { javascript } from "@codemirror/lang-javascript";
import { ExecuteRequest, GetRequest } from "../../bindings/github.com/D-Elbel/curlew/requestcrudservice.js";
import { copilot } from "@uiw/codemirror-theme-copilot"
import { Input } from "@/components/ui/input.js";
import { EnvarSupportedInput } from "@/components/EnvarSupportedInput.jsx";
import { methodColourMap } from "../utils/constants.js";
import { useRequestStore } from "@/stores/requestStore.js"
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog.js";
import { Button } from "@/components/ui/button.js";
import { useHotkeys } from "@/services/HotkeysContext.jsx";
import hotkeys from "hotkeys-js";
import { CommandDialog, CommandInput, CommandList, CommandItem } from "@/components/ui/command";
import { FolderClosed } from "lucide-react";
import { formatCode, formatContent, getLanguageExtension } from '../utils/codeProcessing.js'
import { buildCollectionTree } from "../utils/collections.js"

import { useEnvarStore } from "@/stores/envarStore";

const applyEnvVars = (text, envs, activeEnv) => {
    if (!text || typeof text !== 'string') {
        return text;
    }

    const envFile = envs.find(e => e.env === activeEnv);
    if (!envFile || !envFile.variables) {
        return text;
    }

    return text.replace(/\{\{(.*?)\}\}/g, (match, key) => {
        if (Object.prototype.hasOwnProperty.call(envFile.variables, key)) {
            return envFile.variables[key];
        }
        console.warn(`Environment variable '{{${key}}}' not found in active environment '${activeEnv}'.`);
        return match;
    });
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
    const [headersRaw, setHeadersRaw] = useState(request?.headers);
    const [headersExpanded, setHeadersExpanded] = useState(false);
    const [bodyType, setBodyType] = useState(request?.bodyType || "none");
    const [bodyRaw, setBodyRaw] = useState(request?.body || "");
    const [graphqlQuery, setGraphqlQuery] = useState("");
    const [graphqlVariables, setGraphqlVariables] = useState("{}");
    const [responseData, setResponseData] = useState(null);
    const [responseHeaders, setResponseHeaders] = useState("");
    const [responseBody, setResponseBody] = useState("");
    const [responseContentType, setResponseContentType] = useState("");
    const [fullRequest, setFullRequest] = useState(null);
    const [responseTab, setResponseTab] = useState("body");
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [authType, setAuthType] = useState("none");
    const [bearerToken, setBearerToken] = useState("");
    const [basicUsername, setBasicUsername] = useState("");
    const [basicPassword, setBasicPassword] = useState("");
    const [apiKeyKey, setApiKeyKey] = useState("");
    const [apiKeyValue, setApiKeyValue] = useState("");
    const [apiKeyAddTo, setApiKeyAddTo] = useState("headers");

    const collections = useRequestStore((state) => state.collections);
    const envs = useEnvarStore(state => state.environmentVariables);
    const activeEnv = useEnvarStore(state => state.activeEnvironment);
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
                console.log("fetched request", fetched)
            } catch (e) {
                console.error(e);
                setErrorMessage("Failed to fetch request details.");
            }
        })();
    }, [request?.id, request.isNew]);

    useEffect(() => {
        const syncFullRequest = async () => {
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
                    setHeadersKV(parsed.length ? parsed : [{key: "", value: ""}]);
                } else {
                    setHeaderType("raw");
                    setHeadersRaw(fullRequest.headers);
                }
            } catch {
                setHeaderType("keyvalue");
                setHeadersKV([{key: "", value: ""}]);
            }

            const bt = fullRequest.bodyType || "none";
            setBodyType(bt);
            switch (bt) {
                case "raw":
                    setBodyRaw(fullRequest.body || "");
                    break;
                case "graphql":
                    try {
                        const {query, variables} = JSON.parse(fullRequest.body);
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

            if (fullRequest.response) {
                try {
                    const response = fullRequest.response;
                    setResponseData(response);

                    let contentType = "";
                    let headersToDisplay = "";
                    if (typeof response.headers === "string") {
                        try {
                            const parsedHeaders = JSON.parse(response.headers);
                            headersToDisplay = JSON.stringify(parsedHeaders, null, 2);
                            contentType = parsedHeaders["content-type"] || parsedHeaders["Content-Type"] || "";
                        } catch {
                            headersToDisplay = response.headers;
                        }
                    } else if (typeof response.headers === "object") {
                        headersToDisplay = JSON.stringify(response.headers, null, 2);
                        contentType = response.headers["content-type"] || response.headers["Content-Type"] || "";
                    }
                    setResponseHeaders(headersToDisplay);
                    setResponseContentType(contentType);

                    const formattedBody = formatContent(response.body, contentType);
                    const formatted = await formatCode(response.body, contentType, responseContentType);
                    if (formatted !== responseBody) {
                        setResponseBody(formatted);
                    } else {
                        setResponseBody(formattedBody);
                    }

                } catch (error) {
                    console.error("Error parsing existing response:", error);
                    setResponseData(null);
                    setResponseHeaders("");
                    setResponseBody("");
                    setResponseContentType("");
                }
            } else {
                setResponseData(null);
                setResponseHeaders("");
                setResponseBody("");
                setResponseContentType("");
            }

            setErrorMessage("");
        };

        syncFullRequest();
    }, [fullRequest]);

    useEffect(() => {
        let updatedHeaders = buildHeadersObject();
        delete updatedHeaders["Authorization"];
        if (authType !== "apikey") {
            delete updatedHeaders[apiKeyKey];
        }
        if (authType === "bearer" && bearerToken) {
            updatedHeaders["Authorization"] = `Bearer ${bearerToken}`;
        } else if (authType === "basic" && (basicUsername || basicPassword)) {
            const encoded = btoa(`${basicUsername}:${basicPassword}`);
            updatedHeaders["Authorization"] = `Basic ${encoded}`;
        } else if (authType === "apikey" && apiKeyKey && apiKeyValue) {
            if (apiKeyAddTo === "headers") {
                updatedHeaders[apiKeyKey] = apiKeyValue;
            }
        }
        if (headerType === "raw") {
            setHeadersRaw(JSON.stringify(updatedHeaders, null, 2));
        } else {
            setHeadersKV(
                Object.entries(updatedHeaders).map(([key, value]) => ({ key, value }))
            );
        }
    }, [
        authType,
        bearerToken,
        basicUsername,
        basicPassword,
        apiKeyKey,
        apiKeyValue,
        apiKeyAddTo
    ]);

    const flattenCollections = (tree, level = 0) => {
        let result = [];
        for (const col of tree) {
            result.push({ ...col, level });
            if (col.children && col.children.length > 0) {
                result = result.concat(flattenCollections(col.children, level + 1));
            }
        }
        return result;
    };

    const renderCollectionsTab = () => {
        const collectionTree = buildCollectionTree(collections);
        const flatCollections = flattenCollections(collectionTree);
        return (
            <CommandList>
                <CommandItem
                    key="nofolder"
                    onSelect={() => handleSaveRequestToCollection(null)}
                >
                    <span className="inline-flex items-center">
                        <FolderClosed className="w-4 h-4 mr-2 text-slate-400" />
                        No Folder
                    </span>
                </CommandItem>
                {flatCollections.map((col) => (
                    <CommandItem
                        key={col.id}
                        onSelect={() => handleSaveRequestToCollection(col.id)}
                    >
                        <span className="inline-flex items-center" style={{ paddingLeft: `${col.level * 16}px` }}>
                            <FolderClosed className="w-4 h-4 mr-2 text-blue-400" />
                            {col.name}
                        </span>
                    </CommandItem>
                ))}
            </CommandList>
        );
    };

    const saveRequest = useRequestStore(state => state.saveRequest)

    const handleSaveRequest = async () => {
        setIsLoading(true)
        try {
            let responseDataToSave = null;
            if (responseData) {
                responseDataToSave = { ...responseData };
                if (typeof responseDataToSave.body !== 'string') {
                    responseDataToSave.body = JSON.stringify(responseDataToSave.body);
                }
                if (typeof responseDataToSave.headers !== 'string') {
                    responseDataToSave.headers = JSON.stringify(responseDataToSave.headers);
                }
            }
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
                auth: auth,
                response: responseDataToSave
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
            let responseDataToSave = null;
            if (responseData) {
                responseDataToSave = { ...responseData };
                if (typeof responseDataToSave.body !== 'string') {
                    responseDataToSave.body = JSON.stringify(responseDataToSave.body);
                }
                if (typeof responseDataToSave.headers !== 'string') {
                    responseDataToSave.headers = JSON.stringify(responseDataToSave.headers);
                }
            }
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
                auth: auth,
                response: responseDataToSave
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

    const getDefaultContentType = () => {
        if (bodyType === "graphql") return "application/json";
        if (bodyType === "raw") {
            switch (bodyFormat) {
                case "JSON": return "application/json";
                case "JavaScript": return "application/javascript";
                case "HTML": return "text/html";
                case "XML": return "application/xml";
                case "Text":
                default: return "text/plain";
            }
        }
        return undefined;
    };

    const buildHeadersObject = () => {
        let headersObj = {};
        if (headerType === "raw") {
            try {
                headersObj = JSON.parse(headersRaw) || {};
            } catch {
                headersObj = {};
            }
        } else if (headerType === "keyvalue") {
            headersObj = {};
            headersKV.forEach(h => {
                if (h.key && h.value) headersObj[h.key] = h.value;
            });
        }
        const hasContentType = Object.keys(headersObj).some(
            k => k.toLowerCase() === "content-type"
        );
        if (!hasContentType) {
            const defaultType = getDefaultContentType();
            if (defaultType) headersObj["Content-Type"] = defaultType;
        }
        return headersObj;
    };

    const buildHeadersString = () => JSON.stringify(buildHeadersObject());

    const handleExecute = async () => {
        setIsLoading(true);
        setErrorMessage("");
        setResponseData(null);
        let finalUrl = applyEnvVars(url, envs, activeEnv);
        if (authType === "apikey" && apiKeyAddTo === "query" && apiKeyKey && apiKeyValue) {
            const urlObj = new URL(finalUrl);
            urlObj.searchParams.set(apiKeyKey, apiKeyValue);
            finalUrl = urlObj.toString();
        }
        let finalHeaders = '';
        try {
            finalHeaders = buildHeadersString();
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
                finalUrl,
                finalHeaders,
                finalBody,
                bodyType,
                bodyFormat,
                auth
            );
            await handleResponse(result);
        } catch (error) {
            console.error("Error executing request:", error);
            setErrorMessage(error.toString());
            setResponseData({ error: error.toString() });
        } finally {
            setIsLoading(false);
        }
    };

    const handleResponse = async (result) => {
        setResponseData(result);
        let contentType = "";
        if (typeof result.headers === "object") {
            contentType = result.headers["content-type"] || result.headers["Content-Type"] || "";
            setResponseHeaders(JSON.stringify(result.headers, null, 2));
        } else if (typeof result.headers === "string") {
            try {
                const parsedHeaders = JSON.parse(result.headers);
                contentType = parsedHeaders["content-type"] || parsedHeaders["Content-Type"] || "";
                setResponseHeaders(JSON.stringify(parsedHeaders, null, 2));
            } catch {
                setResponseHeaders(result.headers || "");
            }
        } else {
            setResponseHeaders(result.headers?.toString() || "");
        }
        setResponseContentType(contentType);
        const bodyString = typeof result.body === "string" ? result.body : JSON.stringify(result.body);
        const formatted = await formatCode(bodyString, contentType);
        if (formatted !== responseBody) {
            setResponseBody(formatted);
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

    const prefillContentTypeHeader = (newType, newFormat) => {
        const contentType = (() => {
            if (newType === "graphql") return "application/json";
            if (newType === "raw") {
                switch (newFormat) {
                    case "JSON": return "application/json";
                    case "JavaScript": return "application/javascript";
                    case "HTML": return "text/html";
                    case "XML": return "application/xml";
                    case "Text":
                    default: return "text/plain";
                }
            }
            return undefined;
        })();
        if (!contentType) return;
        if (headerType === "raw") {
            let headersObj = {};
            try {
                headersObj = headersRaw ? JSON.parse(headersRaw) : {};
            } catch { headersObj = {}; }
            headersObj["Content-Type"] = contentType;
            setHeadersRaw(JSON.stringify(headersObj, null, 2));
        } else if (headerType === "keyvalue") {
            let found = false;
            const newKV = headersKV.map(h => {
                if (h.key.toLowerCase() === "content-type") {
                    found = true;
                    return { key: "Content-Type", value: contentType };
                }
                return h;
            });
            if (!found) {
                newKV.push({ key: "Content-Type", value: contentType });
            }
            setHeadersKV(newKV);
        }
    };

    const getRequestBodyExtension = () => {
        if (bodyType === "graphql") return [javascript()];
        if (bodyType === "raw") {
            switch (bodyFormat) {
                case "JSON": return [json()];
                case "JavaScript": return [javascript()];
                case "HTML": return [html()];
                case "XML": return [xml()];
                case "Text":
                default: return [];
            }
        }
        return [];
    };

    useEffect(() => {
        prefillContentTypeHeader(bodyType, bodyFormat);
    }, [bodyType]);

    useEffect(() => {
        if (bodyType === "raw") {
            prefillContentTypeHeader(bodyType, bodyFormat);
        }
    }, [bodyFormat]);

    return (
        <div className="request-view flex flex-col max-h-[90vh] overflow-hidden p-2 rounded-lg shadow-lg w-full">
            {errorMessage && (
                <div className="bg-red-900 text-white p-2 mb-4 rounded">
                    {errorMessage}
                </div>
            )}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <div className="m-2">
                        <CommandDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} title="Save to Collection" description="Choose a collection to save this request to.">
                            <CommandInput placeholder="Search collections..." />
                            {renderCollectionsTab()}
                        </CommandDialog>
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
                    onClick={() => setActiveTab("authorization")}
                    className={`px-4 py-2 mr-2 focus:outline-none ${
                        activeTab === "authorization" ? "border-b-2 border-blue-500" : "text-gray-400"
                    }`}
                >
                    Authorization
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
                            theme={copilot}
                            className="border border-gray-700 rounded w-full"
                            onChange={value => setHeadersRaw(value)}
                        />
                    )}
                    {headerType === "keyvalue" && renderKeyValueTable(headersKV, setHeadersKV)}
                </div>
            )}
            {activeTab === "authorization" && (
                <div className="p-3 rounded-lg shadow-md">
                    <h3 className="font-semibold mb-2">Authorization</h3>
                    <select
                        value={authType}
                        onChange={(e) => setAuthType(e.target.value)}
                        className="bg-gray-800 text-white rounded px-2 py-1 mb-4"
                    >
                        <option value="none">None</option>
                        <option value="bearer">Bearer Token</option>
                        <option value="basic">Basic Auth</option>
                        <option value="apikey">API Key</option>
                    </select>
                    {authType === "bearer" && (
                        <Input
                            placeholder="Enter Bearer Token"
                            value={bearerToken}
                            onChange={(e) => setBearerToken(e.target.value)}
                        />
                    )}
                    {authType === "basic" && (
                        <div className="space-y-2">
                            <Input
                                placeholder="Username"
                                value={basicUsername}
                                onChange={(e) => setBasicUsername(e.target.value)}
                            />
                            <Input
                                placeholder="Password"
                                type="password"
                                value={basicPassword}
                                onChange={(e) => setBasicPassword(e.target.value)}
                            />
                        </div>
                    )}
                    {authType === "apikey" && (
                        <div className="space-y-2">
                            <Input
                                placeholder="API Key Name"
                                value={apiKeyKey}
                                onChange={(e) => setApiKeyKey(e.target.value)}
                            />
                            <Input
                                placeholder="API Key Value"
                                value={apiKeyValue}
                                onChange={(e) => setApiKeyValue(e.target.value)}
                            />
                            <select
                                value={apiKeyAddTo}
                                onChange={(e) => setApiKeyAddTo(e.target.value)}
                                className="bg-gray-800 text-white rounded px-2 py-1"
                            >
                                <option value="headers">Add to Headers</option>
                                <option value="query">Add to Query Params</option>
                            </select>
                        </div>
                    )}
                </div>
            )}
            {activeTab === "body" && (
                <div className="flex-none p-3 rounded-lg shadow-md">
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
                                    extensions={[...getRequestBodyExtension()]}
                                    theme={copilot}
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
                                        extensions={[javascript()]}
                                        theme={copilot}
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
                                <p className="text-sm text-gray-300">Variables (JSON)</p>
                                <div className="max-h-48 overflow-auto">
                                    <CodeMirror
                                        value={graphqlVariables}
                                        height="180px"
                                        extensions={[json()]}
                                        theme={copilot}
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
                <div className="flex flex-col rounded-lg shadow-md w-full flex-1 overflow-hidden">
                    <div className="flex-none border-b border-gray-700 flex items-center justify-between">
                        <div className="flex flex-row space-x-4 items-center justify-between w-full">
                            <div className="flex">
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
                            <div className="flex items-center space-x-4 text-sm">
                                <span
                                    className={`px-2 py-1 rounded ${responseData.statusCode >= 400 ? 'bg-red-500/20' : 'bg-green-500/20'}`}>
                                    <strong>Status:</strong> {responseData.statusCode}
                                </span>
                                <span className="text-gray-400">
                                    <strong>Time:</strong> {responseData.runtimeMS}ms
                                </span>
                                <span className="text-gray-400">
                                    <strong>Size:</strong> {(new Blob([responseBody]).size / 1024).toFixed(2)} KB
                                </span>
                            </div>
                        </div>
                    </div>
                    {responseTab === "body" ? (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            <div className="flex-none border-b border-gray-700 flex items-center justify-between">
                                {responseContentType && (
                                    <div className="text-xs text-gray-400 px-4 py-2">
                                        {responseContentType[0]?.split(';')[0]}
                                    </div>
                                )}
                                <div className="flex-none flex justify-end p-2">
                                    <button
                                        onClick={async () => {
                                            const formatted = await formatCode(responseBody, responseContentType);
                                            if (formatted !== responseBody) {
                                                setResponseBody(formatted);
                                            }
                                        }}
                                        className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm transition"
                                    >
                                        Format Response
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 p-3 overflow-auto">
                                <CodeMirror
                                    value={responseBody}
                                    height="100%"
                                    extensions={[...getLanguageExtension(responseContentType, responseBody)]}
                                    theme={copilot}
                                    className="h-full w-full"
                                    readOnly
                                    basicSetup={{
                                        lineNumbers: true,
                                        foldGutter: true,
                                        scrollPastEnd: false,
                                    }}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 p-3 overflow-auto">
                            <CodeMirror
                                value={responseHeaders}
                                height="100%"
                                extensions={[json()]}
                                theme={copilot}
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