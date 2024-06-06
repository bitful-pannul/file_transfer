import { useEffect } from 'react'
import MyFiles from './components/MyFiles'
import KinodeEncryptorApi from '@kinode/client-api'
import useFileTransferStore from './store/fileTransferStore';
import SearchFiles from './components/SearchFiles';
import UploadFiles from './components/UploadFiles';
import { PermissionsModal } from './components/PermissionsModal';
import kinodeLogo from './assets/kinode.svg'

declare global {
  var window: Window & typeof globalThis;
  var our: { node: string, process: string };
}

let inited = false

function App() {
  const { files, handleWsMessage, setApi, refreshFiles, permissionsModalOpen, } = useFileTransferStore();

  const BASE_URL = import.meta.env.BASE_URL;
  const PROXY_TARGET = `${(import.meta.env.VITE_NODE_URL || "http://localhost:8080")}${BASE_URL}`;
  const WEBSOCKET_URL = import.meta.env.DEV
    ? `${PROXY_TARGET.replace('http', 'ws')}`
    : undefined;

  if (window.our) window.our.process = BASE_URL?.replace("/", "");

  useEffect(() => {
    if (!inited) {
      inited = true

      const api = new KinodeEncryptorApi({
        uri: WEBSOCKET_URL,
        nodeId: window.our.node,
        processId: window.our.process,
        onMessage: handleWsMessage
      });

      setApi(api);
    }
  }, [])

  useEffect(() => {
    refreshFiles()
  }, [])


  return (
    <div className='flex flex-col place-items-center place-content-center h-screen w-screen'>
      <div className='flex flex-col place-items-center'>
        <h1 className='display text-6xl'>Kino Files</h1>
        <img src={kinodeLogo} className='w-1/4 mt-16 mb-8' />
      </div>
      <div className='flex w-full p-4'>
        <div className='flex flex-col w-1/2 sidebar obox mr-4'>
          <div className='flex flex-col grow'>
            <MyFiles node={window.our.node} files={files} />
            <UploadFiles />
          </div>
        </div>
        <div className='flex flex-col w-1/2 content overflow-y-auto'>
          <SearchFiles />
        </div>
      </div>
      {permissionsModalOpen && <PermissionsModal />}
    </div>
  )
}

export default App
