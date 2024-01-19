import React from 'react';

import FileEntry from './FileEntry';
import KinoFile from '../types/KinoFile';

interface Props {
  files: KinoFile[];
}

const MyFiles = ({ files }: Props) => {
  return (
    <div className='flex flex-col'>
        <h3 className='font-bold text-white px-2 py-1'>My Files</h3>
        <div className='text-xs flex flex-col'>
        {files.length === 0
            ? <span className='text-white'>No files... yet.</span>
            : files.map((file, index) => <FileEntry key={index} file={file} />)}
        </div>
    </div>
  );
};

export default MyFiles;