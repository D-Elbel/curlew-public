import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useEnvarStore } from "@/stores/envarStore.js";
import {
    ClearAllCookies,
    DeleteCookie,
    ListCookies,
    UpsertCookie,
} from "../../bindings/github.com/D-Elbel/curlew/cookieservice.js";
import {
    Cookie as CookieIcon,
    Loader2,
    Plus,
    RefreshCw,
    Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const sameSiteOptions = [
    { value: "unset", label: "Not set" },
    { value: "default", label: "Default" },
    { value: "lax", label: "Lax" },
    { value: "strict", label: "Strict" },
    { value: "none", label: "None" },
];

const createEmptyForm = (scope) => ({
    environmentId: scope && scope !== "global" ? scope : null,
    domain: "",
    path: "/",
    name: "",
    value: "",
    hostOnly: false,
    httpOnly: false,
    secure: false,
    session: true,
    sameSite: "",
    expiresAt: "",
});

const coerceDate = (value) => {
    if (!value) {
        return null;
    }
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === "string" || typeof value === "number") {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof value === "object") {
        if (value.Time) {
            return coerceDate(value.Time);
        }
        if (value.time) {
            return coerceDate(value.time);
        }
        if (typeof value.seconds === "number") {
            return new Date(value.seconds * 1000);
        }
    }
    return null;
};

const formatExpires = (cookie) => {
    if (cookie.session || !cookie.expiresAt) {
        return "Session";
    }
    const parsed = coerceDate(cookie.expiresAt);
    if (!parsed) {
        return "Unknown";
    }
    return parsed.toLocaleString();
};

const dateToInputValue = (value) => {
    const parsed = coerceDate(value);
    if (!parsed) {
        return "";
    }
    return parsed.toISOString().slice(0, 16);
};

const cookieToForm = (cookie) => ({
    environmentId: cookie.environmentId ?? null,
    domain: cookie.domain ?? "",
    path: cookie.path ?? "/",
    name: cookie.name ?? "",
    value: cookie.value ?? "",
    hostOnly: !!cookie.hostOnly,
    httpOnly: !!cookie.httpOnly,
    secure: !!cookie.secure,
    session: !!cookie.session,
    sameSite: cookie.sameSite ?? "",
    expiresAt: cookie.session ? "" : dateToInputValue(cookie.expiresAt),
});

