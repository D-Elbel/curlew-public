import React, { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
    LoadUserSettings,
    SaveUserSettings,
    FetchUserKeybinds,
    UpdateUserKeybinds
} from "../../bindings/github.com/D-Elbel/curlew/userservice.js";
import { useHotkeys } from "@/services/HotkeysContext.jsx";

export default function SettingsModal({ open, onOpenChange }) {
    const [activeSection, setActiveSection] = useState("general");
    const [settings, setSettings] = useState({
        theme: "dark",
        defaultEnv: "",
        enableAnimations: true
    });
    const [keybinds, setKeybinds] = useState([]);
    const { reloadHotkeys } = useHotkeys();

    useEffect(() => {
        if (open) {
            (async () => {
                try {
                    const loadedSettings = await LoadUserSettings();
                    setSettings(loadedSettings);

                    const loadedKeybinds = await FetchUserKeybinds();
                    setKeybinds(loadedKeybinds);
                } catch (err) {
                    console.error("Failed to load settings", err);
                }
            })();
        }
    }, [open]);

    const handleSave = async () => {
        try {
            await SaveUserSettings(settings);
            await UpdateUserKeybinds(keybinds);
            reloadHotkeys();
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
                                        <Input
                                            value={settings.defaultEnv}
                                            onChange={(e) =>
                                                setSettings({
                                                    ...settings,
                                                    defaultEnv: e.target.value
                                                })
                                            }
                                            className="w-64"
                                        />
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