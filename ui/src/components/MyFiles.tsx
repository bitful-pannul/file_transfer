
import FileEntry from './FileEntry';
import KinoFile from '../types/KinoFile';
import { useState } from 'react';
import useFileTransferStore from '../store/fileTransferStore';
import { CgClose, CgFolderAdd, CgMathPlus } from 'react-icons/cg';

interface Props {
  files: KinoFile[];
  node: string;
}

const MyFiles = ({ files, node }: Props) => {    
    const { onAddFolder, refreshFiles } = useFileTransferStore();
    const [createdFolderName, setCreatedFolderName] = useState<string>('')
    const [isCreatingFolder, setIsCreatingFolder] = useState<boolean>(false)
    const onFolderAdded = () => {
        onAddFolder('', createdFolderName, () => {
            setIsCreatingFolder(false);

            setTimeout(() => {
                refreshFiles();
            }, 1000);
        })
    };
    
    return (
        <div className='flex flex-col'>
            <h3 className='font-bold text-white px-2 py-1 font-mono'>
                {node}
                {!isCreatingFolder && <button
                    className='bg-gray-500/50 hover:bg-gray-700/50 font-bold py-1 px-2 rounded ml-2'
                    onClick={() => setIsCreatingFolder(!isCreatingFolder)}
                >
                    <CgFolderAdd />
                </button>}
            </h3>
            {isCreatingFolder && <div className='flex flex-col bg-gray-500/50 p-1'>
                <span className='text-xs mx-auto mb-1'>Create a new folder in /:</span>
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
            <div className='text-xs flex flex-col'>
                {files.length === 0
                    ? <span className='text-white px-2 py-1'>No files... yet.</span>
                    : files.map((file, index) => <FileEntry node={node} key={index} file={file} isOurFile={true} isInDir={true} />)}
            </div>
        </div>
    );
};

export default MyFiles;