function CookieManager({ open, onOpenChange }) {
    const envs = useEnvarStore((state) => state.environmentVariables);
    const activeEnv = useEnvarStore((state) => state.activeEnvironment);
    const [scope, setScope] = useState(activeEnv || "global");
    const [cookies, setCookies] = useState([]);
    const [selectedCookie, setSelectedCookie] = useState(null);
    const [formState, setFormState] = useState(
        createEmptyForm(activeEnv || "global")
    );
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [formError, setFormError] = useState("");
    const [search, setSearch] = useState("");

    const scopeOptions = useMemo(
        () => [
            { value: "global", label: "Global (all environments)" },
            ...envs.map((env) => ({ value: env.env, label: env.env })),
        ],
        [envs]
    );

    useEffect(() => {
        if (open) {
            setScope(activeEnv || "global");
            setFormState(createEmptyForm(activeEnv || "global"));
            setSelectedCookie(null);
            setSearch("");
        }
    }, [open, activeEnv]);

    useEffect(() => {
        setSelectedCookie(null);
        setFormState(createEmptyForm(scope));
    }, [scope]);

    const loadCookies = useCallback(async () => {
        if (!open) {
            return;
        }
        setLoading(true);
        setError("");
        try {
            const scopeValue = scope === "global" ? null : scope;
            const result = await ListCookies(scopeValue);
            setCookies(Array.isArray(result) ? result : []);
        } catch (err) {
            console.error("Failed to load cookies:", err);
            setCookies([]);
            setError("Unable to load cookies. Please try again.");
        } finally {
            setLoading(false);
        }
    }, [scope, open]);

    useEffect(() => {
        if (!open) {
            return;
        }
        loadCookies();
    }, [open, scope, loadCookies]);

    useEffect(() => {
        if (selectedCookie) {
            setFormState(cookieToForm(selectedCookie));
        }
    }, [selectedCookie]);

    const filteredCookies = useMemo(() => {
        if (!search) {
            return cookies;
        }
        const term = search.toLowerCase();
        return cookies.filter((cookie) =>
            [cookie.domain, cookie.name, cookie.path, cookie.environmentId || "global"]
                .filter(Boolean)
                .some((value) => value.toLowerCase().includes(term))
        );
    }, [cookies, search]);

    const handleInputChange = (field, value) => {
        setFormState((prev) => ({
            ...prev,
            [field]: value,
        }));
    };

    const handleCheckboxChange = (field, checked) => {
        setFormState((prev) => ({
            ...prev,
            [field]: !!checked,
        }));
    };

    const handleFormSubmit = async (event) => {
        event.preventDefault();
        setFormError("");
        const trimmedDomain = formState.domain.trim();
        const trimmedName = formState.name.trim();

        if (!trimmedDomain || !trimmedName) {
            setFormError("Domain and name are required.");
            return;
        }

        const payload = {
            environmentId: formState.environmentId || null,
            domain: trimmedDomain.toLowerCase(),
            path: formState.path?.trim() || "/",
            name: trimmedName,
            value: formState.value,
            hostOnly: !!formState.hostOnly,
            httpOnly: !!formState.httpOnly,
            secure: !!formState.secure,
            session: !!formState.session,
            sameSite: formState.sameSite || null,
            expiresAt:
                !formState.session && formState.expiresAt
                    ? Math.floor(new Date(formState.expiresAt).getTime() / 1000)
                    : null,
            extensions: [],
        };

        setSaving(true);
        try {
            await UpsertCookie(payload);
            setSelectedCookie(null);
            setFormState(createEmptyForm(scope));
            await loadCookies();
        } catch (err) {
            console.error("Failed to save cookie:", err);
            setFormError(err?.message || "Failed to save cookie.");
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteCookie = async (cookie) => {
        if (!cookie) {
            return;
        }
        const scopeLabel = cookie.environmentId || "the global jar";
        if (
            !window.confirm(
                `Delete ${cookie.name} for ${cookie.domain} from ${scopeLabel}?`
            )
        ) {
            return;
        }
        try {
            await DeleteCookie(cookie.id);
            if (selectedCookie?.id === cookie.id) {
                setSelectedCookie(null);
                setFormState(createEmptyForm(scope));
            }
            await loadCookies();
        } catch (err) {
            console.error("Failed to delete cookie:", err);
            setError("Failed to delete cookie.");
        }
    };

    const handleClearScope = async () => {
        const label =
            scope === "global" ? "the global cookie jar" : `${scope} environment`;
        if (
            !window.confirm(
                `Remove all cookies for ${label}? This cannot be undone.`
            )
        ) {
            return;
        }
        try {
            await ClearAllCookies(scope === "global" ? null : scope);
            setSelectedCookie(null);
            setFormState(createEmptyForm(scope));
            await loadCookies();
        } catch (err) {
            console.error("Failed to clear cookies:", err);
            setError("Failed to clear cookies.");
        }
    };

    const renderFlag = (label) => (
        <span className="px-2 py-0.5 rounded-full text-[11px]">
            {label}
        </span>
    );
    return (
        <Dialog open={open} onOpenChange={onOpenChange} className="bg-auto">
            <DialogContent className="min-w-[80vw] h-[90vh]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-lg">
                        <CookieIcon className="w-4 h-4 text-amber-400" />
                        Cookie Manager
                    </DialogTitle>
                    <p className="text-sm text-slate-400">
                        Inspect, edit, or import cookies. Environment-scoped cookies
                        only apply to the active environment, while global cookies are
                        always sent.
                    </p>
                </DialogHeader>
                <div className="flex flex-col h-full gap-4">
                    <div className="flex flex-wrap items-center gap-3 border-b pb-3">
                        <div className="flex items-center gap-2">
                            <span className="text-xs uppercase text-slate-400">
                                Scope
                            </span>
                            <Select value={scope} onValueChange={setScope}>
                                <SelectTrigger className="w-48 ">
                                    <SelectValue placeholder="Select scope" />
                                </SelectTrigger>
                                <SelectContent>
                                    {scopeOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex-1 min-w-[220px]">
                            <Input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search by domain, name, or path"
                                className=" border-slate-700"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={loadCookies}
                                disabled={loading}
                            >
                                <RefreshCw className="w-4 h-4 mr-1" />
                                Refresh
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleClearScope}
                                disabled={loading || cookies.length === 0}
                            >
                                <Trash2 className="w-4 h-4 mr-1" />
                                Clear Scope
                            </Button>
                            <Button size="sm" onClick={() => setSelectedCookie(null)}>
                                <Plus className="w-4 h-4 mr-1" />
                                New Cookie
                            </Button>
                        </div>
                    </div>

                    {error && (
                        <div className="text-sm text-red-400 bg-red-900/20 border border-red-900/60 rounded-md px-3 py-2">
                            {error}
                        </div>
                    )}

                    <div className="flex flex-1 gap-4 min-h-0">
                        <div className="flex-1 min-w-0 border  overflow-hidden flex flex-col">
                            <div className="flex items-center justify-between px-4 py-2 text-xs text-slate-400 border-b border-slate-800">
                                <span>{filteredCookies.length} cookies loaded</span>
                                <span>
                                    Global cookies automatically appear for every
                                    environment.
                                </span>
                            </div>
                            <div className="flex-1 overflow-auto">
                                <Table>
                                    <TableHeader className=" sticky top-0">
                                        <TableRow className="text-slate-300">
                                            <TableHead>Domain</TableHead>
                                            <TableHead>Name</TableHead>
                                            <TableHead>Value</TableHead>
                                            <TableHead>Path</TableHead>
                                            <TableHead>Scope</TableHead>
                                            <TableHead>Expires</TableHead>
                                            <TableHead>Flags</TableHead>
                                            <TableHead className="text-right">
                                                Actions
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {loading && (
                                            <TableRow>
                                                <TableCell
                                                    colSpan={8}
                                                    className="text-center py-6"
                                                >
                                                    <div className="flex items-center justify-center gap-2 text-slate-400">
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                        Loading cookies...
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                        {!loading && filteredCookies.length === 0 && (
                                            <TableRow>
                                                <TableCell
                                                    colSpan={8}
                                                    className="text-center py-6 text-slate-400"
                                                >
                                                    No cookies for this scope yet.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                        {!loading &&
                                            filteredCookies.map((cookie) => (
                                                <TableRow
                                                    key={`${cookie.id}-${cookie.environmentId ?? "global"}`}
                                                    onClick={() => setSelectedCookie(cookie)}
                                                    className={cn(
                                                        "cursor-pointer hover:bg-slate-800/70",
                                                        selectedCookie?.id === cookie.id
                                                            ? "bg-slate-800/80"
                                                            : ""
                                                    )}
                                                >
                                                    <TableCell className="font-medium">
                                                        {cookie.domain}
                                                    </TableCell>
                                                    <TableCell>{cookie.name}</TableCell>
                                                    <TableCell className="max-w-[12rem] truncate">
                                                        {cookie.value || <span className="text-slate-500">—</span>}
                                                    </TableCell>
                                                    <TableCell>{cookie.path}</TableCell>
                                                    <TableCell>
                                                        <span
                                                            className={cn(
                                                                "px-2 py-0.5 rounded-full text-[11px]",
                                                                cookie.environmentId
                                                                    ? "bg-blue-500/20 text-blue-200"
                                                                    : "bg-slate-700/70 text-slate-200"
                                                            )}
                                                        >
                                                            {cookie.environmentId || "Global"}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        {formatExpires(cookie)}
                                                    </TableCell>
                                                    <TableCell className="space-x-1">
                                                        {cookie.hostOnly && renderFlag("Host")}
                                                        {cookie.httpOnly && renderFlag("HTTP")}
                                                        {cookie.secure && renderFlag("Secure")}
                                                        {!cookie.session && cookie.sameSite && renderFlag(cookie.sameSite)}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="text-slate-300 hover:text-white"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                handleDeleteCookie(cookie);
                                                            }}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>

                        <div className="w-[320px] flex-shrink-0 border  p-4 flex flex-col">
                            <div className="mb-4">
                                <p className="text-xs uppercase text-slate-400 mb-1">
                                    {selectedCookie ? "Editing existing" : "Create new"}
                                </p>
                                <h3 className="text-lg font-semibold">
                                    {selectedCookie ? selectedCookie.name : "New Cookie"}
                                </h3>
                                <p className="text-xs text-slate-500">
                                    {selectedCookie
                                        ? "Update the selected cookie."
                                        : "Fill in the fields to create a cookie."}
                                </p>
                            </div>
                            <form
                                className="space-y-3 flex-1 overflow-auto pr-1"
                                onSubmit={handleFormSubmit}
                            >
                                <div>
                                    <label className="text-xs text-slate-400">Environment</label>
                                    <Select
                                        value={formState.environmentId || "global"}
                                        onValueChange={(value) =>
                                            handleInputChange(
                                                "environmentId",
                                                value === "global" ? null : value
                                            )
                                        }
                                    >
                                        <SelectTrigger className="w-full bg-slate-800 border-slate-700">
                                            <SelectValue placeholder="Global" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="global">Global</SelectItem>
                                            {envs.map((env) => (
                                                <SelectItem key={env.env} value={env.env}>
                                                    {env.env}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400">Domain</label>
                                    <Input
                                        required
                                        value={formState.domain}
                                        onChange={(event) =>
                                            handleInputChange("domain", event.target.value)
                                        }
                                        placeholder="example.com"
                                        className="bg-slate-800 border-slate-700"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-xs text-slate-400">Path</label>
                                        <Input
                                            value={formState.path}
                                            onChange={(event) =>
                                                handleInputChange("path", event.target.value)
                                            }
                                            placeholder="/"
                                            className="bg-slate-800 border-slate-700"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-slate-400">Name</label>
                                        <Input
                                            required
                                            value={formState.name}
                                            onChange={(event) =>
                                                handleInputChange("name", event.target.value)
                                            }
                                            placeholder="session_id"
                                            className="bg-slate-800 border-slate-700"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400">Value</label>
                                    <Textarea
                                        rows={3}
                                        value={formState.value}
                                        onChange={(event) =>
                                            handleInputChange("value", event.target.value)
                                        }
                                        className="bg-slate-800 border-slate-700"
                                        placeholder="Cookie value"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400">
                                        Expiration
                                    </label>
                                    <Input
                                        type="datetime-local"
                                        value={formState.expiresAt}
                                        disabled={formState.session}
                                        onChange={(event) =>
                                            handleInputChange("expiresAt", event.target.value)
                                        }
                                        className="bg-slate-800 border-slate-700"
                                    />
                                    <label className="flex items-center gap-2 mt-2 text-sm text-slate-300">
                                        <Checkbox
                                            checked={formState.session}
                                            onCheckedChange={(checked) =>
                                                handleCheckboxChange("session", checked)
                                            }
                                        />
                                        Session cookie (no expiration)
                                    </label>
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400">
                                        SameSite
                                    </label>
                                    <Select
                                        value={formState.sameSite || "unset"}
                                        onValueChange={(value) =>
                                            handleInputChange("sameSite", value === "unset" ? "" : value)
                                        }
                                    >
                                        <SelectTrigger className="w-full bg-slate-800 border-slate-700">
                                            <SelectValue placeholder="Not set" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {sameSiteOptions.map((option) => (
                                                <SelectItem key={option.value} value={option.value}>
                                                    {option.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <span className="text-xs text-slate-400">Flags</span>
                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                        <label className="flex items-center gap-2 text-sm text-slate-300">
                                            <Checkbox
                                                checked={formState.hostOnly}
                                                onCheckedChange={(checked) =>
                                                    handleCheckboxChange("hostOnly", checked)
                                                }
                                            />
                                            Host only
                                        </label>
                                        <label className="flex items-center gap-2 text-sm text-slate-300">
                                            <Checkbox
                                                checked={formState.httpOnly}
                                                onCheckedChange={(checked) =>
                                                    handleCheckboxChange("httpOnly", checked)
                                                }
                                            />
                                            HTTP only
                                        </label>
                                        <label className="flex items-center gap-2 text-sm text-slate-300">
                                            <Checkbox
                                                checked={formState.secure}
                                                onCheckedChange={(checked) =>
                                                    handleCheckboxChange("secure", checked)
                                                }
                                            />
                                            Secure
                                        </label>
                                    </div>
                                </div>

                                {formError && (
                                    <p className="text-sm text-red-400">{formError}</p>
                                )}

                                <div className="flex items-center gap-2 pt-2">
                                    <Button type="submit" className="flex-1" disabled={saving}>
                                        {saving ? (
                                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                        ) : null}
                                        Save Cookie
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => {
                                            setSelectedCookie(null);
                                            setFormState(createEmptyForm(scope));
                                            setFormError("");
                                        }}
                                    >
                                        Reset
                                    </Button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default CookieManager;

