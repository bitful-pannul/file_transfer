import { useEffect, useState } from "react";
import KinoFile from "./types/KinoFile";

function FileEntry(props: { file: KinoFile }) {
    const { file } = props;  
    const [actualFilename, setActualFilename] = useState<string>('')
    const [actualFileSize, setActualFileSize] = useState<string>('')

    useEffect(() => {
        const filename = file.name.split('/files/').pop() || '';
        setActualFilename(filename);
    }, [file.name])

    useEffect(() => {
        const fileSize = file.size > 1000000000
            ? `${Math.round(file.size / 1000000000)} GB`
            : file.size > 1000000
            ? `${Math.round(file.size / 1000000)} MB`
            : `${Math.round(file.size / 1000)} KB`;
        setActualFileSize(fileSize);
    }, [file.size])

    const onDownload = () => {
        if (!file.name) return alert('No file name');
        
        fetch(`/files/${actualFilename}`)
            .then((response) => response.blob())
            .then((blob) => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = actualFilename;
                a.click();
            });
    }
    return (
    <div className='flex flex-row px-2 py-1 justify-between'>
        
        <span className='text-white'>{actualFilename} {actualFileSize}</span>
        <button
            className='bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded'
            onClick={onDownload}
        >
            Download
        </button>
    </div>
  );
}

export default FileEntry;