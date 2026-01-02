// RequestView.jsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { xml } from "@codemirror/lang-xml";
import { javascript } from "@codemirror/lang-javascript";
import { copilot } from "@uiw/codemirror-theme-copilot"
import { Input } from "@/components/ui/input.js";
import { EnvarSupportedInput } from "@/components/EnvarSupportedInput.jsx";
import { methodColourMap } from "../utils/constants.js";
import { useRequestStore } from "@/stores/requestStore.js"
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog.js";
import { Button } from "@/components/ui/button.js";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useHotkeys } from "@/services/HotkeysContext.jsx";
import { executeHttpRequest } from "@/services/requestExecutor.js";
import hotkeys from "hotkeys-js";
import { CommandDialog, CommandInput, CommandList, CommandItem } from "@/components/ui/command";
import { AlertTriangle, FolderClosed } from "lucide-react";
import { formatCode, formatContent, getLanguageExtension } from '../utils/codeProcessing.js'
import { buildCollectionTree } from "../utils/collections.js"

import { useEnvarStore } from "@/stores/envarStore";
import { query as queryDb } from "@/services/database.js";
import { requestQueries } from "@/services/queries.js";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

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
        console.warn(
            `Environment variable '{{${key}}}' not found in active environment ` +
            `'${activeEnv}'.`
        );
        return match;
    });
};

const toNumberSafe = (value, fallback = 0) => {
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) {
            return parsed;
        }
    }
    return fallback;
};

