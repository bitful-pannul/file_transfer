import { useEffect, useState } from "react";
import KinoFile from "../types/KinoFile";
import useFileTransferStore from "../store/fileTransferStore";
import classNames from "classnames";
import { getReadableFilesize, trimBasePathFromPath, trimPathToFilename } from "../utils/file";
import { FileIcon } from "./FileIcon";
import { FaChevronDown, FaChevronRight, FaDownload, FaFolderPlus, FaLock, FaLockOpen, FaPlus, FaTrash, FaX } from "react-icons/fa6";

interface Props {
    file: KinoFile
    node: string
    isOurFile: boolean
    expanded?: boolean
    onToggleExpand?: () => void
}
function FileEntry({ file, node, isOurFile, expanded, onToggleExpand }: Props) {
    const { filesInProgress, files, api, refreshFiles, onAddFolder, setEditingPermissionsForPath, setPermissionsModalOpen, permissions } = useFileTransferStore();
    const [actualFileSize, setActualFileSize] = useState<string>('')
    const [isCreatingFolder, setIsCreatingFolder] = useState<boolean>(false)
    const [createdFolderName, setCreatedFolderName] = useState<string>('')
    const [savingToNode, setSavingToNode] = useState<boolean>(false)
    const [isDirectory, setIsDirectory] = useState<boolean>(false)
    const [showButtons, setShowButtons] = useState<boolean>(false)

    const showSaveToNode = node !== window.our.node && !isDirectory;

    useEffect(() => {
        const directory = !!file.dir
        setIsDirectory(directory);
    }, [file])

    useEffect(() => {
        const fileSize = getReadableFilesize(file.size)
        setActualFileSize(fileSize);
    }, [file.size])

    const onSaveToNode = () => {
        if (!file.name) return alert('No file name');
        if (!api) return alert('No api');
        setSavingToNode(true);
        api.send({
            data: {
                Download: {
                    name: file.name,
                    target: `${node}@${window.our.process}`
                }
            }
        })
    }

    const onDelete = () => {
        if (!api) return alert('No api');
        if (!file.name || !trimPathToFilename(file.name)) return alert('No filename');
        if (isDirectory && file.dir && file.dir?.length > 0) return alert('Cannot delete a directory with files in it.');
        if (!window.confirm(`Are you sure you want to delete ${trimPathToFilename(file.name)}?`)) return;

        api.send({
            data: {
                Delete: {
                    name: file.name
                }
            }
        })

        setTimeout(() => {
            refreshFiles();
        }, 1000);
    }

    const downloadInfo = Object.entries(filesInProgress).find(([key, _]) => file.name.match(key));
    const downloadInProgress = savingToNode || (downloadInfo?.[1] || 100) < 100;
    const downloadComplete = (
        (downloadInfo?.[1] || 0) === 100 ||
        (files.find(f => trimPathToFilename(f.name) === trimPathToFilename(file.name)) !== undefined)
    );
    const onFolderAdded = () => {
        onAddFolder(trimBasePathFromPath(file.name), createdFolderName, () => {
            setIsCreatingFolder(false);
            setCreatedFolderName('')

            setTimeout(() => {
                refreshFiles();
            }, 1000);
        })
    };

    const onEditPermissions = () => {
        setEditingPermissionsForPath(file.name)
        setPermissionsModalOpen(true)
    }

    const onDownload = () => {
        fetch(`${import.meta.env.BASE_URL}/files?path=${file.name}`)
            .then(response => response.blob())
            .then(blob => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = trimPathToFilename(file.name);
                document.body.appendChild(a);
                a.click();
                a.remove();
            })
    }

    const fileHasSpecialPermissions = permissions
        && permissions[trimBasePathFromPath(file.name)]
        && Object.keys(permissions[trimBasePathFromPath(file.name)]).length > 0;

    return (
        <div
            className={classNames(
                'flex flex-col font-bold px-4 self-stretch grow rounded-xl',
                {
                    'py-2 text-black bg-white hover:bg-orange hover:text-white': !file.dir,
                })}
            onMouseEnter={() => setShowButtons(true)}
            onMouseLeave={() => setShowButtons(false)}
        >
            <div className='flex flex-row justify-between place-items-center pr-1 relative'>
                <div
                    className='flex whitespace-pre-wrap grow mr-1 items-center max-w-[20vw]'
                >
                    {(file.dir) && <button
                        className="icon p-2 thin mr-4 -ml-4"
                        onClick={() => onToggleExpand && onToggleExpand()}
                    >
                        {expanded ? <FaChevronDown /> : <FaChevronRight />}
                    </button>}
                    <FileIcon file={file} />
                    {trimPathToFilename(file.name)}
                    {file.dir && <span className='text-white text-sm px-2 py-1'>
                        ({`${file.dir.length} ${file.dir.length === 1 ? 'file' : 'files'}`})
                    </span>}
                </div>
                {!isDirectory && <span className="ml-auto">{actualFileSize || '0 KB'}</span>}
                {showSaveToNode && <button
                    disabled={isOurFile || downloadInProgress || downloadComplete}
                    className={classNames('px-2 py-0 ml-2', {
                        isOurFile,
                        downloadInProgress,
                        downloadComplete,
                        alt: showButtons,
                        'bg-gray-800': isOurFile || downloadInProgress || downloadComplete
                    })}
                    onClick={onSaveToNode}
                >
                    {isOurFile
                        ? 'Saved'
                        : downloadComplete
                            ? 'Saved'
                            : downloadInProgress
                                ? <span>{downloadInfo?.[1] || 0}%</span>
                                : 'Save'}
                </button>}
                {showButtons && isOurFile && !isCreatingFolder && <div className={classNames("absolute right-0 flex", { 'bg-orange': !isDirectory })}>
                    {isDirectory && <button
                        className={classNames('icon thin ml-2')}
                        onClick={() => isOurFile && setIsCreatingFolder(!isCreatingFolder)}
                    >
                        <FaFolderPlus />
                    </button>}
                    {!isDirectory && <button
                        className={classNames("icon thin ml-2")}
                        onClick={onDownload}
                    >
                        <FaDownload />
                    </button>}
                    <button
                        className={classNames('icon thin ml-2')}
                        onClick={onEditPermissions}
                    >
                        {fileHasSpecialPermissions ? <FaLock /> : <FaLockOpen />}
                    </button>
                    <button
                        className={classNames('icon thin ml-2')}
                        onClick={onDelete}
                    >
                        <FaTrash />
                    </button>
                </div>}
            </div>
            {isCreatingFolder && <div className='flex flex-col p-1'>
                <span className='mx-auto mb-1'>Create a new folder in {trimPathToFilename(file.name)}:</span>
                <div className="flex flex-row">
                    <input
                        type="text"
                        value={createdFolderName}
                        placeholder='folder name'
                        onChange={(e) => setCreatedFolderName(e.target.value)}
                        onKeyUp={(e) => e.key === 'Enter' && onFolderAdded()}
                    />
                    <button
                        className='ml-2 icon'
                        onClick={onFolderAdded}
                    >
                        <FaPlus />
                    </button>
                    <button
                        className='ml-2 icon'
                        onClick={() => setIsCreatingFolder(false)}
                    >
                        <FaX />
                    </button>
                </div>
            </div>}
        </div>
    );
}

export default FileEntry;