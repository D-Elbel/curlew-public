import * as React from "react"
import { cn } from "@/lib/utils"
import { useEnvarStore } from "@/stores/envarStore"
const extractEnvMatches = (text = "", activeEnvVars = {}) => {
    if (!text) return []

    const regex = /\{\{(.*?)\}\}/g
    const seen = new Set()
    const matches = []
    let match

    while ((match = regex.exec(text))) {
        const rawKey = match[1] ?? ""
        const trimmedKey = rawKey.trim()
        if (!trimmedKey || seen.has(trimmedKey)) {
            continue
        }
        seen.add(trimmedKey)

        const exists = Object.prototype.hasOwnProperty.call(activeEnvVars, trimmedKey)
        matches.push({
            key: trimmedKey,
            exists,
            value: exists ? activeEnvVars[trimmedKey] : null,
        })
    }

    return matches
}

export function EnvarSupportedInput({ value = "", onChange, className, ...props }) {
    const envs = useEnvarStore(state => state.environmentVariables);
    const activeEnv = useEnvarStore(state => state.activeEnvironment);
    const inputRef = React.useRef(null);
    const containerRef = React.useRef(null);
    const [showEnvDetails, setShowEnvDetails] = React.useState(false);

    const activeEnvVars = React.useMemo(() => {
        if (!activeEnv) return {}
        const envFile = envs.find(e => e.env === activeEnv)
        return envFile?.variables ?? {}
    }, [envs, activeEnv])

    const envMatches = React.useMemo(
        () => extractEnvMatches(value, activeEnvVars),
        [value, activeEnvVars]
    )

    React.useEffect(() => {
        if (envMatches.length === 0 && showEnvDetails) {
            setShowEnvDetails(false)
        }
    }, [envMatches, showEnvDetails])

    React.useEffect(() => {
        if (!showEnvDetails) return

        const handleClick = (event) => {
            if (!containerRef.current?.contains(event.target)) {
                setShowEnvDetails(false)
            }
        }

        document.addEventListener("mousedown", handleClick)
        return () => document.removeEventListener("mousedown", handleClick)
    }, [showEnvDetails])

    const getHighlightedText = React.useCallback(
        (text) => {
            const safeText = text ?? ""
            const parts = safeText.split(/(\{\{.*?\}\})/g)
            return parts.map((part, index) => {
                if (/\{\{.*?\}\}/.test(part)) {
                    const key = part.slice(2, -2)
                    const trimmedKey = key.trim()
                    const hasEnv = Object.prototype.hasOwnProperty.call(activeEnvVars, trimmedKey)
                    return (
                        <span
                            key={`env-${index}-${trimmedKey}`}
                            className={hasEnv ? "text-yellow-500" : "text-red-500"}
                        >
                            {part}
                        </span>
                    )
                }
                return <span key={`text-${index}`}>{part}</span>
            })
        },
        [activeEnvVars]
    )

    return (
        <div
            ref={containerRef}
            className={cn("relative w-full font-mono text-sm leading-[1.5]", className)}
        >
            {envMatches.length > 0 && (
                <button
                    type="button"
                    onClick={() => setShowEnvDetails((prev) => !prev)}
                    className="absolute -top-5 left-2 select-none rounded-t-md bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-100 shadow border border-slate-700"
                >
                    Env
                </button>
            )}

            <div
                className="absolute inset-0 whitespace-pre-wrap bg-black break-words px-3 py-1 z-50"
                aria-hidden
                onMouseDown={() => inputRef.current?.focus()}
            >
                {getHighlightedText(value)}
            </div>

            <input
                ref={inputRef}
                value={value}
                onChange={onChange}
                className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-white px-3 py-1 outline-none z-50"
                style={{
                    WebkitTextFillColor: "transparent",
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                    lineHeight: '1.5'
                }}
                spellCheck={false}
                autoComplete="off"
                {...props}
            />

            {showEnvDetails && envMatches.length > 0 && (
                <div className="absolute left-0 top-full z-30 mt-2 w-64 rounded-md border border-slate-700 bg-slate-900/95 p-3 text-xs shadow-lg backdrop-blur">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                        Variables in use
                    </div>
                    <div className="max-h-56 overflow-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="text-[10px] uppercase text-slate-400">
                                    <th className="border-b border-slate-700 pb-1 text-left font-normal">
                                        Key
                                    </th>
                                    <th className="border-b border-slate-700 pb-1 text-left font-normal">
                                        Value
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {envMatches.map(({ key, exists, value }) => (
                                    <tr key={key} className="align-top">
                                        <td className="py-1 pr-2 font-mono text-[11px] text-slate-200">
                                            {key}
                                        </td>
                                        <td
                                            className={cn(
                                                "py-1 text-slate-300",
                                                !exists && "text-red-300"
                                            )}
                                        >
                                            {exists ? (
                                                <span className="break-all">{value}</span>
                                            ) : (
                                                "Not defined in active environment"
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
