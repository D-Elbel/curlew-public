import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { LoadUserSettings, SaveUserSettings } from "../../bindings/github.com/D-Elbel/curlew/userservice.js";

export default function SettingsModal({ open, onClose }) {
    const [settings, setSettings] = useState({
        theme: "dark",
        defaultEnv: "",
        enableAnimations: true
    });
    const [loading, setLoading] = useState(true);


    useEffect(() => {
        if (open) {
            (async () => {
                try {
                    const loaded = await LoadUserSettings();
                    setSettings(loaded);
                } catch (err) {
                    console.error("Failed to load settings", err);
                } finally {
                    setLoading(false);
                }
            })();
        }
    }, [open]);

    const handleSave = async () => {
        try {
            await SaveUserSettings(settings);
            onClose();
        } catch (err) {
            console.error("Failed to save settings", err);
        }
    };

    if (loading) return null;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>User Settings</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium">Theme</label>
                        <select
                            value={settings.theme}
                            onChange={(e) => setSettings({ ...settings, theme: e.target.value })}
                            className="w-full border rounded p-2"
                        >
                            <option value="dark">Dark</option>
                            <option value="light">Light</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium">Default Environment</label>
                        <Input
                            value={settings.defaultEnv}
                            onChange={(e) => setSettings({ ...settings, defaultEnv: e.target.value })}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <span>Enable Animations</span>
                        <Switch
                            checked={settings.enableAnimations}
                            onCheckedChange={(checked) => setSettings({ ...settings, enableAnimations: checked })}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>Save</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}