const CollectionItem = ({
                            collection,
                            level = 0,
                            handleSaveRequestToCollection,
                        }) => {
    const style = {
        paddingLeft: `${level * 1.25}rem`,
    };
    return (
        <div style={style} className="mt-1">
            <div className="flex flex-row justify-between">
                <div>
                    <p>| {collection.name}</p>
                </div>
                <Button onClick={() => handleSaveRequestToCollection(collection.id)}>
                    +
                </Button>
            </div>
            {collection.children?.map((child) => (
                <CollectionItem
                    key={child.id}
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
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [method, setMethod] = useState(request?.method || "GET");
    const [collectionName, setCollectionName] = useState(
        request?.collectionName || ""
    );
    const [url, setUrl] = useState(request?.url || "");
    const [auth, setAuth] = useState(request?.auth || "");
    const [name, setName] = useState(request?.name || "Untitled Request");
    const [bodyFormat, setBodyFormat] = useState(
        request?.bodyFormat || "JSON"
    );
    const [description, setDescription] = useState(
        request?.description || ""
    );
    const [activeTab, setActiveTab] = useState("body");
    const [headerType, setHeaderType] = useState("raw");
    const [headersKV, setHeadersKV] = useState([{ key: "", value: "" }]);
    const [headersRaw, setHeadersRaw] = useState(request?.headers);
    const [headersExpanded, setHeadersExpanded] = useState(false);

    const [bodyType, setBodyType] = useState(request?.bodyType || "none");
    const [bodyRaw, setBodyRaw] = useState(request?.body || "");

    const [graphqlQuery, setGraphqlQuery] = useState("");
    const [graphqlVariables, setGraphqlVariables] = useState("{}");

    const [formDataItems, setFormDataItems] = useState([
        { key: "", type: "text", value: "" },
    ]);
    const [urlencodedItems, setUrlencodedItems] = useState([
        { key: "", value: "" },
    ]);
    const [binaryFile, setBinaryFile] = useState(null);
    // {
    // filename, mimeType, dataBase64
    // }

    const [responseData, setResponseData] = useState(null);
    const [responseHeaders, setResponseHeaders] = useState("");
    const [responseBody, setResponseBody] = useState("");
    const [responseContentType, setResponseContentType] = useState("");
    const [fullRequest, setFullRequest] = useState(null);
    const [responseTab, setResponseTab] = useState("body");
    const [responseHistory, setResponseHistory] = useState([]);
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
    const saveRequest = useRequestStore((state) => state.saveRequest);
    const getResponseHistoryFromStore = useRequestStore((state) => state.getResponseHistory);
    const envs = useEnvarStore((state) => state.environmentVariables);
    const activeEnv = useEnvarStore((state) => state.activeEnvironment);
    const isInitialAutosave = useRef(true);
    const saveTimeout = useRef(null);
    const isSyncingFromSave = useRef(false);
    const executeRef = useRef(null);
    const resolvedRequestId = typeof fullRequest?.id === "number"
        ? fullRequest.id
        : typeof request?.id === "number"
            ? request.id
            : null;
    const latestResponse = responseData || (responseHistory.length > 0 ? responseHistory[0] : null);
    const latestResponseSizeKb =
        latestResponse && typeof latestResponse.body === "string"
            ? (new Blob([latestResponse.body]).size / 1024).toFixed(2)
            : null;
    const sendShortcut = hotkeysMap.SEND_REQUEST || "ctrl+enter";
    const sendKeyParts = sendShortcut.split("+").map((p) => p.trim()).filter(Boolean);

    const loadResponseHistory = useCallback(async (id) => {
        if (!id) {
            setResponseHistory([]);
            return;
        }

        try {
            const history = await getResponseHistoryFromStore(id);
            setResponseHistory(Array.isArray(history) ? history : []);
        } catch (error) {
            console.error("Failed to load response history:", error);
        }
    }, [getResponseHistoryFromStore]);

    const fetchRequestById = useCallback(async (id) => {
        const requestResult = await queryDb({
            sql: requestQueries.getById,
            params: [id],
        });
        const row = requestResult?.rows?.[0];
        if (!row) {
            return null;
        }

        let latestResponse = null;
        try {
            const responseResult = await queryDb({
                sql: requestQueries.getLatestResponse,
                params: [id],
            });
            const respRow = responseResult?.rows?.[0];
            if (respRow) {
                latestResponse = {
                    id: toNumberSafe(respRow.id),
                    statusCode: toNumberSafe(respRow.statusCode),
                    headers: respRow.headers ?? "",
                    body: respRow.body ?? "",
                    runtimeMS: toNumberSafe(respRow.runtimeMS),
                    requestID: toNumberSafe(respRow.requestId),
                    createdAt: respRow.createdAt,
                };
            }
        } catch (err) {
            console.error("Failed to load latest response via DB:", err);
        }

        return {
            id: toNumberSafe(row.id),
            collectionId: row.collectionId || null,
            collectionName: row.collectionName || "",
            name: row.name || "Untitled Request",
            description: row.description || "",
            method: row.method || "GET",
            url: row.url || "",
            headers: row.headers || "{}",
            body: row.body || "",
            bodyType: row.bodyType || "none",
            bodyFormat: row.bodyFormat || "JSON",
            auth: row.auth || "",
            response: latestResponse,
        };
    }, []);

    useEffect(() => {
        const fn = (e) => {
            e.preventDefault();
            setIsDialogOpen(true);
        };
        hotkeys(hotkeysMap.HANDLE_ENTITY_SAVE, fn);
        return () => hotkeys.unbind(hotkeysMap.HANDLE_ENTITY_SAVE, fn);
    }, [hotkeysMap.HANDLE_ENTITY_SAVE]);

    useEffect(() => {
        if (!request?.id || request.isNew) {
            return;
        }
        (async () => {
            try {
                const fetched = await fetchRequestById(request.id);
                if (fetched) {
                    setResponseTab("body");
                    setFullRequest(fetched);
                } else {
                    setErrorMessage("Failed to fetch request details.");
                }
            } catch (e) {
                console.error(e);
                setErrorMessage("Failed to fetch request details.");
            }
        })();
    }, [request?.id, request.isNew, fetchRequestById]);

    useEffect(() => {
        if (resolvedRequestId) {
            loadResponseHistory(resolvedRequestId);
        } else {
            setResponseHistory([]);
        }
    }, [resolvedRequestId, loadResponseHistory]);

    useEffect(() => {
        if (!isLoading && !responseData && responseHistory.length > 0) {
            setResponseTab((prev) => (prev === "history" ? prev : "history"));
            return;
        }

        if (responseHistory.length === 0 && responseData) {
            setResponseTab((prev) => (prev === "history" ? "body" : prev));
        }
    }, [responseData, responseHistory.length, isLoading]);

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
                if (
                    Array.isArray(parsed) &&
                    parsed.every((h) => "key" in h && "value" in h)
                ) {
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
                        const { query, variables } = JSON.parse(fullRequest.body || "{}");
                        setGraphqlQuery(query || "");
                        setGraphqlVariables(
                            JSON.stringify(variables || {}, null, 2)
                        );
                    } catch {
                        setGraphqlQuery("");
                        setGraphqlVariables("{}");
                    }
                    break;
                case "formdata":
                    try {
                        const payload = JSON.parse(fullRequest.body || "{}");
                        const items = Array.isArray(payload?.fields)
                            ? payload.fields
                            : [];
                        setFormDataItems(
                            items.length
                                ? items
                                : [{ key: "", type: "text", value: "" }]
                        );
                    } catch {
                        setFormDataItems([{ key: "", type: "text", value: "" }]);
                    }
                    break;
                case "urlencoded":
                    try {
                        const payload = JSON.parse(fullRequest.body || "{}");
                        const items = Array.isArray(payload?.fields)
                            ? payload.fields
                            : [];
                        setUrlencodedItems(
                            items.length ? items : [{ key: "", value: "" }]
                        );
                    } catch {
                        setUrlencodedItems([{ key: "", value: "" }]);
                    }
                    break;
                case "binary":
                    try {
                        const payload = JSON.parse(fullRequest.body || "null");
                        setBinaryFile(payload || null);
                    } catch {
                        setBinaryFile(null);
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
                            headersToDisplay = JSON.stringify(
                                parsedHeaders,
                                null,
                                2
                            );
                            contentType =
                                parsedHeaders["content-type"] ||
                                parsedHeaders["Content-Type"] ||
                                "";
                        } catch {
                            headersToDisplay = response.headers;
                        }
                    } else if (typeof response.headers === "object") {
                        headersToDisplay = JSON.stringify(
                            response.headers,
                            null,
                            2
                        );
                        contentType =
                            response.headers["content-type"] ||
                            response.headers["Content-Type"] ||
                            "";
                    }
                    setResponseHeaders(headersToDisplay);
                    setResponseContentType(contentType);

                    const formattedBody = formatContent(
                        response.body,
                        contentType
                    );
                    const formatted = await formatCode(
                        response.body,
                        contentType,
                        responseContentType
                    );
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
        } else if (
            authType === "apikey" &&
            apiKeyKey &&
            apiKeyValue
        ) {
            if (apiKeyAddTo === "headers") {
                updatedHeaders[apiKeyKey] = apiKeyValue;
            }
        }
        if (headerType === "raw") {
            setHeadersRaw(JSON.stringify(updatedHeaders, null, 2));
        } else {
            setHeadersKV(
                Object.entries(updatedHeaders).map(([key, value]) => ({
                    key,
                    value,
                }))
            );
        }
    }, [
        authType,
        bearerToken,
        basicUsername,
        basicPassword,
        apiKeyKey,
        apiKeyValue,
        apiKeyAddTo,
    ]);

    const flattenCollections = (tree, level = 0) => {
        let result = [];
        for (const col of tree) {
            result.push({ ...col, level });
            if (col.children && col.children.length > 0) {
                result = result.concat(
                    flattenCollections(col.children, level + 1)
                );
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
            <FolderClosed className="w-4 h-4 mr-2" />
            No Folder
          </span>
                </CommandItem>
                {flatCollections.map((col) => (
                    <CommandItem
                        key={col.id}
                        onSelect={() => handleSaveRequestToCollection(col.id)}
                    >
            <span
                className="inline-flex items-center"
                style={{ paddingLeft: `${col.level * 16}px` }}
            >
              <FolderClosed className="w-4 h-4 mr-2" />
                {col.name}
            </span>
                    </CommandItem>
                ))}
            </CommandList>
        );
    };

    const buildBodyForPersist = () => {
        switch (bodyType) {
            case "none":
                return "";
            case "raw":
                return bodyRaw || "";
            case "graphql": {
                let vars = {};
                try {
                    vars = JSON.parse(graphqlVariables || "{}");
                } catch {
                    vars = {};
                }
                return JSON.stringify({ query: graphqlQuery || "", variables: vars });
            }
            case "formdata": {
                const fields = (formDataItems || []).map((i) => ({
                    key: i.key || "",
                    type: i.type || "text",
                    value: i.type === "text" ? i.value || "" : undefined,
                    filename:
                        i.type === "file" ? i.filename || "file" : undefined,
                    mimeType:
                        i.type === "file"
                            ? i.mimeType || "application/octet-stream"
                            : undefined,
                    dataBase64:
                        i.type === "file" ? i.dataBase64 || "" : undefined,
                }));
                return JSON.stringify({ fields });
            }
            case "urlencoded": {
                const fields = (urlencodedItems || []).map((i) => ({
                    key: i.key || "",
                    value: i.value || "",
                }));
                return JSON.stringify({ fields });
            }
            case "binary": {
                return JSON.stringify(binaryFile || {});
            }
            default:
                return "";
        }
    };

    const handleSaveRequest = async () => {
        setIsLoading(true);
        try {
            let responseDataToSave = null;
            if (responseData) {
                responseDataToSave = { ...responseData };
                if (typeof responseDataToSave.body !== "string") {
                    responseDataToSave.body = JSON.stringify(
                        responseDataToSave.body
                    );
                }
                if (typeof responseDataToSave.headers !== "string") {
                    responseDataToSave.headers = JSON.stringify(
                        responseDataToSave.headers
                    );
                }
            }
            const bodyPersist = buildBodyForPersist();
            await saveRequest({
                id: fullRequest?.id,
                collectionId: request.collectionId,
                name,
                description: description,
                method,
                requestUrl: url,
                headers: headersRaw,
                body: bodyPersist,
                bodyType: bodyType,
                bodyFormat: bodyFormat,
                auth: auth,
                response: responseDataToSave,
            });
            isSyncingFromSave.current = true;
        } catch (e) {
            console.error(e);
            setErrorMessage("Save failed.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveRequestToCollection = async (collectionId) => {
        setIsLoading(true);
        setIsDialogOpen(true);
        try {
            let responseDataToSave = null;
            if (responseData) {
                responseDataToSave = { ...responseData };
                if (typeof responseDataToSave.body !== "string") {
                    responseDataToSave.body = JSON.stringify(
                        responseDataToSave.body
                    );
                }
                if (typeof responseDataToSave.headers !== "string") {
                    responseDataToSave.headers = JSON.stringify(
                        responseDataToSave.headers
                    );
                }
            }
            const bodyPersist = buildBodyForPersist();
            await saveRequest({
                id: fullRequest?.id,
                collectionId: collectionId,
                name,
                description: description,
                method,
                requestUrl: url,
                headers: headersRaw,
                body: bodyPersist,
                bodyType: bodyType,
                bodyFormat: bodyFormat,
                auth: auth,
                response: responseDataToSave,
            });
            isSyncingFromSave.current = true;
            setIsDialogOpen(false);
        } catch (e) {
            console.error(e);
            setErrorMessage("Save failed.");
        } finally {
            setIsLoading(false);
        }
    };

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
        formDataItems,
        urlencodedItems,
        binaryFile,
    ]);

    const getDefaultContentType = () => {
        if (bodyType === "graphql") return "application/json";
        if (bodyType === "urlencoded")
            return "application/x-www-form-urlencoded";
        if (bodyType === "binary")
            return binaryFile?.mimeType || "application/octet-stream";
        if (bodyType === "formdata") return undefined; // boundary set by backend
        if (bodyType === "raw") {
            switch (bodyFormat) {
                case "JSON":
                    return "application/json";
                case "JavaScript":
                    return "application/javascript";
                case "HTML":
                    return "text/html";
                case "XML":
                    return "application/xml";
                case "Text":
                default:
                    return "text/plain";
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
            headersKV.forEach((h) => {
                if (h.key && h.value) headersObj[h.key] = h.value;
            });
        }

        const hasContentType = Object.keys(headersObj).some(
            (k) => k.toLowerCase() === "content-type"
        );
        if (!hasContentType) {
            const defaultType = getDefaultContentType();
            if (defaultType) headersObj["Content-Type"] = defaultType;
        }

        // Ensure we do NOT set Content-Type for multipart/form-data
        if (bodyType === "formdata") {
            for (const k of Object.keys(headersObj)) {
                if (k.toLowerCase() === "content-type") {
                    delete headersObj[k];
                }
            }
        }

        return headersObj;
    };

    const buildHeadersString = () => JSON.stringify(buildHeadersObject());

    const handleExecute = async () => {
        setIsLoading(true);
        setResponseTab("body");
        setErrorMessage("");
        setResponseData(null);

        let finalUrl = applyEnvVars(url, envs, activeEnv);
        if (
            authType === "apikey" &&
            apiKeyAddTo === "query" &&
            apiKeyKey &&
            apiKeyValue
        ) {
            const urlObj = new URL(finalUrl);
            urlObj.searchParams.set(apiKeyKey, apiKeyValue);
            finalUrl = urlObj.toString();
        }

        let finalHeaders = "";
        try {
            finalHeaders = buildHeadersString();
        } catch (e) {
            setIsLoading(false);
            setErrorMessage("Invalid headers format: " + e.message);
            return;
        }

        let finalBody = "";
        try {
            switch (bodyType) {
                case "none":
                    finalBody = "";
                    break;
                case "raw":
                    finalBody = bodyRaw || "";
                    break;
                case "graphql":
                    try {
                        const variables = JSON.parse(graphqlVariables || "{}");
                        finalBody = JSON.stringify({
                            query: graphqlQuery || "",
                            variables,
                        });
                    } catch (e) {
                        setErrorMessage("Error in GraphQL variables: " + e.message);
                        setIsLoading(false);
                        return;
                    }
                    break;
                case "formdata": {
                    const fields = (formDataItems || []).map((i) => ({
                        key: i.key || "",
                        type: i.type || "text",
                        value: i.type === "text" ? i.value || "" : undefined,
                        filename:
                            i.type === "file" ? i.filename || "file" : undefined,
                        mimeType:
                            i.type === "file"
                                ? i.mimeType || "application/octet-stream"
                                : undefined,
                        dataBase64:
                            i.type === "file" ? i.dataBase64 || "" : undefined,
                    }));
                    finalBody = JSON.stringify({ fields });
                    break;
                }
                case "urlencoded": {
                    const fields = (urlencodedItems || []).map((i) => ({
                        key: i.key || "",
                        value: i.value || "",
                    }));
                    finalBody = JSON.stringify({ fields });
                    break;
                }
                case "binary": {
                    finalBody = JSON.stringify(binaryFile || {});
                    break;
                }
                default:
                    finalBody = "";
            }

            const result = await executeHttpRequest({
                method,
                url: finalUrl,
                headers: finalHeaders,
                body: finalBody,
                bodyType,
                bodyFormat,
                auth,
            });
            await handleResponse(result);
            if (resolvedRequestId) {
                await loadResponseHistory(resolvedRequestId);
            }
        } catch (error) {
            console.error("Error executing request:", error);
            const message =
                error?.message || error?.toString?.() || "Request failed.";
            setErrorMessage(message);
            setResponseData({ error: message });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        executeRef.current = handleExecute;
    }, [handleExecute]);

    useEffect(() => {
        const combo = hotkeysMap.SEND_REQUEST || "ctrl+enter";
        const handler = (e) => {
            e.preventDefault();
            if (executeRef.current) {
                executeRef.current();
            }
        };
        hotkeys(combo, handler);
        return () => hotkeys.unbind(combo, handler);
    }, [hotkeysMap.SEND_REQUEST]);

    const handleResponse = async (result) => {
        const enrichedResult = {
            ...result,
        };
        if (!enrichedResult.createdAt) {
            enrichedResult.createdAt = new Date().toISOString();
        }

        setResponseData(enrichedResult);
        let contentType = "";
        if (typeof enrichedResult.headers === "object") {
            contentType =
                enrichedResult.headers["content-type"] ||
                enrichedResult.headers["Content-Type"] ||
                "";
            setResponseHeaders(JSON.stringify(enrichedResult.headers, null, 2));
        } else if (typeof enrichedResult.headers === "string") {
            try {
                const parsedHeaders = JSON.parse(enrichedResult.headers);
                contentType =
                    parsedHeaders["content-type"] ||
                    parsedHeaders["Content-Type"] ||
                    "";
                setResponseHeaders(JSON.stringify(parsedHeaders, null, 2));
            } catch {
                setResponseHeaders(enrichedResult.headers || "");
            }
        } else {
            setResponseHeaders(enrichedResult.headers?.toString() || "");
        }
        setResponseContentType(contentType);

        const bodyString =
            typeof enrichedResult.body === "string"
                ? enrichedResult.body
                : JSON.stringify(enrichedResult.body);
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
        const addRow = () =>
            setDataArray([...dataArray, { key: "", value: "" }]);
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
                        <th className="border-b p-2 text-left">
                            Key
                        </th>
                        <th className="border-b p-2 text-left">
                            Value
                        </th>
                        <th className="border-b p-2"></th>
                    </tr>
                    </thead>
                    <tbody>
                    {dataArray.map((row, i) => (
                        <tr key={i}>
                            <td className="border-b p-2">
                                <Input
                                    type="text"
                                    value={row.key}
                                    onChange={(e) =>
                                        handleChange(i, "key", e.target.value)
                                    }
                                    className=""
                                />
                            </td>
                            <td className="border-b p-2">
                                <Input
                                    type="text"
                                    value={row.value}
                                    onChange={(e) =>
                                        handleChange(i, "value", e.target.value)
                                    }
                                    className=""
                                />
                            </td>
                            <td className="border-b p-2">
                                <button
                                    onClick={() => removeRow(i)}
                                    className=""
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
                    className="px-2 py-1 transition"
                >
                    + Add
                </button>
            </div>
        );
    };

    const renderFormDataTable = () => {
        const items = formDataItems || [];
        const setItems = setFormDataItems;

        const handleChange = (idx, patch) => {
            const next = items.map((row, i) =>
                i === idx ? { ...row, ...patch } : row
            );
            setItems(next);
        };

        const addRow = () =>
            setItems([...items, { key: "", type: "text", value: "" }]);

        const removeRow = (idx) => {
            const next = items.slice();
            next.splice(idx, 1);
            setItems(
                next.length ? next : [{ key: "", type: "text", value: "" }]
            );
        };

        const handleFile = (idx, file) => {
            if (!file) {
                handleChange(idx, {
                    type: "file",
                    filename: "",
                    mimeType: "",
                    dataBase64: "",
                });
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                const res = reader.result || "";
                const base64 =
                    typeof res === "string" ? res.split(",")[1] || "" : "";
                handleChange(idx, {
                    type: "file",
                    filename: file.name,
                    mimeType: file.type || "application/octet-stream",
                    dataBase64: base64,
                });
            };
            reader.readAsDataURL(file);
        };

        return (
            <div>
                <table className="w-full text-sm mb-2">
                    <thead>
                    <tr>
                        <th className="border-b p-2 text-left">
                            Key
                        </th>
                        <th className="border-b p-2 text-left">
                            Type
                        </th>
                        <th className="border-b p-2 text-left">
                            Value / File
                        </th>
                        <th className="border-b p-2"></th>
                    </tr>
                    </thead>
                    <tbody>
                    {items.map((row, i) => (
                        <tr key={i}>
                            <td className="border-b p-2">
                                <Input
                                    type="text"
                                    value={row.key}
                                    onChange={(e) =>
                                        handleChange(i, { key: e.target.value })
                                    }
                                    className=""
                                />
                            </td>
                            <td className="border-b p-2">
                                <Select
                                    value={row.type}
                                    onValueChange={(value) =>
                                        handleChange(i, { type: value })
                                    }
                                >
                                    <SelectTrigger className="px-2 py-1">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="text">Text</SelectItem>
                                        <SelectItem value="file">File</SelectItem>
                                    </SelectContent>
                                </Select>
                            </td>
                            <td className="border-b p-2">
                                {row.type === "file" ? (
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="file"
                                            onChange={(e) =>
                                                handleFile(i, e.target.files?.[0])
                                            }
                                        />
                                        {row.filename ? (
                                            <span className="text-xs">
                          {row.filename} ({row.mimeType || "type"})
                        </span>
                                        ) : null}
                                    </div>
                                ) : (
                                    <Input
                                        type="text"
                                        value={row.value}
                                        onChange={(e) =>
                                            handleChange(i, { value: e.target.value })
                                        }
                                        className=""
                                    />
                                )}
                            </td>
                            <td className="border-b p-2">
                                <button
                                    onClick={() => removeRow(i)}
                                    className=""
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
                    className="px-2 py-1 transition"
                >
                    + Add
                </button>
            </div>
        );
    };

    const prefillContentTypeHeader = (newType, newFormat) => {
        const contentType = (() => {
            if (newType === "graphql") return "application/json";
            if (newType === "urlencoded")
                return "application/x-www-form-urlencoded";
            if (newType === "binary")
                return binaryFile?.mimeType || "application/octet-stream";
            if (newType === "raw") {
                switch (newFormat) {
                    case "JSON":
                        return "application/json";
                    case "JavaScript":
                        return "application/javascript";
                    case "HTML":
                        return "text/html";
                    case "XML":
                        return "application/xml";
                    case "Text":
                    default:
                        return "text/plain";
                }
            }
            return undefined;
        })();

        // Do not set Content-Type for formdata
        if (newType === "formdata") {
            if (headerType === "raw") {
                let headersObj = {};
                try {
                    headersObj = headersRaw ? JSON.parse(headersRaw) : {};
                } catch {
                    headersObj = {};
                }
                for (const k of Object.keys(headersObj)) {
                    if (k.toLowerCase() === "content-type") {
                        delete headersObj[k];
                    }
                }
                setHeadersRaw(JSON.stringify(headersObj, null, 2));
            } else if (headerType === "keyvalue") {
                const newKV = (headersKV || []).filter(
                    (h) => h.key.toLowerCase() !== "content-type"
                );
                setHeadersKV(newKV.length ? newKV : [{ key: "", value: "" }]);
            }
            return;
        }

        if (!contentType) return;

        if (headerType === "raw") {
            let headersObj = {};
            try {
                headersObj = headersRaw ? JSON.parse(headersRaw) : {};
            } catch {
                headersObj = {};
            }
            headersObj["Content-Type"] = contentType;
            setHeadersRaw(JSON.stringify(headersObj, null, 2));
        } else if (headerType === "keyvalue") {
            let found = false;
            const newKV = (headersKV || []).map((h) => {
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
                case "JSON":
                    return [json()];
                case "JavaScript":
                    return [javascript()];
                case "HTML":
                    return [html()];
                case "XML":
                    return [xml()];
                case "Text":
                default:
                    return [];
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
    }, [bodyFormat, binaryFile?.mimeType]);

    return (
        <div className="request-view flex flex-col max-h-[90vh] overflow-hidden p-2 w-full">
            {errorMessage && (
                <div className="mb-4 flex items-start gap-2 rounded border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-red-400" />
                    <div className="space-y-1">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-red-300">
                            Error
                        </div>
                        <div>{errorMessage}</div>
                    </div>
                </div>
            )}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <div className="m-2">
                        <CommandDialog
                            open={isDialogOpen}
                            onOpenChange={setIsDialogOpen}
                            title="Save to Collection"
                            description="Choose a collection to save this request to."
                        >
                            <CommandInput placeholder="Search collections..." />
                            {renderCollectionsTab()}
                        </CommandDialog>
                    </div>
                    <DialogFooter></DialogFooter>
                </DialogContent>
            </Dialog>
            <div className="flex-none flex justify-between items-center">
                <div className="flex flex-row">
                    <h2 className="text-sm mb-4">
                        {collectionName}
                    </h2>
                    <span className="mr-1 ml-1 mb-4">/</span>
                    <h2
                        className="text-sm mb-4"
                        contentEditable
                        autoCorrect="off"
                        spellCheck="false"
                        onBlur={(e) => setName(e.target.textContent || name)}
                    >
                        {name}
                    </h2>
                </div>
                <div className="flex-none flex flex-row justify-between mb-1">
                    <button
                        onClick={handleSaveRequestToCollection}
                        disabled={isLoading}
                        className="px-3 mr-1 py-1 transition disabled:opacity-50"
                    >
                        {isLoading ? "Saving..." : "Save"}
                    </button>
                </div>
            </div>
            <div className="flex-none flex flex-row">
                <div className="flex space-x-3 mb-4 w-full mt-1">
                    <Select value={method} onValueChange={setMethod}>
                        <SelectTrigger
                            className={`border px-2 py-1 ${
                                methodColourMap.get(method) || "text-white"
                            }`}
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {[
                                "GET",
                                "POST",
                                "PUT",
                                "DELETE",
                                "PATCH",
                                "HEAD",
                                "OPTIONS",
                            ].map((m) => (
                                <SelectItem
                                    key={m}
                                    value={m}
                                    className={methodColourMap.get(m)}
                                >
                                    {m}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <EnvarSupportedInput
                        type="text"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="Enter request URL"
                        className="flex-grow border px-3 py-1"
                    />
                </div>
                <button
                    className="px-3 transition"
                    onClick={handleExecute}
                    disabled={isLoading}
                >
                    <div className="flex flex-col items-center text-xs">
                        <span className="text-sm">
                            {isLoading ? "Sending..." : "Send"}
                        </span>
                        <KbdGroup>
                            {sendKeyParts.map((key, idx) => (
                                <React.Fragment key={`${key}-${idx}`}>
                                    <Kbd>{key.toUpperCase()}</Kbd>
                                    {idx < sendKeyParts.length - 1 && (
                                        <span className="px-1">+</span>
                                    )}
                                </React.Fragment>
                            ))}
                        </KbdGroup>
                    </div>
                </button>
            </div>
            <div className="flex-none mb-4 border-b">
                <button
                    onClick={() => setActiveTab("headers")}
                    className={`px-4 py-2 mr-2 focus:outline-none ${
                        activeTab === "headers" ? "border-b-2" : ""
                    }`}
                >
                    Headers
                </button>
                <button
                    onClick={() => setActiveTab("authorization")}
                    className={`px-4 py-2 mr-2 focus:outline-none ${
                        activeTab === "authorization" ? "border-b-2" : ""
                    }`}
                >
                    Authorization
                </button>
                <button
                    onClick={() => setActiveTab("body")}
                    className={`px-4 py-2 focus:outline-none ${
                        activeTab === "body" ? "border-b-2" : ""
                    }`}
                >
                    Body
                </button>
            </div>
            {activeTab === "headers" && (
                <div className="flex-none mb-4 p-3">
                    <h3 className="font-semibold mb-2">Headers</h3>
                    <div className="flex justify-between items-center mb-2">
                        <Select value={headerType} onValueChange={setHeaderType}>
                            <SelectTrigger className="border px-2 py-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                <SelectItem value="keyvalue">Key/Value</SelectItem>
                                <SelectItem value="raw">Raw (JSON)</SelectItem>
                            </SelectContent>
                        </Select>
                        <button
                            onClick={() => setHeadersExpanded(!headersExpanded)}
                            className="px-2 py-1 transition"
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
                            className="border w-full"
                            onChange={(value) => setHeadersRaw(value)}
                        />
                    )}
                    {headerType === "keyvalue" &&
                        renderKeyValueTable(headersKV, setHeadersKV)}
                </div>
            )}
            {activeTab === "authorization" && (
                <div className="p-3">
                    <h3 className="font-semibold mb-2">Authorization</h3>
                    <Select value={authType} onValueChange={setAuthType}>
                        <SelectTrigger className="px-2 py-1 mb-4">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="bearer">Bearer Token</SelectItem>
                            <SelectItem value="basic">Basic Auth</SelectItem>
                            <SelectItem value="apikey">API Key</SelectItem>
                        </SelectContent>
                    </Select>
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
                            <Select value={apiKeyAddTo} onValueChange={setApiKeyAddTo}>
                                <SelectTrigger className="px-2 py-1">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="headers">Add to Headers</SelectItem>
                                    <SelectItem value="query">Add to Query Params</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>
            )}
            {activeTab === "body" && (
                <div className="flex-none p-3">
                    <h3 className="font-semibold mb-2">Body</h3>
                    <RadioGroup
                        value={bodyType}
                        onValueChange={setBodyType}
                        className="flex flex-wrap gap-4 mb-4"
                    >
                        {[
                            { label: "None", value: "none" },
                            { label: "Raw", value: "raw" },
                            { label: "GraphQL", value: "graphql" },
                            { label: "Form-Data", value: "formdata" },
                            { label: "x-www-form-urlencoded", value: "urlencoded" },
                            { label: "Binary", value: "binary" },
                        ].map((option) => (
                            <div key={option.value} className="flex items-center space-x-2">
                                <RadioGroupItem value={option.value} id={`body-${option.value}`} />
                                <label htmlFor={`body-${option.value}`} className="cursor-pointer">
                                    {option.label}
                                </label>
                            </div>
                        ))}
                    </RadioGroup>

                    {bodyType === "raw" && (
                        <div>
                            <div className="flex items-center mb-2 space-x-2">
                                <span>Language:</span>
                                <Select value={bodyFormat} onValueChange={setBodyFormat}>
                                    <SelectTrigger className="px-2 py-1">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {["Text", "JavaScript", "JSON", "HTML", "XML"].map(
                                            (lang) => (
                                                <SelectItem key={lang} value={lang}>
                                                    {lang}
                                                </SelectItem>
                                            )
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-center mb-2 justify-end">
                                <button
                                    onClick={async () => {
                                        const formatted = await formatCode(
                                            bodyRaw,
                                            getDefaultContentType(),
                                            bodyFormat
                                        );
                                        if (formatted !== bodyRaw) {
                                            setBodyRaw(formatted);
                                        }
                                    }}
                                    className="px-3 py-1 text-sm transition"
                                >
                                    Format Body
                                </button>
                            </div>
                            <div className="max-h-96 overflow-auto">
                                <CodeMirror
                                    value={bodyRaw}
                                    height="350px"
                                    extensions={[...getRequestBodyExtension()]}
                                    theme={copilot}
                                    className="border w-full"
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
                                <p className="text-sm mb-2">Query</p>
                                <div className="max-h-48 overflow-auto">
                                    <CodeMirror
                                        value={graphqlQuery}
                                        height="180px"
                                        extensions={[javascript()]}
                                        theme={copilot}
                                        className="border w-full"
                                        onChange={(value) => setGraphqlQuery(value)}
                                        basicSetup={{
                                            lineNumbers: true,
                                            foldGutter: false,
                                            scrollPastEnd: false,
                                        }}
                                    />
                                </div>
                            </div>
                            <div>
                                <p className="text-sm">
                                    Variables (JSON)
                                </p>
                                <div className="max-h-48 overflow-auto">
                                    <CodeMirror
                                        value={graphqlVariables}
                                        height="180px"
                                        extensions={[json()]}
                                        theme={copilot}
                                        className="border w-full"
                                        onChange={(value) => setGraphqlVariables(value)}
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

                    {bodyType === "formdata" && (
                        <div className="space-y-2">{renderFormDataTable()}</div>
                    )}

                    {bodyType === "urlencoded" && (
                        <div className="space-y-2">
                            {renderKeyValueTable(
                                urlencodedItems,
                                setUrlencodedItems
                            )}
                        </div>
                    )}

                    {bodyType === "binary" && (
                        <div className="space-y-2">
                            <input
                                type="file"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (!f) {
                                        setBinaryFile(null);
                                        return;
                                    }
                                    const r = new FileReader();
                                    r.onload = () => {
                                        const res = r.result || "";
                                        const base64 =
                                            typeof res === "string"
                                                ? res.split(",")[1] || ""
                                                : "";
                                        setBinaryFile({
                                            filename: f.name,
                                            mimeType:
                                                f.type || "application/octet-stream",
                                            dataBase64: base64,
                                        });
                                    };
                                    r.readAsDataURL(f);
                                }}
                            />
                            {binaryFile?.filename ? (
                                <div className="text-xs">
                                    Selected: {binaryFile.filename} (
                                    {binaryFile.mimeType})
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>
            )}

            {(responseData || responseHistory.length > 0) && (
                <div className="flex flex-col w-full flex-1 overflow-hidden">
                    <div className="flex-none border-b flex items-center justify-between">
                        <div className="flex flex-row space-x-4 items-center justify-between w-full">
                            <div className="flex">
                                <button
                                    onClick={() => setResponseTab("body")}
                                    className={`px-4 py-2 -mb-px ${
                                        responseTab === "body"
                                            ? "border-b-2"
                                            : ""
                                    }`}
                                >
                                    Body
                                </button>
                                <button
                                    onClick={() => setResponseTab("headers")}
                                    className={`px-4 py-2 -mb-px ${
                                        responseTab === "headers"
                                            ? "border-b-2"
                                            : ""
                                    }`}
                                >
                                    Headers
                                </button>
                                <button
                                    onClick={() => setResponseTab("history")}
                                    className={`px-4 py-2 -mb-px ${
                                        responseTab === "history"
                                            ? "border-b-2"
                                            : ""
                                    }`}
                                >
                                    History
                                </button>
                            </div>
                            <div className="flex items-center space-x-4 text-sm">
                                {latestResponse ? (
                                    <>
                                        <span
                                            className="px-2 py-1"
                                        >
                                            <strong>Status:</strong> {latestResponse.statusCode}
                                        </span>
                                        {latestResponseSizeKb && (
                                            <span>
                                                <strong>Size:</strong> {latestResponseSizeKb} KB
                                            </span>
                                        )}
                                        <span>
                                            <strong>Time:</strong> {latestResponse.runtimeMS}
                                            ms
                                        </span>
                                    </>
                                ) : (
                                    <span>No responses yet</span>
                                )}
                            </div>
                        </div>
                    </div>
                    {responseTab === "body" && responseData ? (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            <div className="flex-none border-b flex items-center justify-between">
                                {responseContentType && (
                                    <div className="text-xs px-4 py-2">
                                        {responseContentType?.split?.(";")?.[0]}
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 p-3 overflow-auto">
                                <CodeMirror
                                    value={responseBody}
                                    height="100%"
                                    extensions={[
                                        ...getLanguageExtension(
                                            responseContentType,
                                            responseBody
                                        ),
                                    ]}
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
                    ) : null}
                    {responseTab === "headers" && responseData ? (
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
                    ) : null}
                    {responseTab === "history" && (
                        <div className="flex-1 p-4 overflow-auto space-y-3">
                            {responseHistory.length === 0 ? (
                                <div className="text-sm">
                                    No responses recorded yet for this request.
                                </div>
                            ) : (
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr className="text-xs uppercase">
                                            <th className="text-left font-normal border-b pb-2">
                                                Time
                                            </th>
                                            <th className="text-left font-normal border-b pb-2">
                                                Status
                                            </th>
                                            <th className="text-left font-normal border-b pb-2">
                                                Duration
                                            </th>
                                            <th className="text-left font-normal border-b pb-2">
                                                Body Size
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {responseHistory.map((entry) => {
                                            const sizeKb =
                                                entry && typeof entry.body === "string"
                                                    ? (new Blob([entry.body]).size / 1024).toFixed(2)
                                                    : null;
                                            const createdAt =
                                                entry?.createdAt
                                                    ? new Date(entry.createdAt).toLocaleString()
                                                    : "Unknown";
                                            return (
                                                <tr key={entry.id} className="border-b">
                                                    <td className="py-2 pr-4">{createdAt}</td>
                                                    <td className="py-2 pr-4">
                                                        <span
                                                            className="px-2 py-1 text-xs"
                                                        >
                                                            {entry.statusCode}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 pr-4">
                                                        {entry.runtimeMS} ms
                                                    </td>
                                                    <td className="py-2 pr-4">
                                                        {sizeKb ? `${sizeKb} KB` : "—"}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default RequestView;
