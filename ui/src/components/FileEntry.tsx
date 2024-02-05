import { useEffect, useState } from "react";
import KinoFile from "../types/KinoFile";
import useFileTransferStore from "../store/fileTransferStore";
import classNames from "classnames";
import { CgChevronDown, CgChevronRight, CgClose, CgFolderAdd, CgMathPlus } from 'react-icons/cg'

interface Props {
    file: KinoFile
    node: string
    isOurFile: boolean
    isInDir: boolean
}
function FileEntry({ file, node, isOurFile, isInDir }: Props) {
    const { filesInProgress, api, refreshFiles, onAddFolder } = useFileTransferStore();
    const [actualFilename, setActualFilename] = useState<string>('')
    const [actualFileSize, setActualFileSize] = useState<string>('')
    const [isCreatingFolder, setIsCreatingFolder] = useState<boolean>(false)
    const [createdFolderName, setCreatedFolderName] = useState<string>('')
    const [downloading, setDownloading] = useState<boolean>(false)
    const [isDirectory, setIsDirectory] = useState<boolean>(false)
    const [expanded, setExpanded] = useState<boolean>(false)

    const showDownload = node !== window.our.node && !isDirectory;

    useEffect(() => {
        const filename = file.name.split('/').pop() || '';
        setActualFilename(filename);
    }, [file.name])

    useEffect(() => {
        const directory = !!file.dir
        setIsDirectory(directory);
    }, [file])

    useEffect(() => {
        const fileSize = file.size > 1000000000000
            ? `${(file.size / 1000000000000).toFixed(2)} TB`
            : file.size > 1000000000
            ? `${(file.size / 1000000000).toFixed(2)} GB`
            : file.size > 1000000
            ? `${(file.size / 1000000).toFixed(2)} MB`
            : file.size === 0
            ? ''
            : `${(file.size / 1000).toFixed(2)} KB`;
        setActualFileSize(fileSize);
    }, [file.size])

    const onDownload = () => {
        if (!file.name) return alert('No file name');
        if (!api) return alert('No api');
        setDownloading(true);
        api.send({
            data: {
                Download: {
                    name: actualFilename,
                    target: `${node}@${window.our.process}`
                }
            }
        })
    }

    const onDelete = () => {
        if (!api) return alert('No api');
        if (!actualFilename) return alert('No filename');
        if (!window.confirm(`Are you sure you want to delete ${actualFilename}?`)) return;

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
    const downloadInProgress = downloading || (downloadInfo?.[1] || 100) < 100;
    const downloadComplete = (downloadInfo?.[1] || 0) === 100;
    const onFolderAdded = () => {
        onAddFolder(file.name, createdFolderName, () => {
            setIsCreatingFolder(false);

            setTimeout(() => {
                refreshFiles();
            }, 1000);
        })
    };

    return (
    <div className={classNames('flex flex-col pl-2 py-1', { 
        'border border-b-0 border-r-0 border-t-0 border-gray-400': isInDir,
    })}>
        <div className='flex flex-row justify-between place-items-center'>
            {isDirectory && <div className="flex place-items-start">
                <button className={classNames('text-xs px-2 py-1 rounded mr-1',
                    { 'bg-gray-700/50': expanded, 'bg-gray-500/50 hover:bg-gray-700/50': !expanded }
                )} onClick={() => setExpanded(!expanded)}>
                    {expanded ? <CgChevronDown /> : <CgChevronRight />}
                </button>
            </div>}
            <span className='break-all grow mr-1'>
                {actualFilename}
                {file.dir && <span className='text-white text-xs px-2 py-1'>
                    {`${file.dir.length} ${file.dir.length === 1 ? 'file' : 'files'}`}
                </span>}
            </span>
            <span>{actualFileSize}</span>
            {showDownload && <button 
                disabled={isOurFile || downloadInProgress || downloadComplete}
                className={classNames('font-bold py-1 px-2 rounded ml-2', {
                isOurFile, downloadInProgress, downloadComplete, 
                'bg-gray-800': isOurFile || downloadInProgress || downloadComplete, 
                'bg-blue-500 hover:bg-blue-700': !isOurFile && !downloadInProgress && !downloadComplete, })}
                onClick={onDownload}
            >
                {isOurFile
                    ? 'Saved'
                    : downloadComplete 
                        ? 'Saved'
                        : downloadInProgress
                            ? <span>{downloadInfo?.[1] || 0}%</span>
                            : 'Save to node'}
            </button>}
            {isDirectory && isOurFile && !isCreatingFolder && <button
                className='bg-gray-500/50 hover:bg-gray-700/50 font-bold py-1 px-2 rounded'
                onClick={() => setIsCreatingFolder(!isCreatingFolder)}
            >
                <CgFolderAdd />
            </button>}
            {isOurFile && <button
                className='bg-gray-500/50 hover:bg-red-700 text-white font-bold py-1 px-2 rounded mx-2'
                onClick={onDelete}
            >
                <CgClose />
            </button>}
        </div>
        {isCreatingFolder && <div className='flex flex-col bg-gray-500/50 p-1'>
            <span className='text-xs mx-auto mb-1'>Create a new folder in {actualFilename}:</span>
            <div className="flex flex-row">
                <input
                    className='bg-gray-800 appearance-none border-2 border-gray-800 rounded py-1 px-2 text-white leading-tight focus:outline-none focus:bg-gray-800 focus:border-blue-500'
                    type="text"
                    value={createdFolderName}
                    placeholder='folder name'
                    onChange={(e) => setCreatedFolderName(e.target.value)}
                />
                <button
                    className='bg-blue-500 hover:bg-blue-700 font-bold py-1 px-2 rounded ml-2 text-xs'
                    onClick={onFolderAdded}
                >
                    <CgMathPlus />
                </button>
                <button
                    className='bg-gray-800 hover:bg-red-700 text-white font-bold py-0 px-1 rounded ml-2'
                    onClick={() => setIsCreatingFolder(false)}
                >
                    <CgClose />
                </button>
            </div>
        </div>}
        {isDirectory && expanded && file.dir && file.dir.length > 0 && <div className="flex flex-col">
            {file.dir.map((dir, index) => <FileEntry isOurFile={isOurFile} key={index} file={dir} node={node} isInDir={true} />)}
        </div>}
    </div>
  );
}

export default FileEntry;