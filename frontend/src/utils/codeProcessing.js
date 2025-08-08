import * as prettier from 'prettier/standalone';
import parserBabel from 'prettier/parser-babel';
import * as parserHtml from 'prettier/parser-html';
import parserPostcss from 'prettier/parser-postcss'
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { xml } from "@codemirror/lang-xml";
import { javascript } from "@codemirror/lang-javascript";
import { css } from "@codemirror/lang-css";

const safeString = (value) => {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return '';
    if(Array.isArray(value) && value.length){
        //TODO: Clearer parsing out of types
        String(value[0])
    }
    return String(value);
};


export const formatCode = (code, contentType, bodyFormat) => {
    console.log("formatCode", code, contentType, bodyFormat)
    if (!code || typeof code === "object" || !code.trim()) return code;

    try {
        const type = safeString(contentType).toLowerCase();
        const format = bodyFormat || '';
        console.log("formatcode type", type, format)
        if (type.includes('json') || format === 'JSON') {
            try {
                const parsed = JSON.parse(code);
                return JSON.stringify(parsed, null, 2);
            } catch (e) {
                // If JSON parsing fails, try prettier
                return prettier.format(code, {
                    parser: 'json',
                    plugins: [parserBabel],
                    printWidth: 80,
                    tabWidth: 2,
                });
            }
        }

        if (type.includes('javascript') || format === 'JavaScript') {
            return prettier.format(code, {
                parser: 'babel',
                plugins: [parserBabel],
                printWidth: 80,
                tabWidth: 2,
                useTabs: false,
                semi: true,
                singleQuote: true,
            });
        }

        if (type.includes('html') || format === 'HTML') {
            return prettier.format(code, {
                parser: 'html',
                plugins: [parserHtml],
                printWidth: 80,
                tabWidth: 2,
                htmlWhitespaceSensitivity: 'css',
            });
        }

        if (type.includes('css') || format === 'CSS') {
            return prettier.format(code, {
                parser: 'css',
                plugins: [parserPostcss],
                printWidth: 80,
                tabWidth: 2,
            });
        }
    } catch (error) {
        console.warn('Failed to format code:', error);
    }
    return code;
};

export const formatContent = (content, contentType) => {
    if (!content) return "";

    console.log(contentType)
    const type = contentType[0]?.toLowerCase() || '';

    if (type.includes('json') || type.includes('application/json')) {
        try {
            if (typeof content === 'string') {
                const parsed = JSON.parse(content);
                return JSON.stringify(parsed, null, 2);
            } else if (typeof content === 'object') {
                return JSON.stringify(content, null, 2);
            }
        } catch (e) {

        }
    }

    if (type.includes('html') || type.includes('xml')) {
        if (typeof content === 'string' && content.length > 0) {
            return content
                .replace(/></g, '>\n<')
                .replace(/^\s+|\s+$/gm, '')
                .split('\n')
                .map((line, index) => {
                    const depth = (line.match(/^<[^\/]/g) ? 1 : 0) - (line.match(/<\//g) || []).length;
                    return '  '.repeat(Math.max(0, depth)) + line.trim();
                })
                .join('\n');
        }
    }

    return typeof content === 'string' ? content : JSON.stringify(content, null, 2);
};

export const getLanguageExtension = (contentType, content) => {

    if (!contentType && !content) return [];

    const type = contentType?.toLowerCase || '';

    if (type.includes('json') || type.includes('application/json')) {
        return [json()];
    }
    if (type.includes('html') || type.includes('text/html')) {
        return [html()];
    }
    if (type.includes('xml') || type.includes('application/xml') || type.includes('text/xml')) {
        return [xml()];
    }
    if (type.includes('javascript') || type.includes('application/javascript') || type.includes('text/javascript')) {
        return [javascript()];
    }
    if (type.includes('css') || type.includes('text/css')) {
        return [css()];
    }

    if (content) {
        const trimmed = content.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
                JSON.parse(trimmed);
                return [json()];
            } catch (e) {
                console.warn(e)
            }
        }

        if (trimmed.startsWith('<!DOCTYPE') ||
            trimmed.startsWith('<html') ||
            /<[a-z][\s\S]*>/i.test(trimmed)) {
            return [html()];
        }
        if (trimmed.startsWith('<?xml') ||
            (trimmed.startsWith('<') && !trimmed.includes('<html'))) {
            return [xml()];
        }
    }
    return [];
};


