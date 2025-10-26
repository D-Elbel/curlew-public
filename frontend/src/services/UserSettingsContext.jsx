import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import { LoadUserSettings } from "../../bindings/github.com/D-Elbel/curlew/appstateservice.js";

const defaultSettings = {
    theme: "dark",
    defaultEnv: "",
    enableAnimations: true,
    responseHistoryTTL: 5,
};

const ANIMATIONS_DISABLED_CLASS = "animations-disabled";

const UserSettingsContext = createContext(null);

const normalizeSettings = (raw) => {
    if (!raw || typeof raw !== "object") {
        return { ...defaultSettings };
    }

    const theme =
        typeof raw.theme === "string" && raw.theme.trim().length
            ? raw.theme.trim()
            : defaultSettings.theme;

    const defaultEnv =
        typeof raw.defaultEnv === "string" ? raw.defaultEnv : defaultSettings.defaultEnv;

    const enableAnimations = (() => {
        if (typeof raw.enableAnimations === "boolean") {
            return raw.enableAnimations;
        }
        if (typeof raw.enableAnimations === "string") {
            const normalized = raw.enableAnimations.trim().toLowerCase();
            if (normalized === "true") return true;
            if (normalized === "false") return false;
        }
        return defaultSettings.enableAnimations;
    })();

    const responseHistoryTTL = (() => {
        const value =
            typeof raw.responseHistoryTTL === "number"
                ? raw.responseHistoryTTL
                : parseInt(raw.responseHistoryTTL, 10);
        return Number.isFinite(value) && value > 0
            ? value
            : defaultSettings.responseHistoryTTL;
    })();

    return {
        theme,
        defaultEnv,
        enableAnimations,
        responseHistoryTTL,
    };
};

const syncAnimationPreference = (enableAnimations) => {
    if (typeof document === "undefined") {
        return;
    }
    const root = document.documentElement;
    const body = document.body;

    if (!root) {
        return;
    }

    if (enableAnimations) {
        root.classList.remove(ANIMATIONS_DISABLED_CLASS);
        if (body) {
            body.classList.remove(ANIMATIONS_DISABLED_CLASS);
        }
    } else {
        root.classList.add(ANIMATIONS_DISABLED_CLASS);
        if (body) {
            body.classList.add(ANIMATIONS_DISABLED_CLASS);
        }
    }
};

export const UserSettingsProvider = ({ children }) => {
    const [settings, setSettings] = useState(defaultSettings);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const refreshSettings = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const loaded = await LoadUserSettings();
            const normalized = normalizeSettings(loaded);
            setSettings(normalized);
            return normalized;
        } catch (err) {
            console.error("Failed to load user settings", err);
            setError(err);
            return { ...defaultSettings };
        } finally {
            setLoading(false);
        }
    }, []);

    const updateSettings = useCallback((updater) => {
        setSettings((prev) => {
            if (typeof updater === "function") {
                const next = updater(prev);
                return normalizeSettings({
                    ...prev,
                    ...next,
                });
            }
            return normalizeSettings({
                ...prev,
                ...updater,
            });
        });
    }, []);

    useEffect(() => {
        refreshSettings().catch(() => {
            // Errors are already logged in refreshSettings.
        });
    }, [refreshSettings]);

    useEffect(() => {
        syncAnimationPreference(settings.enableAnimations);
    }, [settings.enableAnimations]);

    const value = useMemo(
        () => ({
            settings,
            loading,
            error,
            refreshSettings,
            updateSettings,
        }),
        [settings, loading, error, refreshSettings, updateSettings],
    );

    return (
        <UserSettingsContext.Provider value={value}>
            {children}
        </UserSettingsContext.Provider>
    );
};

export const useUserSettings = () => {
    const context = useContext(UserSettingsContext);
    if (!context) {
        throw new Error("useUserSettings must be used within a UserSettingsProvider");
    }
    return context;
};
