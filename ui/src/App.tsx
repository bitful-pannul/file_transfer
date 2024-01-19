import { useEffect, useState } from 'react'
import './App.css'
import FileEntry from './FileEntry';
import KinoFile from './types/KinoFile';
import UqbarEncryptorApi from '@uqbar/client-encryptor-api'
import useFileTransferStore from './store/fileTransferStore';

declare global {
  var window: Window & typeof globalThis;
  var our: { node: string, process: string };
}

let inited = false 

function App() {
  const [files, setFiles] = useState<KinoFile[]>([])
  const [filesToUpload, setFilesToUpload] = useState<File[]>([])
  const { handleWsMessage } = useFileTransferStore();

  const BASE_URL = import.meta.env.BASE_URL;
  const PROXY_TARGET = `${(import.meta.env.VITE_NODE_URL || "http://localhost:8080")}${BASE_URL}`;
  const WEBSOCKET_URL = import.meta.env.DEV
  ? `${PROXY_TARGET.replace('http', 'ws')}`
  : undefined;

  if (window.our) window.our.process = BASE_URL?.replace("/", "");

  useEffect(() => {
    if (!inited) {
      inited = true

      new UqbarEncryptorApi({
        uri: WEBSOCKET_URL,
        nodeId: window.our.node,
        processId: window.our.process,
        onMessage: handleWsMessage
      });
    }
  }, []) 

  useEffect(() => {
    refreshFiles()
  }, [])

  const onAddFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setFilesToUpload(Array.from(event.target.files))
    }
  }

  const refreshFiles = () => {
    fetch(`${BASE_URL}/files`)
      .then((response) => response.json())
      .then((data) => {
        try {
          setFiles(data.ListFiles)
        } catch {
          console.log("Failed to parse JSON files", data);
        }
      })
  }

  const onUploadFiles = () => {
    const formData = new FormData()
    filesToUpload.forEach((file) => {
      formData.append('files', file)
    })

    fetch(`${BASE_URL}/files`, {
      method: 'POST',
      body: formData,
    })
      .then(() => {
        refreshFiles()
      })
  }

  return (
    <div className='flex'>
      <div className='flex flex-col w-1/4 bg-gray-800 h-screen sidebar'>
        <h2 className='text-2xl font-bold text-white px-2 py-1'>Kino Files</h2>
        <div className='flex flex-col mt-4'>
          <h3 className='text-xl font-bold text-white px-2 py-1'>Upload</h3>
          <div className='flex flex-col px-2 py-1'>
            <label htmlFor='files' className='bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded cursor-pointer'>
              Choose Files
              <input id='files' type='file' hidden multiple onChange={onAddFiles} />
            </label>

            {filesToUpload.length > 0 && (
              <div className='flex flex-col px-2 py-1'>
                <div className='flex flex-row justify-between px-2 py-1'>
                  <span className='text-white'>{filesToUpload.length} files selected</span>
                  <span className='text-white'>{filesToUpload.reduce((acc, file) => acc + file.size, 0)}</span>
                </div>
                <button className='bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded' onClick={onUploadFiles}>
                  Upload
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className='flex flex-col w-3/4 bg-gray-900 h-screen content'>
        <h2 className='text-2xl font-bold text-white px-2 py-1'>My Files</h2>
        <div className='flex flex-col mt-4'>
          {files.length === 0
            ? <span className='text-white'>No files... yet.</span>
            : files.map((file, index) => <FileEntry key={index} file={file} />)}
        </div>
      </div>
    </div>
  )
}

export default App
