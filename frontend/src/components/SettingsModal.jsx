import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from "@/components/ui/select";
import { SaveUserSettings } from "../../bindings/github.com/D-Elbel/curlew/appstateservice.js";
import {
    FetchUserKeybinds,
    UpdateUserKeybinds,
} from "../../bindings/github.com/D-Elbel/curlew/userservice.js";
import { useHotkeys } from "@/services/HotkeysContext.jsx";
import { useEnvarStore } from "@/stores/envarStore";
import { useUserSettings } from "@/services/UserSettingsContext.jsx";

const mapSettingsToFormState = (raw) => {
    const fallback = {
        theme: "dark",
        defaultEnv: "",
        enableAnimations: true,
        responseHistoryTTL: "5",
    };
    if (!raw || typeof raw !== "object") {
        return fallback;
    }
    return {
        theme: raw.theme || "dark",
        defaultEnv: raw.defaultEnv || "",
        enableAnimations:
            typeof raw.enableAnimations === "boolean"
                ? raw.enableAnimations
                : fallback.enableAnimations,
        responseHistoryTTL:
            raw.responseHistoryTTL != null
                ? String(raw.responseHistoryTTL)
                : fallback.responseHistoryTTL,
    };
};

export default function SettingsModal({ open, onOpenChange }) {
    const [activeSection, setActiveSection] = useState("general");
    const { refreshSettings, settings: globalSettings } = useUserSettings();
    const formDefaults = useMemo(
        () => mapSettingsToFormState(globalSettings),
        [globalSettings],
    );
    const [settings, setSettings] = useState(formDefaults);
    const [keybinds, setKeybinds] = useState([]);
    const [ttlError, setTtlError] = useState("");
    const { reloadHotkeys } = useHotkeys();
    const envs = useEnvarStore((state) => state.environmentVariables);
    const NO_ENV_VALUE = "__none__";
    const environmentNames = envs.map((env) => env.env).filter(Boolean);
    const isDefaultEnvMissing = settings.defaultEnv && !environmentNames.includes(settings.defaultEnv);

    useEffect(() => {
        if (!open) {
            return;
        }
        (async () => {
            try {
                const latestSettings = await refreshSettings();
                setSettings(mapSettingsToFormState(latestSettings));
                setTtlError("");
            } catch (err) {
                console.error("Failed to refresh user settings", err);
            }
            try {
                const loadedKeybinds = await FetchUserKeybinds();
                setKeybinds(loadedKeybinds);
            } catch (err) {
                console.error("Failed to load keybinds", err);
            }
        })();
    }, [open, refreshSettings]);

    useEffect(() => {
        if (!open) {
            setSettings(formDefaults);
            setTtlError("");
        }
    }, [formDefaults, open]);

    const handleTtlChange = (value) => {
        setSettings((prev) => ({
            ...prev,
            responseHistoryTTL: value,
        }));

        const parsed = parseInt(value, 10);
        if (!Number.isFinite(parsed) || parsed < 1) {
            setTtlError("Please enter a value of 1 or greater.");
        } else {
            setTtlError("");
        }
    };

    const handleSave = async () => {
        const ttlNumber = parseInt(settings.responseHistoryTTL, 10);
        if (!Number.isFinite(ttlNumber) || ttlNumber < 1) {
            setTtlError("Please enter a value of 1 or greater.");
            return;
        }
        setTtlError("");

        try {
            await SaveUserSettings({
                ...settings,
                responseHistoryTTL: ttlNumber,
            });
            await UpdateUserKeybinds(keybinds);
            reloadHotkeys();
            const latest = await refreshSettings();
            setSettings(mapSettingsToFormState(latest));
        } catch (err) {
            console.error("Failed to save settings", err);
        }
    };

    return (
        <Dialog
            open={open} onOpenChange={onOpenChange}
        >
            <DialogContent
                className="min-w-[80vw] h-[80vh] p-0 overflow-hidden"
            >
                <div className="flex h-full">
                    <div className="w-64 border-r p-4">
                        <h2 className="text-lg font-semibold mb-4">Settings</h2>
                        <nav className="space-y-1">
                            <button
                                className={`w-full text-left px-3 py-2 rounded ${
                                    activeSection === "general"
                                        ? "bg-primary text-primary-foreground"
                                        : "hover:bg-accent"
                                }`}
                                onClick={() => setActiveSection("general")}
                            >
                                General
                            </button>
                            <button
                                className={`w-full text-left px-3 py-2 rounded ${
                                    activeSection === "keybinds"
                                        ? "bg-primary text-primary-foreground"
                                        : "hover:bg-accent"
                                }`}
                                onClick={() => setActiveSection("keybinds")}
                            >
                                Keybinds
                            </button>
                        </nav>
                    </div>

                    <div className="flex-1 flex flex-col">
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {activeSection === "general" && (
                                <>
                                    <section>
                                        <h3 className="text-base font-semibold mb-2">Appearance</h3>
                                        <label className="block text-sm font-medium mb-1">Theme</label>
                                        <select
                                            value={settings.theme}
                                            onChange={(e) =>
                                                setSettings({ ...settings, theme: e.target.value })
                                            }
                                            className="w-64 border rounded p-2"
                                        >
                                            <option value="dark">Dark</option>
                                            <option value="light">Light</option>
                                        </select>
                                    </section>

                                    <section>
                                        <h3 className="text-base font-semibold mb-2">Environment</h3>
                                        <label className="block text-sm font-medium mb-1">
                                            Default Environment
                                        </label>
                                        <Select
                                            value={settings.defaultEnv || NO_ENV_VALUE}
                                            onValueChange={(value) =>
                                                setSettings({
                                                    ...settings,
                                                    defaultEnv: value === NO_ENV_VALUE ? "" : value
                                                })
                                            }
                                        >
                                            <SelectTrigger className="w-64">
                                                <SelectValue placeholder="Select environment" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={NO_ENV_VALUE}>
                                                    No environment
                                                </SelectItem>
                                                {environmentNames.map((name) => (
                                                    <SelectItem key={name} value={name}>
                                                        {name}
                                                    </SelectItem>
                                                ))}
                                                {isDefaultEnvMissing && (
                                                    <SelectItem value={settings.defaultEnv}>
                                                        {settings.defaultEnv} (missing)
                                                    </SelectItem>
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </section>

                                    <section>
                                        <h3 className="text-base font-semibold mb-2">Preferences</h3>
                                        <div className="flex items-center justify-between w-64">
                                            <span>Enable Animations</span>
                                            <Switch
                                                checked={settings.enableAnimations}
                                                onCheckedChange={(checked) =>
                                                    setSettings({
                                                        ...settings,
                                                        enableAnimations: checked
                                                    })
                                                }
                                            />
                                        </div>
                                    </section>

                                    <section>
                                        <h3 className="text-base font-semibold mb-2">Response History</h3>
                                        <label className="block text-sm font-medium mb-1">
                                            Entries to keep per request
                                        </label>
                                        <Input
                                            type="number"
                                            min={1}
                                            value={settings.responseHistoryTTL}
                                            onChange={(e) => handleTtlChange(e.target.value)}
                                            className="w-64"
                                        />
                                        {ttlError ? (
                                            <p className="text-xs text-red-400 mt-1">{ttlError}</p>
                                        ) : (
                                            <p className="text-xs text-gray-400 mt-1">
                                                Oldest responses beyond this count are removed automatically.
                                            </p>
                                        )}
                                    </section>
                                </>
                            )}

                            {activeSection === "keybinds" && (
                                <section>
                                    <h3 className="text-base font-semibold mb-4">Keyboard Shortcuts</h3>
                                    <div className="space-y-3">
                                        {keybinds.map((kb, idx) => (
                                            <div
                                                key={kb.command}
                                                className="flex items-center gap-4"
                                            >
                                                <span className="w-1/3 font-medium">
                                                    {kb.prettyName || kb.command}
                                                </span>
                                                <Input
                                                    value={kb.bind || ""}
                                                    onChange={(e) => {
                                                        const updated = [...keybinds];
                                                        updated[idx] = {
                                                            ...kb,
                                                            bind: e.target.value
                                                        };
                                                        setKeybinds(updated);
                                                    }}
                                                    placeholder="e.g. ctrl+shift+k"
                                                    className="flex-1"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}
                        </div>

                        <div className="border-t p-4 flex justify-end gap-2">
                            <Button onClick={handleSave}>Save</Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
