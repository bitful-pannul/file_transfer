import { useState } from 'react';
import KinoFile from '../types/KinoFile';
import FileEntry from './FileEntry';

interface Props {
    baseUrl: string;
}
const SearchFiles = function({ baseUrl }: Props) {
    const [searchTerm, setSearchTerm] = useState('');
    const [foundFiles, setFoundFiles] = useState<KinoFile[]>([]);

    const handleSearch = () => {
        if (!searchTerm) return alert('Please enter a node name.');
        if (!searchTerm.match(/^[a-zA-Z0-9-]+\.os$/)) return alert('Invalid node name.');
        try {
            fetch(`${baseUrl}/files?node=${searchTerm}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            }).then((response) => response.json())
            .then((data) => {
                try {
                    setFoundFiles(data.ListFiles)
                } catch {
                    console.log("Failed to parse JSON files", data);
                }
            });
        } catch (error) {
            console.error('Error:', error);
        }
    };

    return (
        <div className='flex flex-col px-2 py-1'>
            <h2 className='text-xl mb-2 font-bold'>Search files on the network</h2>
            <div className='flex place-items-center mb-2'>
                <span className='mr-2'>Node:</span>
                <input
                    className='bg-gray-800 appearance-none border-2 border-gray-800 rounded w-full py-2 px-4 text-white leading-tight focus:outline-none focus:bg-gray-800 focus:border-blue-500'
                    type="text"
                    value={searchTerm}
                    placeholder='somenode.os'
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                <button className='bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded' onClick={handleSearch}>Search</button>
            </div>
            {foundFiles && foundFiles.length === 0 && <span className='text-white'>No files found.</span>}
            {foundFiles && foundFiles.length > 0 && <div className='flex flex-col px-2 py-1'>
                <h2><span className='text-xl font-bold font-mono'>{searchTerm}:</span> <span className='text-xs'>{foundFiles.length} files</span></h2>
                {foundFiles.map((file) => (
                    <FileEntry node={searchTerm} key={file.name} file={file} showDownload />                
                ))}
            </div>}
        </div>
    );
};

export default SearchFiles;
