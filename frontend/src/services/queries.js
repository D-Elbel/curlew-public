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
};
