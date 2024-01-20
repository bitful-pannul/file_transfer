import { useEffect, useState } from "react";
import KinoFile from "../types/KinoFile";
import useFileTransferStore from "../store/fileTransferStore";

interface Props {
    file: KinoFile
    showDownload?: boolean
    node: string
}
function FileEntry({ file, showDownload, node }: Props) {
    const { files: ourFiles, filesInProgress, api } = useFileTransferStore();
    const [actualFilename, setActualFilename] = useState<string>('')
    const [actualFileSize, setActualFileSize] = useState<string>('')
    const [isOurFile, setIsOurFile] = useState<boolean>(false)

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
        api.send({
            data: {
                Download: {
                    name: file.name,
                    target: {
                        node,
                        process: window.our.process,
                    }
                }
            }
        })
    }

    useEffect(() => {
        if (!ourFiles) return;
        const foundFile = ourFiles.find((f) => f.name === file.name);
        if (foundFile) {
            setIsOurFile(true);
        }
    }, [ourFiles])

    const downloadInfo = Object.entries(filesInProgress).find(([key, _]) => key.match(file.name));
    const downloadInProgress = (downloadInfo?.[1] || 100) < 100;
    const downloadButton = isOurFile 
        ? <button disabled
                className='bg-gray-800 font-bold py-2 px-4 rounded ml-2'
            >
                {downloadInProgress 
                    ? <span>{downloadInfo?.[1]}%</span>
                    : 'Saved'}
            </button>
        : <button
        className='bg-green-800 hover:bg-blue-700 font-bold py-2 px-4 rounded ml-2'
        onClick={onDownload}
    >
        Save to node
    </button>


    return (
    <div className='flex flex-row px-2 py-1 justify-between place-items-center'>
        <span className='break-all grow mr-1'>{actualFilename}</span>
        <span>{actualFileSize}</span>
        {showDownload && downloadButton}
    </div>
  );
}

export default FileEntry;