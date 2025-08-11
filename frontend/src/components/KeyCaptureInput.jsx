import React, { useState, useEffect, useRef } from "react";

export default function KeyCaptureInput({ value, onChange }) {
    const [capturing, setCapturing] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        if (!capturing) return;

        const handleKeyDown = (e) => {
            e.preventDefault();
            e.stopPropagation();

            let keys = [];
            if (e.ctrlKey) keys.push("ctrl");
            if (e.altKey) keys.push("alt");
            if (e.shiftKey) keys.push("shift");
            if (e.metaKey) keys.push("meta");

            const key = e.key.toLowerCase();
            if (!["control", "shift", "alt", "meta"].includes(key)) {
                keys.push(key);
            }

            onChange(keys.join("+"));
            setCapturing(false);
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [capturing, onChange]);

    return (
        <input
            ref={inputRef}
            type="text"
            value={value}
            readOnly
            onFocus={() => setCapturing(true)}
            onBlur={() => setCapturing(false)}
            className="border rounded p-2 w-full cursor-pointer"
            placeholder="Click to set shortcut"
        />
    );
}