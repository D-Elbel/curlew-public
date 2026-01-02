import { exec as execDb, query as queryDb } from "@/services/database.js";
import { keybindQueries } from "@/services/queries.js";

export async function fetchUserKeybinds() {
    const result = await queryDb({ sql: keybindQueries.getAll });
    return Array.isArray(result?.rows) ? result.rows : [];
}

export async function updateUserKeybinds(keybinds) {
    if (!Array.isArray(keybinds)) {
        throw new Error("Keybinds payload is required.");
    }

    for (const keybind of keybinds) {
        if (!keybind?.command) {
            throw new Error("Keybind command is required.");
        }
        await execDb({
            sql: keybindQueries.upsert,
            params: [
                keybind.command,
                keybind.bind ?? null,
                keybind.prettyName ?? null,
            ],
        });
    }
}
