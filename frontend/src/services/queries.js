export const requestQueries = {
    getById: `
        SELECT
            requests.id AS id,
            requests.collection_id AS collectionId,
            collections.name AS collectionName,
            requests.name AS name,
            requests.description AS description,
            requests.method AS method,
            requests.url AS url,
            requests.headers AS headers,
            requests.body AS body,
            requests.body_type AS bodyType,
            requests.body_format AS bodyFormat,
            requests.auth AS auth
        FROM requests
        LEFT JOIN collections ON collections.id = requests.collection_id
        WHERE requests.id = ?
        LIMIT 1;
    `,
    getLatestResponse: `
        SELECT
            id,
            status_code AS statusCode,
            headers,
            body,
            runtime_ms AS runtimeMS,
            request_id AS requestId,
            created_at AS createdAt
        FROM responses
        WHERE request_id = ?
        ORDER BY COALESCE(created_at, CURRENT_TIMESTAMP) DESC, id DESC
        LIMIT 1;
    `,
    getAllList: `
        SELECT
            id AS id,
            collection_id AS collectionId,
            name AS name,
            description AS description,
            method AS method,
            url AS url,
            sort_order AS sortOrder
        FROM requests
        ORDER BY collection_id, COALESCE(sort_order, id);
    `,
    insertRequest: `
        INSERT INTO requests (
            collection_id,
            name,
            description,
            method,
            url,
            headers,
            body,
            body_type,
            body_format,
            auth,
            sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,
    updateRequest: `
        UPDATE requests
        SET
            collection_id = ?,
            name = ?,
            description = ?,
            method = ?,
            url = ?,
            headers = ?,
            body = ?,
            body_type = ?,
            body_format = ?,
            auth = ?
        WHERE id = ?;
    `,
    deleteRequest: `
        DELETE FROM requests WHERE id = ?;
    `,
    getMaxSortOrder: `
        SELECT MAX(sort_order) AS maxSortOrder
        FROM requests
        WHERE (collection_id IS NULL AND ? IS NULL) OR collection_id = ?;
    `,
    updateSortOrder: `
        UPDATE requests
        SET sort_order = ?
        WHERE id = ?;
    `,
    setCollection: `
        UPDATE requests
        SET collection_id = ?
        WHERE id = ?;
    `,
    search: `
        SELECT id, collection_id AS collectionId, name, description, body, url, method
        FROM requests
        WHERE name = ? OR url = ?
           OR name LIKE ? OR url LIKE ? OR body LIKE ?
        ORDER BY id ASC;
    `,
    responseHistory: `
        SELECT id, status_code AS statusCode, headers, body, runtime_ms AS runtimeMS, request_id AS requestId, created_at AS createdAt
        FROM responses
        WHERE request_id = ?
        ORDER BY COALESCE(created_at, CURRENT_TIMESTAMP) DESC, id DESC;
    `,
    insertResponse: `
        INSERT INTO responses (status_code, headers, body, runtime_ms, request_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?);
    `,
    duplicateSource: `
        SELECT r.collection_id AS collectionId, c.name AS collectionName, r.name, r.description, r.method, r.url, r.headers, r.body, r.body_type AS bodyType, r.body_format AS bodyFormat, r.auth
        FROM requests r
        LEFT JOIN collections c ON c.id = r.collection_id
        WHERE r.id = ?;
    `,
    duplicateResponses: `
        SELECT status_code AS statusCode, headers, body, runtime_ms AS runtimeMS, created_at AS createdAt
        FROM responses
        WHERE request_id = ?
        ORDER BY COALESCE(created_at, CURRENT_TIMESTAMP), id;
    `,
    responseHistoryTTL: `
        SELECT value FROM app_state WHERE key = 'response_history_ttl';
    `,
    trimResponseHistory: `
        DELETE FROM responses
        WHERE request_id = ?
          AND id NOT IN (
            SELECT id FROM responses
            WHERE request_id = ?
            ORDER BY COALESCE(created_at, CURRENT_TIMESTAMP) DESC, id DESC
            LIMIT ?
          );
    `,
};

export const collectionQueries = {
    getAll: `
        SELECT
            id AS id,
            name AS name,
            description AS description,
            CASE
                WHEN parent_collection = id THEN NULL
                ELSE parent_collection
            END AS parentCollectionId
        FROM collections;
    `,
    insert: `
        INSERT INTO collections (id, name, description, parent_collection)
        VALUES (?, ?, ?, ?);
    `,
    delete: `
        DELETE FROM collections WHERE id = ?;
    `,
    updateParent: `
        UPDATE collections
        SET parent_collection = ?
        WHERE id = ?;
    `,
};
