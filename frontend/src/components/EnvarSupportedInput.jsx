import * as React from "react"
import { Input } from "@/components/ui/input.js";
import { cn } from "@/lib/utils"
import { useEnvarStore } from "@/stores/envarStore"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"


function checkEnvs(envs, activeEnv, text) {
    const match = text.match(/\{\{(.*?)\}\}/);
    if (!match) {
        return false;
    }
    const key = match[1];
    const envFile = envs.find(e => e.env === activeEnv);
    if (!envFile || !envFile.variables) {
        return false;
    }
    if (Object.prototype.hasOwnProperty.call(envFile.variables, key)) {
        return envFile.variables[key];
    }
    return false;
}

export function EnvarSupportedInput({ value, onChange, className, ...props }) {
    const envs = useEnvarStore(state => state.environmentVariables);
    const activeEnv = useEnvarStore(state => state.activeEnvironment);
    const inputRef = React.useRef(null);

    const getHighlightedText = (text) => {
        const parts = text.split(/(\{\{.*?\}\})/g)
        return parts.map((part, index) => {
            if (part.match(/\{\{.*?\}\}/)) {
                const envValue = checkEnvs(envs, activeEnv, part)
                const hasEnvar = Boolean(envValue)
                return (
                    <span
                        key={index}
                        title={hasEnvar ? envValue : 'Unknown variable'} // shows value on hover
                        className={hasEnvar ? "text-yellow-500" : "text-red-500"}
                    >
            {part}
          </span>
                )
            }
            return <span key={index}>{part}</span>
        })
    }

    return (
        <div
            className={cn("relative w-full font-mono text-sm leading-[1.5]", className)}
        >
            <div
                className="absolute inset-0 whitespace-pre-wrap break-words px-3 py-1"
                aria-hidden
                onMouseDown={() => inputRef.current?.focus()}
            >
                {getHighlightedText(value)}
            </div>

            <input
                ref={inputRef}
                value={value}
                onChange={onChange}
                className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-white px-3 py-1 outline-none"
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
        </div>
    )
}