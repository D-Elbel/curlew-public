import { Call } from "@wailsio/runtime";

const DEFAULT_MAX_ROWS = 200;
const MAX_ROWS = 1000;
const DB_MAIN = "main";

const clampRows = (value) => {
    if (!value || value <= 0) return DEFAULT_MAX_ROWS;
    return Math.min(value, MAX_ROWS);
};

export async function query({ sql, params = [], maxRows, db = DB_MAIN } = {}) {
    const payload = {
        db,
        sql,
        params,
        maxRows: clampRows(maxRows),
        readOnly: true,
    };
    const result = await Call.ByName("main.RequestCRUDService.QuerySQL", payload);
    return normalizeResult(result);
}

export async function exec({ sql, params = [], db = DB_MAIN } = {}) {
    const payload = {
        db,
        sql,
        params,
        readOnly: false,
    };
    const result = await Call.ByName("main.RequestCRUDService.ExecSQL", payload);
    return normalizeExecResult(result);
}

function normalizeResult(result) {
    if (!result || typeof result !== "object") {
        return { rows: [] };
    }
    if (Array.isArray(result.rows)) {
        return result;
    }
    if (Array.isArray(result.Rows)) {
        return { rows: result.Rows };
    }
    return { rows: [] };
}

function normalizeExecResult(result) {
    if (!result || typeof result !== "object") {
        return { rowsAffected: 0, lastInsertId: 0 };
    }
    const rowsAffected = result.rowsAffected ?? result.RowsAffected ?? 0;
    const lastInsertId = result.lastInsertId ?? result.LastInsertID ?? 0;
    return { rowsAffected, lastInsertId };
}
