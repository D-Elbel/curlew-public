import React, { useState, useEffect } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { githubDark } from '@uiw/codemirror-theme-github';
import { ReadEnvFile, SaveEnvFile, CreateEnvFile, ScanEnvars } from '../../bindings/github.com/D-Elbel/curlew/envarservice.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEnvarStore } from "@/stores/envarStore";

export default function EnvFileView({ filename: initialFilename, isNew = false, onClose }) {
    const [content, setContent] = useState('');
    const [filename, setFilename] = useState(initialFilename || '');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    const setEnvironmentVariables = useEnvarStore((state) => state.setEnvironmentVariables);

    useEffect(() => {
        if (!isNew) {
            ReadEnvFile(initialFilename)
                .then((data) => {
                    setContent(data || '');
                    setLoading(false);
                })
                .catch((err) => {
                    setError(err.toString());
                    setLoading(false);
                });
        } else {
            setContent('');
            setLoading(false);
        }
    }, [initialFilename, isNew]);

    const handleSave = async () => {
        setSaving(true);
        setError(null);

        if (!filename || filename.trim() === '') {
            setError('Filename is required.');
            setSaving(false);
            return;
        }

        try {
            if (isNew) {
                await CreateEnvFile(filename);
            }
            await SaveEnvFile(filename, content);
            const updatedEnvs = await ScanEnvars();
            setEnvironmentVariables(updatedEnvs);
            onClose();
        } catch (err) {
            setError(err.toString());
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="p-4 text-gray-300">Loading...</div>;
    }

    if (error) {
        return <div className="p-4 text-red-500">Error: {error}</div>;
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-2 border-b border-gray-700">
                <h2 className="text-lg font-semibold">
                    {isNew ? `New File` : filename}
                </h2>
                <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saving || !filename.trim()}
                >
                    {saving ? 'Saving...' : 'Save'}
                </Button>
            </div>
            <div className="flex-1 min-h-0 p-2">
                <div className="flex h-full flex-col gap-2">
                    {isNew && (
                        <div className="shrink-0">
                            <label className="mb-1 block text-sm text-gray-400">File Name</label>
                            <Input
                                type="text"
                                value={filename}
                                onChange={(e) => setFilename(e.target.value)}
                                placeholder="e.g. dev.env"
                            />
                        </div>
                    )}
                    <div className="flex-1 min-h-0 overflow-hidden border rounded mb-1">
                        <CodeMirror
                            value={content}
                            theme={githubDark}
                            extensions={[]}
                            height="100%"
                            className="h-full [&_.cm-editor]:h-full [&_.cm-scroller]:h-full [&_.cm-scroller]:overflow-auto [&_.cm-content]:pb-12"
                            onChange={(value) => setContent(value)}
                        />
                    </div>
                </div>
            </div>

        </div>
    );
}
