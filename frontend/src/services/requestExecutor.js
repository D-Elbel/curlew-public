export async function executeHttpRequest({
    method,
    url,
    headers,
    body,
    bodyType,
    bodyFormat,
    auth,
}) {
    const headerMap = parseHeaders(headers);
    if (auth && !headerMap.Authorization) {
        headerMap.Authorization = auth;
    }

    const prepared = prepareBody(bodyType, body, bodyFormat, headerMap);
    const start = now();
    let response;
    try {
        response = await fetch(url, {
            method,
            headers: prepared.headers,
            body: prepared.body,
        });
    } catch (error) {
        throw enrichFetchError(error, url);
    }
    const runtimeMS = Math.round(now() - start);

    const responseHeaders = collectHeaders(response.headers);
    const text = await response.text();
    let responseBody;
    try {
        responseBody = JSON.parse(text);
    } catch {
        responseBody = text;
    }

    return {
        statusCode: response.status,
        headers: responseHeaders,
        body: responseBody,
        runtimeMS,
        createdAt: new Date().toISOString(),
    };
}

function enrichFetchError(error, requestUrl) {
    const message = error?.message || error?.toString?.() || "Request failed.";
    if (isLikelyCorsError(error, requestUrl)) {
        return new Error(
            `${message} This is often caused by CORS restrictions on the target host.`,
        );
    }
    return new Error(message);
}

function isLikelyCorsError(error, requestUrl) {
    if (!error) return false;
    const name = typeof error.name === "string" ? error.name : "";
    const message = typeof error.message === "string" ? error.message : "";
    const corsHint = /failed to fetch|networkerror/i;
    if (!corsHint.test(message) && name !== "TypeError") {
        return false;
    }
    if (typeof window === "undefined") {
        return false;
    }
    try {
        const targetOrigin = new URL(requestUrl, window.location.href).origin;
        return targetOrigin !== window.location.origin;
    } catch {
        return false;
    }
}

function parseHeaders(headersInput) {
    if (!headersInput) return {};
    if (typeof headersInput === "object") {
        return { ...headersInput };
    }
    try {
        const parsed = JSON.parse(headersInput);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function prepareBody(bodyType, body, bodyFormat, headers) {
    const normalizedHeaders = normalizeHeaders(headers);

    switch (bodyType) {
        case "none":
            return { headers: normalizedHeaders, body: undefined };
        case "graphql": {
            const payload = parseJSONBody(body, "Invalid GraphQL payload");
            ensureHeader(normalizedHeaders, "Content-Type", "application/json");
            return {
                headers: normalizedHeaders,
                body: JSON.stringify(payload || {}),
            };
        }
        case "formdata": {
            const formData = buildFormData(body);
            delete normalizedHeaders["Content-Type"];
            delete normalizedHeaders["content-type"];
            return { headers: normalizedHeaders, body: formData };
        }
        case "urlencoded": {
            const params = buildUrlEncoded(body);
            ensureHeader(
                normalizedHeaders,
                "Content-Type",
                "application/x-www-form-urlencoded",
            );
            return { headers: normalizedHeaders, body: params.toString() };
        }
        case "binary": {
            const { blob, mimeType } = buildBinaryBody(body);
            ensureHeader(
                normalizedHeaders,
                "Content-Type",
                mimeType || "application/octet-stream",
            );
            return { headers: normalizedHeaders, body: blob };
        }
        case "raw":
        default: {
            if (bodyType === "raw") {
                const defaultType = defaultContentType(bodyFormat);
                if (defaultType) {
                    ensureHeader(normalizedHeaders, "Content-Type", defaultType);
                }
            }
            return { headers: normalizedHeaders, body: body ?? "" };
        }
    }
}

function parseJSONBody(body, errorMessage) {
    try {
        if (!body) return {};
        if (typeof body === "object") return body;
        return JSON.parse(body);
    } catch (err) {
        throw new Error(errorMessage || err.message);
    }
}

function buildFormData(body) {
    const payload = parseJSONBody(body, "Invalid form-data payload");
    const fields = Array.isArray(payload?.fields) ? payload.fields : [];
    const formData = new FormData();

    fields.forEach((field) => {
        if (!field?.key) return;
        if (field.type === "file") {
            const blob = decodeBase64(
                field.dataBase64 || "",
                field.mimeType || "application/octet-stream",
            );
            formData.append(
                field.key,
                new File([blob], field.filename || "file", {
                    type: field.mimeType || "application/octet-stream",
                }),
            );
        } else {
            formData.append(field.key, field.value ?? "");
        }
    });

    return formData;
}

function buildUrlEncoded(body) {
    const payload = parseJSONBody(body, "Invalid urlencoded payload");
    const fields = Array.isArray(payload?.fields) ? payload.fields : [];
    const params = new URLSearchParams();
    fields.forEach((field) => {
        if (!field?.key) return;
        params.append(field.key, field.value ?? "");
    });
    return params;
}

function buildBinaryBody(body) {
    const payload = parseJSONBody(body, "Invalid binary payload");
    const mimeType = payload?.mimeType || "application/octet-stream";
    const blob = decodeBase64(payload?.dataBase64 || "", mimeType);
    return { blob, mimeType };
}

function decodeBase64(dataBase64, mimeType) {
    const binary = atob(dataBase64 || "");
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
}

function defaultContentType(bodyFormat) {
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

function ensureHeader(headers, key, value) {
    if (!headers[key]) {
        headers[key] = value;
    }
}

function normalizeHeaders(headers) {
    const normalized = {};
    Object.entries(headers || {}).forEach(([key, value]) => {
        if (value === undefined || value === null) {
            return;
        }
        normalized[key] = Array.isArray(value) ? value.join(", ") : String(value);
    });
    return normalized;
}

function collectHeaders(headers) {
    const collected = {};
    headers.forEach((value, key) => {
        if (collected[key]) {
            const current = collected[key];
            collected[key] = Array.isArray(current)
                ? [...current, value]
                : [current, value];
        } else {
            collected[key] = value;
        }
    });
    return collected;
}

function now() {
    if (typeof performance !== "undefined" && performance.now) {
        return performance.now();
    }
    return Date.now();
}
