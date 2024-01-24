import { useEffect, useState } from "react";
import KinoFile from "../types/KinoFile";
import useFileTransferStore from "../store/fileTransferStore";
import classNames from "classnames";

interface Props {
    file: KinoFile
    node: string
}
function FileEntry({ file, node }: Props) {
    const { files: ourFiles, filesInProgress, api } = useFileTransferStore();
    const [actualFilename, setActualFilename] = useState<string>('')
    const [actualFileSize, setActualFileSize] = useState<string>('')
    const [isOurFile, setIsOurFile] = useState<boolean>(false)
    const [downloading, setDownloading] = useState<boolean>(false)
    const showDownload = node !== window.our.node;

    useEffect(() => {
        const filename = file.name.split('/files/').pop() || '';
        setActualFilename(filename);
    }, [file.name])

    useEffect(() => {
        const fileSize = file.size > 1000000000000
            ? `${(file.size / 1000000000000).toFixed(2)} TB`
            : file.size > 1000000000
            ? `${(file.size / 1000000000).toFixed(2)} GB`
            : file.size > 1000000
            ? `${(file.size / 1000000).toFixed(2)} MB`
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

    useEffect(() => {
        if (!ourFiles) return;
        const foundFile = ourFiles.find((f) => f.name.match(file.name));
        if (foundFile) {
            setIsOurFile(true);
        }
    }, [ourFiles])

    const downloadInfo = Object.entries(filesInProgress).find(([key, _]) => file.name.match(key));
    const downloadInProgress = downloading || (downloadInfo?.[1] || 100) < 100;
    const downloadComplete = (downloadInfo?.[1] || 0) === 100;

    return (
    <div className='flex flex-row px-2 py-1 justify-between place-items-center'>
        <span className='break-all grow mr-1'>{actualFilename}</span>
        <span>{actualFileSize}</span>
        {showDownload && <button 
            disabled={isOurFile || downloadInProgress || downloadComplete}
            className={classNames('font-bold py-2 px-4 rounded ml-2', {
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
    </div>
  );
}

export default FileEntry;